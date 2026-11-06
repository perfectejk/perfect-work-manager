// ===== 작업 캘린더 계산 =====
// 저장된 기록을 "날짜별 · 종류별 수량"으로 펼친다. 읽기만 하고 아무것도 저장하지 않는다.
// 기준은 작업 등록(분배) 기준 — 주간계획 상단 카드와 같은 숫자가 나온다.
//
//   기록 → buildEntries() → [{date, type, qty, src}]  (date 가 null 이면 "날짜 미지정")
//        → aggregate()    → {byDate, undated, totals}
//
// 여러 계약의 항목을 이어 붙여 aggregate() 에 넣으면 "전체 계약 합산 캘린더"도 같은 계산으로 만들 수 있다.
import { PLAN_TYPES, ymdLocal, planAddDays, planDays, intOr, blogDaysOf } from "./planUtils";

// 캘린더에 보여줄 종류 — 합치지 않고 종류마다 따로 센다. short 는 날짜 칸에 쓰는 약칭.
// 색은 주간계획과 같게 두고, 저장+트래픽만 블로그(보라)와 헷갈리지 않게 남색으로 바꿨다.
const SHORT = { traffic: "트", route: "길", savetraffic: "저트", premium: "프", save: "저", alarm: "알" };
const CAL_COLOR = { savetraffic: "#4f46e5" };
export const CAL_TYPES = [
  ...PLAN_TYPES.map(t => ({ k: t.k, short: SHORT[t.k], label: t.label, unit: t.unit, color: CAL_COLOR[t.k] || t.color })),
  { k: "blog", short: "블", label: "블로그 리뷰", unit: "건", color: "#8468D3" },
  { k: "receipt", short: "영", label: "영수증 리뷰", unit: "건", color: "#db2777" },
];
const TRAFFIC_KEYS = PLAN_TYPES.map(t => t.k);

const dayDiff = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

// 트래픽 주차 한 줄 — 시작일~종료일 매일 일일량 (주간계획 배분량 계산과 같다)
function spreadTrafficRow(r, out) {
  if (!TRAFFIC_KEYS.includes(r.type)) return; // 상단 카드도 종류 없는 줄은 세지 않는다
  const daily = parseInt(r.daily) || 0;
  if (daily <= 0) return;
  const src = { kind: "traffic", id: r.id, keyword: r.keyword || "" };
  if (r.start && r.end && r.end >= r.start) {
    const n = dayDiff(r.start, r.end) + 1;
    for (let i = 0; i < n; i++) out.push({ date: planAddDays(r.start, i), type: r.type, qty: daily, src });
  } else {
    const q = daily * planDays(r);
    if (q > 0) out.push({ date: null, type: r.type, qty: q, src });
  }
}

// 기간 세팅 한 개(리뷰나우·영수증 리뷰) — 시작일부터 올리는 요일마다 하루 N건씩, 총 건수를 채울 때까지.
// 일시중지면 중지한 날까지만 날짜에 펼치고, 남은 건수는 날짜 미지정으로 둬서 합계가 맞게 한다.
function spreadRun(r, type, out) {
  const total = intOr(r.total, 0);
  if (total <= 0) return;
  const daily = intOr(r.daily, 0);
  const src = { kind: "run", id: r.id };
  let left = total;
  if (r.start && daily > 0) {
    const days = blogDaysOf(r);
    const stop = r.paused && r.pausedAt ? r.pausedAt : null;
    const cur = new Date(r.start + "T00:00:00");
    for (let i = 0; i < 3000 && left > 0; i++) {
      const ds = ymdLocal(cur);
      if (stop && ds > stop) break;
      if (!days || days.includes(cur.getDay())) {
        const q = Math.min(daily, left);
        out.push({ date: ds, type, qty: q, src });
        left -= q;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  if (left > 0) out.push({ date: null, type, qty: left, src: { ...src, reason: r.paused ? "paused" : "nodate" } });
}

// 건별 기록(CMS) — 적힌 날짜에 그대로
function addCms(x, type, out) {
  const q = intOr(x.count, 1);
  if (q <= 0) return;
  out.push({ date: x.date || null, type, qty: q, src: { kind: "cms", id: x.id } });
}

// 계약 하나의 기록 → 날짜별 항목
//   trafficRows: traffic:plan:{id} 배열,  blog / receipt: {runs, cms} (없으면 null)
export function buildEntries({ trafficRows, blog, receipt }) {
  const out = [];
  (trafficRows || []).forEach(r => spreadTrafficRow(r, out));
  [["blog", blog], ["receipt", receipt]].forEach(([type, d]) => {
    if (!d) return;
    (d.runs || []).forEach(r => spreadRun(r, type, out));
    (d.cms || []).forEach(x => addCms(x, type, out));
  });
  return out;
}

const addTo = (obj, type, q) => { obj[type] = (obj[type] || 0) + q; };

// 항목 → {byDate: {날짜: {종류: 수량}}, undated: {종류: 수량}, totals: {종류: 수량}}
export function aggregate(entries) {
  const byDate = {}, undated = {}, totals = {};
  (entries || []).forEach(e => {
    if (e.date) addTo(byDate[e.date] || (byDate[e.date] = {}), e.type, e.qty);
    else addTo(undated, e.type, e.qty);
    addTo(totals, e.type, e.qty);
  });
  return { byDate, undated, totals };
}

// from~to(양끝 포함) 합계. from/to 가 비면 그쪽은 끝까지.
export function sumRange(byDate, from, to) {
  const out = {};
  Object.keys(byDate).forEach(d => {
    if ((from && d < from) || (to && d > to)) return;
    const m = byDate[d];
    Object.keys(m).forEach(k => addTo(out, k, m[k]));
  });
  return out;
}

// 실제로 수량이 있는 종류만, CAL_TYPES 순서대로
export const activeTypes = totals => CAL_TYPES.filter(t => (totals[t.k] || 0) > 0);
export const hasAny = m => !!m && Object.keys(m).some(k => m[k] > 0);

// 계약 시작일부터 7일씩 1주차, 2주차… (트래픽 주간계획의 주차와 같은 기준)
export function contractWeeks(start, end) {
  if (!start || !end || end < start) return [];
  const out = [];
  for (let i = 0, cur = start; cur <= end && i < 200; i++, cur = planAddDays(cur, 7)) {
    const we = planAddDays(cur, 6);
    out.push({ no: i + 1, start: cur, end: we > end ? end : we });
  }
  return out;
}

// 달력 한 달 — 일요일 시작, 7칸씩 줄. 앞뒤 달 날짜도 칸을 채운다(inMonth=false).
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const cur = new Date(year, month, 1 - first.getDay());
  const weeks = [];
  while (weeks.length < 6) {
    const w = [];
    for (let i = 0; i < 7; i++) { w.push({ date: ymdLocal(cur), day: cur.getDate(), dow: cur.getDay(), inMonth: cur.getMonth() === month }); cur.setDate(cur.getDate() + 1); }
    weeks.push(w);
    if (cur.getMonth() !== month) break;
  }
  return weeks;
}

// 날짜 칸 표시(마커). {날짜: [{kind, label, color}]}
// 나중에 "개월차 경계선", "작업세팅 일정" 같은 표시는 여기에 kind 를 하나 더 만들어 넣으면 된다.
export function buildMarkers({ contractStart, contractEnd }) {
  const m = {};
  const add = (d, x) => { if (d) (m[d] || (m[d] = [])).push(x); };
  add(contractStart, { kind: "start", label: "계약 시작", color: "#0071CE" });
  add(contractEnd, { kind: "end", label: "계약 종료", color: "#6b7280" });
  return m;
}
