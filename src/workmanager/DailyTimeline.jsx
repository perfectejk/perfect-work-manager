import React, { useState, useEffect, useMemo } from "react";
import { C, FONT, parseYMD, WD } from "../shared/ui";
import { isPeriod, startOf, dueOf } from "./period";
import { AUTO_COLOR } from "./autoSchedule";

// ===== 오늘 타임라인 =====
// 왼쪽: 오늘 할 일 카드 (오늘 · 진행중 · 자동 · 교육) / 오른쪽: 09:00~19:00 30분 단위 시간표
// 카드를 시간칸에 끌어다 놓거나(컴퓨터), 카드를 누른 뒤 시간칸을 눌러(휴대폰) 1시간 블록으로 놓는다.
// 저장은 날짜별 문서 tl:{YYYY-MM-DD} 에 "일정 · 시작시간 · 길이"만 한다. 원래 일정은 바꾸지 않는다.
// 예외: 업무 블록의 체크 버튼은 원래 업무를 완료/대기로 바꾼다 (onToggleTask).
//       교육·자동 블록에는 체크 버튼이 없다 — 교육 기록은 이 화면에서 절대 바꾸지 않는다.
const S = 9 * 60, E = 19 * 60, ROW = 40;   // 09:00 ~ 19:00, 30분 한 칸 = 40px (30분 블록에도 버튼 줄이 들어가게)
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s) => { const [h, m] = String(s || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const TAG = {
  today: { n: "오늘", c: C.main, bg: C.mainBg },
  prog: { n: "진행중", c: C.greenDeep, bg: "#ecfdf5" },
  auto: { n: "자동", c: AUTO_COLOR, bg: C.subBg },
  edu: { n: "교육", c: C.amber, bg: C.amberBg },
};
const tlKey = (d) => `tl:${d}`;

export default function DailyTimeline({ st, today, tasks, sessions, autos, typeOf, nameOf, eduColor, onToggleTask, onOpen }) {
  const [blocks, setBlocks] = useState([]);   // [{ref, start:"10:00", len:60}]  ref = "task:id" | "auto:id" | "edu:id"
  const [loaded, setLoaded] = useState(false);
  const [pick, setPick] = useState("");        // 휴대폰용 — 고른 카드
  const [over, setOver] = useState(null);      // 끌고 있는 칸 (분)

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      const d = await st.get(tlKey(today));
      if (!alive) return;
      setBlocks(d && Array.isArray(d.blocks) ? d.blocks : []);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [st, today]);

  // 저장할 때 원래 일정이 지워진 블록은 함께 정리한다
  const save = (list) => {
    const next = list.filter((b) => all[b.ref]);
    setBlocks(next);
    if (loaded) st.set(tlKey(today), { date: today, blocks: next });
  };

  // 화면에 쓸 일정 모음 — ref 로 찾는다. 원래 일정이 지워졌으면 목록에 없어 블록도 안 보인다.
  const all = useMemo(() => {
    const m = {};
    tasks.forEach((t) => {
      let kind = "";
      if (isPeriod(t) && startOf(t) <= today && dueOf(t) >= today) kind = "prog";
      else if (t.status === "doing") kind = "prog";
      else if (!isPeriod(t) && t.date === today) kind = "today";
      m["task:" + t.id] = { ref: "task:" + t.id, id: t.id, src: "task", kind: kind || "today", title: t.title,
        color: typeOf(t.type).c, done: t.status === "done", listed: !!kind && t.status !== "done" };
    });
    Object.values(autos).forEach((a) => {
      m["auto:" + a.id] = { ref: "auto:" + a.id, id: a.id, src: "auto", kind: "auto", title: a.title, color: AUTO_COLOR,
        done: a.status === "done", listed: a.status !== "done" && a.date <= today };
    });
    sessions.forEach((s) => {
      if (s.status === "skip") return;
      m["edu:" + s.id] = { ref: "edu:" + s.id, id: s.id, src: "edu", kind: "edu", title: nameOf(s), color: eduColor(s),
        done: s.status === "done", listed: s.date === today };
    });
    return m;
  }, [tasks, autos, sessions, today, typeOf, nameOf, eduColor]);

  const shown = blocks.filter((b) => all[b.ref] && toMin(b.start) !== null && b.len > 0);
  const placedRefs = new Set(shown.map((b) => b.ref));
  const order = { today: 0, prog: 1, auto: 2, edu: 3 };
  const left = Object.values(all).filter((x) => x.listed && !placedRefs.has(x.ref))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title, "ko"));
  const total = shown.reduce((n, b) => n + b.len, 0);

  // 놓기 — 이미 놓인 블록이면 길이를 유지한 채 옮긴다. 19:00 을 넘지 않게 자른다.
  const place = (ref, startMin) => {
    if (!ref || !all[ref]) return;
    const st0 = Math.max(S, Math.min(E - 30, startMin));
    const old = blocks.find((b) => b.ref === ref);
    const len = Math.min(old ? old.len : 60, E - st0);
    save([...blocks.filter((b) => b.ref !== ref), { ref, start: hm(st0), len }]);
    setPick("");
  };
  const resize = (ref, d) => save(blocks.map((b) => {
    if (b.ref !== ref) return b;
    const s0 = toMin(b.start);
    return { ...b, len: Math.max(30, Math.min(b.len + d, E - s0)) };
  }));
  const remove = (ref) => save(blocks.filter((b) => b.ref !== ref));

  // 끌어 놓기 — 시간표 어디에 놓든 마우스 높이로 칸을 계산한다 (블록 위에 놓아도 됨)
  const minAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return S + Math.max(0, Math.floor((e.clientY - r.top) / ROW)) * 30;
  };

  // 겹치는 블록끼리만 나란히 나눠 보여준다 (겹치지 않는 블록은 폭을 다 쓴다)
  const lane = {};    // 블록별 몇 번째 줄인지
  const width = {};   // 블록별 같은 묶음의 줄 수
  let group = [], lanes = [], groupEnd = -1;
  const closeGroup = () => { group.forEach((r) => { width[r] = Math.max(1, lanes.length); }); group = []; lanes = []; };
  [...shown].sort((a, b) => toMin(a.start) - toMin(b.start)).forEach((b) => {
    const s0 = toMin(b.start);
    if (s0 >= groupEnd) { closeGroup(); groupEnd = -1; }
    let l = lanes.findIndex((end) => end <= s0);
    if (l < 0) { l = lanes.length; lanes.push(0); }
    lanes[l] = s0 + b.len;
    lane[b.ref] = l;
    group.push(b.ref);
    groupEnd = Math.max(groupEnd, s0 + b.len);
  });
  closeGroup();

  const tagEl = (kind) => (
    <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap",
      color: TAG[kind].c, background: TAG[kind].bg }}>{TAG[kind].n}</span>
  );
  const small = { border: "1px solid #e5e7eb", background: C.white, borderRadius: 6, fontFamily: FONT, fontSize: 10.5,
    fontWeight: 700, color: C.muted, padding: "1px 6px", cursor: "pointer", whiteSpace: "nowrap" };
  // 블록의 "시작 ~ 종료 까지" + -30분/+30분 버튼. 폭이 좁으면 시간 글자가 먼저 줄어들고(…) 버튼은 남는다.
  // short: 30분 블록용 짧은 모양 (제목과 한 줄에 들어가게)
  const timeAndButtons = (b, s0, short) => {
    // 30분 블록은 자리가 좁아 "−" "+" 로 줄여 보여준다 (누르면 똑같이 30분씩 바뀜)
    const btnS = short ? { ...small, padding: 0, width: 18, height: 18, fontSize: 12, lineHeight: "16px", textAlign: "center" } : small;
    return (
      <>
        <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          minWidth: 0, flex: short ? "0 20 auto" : 1 }}>
          {b.start} ~ {hm(s0 + b.len)}{short ? "" : " 까지"}
        </span>
        <button onClick={() => resize(b.ref, -30)} disabled={b.len <= 30} title="30분 줄이기"
          style={{ ...btnS, flexShrink: 0, opacity: b.len <= 30 ? 0.4 : 1 }}>{short ? "−" : "-30분"}</button>
        <button onClick={() => resize(b.ref, 30)} disabled={s0 + b.len >= E} title="30분 늘리기"
          style={{ ...btnS, flexShrink: 0, opacity: s0 + b.len >= E ? 0.4 : 1 }}>{short ? "+" : "+30분"}</button>
      </>
    );
  };
  const d0 = parseYMD(today);
  const slots = [];
  for (let m = S; m < E; m += 30) slots.push(m);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.title }}>{d0.getMonth() + 1}월 {d0.getDate()}일 ({WD[d0.getDay()]})</span>
        <span style={{ fontSize: 12, color: C.muted }}>배치 <b style={{ color: C.title, fontSize: 14 }}>{shown.length}</b>건</span>
        <span style={{ fontSize: 12, color: C.muted }}>총 <b style={{ color: C.title, fontSize: 14 }}>{Math.floor(total / 60)}시간{total % 60 ? ` ${total % 60}분` : ""}</b></span>
        {!loaded && <span style={{ fontSize: 11.5, color: C.faint }}>불러오는 중…</span>}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* 왼쪽 — 배치할 일정 */}
        <div style={{ flex: "0 1 320px", minWidth: 260 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>
            <span>배치할 일정</span><span>{left.length}건</span>
          </div>
          {left.length === 0 ? (
            <div style={{ fontSize: 12, color: C.faint, textAlign: "center", padding: "22px 0", border: `1px dashed ${C.line}`, borderRadius: 9 }}>
              {shown.length ? "모두 시간표에 놓았습니다." : "오늘 배치할 일정이 없습니다."}
            </div>
          ) : left.map((x) => {
            const on = pick === x.ref;
            return (
              <div key={x.ref} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", x.ref); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => setPick(on ? "" : x.ref)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", marginBottom: 6, background: C.white,
                  border: `1px solid ${on ? C.main : C.line}`, borderLeft: `4px solid ${x.color}`, borderRadius: 9, cursor: "grab",
                  userSelect: "none", boxShadow: on ? `0 0 0 2px ${C.mainBg}` : "none" }}>
                {tagEl(x.kind)}
                <span title={x.title} style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.title,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</span>
                <i className="ti ti-grip-vertical" style={{ color: C.faint, fontSize: 14 }} />
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
            {pick ? "놓을 시간칸을 누르세요. 카드를 다시 누르면 취소됩니다." : "끌어서 놓거나, 카드를 누른 뒤 시간칸을 누르세요."}<br />
            지난 날짜의 지연된 업무는 "오늘·이번 주" 탭에서 확인하세요.
          </div>
        </div>

        {/* 오른쪽 — 시간표 */}
        <div style={{ flex: "1 1 420px", minWidth: 280 }}>
          <div style={{ position: "relative", border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}
            onDragOver={(e) => { e.preventDefault(); const m = minAt(e); if (m !== over) setOver(m); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop={(e) => { e.preventDefault(); setOver(null); place(e.dataTransfer.getData("text/plain"), minAt(e)); }}>
            {slots.map((m, i) => (
              <div key={m} style={{ display: "flex", height: ROW, borderTop: i === 0 ? "none" : m % 60 ? "1px dashed #f3f4f6" : `1px solid ${C.line}`, boxSizing: "border-box" }}>
                <span style={{ width: 58, flexShrink: 0, fontSize: 11, color: m % 60 ? "transparent" : C.faint, padding: "3px 0 0 9px", background: C.soft }}>{hm(m)}</span>
                <span onClick={() => { if (pick) place(pick, m); }}
                  style={{ flex: 1, cursor: pick ? "pointer" : "default",
                    background: over === m ? C.mainBg : pick ? "#f8fbff" : "transparent" }} />
              </div>
            ))}

            {/* 블록 — 빈 곳은 아래 시간칸이 눌리도록 통과시킨다 */}
            <div style={{ position: "absolute", left: 62, right: 6, top: 0, pointerEvents: "none" }}>
              {shown.map((b) => {
                const x = all[b.ref];
                const s0 = toMin(b.start);
                const w = 100 / (width[b.ref] || 1);
                const canCheck = x.src === "task";
                // 30분 블록은 높이가 한 줄뿐이라, 시간·버튼을 제목 옆 한 줄에 모아 담는다
                const compact = b.len <= 30;
                return (
                  <div key={b.ref} draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", b.ref); e.dataTransfer.effectAllowed = "move"; }}
                    style={{ position: "absolute", top: ((s0 - S) / 30) * ROW + 2, height: (b.len / 30) * ROW - 4,
                      // 카드를 골라 둔 동안에는 블록이 눌리지 않게 해서, 블록이 있는 시간칸에도 놓을 수 있게 한다
                      left: `calc(${lane[b.ref] * w}% + 2px)`, width: `calc(${w}% - 4px)`, pointerEvents: pick ? "none" : "auto",
                      boxSizing: "border-box", borderRadius: 8, padding: "3px 7px", overflow: "hidden", cursor: "grab",
                      background: x.color + "0d", border: `1px solid ${x.color}55`, borderLeft: `4px solid ${x.color}`,
                      opacity: x.done ? 0.6 : 1, display: "flex", flexDirection: "column", gap: 2,
                      justifyContent: compact ? "center" : "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: compact ? 4 : 6, minWidth: 0 }}>
                      {canCheck && (
                        <button onClick={() => onToggleTask(x.id)} title={x.done ? "완료 취소" : "완료"}
                          style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer", padding: 0,
                            border: `2px solid ${x.done ? C.green : "#c5cdd8"}`, background: x.done ? C.green : C.white,
                            color: C.white, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{x.done ? "✓" : ""}</button>
                      )}
                      {!compact && tagEl(x.kind)}
                      <span onClick={() => onOpen(x.src === "edu" ? "session" : x.src, x.id)} title={x.title + " — 눌러서 상세 보기"}
                        style={{ flex: compact ? "1 1 auto" : 1, minWidth: compact ? 24 : 0, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          color: x.done ? C.faint : C.title, textDecoration: x.done ? "line-through" : "none",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title}</span>
                      {compact && timeAndButtons(b, s0, true)}
                      <button onClick={() => remove(b.ref)} title="목록으로 되돌리기"
                        style={{ border: "none", background: "none", color: C.faint, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
                    </div>
                    {!compact && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>{timeAndButtons(b, s0, false)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
