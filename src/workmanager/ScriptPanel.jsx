import React from "react";
import { C, input, btn, fmtDate } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section, Textarea } from "../shared/SidePanel";

// 스크립트 상세 — 이름 / 분류 / 메모 / 교육 이력
// 교육 이력이 있으면 삭제할 수 없다.
export default function ScriptPanel({ script, cats, stats, onPatch, onDelete, onOpenSession }) {
  if (!script) return null;
  const p = (patch) => onPatch(script.id, patch);
  const sel = input({ padding: "5px 7px", fontSize: 12, background: C.soft, border: "1px solid transparent" });
  const { sessions, people } = stats;

  return (
    <>
      <SpTitle value={script.name} onChange={(v) => p({ name: v })} />
      <SpSub>스크립트</SpSub>

      <Props>
        <PropLabel>분류</PropLabel>
        <input list="wm-cat-list" value={script.cat || ""}
          onChange={(e) => p({ cat: e.target.value })}
          onBlur={(e) => { if (!e.target.value.trim()) p({ cat: "미분류" }); }} style={sel} />
        <datalist id="wm-cat-list">{cats.map((c) => <option key={c} value={c} />)}</datalist>

        <PropLabel>교육 횟수</PropLabel>
        <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{sessions.length}회</span>

        <PropLabel>이수 인원</PropLabel>
        <span style={{ fontSize: 12, color: C.text }}>{people.length ? people.join(", ") : "—"}</span>
      </Props>

      <Section title="메모">
        <Textarea value={script.memo || ""} onChange={(e) => p({ memo: e.target.value })}
          placeholder="스크립트 핵심 포인트, 파일 위치 등" />
      </Section>

      <Section title="교육 이력" count={sessions.length ? `${sessions.length}회` : null}>
        {sessions.length === 0
          ? <p style={{ fontSize: 12, color: C.faint, margin: 0 }}>아직 교육한 기록이 없습니다.</p>
          : sessions.map((s) => (
            <div key={s.id} onClick={() => onOpenSession && onOpenSession(s.id)}
              style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5,
                padding: "7px 8px", borderRadius: 6, cursor: onOpenSession ? "pointer" : "default",
                background: C.soft, marginBottom: 4 }}>
              <span style={{ color: C.text }}>{s.progName} {s.round}회차</span>
              <span style={{ color: C.faint, whiteSpace: "nowrap" }}>{fmtDate(s.date)} · 참석 {s.attended}명</span>
            </div>
          ))}
      </Section>

      {sessions.length === 0
        ? <button onClick={() => onDelete(script)} style={btn("danger")}>스크립트 삭제</button>
        : <div style={{ fontSize: 11, color: C.faint, background: C.soft, borderRadius: 8, padding: "9px 11px", lineHeight: 1.6 }}>
            교육 이력이 있어 삭제할 수 없습니다. 기록을 보존하기 위한 규칙입니다.
          </div>}
    </>
  );
}
