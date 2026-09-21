import React from "react";
import { C, FONT, input, btn } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section, CheckList, Textarea } from "../shared/SidePanel";
import { STATUS, CONTRACT_TYPE, subTypesOf, withSubTypes } from "./store";

// 작업 상세 — 유형 / 상태 / 날짜 / 시간 / 작업 설명 / 하위 작업 / 관련 링크
// 유형이 "계약업체"면 연결된 계약과 세부 분류가 더 나온다.
// 계약은 고유 식별값(contractId)으로 저장하고 화면에는 상호명을 보여준다.
// 입력하는 즉시 onPatch 로 저장한다.
export default function TaskPanel({ task, types, subTypes = [], contracts = [], onPatch, onDelete, onOpenContract }) {
  const [link, setLink] = React.useState("");
  if (!task) return null;
  const p = (patch) => onPatch(task.id, patch);
  const sel = input({ padding: "5px 7px", fontSize: 12, background: C.soft, border: "1px solid transparent" });
  const isContract = task.type === CONTRACT_TYPE;
  const linked = task.contractId ? contracts.find((c) => c.id === task.contractId) : null;
  const picked = subTypesOf(task);
  const toggleSub = (k) =>
    p(withSubTypes(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]));

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

        {isContract && (<>
          <PropLabel>연결된 업체</PropLabel>
          <select value={task.contractId || ""} onChange={(e) => p({ contractId: e.target.value })} style={sel}>
            <option value="">연결 안 함</option>
            {/* 목록에 없는 계약(권한·삭제 등)이라도 연결은 유지되도록 한 줄 넣어 둔다 */}
            {task.contractId && !contracts.some((c) => c.id === task.contractId) &&
              <option value={task.contractId}>(목록에 없는 계약)</option>}
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.startDate ? ` (${c.startDate.slice(2)}~)` : ""}
              </option>
            ))}
          </select>

          <PropLabel>세부 분류</PropLabel>
          {/* 블로그와 리워드를 함께 세팅하는 경우가 있어 여러 개를 고를 수 있다 */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {subTypes.map((x) => {
              const on = picked.includes(x.k);
              return (
                <button key={x.k} onClick={() => toggleSub(x.k)}
                  style={{ border: `1.5px solid ${on ? "#0891b2" : C.line}`, borderRadius: 99,
                    padding: "4px 11px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
                    background: on ? "#ecfeff" : C.white, color: on ? "#0891b2" : C.muted }}>
                  {on ? "\u2713 " : ""}{x.n}
                </button>
              );
            })}
          </div>
        </>)}
      </Props>

      {isContract && linked && (
        <div style={{ background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 9,
          padding: "10px 12px", marginBottom: 16, fontSize: 11.5, color: C.text, lineHeight: 1.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b style={{ color: "#0891b2", fontSize: 12.5 }}>{linked.name}</b>
            {linked.manager && <span style={{ color: C.faint }}>담당 {linked.manager}</span>}
            {onOpenContract && (
              <button onClick={() => onOpenContract(linked.id)}
                style={btn("ghost", { marginLeft: "auto", padding: "4px 10px", fontSize: 11 })}>계약 화면으로 이동</button>
            )}
          </div>
          {linked.startDate && linked.endDate &&
            <div style={{ color: C.faint, marginTop: 3 }}>{linked.startDate} ~ {linked.endDate}</div>}
        </div>
      )}
      {isContract && !linked && (
        <div style={{ background: C.soft, borderRadius: 9, padding: "9px 11px", marginBottom: 16,
          fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
          연결된 업체가 없습니다. 위에서 골라주세요.
        </div>
      )}

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
