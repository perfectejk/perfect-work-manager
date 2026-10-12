import React, { useState, useMemo } from "react";
import { C, input, btn, modalBg, modalCard, fmtDate, addDays, YMD, WD } from "../shared/ui";
import { RULES, genDates, ruleLabel, sessionTitle, isWeekly, weekDays } from "./recur";
import NameInput from "./NameInput";
import { EDU_COLORS } from "./store";

// 색 고르기 — 동그라미 색상 버튼 줄
export function ColorSwatches({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {EDU_COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} title={c}
          style={{ width: 24, height: 24, borderRadius: "50%", background: c, cursor: "pointer", padding: 0,
            border: value === c ? "3px solid #fff" : "3px solid transparent",
            boxShadow: value === c ? `0 0 0 2px ${c}` : "none" }} />
      ))}
    </div>
  );
}

// 교육 과정 등록 — 주기를 정하면 회차 날짜가 자동으로 만들어지고,
// 빼고 싶은 날짜는 체크를 해제해서 제외한다.
export default function ProgramModal({ people, onAddPerson, onCreate, onClose, today, usedColors = [] }) {
  const TD = today || YMD(new Date());
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  // 기본 색은 다른 과정이 아직 안 쓴 색 중 첫 번째
  const [color, setColor] = useState(() => EDU_COLORS.find((c) => !usedColors.includes(c)) || EDU_COLORS[0]);
  const [members, setMembers] = useState([]);
  const [start, setStart] = useState(addDays(TD, 7));
  const [time, setTime] = useState("10:00");
  const [once, setOnce] = useState(false);   // 1회 교육 (오리엔테이션 등)
  const [rule, setRule] = useState("w2");
  const [count, setCount] = useState(6);
  const [days, setDays] = useState(null);  // 고른 요일 (null이면 첫 교육일의 요일)
  const [off, setOff] = useState({});      // 체크 해제한 날짜
  const [titles, setTitles] = useState({}); // 날짜별 회차 제목 (비워두면 "교육명 - n회차")
  const [busy, setBusy] = useState(false);

  const useRule = once ? "once" : rule;
  const useDays = isWeekly(useRule) ? weekDays(days, start) : null;
  const dates = useMemo(
    () => genDates(start, useRule, Math.max(1, Math.min(52, parseInt(count) || 1)), useDays),
    [start, useRule, count, useDays && useDays.join()]
  );
  // 요일 켜고 끄기 — 마지막 하나는 끌 수 없다
  const toggleDay = (x) => {
    const cur = weekDays(days, start);
    const next = cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x];
    if (!next.length) return;
    setDays(next); setOff({});
  };
  const picked = dates.filter((d) => !off[d]);

  const submit = async () => {
    if (!name.trim()) { alert("교육명을 입력해주세요."); return; }
    if (!start) { alert("첫 교육일을 선택해주세요."); return; }
    if (picked.length === 0) { alert("교육일을 최소 1개는 남겨주세요."); return; }
    setBusy(true);
    await onCreate({ name: name.trim(), target: target.trim(), members, color, rule: useRule, ...(useDays ? { days: useDays } : {}), start, time, dates: picked,
      titles: picked.map((d) => (titles[d] || "").trim()) });
    setBusy(false);
    onClose();
  };

  const label = { display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 };

  return (
    <div style={modalBg(1300)} onClick={onClose}>
      <div style={modalCard(560)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 20px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 4 }}>교육 과정 등록</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
            주기를 정하면 회차가 자동으로 만들어집니다. 빼고 싶은 날짜는 체크를 해제하세요. 회차 제목은 비워두면 "교육명 - n회차"로 표시됩니다.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          {/* 반복 교육 / 1회 교육 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[[false, "반복 교육", "정해진 주기로 여러 번"], [true, "1회 교육", "오리엔테이션처럼 한 번만"]].map(([v, t, d]) => (
              <button key={t} type="button" onClick={() => { setOnce(v); setOff({}); }}
                style={{ flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  border: `1.5px solid ${once === v ? C.main : C.line}`, background: once === v ? C.mainBg : C.white }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: once === v ? C.main : C.text }}>{t}</div>
                <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{d}</div>
              </button>
            ))}
          </div>

          <label style={label}>교육명</label>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
            placeholder="예: 신입 영업 기초 교육" style={input({ marginBottom: 10 })} />

          <label style={label}>캘린더 색</label>
          <div style={{ marginBottom: 12 }}><ColorSwatches value={color} onChange={setColor} /></div>

          <label style={label}>대상</label>
          <input value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder="예: 신입 사원" style={input({ marginBottom: 10 })} />

          <label style={label}>대상자 명단</label>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 5, lineHeight: 1.55 }}>
            이름을 입력하면 저장된 사람이 추천됩니다. 방향키 ↑↓ 와 Enter 로 고르고, 새 이름은 다음부터 추천 목록에 저장됩니다.
          </div>
          <div style={{ marginBottom: 10 }}>
            <NameInput value={members} people={people} onChange={setMembers} onAddPerson={onAddPerson}
              placeholder="이름 입력 (예: 김팀장)" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={label}>{once ? "교육일" : "첫 교육일"}</label>
              <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setOff({}); }} style={input()} />
            </div>
            <div>
              <label style={label}>시간</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={input()} />
            </div>
          </div>

          {!once && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <label style={label}>주기</label>
              <select value={rule} onChange={(e) => { setRule(e.target.value); setOff({}); }} style={input()}>
                {RULES.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>총 회차</label>
              <input type="number" min="1" max="52" value={count}
                onChange={(e) => { setCount(e.target.value); setOff({}); }} style={input()} />
            </div>
          </div>}

          {!once && isWeekly(rule) && <div style={{ marginBottom: 12 }}>
            <label style={label}>요일 <span style={{ fontWeight: 600, color: C.faint }}>(여러 개 고를 수 있어요)</span></label>
            <div style={{ display: "flex", gap: 5 }}>
              {[1, 2, 3, 4, 5, 6, 0].map((x) => {
                const on = useDays.includes(x);
                return (
                  <button key={x} type="button" onClick={() => toggleDay(x)}
                    style={{ width: 36, height: 32, borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700,
                      border: `1.5px solid ${on ? C.main : C.line}`, background: on ? C.main : C.white,
                      color: on ? "#fff" : x === 0 ? "#e5484d" : x === 6 ? "#0071CE" : C.text }}>{WD[x]}</button>
                );
              })}
            </div>
          </div>}

          <label style={label}>
            {once ? "교육 제목" : "생성될 교육일"} {start && !once && <span style={{ color: C.main }}>({ruleLabel(rule, start, useDays)})</span>}
            <span style={{ float: "right", fontWeight: 600, color: C.faint }}>{picked.length}회 선택됨</span>
          </label>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 9, marginBottom: 14,
            maxHeight: 260, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr", gap: 5 }}>
            {dates.length === 0
              ? <span style={{ fontSize: 12, color: C.faint }}>첫 교육일을 선택하세요.</span>
              : dates.map((d, i) => {
                // 체크 해제한 날짜는 회차로 만들지 않으므로, 번호는 남은 날짜 기준으로 센다
                const n = picked.indexOf(d) + 1;
                return (
                  <div key={d + i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer", flexShrink: 0, width: 150,
                      color: off[d] ? "#b5bdc9" : C.text, textDecoration: off[d] ? "line-through" : "none" }}>
                      <input type="checkbox" checked={!off[d]} onChange={() => setOff((o) => ({ ...o, [d]: !o[d] }))}
                        style={{ cursor: "pointer", accentColor: C.main }} />
                      {off[d] ? "제외" : n + "회"} · {fmtDate(d)}
                    </label>
                    {!off[d] && (
                      <input value={titles[d] || ""} onChange={(e) => setTitles((t) => ({ ...t, [d]: e.target.value }))}
                        placeholder={sessionTitle(null, { name: name.trim() || "교육명", rule: useRule }, n)}
                        style={input({ padding: "5px 8px", fontSize: 12, flex: 1, minWidth: 0 })} />
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0, borderTop: `1px solid ${C.line}` }}>
          <button onClick={onClose} disabled={busy} style={btn("ghost", { padding: "9px 18px", fontSize: 12.5 })}>취소</button>
          <button onClick={submit} disabled={busy} style={btn("primary", { padding: "9px 18px", fontSize: 12.5 })}>
            {busy ? "등록 중…" : `등록 (${picked.length}회차)`}</button>
        </div>
      </div>
    </div>
  );
}
