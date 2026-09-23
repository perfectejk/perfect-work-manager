import React, { useState, useEffect, useMemo } from "react";
import { C, FONT, card, btn, badge, YMD, fmtDate, parseYMD } from "../shared/ui";
import { DEFAULT_HOLIDAYS, holidaySet, addBizDays, bizDaysUntil, daysUntil } from "./holidays";
import { urgency, Panel, Empty, Row, MiniCalendar } from "./parts";
import DashboardSettings from "./DashboardSettings";

// ===== 대시보드 (슈퍼관리자 전용) =====
// 업무관리와 작업관리에서 "오늘 챙겨야 할 것"만 모아 보여준다.
// 어떤 위젯을 볼지·순서는 화면에서 직접 바꿀 수 있고 wm:dashboard 에 저장된다.
export const WIDGETS = [
  { k: "today", n: "오늘까지 끝낼 업무", desc: "업무관리에서 오늘이 마감이거나 이미 지난 일" },
  { k: "soon", n: "마감 임박 업무 (영업일 D-3)", desc: "주말·공휴일을 뺀 3영업일 안에 마감인 일" },
  { k: "contract", n: "계약 만료 D-7", desc: "진행중인 계약 중 7일 안에 끝나는 업체" },
  { k: "plan", n: "작업 만료 D-3", desc: "주간계획에 세팅된 작업이 3일 안에 끝나는 업체" },
  { k: "calendar", n: "오늘 · 미니 캘린더", desc: "이번 달 달력과 오늘 날짜" },
];
const DEFAULT_LAYOUT = WIDGETS.map((w) => ({ k: w.k, on: true }));

export default function DashboardTab({ st, today, contracts = [], onOpenWorkManager, onOpenContract, onOpenPlan }) {
  const TD = today || YMD(new Date());
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState({});          // {계약id: 마지막 작업 종료일}
  const [holidays, setHolidays] = useState(DEFAULT_HOLIDAYS);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [showSettings, setShowSettings] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = parseYMD(TD); return { y: d.getFullYear(), m: d.getMonth() }; });

  const hset = useMemo(() => holidaySet(holidays), [holidays]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, h, l] = await Promise.all([
        st.get("wm:tasks"), st.get("wm:holidays"), st.get("wm:dashboard"),
      ]);
      if (!alive) return;
      setTasks(Array.isArray(t) ? t : []);
      if (Array.isArray(h) && h.length) setHolidays(h);
      // 저장된 배치에 없는 위젯은 뒤에 붙여 준다 (나중에 위젯이 늘어도 안전)
      if (Array.isArray(l) && l.length) {
        const known = l.filter((x) => WIDGETS.some((w) => w.k === x.k));
        WIDGETS.forEach((w) => { if (!known.some((x) => x.k === w.k)) known.push({ k: w.k, on: true }); });
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
    () => open.filter((t) => t.date <= TD).sort((a, b) => a.date.localeCompare(b.date)),
    [open, TD]
  );
  const soonCut = useMemo(() => addBizDays(TD, 3, hset), [TD, hset]);
  const soonList = useMemo(
    () => open.filter((t) => t.date > TD && t.date <= soonCut).sort((a, b) => a.date.localeCompare(b.date)),
    [open, TD, soonCut]
  );
  const contractList = useMemo(
    () => running.filter((c) => { const d = daysUntil(TD, c.endDate); return d != null && d <= 7; })
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate))),
    [running, TD]
  );
  const planList = useMemo(
    () => running.map((c) => ({ c, last: plans[c.id] }))
      .filter((x) => { if (!x.last) return false; const d = daysUntil(TD, x.last); return d != null && d <= 3; })
      .sort((a, b) => a.last.localeCompare(b.last)),
    [running, plans, TD]
  );
  const markDates = useMemo(() => new Set(open.map((t) => t.date)), [open]);

  const goWm = (sub) => () => onOpenWorkManager && onOpenWorkManager(sub);

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
          <Row key={c.id} tone={urgency(daysUntil(TD, c.endDate))}
            onClick={() => onOpenContract && onOpenContract(c.id)}
            title={c.name} sub={`${c.startDate} ~ ${c.endDate}${c.manager ? " · " + c.manager : ""}`} />
        ))}
      </Panel>
    );
    if (k === "plan") return (
      <Panel title="작업 만료 D-3" count={planList.length} hint="주간계획 마지막 주차 기준">
        {planList.length === 0 ? <Empty>3일 안에 작업이 끝나는 업체가 없습니다</Empty> : planList.map(({ c, last }) => (
          <Row key={c.id} tone={urgency(daysUntil(TD, last))}
            onClick={() => onOpenPlan && onOpenPlan(c.id)}
            title={c.name} sub={`작업 종료 ${last}${c.endDate ? " · 계약 ~" + c.endDate : ""}`} />
        ))}
      </Panel>
    );
    if (k === "calendar") return (
      <MiniCalendar today={TD} month={calMonth} onMonth={setCalMonth} hset={hset}
        markDates={markDates} onOpenCalendar={goWm("cal")} />
    );
    return null;
  };

  if (loading) return <div style={card({ padding: "60px 20px", textAlign: "center", color: C.faint, fontSize: 13 })}>불러오는 중…</div>;

  const shown = layout.filter((x) => x.on);
  const urgent = todayList.length + contractList.length + planList.length;

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.title }}>오늘 챙길 것</span>
        <span style={{ ...badge(urgent > 0 ? C.red : C.greenDeep, urgent > 0 ? C.redBg : C.greenBg), fontSize: 11 }}>
          {urgent > 0 ? `급한 일 ${urgent}건` : "급한 일 없음"}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowSettings(true)} style={btn("ghost", { padding: "7px 13px", fontSize: 12 })}>위젯 편집</button>
      </div>

      {shown.length === 0 ? (
        <div style={card({ padding: "50px 20px", textAlign: "center", color: C.faint, fontSize: 13 })}>
          표시할 위젯이 없습니다. 오른쪽 위 [위젯 편집]에서 켜주세요.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12,
          gridTemplateColumns: window.innerWidth <= 900 ? "1fr" : "repeat(auto-fit,minmax(320px,1fr))",
          alignItems: "start" }}>
          {shown.map((x) => <div key={x.k}>{widgetBody(x.k)}</div>)}
        </div>
      )}

      {showSettings && (
        <DashboardSettings layout={layout} holidays={holidays}
          onSaveLayout={saveLayout} onSaveHolidays={saveHolidays} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
