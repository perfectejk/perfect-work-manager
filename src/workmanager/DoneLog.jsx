import React, { useState, useMemo } from "react";
import { C, FONT, inputSm, addDays, parseYMD, WD } from "../shared/ui";
import { isPeriod } from "./period";

// ===== 완료 로그 =====
// 완료한 업무를 최근 순으로, 주차별로 묶어 보여준다.
// 완료 날짜는 completedAt(완료한 날) — 없으면(이번 개선 전에 완료한 업무) 일정 날짜를 대신 쓰고 "(일정일 기준)"을 붙인다.
// 데이터는 읽기만 한다. 항목을 누르면 상세 패널(onOpen)이 열리고, 상태 변경은 그쪽에서 한다.
const doneDay = (t) => t.completedAt || t.date;
// 월요일 시작 주의 월요일
const mondayOf = (s) => addDays(s, -((parseYMD(s).getDay() + 6) % 7));
// 주차 이름 — 그 주 월요일이 속한 달의 몇 번째 월요일인지로 센다 (예: 10/26~11/1 → 10월 4주차)
const weekLabel = (mon) => { const d = parseYMD(mon); return `${d.getMonth() + 1}월 ${Math.floor((d.getDate() - 1) / 7) + 1}주차`; };
const mdw = (s) => { const d = parseYMD(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const md = (s) => { const d = parseYMD(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const RANGES = [["week", "이번 주"], ["month", "이번 달"], ["all", "전체"]];

export default function DoneLog({ tasks, types, typeOf, today, selectedId, onOpen }) {
  const [range, setRange] = useState("month");
  const [typeF, setTypeF] = useState("");
  const [q, setQ] = useState("");

  const { base, list, byType } = useMemo(() => {
    const mon = mondayOf(today);
    const inRange = (t) => {
      const d = doneDay(t);
      if (!d) return range === "all";
      if (range === "week") return d >= mon && d <= addDays(mon, 6);
      if (range === "month") return d.slice(0, 7) === today.slice(0, 7);
      return true;
    };
    const kw = q.trim().toLowerCase();
    const base = tasks.filter((t) => t.status === "done" && inRange(t) && (!kw || (t.title || "").toLowerCase().includes(kw)));
    const list = base.filter((t) => !typeF || typeOf(t.type).k === typeF)
      .sort((a, b) => (doneDay(b) || "").localeCompare(doneDay(a) || ""));
    const byType = {};
    base.forEach((t) => { const k = typeOf(t.type).k; byType[k] = (byType[k] || 0) + 1; });
    return { base, list, byType };
  }, [tasks, range, typeF, q, today, typeOf]);

  // 주차별 묶음 (list 가 최근 순이라 묶음도 최근 순)
  const groups = [];
  list.forEach((t) => {
    const d = doneDay(t);
    const m = d ? mondayOf(d) : "";
    let g = groups.find((x) => x.m === m);
    if (!g) { g = { m, items: [] }; groups.push(g); }
    g.items.push(t);
  });

  const rangeName = (RANGES.find((r) => r[0] === range) || RANGES[1])[1];
  const segBtn = (on) => ({ border: "none", background: on ? C.main : C.white, color: on ? C.white : C.muted,
    padding: "6px 13px", fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: "pointer" });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {RANGES.map(([k, n]) => <button key={k} onClick={() => setRange(k)} style={segBtn(range === k)}>{n}</button>)}
        </div>
        <select value={typeF} onChange={(e) => setTypeF(e.target.value)} style={inputSm({ border: "1px solid #e5e7eb" })}>
          <option value="">유형 전체</option>
          {types.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}
        </select>
        <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.faint }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="제목으로 검색"
            style={inputSm({ border: "1px solid #e5e7eb", width: "100%", paddingLeft: 28 })} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: C.soft,
        borderRadius: 11, padding: "11px 14px", marginBottom: 16 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: C.title }}>{base.length}건</span>
        <span style={{ fontSize: 12, color: C.muted, marginRight: 8 }}>{rangeName} 완료</span>
        {types.filter((t) => byType[t.k]).map((t) => {
          const on = typeF === t.k;
          return (
            <button key={t.k} onClick={() => setTypeF(on ? "" : t.k)} title={on ? "유형 필터 해제" : t.n + "만 보기"}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, borderRadius: 99,
                padding: "3px 10px", background: C.white, border: `1px solid ${on ? t.c : C.line}`, color: C.text,
                cursor: "pointer", fontFamily: FONT }}>
              <i style={{ width: 8, height: 8, borderRadius: "50%", background: t.c, display: "inline-block" }} />
              {t.n} {byType[t.k]}
            </button>
          );
        })}
      </div>

      {list.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.faint, fontSize: 13 }}>이 기간에 완료한 업무가 없습니다.</div>
      )}

      {groups.map((g) => (
        <div key={g.m || "none"} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 8, fontSize: 12.5, fontWeight: 800, color: C.title }}>
            {g.m ? weekLabel(g.m) : "날짜 없음"}
            {g.m && <span style={{ fontSize: 11, fontWeight: 500, color: C.faint }}>{md(g.m)} ~ {md(addDays(g.m, 6))}</span>}
            <span style={{ fontSize: 10.5, background: C.soft, color: C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{g.items.length}</span>
          </div>
          {g.items.map((t) => {
            const ty = typeOf(t.type);
            const d = doneDay(t);
            const subs = t.subs || [];
            const on = selectedId === t.id;
            return (
              <div key={t.id} onClick={() => onOpen(t.id)}
                style={{ display: "grid", gridTemplateColumns: "118px minmax(0,1fr) auto auto", gap: 10, alignItems: "center",
                  padding: "9px 12px", marginBottom: 6, background: C.white, borderRadius: 9, cursor: "pointer",
                  border: `1px solid ${on ? C.main : C.line}`, borderLeft: `4px solid ${ty.c}`,
                  boxShadow: on ? `0 0 0 2px ${C.mainBg}` : "none" }}>
                <span style={{ fontSize: 11.5, fontWeight: t.completedAt ? 700 : 500, color: t.completedAt ? C.text : C.faint, whiteSpace: "nowrap" }}>
                  {d ? mdw(d) : "-"}
                  {!t.completedAt && <span style={{ display: "block", fontSize: 10, color: C.faint, fontWeight: 500 }}>(일정일 기준)</span>}
                </span>
                <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: C.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.title}
                  {isPeriod(t) && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "1px 6px", background: C.mainBg, color: C.main, marginLeft: 6 }}>기간</span>}
                </span>
                <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap", background: ty.c + "1a", color: ty.c }}>{ty.n}</span>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", minWidth: 58, textAlign: "right" }}>
                  {subs.length ? `하위 ${subs.filter((x) => x.d).length}/${subs.length}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
