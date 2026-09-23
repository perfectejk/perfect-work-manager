import React, { useState, useEffect, useMemo, useRef } from "react";
import { C, FONT, card, btn, badge, YMD, fmtDate, parseYMD } from "../shared/ui";
import { DEFAULT_HOLIDAYS, holidaySet, addBizDays, bizDaysUntil, daysUntil } from "./holidays";
import { ROW_H, GAP, resolveLayout, totalRows, cellFromPoint, hits, mark } from "./layout";
import { urgency, Panel, Empty, Row, MiniCalendar } from "./parts";
import DashboardSettings from "./DashboardSettings";

// ===== 대시보드 (슈퍼관리자 전용) =====
// 업무관리와 작업관리에서 "오늘 챙겨야 할 것"만 모아 보여준다.
// 위젯은 화면 어디에든 자유롭게 놓고 크기를 조절할 수 있으며 wm:dashboard 에 저장된다.
export const WIDGETS = [
  { k: "today", n: "오늘까지 끝낼 업무", desc: "업무관리에서 오늘이 마감이거나 이미 지난 일" },
  { k: "soon", n: "마감 임박 업무 (영업일 D-3)", desc: "주말·공휴일을 뺀 3영업일 안에 마감인 일" },
  { k: "contract", n: "계약 만료 D-7", desc: "진행중인 계약 중 7일 안에 끝나는 업체" },
  { k: "plan", n: "작업 만료 D-3", desc: "주간계획에 세팅된 작업이 3일 안에 끝나는 업체" },
  { k: "calendar", n: "오늘 · 미니 캘린더", desc: "이번 달 달력과 오늘 날짜" },
];
const MAX_COLS = 4;
const DEFAULT_SIZE = { today: 6, soon: 6, contract: 6, plan: 6, calendar: 11 };
// 기본 배치 — 3칸 화면 기준
const DEFAULT_LAYOUT = [
  { k: "today", on: true, x: 0, y: 0, w: 1, h: 6 },
  { k: "soon", on: true, x: 1, y: 0, w: 1, h: 6 },
  { k: "contract", on: true, x: 2, y: 0, w: 1, h: 6 },
  { k: "plan", on: true, x: 0, y: 6, w: 1, h: 6 },
  { k: "calendar", on: true, x: 1, y: 6, w: 1, h: 11 },
];

export default function DashboardTab({ st, today, contracts = [], onOpenWorkManager, onOpenContract, onOpenPlan }) {
  const TD = today || YMD(new Date());
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState({});          // {계약id: 마지막 작업 종료일}
  const [holidays, setHolidays] = useState(DEFAULT_HOLIDAYS);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [ghost, setGhost] = useState(null);        // 옮기거나 크기 바꾸는 중 {k,x,y,w,h,bad}
  const [vw, setVw] = useState(() => window.innerWidth);
  const gridRef = useRef(null);
  const [calMonth, setCalMonth] = useState(() => { const d = parseYMD(TD); return { y: d.getFullYear(), m: d.getMonth() }; });

  const hset = useMemo(() => holidaySet(holidays), [holidays]);
  const cols = vw <= 700 ? 1 : vw <= 1100 ? 2 : vw <= 1700 ? 3 : MAX_COLS;

  // 창 크기가 바뀌면 칸 수를 다시 센다
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, h, l] = await Promise.all([
        st.get("wm:tasks"), st.get("wm:holidays"), st.get("wm:dashboard"),
      ]);
      if (!alive) return;
      setTasks(Array.isArray(t) ? t : []);
      if (Array.isArray(h) && h.length) setHolidays(h);
      if (Array.isArray(l) && l.length) {
        // 예전 배치에는 자리·크기 값이 없을 수 있으므로 기본값을 채운다
        const known = l.filter((x) => WIDGETS.some((w) => w.k === x.k))
          .map((x) => ({ ...x, w: x.w || 1, h: x.h || DEFAULT_SIZE[x.k] || 6 }));
        WIDGETS.forEach((w) => {
          if (!known.some((x) => x.k === w.k)) known.push({ k: w.k, on: true, w: 1, h: DEFAULT_SIZE[w.k] || 6 });
        });
        setLayout(known);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [st]);

  // 진행중인 계약
  const running = useMemo(
    () => contracts.filter((c) => !c.cancelled && !c.earlyDone && String(c.endDate || "") >= TD),
    [contracts, TD]
  );
  // 진행중 계약의 주간계획에서 "마지막 작업 종료일"을 뽑는다
  const runningIds = useMemo(() => running.map((c) => c.id).join(","), [running]);
  useEffect(() => {
    let alive = true;
    if (running.length === 0) { setPlans({}); return; }
    (async () => {
      const got = await Promise.all(running.map(async (c) => {
        const rows = await st.get("traffic:plan:" + c.id);
        if (!Array.isArray(rows) || rows.length === 0) return [c.id, ""];
        const last = rows.map((r) => String(r.end || "")).filter(Boolean).sort().pop() || "";
        return [c.id, last];
      }));
      if (!alive) return;
      const m = {};
      got.forEach(([id, last]) => { if (last) m[id] = last; });
      setPlans(m);
    })();
    return () => { alive = false; };
  }, [st, runningIds]);

  const saveLayout = async (next) => { setLayout(next); await st.set("wm:dashboard", next); };
  const saveHolidays = async (next) => { setHolidays(next); await st.set("wm:holidays", next); };

  // ---- 위젯별 데이터 ----
  const open = useMemo(() => tasks.filter((t) => t && t.status !== "done" && t.date), [tasks]);
  const todayList = useMemo(
    () => open.filter((t) => t.date <= TD).sort((a, b) => a.date.localeCompare(b.date)), [open, TD]);
  const soonCut = useMemo(() => addBizDays(TD, 3, hset), [TD, hset]);
  const soonList = useMemo(
    () => open.filter((t) => t.date > TD && t.date <= soonCut).sort((a, b) => a.date.localeCompare(b.date)),
    [open, TD, soonCut]);
  const contractList = useMemo(
    () => running.filter((c) => { const d = daysUntil(TD, c.endDate); return d != null && d <= 7; })
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate))), [running, TD]);
  const planList = useMemo(
    () => running.map((c) => ({ c, last: plans[c.id] }))
      .filter((x) => { if (!x.last) return false; const d = daysUntil(TD, x.last); return d != null && d <= 3; })
      .sort((a, b) => a.last.localeCompare(b.last)), [running, plans, TD]);
  // 날짜별 일정 (완료된 것도 호버창에는 보여준다)
  const tasksByDate = useMemo(() => {
    const m = new Map();
    tasks.filter((t) => t && t.date).forEach((t) => {
      if (!m.has(t.date)) m.set(t.date, []);
      m.get(t.date).push({ title: t.title, done: t.status === "done" });
    });
    return m;
  }, [tasks]);

  const goWm = (sub) => () => onOpenWorkManager && onOpenWorkManager(sub);
  const setOn = (k, on) => saveLayout(layout.map((x) => (x.k === k ? { ...x, on } : x)));
  const commit = (k, patch) => saveLayout(layout.map((x) => (x.k === k ? { ...x, ...patch } : x)));

  // ---- 실제로 그릴 자리 ----
  const shownRaw = useMemo(() => layout.filter((x) => x.on), [layout]);
  const placed = useMemo(() => resolveLayout(shownRaw, cols), [shownRaw, cols]);
  const hidden = layout.filter((x) => !x.on);
  const rowsTotal = totalRows(placed, editMode ? 8 : 0);

  // 그 자리에 놓을 수 있는지 (자기 자신은 빼고 본다)
  const canPlace = (k, x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > cols) return false;
    const occ = new Set();
    placed.forEach((p) => { if (p.k !== k) mark(occ, p.x, p.y, p.w, p.h); });
    return !hits(occ, x, y, w, h);
  };

  // ---- 카드 옮기기 (자유 배치) ----
  const startMove = (e, p) => {
    if (!editMode || e.button !== 0) return;
    e.preventDefault();
    const grid = gridRef.current;
    if (!grid) return;
    const start = cellFromPoint(grid, e.clientX, e.clientY, cols);
    const offX = start.x - p.x, offY = start.y - p.y;
    let last = { x: p.x, y: p.y };
    setGhost({ k: p.k, x: p.x, y: p.y, w: p.w, h: p.h, bad: false });

    const onMove = (ev) => {
      const c = cellFromPoint(grid, ev.clientX, ev.clientY, cols);
      const x = Math.max(0, Math.min(cols - p.w, c.x - offX));
      const y = Math.max(0, c.y - offY);
      last = { x, y };
      setGhost({ k: p.k, x, y, w: p.w, h: p.h, bad: !canPlace(p.k, x, y, p.w, p.h) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setGhost(null);
      if ((last.x !== p.x || last.y !== p.y) && canPlace(p.k, last.x, last.y, p.w, p.h)) {
        commit(p.k, { x: last.x, y: last.y });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ---- 크기 조절 (오른쪽 아래 모서리) ----
  const startResize = (e, p) => {
    if (!editMode || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;
    const cellW = (grid.clientWidth - GAP * (cols - 1)) / cols;
    const sx = e.clientX, sy = e.clientY;
    let last = { w: p.w, h: p.h };
    setGhost({ k: p.k, x: p.x, y: p.y, w: p.w, h: p.h, bad: false });

    const onMove = (ev) => {
      const w = Math.max(1, Math.min(cols - p.x, p.w + Math.round((ev.clientX - sx) / (cellW + GAP))));
      const h = Math.max(3, Math.min(40, p.h + Math.round((ev.clientY - sy) / (ROW_H + GAP))));
      last = { w, h };
      setGhost({ k: p.k, x: p.x, y: p.y, w, h, bad: !canPlace(p.k, p.x, p.y, w, h) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setGhost(null);
      if ((last.w !== p.w || last.h !== p.h) && canPlace(p.k, p.x, p.y, last.w, last.h)) {
        commit(p.k, { w: last.w, h: last.h });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const widgetBody = (k) => {
    if (k === "today") return (
      <Panel title="오늘까지 끝낼 업무" count={todayList.length}
        action={<button onClick={goWm("list")} style={btn("ghost", { padding: "4px 10px", fontSize: 11 })}>업무관리 열기</button>}>
        {todayList.length === 0 ? <Empty>오늘 마감인 업무가 없습니다</Empty> : todayList.map((t) => (
          <Row key={t.id} tone={urgency(daysUntil(TD, t.date))} onClick={goWm("list")}
            title={t.title} sub={fmtDate(t.date) + (t.time ? " " + t.time : "")} />
        ))}
      </Panel>
    );
    if (k === "soon") return (
      <Panel title="마감 임박 업무" count={soonList.length} hint={`영업일 3일 · ~${fmtDate(soonCut)}`}
        action={<button onClick={goWm("list")} style={btn("ghost", { padding: "4px 10px", fontSize: 11 })}>업무관리 열기</button>}>
        {soonList.length === 0 ? <Empty>3영업일 안에 마감인 업무가 없습니다</Empty> : soonList.map((t) => (
          <Row key={t.id} tone={urgency(bizDaysUntil(TD, t.date, hset))} onClick={goWm("list")}
            title={t.title} sub={fmtDate(t.date) + (t.time ? " " + t.time : "")} />
        ))}
      </Panel>
    );
    if (k === "contract") return (
      <Panel title="계약 만료 D-7" count={contractList.length} hint="진행중 계약">
        {contractList.length === 0 ? <Empty>7일 안에 끝나는 계약이 없습니다</Empty> : contractList.map((c) => (
          <Row key={c.id} tone={urgency(daysUntil(TD, c.endDate))} onClick={() => onOpenContract && onOpenContract(c.id)}
            title={c.name} sub={`${c.startDate} ~ ${c.endDate}${c.manager ? " · " + c.manager : ""}`} />
        ))}
      </Panel>
    );
    if (k === "plan") return (
      <Panel title="작업 만료 D-3" count={planList.length} hint="주간계획 마지막 주차 기준">
        {planList.length === 0 ? <Empty>3일 안에 작업이 끝나는 업체가 없습니다</Empty> : planList.map(({ c, last }) => (
          <Row key={c.id} tone={urgency(daysUntil(TD, last))} onClick={() => onOpenPlan && onOpenPlan(c.id)}
            title={c.name} sub={`작업 종료 ${last}${c.endDate ? " · 계약 ~" + c.endDate : ""}`} />
        ))}
      </Panel>
    );
    if (k === "calendar") return (
      <MiniCalendar today={TD} month={calMonth} onMonth={setCalMonth} hset={hset}
        tasksByDate={tasksByDate} onOpenCalendar={goWm("cal")} />
    );
    return null;
  };

  if (loading) return <div style={card({ padding: "60px 20px", textAlign: "center", color: C.faint, fontSize: 13 })}>불러오는 중…</div>;

  const urgent = todayList.length + contractList.length + planList.length;

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.title }}>오늘 챙길 것</span>
        <span style={{ ...badge(urgent > 0 ? C.red : C.greenDeep, urgent > 0 ? C.redBg : C.greenBg), fontSize: 11 }}>
          {urgent > 0 ? `급한 일 ${urgent}건` : "급한 일 없음"}
        </span>
        <div style={{ flex: 1 }} />
        {editMode && (<>
          <button onClick={() => {
            if (!window.confirm("위젯 배치와 크기를 처음 상태로 되돌릴까요?")) return;
            saveLayout(DEFAULT_LAYOUT.map((x) => ({ ...x })));
          }} style={btn("ghost", { padding: "7px 13px", fontSize: 12 })}>기본 배치로</button>
          <button onClick={() => setShowSettings(true)} style={btn("ghost", { padding: "7px 13px", fontSize: 12 })}>공휴일 설정</button>
        </>)}
        <button onClick={() => setEditMode((v) => !v)}
          style={btn(editMode ? "primary" : "ghost", { padding: "7px 13px", fontSize: 12 })}>
          {editMode ? "편집 끝내기" : "위젯 편집"}
        </button>
      </div>

      {editMode && (
        <div style={{ background: C.mainBg, border: "1px solid #bfd7f5", borderRadius: 10,
          padding: "10px 13px", fontSize: 11.5, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
          카드를 <b>끌어서 원하는 칸</b>에 놓으세요. 가운데를 비워 두고 오른쪽 아래에만 두는 것도 됩니다.<br />
          카드 <b>오른쪽 아래 모서리</b>를 끌면 가로·세로 크기가 함께 바뀝니다 (정사각형도 가능).
          다른 카드와 겹치는 자리는 <b style={{ color: C.red }}>빨갛게</b> 표시되고 놓이지 않습니다.
          <b>✕</b> 로 숨기고, 숨긴 위젯은 아래에서 다시 꺼냅니다. 바뀐 배치는 바로 저장됩니다.
        </div>
      )}

      {placed.length === 0 ? (
        <div style={card({ padding: "50px 20px", textAlign: "center", color: C.faint, fontSize: 13 })}>
          표시할 위젯이 없습니다. 오른쪽 위 [위젯 편집]에서 꺼내 주세요.
        </div>
      ) : (
        <div ref={gridRef} style={{ display: "grid", gap: GAP, position: "relative",
          gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
          gridTemplateRows: `repeat(${rowsTotal},${ROW_H}px)` }}>

          {/* 편집 중에는 놓을 수 있는 칸을 옅게 보여 준다 */}
          {editMode && Array.from({ length: cols * rowsTotal }, (_, i) => (
            <div key={"c" + i} style={{ gridColumn: (i % cols) + 1, gridRow: Math.floor(i / cols) + 1,
              border: `1px dashed ${C.line}`, borderRadius: 4, pointerEvents: "none" }} />
          ))}

          {/* 옮기거나 크기를 바꾸는 중일 때 놓일 자리 */}
          {ghost && (
            <div style={{ gridColumn: `${ghost.x + 1} / span ${ghost.w}`, gridRow: `${ghost.y + 1} / span ${ghost.h}`,
              borderRadius: 14, pointerEvents: "none", zIndex: 1,
              border: `2px dashed ${ghost.bad ? C.red : C.main}`,
              background: ghost.bad ? C.redBg : C.mainBg }} />
          )}

          {placed.map((p) => {
            const isGhost = ghost && ghost.k === p.k;
            const g = isGhost ? ghost : p;
            return (
              <div key={p.k}
                onMouseDown={(e) => startMove(e, p)}
                style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}`,
                  position: "relative", borderRadius: 14, minHeight: 0, zIndex: isGhost ? 3 : 2,
                  cursor: editMode ? "grab" : "default", opacity: isGhost ? 0.55 : 1,
                  display: "flex", flexDirection: "column" }}>
                {editMode && (
                  <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5, display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ ...badge(C.muted, C.soft), fontSize: 10 }}>
                      {isGhost ? `${g.w}칸 × ${g.h}` : "끌어서 이동"}
                    </span>
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setOn(p.k, false)} title="숨기기"
                      style={{ border: `1px solid ${C.line}`, background: C.white, borderRadius: 6, width: 20, height: 20,
                        cursor: "pointer", color: C.faint, fontSize: 11, lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                )}
                {/* 편집 중에는 카드 안을 클릭해도 반응하지 않게 덮어 둔다 */}
                {editMode && <div style={{ position: "absolute", inset: 0, zIndex: 4, borderRadius: 14 }} />}
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{widgetBody(p.k)}</div>

                {/* 오른쪽 아래 모서리 — 끌어서 가로·세로 조절 */}
                {editMode && (
                  <div onMouseDown={(e) => startResize(e, p)} title="끌어서 크기 조절"
                    style={{ position: "absolute", right: 2, bottom: 2, width: 18, height: 18, zIndex: 6,
                      cursor: "nwse-resize", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: "block" }}>
                      <path d="M13 5 L5 13 M13 9 L9 13" stroke={C.main} strokeWidth="1.6" strokeLinecap="round" fill="none" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editMode && hidden.length > 0 && (
        <div style={card({ padding: "12px 14px", marginTop: 12 })}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 8 }}>숨긴 위젯</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {hidden.map((x) => {
              const w = WIDGETS.find((y) => y.k === x.k) || { n: x.k };
              return (
                <button key={x.k} onClick={() => setOn(x.k, true)}
                  style={btn("ghost", { padding: "6px 12px", fontSize: 11.5 })}>+ {w.n}</button>
              );
            })}
          </div>
        </div>
      )}

      {showSettings && (
        <DashboardSettings holidays={holidays} onSaveHolidays={saveHolidays} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
