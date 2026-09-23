import React, { useState } from "react";
import { C, FONT, input, btn, badge, modalBg, modalCard, parseYMD, WD } from "../shared/ui";
import { WIDGETS } from "./DashboardTab";
import { DEFAULT_HOLIDAYS } from "./holidays";

// ===== 대시보드 설정 =====
// 위젯을 켜고 끄거나 순서를 바꾸고, 영업일 계산에 쓰는 공휴일을 고친다.
export default function DashboardSettings({ layout, holidays, today, onSaveLayout, onSaveHolidays, onClose }) {
  const [rows, setRows] = useState(layout);
  const [hs, setHs] = useState(holidays.map((h) => (typeof h === "string" ? { d: h, n: "" } : h)));
  const [nd, setNd] = useState("");
  const [nn, setNn] = useState("");
  const [tab, setTab] = useState("widget");

  const info = (k) => WIDGETS.find((w) => w.k === k) || { n: k, desc: "" };
  const toggle = (i) => setRows(rows.map((r, j) => (j === i ? { ...r, on: !r.on } : r)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };

  const addHoliday = () => {
    const d = nd.trim();
    if (!d) return;
    if (hs.some((h) => h.d === d)) { alert("이미 있는 날짜입니다."); return; }
    setHs([...hs, { d, n: nn.trim() }].sort((a, b) => a.d.localeCompare(b.d)));
    setNd(""); setNn("");
  };
  const removeHoliday = (i) => setHs(hs.filter((_, j) => j !== i));
  const resetHolidays = () => {
    if (!window.confirm("공휴일 목록을 기본값으로 되돌릴까요? 직접 넣은 날짜는 사라집니다.")) return;
    setHs(DEFAULT_HOLIDAYS);
  };

  const save = async () => {
    await onSaveLayout(rows);
    await onSaveHolidays(hs);
    onClose();
  };

  const dow = (d) => { try { return WD[parseYMD(d).getDay()]; } catch { return "?"; } };
  const tabBtn = (k, label) => (
    <button onClick={() => setTab(k)}
      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", fontSize: 12.5, cursor: "pointer",
        fontWeight: tab === k ? 700 : 500, background: tab === k ? C.main : "transparent",
        color: tab === k ? C.white : C.muted, fontFamily: FONT }}>{label}</button>
  );

  return (
    <div style={modalBg(1300)} onClick={onClose}>
      <div style={modalCard(520)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 10 }}>대시보드 설정</div>
          <div style={{ display: "flex", background: C.soft, borderRadius: 10, padding: 3, gap: 3 }}>
            {tabBtn("widget", "위젯")}{tabBtn("holiday", "공휴일")}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {tab === "widget" && (<>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, marginBottom: 12 }}>
              켜고 끄거나 순서를 바꿀 수 있습니다. 나중에 위젯이 늘어나면 여기에 자동으로 나타납니다.
            </div>
            {rows.map((r, i) => {
              const w = info(r.k);
              return (
                <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 11px",
                  border: `1px solid ${C.line}`, borderRadius: 9, marginBottom: 7, background: r.on ? C.white : "#fafbfc" }}>
                  <button onClick={() => toggle(i)}
                    style={{ width: 38, height: 22, borderRadius: 99, border: "none", cursor: "pointer", flexShrink: 0,
                      background: r.on ? C.main : "#d5dae2", position: "relative", transition: "background .15s" }}>
                    <span style={{ position: "absolute", top: 3, left: r.on ? 19 : 3, width: 16, height: 16,
                      borderRadius: "50%", background: C.white, transition: "left .15s" }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: r.on ? C.title : C.faint }}>{w.n}</div>
                    <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{w.desc}</div>
                  </div>
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0}
                      style={btn("ghost", { padding: "3px 8px", fontSize: 12, opacity: i === 0 ? 0.35 : 1 })}>↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === rows.length - 1}
                      style={btn("ghost", { padding: "3px 8px", fontSize: 12, opacity: i === rows.length - 1 ? 0.35 : 1 })}>↓</button>
                  </div>
                </div>
              );
            })}
          </>)}

          {tab === "holiday" && (<>
            <div style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 9,
              padding: "10px 12px", fontSize: 11.5, color: "#8a5a12", lineHeight: 1.6, marginBottom: 12 }}>
              마감 D-3 을 셀 때 토·일과 함께 건너뛰는 날입니다.<br />
              <b>설날·부처님오신날·추석</b>은 음력이라 날짜가 정확한지 한 번 확인해 주세요. 틀리면 여기서 고치면 됩니다.
            </div>
            <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12 }}>
              {hs.map((h, i) => (
                <div key={h.d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  borderBottom: `1px solid ${C.soft}`, fontSize: 12 }}>
                  <span style={{ color: C.text, fontWeight: 600, width: 96 }}>{h.d}</span>
                  <span style={{ color: parseYMD(h.d).getDay() === 0 ? C.red : C.faint, width: 20 }}>{dow(h.d)}</span>
                  <span style={{ flex: 1, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.n || "—"}</span>
                  {h.check && <span style={{ ...badge("#8a5a12", C.amberBg), fontSize: 10 }}>확인 필요</span>}
                  <button onClick={() => removeHoliday(i)}
                    style={{ border: "none", background: "none", color: "#c5cdd8", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 8, alignItems: "center" }}>
              <input type="date" value={nd} onChange={(e) => setNd(e.target.value)} style={input({ fontSize: 12.5 })} />
              <input value={nn} onChange={(e) => setNn(e.target.value)} placeholder="이름 (예: 대체공휴일)"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) addHoliday(); }}
                style={input({ fontSize: 12.5 })} />
              <button onClick={addHoliday} style={btn("primary", { padding: "6px 12px", fontSize: 11.5 })}>추가</button>
            </div>
            <button onClick={resetHolidays} style={btn("ghost", { marginTop: 10, padding: "5px 11px", fontSize: 11 })}>기본값으로 되돌리기</button>
          </>)}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btn("ghost", { padding: "9px 18px", fontSize: 12.5 })}>취소</button>
          <button onClick={save} style={btn("primary", { padding: "9px 18px", fontSize: 12.5 })}>저장</button>
        </div>
      </div>
    </div>
  );
}
