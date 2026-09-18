import React, { useState, useMemo } from "react";
import { quickParse, quickHint } from "./quickParse";
import { C, FONT, card, input, btn, fmtDate } from "./ui";

// ===== 공용 부품 ① 의 화면 부분 =====
// 한 줄 입력창 + 인식 결과 미리보기. 분류 목록은 쓰는 화면에서 넘겨받는다.
//   cats     : [{k, n, c?, kw?}]  — 없으면 분류 인식을 건너뛴다
//   fallback : 분류를 못 찾았을 때 쓸 기본 분류 키 (없으면 null)
//   onAdd    : (파싱결과) => void
export default function QuickAddBar({ cats = [], fallback = null, onAdd, placeholder, today }) {
  const [text, setText] = useState("");
  const parsed = useMemo(
    () => quickParse(text, { cats, today, fallback }),
    [text, cats, today, fallback]
  );
  const hint = useMemo(() => quickHint(cats, fallback), [cats, fallback]);
  const catOf = (k) => cats.find((c) => c.k === k);
  const hit = catOf(parsed.cat);

  const submit = () => {
    if (!text.trim() || !parsed.title) return;
    onAdd(parsed);
    setText("");
  };

  const chip = (label, extra = {}) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: C.soft, color: C.text, whiteSpace: "nowrap", ...extra }}>{label}</span>
  );

  return (
    <div style={card({ padding: "12px 14px", marginBottom: 12, border: `1.5px solid ${C.main}` })}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }}
          placeholder={placeholder || "한 줄로 입력하세요.  예) 내일 오후 3시 교육 운영안 보고 #보고"}
          autoComplete="off"
          style={input({ border: "none", fontSize: 14, padding: "6px 2px", flex: 1, minWidth: 0 })}
        />
        <button onClick={submit} disabled={!text.trim() || !parsed.title} style={btn("primary", {
          padding: "8px 16px", fontSize: 13, opacity: (!text.trim() || !parsed.title) ? 0.5 : 1,
          cursor: (!text.trim() || !parsed.title) ? "not-allowed" : "pointer" })}>추가</button>
      </div>

      {text.trim() && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 11, color: C.faint }}>
          <span>인식 결과</span>
          {chip(parsed.title || "(제목 없음)", { background: C.mainBg, color: C.main })}
          {chip(fmtDate(parsed.date) + (parsed.dateGuessed ? " · 날짜 미입력 → 오늘" : ""))}
          {parsed.time ? chip(parsed.time) : null}
          {hit ? chip(hit.n, { background: (hit.c || C.sub) + "1f", color: hit.c || C.sub }) : null}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.6, fontFamily: FONT }}>{hint}</div>
    </div>
  );
}
