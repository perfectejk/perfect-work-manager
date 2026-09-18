import React, { useState, useMemo } from "react";
import { C, FONT, input, inputSm, btn, badge, fmtDate } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section, CheckList, Textarea } from "../shared/SidePanel";
import { SESSION_STATUS } from "./store";
import { ruleLabel } from "./recur";
import NameInput from "./NameInput";

// 교육 회차 기록
//  필수 — 다룬 스크립트 / 참석자 / 이해도 / 액션 아이템
//  선택 — 반응·질문 / 자료 개선점 / 다음 회차 준비사항 / 장소·방식
export default function SessionPanel({
  session, program, prevSession, round, scripts, people,
  onPatch, onPatchPrev, onAddPerson, onImproveToTask,
}) {
  const [q, setQ] = useState("");
  if (!session || !program) return null;
  const s = session;
  const p = (patch) => onPatch(s.id, patch);
  const sel = input({ padding: "5px 7px", fontSize: 12, background: C.soft, border: "1px solid transparent" });

  const picked = (s.scripts || []).map((id) => scripts.find((x) => x.id === id)).filter(Boolean);
  const toggleScript = (id) => {
    const cur = s.scripts || [];
    p({ scripts: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const found = useMemo(() => {
    const k = q.trim();
    return scripts.filter((x) => !k || (x.name || "").includes(k) || (x.cat || "").includes(k));
  }, [scripts, q]);
  const cats = [...new Set(found.map((x) => x.cat || "미분류"))];

  // 명단 + 이 회차에만 추가된 참석자
  const roster = [...new Set([...(program.members || []), ...Object.keys(s.attend || {})])];
  const attendCount = Object.values(s.attend || {}).filter(Boolean).length;
  const openPrev = prevSession ? (prevSession.actions || []).filter((a) => !a.d) : [];

  return (
    <>
      <SpTitle value={`${program.name} · ${round}회차`} readOnly />
      <SpSub>대상: {program.target || "—"} · {ruleLabel(program.rule, program.start)}</SpSub>

      <Props>
        <PropLabel>날짜</PropLabel>
        <input type="date" value={s.date || ""} onChange={(e) => { if (e.target.value) p({ date: e.target.value }); }} style={sel} />
        <PropLabel>시간</PropLabel>
        <input type="time" value={s.time || ""} onChange={(e) => p({ time: e.target.value })} style={sel} />
        <PropLabel>상태</PropLabel>
        <select value={s.status} onChange={(e) => p({ status: e.target.value })} style={sel}>
          {Object.entries(SESSION_STATUS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>
        <PropLabel>장소·방식</PropLabel>
        <input value={s.place || ""} onChange={(e) => p({ place: e.target.value })}
          placeholder="예: 본사 회의실 / 온라인" style={sel} />
      </Props>

      {/* 지난 회차 미완료 과제 — 체크하면 지난 회차 쪽이 완료 처리된다 */}
      {openPrev.length > 0 && (
        <div style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
          <b style={{ fontSize: 12.5, color: "#8a5a12" }}>
            지난 회차({fmtDate(prevSession.date)}) 미완료 과제 {openPrev.length}건
          </b>
          <div style={{ marginTop: 6 }}>
            {(prevSession.actions || []).map((a, i) => a.d ? null : (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                <button onClick={() => onPatchPrev(prevSession.id, {
                  actions: prevSession.actions.map((x, j) => (j === i ? { ...x, d: true } : x)),
                })}
                  style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer",
                    border: "2px solid #d1d5db", background: C.white }} />
                <span style={{ fontSize: 12.5, color: C.text }}>{a.t}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 5 }}>체크하면 지난 회차 과제가 완료 처리됩니다.</div>
        </div>
      )}

      <Section title="다룬 스크립트" required count={`${picked.length}개`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {picked.length === 0
            ? <span style={{ fontSize: 11.5, color: C.faint }}>아래에서 선택하세요.</span>
            : picked.map((x) => (
              <span key={x.id} style={{ ...badge(C.main, C.mainBg), display: "inline-flex", alignItems: "center", gap: 4 }}>
                {x.name}<span onClick={() => toggleScript(x.id)} style={{ cursor: "pointer", opacity: 0.6 }}>✕</span>
              </span>
            ))}
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="스크립트 검색 (예: 반론)"
            style={{ width: "100%", border: "none", borderBottom: `1px solid ${C.line}`, padding: "7px 10px",
              fontFamily: FONT, fontSize: 12.5, outline: "none", borderRadius: "8px 8px 0 0", boxSizing: "border-box" }} />
          <div style={{ maxHeight: 180, overflowY: "auto", padding: "4px 8px" }}>
            {found.length === 0
              ? <div style={{ fontSize: 11.5, color: C.faint, padding: 6 }}>
                  {scripts.length === 0 ? "스크립트 목록 탭에서 먼저 스크립트를 추가하세요." : "검색 결과가 없습니다."}
                </div>
              : cats.map((cat) => (
                <div key={cat}>
                  <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 700, margin: "6px 0 2px" }}>{cat}</div>
                  {found.filter((x) => (x.cat || "미분류") === cat).map((x) => (
                    <label key={x.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "2px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={(s.scripts || []).includes(x.id)} onChange={() => toggleScript(x.id)}
                        style={{ cursor: "pointer", accentColor: C.main }} />
                      {x.name}
                    </label>
                  ))}
                </div>
              ))}
          </div>
        </div>
      </Section>

      <Section title="참석자" required count={`${attendCount}명 참석 · 명단 ${(program.members || []).length}명`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 7 }}>
          {roster.length === 0
            ? <span style={{ fontSize: 11.5, color: C.faint }}>명단이 비어 있습니다. 과정 상세에서 대상자를 넣거나, 아래에서 직접 추가하세요.</span>
            : roster.map((m) => {
              const on = !!(s.attend || {})[m];
              return (
                <label key={m} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                  border: `1px solid ${on ? "#bfe5d2" : C.line}`, borderRadius: 99, padding: "4px 10px", fontSize: 12.5,
                  background: on ? C.greenBg : C.white, color: on ? C.greenDeep : C.text, fontWeight: on ? 600 : 400 }}>
                  <input type="checkbox" checked={on} style={{ display: "none" }}
                    onChange={(e) => p({ attend: { ...(s.attend || {}), [m]: e.target.checked } })} />
                  {m}
                </label>
              );
            })}
        </div>
        <NameInput value={[]} people={people} chips={false} onAddPerson={onAddPerson}
          onChange={(v) => { const n = v[v.length - 1]; if (n) p({ attend: { ...(s.attend || {}), [n]: true } }); }}
          placeholder="+ 명단에 없는 참석자 추가 (이름 입력)" />
      </Section>

      <Section title="이해도" required count="1 낮음 ~ 5 높음">
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => p({ score: s.score === n ? 0 : n })}
              style={{ width: 38, height: 34, borderRadius: 8, cursor: "pointer", fontFamily: FONT, fontWeight: 700,
                border: `1px solid ${s.score === n ? "#f2c94c" : C.line}`,
                background: s.score === n ? "#fff4d6" : C.white, color: s.score === n ? "#9a6b00" : C.muted }}>{n}</button>
          ))}
        </div>
      </Section>

      <Section title="액션 아이템 (과제)" required
        count={`${(s.actions || []).filter((a) => a.d).length}/${(s.actions || []).length}`}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>
          누가 · 무엇을 · 언제까지 형식으로 적으면 다음 회차에 점검하기 좋습니다.
        </div>
        <CheckList items={s.actions || []} onChange={(v) => p({ actions: v })}
          placeholder="과제 추가 (예: 김팀장: 반론 멘트 실전 3회)" />
      </Section>

      <Section title="반응·질문" optional>
        <Textarea value={s.reaction || ""} onChange={(e) => p({ reaction: e.target.value })}
          placeholder="반응, 나온 질문, 막힌 부분" />
      </Section>

      <Section title="자료 개선점" optional>
        <Textarea value={s.improve || ""} onChange={(e) => p({ improve: e.target.value })}
          placeholder="교육하면서 발견한 스크립트·PPT 수정 사항" />
        <button onClick={() => onImproveToTask(s)} style={btn("ghost", { marginTop: 6, padding: "6px 12px", fontSize: 11.5 })}>
          → 자료 제작 보드에 개선 작업으로 추가
        </button>
      </Section>

      <Section title="다음 회차 준비사항" optional>
        <Textarea value={s.next || ""} onChange={(e) => p({ next: e.target.value })}
          placeholder="다음 교육 전에 준비할 것" />
      </Section>
    </>
  );
}
