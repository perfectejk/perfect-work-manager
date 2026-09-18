import React from "react";
import { C, input, btn, badge, fmtDate } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section } from "../shared/SidePanel";
import { SESSION_STATUS } from "./store";
import { ruleLabel } from "./recur";
import NameInput from "./NameInput";

// 교육 과정 상세 — 이름 / 대상 / 대상자 명단 편집 / 회차 목록
export default function ProgramPanel({ program, sessions, people, roundOf, onPatch, onAddPerson, onOpenSession, onDelete }) {
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
      <SpSub>교육 과정 · {ruleLabel(program.rule, program.start)} {program.time}</SpSub>

      <Props>
        <PropLabel>대상</PropLabel>
        <input value={program.target || ""} onChange={(e) => p({ target: e.target.value })}
          placeholder="예: 신입 사원" style={sel} />
      </Props>

      <Section title="대상자 명단" count={`${(program.members || []).length}명`}>
        <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, lineHeight: 1.55 }}>
          이름을 입력하면 저장된 사람이 추천됩니다. 새 이름은 다음부터 추천 목록에 저장됩니다.
          추가·삭제는 <b>앞으로의 회차</b>에만 반영되고, 이미 끝난 회차의 기록은 그대로 남습니다.
        </div>
        <NameInput value={program.members || []} people={people}
          onChange={(v) => p({ members: v })} onAddPerson={onAddPerson} placeholder="이름 입력 (예: 김)" />
      </Section>

      <Section title="회차" count={`${done}/${active.length}회 완료`}>
        {sessions.length === 0
          ? <p style={{ fontSize: 12, color: C.faint, margin: 0 }}>회차가 없습니다.</p>
          : sessions.map((s) => (
            <div key={s.id} onClick={() => onOpenSession(s.id)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                fontSize: 12.5, padding: "7px 8px", borderRadius: 6, cursor: "pointer", background: C.soft, marginBottom: 4 }}>
              <span style={{ color: C.text }}>
                {s.status === "skip" ? "취소" : `${roundOf(s)}회차`} · {fmtDate(s.date)}{s.time ? " " + s.time : ""}
              </span>
              {stBadge(s)}
            </div>
          ))}
      </Section>

      <button onClick={() => onDelete(program)} style={btn("danger")}>교육 과정 삭제</button>
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.55 }}>
        과정을 삭제하면 그 과정의 회차 기록도 함께 사라집니다.
      </div>
    </>
  );
}
