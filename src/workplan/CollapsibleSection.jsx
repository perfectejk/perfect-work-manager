import React, { useState } from "react";

// 제목 줄을 눌러 접고 펼치는 섹션 틀.
// · summary: 제목 옆 요약 (접혀 있어도 항상 보임)
// · right:   오른쪽 끝에 항상 보이는 영역 (저장 버튼·"저장 안 됨" 표시 등) — 눌러도 접히지 않는다
// · 접힌 상태에서도 내용은 화면 뒤에 그대로 살아 있다(display 만 숨김).
//   그래서 안쪽 패널이 위로 올려주는 요약(예: 블로그 진행률)이 접혀 있어도 계속 맞게 나온다.
// · storageKey 를 주면 접힘 여부를 이 브라우저에 기억한다. 저장소를 못 쓰는 환경이면 기본값으로 동작.
const FONT = "'Pretendard',-apple-system,sans-serif";
const readOpen = (key, def) => {
  if (!key) return def;
  try { const v = window.localStorage.getItem("collapse:" + key); return v === null ? def : v === "1"; } catch { return def; }
};
const writeOpen = (key, v) => {
  if (!key) return;
  try { window.localStorage.setItem("collapse:" + key, v ? "1" : "0"); } catch { /* 저장 못 해도 화면은 동작 */ }
};

export default function CollapsibleSection({
  title, summary, right, children, storageKey, defaultOpen = true,
  color = "#0f1117", headerBg = "#fff", style, bodyStyle,
}) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  const toggle = () => setOpen(o => { const n = !o; writeOpen(storageKey, n); return n; });
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #f0f1f3", marginBottom: 12, overflow: "hidden", ...style }}>
      <div onClick={toggle} role="button" aria-expanded={open}
        style={{ padding: "12px 16px", background: headerBg, borderBottom: open ? "1px solid #f0f1f3" : "none", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer", userSelect: "none", fontFamily: FONT }}>
        <span style={{ fontSize: 11, color: "#9ca3af", width: 12, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{title}</span>
        {summary != null && summary !== "" && <span style={{ fontSize: 11.5, color: "#6b7280", fontWeight: 600 }}>{summary}</span>}
        <div style={{ flex: 1 }} />
        {right && <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "default" }}>{right}</div>}
        <span style={{ fontSize: 10.5, color: "#adb5bd", fontWeight: 600 }}>{open ? "접기" : "펼치기"}</span>
      </div>
      <div style={{ display: open ? "block" : "none", ...bodyStyle }}>{children}</div>
    </div>
  );
}
