import React from "react";
import { C, FONT, card, btn, badge, YMD, fmtDate, WD, parseYMD } from "../shared/ui";
import { isOffDay } from "./holidays";

// 대시보드에서 쓰는 조각들. (컴포넌트를 다른 컴포넌트 안에 두면 입력할 때마다
//  다시 그려지므로 최상위에 둔다)

// 마감이 얼마나 급한지에 따른 색
export const urgency = (n) => {
  if (n == null) return { c: C.faint, bg: C.soft, label: "—" };
  if (n < 0) return { c: C.red, bg: C.redBg, label: `D+${Math.abs(n)} 지남` };
  if (n === 0) return { c: C.red, bg: C.redBg, label: "오늘" };
  if (n <= 3) return { c: C.amber, bg: C.amberBg, label: `D-${n}` };
  return { c: C.muted, bg: C.soft, label: `D-${n}` };
};

export const Panel = ({ title, count, hint, action, children }) => (
  <div style={card({ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" })}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 15px",
      borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: C.title }}>{title}</span>
      {count != null && (
        <span style={{ ...badge(count > 0 ? C.main : C.faint, count > 0 ? C.mainBg : C.soft), fontSize: 10.5 }}>{count}건</span>
      )}
      {hint && <span style={{ fontSize: 10.5, color: C.faint }}>{hint}</span>}
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
    <div style={{ padding: "10px 12px", flex: 1 }}>{children}</div>
  </div>
);

export const Empty = ({ children }) => (
  <div style={{ textAlign: "center", padding: "22px 0", fontSize: 12.5, color: C.faint }}>{children}</div>
);

export const DDay = ({ tone }) => (
  <span style={{ ...badge(tone.c, tone.bg), fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{tone.label}</span>
);

// 한 줄 — 왼쪽 색 막대로 급한 정도를 보여준다
export const Row = ({ onClick, tone, title, sub }) => (
  <div onClick={onClick}
    style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", marginBottom: 5,
      background: C.white, borderRadius: 8, border: `1px solid ${C.line}`,
      borderLeft: `4px solid ${tone.c}`, cursor: onClick ? "pointer" : "default" }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.title,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{sub}</div>}
    </div>
    <DDay tone={tone} />
  </div>
);

// 오늘 날짜 + 정사각형 미니 캘린더
export function MiniCalendar({ today, month, onMonth, hset, markDates, onOpenCalendar }) {
  const { y, m } = month;
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const move = (delta) => { const d = new Date(y, m + delta, 1); onMonth({ y: d.getFullYear(), m: d.getMonth() }); };
  const t = parseYMD(today);

  return (
    <Panel title="오늘"
      action={<button onClick={onOpenCalendar} style={btn("ghost", { padding: "4px 10px", fontSize: 11 })}>날짜 상세보기</button>}>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.main, lineHeight: 1.1 }}>
          {t.getMonth() + 1}월 {t.getDate()}일
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
          {t.getFullYear()}년 · {WD[t.getDay()]}요일{isOffDay(today, hset) ? " · 쉬는 날" : ""}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <button onClick={() => move(-1)} style={btn("ghost", { padding: "2px 9px", fontSize: 13 })}>‹</button>
        <b style={{ fontSize: 12, color: C.text }}>{y}년 {m + 1}월</b>
        <button onClick={() => move(1)} style={btn("ghost", { padding: "2px 9px", fontSize: 13 })}>›</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {[...WD].map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, padding: "2px 0",
            color: i === 0 ? C.red : i === 6 ? C.main : C.faint }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const ds = YMD(d), inMonth = d.getMonth() === m, isToday = ds === today, off = isOffDay(ds, hset);
          return (
            <div key={i} onClick={onOpenCalendar}
              style={{ position: "relative", aspectRatio: "1 / 1", display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: 6, cursor: "pointer",
                fontSize: 11, fontWeight: isToday ? 800 : 500,
                background: isToday ? C.main : "transparent",
                color: isToday ? C.white : !inMonth ? "#d5dae2" : off ? C.red : C.text }}>
              {d.getDate()}
              {markDates.has(ds) && (
                <span style={{ position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: "50%",
                  background: isToday ? C.white : C.sub }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: C.faint, textAlign: "center", marginTop: 7, fontFamily: FONT }}>
        점이 있는 날은 업무관리 일정이 있는 날입니다
      </div>
    </Panel>
  );
}
