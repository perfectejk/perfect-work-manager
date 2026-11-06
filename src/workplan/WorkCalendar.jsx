import React, { useMemo, useState } from "react";
import CollapsibleSection from "./CollapsibleSection";
import { ymdLocal, planAddDays } from "./planUtils";
import { buildEntries, aggregate, sumRange, activeTypes, hasAny, contractWeeks, monthGrid, buildMarkers } from "./calendarData";

// ===== 작업 캘린더 (주간계획 업체 상세) =====
// 트래픽 주차 표 · 블로그 · 영수증 리뷰 기록을 날짜별로 펼쳐 보여준다. 읽기만 한다.
// 저장 전에 고친 내용도 그대로 받아서 바로 반영된다.
//   props: trafficRows, blog, receipt ({runs, cms} 또는 null), contractStart, contractEnd
const FONT = "'Pretendard',-apple-system,sans-serif";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const fmt = n => (n || 0).toLocaleString();
const shortDate = d => (d ? d.slice(5).replace("-", "/") : "");

// 종류별 수량 줄 — 약칭 + 색. 0인 종류는 뺀다.
function QtyLines({ m, types, size = 10.5, inline = false }) {
  const list = types.filter(t => (m && m[t.k]) > 0);
  if (!list.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: inline ? "row" : "column", flexWrap: inline ? "wrap" : "nowrap", gap: inline ? "2px 8px" : 0, lineHeight: 1.35 }}>
      {list.map(t => (
        <span key={t.k} style={{ fontSize: size, fontWeight: 700, color: t.color, whiteSpace: "nowrap" }}>{t.short} {fmt(m[t.k])}</span>
      ))}
    </div>
  );
}

// 날짜 칸에 차례로 그리는 항목. 새 표시(개월차 경계선, 작업세팅 일정 등)는 여기에 한 줄 추가하면 된다.
//   ctx = {cell, markers, qty, types, outside}
const CELL_LAYERS = [
  { key: "markers", render: ({ markers }) => markers && markers.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 2 }}>
      {markers.map((x, i) => (
        <span key={i} style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: x.color, borderRadius: 4, padding: "0 4px", lineHeight: "14px" }}>{x.label}</span>
      ))}
    </div>
  ) },
  { key: "qty", render: ({ qty, types }) => <QtyLines m={qty} types={types} /> },
];

export default function WorkCalendar({ trafficRows, blog, receipt, contractStart, contractEnd }) {
  const today = ymdLocal(new Date());
  const [view, setView] = useState("day");
  const agg = useMemo(() => aggregate(buildEntries({ trafficRows, blog, receipt })), [trafficRows, blog, receipt]);
  const types = useMemo(() => activeTypes(agg.totals), [agg]);
  const markers = useMemo(() => buildMarkers({ contractStart, contractEnd }), [contractStart, contractEnd]);
  const outside = d => (contractStart && d < contractStart) || (contractEnd && d > contractEnd);

  // 처음 보여줄 달: 오늘이 계약 기간 안이면 이번 달, 아니면 계약 시작 달
  const [ym, setYm] = useState(() => {
    const base = contractStart && outside(today) ? contractStart : today;
    return { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
  });
  const moveMonth = n => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);

  const summary = types.length === 0 ? "등록된 작업 없음" : (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "0 10px" }}>
      {types.map(t => <span key={t.k} style={{ color: t.color, fontWeight: 700 }}>{t.label} {fmt(agg.totals[t.k])}{t.unit}</span>)}
    </span>
  );

  const btn = on => ({ background: on ? "#0071CE" : "#fff", color: on ? "#fff" : "#6b7280", border: "1px solid " + (on ? "#0071CE" : "#e5e7eb"), padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT });
  const navBtn = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 7, padding: "3px 10px", fontSize: 12, cursor: "pointer", color: "#374151", fontFamily: FONT };
  const th = { padding: "6px 6px", fontSize: 11, fontWeight: 700, color: "#6b7280", background: "#f7f8fa", borderBottom: "1px solid #f0f1f3", textAlign: "center" };
  const td = { padding: "5px 6px", borderBottom: "1px solid #f7f8fa", borderRight: "1px solid #f7f8fa", verticalAlign: "top" };

  return (
    <CollapsibleSection title="작업 캘린더" storageKey="plan:calendar" defaultOpen={false} summary={summary}>
      <div style={{ padding: "12px 16px", fontFamily: FONT }}>
        {/* 범례 + 보기 전환 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", flex: 1, minWidth: 0 }}>
            {types.map(t => (
              <span key={t.k} style={{ fontSize: 11, color: "#374151", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <b style={{ color: t.color, fontWeight: 800 }}>{t.short}</b> = {t.label}({t.unit})
              </span>
            ))}
            {types.length === 0 && <span style={{ fontSize: 12, color: "#9ca3af" }}>트래픽 주차 표나 블로그·영수증 리뷰 계획에 등록된 작업이 없습니다.</span>}
          </div>
          <div style={{ display: "flex" }}>
            <button onClick={() => setView("day")} style={{ ...btn(view === "day"), borderRadius: "8px 0 0 8px" }}>일별</button>
            <button onClick={() => setView("week")} style={{ ...btn(view === "week"), borderRadius: "0 8px 8px 0", borderLeft: "none" }}>주차별</button>
          </div>
        </div>

        {/* 날짜 정보가 없는 기록 */}
        {hasAny(agg.undated) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#92400e" }}>날짜 미지정</span>
            <QtyLines m={agg.undated} types={types} size={11.5} inline />
            <span style={{ fontSize: 10.5, color: "#a16207" }}>시작일·일 건수가 없거나 일시중지로 아직 날짜가 안 잡힌 수량입니다. 합계에는 들어갑니다.</span>
          </div>
        )}

        {view === "day" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button onClick={() => moveMonth(-1)} style={navBtn}>◀</button>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#0f1117", minWidth: 100, textAlign: "center" }}>{ym.y}년 {ym.m + 1}월</span>
              <button onClick={() => moveMonth(1)} style={navBtn}>▶</button>
              <button onClick={() => setYm({ y: +today.slice(0, 4), m: +today.slice(5, 7) - 1 })} style={{ ...navBtn, color: "#6b7280" }}>이번 달</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: "#adb5bd" }}>회색 = 계약 기간 밖</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", tableLayout: "fixed", border: "1px solid #f0f1f3" }}>
                <thead>
                  <tr>
                    {DOW.map((d, i) => <th key={d} style={{ ...th, color: i === 0 ? "#ef4444" : i === 6 ? "#0071CE" : "#6b7280" }}>{d}</th>)}
                    <th style={{ ...th, background: "#f0f7ff", color: "#0071CE", width: 96 }}>주 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((w, wi) => {
                    const wsum = sumRange(agg.byDate, w[0].date, w[6].date);
                    return (
                      <tr key={wi}>
                        {w.map(cell => {
                          const out = outside(cell.date);
                          const isToday = cell.date === today;
                          const ctx = { cell, markers: markers[cell.date], qty: agg.byDate[cell.date], types, outside: out };
                          return (
                            <td key={cell.date} style={{ ...td, height: 66, background: out ? "#f3f4f6" : "#fff", opacity: cell.inMonth ? 1 : 0.45, boxShadow: isToday ? "inset 0 0 0 2px #0071CE" : "none" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, color: out ? "#c0c4cc" : cell.dow === 0 ? "#ef4444" : cell.dow === 6 ? "#0071CE" : "#374151" }}>{cell.day}</div>
                              {CELL_LAYERS.map(l => <React.Fragment key={l.key}>{l.render(ctx)}</React.Fragment>)}
                            </td>
                          );
                        })}
                        <td style={{ ...td, background: "#f8fbff", borderRight: "none" }}>
                          <QtyLines m={wsum} types={types} size={11} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <WeekTable agg={agg} types={types} contractStart={contractStart} contractEnd={contractEnd} today={today} th={th} />
        )}
      </div>
    </CollapsibleSection>
  );
}

// 주차별 보기 — 계약 시작일부터 7일씩. 계약 기간 밖이나 날짜 미지정 수량이 있으면 따로 한 줄씩.
function WeekTable({ agg, types, contractStart, contractEnd, today, th }) {
  const weeks = useMemo(() => contractWeeks(contractStart, contractEnd), [contractStart, contractEnd]);
  const rows = weeks.map(w => ({ key: "w" + w.no, label: w.no + "주차", range: shortDate(w.start) + " ~ " + shortDate(w.end), m: sumRange(agg.byDate, w.start, w.end), now: today >= w.start && today <= w.end }));
  if (contractStart) { const m = sumRange(agg.byDate, null, ymdBefore(contractStart)); if (hasAny(m)) rows.unshift({ key: "before", label: "계약 시작 전", range: "~ " + shortDate(ymdBefore(contractStart)), m, extra: true }); }
  if (contractEnd) { const m = sumRange(agg.byDate, ymdAfter(contractEnd), null); if (hasAny(m)) rows.push({ key: "after", label: "계약 종료 후", range: shortDate(ymdAfter(contractEnd)) + " ~", m, extra: true }); }
  if (!contractStart || !contractEnd) { const m = sumRange(agg.byDate, null, null); if (hasAny(m)) rows.push({ key: "all", label: "날짜 있음", range: "계약 기간 미설정", m, extra: true }); }
  if (hasAny(agg.undated)) rows.push({ key: "undated", label: "날짜 미지정", range: "", m: agg.undated, extra: true });
  const cell = { padding: "6px 8px", fontSize: 12, borderBottom: "1px solid #f7f8fa", textAlign: "right", whiteSpace: "nowrap" };
  if (!types.length) return <div style={{ fontSize: 12, color: "#9ca3af", padding: "16px 0", textAlign: "center" }}>표시할 작업이 없습니다.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #f0f1f3" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>주차</th>
            <th style={{ ...th, textAlign: "left" }}>기간</th>
            {types.map(t => <th key={t.k} style={{ ...th, textAlign: "right", color: t.color }}>{t.short} · {t.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} style={{ background: r.now ? "#f0f7ff" : r.extra ? "#fffbeb" : "#fff" }}>
              <td style={{ ...cell, textAlign: "left", fontWeight: 700, color: r.extra ? "#92400e" : "#374151" }}>{r.label}{r.now && <span style={{ fontSize: 10, color: "#0071CE", marginLeft: 4 }}>이번 주</span>}</td>
              <td style={{ ...cell, textAlign: "left", color: "#9ca3af", fontSize: 11 }}>{r.range}</td>
              {types.map(t => <td key={t.k} style={{ ...cell, color: (r.m[t.k] || 0) > 0 ? t.color : "#d1d5db", fontWeight: 700 }}>{(r.m[t.k] || 0) > 0 ? fmt(r.m[t.k]) : "—"}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "#f7f8fa" }}>
            <td style={{ ...cell, textAlign: "left", fontWeight: 800 }} colSpan={2}>합계</td>
            {types.map(t => <td key={t.k} style={{ ...cell, fontWeight: 800, color: t.color }}>{fmt(agg.totals[t.k])}{t.unit}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
const ymdBefore = d => planAddDays(d, -1);
const ymdAfter = d => planAddDays(d, 1);
