// ===== 교육 자동 일정 (점검 · 과제확인) =====
// 교육 기록(과정·회차)을 보고 아래 두 가지 일정을 계산해, 일정마다 따로 문서로 저장한다.
//   1) 점검:     회차 날짜가 지났는데 참석 체크가 안 된 대상자가 있으면 → 회차 다음날
//   2) 과제확인: 회차에 과제가 있고 다음 회차 날짜가 있으면 → 다음 회차 전날
// 저장 이름은 wm:auto:{고유ID}. 고유ID가 늘 같으므로 PC·휴대폰에서 동시에 열어도 같은 문서를 덮어쓸 뿐 겹치지 않는다.
// 기존 업무(wm:tasks)는 읽지도 쓰지도 않는다.
import { addDays } from "../shared/ui";
import { isSetProg, setLabel } from "./recur";

export const AUTO_PREFIX = "wm:auto:";
export const autoKey = (id) => AUTO_PREFIX + id;
export const AUTO_COLOR = "#8468D3";   // 자동 일정 표시색 (보조 브랜드색)

// 과제 고유번호 — 과제를 추가할 때 붙이고, 예전 과제는 처음 검사할 때 한 번만 붙인다
const newActionId = () => "a" + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7);
export const needsActionIds = (list) => (list || []).some((a) => a && !a.id);
export const withActionIds = (list) => (list || []).map((a) => (a && !a.id ? { ...a, id: newActionId() } : a));

// 회차 이름 — 세트 교육은 "2세트 · 필기", 그 밖에는 "3회차"
const roundLabel = (s, prog, round) => (isSetProg(prog) && s.set ? setLabel(s, prog) : `${round}회차`);

// 지금 교육 기록으로 있어야 할 자동 일정 목록을 계산한다 (저장은 하지 않음)
//   open: true = 아직 할 일이 남음(미완료), false = 끝남(완료로 표시)
export function computeAuto(programs, sessions, today) {
  const out = [];
  programs.forEach((prog) => {
    // 취소 회차는 빼고 날짜순 — 회차 번호도 이 순서로 센다 (앱의 roundOf 와 같은 규칙)
    const list = sessions
      .filter((s) => String(s.pid) === String(prog.id) && s.status !== "skip" && s.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const members = prog.members || [];
    list.forEach((s, i) => {
      const label = roundLabel(s, prog, i + 1);
      // 1) 점검 — 회차 날짜가 지났을 때만
      if (s.date < today && members.length) {
        const miss = members.filter((m) => !(s.attend || {})[m]);
        out.push({
          id: `auto-check:${prog.id}:${s.id}`, kind: "check", pid: prog.id, sid: s.id,
          date: addDays(s.date, 1), open: miss.length > 0,
          title: miss.length ? `[점검] ${prog.name} ${label} 미완료 ${miss.length}명 (${miss.join(", ")})` : "",
        });
      }
      // 2) 과제확인 — 다음 회차 날짜가 있을 때만
      const next = list[i + 1];
      if (next && next.date) {
        (s.actions || []).forEach((a) => {
          if (!a || !a.id || !String(a.t || "").trim()) return;
          out.push({
            id: `auto-hw:${prog.id}:${s.id}:${a.id}`, kind: "hw", pid: prog.id, sid: s.id, aid: a.id,
            date: addDays(next.date, -1), open: !a.d,
            title: `[과제확인] ${prog.name} ${label} 과제: ${String(a.t).trim()}`,
          });
        });
      }
    });
  });
  return out;
}

// 저장된 자동 일정(existing: {id: 문서})과 계산 결과(desired)를 비교해 바꿀 것만 골라낸다
//   writes: 새로 만들거나 고칠 문서, dels: 지울 문서의 고유ID
export function planSync(existing, desired, today) {
  const writes = [];
  const keep = new Set();
  desired.forEach((d) => {
    const ex = existing[d.id];
    // 점검 일정은 미완료자가 있을 때만 새로 만든다. 이미 있던 일정은 전원 완료되면 완료로 남긴다.
    if (d.kind === "check" && !d.open && !ex) return;
    keep.add(d.id);
    const status = d.open ? "todo" : "done";
    const doc = {
      id: d.id, auto: true, kind: d.kind, pid: d.pid, sid: d.sid, ...(d.aid ? { aid: d.aid } : {}),
      // 전원 완료된 점검 일정은 마지막 제목(누가 미완료였는지)을 그대로 둔다
      title: d.title || (ex && ex.title) || "",
      date: d.date, status,
      createdAt: (ex && ex.createdAt) || today,
      ...(status === "done" ? { completedAt: (ex && ex.status === "done" && ex.completedAt) || today } : {}),
    };
    if (!ex || !sameDoc(ex, doc)) writes.push(doc);
  });
  const dels = Object.keys(existing).filter((id) => !keep.has(id));
  return { writes, dels };
}

const FIELDS = ["id", "auto", "kind", "pid", "sid", "aid", "title", "date", "status", "createdAt", "completedAt"];
const sameDoc = (a, b) => FIELDS.every((k) => (a[k] ?? "") === (b[k] ?? ""));

// 저장된 자동 일정을 모두 읽어온다 → {고유ID: 문서}
export async function loadAutos(st) {
  const keys = await st.list(AUTO_PREFIX);
  const docs = await Promise.all(keys.map((k) => st.get(k)));
  const map = {};
  docs.forEach((d) => { if (d && d.id) map[d.id] = d; });
  return map;
}
