// ===== 교육 과정 반복 날짜 생성 =====
// 주기 5종. 첫 교육일에서 회차 수만큼 날짜를 만들어낸다.
// 만들어진 날짜는 "처음 한 번"만 계산해서 회차로 저장한다. 그래서 나중에 어느 회차
// 날짜를 바꿔도 다른 회차는 그대로 남는다 (요구사항: 자동으로 밀리지 않아야 함).
import { YMD, parseYMD, WD } from "../shared/ui";

export const RULES = [
  { k: "w1", label: "매주 (요일 선택)" },
  { k: "w2", label: "격주 (요일 선택)" },
  { k: "w4", label: "4주마다" },
  { k: "mnth", label: "매월 N째 주 같은 요일" },
  { k: "mday", label: "매월 같은 날짜" },
];

const lastDayOf = (y, m) => new Date(y, m + 1, 0).getDate();

// 주 단위 주기(매주·격주·4주마다)인지
export const isWeekly = (rule) => rule === "w1" || rule === "w2" || rule === "w4";

// 요일 목록 — 저장된 요일이 없으면(예전에 만든 과정) 첫 교육일의 요일 하나
export function weekDays(days, startStr) {
  if (Array.isArray(days) && days.length) return days;
  return startStr ? [parseYMD(startStr).getDay()] : [];
}

// 월요일 시작 주의 월요일
const mondayOf = (d) => { const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return m; };

export function genDates(startStr, rule, count, days) {
  if (!startStr || !count) return [];
  if (rule === "once") return [startStr];   // 1회 교육 (오리엔테이션 등) — 반복 없음
  const s = parseYMD(startStr);
  const out = [];
  if (isWeekly(rule)) {
    // 첫 교육일부터 하루씩 넘기며, 고른 요일이면서 쉬지 않는 주에 해당하는 날을 담는다
    const want = weekDays(days, startStr);
    const step = rule === "w1" ? 1 : rule === "w2" ? 2 : 4;
    const mon0 = mondayOf(s);
    const d = new Date(s);
    for (let guard = 0; out.length < count && guard < 3000; guard++) {
      const week = Math.round((mondayOf(d) - mon0) / (7 * 864e5));
      if (week % step === 0 && want.includes(d.getDay())) out.push(YMD(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }
  for (let i = 0; i < count; i++) {
    let d;
    if (rule === "mday") {
      // 매월 같은 날짜 — 그 달에 없는 날(31일 등)이면 말일로 당긴다
      const y = s.getFullYear(), m = s.getMonth() + i;
      const base = new Date(y, m, 1);
      d = new Date(base.getFullYear(), base.getMonth(), Math.min(s.getDate(), lastDayOf(base.getFullYear(), base.getMonth())));
    } else {
      // 매월 N째 주 같은 요일 — 그 달에 N째 주가 없으면 한 주 당긴다
      const nth = Math.ceil(s.getDate() / 7), wd = s.getDay();
      const base = new Date(s.getFullYear(), s.getMonth() + i, 1);
      const y = base.getFullYear(), m = base.getMonth();
      let day = 1 + ((wd - new Date(y, m, 1).getDay() + 7) % 7) + 7 * (nth - 1);
      if (day > lastDayOf(y, m)) day -= 7;
      d = new Date(y, m, day);
    }
    out.push(YMD(d));
  }
  return out;
}

export function ruleLabel(rule, startStr, days) {
  if (rule === "once") return "1회 교육";
  if (!startStr) return RULES.find((r) => r.k === rule)?.label || "";
  const s = parseYMD(startStr);
  // 요일은 월요일부터 순서대로 "월·수·금"
  const w = isWeekly(rule)
    ? [1, 2, 3, 4, 5, 6, 0].filter((x) => weekDays(days, startStr).includes(x)).map((x) => WD[x]).join("·")
    : WD[s.getDay()];
  const wk = w.length > 1 ? w : w + "요일";   // 여러 요일이면 "월·수·금", 하나면 "월요일"
  return {
    w1: `매주 ${wk}`, w2: `격주 ${wk}`, w4: `4주마다 ${wk}`,
    mnth: `매월 ${Math.ceil(s.getDate() / 7)}째 주 ${w}요일`, mday: `매월 ${s.getDate()}일`,
  }[rule] || "";
}

// 회차 제목 — 직접 정한 제목이 있으면 그것, 없으면 "과정명 - n회차".
// 기본 제목은 저장하지 않고 그때그때 만든다. 과정명을 바꾸거나 중간 회차를
// 취소해도 번호가 저절로 맞춰지게 하려는 것이다.
export function sessionTitle(sess, prog, round) {
  const t = ((sess && sess.title) || "").trim();
  if (t) return t;
  const name = (prog && prog.name) || "(삭제된 과정)";
  // 세트 교육은 "과정명 - 2세트 필기 인출"
  if (isSetProg(prog) && sess && sess.set) return `${name} - ${setLabel(sess, prog).replace(" · ", " ")}`;
  // 1회 교육은 회차 번호 없이 교육명만 쓴다
  if (prog && prog.rule === "once" && round === 1) return name;
  return `${name} - ${round}회차`;
}

// ===== 세트 교육 (영업력 강화처럼 "멘트 2개 = 한 세트, 정해진 요일 단계" 로 도는 과정) =====
// 과정에는 kind: "set", rule: "set", steps: [{ n: 단계명, wd: 요일(0=일), time }] 가 붙는다.
// 회차에는 set: 세트 번호(1부터), step: 단계 순서(0부터) 가 붙는다.
export const SET_STEPS = [
  { n: "대면", wd: 1, time: "11:00" },
  { n: "자습", wd: 1, time: "18:30" },
  { n: "필기 인출", wd: 2, time: "11:00" },
  { n: "ARS 녹취 판정", wd: 3, time: "11:00" },
];
export const isSetProg = (prog) => !!prog && prog.kind === "set";
// 그 주 안에서 요일 순서 (월=0 … 일=6)
const wdOffset = (wd) => (wd + 6) % 7;

// 세트 k(1부터)의 단계별 날짜 — 첫 세트 주의 월요일에서 (k-1)주 뒤.
// 단계는 순서대로 진행되므로, 각 단계는 앞 단계 날짜 이후의 그 요일로 잡는다
// (예: 목 대면 → 금 필기 → 월 ARS 면 ARS 는 다음 주 월요일).
export function setDates(startStr, k, steps) {
  if (!startStr) return [];
  return stepDates(plusDays(mondayStr(startStr), 7 * (k - 1)), steps);
}
// 한 세트의 단계별 날짜 — 세트가 시작하는 주의 월요일(monStr) 기준
export function stepDates(monStr, steps) {
  if (!monStr) return [];
  const mon = parseYMD(monStr);
  let prev = null;
  return (steps || []).map((st, i) => {
    const d = new Date(mon);
    if (i === 0) d.setDate(mon.getDate() + wdOffset(st.wd));
    else { d.setTime(prev.getTime()); d.setDate(d.getDate() + ((st.wd - prev.getDay() + 7) % 7)); }
    prev = d;
    return YMD(d);
  });
}
// 날짜가 속한 주의 월요일 (YYYY-MM-DD)
export const mondayStr = (s) => YMD(mondayOf(parseYMD(s)));
const plusDays = (s, n) => { const d = parseYMD(s); d.setDate(d.getDate() + n); return YMD(d); };
export const daysBetween = (a, b) => Math.round((parseYMD(b) - parseYMD(a)) / 864e5);

// 월말 프로모션 마감 주 — 그 달 안에 월~금이 모두 들어 있는 마지막 주
// (예: 2026년 10월 10/26~30, 11월 11/23~27, 12월 12/21~25). 이 주에는 세트 교육을 잡지 않는다.
export function isPromoWeek(s) {
  const mon = parseYMD(mondayStr(s));
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4);
  if (fri.getMonth() !== mon.getMonth()) return false;
  const nextFri = new Date(fri); nextFri.setDate(fri.getDate() + 7);
  return nextFri.getMonth() !== fri.getMonth();
}
// monStr 주부터 시작해서, 건너뛸 주가 아니게 될 때까지 한 주씩 미룬다
export function nextOpenMonday(monStr, skipPromo) {
  let m = mondayStr(monStr);
  for (let g = 0; skipPromo && isPromoWeek(m) && g < 10; g++) m = plusDays(m, 7);
  return m;
}
// 세트 n개를 주마다 배치 — 월말 프로모션 주(skipPromo)와 직접 고른 쉬는 주(rest)는 건너뛴다.
// 결과: [{ mon, kind: "set", k } | { mon, kind: "promo" } | { mon, kind: "rest" }]
export function planWeeks(startStr, n, skipPromo, rest = {}) {
  const out = [];
  if (!startStr) return out;
  let mon = mondayStr(startStr), k = 0;
  for (let g = 0; k < n && g < 400; g++, mon = plusDays(mon, 7)) {
    if (rest[mon]) out.push({ mon, kind: "rest" });
    else if (skipPromo && isPromoWeek(mon)) out.push({ mon, kind: "promo" });
    else { k++; out.push({ mon, kind: "set", k }); }
  }
  return out;
}

// "세트 교육 · 월 대면·자습 / 화 필기 인출 / 수 ARS 녹취 판정"
export function setRuleLabel(steps) {
  // 단계 순서대로, 연달아 같은 요일인 단계는 하나로 묶는다
  const byDay = [];
  (steps || []).forEach((st) => {
    const g = byDay[byDay.length - 1];
    if (g && g.wd === st.wd) g.names.push(st.n); else byDay.push({ wd: st.wd, names: [st.n] });
  });
  return "세트 교육 · " + byDay.map((g) => WD[g.wd] + " " + g.names.join("·")).join(" / ");
}
// 과정 하나의 주기 설명 — 세트 교육이면 단계 요일, 아니면 기존 주기
export const progRuleLabel = (prog) =>
  !prog ? "" : isSetProg(prog) ? setRuleLabel(prog.steps) : ruleLabel(prog.rule, prog.start, prog.days);
// 세트 교육 회차의 짧은 이름 — "2세트 · 필기 인출"
export function setLabel(sess, prog) {
  const st = (prog && prog.steps && prog.steps[sess.step]) || {};
  return `${sess.set}세트 · ${st.n || "단계"}${sess.retake ? " (재교육)" : ""}`;
}

// ===== 일정 겹침 =====
// taken: 이미 있는 교육 회차 [{ date, time, label }]
// 같은 날, 시작 시간이 1시간 미만으로 붙어 있으면 겹친다고 본다. (시간이 없는 회차는 비교하지 않음)
const toMin = (t) => { const [h, m] = String(t || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
export function findClash(taken, date, time) {
  const t = toMin(time);
  if (!date || t === null) return [];
  return (taken || []).filter((x) => {
    if (x.date !== date) return false;
    const u = toMin(x.time);
    return u !== null && Math.abs(u - t) < 60;
  });
}
export const clashText = (list) => "⚠ " + list.map((x) => `${x.label}(${x.time})`).join(", ") + "와 겹침";

// 빈 회차 한 건
export function blankSession(id, pid, date, time, members, status) {
  const attend = {};
  (members || []).forEach((m) => { attend[m] = false; });
  return {
    id, pid, date, time: time || "", status: status || "plan",
    place: "", attend, scripts: [], score: 0,
    reaction: "", actions: [], improve: "", next: "", materials: [],
  };
}
