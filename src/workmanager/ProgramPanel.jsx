import React, { useState } from "react";
import { C, input, btn, badge, fmtDate, addDays, WD } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section } from "../shared/SidePanel";
import { SESSION_STATUS } from "./store";
import { sessionTitle, isSetProg, progRuleLabel, isPromoWeek } from "./recur";
import NameInput from "./NameInput";
import { ColorSwatches } from "./ProgramModal";
import { ScriptSelect } from "./SetFields";
import { progColor } from "./store";

// 세트 교육의 세트 목록 — 세트별 멘트 2개 고르기, ↑↓ 로 세트 순서(멘트) 바꾸기
function SetList({ program, sessions, scripts, onSetMents, onSwapSets, onAddSet, onDelaySet, onAddRetake, onPatch }) {
  const nums = [...new Set(sessions.map((s) => s.set).filter(Boolean))].sort((a, b) => a - b);
  // 재교육 추가 입력칸 — 어느 세트에 열려 있는지와 입력값
  const [rt, setRt] = useState(null);   // { k, step, date, time }
  const [showSteps, setShowSteps] = useState(false);
  const steps = program.steps || [];
  const openRetake = (k, list) => {
    const step = steps.length - 1;   // 기본은 마지막 단계 (ARS 녹취 판정)
    const last = list.filter((s) => s.step === step).map((s) => s.date).sort().pop() || list[list.length - 1].date;
    setRt({ k, step, date: addDays(last, 1), time: (steps[step] || {}).time || "" });
  };
  const setStep = (i, patch) => onPatch({ steps: steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) });
  // k세트부터 뒤 세트까지 끝난 회차가 하나도 없으면 미룰 수 있다
  const canDelay = (k) => !sessions.some((s) => s.set >= k && s.status === "done");
  const skip = program.skipPromo !== false;
  const sm = input({ padding: "5px 7px", fontSize: 12 });
  return (
    <Section title="세트" count={`${nums.length}세트`}>
      <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, lineHeight: 1.55 }}>
        멘트를 바꾸면 그 세트의 <b>아직 안 끝난 회차</b>에 모두 반영돼요. ↑↓ 는 날짜는 두고 멘트만 맞바꿉니다 (끝난 회차가 있는 세트는 제외).
      </div>
      {nums.map((k, idx) => {
        const list = sessions.filter((s) => s.set === k);
        const doneN = list.filter((s) => s.status === "done").length;
        const allDone = doneN === list.length;
        const base = list.find((s) => s.status !== "done") || list[0];
        const m = base.scripts || [];
        const change = (slot, id) => onSetMents(program.id, k, slot === 0 ? [id, m[1]] : [m[0], id]);
        return (
          <div key={k} style={{ background: C.soft, borderRadius: 8, padding: "7px 8px", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <b style={{ fontSize: 12.5, color: C.title }}>{k}세트</b>
              <span style={{ fontSize: 11, color: C.faint }}>{fmtDate(list[0].date)} 주 · 완료 {doneN}/{list.length}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                <button type="button" onClick={() => onSwapSets(program.id, k, nums[idx - 1])} disabled={idx === 0} title="앞 세트와 바꾸기"
                  style={btn("ghost", { padding: "2px 8px", fontSize: 11 })}>↑</button>
                <button type="button" onClick={() => onSwapSets(program.id, k, nums[idx + 1])} disabled={idx === nums.length - 1} title="뒤 세트와 바꾸기"
                  style={btn("ghost", { padding: "2px 8px", fontSize: 11 })}>↓</button>
              </span>
            </div>
            {(skip && list.some((s) => isPromoWeek(s.date)) || canDelay(k)) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                {skip && list.some((s) => isPromoWeek(s.date)) &&
                  <span style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>⚠ 월말 프로모션 주에 걸려 있어요</span>}
                {canDelay(k) && <button type="button" onClick={() => onDelaySet(program.id, k)}
                  title="이 세트를 한 주 뒤로 미루고, 겹치는 뒤 세트도 같이 밀어요 (월말 프로모션 주는 건너뜀)"
                  style={btn("ghost", { marginLeft: "auto", padding: "2px 8px", fontSize: 10.5 })}>이 세트부터 한 주 미루기</button>}
              </div>
            )}
            {rt && rt.k === k ? (
              <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 8, padding: 7, marginBottom: 5 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.title, marginBottom: 5 }}>{k}세트 재교육 회차 추가</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 5, marginBottom: 6 }}>
                  <select value={rt.step} onChange={(e) => { const i = Number(e.target.value); setRt({ ...rt, step: i, time: (steps[i] || {}).time || rt.time }); }} style={sm}>
                    {steps.map((st, i) => <option key={i} value={i}>{st.n}</option>)}
                  </select>
                  <input type="date" value={rt.date} onChange={(e) => setRt({ ...rt, date: e.target.value })} style={sm} />
                  <input type="time" value={rt.time} onChange={(e) => setRt({ ...rt, time: e.target.value })} style={sm} />
                </div>
                <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setRt(null)} style={btn("ghost", { padding: "3px 10px", fontSize: 11 })}>취소</button>
                  <button type="button" disabled={!rt.date}
                    onClick={() => { onAddRetake(program.id, k, rt.step, rt.date, rt.time); setRt(null); }}
                    style={btn("primary", { padding: "3px 10px", fontSize: 11 })}>추가</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => openRetake(k, list)} title="통과하지 못한 사람을 위한 재교육 회차를 이 세트에 추가해요"
                style={btn("ghost", { padding: "2px 8px", fontSize: 10.5, marginBottom: 5 })}>+ 재교육</button>
            )}
            {allDone
              ? <div style={{ fontSize: 11.5, color: C.muted }}>
                  {m.map((id) => (scripts.find((x) => x.id === id) || {}).name).filter(Boolean).join(" · ") || "멘트 없음"} (완료)
                </div>
              : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <ScriptSelect scripts={scripts} value={m[0]} onChange={(id) => change(0, id)} style={sm} />
                  <ScriptSelect scripts={scripts} value={m[1]} onChange={(id) => change(1, id)} style={sm} />
                </div>}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2 }}>
        <button onClick={() => onAddSet(program.id)} style={btn("ghost", { padding: "5px 12px", fontSize: 11.5 })}>+ 세트 추가</button>
        <button type="button" onClick={() => setShowSteps(!showSteps)}
          style={{ marginLeft: "auto", border: "none", background: "none", color: C.main, cursor: "pointer", fontSize: 11.5, fontFamily: "inherit" }}>
          새 세트 요일·시간 {showSteps ? "▲" : "▼"}</button>
      </div>
      {showSteps && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginTop: 6 }}>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, lineHeight: 1.55 }}>
            [+ 세트 추가] 로 만들 세트의 요일·시간이에요. 이미 만들어진 회차는 바뀌지 않아요 — 회차 하나의 날짜·시간은 그 회차를 눌러 바꾸세요.
          </div>
          {steps.map((st, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 68px 84px", gap: 5, marginBottom: 4, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: C.text }}>{st.n}</span>
              <select value={st.wd} onChange={(e) => setStep(i, { wd: Number(e.target.value) })} style={sm}>
                {[1, 2, 3, 4, 5, 6, 0].map((x) => <option key={x} value={x}>{WD[x]}요일</option>)}
              </select>
              <input type="time" value={st.time} onChange={(e) => setStep(i, { time: e.target.value })} style={sm} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// 교육 과정 상세 — 이름 / 대상 / 대상자 명단 편집 / 회차 목록
export default function ProgramPanel({ program, sessions, people, roundOf, onPatch, onAddPerson, onOpenSession, onDelete, onDeleteSession,
  scripts = [], onSetMents, onSwapSets, onAddSet, onDelaySet, onAddRetake, onCopy }) {
  if (!program) return null;
  const p = (patch) => onPatch(program.id, patch);
  const sel = input({ padding: "5px 7px", fontSize: 12, background: C.soft, border: "1px solid transparent" });
  const active = sessions.filter((s) => s.status !== "skip");
  const done = active.filter((s) => s.status === "done").length;

  const stBadge = (s) => {
    const m = { plan: [C.muted, C.soft], done: [C.greenDeep, C.greenBg], skip: [C.red, C.redBg] }[s.status] || [C.muted, C.soft];
    return <span style={badge(m[0], m[1], { fontSize: 10.5 })}>{SESSION_STATUS[s.status]}</span>;
  };

  return (
    <>
      <SpTitle value={program.name} onChange={(v) => p({ name: v })} />
      <SpSub>교육 과정 · {progRuleLabel(program)}{isSetProg(program) ? "" : " " + program.time}</SpSub>

      <Props>
        <PropLabel>대상</PropLabel>
        <input value={program.target || ""} onChange={(e) => p({ target: e.target.value })}
          placeholder="예: 신입 사원" style={sel} />
        <PropLabel>캘린더 색</PropLabel>
        <ColorSwatches value={progColor(program)} onChange={(c) => p({ color: c })} />
        {!isSetProg(program) && <>
          <PropLabel>스크립트</PropLabel>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, cursor: "pointer" }}>
            <input type="checkbox" checked={!program.noScripts} onChange={(e) => p({ noScripts: !e.target.checked })}
              style={{ accentColor: C.main, cursor: "pointer" }} />
            회차 기록에서 스크립트 고르기 {program.noScripts && <span style={{ color: C.faint }}>(꺼짐 — 멘트 교육이 아닌 과정)</span>}
          </label>
        </>}
      </Props>

      <Section title="대상자 명단" count={`${(program.members || []).length}명`}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, lineHeight: 1.55 }}>
          이름을 입력하면 저장된 사람이 추천됩니다. 새 이름은 다음부터 추천 목록에 저장됩니다.
          추가·삭제는 <b>앞으로의 회차</b>에만 반영되고, 이미 끝난 회차의 기록은 그대로 남습니다.
        </div>
        <NameInput value={program.members || []} people={people}
          onChange={(v) => p({ members: v })} onAddPerson={onAddPerson} placeholder="이름 입력 (예: 김)" />
      </Section>

      {isSetProg(program) && <SetList program={program} sessions={sessions} scripts={scripts}
        onSetMents={onSetMents} onSwapSets={onSwapSets} onAddSet={onAddSet} onDelaySet={onDelaySet}
        onAddRetake={onAddRetake} onPatch={p} />}

      <Section title="회차" count={`${done}/${active.length}회 완료`}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 6 }}>회차를 누르면 수정, ✕ 를 누르면 삭제합니다.</div>
        {sessions.length === 0
          ? <p style={{ fontSize: 12, color: C.faint, margin: 0 }}>회차가 없습니다.</p>
          : sessions.map((s) => (
            <div key={s.id} onClick={() => onOpenSession(s.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                fontSize: 12.5, padding: "7px 8px", borderRadius: 6, cursor: "pointer", background: C.soft, marginBottom: 4 }}>
              <span style={{ color: C.text }}>
                {s.status === "skip" ? "취소" : sessionTitle(s, program, roundOf(s))} · {fmtDate(s.date)}{s.time ? " " + s.time : ""}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {stBadge(s)}
                <button onClick={(e) => { e.stopPropagation(); onDeleteSession(s); }} title="이 회차 삭제"
                  style={{ border: "none", background: "none", color: "#c5cdd8", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
              </span>
            </div>
          ))}
      </Section>

      {onCopy && <>
        <button onClick={() => onCopy(program)} style={btn("ghost", { width: "100%", marginBottom: 6 })}>이 과정 복제해서 새 기수 만들기</button>
        <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 14, lineHeight: 1.55 }}>
          주기·회차 제목(세트 교육이면 멘트 순서까지)을 그대로 가져와 새 과정을 만들어요. 순서는 등록 창에서 바꿀 수 있어요.
        </div>
      </>}

      <button onClick={() => onDelete(program)} style={btn("danger")}>교육 과정 삭제</button>
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.55 }}>
        과정을 삭제하면 그 과정의 회차 기록도 함께 사라집니다.
      </div>
    </>
  );
}
