// 기존 PRO 앱(App.jsx)에서 쓰던 색·모양을 한 곳에 모은 것.
// 새 화면이 원래 있던 탭처럼 보이도록, 여기 값만 쓰고 새 색을 만들지 않는다.
export const FONT = "'Pretendard',-apple-system,sans-serif";

export const C = {
  main: "#0071CE",      // 메인 (브랜드)
  sub: "#8468D3",       // 보조 (브랜드)
  green: "#10b981",     // 완료·진행
  greenDeep: "#047857",
  greenBg: "#d1fae5",
  red: "#ef4444",       // 지연·삭제
  redDeep: "#b91c1c",
  redBg: "#fef2f2",
  amber: "#b45309",
  amberBg: "#fffbeb",
  title: "#0f1117",     // 제목 글씨
  text: "#374151",      // 본문 글씨
  muted: "#6b7280",     // 보조 글씨
  faint: "#adb5bd",     // 흐린 글씨
  line: "#f0f1f3",      // 선
  soft: "#f7f8fa",      // 연한 배경
  mainBg: "#f0f7ff",
  subBg: "#f5f3ff",
  white: "#fff",
};

// 카드 — 전 탭 공통 모양
export const card = (extra = {}) => ({
  background: C.white, borderRadius: 14, border: `1px solid ${C.line}`, ...extra,
});

// 입력창 — 폼용(13px)과 인라인용(12px)
export const input = (extra = {}) => ({
  border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 11px", fontSize: 13,
  outline: "none", width: "100%", boxSizing: "border-box", fontFamily: FONT, background: C.white, ...extra,
});
export const inputSm = (extra = {}) => ({
  border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 12,
  outline: "none", boxSizing: "border-box", fontFamily: FONT, background: C.white, ...extra,
});

// 버튼 — 주(파랑) / 보조(회색) / 위험(빨강) / 강조(보라)
const btnBase = { border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontFamily: FONT };
export const btn = (kind = "primary", extra = {}) => {
  const kinds = {
    primary: { background: C.main, color: C.white },
    ghost: { background: C.soft, color: C.muted, border: `1px solid ${C.line}` },
    danger: { background: C.redBg, color: C.red, border: `1px solid #fca5a5` },
    accent: { background: C.sub, color: C.white },
  };
  return { ...btnBase, padding: "7px 14px", fontSize: 12, ...kinds[kind], ...extra };
};

// 배지 — App.jsx 의 Badge 컴포넌트와 같은 모양
export const badge = (color, bg, extra = {}) => ({
  fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 6,
  padding: "2px 7px", whiteSpace: "nowrap", ...extra,
});

// 표 — 주간계획·블로그 계획 탭과 같은 모양
export const th = {
  padding: "7px 8px", fontSize: 11, fontWeight: 700, color: C.muted,
  textAlign: "left", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
};
export const td = {
  padding: "8px", fontSize: 12, color: C.text, borderBottom: "1px solid #f7f8fa", verticalAlign: "middle",
};

// 모달 덮개 + 가운데 카드
export const modalBg = (z = 1000) => ({
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: z,
  display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, padding: 16,
});
export const modalCard = (w = 520) => ({
  background: C.white, borderRadius: 16, width: w, maxWidth: "94vw", maxHeight: "88vh",
  display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
});

// 세부탭 바 — 계약관리·작업관리 탭과 같은 모양
export const subTabBar = {
  display: "flex", background: C.white, borderRadius: 12, padding: 4,
  marginBottom: 14, border: `1px solid ${C.line}`, gap: 4,
};
export const subTabBtn = (on) => ({
  flex: 1, padding: "9px", borderRadius: 9, border: "none", fontSize: 13,
  fontWeight: on ? 700 : 500, cursor: "pointer",
  background: on ? C.main : "transparent", color: on ? C.white : C.muted, fontFamily: FONT,
});

export const YMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseYMD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate() + n); return YMD(d); };
export const WD = "일월화수목금토";
export const fmtDate = (s) => { const d = parseYMD(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
export const uid = () => Math.random().toString(36).slice(2, 9);
