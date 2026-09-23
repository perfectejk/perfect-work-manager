import React, { useState, useMemo, useEffect } from "react";
import { quickParse, quickHint } from "./quickParse";
import { C, FONT, card, input, btn, fmtDate } from "./ui";

// ===== 공용 부품 ① 의 화면 부분 =====
// 한 줄 입력창 + 인식 결과 미리보기. 분류 목록은 쓰는 화면에서 넘겨받는다.
//   cats     : [{k, n, c?, kw?}]  — 없으면 분류 인식을 건너뛴다
//   fallback : 분류를 못 찾았을 때 쓸 기본 분류 키 (없으면 null)
//   onAdd    : (파싱결과, 추가정보) => void
//   detect   : (파싱결과) => { chips:[{label,color}], data:{...}, pick:{label, options:[{id,label,primary}], autoId} }
//              쓰는 화면이 제목에서 뭔가를 더 알아내어 미리보기 칩으로 보여주고,
//              그 결과를 onAdd 의 두 번째 인자로 받고 싶을 때 쓴다. (예: 계약업체 인식)
//              pick 이 있으면 입력하는 동안 바로 고를 수 있는 버튼 줄을 그린다.
//              pick.insertOnly 면 고른 값을 입력창 글자에 끼워 넣기만 한다 (@ 로 업체 불러오기).
export default function QuickAddBar({ cats = [], fallback = null, onAdd, placeholder, today, detect }) {
  const [text, setText] = useState("");
  const inputRef = React.useRef(null);
  const parsed = useMemo(
    () => quickParse(text, { cats, today, fallback }),
    [text, cats, today, fallback]
  );
  const hint = useMemo(() => quickHint(cats, fallback), [cats, fallback]);
  const catOf = (k) => cats.find((c) => c.k === k);
  // detect 에는 원문도 함께 넘긴다 ("@" 위치를 알아야 하므로)
  const found = useMemo(
    () => (detect && (parsed.title || text.includes("@")) ? detect(parsed, text) : null),
    [detect, parsed, text]
  );
  // 화면이 알아낸 분류가 있으면 그쪽을 우선해 미리보기에 보여준다
  const hit = catOf(found && found.catOverride ? found.catOverride : parsed.cat);
  // detect 가 제목에서 뺄 말(보고 대상 등)을 정리해 주면 그 제목을 쓴다
  const shown = (found && found.titleOverride != null) ? { ...parsed, title: found.titleOverride } : parsed;

  // 입력 중에 고른 항목 (예: 어느 계약에 붙일지)
  const pick = found && found.pick;
  // insertOnly(@ 목록)는 글자를 끼워 넣기만 하므로 선택 상태를 기억하지 않는다
  const pickKey = pick && !pick.insertOnly ? pick.label + "|" + pick.options.map((o) => o.id).join(",") : "";
  const [pickedId, setPickedId] = useState("");
  // 인식된 대상이 바뀌면 고른 것을 초기화하고, 기본값이 있으면 미리 골라 둔다
  useEffect(() => { setPickedId(pick && !pick.insertOnly ? (pick.autoId || "") : ""); }, [pickKey]);

  // 선택줄에서 하나를 골랐을 때
  const choose = (o) => {
    if (pick.insertOnly) {
      // @검색어 부분을 고른 업체명으로 바꿔 넣는다
      const r = pick.range || { start: text.length, end: text.length };
      const next = (text.slice(0, r.start) + (o.insert || "") + text.slice(r.end)).replace(/\s{2,}/g, " ");
      setText(next.endsWith(" ") ? next : next + " ");
      setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n); } }, 0);
      return;
    }
    setPickedId(pickedId === o.id ? "" : o.id);
  };

  const submit = () => {
    if (!text.trim() || !shown.title) return;
    const extra = found ? { ...found.data, pickedId } : undefined;
    onAdd(shown, extra);
    setText("");
    setPickedId("");
  };

  const chip = (label, extra = {}) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: C.soft, color: C.text, whiteSpace: "nowrap", ...extra }}>{label}</span>
  );

  return (
    <div style={card({ padding: "12px 14px", marginBottom: 12, border: `1.5px solid ${C.main}` })}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            // @ 목록이 떠 있으면 Enter 로 첫 후보를 고른다 (저장하지 않는다)
            if (pick && pick.insertOnly && pick.options.length > 0) { e.preventDefault(); choose(pick.options[0]); return; }
            submit();
          }}
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
          {chip(shown.title || "(제목 없음)", { background: C.mainBg, color: C.main })}
          {chip(fmtDate(parsed.date) + (parsed.dateGuessed ? " · 날짜 미입력 → 오늘" : ""))}
          {parsed.time ? chip(parsed.time) : null}
          {hit ? chip(hit.n, { background: (hit.c || C.sub) + "1f", color: hit.c || C.sub }) : null}
          {found && (found.chips || []).map((x, i) =>
            <span key={i}>{chip(x.label, { background: (x.color || C.main) + "1f", color: x.color || C.main })}</span>)}
        </div>
      )}

      {/* 입력하는 동안 바로 고르는 줄 — 예: 어느 계약에 붙일지 */}
      {text.trim() && pick && pick.insertOnly && pick.options.length === 0 && (
        <div style={{ marginTop: 8, background: C.soft, borderRadius: 9, padding: "9px 11px",
          fontSize: 11.5, color: C.faint }}>{pick.emptyLabel || "찾는 업체가 없습니다."}</div>
      )}
      {text.trim() && pick && pick.options.length > 0 && (
        <div style={{ marginTop: 8, background: C.soft, borderRadius: 9, padding: "9px 11px" }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 7 }}>{pick.label}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pick.options.map((o) => {
              const on = !pick.insertOnly && pickedId === o.id;
              return (
                <button key={o.id} onClick={() => choose(o)}
                  style={{ border: `1.5px solid ${on ? C.main : C.line}`, borderRadius: 99, padding: "5px 12px",
                    fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
                    background: on ? C.mainBg : C.white, color: on ? C.main : o.primary ? C.text : C.muted }}>
                  {on ? "✓ " : ""}{o.label}
                </button>
              );
            })}
            {!pick.insertOnly && (
              <button onClick={() => setPickedId("none")}
                style={{ border: `1.5px solid ${pickedId === "none" ? C.muted : C.line}`, borderRadius: 99,
                  padding: "5px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
                  background: pickedId === "none" ? "#eef1f5" : C.white, color: C.muted }}>
                {pickedId === "none" ? "✓ " : ""}연결 안 함
              </button>
            )}
          </div>
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.6, fontFamily: FONT }}>{hint}</div>
    </div>
  );
}
