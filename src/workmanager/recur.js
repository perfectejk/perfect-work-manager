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
  // 1회 교육은 회차 번호 없이 교육명만 쓴다
  if (prog && prog.rule === "once" && round === 1) return name;
  return `${name} - ${round}회차`;
}

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
