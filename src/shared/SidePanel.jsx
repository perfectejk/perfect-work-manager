import React, { useEffect, useState } from "react";
import { C, FONT } from "./ui";

// ===== 공용 부품 ② 오른쪽 상세 패널 (Notion 방식) =====
// PC  : 오른쪽에서 480px 패널이 밀려나오고, 헤더 오른쪽 ✕ 로 닫는다 (기존 그대로)
// 모바일: 화면 전체를 덮고, 맨 위에 [← 닫기] 헤더를 고정한다.
//        앱의 햄버거 버튼(zIndex 9997)이 ✕ 를 덮어 누를 수 없었던 문제 때문에
//        모바일에서는 패널을 그보다 위(10050)에 올린다.
// 닫는 방법: [← 닫기] / 바깥 어두운 영역 탭 / Esc / 뒤로 가기
const MOBILE_MAX = 768;

export default function SidePanel({ open, kind, onClose, children, width = 480 }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_MAX);
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 1100);

  // 화면 크기가 바뀌면 따라간다 (예전엔 렌더 시점 값으로 굳어 있었다)
  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= MOBILE_MAX);
      setIsNarrow(window.innerWidth <= 1100);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 열려 있는 동안 뒤쪽 목록이 같이 스크롤되지 않게 잠근다
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // 안드로이드 뒤로 가기 / 브라우저 뒤로 가기로 닫기
  // 열 때 기록을 하나 쌓고, 뒤로 가기가 오면 닫는다. ✕ 로 닫을 땐 쌓아둔 기록을 정리한다.
  useEffect(() => {
    if (!open) return;
    let closedByPop = false;
    window.history.pushState({ sidePanel: true }, "");
    const onPop = () => { closedByPop = true; onClose(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!closedByPop && window.history.state && window.history.state.sidePanel) window.history.back();
    };
  }, [open, onClose]);

  const panelStyle = isMobile
    ? {
        position: "fixed", inset: 0, width: "100%", maxWidth: "100%",
        height: "100dvh", maxHeight: "100dvh",
        background: C.white, transform: open ? "none" : "translateX(100%)",
        transition: "transform 0.2s", zIndex: 10050,
        display: "flex", flexDirection: "column", fontFamily: FONT,
      }
    : {
        position: "fixed", top: 0, right: 0, bottom: 0, width, maxWidth: "100%",
        background: C.white, borderLeft: `1px solid ${C.line}`,
        boxShadow: "-8px 0 24px rgba(20,30,50,0.10)",
        transform: open ? "none" : "translateX(100%)", transition: "transform 0.2s",
        zIndex: 1200, display: "flex", flexDirection: "column", fontFamily: FONT,
      };

  return (
    <>
      {/* 바깥 어두운 영역 — 탭하면 닫힌다. 모바일은 패널이 화면을 다 덮어 보이지 않는다. */}
      {open && isNarrow && !isMobile && (
        <div onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1190 }} />
      )}

      <div style={panelStyle}>
        {isMobile ? (
          // 스크롤을 내려도 맨 위에 계속 붙어 있는 헤더
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderBottom: `1px solid ${C.line}`, background: C.white,
            position: "sticky", top: 0, zIndex: 2 }}>
            <button onClick={onClose} aria-label="닫기"
              style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`,
                background: C.white, borderRadius: 9, padding: "8px 14px", cursor: "pointer",
                fontFamily: FONT, fontSize: 13, fontWeight: 700, color: C.text, flexShrink: 0 }}>
              <i className="ti ti-arrow-left" style={{ fontSize: 17 }} />닫기
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kind}</span>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 12, color: C.muted, flexShrink: 0 }}>
            <span style={{ fontWeight: 700 }}>{kind}</span>
            <button onClick={onClose} title="닫기 (Esc)"
              style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: C.faint, padding: "0 4px" }}>✕</button>
          </div>
        )}

        {/* 키보드가 올라와도 헤더가 가려지지 않도록, 스크롤은 이 영역만 일어난다 */}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch",
          padding: isMobile ? "16px 16px 80px" : "18px 20px 40px" }}>
          {open ? children : null}
        </div>
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
