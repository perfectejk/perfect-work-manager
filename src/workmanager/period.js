// ===== 기간 업무 계산 =====
// 업무 구분: 당일 업무(기본) / 기간 업무(mode: "period").
// 기간 업무는 startDate(비면 등록일) ~ dueDate 동안 진행한다.
// date 칸에도 마감일을 같이 저장해 두므로, 대시보드·알림·계약업체 일정처럼
// date 만 보는 화면은 기간 업무를 "마감일에 있는 일"로 그대로 보여준다.
// 화면이 없는 순수 함수만 둔다.

export const isPeriod = (t) => !!t && t.mode === "period";
// 시작일 — 비워 두면 등록일부터 시작으로 본다
export const startOf = (t) => (isPeriod(t) ? (t.startDate || t.createdAt || t.dueDate || t.date || "") : (t && t.date) || "");
// 마감일 — 당일 업무는 그 날짜
export const dueOf = (t) => (isPeriod(t) ? (t.dueDate || t.date || "") : (t && t.date) || "");

// a → b 까지 며칠 (같은 날이면 0)
export const dayDiff = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

// 남은 기간 표시 — D-4 이상 회색 / D-3~D-1 주황 / D-day 빨강 / 지나면 D+n 빨강
export function ddayOf(t, today) {
  const n = dayDiff(today, dueOf(t));
  if (n > 3) return { label: "D-" + n, color: "#6b7280", bg: "#f3f4f6" };
  if (n > 0) return { label: "D-" + n, color: "#ea580c", bg: "#fff7ed" };
  if (n === 0) return { label: "D-day", color: "#ef4444", bg: "#fef2f2" };
  return { label: "D+" + -n, color: "#ef4444", bg: "#fef2f2" };
}

// "2026-11-10" → "11/10"
export const md = (d) => { if (!d) return ""; const [, m, dd] = d.split("-"); return +m + "/" + +dd; };

// 진행률(0~100) — 시작일부터 오늘까지 지난 날 / 전체 날
export function progressOf(t, today) {
  const s = startOf(t), d = dueOf(t);
  const total = dayDiff(s, d) + 1;
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((dayDiff(s, today) + 1) / total) * 100)));
}

// 업무 구분 바꾸기 — 당일 → 기간: 지금 날짜가 마감일이 되고 시작일은 비워 둔다(= 등록일)
//                  기간 → 당일: 마감일이 그 업무의 날짜가 된다
export function toPeriodPatch(t) {
  // 등록일이 마감일보다 늦으면(예전 작업을 앞 날짜로 옮긴 경우) 시작일을 마감일로 맞춘다
  const start = t.createdAt && t.date && t.createdAt > t.date ? t.date : "";
  return { mode: "period", dueDate: t.date || "", startDate: start };
}
export function toDayPatch(t) {
  return { mode: "day", date: t.dueDate || t.date || "" };
}

// 한 주(ws~we) 안의 기간 업무 막대 배치 — 겹치지 않으면 같은 줄을 나눠 쓴다
//   반환: { placed: [{t, c0, c1, lane, cutLeft, cutRight}], lanes: 줄 수 }
export function layoutBars(list, ws, we) {
  const inWeek = list
    .filter((t) => startOf(t) <= dueOf(t) && startOf(t) <= we && dueOf(t) >= ws)
    .sort((a, b) => startOf(a).localeCompare(startOf(b)) || dueOf(a).localeCompare(dueOf(b)));
  const ends = [];
  const placed = inWeek.map((t) => {
    const s = startOf(t) < ws ? ws : startOf(t);
    const e = dueOf(t) > we ? we : dueOf(t);
    const c0 = dayDiff(ws, s), c1 = dayDiff(ws, e);
    let lane = ends.findIndex((end) => end < c0);
    if (lane < 0) { lane = ends.length; ends.push(c1); } else ends[lane] = c1;
    return { t, c0, c1, lane, cutLeft: startOf(t) < ws, cutRight: dueOf(t) > we };
  });
  return { placed, lanes: ends.length };
}
