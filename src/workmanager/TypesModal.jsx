import React, { useState } from "react";
import { C, FONT, input, btn, modalBg, modalCard } from "../shared/ui";
import { subTypesOf } from "./store";

// 자료 유형 관리 — 추가 / 이름·색 변경 / 삭제(작업이 연결된 유형은 불가)
export default function TypesModal({ types, tasks, onSave, subTypes = [], onSaveSubTypes, onClose }) {
  const [rows, setRows] = useState(types);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0e9aa7");
  const [subRows, setSubRows] = useState(subTypes);
  const [subName, setSubName] = useState("");

  const usedCount = (k) => tasks.filter((t) => t.type === k).length;
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (rows.some((r) => r.n === n)) { alert("같은 이름의 유형이 이미 있습니다."); return; }
    // '기타'는 항상 맨 뒤에 둔다
    const next = [...rows];
    const etcAt = next.findIndex((r) => r.k === "etc");
    const item = { k: "t" + Math.random().toString(36).slice(2, 8), n, c: color, kw: [] };
    if (etcAt >= 0) next.splice(etcAt, 0, item); else next.push(item);
    setRows(next);
    setName("");
  };

  const remove = (i) => {
    const r = rows[i];
    if (usedCount(r.k) > 0) return;
    if (!window.confirm(`유형 "${r.n}"을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setRows(rows.filter((_, j) => j !== i));
  };

  // 세부 분류 (계약업체 일정용)
  // 세부 분류는 여러 개 붙을 수 있으므로 배열에 들어 있는지로 센다
  const subUsed = (k) => tasks.filter((t) => subTypesOf(t).includes(k)).length;
  const setSub = (i, patch) => setSubRows(subRows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addSub = () => {
    const n = subName.trim();
    if (!n) return;
    if (subRows.some((r) => r.n === n)) { alert("같은 이름의 분류가 이미 있습니다."); return; }
    const next = [...subRows];
    const etcAt = next.findIndex((r) => r.k === "etc");
    const item = { k: "s" + Math.random().toString(36).slice(2, 8), n, kw: [] };
    if (etcAt >= 0) next.splice(etcAt, 0, item); else next.push(item);
    setSubRows(next);
    setSubName("");
  };
  const removeSub = (i) => {
    const r = subRows[i];
    if (subUsed(r.k) > 0) return;
    if (!window.confirm(`세부 분류 "${r.n}"을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setSubRows(subRows.filter((_, j) => j !== i));
  };

  const save = async () => {
    if (rows.some((r) => !String(r.n || "").trim())) { alert("이름이 빈 유형이 있습니다."); return; }
    if (subRows.some((r) => !String(r.n || "").trim())) { alert("이름이 빈 세부 분류가 있습니다."); return; }
    await onSave(rows);
    if (onSaveSubTypes) await onSaveSubTypes(subRows);
    onClose();
  };

  return (
    <div style={modalBg(1300)} onClick={onClose}>
      <div style={modalCard(520)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 4 }}>자료 유형 관리</div>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            이름과 색을 바꿀 수 있습니다. 작업이 연결된 유형은 삭제할 수 없습니다.
            한 줄 입력에서 <b>#유형이름</b>으로 쓸 수 있습니다.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {rows.map((r, i) => {
            const used = usedCount(r.k);
            return (
              <div key={r.k} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 8, alignItems: "center", marginBottom: 7 }}>
                <input type="color" value={r.c} onChange={(e) => set(i, { c: e.target.value })}
                  style={{ width: 36, height: 32, border: `1px solid ${C.line}`, borderRadius: 6, padding: 2, background: C.white, cursor: "pointer" }} />
                <input value={r.n} onChange={(e) => set(i, { n: e.target.value })} style={input({ fontSize: 12.5 })} />
                {r.k === "etc"
                  ? <span style={{ fontSize: 11, color: C.faint }}>기본</span>
                  : used > 0
                    ? <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>사용 중 {used}건</span>
                    : <button onClick={() => remove(i)} style={btn("danger", { padding: "4px 10px", fontSize: 11 })}>삭제</button>}
              </div>
            );
          })}

          <div style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              style={{ width: 36, height: 32, border: `1px solid ${C.line}`, borderRadius: 6, padding: 2, background: C.white, cursor: "pointer" }} />
            <input value={name} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
              placeholder="새 유형 이름 (예: 교육 영상, 설문지)" style={input({ fontSize: 12.5 })} />
            <button onClick={add} style={btn("primary", { padding: "6px 12px", fontSize: 11.5 })}>추가</button>
          </div>

          {/* ── 계약업체 일정의 세부 분류 ── */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.title, marginBottom: 4 }}>계약업체 세부 분류</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              계약업체 일정에 붙는 분류입니다. 한 줄 입력에서 이름에 든 단어로 자동 인식됩니다.
              (예: "리워드"라고 쓰면 리워드 세팅)
            </div>
            {subRows.map((r, i) => {
              const used = subUsed(r.k);
              return (
                <div key={r.k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginBottom: 7 }}>
                  <input value={r.n} onChange={(e) => setSub(i, { n: e.target.value })} style={input({ fontSize: 12.5 })} />
                  {r.k === "etc"
                    ? <span style={{ fontSize: 11, color: C.faint }}>기본</span>
                    : used > 0
                      ? <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>사용 중 {used}건</span>
                      : <button onClick={() => removeSub(i)} style={btn("danger", { padding: "4px 10px", fontSize: 11 })}>삭제</button>}
                </div>
              );
            })}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", marginTop: 10 }}>
              <input value={subName} onChange={(e) => setSubName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addSub(); }}
                placeholder="새 세부 분류 (예: 영수증 리뷰, 순위 점검)" style={input({ fontSize: 12.5 })} />
              <button onClick={addSub} style={btn("primary", { padding: "6px 12px", fontSize: 11.5 })}>추가</button>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn("ghost", { padding: "9px 18px", fontSize: 12.5 })}>취소</button>
          <button onClick={save} style={btn("primary", { padding: "9px 18px", fontSize: 12.5 })}>저장</button>
        </div>
      </div>
    </div>
  );
}
