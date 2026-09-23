// ===== 보고 대상 =====
// 보고는 자료 유형 중 하나가 아니라, 어떤 유형이든 함께 하게 되는 일이라 별도 항목으로 둔다.
// 한 줄 입력에서 이름이나 직급을 찾아 연결하고, 찾은 말은 제목에서 빼준다.
//
// 규칙
//  · 이름이 가장 확실하므로 먼저 본다 (뒤에 직급·조사가 붙어 있으면 같이 뺀다)
//  · 직급만 쓴 경우에는 그 직급을 가진 사람이 한 명일 때만 자동으로 잡는다
//    ("이사님"처럼 두 명이면 직접 고르게 둔다)
//  · 긴 말을 먼저 뺀다 — "부대표님"을 "대표님"보다 먼저 봐야 잘못 걸리지 않는다

const PARTICLES = ["한테는", "에게는", "한테", "에게", "께는", "께", "님께", "보고드리기", "보고"];

// 지울 말 + 뒤에 붙는 조사까지 함께 지운다. (정규식 없이 문자열로 처리)
function strip(text, phrase) {
  let s = text;
  let changed = false;
  for (;;) {
    const i = s.indexOf(phrase);
    if (i < 0) break;
    let end = i + phrase.length;
    // 바로 뒤에 붙은 조사도 함께 지운다 ("대표님한테" → 통째로)
    for (const p of PARTICLES) {
      if (p === "보고" || p === "보고드리기") continue;   // '보고'는 제목에 남겨 둔다
      if (s.startsWith(p, end)) { end += p.length; break; }
    }
    s = s.slice(0, i) + " " + s.slice(end);
    changed = true;
  }
  return { text: s, changed };
}

/**
 * @param text     한 줄 입력에서 뽑아낸 제목
 * @param targets  [{k, name, title}]
 * @returns { targets:[k], cleaned }  cleaned = 이름·직급을 뺀 제목
 */
export function extractReportTargets(text, targets) {
  let s = " " + String(text || "") + " ";
  const list = (targets || []).filter((t) => t && t.name);
  const hit = [];
  const add = (k) => { if (!hit.includes(k)) hit.push(k); };

  // ① 이름 + 직급 (가장 긴 형태부터)
  [...list]
    .sort((a, b) => (b.name + (b.title || "")).length - (a.name + (a.title || "")).length)
    .forEach((t) => {
      if (t.title) {
        const r = strip(s, t.name + " " + t.title);
        if (r.changed) { s = r.text; add(t.k); }
        const r2 = strip(s, t.name + t.title);
        if (r2.changed) { s = r2.text; add(t.k); }
      }
      const r3 = strip(s, t.name);
      if (r3.changed) { s = r3.text; add(t.k); }
    });

  // ② 직급만 쓴 경우 — 그 직급이 한 명뿐일 때만. 긴 직급을 먼저 본다.
  const byTitle = {};
  list.forEach((t) => { if (t.title) (byTitle[t.title] = byTitle[t.title] || []).push(t); });
  Object.keys(byTitle)
    .sort((a, b) => b.length - a.length)
    .forEach((title) => {
      const owners = byTitle[title];
      if (owners.length !== 1) return;   // 두 명 이상이면 건드리지 않는다
      const r = strip(s, title);         // (제목에도 남겨 둬야 누구인지 직접 고를 수 있다)
      if (!r.changed) return;
      s = r.text;
      add(owners[0].k);
    });

  return { targets: hit, cleaned: s.replace(/\s+/g, " ").trim() };
}
