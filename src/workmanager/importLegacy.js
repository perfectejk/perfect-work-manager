// ===== 기존 목록·캘린더 탭의 일정을 업무관리로 "복사" =====
// 원칙
//  · 원본(tasks:...)은 읽기만 한다. 지우거나 고치지 않는다.
//  · 옮긴 일정에 원본 주소(srcKey)를 함께 남겨, 여러 번 실행해도 중복이 생기지 않는다.
import { findContract, findSubType } from "./contractMatch";
import { CONTRACT_TYPE } from "./store";

// 원본 한 건의 고유 주소 — "{저장문서}#{원본id}"
export const srcKeyOf = (docKey, task) => `${docKey}#${task.id}`;

// 기존 일정 한 건 → 업무관리 작업 한 건
// 프로젝트·우선순위·마감일은 옮기지 않는다 (업무관리 작업에 없는 항목)
export function convertOne(docKey, t, { contracts, subTypes, today, newId }) {
  const title = String(t.title || "").trim();
  const date = String(t.due || "").trim();
  if (!title || !date) return { skipped: true, reason: !title ? "내용 없음" : "날짜 없음", src: t };

  const hay = `${title} ${String(t.memo || "")}`;
  const found = findContract(hay, contracts, today);
  // 후보가 여러 개면 자동으로 고르지 않는다 — 나중에 직접 연결하도록 남긴다
  const contractId = found.contract ? found.contract.id : "";
  const subType = findSubType(hay, subTypes);

  return {
    task: {
      id: newId(),
      title,
      type: contractId ? CONTRACT_TYPE : "etc",
      date,
      time: String(t.time || ""),
      status: t.status === "done" ? "done" : t.status === "doing" ? "doing" : "todo",
      desc: String(t.memo || ""),
      subs: [],
      links: [],
      createdAt: today,
      ...(contractId ? { contractId } : {}),
      ...(subType ? { subType } : {}),
      srcKey: srcKeyOf(docKey, t),
    },
    matchedName: found.name,          // 상호는 찾았는지 (계약을 못 고른 경우 참고용)
    ambiguous: !!found.name && !contractId,
  };
}

/**
 * 미리보기 — 실제로 저장하지 않고 무엇이 옮겨질지 계산만 한다.
 * @param legacyDocs  [{ key, items }]  기존 일정 문서들
 * @param existing    이미 옮겨둔 업무관리 작업 목록 (srcKey 로 중복 확인)
 */
export function buildPlan(legacyDocs, existing, { contracts, subTypes, today, newId }) {
  const done = new Set((existing || []).map((x) => x.srcKey).filter(Boolean));
  const toAdd = [], skipped = [], already = [];

  (legacyDocs || []).forEach(({ key, items }) => {
    (items || []).forEach((t) => {
      if (done.has(srcKeyOf(key, t))) { already.push({ key, task: t }); return; }
      const r = convertOne(key, t, { contracts, subTypes, today, newId });
      if (r.skipped) skipped.push({ key, reason: r.reason, title: t.title || "(제목 없음)" });
      else toAdd.push(r);
    });
  });

  const linked = toAdd.filter((r) => !!r.task.contractId);
  const unlinked = toAdd.filter((r) => !r.task.contractId);
  return {
    total: toAdd.length + skipped.length + already.length,
    toAdd,
    skipped,
    already,
    linkedCount: linked.length,
    unlinkedCount: unlinked.length,
    ambiguousCount: toAdd.filter((r) => r.ambiguous).length,
  };
}
