// ===== 한 줄 입력에서 계약(업체) 찾아내기 =====
// 계약은 고유 식별값 id 로 연결한다. 상호명(name)은 화면에 보여줄 때만 쓴다.
// 상호가 바뀌어도 연결이 끊어지지 않는다.

// 띄어쓰기와 대소문자를 지운 형태로 비교한다. ("OO 상회" = "OO상회")
export const normName = (s) => String(s || "").replace(/\s/g, "").toLowerCase();

// 계약이 지금 진행중인지 — 해지/조기완료가 아니고 종료일이 지나지 않음
export const isRunningContract = (c, today) =>
  !!c && !c.cancelled && !c.earlyDone && String(c.endDate || "") >= today;

/**
 * 문장에서 계약 상호를 찾는다.
 * 같은 상호의 계약이 여러 건이면(재연장) 진행중인 것을 우선 고른다.
 *
 * @returns {{ name, all, contract, candidates }}
 *   name       찾은 상호명 (없으면 "")
 *   all        그 상호의 계약 전부
 *   contract   자동으로 고른 계약 (못 고르면 null)
 *   candidates 골라야 할 후보 목록 (자동으로 골랐으면 빈 배열)
 */
export function findContract(text, contracts, today) {
  const hay = normName(text);
  if (!hay) return { name: "", all: [], contract: null, candidates: [] };

  // 상호가 긴 것부터 본다 — "리버스바디"와 "리버스바디강남점"이 함께 있으면 긴 쪽이 맞다
  const names = [...new Set((contracts || []).map((c) => String(c.name || "")).filter(Boolean))]
    .sort((a, b) => normName(b).length - normName(a).length);

  const hitName = names.find((n) => normName(n) && hay.includes(normName(n)));
  if (!hitName) return { name: "", all: [], contract: null, candidates: [] };

  const all = contracts.filter((c) => normName(c.name) === normName(hitName));
  if (all.length === 1) return { name: hitName, all, contract: all[0], candidates: [] };

  // 여러 건이면 진행중인 계약을 자동 선택. 진행중이 없거나 둘 이상이면 직접 고르게 한다.
  const running = all.filter((c) => isRunningContract(c, today));
  if (running.length === 1) return { name: hitName, all, contract: running[0], candidates: [] };

  const candidates = [...all].sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
  return { name: hitName, all, contract: null, candidates };
}

// 세부 분류 자동 인식 — 문장에 든 단어로 찾는다.
// 블로그와 리워드를 함께 세팅하는 경우가 있어 여러 개를 찾는다.
export function findSubTypes(text, subTypes) {
  const hay = normName(text);
  if (!hay) return [];
  return (subTypes || []).filter((s) => {
    if (s.k === "etc") return false;   // '기타'는 자동으로 붙이지 않는다
    const words = [...(s.kw || []), s.n].filter(Boolean);
    return words.some((w) => normName(w) && hay.includes(normName(w)));
  }).map((s) => s.k);
}

/**
 * 문장에서 찾은 상호의 계약 중 고를 수 있는 목록.
 * 진행중인 계약을 앞에 둔다. 한 건이면 그 한 건만 돌려준다.
 */
export function contractOptions(text, contracts, today) {
  const r = findContract(text, contracts, today);
  if (!r.name) return { name: "", options: [] };
  const running = r.all.filter((c) => isRunningContract(c, today));
  const ended = r.all.filter((c) => !isRunningContract(c, today));
  const sortByStart = (a, b) => String(b.startDate || "").localeCompare(String(a.startDate || ""));
  return { name: r.name, options: [...running.sort(sortByStart), ...ended.sort(sortByStart)], runningCount: running.length };
}
