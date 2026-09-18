// ===== 공용 부품 ① 한 줄 입력 해석기 =====
// 입력한 문장에서 날짜 · 시간 · 분류를 뽑아낸다. 화면이 없는 순수 함수라 테스트하기 쉽다.
// 인식할 분류 목록(cats)은 쓰는 화면에서 넘겨받는다.
//   · 업무관리 탭 → 자료 유형        · 목록 탭 → 프로젝트 카테고리
import { YMD, parseYMD, addDays, WD } from "./ui";

// 분류 하나가 가질 수 있는 검색어들 (이름 + 이름에서 공백 뺀 것 + 별칭)
const wordsOf = (c) => {
  const name = c.n || c.name || "";
  const extra = c.kw || c.keywords || [];
  return [...new Set([...extra, name, name.replace(/\s/g, "")].filter(Boolean))];
};

/**
 * @param raw   사용자가 입력한 한 줄
 * @param opts  { cats: [{k,n,kw?}], today: "YYYY-MM-DD", fallback: "분류키" }
 * @returns { title, date, dateGuessed, time, cat }
 */
export function quickParse(raw, opts = {}) {
  const cats = opts.cats || [];
  const today = opts.today || YMD(new Date());
  const fallback = opts.fallback ?? null;
  let s = " " + String(raw || "") + " ";
  let date = null, time = "", cat = null;

  // ── 분류: 먼저 #태그, 없으면 문장 안의 단어 ──
  const tag = s.match(/#(\S+)/);
  if (tag) {
    const hit = cats.find((c) => c.k !== fallback && wordsOf(c).some((w) => tag[1].includes(w) || w.includes(tag[1])));
    if (hit) cat = hit.k;
    s = s.replace(tag[0], " ");
  }
  if (!cat) {
    const hit = cats.find((c) => c.k !== fallback && wordsOf(c).some((w) => w && s.includes(w)));
    if (hit) cat = hit.k;
  }

  // ── 날짜 ──
  let m;
  if ((m = s.match(/\s(오늘|내일|모레)\s/))) {
    date = addDays(today, { 오늘: 0, 내일: 1, 모레: 2 }[m[1]]);
    s = s.replace(m[0], " ");
  } else if ((m = s.match(/\s(다음\s?주\s?)?([일월화수목금토])요일\s/))) {
    const want = WD.indexOf(m[2]);
    const dow = parseYMD(today).getDay();
    if (m[1]) {
      // 다음주: 다음 월요일을 기준으로 월~일 주간에서 고른다
      const mon = addDays(today, ((1 - dow + 7) % 7) || 7);
      date = addDays(mon, (want + 6) % 7);
    } else {
      // 이번: 오늘 포함, 돌아오는 그 요일
      date = addDays(today, (want - dow + 7) % 7);
    }
    s = s.replace(m[0], " ");
  } else if ((m = s.match(/\s(\d{1,2})\s?(?:\/|월\s?)(\d{1,2})일?\s/))) {
    const t = parseYMD(today);
    let d = new Date(t.getFullYear(), +m[1] - 1, +m[2]);
    // 두 달 넘게 지난 날짜면 내년으로 본다 (예: 12월에 "1/5" 입력)
    if (YMD(d) < addDays(today, -60)) d = new Date(t.getFullYear() + 1, +m[1] - 1, +m[2]);
    date = YMD(d);
    s = s.replace(m[0], " ");
  }

  // ── 시간 ──
  const pad = (n) => String(n).padStart(2, "0");
  if ((m = s.match(/\s(\d{1,2}):(\d{2})\s/))) {
    time = pad(+m[1]) + ":" + m[2];
    s = s.replace(m[0], " ");
  } else if ((m = s.match(/\s(오전|오후)?\s?(\d{1,2})시(?:\s?(\d{1,2})분|\s?반)?\s/))) {
    let h = +m[2];
    if (m[1] === "오후" && h < 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    // 오전/오후 없이 1~7시는 오후로 본다 (업무 시간 기준)
    if (!m[1] && h >= 1 && h <= 7) h += 12;
    time = pad(h) + ":" + pad(m[0].includes("반") ? 30 : m[3] ? +m[3] : 0);
    s = s.replace(m[0], " ");
  }

  return {
    title: s.replace(/\s+/g, " ").trim(),
    date: date || today,
    dateGuessed: !date,     // 날짜를 못 찾아 오늘로 채운 경우
    time,
    cat: cat ?? fallback,
  };
}

// 미리보기 문구에 쓰는 도움말 — 인식 가능한 표현을 안내한다
export const quickHint = (cats = [], fallback = null) => {
  const tags = cats.filter((c) => c.k !== fallback).map((c) => "#" + ((c.kw && c.kw[0]) || (c.n || "").replace(/\s/g, "")));
  return "날짜: 오늘, 내일, 금요일, 다음주 화요일, 10/5 · 시간: 오후 3시, 3시반, 14:30"
    + (tags.length ? " · 분류: " + tags.join(" ") + " (단어만 써도 인식)" : "");
};
