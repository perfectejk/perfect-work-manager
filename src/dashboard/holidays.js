// ===== 공휴일 · 영업일 계산 =====
// 앱에는 원래 공휴일 정보가 없고 주말만 건너뛰었다.
// 여기 기본 목록을 두고, 대시보드 설정에서 직접 고치거나 더할 수 있게 한다.
//
// ⚠️ 음력에서 오는 공휴일(설날·부처님오신날·추석)은 확인이 필요합니다.
//    날짜가 다르면 대시보드 설정에서 고쳐 주세요.
import { YMD, parseYMD } from "../shared/ui";

export const DEFAULT_HOLIDAYS = [
  { d: "2026-01-01", n: "신정" },
  { d: "2026-02-16", n: "설날 연휴", check: true },
  { d: "2026-02-17", n: "설날", check: true },
  { d: "2026-02-18", n: "설날 연휴", check: true },
  { d: "2026-03-01", n: "삼일절" },
  { d: "2026-03-02", n: "삼일절 대체공휴일" },
  { d: "2026-05-05", n: "어린이날" },
  { d: "2026-05-24", n: "부처님오신날", check: true },
  { d: "2026-05-25", n: "부처님오신날 대체공휴일", check: true },
  { d: "2026-06-06", n: "현충일" },
  { d: "2026-08-15", n: "광복절" },
  { d: "2026-09-24", n: "추석 연휴", check: true },
  { d: "2026-09-25", n: "추석", check: true },
  { d: "2026-09-26", n: "추석 연휴", check: true },
  { d: "2026-10-03", n: "개천절" },
  { d: "2026-10-09", n: "한글날" },
  { d: "2026-12-25", n: "성탄절" },
];

export const holidaySet = (list) =>
  new Set((Array.isArray(list) && list.length ? list : DEFAULT_HOLIDAYS).map((h) => (typeof h === "string" ? h : h.d)));

// 토·일 또는 공휴일이면 쉬는 날
export const isOffDay = (ds, hset) => {
  const dow = parseYMD(ds).getDay();
  return dow === 0 || dow === 6 || hset.has(ds);
};

// 오늘부터 영업일 n일 뒤 (쉬는 날은 세지 않는다)
export function addBizDays(ds, n, hset) {
  const d = parseYMD(ds);
  let left = n, guard = 0;
  while (left > 0 && guard++ < 400) {
    d.setDate(d.getDate() + 1);
    if (!isOffDay(YMD(d), hset)) left--;
  }
  return YMD(d);
}

// from(다음날)부터 to 까지 영업일이 며칠인지 — D-n 표시용
export function bizDaysUntil(from, to, hset) {
  if (!from || !to || to <= from) return 0;
  const d = parseYMD(from);
  const end = parseYMD(to);
  let n = 0, guard = 0;
  while (d < end && guard++ < 400) {
    d.setDate(d.getDate() + 1);
    if (!isOffDay(YMD(d), hset)) n++;
  }
  return n;
}

// 달력 기준 남은 일수 (계약 만료처럼 쉬는 날과 상관없는 것)
export const daysUntil = (from, to) =>
  (!from || !to) ? null : Math.round((parseYMD(to) - parseYMD(from)) / 86400000);
