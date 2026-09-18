import React, { useState, useEffect, useMemo, useCallback } from "react";
import QuickAddBar from "../shared/QuickAddBar";
import SidePanel from "../shared/SidePanel";
import { C, FONT, card, btn, badge, subTabBar, subTabBtn, YMD, addDays, fmtDate, uid, WD } from "../shared/ui";
import { K, STATUS, loadAll } from "./store";
import TaskPanel from "./TaskPanel";
import TypesModal from "./TypesModal";

// ===== 업무관리 탭 (슈퍼관리자 전용) =====
// 1단계 자료 제작 → 2단계 교육 과정 운영.
// 모든 데이터는 wm: 접두어로만 저장하며, 기존 PRO 데이터는 읽지도 쓰지도 않는다.
const SUB_TABS = [
  { id: "list", label: "오늘·이번 주" },
  { id: "board", label: "자료 제작 보드" },
  { id: "cal", label: "캘린더" },
];

export default function WorkManagerTab({ st, today }) {
  const TD = today || YMD(new Date());
  const [sub, setSub] = useState("list");
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showTypes, setShowTypes] = useState(false);
  const [side, setSide] = useState(null);           // {kind:"task", id}
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(TD + "T00:00:00"); return { y: d.getFullYear(), m: d.getMonth() }; });

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await loadAll(st);
      if (!alive) return;
      setTypes(d.types); setTasks(d.tasks); setLoading(false);
    })();
    return () => { alive = false; };
  }, [st]);

  const typeOf = useCallback(
    (k) => types.find((t) => t.k === k) || types.find((t) => t.k === "etc") || { k: "etc", n: "기타", c: C.muted },
    [types]
  );

  // ---- 저장 (화면 상태를 먼저 바꾸고 Firestore에 기록) ----
  const saveTasks = async (next) => { setTasks(next); await st.set(K.tasks, next); };
  const saveTypes = async (next) => { setTypes(next); await st.set(K.types, next); };

  const addTask = async (p) => {
    const t = {
      id: uid(), title: p.title, type: p.cat || "etc", date: p.date, time: p.time || "",
      status: "todo", desc: "", subs: [], links: [], createdAt: TD,
    };
    await saveTasks([...tasks, t]);
    setSide({ kind: "task", id: t.id });
  };
  const patchTask = async (id, patch) => saveTasks(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const deleteTask = async (t) => {
    if (!window.confirm(`"${t.title}" 작업을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await saveTasks(tasks.filter((x) => x.id !== t.id));
    setSide(null);
  };
  const cycleStatus = async (t) => patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });

  // ---- 화면에 뿌릴 공통 항목 목록 ----
  const items = useMemo(
    () => tasks.map((t) => ({
      kind: "task", id: t.id, title: t.title, color: typeOf(t.type).c,
      date: t.date, time: t.time, done: t.status === "done",
      statusLabel: (STATUS.find((s) => s[0] === t.status) || STATUS[0])[1],
    })).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))),
    [tasks, typeOf]
  );

  const openSide = (kind, id) => setSide({ kind, id });
  const selTask = side?.kind === "task" ? tasks.find((t) => t.id === side.id) : null;
  useEffect(() => { if (side?.kind === "task" && !selTask) setSide(null); }, [side, selTask]);

  // ---- 항목 한 줄 ----
  const Row = ({ it }) => {
    const on = side?.kind === it.kind && side?.id === it.id;
    return (
      <div onClick={() => openSide(it.kind, it.id)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 6, cursor: "pointer",
          background: C.white, border: `1px solid ${on ? C.main : C.line}`, borderRadius: 9,
          boxShadow: on ? `0 0 0 2px ${C.mainBg}` : "none", opacity: it.done ? 0.65 : 1 }}>
        <button onClick={(e) => { e.stopPropagation(); cycleStatus(tasks.find((t) => t.id === it.id)); }}
          style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer",
            border: `2px solid ${it.done ? C.green : "#c5cdd8"}`, background: it.done ? C.green : C.white,
            color: C.white, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{it.done ? "✓" : ""}</button>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: it.done ? C.faint : C.title,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textDecoration: it.done ? "line-through" : "none" }}>{it.title}</span>
        <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{fmtDate(it.date)}{it.time ? " " + it.time : ""}</span>
        <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{it.statusLabel}</span>
      </div>
    );
  };

  // ---- 오늘·이번 주 ----
  const listView = () => {
    const weekEnd = addDays(TD, (7 - new Date(TD + "T00:00:00").getDay()) % 7);
    const g = { late: [], today: [], week: [], later: [], done: [] };
    items.forEach((i) => {
      if (i.done) g.done.push(i);
      else if (i.date < TD) g.late.push(i);
      else if (i.date === TD) g.today.push(i);
      else if (i.date <= weekEnd) g.week.push(i);
      else g.later.push(i);
    });
    g.done = g.done.slice(-5).reverse();
    const sec = (k, title, danger) => g[k].length ? (
      <div key={k} style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, fontSize: 12,
          fontWeight: 700, color: danger ? C.red : C.muted }}>
          {title}<span style={{ ...badge(C.muted, C.soft), fontSize: 10.5 }}>{g[k].length}</span>
        </div>
        {g[k].map((i) => <Row key={i.kind + i.id} it={i} />)}
      </div>
    ) : null;
    const any = Object.values(g).some((x) => x.length);
    if (!any) return <div style={{ textAlign: "center", padding: "44px 0", color: C.faint, fontSize: 13 }}>작업이 없습니다. 위 입력창에 한 줄로 적어보세요.</div>;
    return <>{sec("late", "지연됨", true)}{sec("today", "오늘")}{sec("week", "이번 주")}{sec("later", "예정")}{sec("done", "최근 완료")}</>;
  };

  // ---- 자료 제작 보드 (드래그로 단계 이동) ----
  const [dragOver, setDragOver] = useState("");
  const boardView = () => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: window.innerWidth <= 760 ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        {STATUS.map(([k, n]) => {
          const list = tasks.filter((t) => t.status === k).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
          return (
            <div key={k}
              onDragOver={(e) => { e.preventDefault(); setDragOver(k); }}
              onDragLeave={() => setDragOver("")}
              onDrop={(e) => { e.preventDefault(); setDragOver(""); const id = e.dataTransfer.getData("id"); if (id) patchTask(id, { status: k }); }}
              style={{ background: C.soft, borderRadius: 10, padding: 10, minHeight: 260,
                outline: dragOver === k ? `2px dashed ${C.main}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                <span>{n}</span><span style={{ color: C.faint, fontWeight: 600 }}>{list.length}</span>
              </div>
              {list.map((t) => (
                <div key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData("id", t.id)}
                  onClick={() => openSide("task", t.id)}
                  style={{ background: C.white, borderRadius: 8, padding: 9, marginBottom: 7, cursor: "pointer",
                    borderLeft: `4px solid ${typeOf(t.type).c}`, border: `1px solid ${C.line}`,
                    borderLeftWidth: 4, borderLeftColor: typeOf(t.type).c }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 4, color: C.title }}>{t.title}</div>
                  <div style={{ fontSize: 10.5, color: C.faint }}>
                    {fmtDate(t.date)} · {typeOf(t.type).n}
                    {(t.subs || []).length ? ` · 하위 ${t.subs.filter((x) => x.d).length}/${t.subs.length}` : ""}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: C.faint, marginTop: 10 }}>카드를 끌어서 단계를 옮기고, 클릭하면 오른쪽에 상세가 열립니다.</p>
    </>
  );

  // ---- 캘린더 ----
  const calView = () => {
    const { y, m } = calMonth;
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const move = (delta) => { const d = new Date(y, m + delta, 1); setCalMonth({ y: d.getFullYear(), m: d.getMonth() }); };
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => move(-1)} style={btn("ghost", { padding: "5px 12px", fontSize: 15 })}>‹</button>
          <b style={{ fontSize: 14, color: C.title }}>{y}년 {m + 1}월</b>
          <button onClick={() => move(1)} style={btn("ghost", { padding: "5px 12px", fontSize: 15 })}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {[...WD].map((d, i) => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, padding: "4px 0",
              color: i === 0 ? C.red : i === 6 ? C.main : C.faint }}>{d}</div>
          ))}
          {cells.map((d, i) => {
            const ds = YMD(d), inMonth = d.getMonth() === m, isToday = ds === TD;
            const evs = items.filter((x) => x.date === ds);
            return (
              <div key={i} style={{ minHeight: 86, padding: 4, borderRadius: 6, boxSizing: "border-box",
                background: inMonth ? C.white : "#fafbfc", border: `1px solid ${isToday ? "#93c5fd" : C.line}`, overflow: "hidden" }}>
                <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 500, marginBottom: 2, textAlign: "center",
                  color: !inMonth ? "#b5bdc9" : isToday ? C.main : C.text }}>
                  {isToday
                    ? <span style={{ background: C.main, color: C.white, borderRadius: "50%", width: 17, height: 17, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5 }}>{d.getDate()}</span>
                    : d.getDate()}
                </div>
                {evs.slice(0, 3).map((e) => (
                  <div key={e.kind + e.id} onClick={() => openSide(e.kind, e.id)} title={e.title}
                    style={{ fontSize: 9, padding: "1px 3px", borderRadius: 3, marginBottom: 1, cursor: "pointer",
                      background: e.color, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      opacity: e.done ? 0.45 : 1, textDecoration: e.done ? "line-through" : "none" }}>
                    {e.time ? e.time + " " : ""}{e.title}
                  </div>
                ))}
                {evs.length > 3 && <div style={{ fontSize: 8, color: C.faint, textAlign: "center", fontWeight: 600 }}>+{evs.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  if (loading) return <div style={card({ padding: "60px 20px", textAlign: "center", color: C.faint, fontSize: 13 })}>불러오는 중…</div>;

  return (
    <div style={{ fontFamily: FONT }}>
      <QuickAddBar cats={types} fallback="etc" today={TD} onAdd={addTask}
        placeholder="한 줄로 입력하세요.  예) 내일 오후 3시 교육 운영안 보고 #보고" />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ ...subTabBar, marginBottom: 0, flex: 1, minWidth: 260 }}>
          {SUB_TABS.map((t) => (
            <button key={t.id} onClick={() => setSub(t.id)} style={subTabBtn(sub === t.id)}>{t.label}</button>
          ))}
        </div>
        <button onClick={() => setShowTypes(true)} style={btn("ghost", { padding: "8px 14px", fontSize: 12 })}>유형 관리</button>
      </div>

      <div style={card({ padding: 16 })}>
        {sub === "list" && listView()}
        {sub === "board" && boardView()}
        {sub === "cal" && calView()}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.faint, marginTop: 12 }}>
        {types.map((t) => (
          <span key={t.k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: t.c, display: "inline-block" }} />{t.n}
          </span>
        ))}
      </div>

      <SidePanel open={!!selTask} kind="작업 상세" onClose={() => setSide(null)}>
        <TaskPanel task={selTask} types={types} onPatch={patchTask} onDelete={deleteTask} />
      </SidePanel>

      {showTypes && <TypesModal types={types} tasks={tasks} onSave={saveTypes} onClose={() => setShowTypes(false)} />}
    </div>
  );
}
