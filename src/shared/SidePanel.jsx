import React, { useEffect } from "react";
import { C, FONT } from "./ui";

// ===== 공용 부품 ② 오른쪽 상세 패널 (Notion 방식) =====
// 항목을 클릭하면 오른쪽에서 열리고, × 버튼이나 Esc 로 닫힌다.
// 저장은 각 화면이 입력 즉시 처리하므로 여기엔 저장 버튼이 없다.
export default function SidePanel({ open, kind, onClose, children, width = 480 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* 좁은 화면에서는 뒤를 덮어 가린다 */}
      {open && (
        <div onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1190, display: window.innerWidth <= 1100 ? "block" : "none" }} />
      )}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width, maxWidth: "100%",
        background: C.white, borderLeft: `1px solid ${C.line}`,
        boxShadow: "-8px 0 24px rgba(20,30,50,0.10)",
        transform: open ? "none" : "translateX(100%)", transition: "transform 0.2s",
        zIndex: 1200, display: "flex", flexDirection: "column", fontFamily: FONT,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 12, color: C.muted, flexShrink: 0 }}>
          <span style={{ fontWeight: 700 }}>{kind}</span>
          <button onClick={onClose} title="닫기 (Esc)"
            style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: C.faint, padding: "0 4px" }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 40px" }}>{open ? children : null}</div>
      </div>
    </>
  );
}

// 상세 패널 안에서 반복해 쓰는 조각들 ------------------------------------

export const SpTitle = ({ value, onChange, readOnly }) =>
  readOnly
    ? <div style={{ fontSize: 20, fontWeight: 800, color: C.title, marginBottom: 4 }}>{value}</div>
    : <input value={value} onChange={(e) => onChange(e.target.value)}
        style={{ fontSize: 20, fontWeight: 800, border: "none", outline: "none", width: "100%",
          fontFamily: FONT, marginBottom: 4, color: C.title, background: "transparent" }} />;

export const SpSub = ({ children }) =>
  <div style={{ fontSize: 12, color: C.faint, marginBottom: 14 }}>{children}</div>;

// 속성 표 (라벨 : 입력칸)
export const Props = ({ children }) => (
  <div style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: "7px 10px", alignItems: "center",
    fontSize: 12, marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.line}` }}>{children}</div>
);
export const PropLabel = ({ children }) => <span style={{ color: C.faint, fontWeight: 600 }}>{children}</span>;

export const Section = ({ title, required, optional, count, children }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: C.title, margin: 0 }}>{title}</h4>
      {required && <span style={{ fontSize: 9.5, color: C.white, background: C.main, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>필수</span>}
      {optional && <span style={{ fontSize: 9.5, color: C.muted, background: C.soft, borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>선택</span>}
      {count != null && <span style={{ fontSize: 11, color: C.faint, marginLeft: "auto" }}>{count}</span>}
    </div>
    {children}
  </div>
);

// 체크리스트 (하위 작업 / 액션 아이템 공용)
export function CheckList({ items, onChange, placeholder }) {
  const [draft, setDraft] = React.useState("");
  const list = items || [];
  const set = (i, patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => { const t = draft.trim(); if (!t) return; onChange([...list, { t, d: false }]); setDraft(""); };
  return (
    <div>
      {list.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
          <button onClick={() => set(i, { d: !a.d })}
            style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer",
              border: `2px solid ${a.d ? C.green : "#d1d5db"}`, background: a.d ? C.green : C.white,
              color: C.white, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.d ? "✓" : ""}</button>
          <input value={a.t} onChange={(e) => set(i, { t: e.target.value })}
            style={{ flex: 1, border: "none", borderBottom: "1px solid transparent", fontFamily: FONT, fontSize: 12.5,
              padding: "2px 0", outline: "none", color: a.d ? C.faint : C.text, textDecoration: a.d ? "line-through" : "none", background: "transparent" }} />
          <button onClick={() => onChange(list.filter((_, j) => j !== i))}
            style={{ border: "none", background: "none", color: "#c5cdd8", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
        placeholder={placeholder || "추가 (입력 후 Enter)"}
        style={{ width: "100%", border: `1px dashed ${C.line}`, borderRadius: 6, padding: "6px 8px",
          fontFamily: FONT, fontSize: 12.5, marginTop: 4, outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

export const Textarea = (p) => (
  <textarea {...p} style={{ width: "100%", minHeight: 66, border: `1px solid ${C.line}`, borderRadius: 8,
    padding: "8px 10px", fontFamily: FONT, fontSize: 12.5, resize: "vertical", lineHeight: 1.55,
    outline: "none", boxSizing: "border-box", ...(p.style || {}) }} />
);
