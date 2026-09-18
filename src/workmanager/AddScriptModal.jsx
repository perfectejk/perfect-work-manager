import React, { useState } from "react";
import { C, input, btn, modalBg, modalCard } from "../shared/ui";

// 스크립트 추가 — 분류는 기존 것을 고르거나 새 이름을 적으면 새로 생긴다.
export default function AddScriptModal({ cats, onAdd, onClose }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState(cats[0] || "");

  const submit = async () => {
    if (!name.trim()) { alert("스크립트 이름을 입력해주세요."); return; }
    await onAdd(name, cat);
    onClose();
  };

  return (
    <div style={modalBg(1300)} onClick={onClose}>
      <div style={modalCard(440)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "18px 20px 0" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 4 }}>스크립트 추가</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 16 }}>
            분류는 기존 분류를 고르거나, 새 이름을 적으면 새로 만들어집니다.
          </div>

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 }}>스크립트 이름</label>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }}
            placeholder="예: 반론 - 광고비 부담" style={input({ marginBottom: 12 })} />

          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 }}>분류</label>
          <input value={cat} onChange={(e) => setCat(e.target.value)} list="wm-add-cat"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }}
            placeholder="예: 반론 (비우면 미분류)" style={input({ marginBottom: 4 })} />
          <datalist id="wm-add-cat">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          {cats.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16, marginTop: 6 }}>
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)}
                  style={{ border: `1.5px solid ${cat === c ? C.main : C.line}`, borderRadius: 99, padding: "3px 10px",
                    fontSize: 11, fontWeight: 600, cursor: "pointer",
                    background: cat === c ? C.mainBg : C.white, color: cat === c ? C.main : C.muted,
                    fontFamily: "'Pretendard',-apple-system,sans-serif" }}>{c}</button>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 8 }}>
          <button onClick={onClose} style={btn("ghost", { flex: 1, padding: "9px", fontSize: 12.5 })}>취소</button>
          <button onClick={submit} style={btn("primary", { flex: 1, padding: "9px", fontSize: 12.5 })}>추가</button>
        </div>
      </div>
    </div>
  );
}
