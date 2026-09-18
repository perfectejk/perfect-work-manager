// ===== 교육 과정 반복 날짜 생성 =====
// 주기 5종. 첫 교육일에서 회차 수만큼 날짜를 만들어낸다.
// 만들어진 날짜는 "처음 한 번"만 계산해서 회차로 저장한다. 그래서 나중에 어느 회차
// 날짜를 바꿔도 다른 회차는 그대로 남는다 (요구사항: 자동으로 밀리지 않아야 함).
import { YMD, parseYMD, WD } from "../shared/ui";

export const RULES = [
  { k: "w1", label: "매주 (같은 요일)" },
  { k: "w2", label: "격주 (같은 요일)" },
  { k: "w4", label: "4주마다" },
  { k: "mnth", label: "매월 N째 주 같은 요일" },
  { k: "mday", label: "매월 같은 날짜" },
];

const lastDayOf = (y, m) => new Date(y, m + 1, 0).getDate();

export function genDates(startStr, rule, count) {
  if (!startStr || !count) return [];
  const s = parseYMD(startStr);
  const out = [];
  for (let i = 0; i < count; i++) {
    let d;
    if (rule === "w1" || rule === "w2" || rule === "w4") {
      const step = rule === "w1" ? 7 : rule === "w2" ? 14 : 28;
      d = new Date(s); d.setDate(s.getDate() + step * i);
    } else if (rule === "mday") {
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

export function ruleLabel(rule, startStr) {
  if (!startStr) return RULES.find((r) => r.k === rule)?.label || "";
  const s = parseYMD(startStr), w = WD[s.getDay()];
  return {
    w1: `매주 ${w}요일`, w2: `격주 ${w}요일`, w4: `4주마다 ${w}요일`,
    mnth: `매월 ${Math.ceil(s.getDate() / 7)}째 주 ${w}요일`, mday: `매월 ${s.getDate()}일`,
  }[rule] || "";
}

// 빈 회차 한 건
export function blankSession(id, pid, date, time, members, status) {
  const attend = {};
  (members || []).forEach((m) => { attend[m] = false; });
  return {
    id, pid, date, time: time || "", status: status || "plan",
    place: "", attend, scripts: [], score: 0,
    reaction: "", actions: [], improve: "", next: "",
  };
}
