import React, { useState, useEffect, useMemo, useCallback } from "react";
import QuickAddBar from "../shared/QuickAddBar";
import SidePanel from "../shared/SidePanel";
import { C, FONT, card, btn, badge, inputSm, th, td, subTabBar, subTabBtn, YMD, addDays, fmtDate, uid, WD } from "../shared/ui";
import { K, STATUS, loadAll } from "./store";
import TaskPanel from "./TaskPanel";
import TypesModal from "./TypesModal";
import ScriptPanel from "./ScriptPanel";
import AddScriptModal from "./AddScriptModal";
import ProgramModal from "./ProgramModal";
import ProgramPanel from "./ProgramPanel";
import SessionPanel from "./SessionPanel";
import { blankSession, genDates, ruleLabel } from "./recur";
import { saveSessionsOf, removeSessionsOf, SESSION_STATUS, EDU_COLOR, CONTRACT_TYPE, subTypesOf, withSubTypes, reportLabel } from "./store";
import { contractOptions, findSubTypes, parseMention, searchRunningCompanies } from "./contractMatch";
import { extractReportTargets } from "./reportTarget";
import ImportModal from "./ImportModal";

// ===== 업무관리 탭 (슈퍼관리자 전용) =====
// 1단계 자료 제작 → 2단계 교육 과정 운영.
// 모든 데이터는 wm: 접두어로만 저장하며, 기존 PRO 데이터는 읽지도 쓰지도 않는다.
const SUB_TABS = [
  { id: "list", label: "오늘·이번 주" },
  { id: "board", label: "진행 현황" },
  { id: "biz", label: "계약업체 일정" },
  { id: "edu", label: "교육 과정" },
  { id: "lib", label: "스크립트 목록" },
  { id: "cal", label: "캘린더" },
];

export default function WorkManagerTab({ st, today, contracts = [], onOpenContract }) {
  const TD = today || YMD(new Date());
  const [sub, setSub] = useState("list");
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [people, setPeople] = useState([]);
  const [libQuery, setLibQuery] = useState("");
  const [subTypes, setSubTypes] = useState([]);
  const [reportTargets, setReportTargets] = useState([]);
  const [pendingPick, setPendingPick] = useState(null);   // {parsed, info, candidates}
  const [bizSub, setBizSub] = useState("all");
  const [bizDone, setBizDone] = useState("open");
  const [calDay, setCalDay] = useState("");   // 캘린더에서 고른 날짜
  const [showTypes, setShowTypes] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [showProgram, setShowProgram] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [side, setSide] = useState(null);           // {kind:"task", id}
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(TD + "T00:00:00"); return { y: d.getFullYear(), m: d.getMonth() }; });

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await loadAll(st);
      if (!alive) return;
      setTypes(d.types); setTasks(d.tasks); setScripts(d.scripts);
      setPrograms(d.programs); setSessions(d.sessions); setPeople(d.people);
      setSubTypes(d.subTypes); setReportTargets(d.reportTargets);
      setLoading(false);
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
  const saveSubTypes = async (next) => { setSubTypes(next); await st.set(K.subTypes, next); };
  const saveReportTargets = async (next) => { setReportTargets(next); await st.set(K.reportTargets, next); };
  const reportName = useCallback((k) => reportLabel(reportTargets.find((x) => x.k === k)), [reportTargets]);
  const subTypeName = useCallback((k) => (subTypes.find((x) => x.k === k) || {}).n || "", [subTypes]);
  const contractName = useCallback((id) => (contracts.find((c) => c.id === id) || {}).name || "", [contracts]);
  const saveScripts = async (next) => { setScripts(next); await st.set(K.scripts, next); };

  // ---- 스크립트 ----
  const scriptCats = useMemo(() => [...new Set(scripts.map((s) => s.cat).filter(Boolean))], [scripts]);
  const addScript = async (name, cat) => {
    const n = String(name || "").trim();
    if (!n) return;
    const sc = { id: uid(), name: n, cat: String(cat || "").trim() || "미분류", memo: "" };
    await saveScripts([...scripts, sc]);
    setSide({ kind: "script", id: sc.id });
  };
  const patchScript = async (id, patch) => saveScripts(scripts.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const deleteScript = async (sc) => {
    if (scriptStats(sc.id).sessions.length > 0) return;
    if (!window.confirm(`스크립트 "${sc.name}"을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await saveScripts(scripts.filter((x) => x.id !== sc.id));
    setSide(null);
  };

  // ---- 사람 목록 ----
  const savePeople = async (next) => { setPeople(next); await st.set(K.people, next); };
  const addPerson = async (n) => { if (!n || people.includes(n)) return; await savePeople([...people, n]); };

  // ---- 교육 과정 ----
  const savePrograms = async (next) => { setPrograms(next); await st.set(K.programs, next); };
  // 회차는 과정별 문서에 저장한다
  const saveSessions = async (next, pid) => { setSessions(next); await saveSessionsOf(st, pid, next); };

  const createProgram = async ({ name, target, members, rule, start, time, dates }) => {
    const id = uid();
    const prog = { id, name, target, members, rule, start, time, createdAt: TD };
    const made = dates.map((d) => blankSession(uid(), id, d, time, members));
    await savePrograms([...programs, prog]);
    await saveSessions([...sessions, ...made], id);
    setSub("edu");
    setSide({ kind: "program", id });
  };

  const patchProgram = async (id, patch) => {
    await savePrograms(programs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    // 명단 변경은 앞으로의 회차(예정)에만 반영하고,
    // 이미 끝난 회차의 기록은 그대로 보존한다.
    if (patch.members) {
      const ms = patch.members;
      const ns = sessions.map((sx) => {
        if (String(sx.pid) !== String(id) || sx.status !== "plan") return sx;
        const attend = { ...(sx.attend || {}) };
        ms.forEach((m) => { if (!(m in attend)) attend[m] = false; });
        Object.keys(attend).forEach((m) => { if (!ms.includes(m) && !attend[m]) delete attend[m]; });
        return { ...sx, attend };
      });
      await saveSessions(ns, id);
    }
  };

  const deleteProgram = async (prog) => {
    if (!window.confirm("교육 과정 \"" + prog.name + "\"을 삭제할까요? 이 과정의 회차 기록도 함께 사라집니다. 되돌릴 수 없습니다.")) return;
    await savePrograms(programs.filter((x) => x.id !== prog.id));
    setSessions(sessions.filter((sx) => String(sx.pid) !== String(prog.id)));
    await removeSessionsOf(st, prog.id);
    setSide(null);
  };

  const patchSession = async (id, patch) => {
    const target = sessions.find((sx) => sx.id === id);
    if (!target) return;
    await saveSessions(sessions.map((sx) => (sx.id === id ? { ...sx, ...patch } : sx)), target.pid);
  };

  // 다음 회차 한 건 추가 — 마지막 회차 날짜에서 주기만큼 뒤로
  const addSession = async (pid) => {
    const prog = programs.find((x) => x.id === pid);
    if (!prog) return;
    const list = sessionsOfProgram(pid);
    const from = list.length ? list[list.length - 1].date : prog.start;
    const next = genDates(from, prog.rule, 2)[1] || addDays(from, 7);
    const sess = blankSession(uid(), pid, next, prog.time, prog.members);
    await saveSessions([...sessions, sess], pid);
    setSide({ kind: "session", id: sess.id });
  };

  const progName = useCallback((pid) => (programs.find((p) => String(p.id) === String(pid)) || {}).name || "(삭제된 과정)", [programs]);
  const sessionsOfProgram = useCallback(
    (pid) => sessions.filter((s) => String(s.pid) === String(pid)).sort((a, b) => a.date.localeCompare(b.date)),
    [sessions]
  );
  // 회차 번호 — 취소된 회차는 세지 않는다
  const roundOf = useCallback((sess) => {
    const list = sessionsOfProgram(sess.pid).filter((x) => x.status !== "skip");
    const i = list.findIndex((x) => x.id === sess.id);
    return i < 0 ? "-" : i + 1;
  }, [sessionsOfProgram]);

  // 스크립트별 자동 집계 — 교육 횟수 / 마지막 교육일 / 이수 인원 / 미이수자
  const allMembers = useMemo(() => [...new Set(programs.flatMap((p) => p.members || []))], [programs]);
  const scriptStats = useCallback((sid) => {
    const done = sessions
      .filter((s) => s.status === "done" && (s.scripts || []).includes(sid))
      .sort((a, b) => b.date.localeCompare(a.date));
    const learned = new Set();
    done.forEach((s) => Object.entries(s.attend || {}).forEach(([n, v]) => { if (v) learned.add(n); }));
    return {
      sessions: done.map((s) => ({
        id: s.id, date: s.date, progName: progName(s.pid), round: roundOf(s),
        attended: Object.values(s.attend || {}).filter(Boolean).length,
      })),
      people: [...learned],
      lastDate: done.length ? done[0].date : "",
      missing: allMembers.filter((m) => !learned.has(m)),
    };
  }, [sessions, progName, roundOf, allMembers]);

  // 한 줄 입력에서 업체·세부 분류를 알아낸다. 미리보기 칩으로도 보여준다.
  // 업체가 걸리면 "어느 계약인지" 고를 수 있게 선택 옵션을 함께 내려보낸다.
  const detectContract = useCallback((parsed, rawText) => {
    // ① "@" 를 쓰면 진행중인 업체 목록을 띄우고, 뒤에 글자를 치면 좁혀진다.
    //    고르면 그 상호가 입력창에 끼워지고, 아래 ② 흐름이 이어받아 계약을 연결한다.
    const m = parseMention(rawText != null ? rawText : parsed.title);
    if (m.has) {
      const found = searchRunningCompanies(m.query, contracts, TD);
      return {
        chips: [],
        data: {},
        pick: {
          insertOnly: true,
          range: { start: m.start, end: m.end },
          label: m.query
            ? `"${m.query}" 로 찾은 진행중 업체 ${found.length}곳 — 고르면 입력창에 넣습니다`
            : `진행중인 업체 ${found.length}곳 — 고르거나 뒤에 글자를 더 쳐서 좁히세요`,
          emptyLabel: `"${m.query}" 와 맞는 진행중 업체가 없습니다. 글자를 줄여보세요.`,
          options: found.map((f) => ({
            id: f.name,
            insert: f.name,
            primary: true,
            label: f.name + (f.managers.length ? ` · ${f.managers.join(", ")}` : "") + (f.contracts.length > 1 ? ` · 계약 ${f.contracts.length}건` : ""),
          })),
        },
      };
    }

    // ② 보고 대상 — 유형과 별개다. 찾은 이름·직급은 제목에서 뺀다.
    const rep = extractReportTargets(parsed.title, reportTargets);
    const title = rep.cleaned || parsed.title;
    const repChips = rep.targets.map((k) => ({ label: reportName(k), color: "#b45309" }));

    // ③ 상호가 문장에 들어 있으면 어느 계약에 붙일지 고르게 한다
    const hitSubs = findSubTypes(title, subTypes);
    const { name, options, runningCount } = contractOptions(title, contracts, TD);
    const subChips = hitSubs.map((k) => ({ label: subTypeName(k), color: "#0891b2" }));
    const base = { titleOverride: title, data: { subTypes: hitSubs, reportTo: rep.targets } };
    if (!name) return (hitSubs.length || rep.targets.length || rep.cleaned !== parsed.title)
      ? { ...base, chips: [...repChips, ...subChips] } : null;
    // 진행중 계약이 딱 한 건이면 미리 골라 둔다. 여러 건이면 직접 고르게 한다.
    const running = options.filter((c) => !c.cancelled && !c.earlyDone && String(c.endDate || "") >= TD);
    return {
      ...base,
      catOverride: CONTRACT_TYPE,
      chips: [{ label: name, color: "#0891b2" }, ...repChips, ...subChips],
      data: { ...base.data, name, options, runningCount },
      pick: {
        label: `"${name}" 업체를 찾았습니다. 어느 계약에 연결할까요?`,
        autoId: running.length === 1 ? running[0].id : "",
        options: options.map((c) => {
          const isRunning = !c.cancelled && !c.earlyDone && String(c.endDate || "") >= TD;
          return {
            id: c.id,
            primary: isRunning,
            label: `${isRunning ? "진행중" : "종료"} · ${c.startDate} ~ ${c.endDate}${c.manager ? " · " + c.manager : ""}`,
          };
        }),
      },
    };
  }, [contracts, subTypes, subTypeName, TD]);

  const addTask = async (p, info) => {
    // 입력 중에 계약을 골랐으면 그대로 연결한다
    if (info && info.pickedId === "none") { await createTask(p, info, ""); return; }
    if (info && info.pickedId) { await createTask(p, info, info.pickedId); return; }
    // 안 골랐는데 업체가 걸렸으면 저장 전에 물어본다
    if (info && info.options && info.options.length > 0) {
      setPendingPick({ parsed: p, info });
      return;
    }
    await createTask(p, info);
  };

  // 실제 저장 — 업체가 연결되면 유형이 자동으로 "계약업체"가 된다
  const createTask = async (p, info, contractId) => {
    const cid = contractId || "";
    const subs = (info && info.subTypes) || [];
    const t = {
      id: uid(), title: p.title,
      type: cid ? CONTRACT_TYPE : (p.cat || "etc"),
      date: p.date, time: p.time || "",
      status: "todo", desc: "", subs: [], links: [], createdAt: TD,
      ...(cid ? { contractId: cid } : {}),
      ...(subs.length ? { subTypes: subs } : {}),
      ...((info && info.reportTo && info.reportTo.length) ? { reportTo: info.reportTo } : {}),
    };
    await saveTasks([...tasks, t]);
    setPendingPick(null);
    setSide({ kind: "task", id: t.id });
  };
  const patchTask = async (id, patch) => saveTasks(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const deleteTask = async (t) => {
    if (!window.confirm(`"${t.title}" 작업을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await saveTasks(tasks.filter((x) => x.id !== t.id));
    setSide(null);
  };
  const cycleStatus = async (t) => patchTask(t.id, { status: t.status === "done" ? "todo" : "done" });
  // 목록·캘린더의 체크버튼 — 작업과 회차를 구분해 완료 표시를 뒤집는다
  const toggleItem = async (it) => {
    if (it.kind === "task") {
      const t = tasks.find((x) => x.id === it.id);
      if (t) await cycleStatus(t);
    } else {
      const sx = sessions.find((x) => x.id === it.id);
      if (sx) await patchSession(sx.id, { status: sx.status === "done" ? "plan" : "done" });
    }
  };

  // ---- 화면에 뿌릴 공통 항목 목록 (작업 + 교육 회차) ----
  const items = useMemo(() => {
    const a = tasks.map((t) => ({
      kind: "task", id: t.id, title: t.title, color: typeOf(t.type).c,
      date: t.date, time: t.time, done: t.status === "done",
      statusLabel: (STATUS.find((x) => x[0] === t.status) || STATUS[0])[1],
      reportTo: t.reportTo || [],
    }));
    const b = sessions.filter((sx) => sx.status !== "skip").map((sx) => ({
      kind: "session", id: sx.id, pid: sx.pid,
      title: progName(sx.pid) + " " + roundOf(sx) + "회차",
      color: EDU_COLOR, date: sx.date, time: sx.time, done: sx.status === "done",
      statusLabel: SESSION_STATUS[sx.status], isEdu: true,
    }));
    return a.concat(b).sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")));
  }, [tasks, sessions, typeOf, progName, roundOf]);

  const openSide = (kind, id) => setSide({ kind, id });
  const selTask = side?.kind === "task" ? tasks.find((t) => t.id === side.id) : null;
  const selScript = side?.kind === "script" ? scripts.find((x) => x.id === side.id) : null;
  const selProgram = side?.kind === "program" ? programs.find((x) => x.id === side.id) : null;
  const selSession = side?.kind === "session" ? sessions.find((x) => x.id === side.id) : null;
  const selSessionProgram = selSession ? programs.find((x) => String(x.id) === String(selSession.pid)) : null;
  // 바로 앞 회차 (취소된 회차는 제외)
  const prevSession = useMemo(() => {
    if (!selSession) return null;
    const list = sessionsOfProgram(selSession.pid).filter((x) => x.status !== "skip");
    const i = list.findIndex((x) => x.id === selSession.id);
    return i > 0 ? list[i - 1] : null;
  }, [selSession, sessionsOfProgram]);

  // 자료 개선점 → 자료 제작 보드에 개선 작업으로 추가
  const improveToTask = async (sx) => {
    if (!String(sx.improve || "").trim()) { alert("자료 개선점을 먼저 입력하세요."); return; }
    const prog = programs.find((x) => String(x.id) === String(sx.pid));
    const t = {
      id: uid(), title: "[개선] " + (prog ? prog.name : "교육") + " " + roundOf(sx) + "회차 피드백 반영",
      type: "script", date: addDays(TD, 3), time: "", status: "todo",
      desc: sx.improve, subs: [], links: [], createdAt: TD,
    };
    await saveTasks([...tasks, t]);
    alert("자료 제작 보드에 개선 작업을 추가했습니다.");
  };
  useEffect(() => { if (side?.kind === "task" && !selTask) setSide(null); }, [side, selTask]);

  // ---- 항목 한 줄 ----
  const Row = ({ it }) => {
    const on = side?.kind === it.kind && side?.id === it.id;
    return (
      <div onClick={() => openSide(it.kind, it.id)}
        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 6, cursor: "pointer",
          background: C.white, border: `1px solid ${on ? C.main : C.line}`, borderRadius: 9,
          boxShadow: on ? `0 0 0 2px ${C.mainBg}` : "none", opacity: it.done ? 0.65 : 1 }}>
        <button onClick={(e) => { e.stopPropagation(); toggleItem(it); }}
          style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: "pointer",
            border: `2px solid ${it.done ? C.green : "#c5cdd8"}`, background: it.done ? C.green : C.white,
            color: C.white, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{it.done ? "✓" : ""}</button>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: it.done ? C.faint : C.title,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          textDecoration: it.done ? "line-through" : "none" }}>{it.title}</span>
        {it.reportTo && it.reportTo.length > 0 && (
          <span style={{ ...badge("#b45309", "#fffbeb"), fontSize: 10 }}>
            보고 · {it.reportTo.map(reportName).filter(Boolean).join(", ")}
          </span>
        )}
        <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{fmtDate(it.date)}{it.time ? " " + it.time : ""}</span>
        <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{it.statusLabel}</span>
      </div>
    );
  };

  // ---- 오늘·이번 주 ----
  const listView = () => {
    const weekEnd = addDays(TD, (7 - new Date(TD + "T00:00:00").getDay()) % 7);
    const g = { late: [], today: [], week: [], later: [], done: [] };
    const shown = {};
    items.forEach((i) => {
      if (i.done) g.done.push(i);
      else if (i.date < TD) g.late.push(i);
      else if (i.date === TD) g.today.push(i);
      else if (i.date <= weekEnd) g.week.push(i);
      else {
        // 예정 구간에서 교육은 과정별 다음 회차 하나만 보여준다
        if (i.isEdu) { if (shown[i.pid]) return; shown[i.pid] = 1; }
        g.later.push(i);
      }
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
    return <>{sec("late", "지연됨", true)}{sec("today", "오늘")}{sec("week", "이번 주")}{sec("later", "예정 (교육은 과정별 다음 회차만)")}{sec("done", "최근 완료")}</>;
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

  // ---- 스크립트 목록 ----
  const libView = () => {
    const q = libQuery.trim();
    const found = scripts.filter((x) => !q || (x.name || "").includes(q) || (x.cat || "").includes(q));
    const cats = [...new Set(found.map((x) => x.cat || "미분류"))];
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input value={libQuery} onChange={(e) => setLibQuery(e.target.value)}
            placeholder="스크립트 검색 (이름·분류, 예: 반론)"
            style={inputSm({ width: 260, maxWidth: "100%", fontSize: 12.5, padding: "7px 10px" })} />
          <span style={{ fontSize: 11, color: C.faint }}>총 {scripts.length}개 · 교육 회차 기록이 자동 집계됩니다</span>
          <button onClick={() => setShowScript(true)} style={btn("primary", { padding: "6px 12px", fontSize: 11.5 })}>+ 스크립트 추가</button>
        </div>
        {found.length === 0
          ? <div style={{ textAlign: "center", padding: "40px 0", color: C.faint, fontSize: 13 }}>
              {scripts.length === 0 ? "등록된 스크립트가 없습니다. [+ 스크립트 추가]로 시작하세요." : "검색 결과가 없습니다."}
            </div>
          : cats.map((cat) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.title, marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}>
                {cat}<span style={{ ...badge(C.muted, C.soft), fontSize: 10.5 }}>{found.filter((x) => (x.cat || "미분류") === cat).length}</span>
              </div>
              <div style={{ overflowX: "auto", border: `1px solid ${C.line}`, borderRadius: 9 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
                  <thead><tr>{["스크립트", "교육 횟수", "마지막 교육", "이수 인원", "미이수"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {found.filter((x) => (x.cat || "미분류") === cat).map((x) => {
                      const stx = scriptStats(x.id), on = side?.kind === "script" && side?.id === x.id;
                      return (
                        <tr key={x.id} onClick={() => openSide("script", x.id)}
                          style={{ cursor: "pointer", background: on ? C.mainBg : "transparent" }}>
                          <td style={{ ...td, fontWeight: 600, color: C.title }}>{x.name}</td>
                          <td style={td}>{stx.sessions.length
                            ? stx.sessions.length + "회"
                            : <span style={{ color: C.amber, fontSize: 11, fontWeight: 600 }}>교육 전</span>}</td>
                          <td style={{ ...td, color: C.faint }}>{stx.lastDate ? fmtDate(stx.lastDate) : "—"}</td>
                          <td style={{ ...td, color: C.faint }}>{stx.people.length}명</td>
                          <td style={{ ...td, color: C.faint }}>
                            {stx.sessions.length ? (stx.missing.length ? stx.missing.join(", ") : "없음") : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </>
    );
  };

  // ---- 계약업체 일정 (업체별로 묶어서) ----
  const bizView = () => {
    let list = tasks.filter((t) => t.type === CONTRACT_TYPE);
    if (bizSub !== "all") list = list.filter((t) => subTypesOf(t).includes(bizSub));
    if (bizDone === "open") list = list.filter((t) => t.status !== "done");
    else if (bizDone === "done") list = list.filter((t) => t.status === "done");

    // 업체별로 묶기 — 연결 안 된 건은 맨 아래 따로
    const groups = new Map();
    list.forEach((t) => {
      const key = t.contractId || "__none__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
    const entries = [...groups.entries()].sort((a, b) => {
      if (a[0] === "__none__") return 1;
      if (b[0] === "__none__") return -1;
      return contractName(a[0]).localeCompare(contractName(b[0]));
    });

    const pill = (on, v, label, setter, color) => (
      <button key={v} onClick={() => setter(v)}
        style={{ border: `1.5px solid ${on ? color : C.line}`, borderRadius: 99, padding: "4px 12px",
          fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
          background: on ? color + "18" : C.white, color: on ? color : C.muted }}>{label}</button>
    );

    return (
      <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>세부 분류:</span>
          {pill(bizSub === "all", "all", "전체", setBizSub, C.muted)}
          {subTypes.map((x) => pill(bizSub === x.k, x.k, x.n, setBizSub, "#0891b2"))}
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginLeft: 6 }}>상태:</span>
          {pill(bizDone === "open", "open", "미완료", setBizDone, C.main)}
          {pill(bizDone === "done", "done", "완료", setBizDone, C.green)}
          {pill(bizDone === "all", "all", "전체", setBizDone, C.muted)}
        </div>

        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.faint, fontSize: 13 }}>
            조건에 맞는 계약업체 일정이 없습니다. 위 입력창에 업체명을 넣어 한 줄로 적어보세요.
          </div>
        ) : entries.map(([cid, items]) => {
          const c = cid === "__none__" ? null : contracts.find((x) => x.id === cid);
          const sorted = [...items].sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
          return (
            <div key={cid} style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: c ? C.title : C.amber }}>
                  {c ? c.name : "업체 연결 안 됨"}
                </span>
                <span style={{ ...badge(C.muted, C.soft), fontSize: 10.5 }}>{sorted.length}건</span>
                {c && c.manager && <span style={{ fontSize: 11, color: C.faint }}>담당 {c.manager}</span>}
                {c && c.endDate && <span style={{ fontSize: 11, color: C.faint }}>~ {c.endDate}</span>}
                {c && onOpenContract && (
                  <button onClick={() => onOpenContract(c.id)}
                    style={btn("ghost", { marginLeft: "auto", padding: "4px 10px", fontSize: 11 })}>계약 화면으로 이동</button>
                )}
              </div>
              {sorted.map((t) => {
                const on = side?.kind === "task" && side?.id === t.id;
                const isDone = t.status === "done";
                return (
                  <div key={t.id} onClick={() => openSide("task", t.id)}
                    style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", marginBottom: 5,
                      cursor: "pointer", background: C.white, borderRadius: 8,
                      border: `1px solid ${on ? C.main : C.line}`, opacity: isDone ? 0.6 : 1 }}>
                    <button onClick={(e) => { e.stopPropagation(); toggleItem({ kind: "task", id: t.id }); }}
                      style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer",
                        border: `2px solid ${isDone ? C.green : "#c5cdd8"}`, background: isDone ? C.green : C.white,
                        color: C.white, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{isDone ? "\u2713" : ""}</button>
                    {subTypesOf(t).map((k) => (
                      <span key={k} style={{ ...badge("#0891b2", "#ecfeff"), fontSize: 10 }}>{subTypeName(k)}</span>
                    ))}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500,
                      color: isDone ? C.faint : C.title, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none" }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>
                      {fmtDate(t.date)}{t.time ? " " + t.time : ""}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </>
    );
  };

  // ---- 교육 과정 ----
  const eduView = () => {
    if (programs.length === 0) return (
      <div style={{ textAlign: "center", padding: "40px 0", color: C.faint, fontSize: 13 }}>
        등록된 교육 과정이 없습니다. 오른쪽 위 [+ 교육 과정 등록]으로 시작하세요.
      </div>
    );
    return programs.map((prog) => {
      const list = sessionsOfProgram(prog.id);
      const active = list.filter((sx) => sx.status !== "skip");
      const doneCnt = active.filter((sx) => sx.status === "done").length;
      const next = active.find((sx) => sx.status === "plan");
      const covered = new Set(list.filter((sx) => sx.status === "done").flatMap((sx) => sx.scripts || []));
      return (
        <div key={prog.id} style={{ border: "1px solid " + C.line, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div onClick={() => openSide("program", prog.id)} title="클릭하면 과정 상세·대상자 편집"
            style={{ fontSize: 15, fontWeight: 700, color: C.title, cursor: "pointer", marginBottom: 4 }}>
            {prog.name} <span style={{ fontSize: 11, fontWeight: 500, color: C.faint }}>› 대상자 편집</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: C.faint }}>
            <span>대상: {prog.target || "—"} ({(prog.members || []).length}명)</span>
            <span>{ruleLabel(prog.rule, prog.start)} {prog.time}</span>
            <span>진행 {doneCnt}/{active.length}회</span>
            <span>교육한 스크립트 {covered.size}개</span>
            <button onClick={() => addSession(prog.id)}
              style={btn("ghost", { marginLeft: "auto", padding: "4px 10px", fontSize: 11 })}>+ 회차 추가</button>
          </div>
          <div style={{ height: 6, background: C.line, borderRadius: 3, overflow: "hidden", margin: "9px 0 12px" }}>
            <div style={{ height: "100%", width: (active.length ? (doneCnt / active.length) * 100 : 0) + "%", background: EDU_COLOR }} />
          </div>
          <div style={{ background: C.greenBg, color: C.greenDeep, borderRadius: 8, padding: "8px 10px",
            fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>
            {next
              ? "다음 교육: " + fmtDate(next.date) + " " + next.time + " · " + roundOf(next) + "회차" + (next.date < TD ? " (지난 일정, 결과 기록 필요)" : "")
              : "모든 회차가 끝났습니다."}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr>{["회차", "날짜", "상태", "다룬 스크립트", "참석", "이해도", "과제"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((sx) => {
                  const sc = (sx.scripts || []).map((sid) => scripts.find((y) => y.id === sid)).filter(Boolean);
                  const ad = (sx.actions || []).filter((a) => a.d).length;
                  const on = side?.kind === "session" && side?.id === sx.id;
                  const stc = { plan: [C.muted, C.soft], done: [C.greenDeep, C.greenBg], skip: [C.red, C.redBg] }[sx.status] || [C.muted, C.soft];
                  return (
                    <tr key={sx.id} onClick={() => openSide("session", sx.id)} style={{ cursor: "pointer", background: on ? C.mainBg : "transparent" }}>
                      <td style={td}>{sx.status === "skip" ? "—" : roundOf(sx) + "회"}</td>
                      <td style={{ ...td, color: C.faint }}>{fmtDate(sx.date)} {sx.time}</td>
                      <td style={td}><span style={badge(stc[0], stc[1], { fontSize: 10.5 })}>{SESSION_STATUS[sx.status]}</span></td>
                      <td style={td}>
                        {sc.slice(0, 2).map((y) => <span key={y.id} style={{ ...badge(C.main, C.mainBg), marginRight: 4 }}>{y.name}</span>)}
                        {sc.length > 2 && <span style={{ fontSize: 11, color: C.faint }}>외 {sc.length - 2}</span>}
                        {!sc.length && sx.status === "done" && <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>미기록</span>}
                      </td>
                      <td style={{ ...td, color: C.faint }}>
                        {sx.status === "done" ? Object.values(sx.attend || {}).filter(Boolean).length + "/" + (prog.members || []).length : "—"}</td>
                      <td style={{ ...td, color: sx.score ? "#f2a400" : C.faint }}>
                        {sx.status === "done" && sx.score ? "★".repeat(sx.score) : "—"}</td>
                      <td style={{ ...td, color: C.faint }}>{(sx.actions || []).length ? ad + "/" + sx.actions.length : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    });
  };

  // ---- 캘린더 ----
  const dayItems = useMemo(() => (calDay ? items.filter((x) => x.date === calDay) : []), [items, calDay]);
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
              <div key={i} onClick={() => setCalDay(calDay === ds ? "" : ds)}
                style={{ minHeight: 86, padding: 4, borderRadius: 6, boxSizing: "border-box", cursor: "pointer",
                  background: calDay === ds ? "#e8f4fd" : inMonth ? C.white : "#fafbfc",
                  border: `1px solid ${calDay === ds ? C.main : isToday ? "#93c5fd" : C.line}`, overflow: "hidden" }}>
                <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 500, marginBottom: 2, textAlign: "center",
                  color: !inMonth ? "#b5bdc9" : isToday ? C.main : C.text }}>
                  {isToday
                    ? <span style={{ background: C.main, color: C.white, borderRadius: "50%", width: 17, height: 17, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9.5 }}>{d.getDate()}</span>
                    : d.getDate()}
                </div>
                {evs.slice(0, 2).map((e) => (
                  <div key={e.kind + e.id} title={e.title}
                    style={{ fontSize: 9, padding: "1px 3px", borderRadius: 3, marginBottom: 1,
                      background: e.color, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      opacity: e.done ? 0.45 : 1, textDecoration: e.done ? "line-through" : "none" }}>
                    {e.time ? e.time + " " : ""}{e.title}
                  </div>
                ))}
                {evs.length > 2 && <div style={{ fontSize: 8.5, color: C.main, textAlign: "center", fontWeight: 700 }}>+{evs.length - 2}건 더</div>}
              </div>
            );
          })}
        </div>

        {/* 고른 날짜의 일정 목록 — 여기서 고르면 상세가 열린다.
            칸이 좁아 3개 넘어가면 안 보이던 문제를 이 목록으로 해결한다. */}
        {calDay && (
          <div style={{ marginTop: 14, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px",
              borderBottom: `1px solid ${C.line}`, background: calDay === TD ? C.mainBg : C.soft }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.title }}>{fmtDate(calDay)}</span>
              {calDay === TD && <span style={badge(C.main, C.white, { fontSize: 10 })}>오늘</span>}
              <span style={{ fontSize: 11, color: C.faint }}>{dayItems.length}건</span>
              <button onClick={() => setCalDay("")}
                style={{ marginLeft: "auto", border: "none", background: "none", color: C.faint, cursor: "pointer", fontSize: 15 }}>✕</button>
            </div>
            <div style={{ padding: "10px 12px" }}>
              {dayItems.length === 0
                ? <div style={{ textAlign: "center", padding: "16px 0", fontSize: 12.5, color: C.faint }}>이 날 일정이 없습니다</div>
                : dayItems.map((e) => {
                  const on = side?.kind === e.kind && side?.id === e.id;
                  return (
                    <div key={e.kind + e.id} onClick={() => openSide(e.kind, e.id)}
                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", marginBottom: 5,
                        cursor: "pointer", background: C.white, borderRadius: 8,
                        border: `1px solid ${on ? C.main : C.line}`, opacity: e.done ? 0.6 : 1 }}>
                      <button onClick={(ev) => { ev.stopPropagation(); toggleItem(e); }}
                        style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, cursor: "pointer",
                          border: `2px solid ${e.done ? C.green : "#c5cdd8"}`, background: e.done ? C.green : C.white,
                          color: C.white, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{e.done ? "\u2713" : ""}</button>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500,
                        color: e.done ? C.faint : C.title, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap", textDecoration: e.done ? "line-through" : "none" }}>{e.title}</span>
                      {e.time && <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{e.time}</span>}
                      <span style={{ fontSize: 11, color: C.faint, whiteSpace: "nowrap" }}>{e.statusLabel}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        {!calDay && (
          <p style={{ fontSize: 11, color: C.faint, marginTop: 10, textAlign: "center" }}>
            날짜를 누르면 그 날 일정 목록이 아래에 열립니다. 목록에서 고르면 상세가 열립니다.
          </p>
        )}
      </>
    );
  };

  if (loading) return <div style={card({ padding: "60px 20px", textAlign: "center", color: C.faint, fontSize: 13 })}>불러오는 중…</div>;

  return (
    <div style={{ fontFamily: FONT }}>
      <QuickAddBar cats={types} fallback="etc" today={TD} onAdd={addTask} detect={detectContract}
        placeholder="한 줄로 입력하세요.  예) 내일 3시 OO상회 리워드 세팅" />

      {/* 같은 상호의 계약이 여러 건일 때 — 자동으로 고르지 않고 물어본다 */}
      {pendingPick && (
        <div style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 10,
          padding: "11px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#92400e", marginBottom: 3 }}>
            "{pendingPick.info.name}" 업체를 찾았습니다. 어느 계약에 연결할까요?
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 9 }}>
            {pendingPick.parsed.title} · {fmtDate(pendingPick.parsed.date)}
            {pendingPick.parsed.time ? " " + pendingPick.parsed.time : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pendingPick.info.options.map((c) => {
              const running = !c.cancelled && !c.earlyDone && String(c.endDate || "") >= TD;
              return (
                <button key={c.id} onClick={() => createTask(pendingPick.parsed, pendingPick.info, c.id)}
                  style={btn(running ? "primary" : "ghost", { padding: "6px 13px", fontSize: 11.5 })}>
                  {running ? "진행중 · " : "종료 · "}{c.startDate} ~ {c.endDate}{c.manager ? ` · ${c.manager}` : ""}
                </button>
              );
            })}
            <button onClick={() => createTask(pendingPick.parsed, pendingPick.info, "")}
              style={btn("ghost", { padding: "6px 13px", fontSize: 11.5 })}>연결 안 함</button>
            <button onClick={() => setPendingPick(null)}
              style={btn("ghost", { padding: "6px 13px", fontSize: 11.5 })}>취소</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ ...subTabBar, marginBottom: 0, flex: 1, minWidth: 260 }}>
          {SUB_TABS.map((t) => (
            <button key={t.id} onClick={() => setSub(t.id)} style={subTabBtn(sub === t.id)}>{t.label}</button>
          ))}
        </div>
        <button onClick={() => setShowTypes(true)} style={btn("ghost", { padding: "8px 14px", fontSize: 12 })}>유형 관리</button>
        <button onClick={() => setShowImport(true)} title="목록·캘린더 탭의 일정을 업무관리로 복사합니다"
          style={btn("ghost", { padding: "8px 14px", fontSize: 12 })}>기존 일정 가져오기</button>
        <button onClick={() => setShowProgram(true)} style={btn("accent", { padding: "8px 14px", fontSize: 12 })}>+ 교육 과정 등록</button>
      </div>

      <div style={card({ padding: 16 })}>
        {sub === "list" && listView()}
        {sub === "board" && boardView()}
        {sub === "biz" && bizView()}
        {sub === "edu" && eduView()}
        {sub === "lib" && libView()}
        {sub === "cal" && calView()}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.faint, marginTop: 12 }}>
        {types.map((t) => (
          <span key={t.k} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: t.c, display: "inline-block" }} />{t.n}
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <i style={{ width: 8, height: 8, borderRadius: "50%", background: EDU_COLOR, display: "inline-block" }} />교육 회차
        </span>
      </div>

      <SidePanel open={!!selTask} kind="작업 상세" onClose={() => setSide(null)}>
        <TaskPanel task={selTask} types={types} subTypes={subTypes} contracts={contracts}
          reportTargets={reportTargets}
          onPatch={patchTask} onDelete={deleteTask} onOpenContract={onOpenContract} />
      </SidePanel>

      <SidePanel open={!!selScript} kind="스크립트 상세" onClose={() => setSide(null)}>
        {selScript && <ScriptPanel script={selScript} cats={scriptCats} stats={scriptStats(selScript.id)}
          onPatch={patchScript} onDelete={deleteScript} />}
      </SidePanel>

      <SidePanel open={!!selProgram} kind="교육 과정 상세" onClose={() => setSide(null)}>
        {selProgram && <ProgramPanel program={selProgram} sessions={sessionsOfProgram(selProgram.id)}
          people={people} roundOf={roundOf} onPatch={patchProgram} onAddPerson={addPerson}
          onOpenSession={(id) => setSide({ kind: "session", id })} onDelete={deleteProgram} />}
      </SidePanel>

      <SidePanel open={!!selSession} kind="교육 회차 기록" onClose={() => setSide(null)}>
        {selSession && selSessionProgram && (
          <SessionPanel session={selSession} program={selSessionProgram} prevSession={prevSession}
            round={roundOf(selSession)} scripts={scripts} people={people}
            onPatch={patchSession} onPatchPrev={patchSession} onAddPerson={addPerson}
            onImproveToTask={improveToTask} />
        )}
      </SidePanel>

      {showProgram && <ProgramModal people={people} onAddPerson={addPerson} today={TD}
        onCreate={createProgram} onClose={() => setShowProgram(false)} />}
      {showScript && <AddScriptModal cats={scriptCats} onAdd={addScript} onClose={() => setShowScript(false)} />}

      {showImport && <ImportModal st={st} contracts={contracts} subTypes={subTypes}
        existing={tasks} today={TD} onDone={saveTasks} onClose={() => setShowImport(false)} />}
      {showTypes && <TypesModal types={types} tasks={tasks} onSave={saveTypes}
        subTypes={subTypes} onSaveSubTypes={saveSubTypes}
        reportTargets={reportTargets} onSaveReportTargets={saveReportTargets}
        onClose={() => setShowTypes(false)} />}
    </div>
  );
}
