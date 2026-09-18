import React from "react";
import { C, FONT, input, btn } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section, CheckList, Textarea } from "../shared/SidePanel";
import { STATUS } from "./store";

// 작업 상세 — 유형 / 상태 / 날짜 / 시간 / 작업 설명 / 하위 작업 / 관련 링크
// 입력하는 즉시 onPatch 로 저장한다.
export default function TaskPanel({ task, types, onPatch, onDelete }) {
  const [link, setLink] = React.useState("");
  if (!task) return null;
  const p = (patch) => onPatch(task.id, patch);
  const sel = input({ padding: "5px 7px", fontSize: 12, background: C.soft, border: "1px solid transparent" });

  const addLink = () => {
    const v = link.trim();
    if (!v) return;
    p({ links: [...(task.links || []), v] });
    setLink("");
  };

  return (
    <>
      <SpTitle value={task.title} onChange={(v) => p({ title: v })} />
      <SpSub>자료 제작 작업</SpSub>

      <Props>
        <PropLabel>유형</PropLabel>
        <select value={task.type} onChange={(e) => p({ type: e.target.value })} style={sel}>
          {types.map((t) => <option key={t.k} value={t.k}>{t.n}</option>)}
        </select>

        <PropLabel>상태</PropLabel>
        <select value={task.status} onChange={(e) => p({ status: e.target.value })} style={sel}>
          {STATUS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
        </select>

        <PropLabel>날짜</PropLabel>
        <input type="date" value={task.date || ""} onChange={(e) => { if (e.target.value) p({ date: e.target.value }); }} style={sel} />

        <PropLabel>시간</PropLabel>
        <input type="time" value={task.time || ""} onChange={(e) => p({ time: e.target.value })} style={sel} />
      </Props>

      <Section title="작업 설명">
        <Textarea value={task.desc || ""} onChange={(e) => p({ desc: e.target.value })}
          placeholder="작업 개요, 참고 사항 등을 자유롭게 적으세요." />
      </Section>

      <Section title="하위 작업" count={`${(task.subs || []).filter((x) => x.d).length}/${(task.subs || []).length}`}>
        <CheckList items={task.subs || []} onChange={(v) => p({ subs: v })} placeholder="할 일 추가 (입력 후 Enter)" />
      </Section>

      <Section title="관련 링크" optional>
        {(task.links || []).map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, padding: "3px 0" }}>
            <a href={l} target="_blank" rel="noreferrer"
              style={{ color: C.main, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</a>
            <button onClick={() => p({ links: (task.links || []).filter((_, j) => j !== i) })}
              style={{ border: "none", background: "none", color: "#c5cdd8", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        ))}
        <input value={link} onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addLink(); }}
          placeholder="구글 드라이브·PPT 주소를 붙여넣고 Enter"
          style={{ width: "100%", border: `1px dashed ${C.line}`, borderRadius: 6, padding: "6px 8px",
            fontFamily: FONT, fontSize: 12.5, marginTop: 4, outline: "none", boxSizing: "border-box" }} />
      </Section>

      <button onClick={() => onDelete(task)} style={btn("danger", { marginTop: 4 })}>작업 삭제</button>
    </>
  );
}
