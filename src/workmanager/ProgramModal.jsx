import React, { useState, useMemo } from "react";
import { C, input, btn, modalBg, modalCard, fmtDate, addDays, YMD, WD } from "../shared/ui";
import { RULES, genDates, ruleLabel, sessionTitle, isWeekly, weekDays, SET_STEPS, stepDates, planWeeks, mondayStr, findClash, clashText } from "./recur";
import NameInput from "./NameInput";
import SetFields from "./SetFields";
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

// 복제할 때 새 이름 제안 — "… 1기" 면 "… 2기", 아니면 뒤에 " 2기"
const nextCohortName = (n) => {
  const m = String(n || "").match(/^(.*?)(\d+)기\s*$/);
  return m ? `${m[1]}${Number(m[2]) + 1}기` : `${String(n || "").trim()} 2기`;
};

// 복제 원본 → 등록 창 처음 값. 기록(참석·이해도·과제 등)은 가져오지 않고,
// 주기·요일·시간·회차 제목 순서(세트 교육이면 단계와 세트별 멘트 순서)만 가져온다.
function fromSource(source) {
  if (!source) return null;
  const { program: pg, sessions: ss } = source;
  const live = ss.filter((s) => s.status !== "skip");
  const base = { name: nextCohortName(pg.name), target: pg.target || "", time: pg.time || "10:00" };
  if (pg.kind === "set") {
    const nums = [...new Set(live.map((s) => s.set).filter(Boolean))].sort((a, b) => a - b);
    const sets = nums.map((k) => {
      const m = (live.find((s) => s.set === k && s.step === 0) || live.find((s) => s.set === k) || {}).scripts || [];
      return [m[0] || "", m[1] || ""];
    });
    return { ...base, mode: "set", skipPromo: pg.skipPromo !== false, steps: (pg.steps || SET_STEPS).map((x) => ({ ...x })), sets: sets.length ? sets : [["", ""]] };
  }
  return {
    ...base, mode: pg.rule === "once" ? "once" : "repeat", rule: pg.rule === "once" ? "w1" : pg.rule,
    days: Array.isArray(pg.days) && pg.days.length ? pg.days : null,
    count: Math.max(1, live.length), seq: live.map((s) => s.title || ""), noScripts: !!pg.noScripts,
  };
}

// 교육 과정 등록 — 주기를 정하면 회차 날짜가 자동으로 만들어지고,
// 빼고 싶은 날짜는 체크를 해제해서 제외한다.
// source 가 있으면 그 과정을 복제해서 새 기수로 등록한다.
export default function ProgramModal({ people, onAddPerson, onCreate, onClose, today, usedColors = [], scripts = [], taken = [], source = null }) {
  const TD = today || YMD(new Date());
  const [init] = useState(() => fromSource(source) || {});
  const [name, setName] = useState(init.name || "");
  const [target, setTarget] = useState(init.target || "");
  // 기본 색은 다른 과정이 아직 안 쓴 색 중 첫 번째
  const [color, setColor] = useState(() => EDU_COLORS.find((c) => !usedColors.includes(c)) || EDU_COLORS[0]);
  const [members, setMembers] = useState([]);
  const [start, setStart] = useState(addDays(TD, 7));
  const [time, setTime] = useState(init.time || "10:00");
  // 교육 종류 — repeat 반복 / once 1회 (오리엔테이션 등) / set 세트 교육 (멘트 2개씩, 단계별 요일)
  const [mode, setMode] = useState(init.mode || "repeat");
  const once = mode === "once";
  const isSet = mode === "set";
  const [steps, setSteps] = useState(() => init.steps || SET_STEPS.map((x) => ({ ...x })));
  const [sets, setSets] = useState(() => init.sets || Array.from({ length: 4 }, () => ["", ""]));   // 세트별 멘트 2개
  const [skipPromo, setSkipPromo] = useState(init.skipPromo !== false);   // 월말 프로모션 주 건너뛰기
  const [rest, setRest] = useState({});                                     // 직접 고른 쉬는 주 { 월요일: true }
  const toggleRest = (mon) => setRest((r) => { const n = { ...r }; if (n[mon]) delete n[mon]; else n[mon] = true; return n; });
  const weeks = useMemo(() => (isSet ? planWeeks(start, sets.length, skipPromo, rest) : []), [isSet, start, sets.length, skipPromo, rest]);
  const setMons = weeks.filter((w) => w.kind === "set").map((w) => w.mon);   // 세트별 시작 주 월요일
  const [rule, setRule] = useState(init.rule || "w2");
  const [count, setCount] = useState(init.count || 6);
  const [days, setDays] = useState(init.days || null);  // 고른 요일 (null이면 첫 교육일의 요일)
  const [off, setOff] = useState({});      // 체크 해제한 날짜
  // 회차 제목 — 순서대로 (n번째 남은 날짜가 seq[n-1]). 날짜를 바꾸거나 빼도 제목 순서는 유지된다.
  const [seq, setSeq] = useState(() => init.seq || []);
  const [busy, setBusy] = useState(false);
  const [noScripts, setNoScripts] = useState(!!init.noScripts);   // 멘트 교육이 아닌 과정 (PROS 등)
  const setSeqAt = (i, v) => setSeq((q) => { const n = [...q]; while (n.length <= i) n.push(""); n[i] = v; return n; });
  // 회차 순서 바꾸기 — 날짜는 그대로, 제목만 위아래로
  const moveSeq = (i, dir) => setSeq((q) => {
    const n = [...q]; const t = i + dir;
    while (n.length <= Math.max(i, t)) n.push("");
    [n[i], n[t]] = [n[t], n[i]];
    return n;
  });

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
  // 다른 과정과 겹치는 회차 수 (아래 버튼 줄에 표시)
  const clashCount = isSet
    ? setMons.reduce((n, mon) => n + stepDates(mon, steps).filter((d, i) => findClash(taken, d, steps[i].time).length).length, 0)
    : picked.filter((d) => findClash(taken, d, time).length).length;

  const submit = async () => {
    if (!name.trim()) { alert("교육명을 입력해주세요."); return; }
    if (!start) { alert(isSet ? "첫 세트 시작 주를 선택해주세요." : "첫 교육일을 선택해주세요."); return; }
    if (isSet) {
      if (steps.some((st) => !st.n.trim())) { alert("단계 이름을 비워둘 수 없어요."); return; }
      const cleanSteps = steps.map((st) => ({ ...st, n: st.n.trim() }));
      const items = [];
      sets.forEach((m, k) => {
        const ds = stepDates(setMons[k], cleanSteps);
        cleanSteps.forEach((st, i) => items.push({ date: ds[i], time: st.time, set: k + 1, step: i, scripts: m.filter(Boolean) }));
      });
      setBusy(true);
      await onCreate({ kind: "set", name: name.trim(), target: target.trim(), members, color, steps: cleanSteps,
        start: mondayStr(start), time: cleanSteps[0].time, skipPromo, items });
      setBusy(false);
      onClose();
      return;
    }
    if (picked.length === 0) { alert("교육일을 최소 1개는 남겨주세요."); return; }
    setBusy(true);
    await onCreate({ name: name.trim(), target: target.trim(), members, color, noScripts, rule: useRule, ...(useDays ? { days: useDays } : {}), start, time, dates: picked,
      titles: picked.map((d, i) => (seq[i] || "").trim()) });
    setBusy(false);
    onClose();
  };

  const label = { display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 };

  return (
    <div style={modalBg(1300)} onClick={onClose}>
      <div style={modalCard(560)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 20px 0", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 4 }}>
            {source ? `교육 과정 복제 — "${source.program.name}" 에서` : "교육 과정 등록"}</div>
          {source && <div style={{ fontSize: 11.5, color: C.main, background: C.mainBg, borderRadius: 8, padding: "7px 10px", marginBottom: 8, lineHeight: 1.55 }}>
            주기·요일·시간·회차 제목{source.program.kind === "set" ? "·단계·세트별 멘트" : ""}를 가져왔어요. 첫 교육일과 대상자를 새로 정하고, 순서는 ↑↓ 로 바꾸세요.
            원본 과정과 기록은 그대로 남아요.</div>}
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 14 }}>
            주기를 정하면 회차가 자동으로 만들어집니다. 빼고 싶은 날짜는 체크를 해제하세요. 회차 제목은 비워두면 "교육명 - n회차"로 표시됩니다.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px" }}>
          {/* 반복 교육 / 1회 교육 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[["repeat", "반복 교육", "정해진 주기로 여러 번"], ["once", "1회 교육", "오리엔테이션처럼 한 번만"],
              ["set", "세트 교육", "멘트 2개씩, 단계별 요일 (영업력 강화)"]].map(([v, t, d]) => (
              <button key={t} type="button" onClick={() => { setMode(v); setOff({}); }}
                style={{ flex: 1, padding: "9px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  border: `1.5px solid ${mode === v ? C.main : C.line}`, background: mode === v ? C.mainBg : C.white }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: mode === v ? C.main : C.text }}>{t}</div>
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

          {!isSet && (
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.text, cursor: "pointer", marginBottom: 12 }}>
              <input type="checkbox" checked={noScripts} onChange={(e) => setNoScripts(e.target.checked)} style={{ accentColor: C.main, cursor: "pointer" }} />
              <span><b>스크립트 고르지 않는 교육</b> <span style={{ color: C.faint, fontSize: 11 }}>(PROS처럼 멘트 교육이 아닌 과정 — 회차 기록에서 스크립트 칸을 숨겨요)</span></span>
            </label>
          )}

          <label style={label}>대상자 명단</label>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 5, lineHeight: 1.55 }}>
            이름을 입력하면 저장된 사람이 추천됩니다. 방향키 ↑↓ 와 Enter 로 고르고, 새 이름은 다음부터 추천 목록에 저장됩니다.
          </div>
          <div style={{ marginBottom: 10 }}>
            <NameInput value={members} people={people} onChange={setMembers} onAddPerson={onAddPerson}
              placeholder="이름 입력 (예: 김팀장)" />
          </div>

          {isSet ? (
            <SetFields steps={steps} onSteps={setSteps} start={start} onStart={setStart}
              sets={sets} onSets={setSets} scripts={scripts} taken={taken}
              weeks={weeks} skipPromo={skipPromo} onSkipPromo={setSkipPromo} onRest={toggleRest} />
          ) : <>
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
                const clash = off[d] ? [] : findClash(taken, d, time);
                return (
                  <div key={d + i}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, cursor: "pointer", flexShrink: 0, width: 150,
                      color: off[d] ? "#b5bdc9" : C.text, textDecoration: off[d] ? "line-through" : "none" }}>
                      <input type="checkbox" checked={!off[d]} onChange={() => setOff((o) => ({ ...o, [d]: !o[d] }))}
                        style={{ cursor: "pointer", accentColor: C.main }} />
                      {off[d] ? "제외" : n + "회"} · {fmtDate(d)}
                    </label>
                    {!off[d] && (
                      <input value={seq[n - 1] || ""} onChange={(e) => setSeqAt(n - 1, e.target.value)}
                        placeholder={sessionTitle(null, { name: name.trim() || "교육명", rule: useRule }, n)}
                        style={input({ padding: "5px 8px", fontSize: 12, flex: 1, minWidth: 0 })} />
                    )}
                    {!off[d] && picked.length > 1 && (
                      <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        <button type="button" onClick={() => moveSeq(n - 1, -1)} disabled={n === 1} title="제목을 앞 회차와 바꾸기"
                          style={btn("ghost", { padding: "2px 7px", fontSize: 11 })}>↑</button>
                        <button type="button" onClick={() => moveSeq(n - 1, 1)} disabled={n === picked.length} title="제목을 뒤 회차와 바꾸기"
                          style={btn("ghost", { padding: "2px 7px", fontSize: 11 })}>↓</button>
                      </span>
                    )}
                  </div>
                  {clash.length > 0 && <div style={{ fontSize: 11, color: C.red, margin: "2px 0 0 22px" }}>{clashText(clash)}</div>}
                  </div>
                );
              })}
          </div>
          </>}
        </div>

        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0, borderTop: `1px solid ${C.line}` }}>
          {clashCount > 0 && <span style={{ marginRight: "auto", alignSelf: "center", fontSize: 11.5, fontWeight: 700, color: C.red }}>
            ⚠ 다른 교육과 겹치는 회차 {clashCount}건</span>}
          <button onClick={onClose} disabled={busy} style={btn("ghost", { padding: "9px 18px", fontSize: 12.5 })}>취소</button>
          <button onClick={submit} disabled={busy} style={btn("primary", { padding: "9px 18px", fontSize: 12.5 })}>
            {busy ? "등록 중…" : isSet ? `등록 (${sets.length}세트 · ${sets.length * steps.length}회)` : `등록 (${picked.length}회차)`}</button>
        </div>
      </div>
    </div>
  );
}
