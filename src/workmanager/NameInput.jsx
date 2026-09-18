import React, { useState, useRef, useMemo } from "react";
import { C, FONT } from "../shared/ui";

// ===== 이름 자동완성 =====
// 입력하면 저장된 사람을 추천하고, 방향키 ↑↓ 와 Enter 로 고른다.
// 목록에 없는 이름을 적으면 "새로 추가" 항목이 뜨고, 고르면 사람 목록에 저장된다.
//   value       : 현재 선택된 이름 배열
//   people      : 저장된 사람 목록
//   onChange    : 선택 목록이 바뀔 때
//   onAddPerson : 새 이름이 처음 쓰일 때 (사람 목록에 저장)
//   chips       : false 면 선택된 이름을 칩으로 그리지 않는다 (회차 참석자 추가용)
export default function NameInput({ value = [], people = [], onChange, onAddPerson, placeholder, chips = true }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const options = useMemo(() => {
    const q = text.trim();
    const list = people
      .filter((p) => !value.includes(p) && (!q || p.includes(q)))
      .map((n) => ({ n, isNew: false }));
    if (q && !people.includes(q) && !value.includes(q)) list.push({ n: q, isNew: true });
    return list;
  }, [text, people, value]);

  const pick = (i) => {
    const o = options[i];
    if (!o) return;
    if (o.isNew && onAddPerson) onAddPerson(o.n);
    onChange([...value, o.n]);
    setText(""); setIdx(0);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
  };

  const onKey = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setIdx((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (options.length) pick(idx); }
    else if (e.key === "Backspace" && !text && chips && value.length) onChange(value.slice(0, -1));
    else if (e.key === "Escape") setOpen(false);
  };

  const savedCount = options.filter((o) => !o.isNew).length;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
      border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 7px", background: C.white, position: "relative" }}>
      {chips && value.map((n, i) => (
        <span key={n + i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.greenBg,
          color: C.greenDeep, borderRadius: 99, padding: "2px 8px", fontSize: 11.5, fontWeight: 600 }}>
          {n}
          <span onClick={() => onChange(value.filter((_, j) => j !== i))}
            style={{ cursor: "pointer", opacity: 0.6, fontStyle: "normal" }}>✕</span>
        </span>
      ))}
      <div style={{ flex: 1, minWidth: 130, position: "relative" }}>
        <input ref={inputRef} value={text} autoComplete="off"
          onChange={(e) => { setText(e.target.value); setIdx(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          placeholder={placeholder || "이름 입력 (예: 김)"}
          style={{ width: "100%", border: "none", outline: "none", fontFamily: FONT, fontSize: 12.5, padding: "4px 2px", background: "transparent" }} />

        {open && options.length > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: C.white,
            border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: "0 6px 18px rgba(20,30,50,0.12)",
            zIndex: 40, maxHeight: 200, overflowY: "auto" }}>
            {savedCount > 0 && <div style={{ fontSize: 10.5, color: C.faint, padding: "5px 10px 2px" }}>저장된 사람</div>}
            {options.map((o, i) => (
              <div key={o.n + (o.isNew ? "-new" : "")}
                onMouseDown={(e) => { e.preventDefault(); pick(i); }}
                onMouseEnter={() => setIdx(i)}
                style={{ padding: "7px 10px", fontSize: 12.5, cursor: "pointer",
                  background: i === idx ? C.mainBg : "transparent",
                  color: o.isNew ? C.greenDeep : i === idx ? C.main : C.text,
                  fontWeight: i === idx ? 600 : 400,
                  borderTop: o.isNew ? `1px solid ${C.line}` : "none" }}>
                {o.isNew ? `+ "${o.n}" 새로 추가 (다음부터 추천 목록에 저장)` : o.n}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
