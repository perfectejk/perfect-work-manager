import React, { useState, useMemo } from "react";
import { C, input, btn, modalBg, modalCard, fmtDate, WD } from "../shared/ui";
import { RULES, genDates, ruleLabel, isWeekly, weekDays } from "./recur";

// 작업 반복 등록 — 지금 일정을 첫 번째로 두고, 주기에 맞춰 나머지 날짜에 같은 일정을 만든다.
// 교육 과정과 같은 주기 규칙(recur.js)을 쓴다. 날짜는 처음 한 번만 계산해 각각 저장하므로
// 나중에 한 건의 날짜를 바꿔도 다른 건은 그대로다.
const PRESETS = [["평일", [1, 2, 3, 4, 5]], ["월·수·금", [1, 3, 5]], ["화·목", [2, 4]]];

export default function RepeatModal({ task, onCreate, onClose }) {
  const start = task.date;
  const [rule, setRule] = useState("w1");
  const [count, setCount] = useState(8);
  const [days, setDays] = useState(null);   // 고른 요일 (null이면 지금 일정의 요일)
  const [off, setOff] = useState({});       // 체크 해제한 날짜
  const [busy, setBusy] = useState(false);

  const useDays = isWeekly(rule) ? weekDays(days, start) : null;
  // 지금 일정의 요일을 빼면 첫 날짜가 지금 일정과 달라지므로, 요일 기준 날짜를 하나 더 만들고 지금 일정 날짜는 따로 둔다
  const dates = useMemo(() => {
    const n = Math.max(1, Math.min(104, parseInt(count) || 1));
    const list = genDates(start, rule, n + 1, useDays).filter((d) => d !== start);
    return [start, ...list.slice(0, n - 1)];
  }, [start, rule, count, useDays && useDays.join()]);
  const extra = dates.slice(1).filter((d) => !off[d]);   // 새로 만들 날짜

  const toggleDay = (x) => {
    const cur = weekDays(days, start);
    const next = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x];
    if (!next.length) return;
    setDays(next); setOff({});
  };
  const sameDays = (a) => useDays && a.length === useDays.length && a.every((x) => useDays.includes(x));

  const submit = async () => {
    if (extra.length === 0) { alert("추가로 만들 날짜를 최소 1개는 남겨주세요."); return; }
    setBusy(true);
    await onCreate(task, { rule, ...(useDays ? { days: useDays } : {}), start }, extra);
    setBusy(false);
    onClose();
  };

  const label = { display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 };

  return (
    <div style={modalBg(1300)} onClick={onClose}>
      <div style={modalCard(520)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 20px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 4 }}>반복 일정 만들기</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14, lineHeight: 1.55 }}>
            "{task.title}" ({fmtDate(start)}{task.time ? " " + task.time : ""})을 첫 번째로 두고, 같은 내용의 일정을 아래 날짜에 만듭니다.
            빼고 싶은 날짜는 체크를 해제하세요.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={label}>주기</label>
              <select value={rule} onChange={(e) => { setRule(e.target.value); setOff({}); }} style={input()}>
                {RULES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>총 횟수 <span style={{ fontWeight: 600, color: C.faint }}>(지금 일정 포함)</span></label>
              <input type="number" min="2" max="104" value={count}
                onChange={(e) => { setCount(e.target.value); setOff({}); }} style={input()} />
            </div>
          </div>

          {isWeekly(rule) && <div style={{ marginBottom: 12 }}>
            <label style={label}>요일 <span style={{ fontWeight: 600, color: C.faint }}>(여러 개 고를 수 있어요)</span></label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              {[1, 2, 3, 4, 5, 6, 0].map((x) => {
                const on = useDays.includes(x);
                return (
                  <button key={x} type="button" onClick={() => toggleDay(x)}
                    style={{ width: 36, height: 32, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
                      border: `1.5px solid ${on ? C.main : C.line}`, background: on ? C.main : C.white,
                      color: on ? "#fff" : x === 0 ? "#e5484d" : x === 6 ? "#0071CE" : C.text }}>{WD[x]}</button>
                );
              })}
              {PRESETS.map(([n, a]) => (
                <button key={n} type="button" onClick={() => { setDays(a); setOff({}); }}
                  style={btn("ghost", { padding: "5px 10px", fontSize: 11, color: sameDays(a) ? C.main : C.muted })}>{n}</button>
              ))}
            </div>
          </div>}

          <label style={label}>
            만들어질 날짜 <span style={{ color: C.main }}>({ruleLabel(rule, start, useDays)})</span>
            <span style={{ float: "right", fontWeight: 600, color: C.faint }}>새로 {extra.length}건</span>
          </label>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 9, marginBottom: 14,
            maxHeight: 280, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 5 }}>
            {dates.map((d, i) => i === 0 ? (
              <span key={d} style={{ fontSize: 12.5, color: C.faint, padding: "2px 0" }}>✓ {fmtDate(d)} · 지금 일정</span>
            ) : (
              <label key={d} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer",
                color: off[d] ? "#b5bdc9" : C.text, textDecoration: off[d] ? "line-through" : "none" }}>
                <input type="checkbox" checked={!off[d]} onChange={() => setOff((o) => ({ ...o, [d]: !o[d] }))}
                  style={{ cursor: "pointer", accentColor: C.main }} />
                {fmtDate(d)}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 14, lineHeight: 1.55 }}>
            유형·업체·세부 분류·보고 대상·작업 설명·하위 작업·링크가 그대로 복사됩니다. 상태는 모두 "대기"로, 하위 작업 체크는 풀린 채로 만들어집니다.
          </div>
        </div>

        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0, borderTop: `1px solid ${C.line}` }}>
          <button onClick={onClose} disabled={busy} style={btn("ghost", { padding: "9px 18px", fontSize: 12.5 })}>취소</button>
          <button onClick={submit} disabled={busy} style={btn("primary", { padding: "9px 18px", fontSize: 12.5 })}>
            {busy ? "만드는 중…" : `${extra.length}건 만들기`}</button>
        </div>
      </div>
    </div>
  );
}
