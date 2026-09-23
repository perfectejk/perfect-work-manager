// ===== 업무관리 탭 전용 저장소 =====
// 모든 키가 wm: 로 시작한다. 기존 PRO 데이터(contracts:all, tasks:, rank:, ce: 등)는
// 여기서 읽지도 쓰지도 않는다.
//
//   wm:types              자료 유형
//   wm:tasks              자료 제작 작업
//   wm:scripts            스크립트
//   wm:programs           교육 과정
//   wm:sessions:{과정id}  교육 회차 — 과정별로 문서를 나눈다.
//                         (예전에 순위 기록을 한 문서에 몰아넣었다가 Firestore 1MB
//                          한도에 걸린 적이 있어, 처음부터 쪼개 둔다)
//   wm:people             사람 이름 목록

export const K = {
  types: "wm:types",
  tasks: "wm:tasks",
  scripts: "wm:scripts",
  programs: "wm:programs",
  people: "wm:people",
  subTypes: "wm:subtypes",
  reportTargets: "wm:reporttargets",
  sessions: (pid) => `wm:sessions:${pid}`,
  sessionsPrefix: "wm:sessions:",
};

// 유형은 처음 열었을 때 바로 쓸 수 있도록 기본값을 준다. (샘플 작업·교육 데이터는 넣지 않는다)
// 색은 기존 앱이 쓰는 브랜드색 계열로 맞춘다.
export const CONTRACT_TYPE = "contract";   // 계약업체 유형의 고유키
export const DEFAULT_TYPES = [
  { k: CONTRACT_TYPE, n: "계약업체", c: "#0891b2", kw: ["업체", "계약"] },
  { k: "script", n: "스크립트·멘트", c: "#0071CE", kw: ["스크립트", "멘트"] },
  { k: "ppt", n: "PPT 자료", c: "#8468D3", kw: ["PPT", "ppt", "피피티", "자료"] },
  { k: "report", n: "보고", c: "#b45309", kw: ["보고"] },
  { k: "etc", n: "기타", c: "#6b7280", kw: [] },
];

// 계약업체 일정의 세부 분류. 유형 관리 창에서 추가·수정할 수 있다.
// kw 는 한 줄 입력에서 자동 인식할 단어.
export const DEFAULT_SUBTYPES = [
  { k: "reward", n: "리워드 세팅", kw: ["리워드"] },
  { k: "blog", n: "블로그 세팅", kw: ["블로그", "블플"] },
  { k: "renew", n: "재연장 연락", kw: ["재연장", "연장"] },
  { k: "etc", n: "기타", kw: [] },
];

// 세부 분류는 여러 개 고를 수 있다 (예: 블로그 + 리워드 동시 세팅).
// 예전에는 subType 한 개만 저장했으므로, 읽을 때 둘 다 받아준다.
export const subTypesOf = (t) => {
  if (!t) return [];
  if (Array.isArray(t.subTypes)) return t.subTypes.filter(Boolean);
  return t.subType ? [t.subType] : [];
};
// 저장할 때는 subTypes 배열로 통일하고, 옛 subType 은 비워 둔다.
export const withSubTypes = (list) => ({ subTypes: (list || []).filter(Boolean), subType: undefined });

// 보고 대상 — 유형과 별개로 "누구에게 보고하는 일인지"를 붙인다. 유형 관리 창에서 수정한다.
export const DEFAULT_REPORT_TARGETS = [
  { k: "kdh", name: "김도현", title: "대표님" },
  { k: "ldh", name: "김도훈", title: "이사님" },
  { k: "lti", name: "이태익", title: "부대표님" },
  { k: "lgh", name: "이건호", title: "이사님" },
];
export const reportLabel = (t) => (t ? (t.name + (t.title ? " " + t.title : "")) : "");

export const STATUS = [["todo", "대기"], ["doing", "진행중"], ["review", "검토"], ["done", "완료"]];
export const SESSION_STATUS = { plan: "예정", done: "완료", skip: "취소" };
export const EDU_COLOR = "#10b981";   // 교육 회차 — 기존 앱의 초록과 통일

// 저장된 유형 목록에 기본 유형이 빠져 있으면 끼워 넣는다.
// (예전에 유형을 저장해 둔 사용자도 "계약업체"가 생기도록)
export function mergeDefaults(saved, defaults) {
  const list = Array.isArray(saved) && saved.length ? [...saved] : [];
  if (!list.length) return [...defaults];
  defaults.forEach((d) => {
    if (list.some((x) => x.k === d.k)) return;
    const etcAt = list.findIndex((x) => x.k === "etc");
    if (etcAt >= 0) list.splice(etcAt, 0, { ...d }); else list.push({ ...d });
  });
  return list;
}

// 한 번에 모든 업무관리 데이터를 읽어온다.
export async function loadAll(st) {
  const [types, tasks, scripts, programs, people, subTypes, reportTargets] = await Promise.all([
    st.get(K.types), st.get(K.tasks), st.get(K.scripts), st.get(K.programs), st.get(K.people),
    st.get(K.subTypes), st.get(K.reportTargets),
  ]);
  const progs = Array.isArray(programs) ? programs : [];
  const keys = await st.list(K.sessionsPrefix);
  const chunks = await Promise.all(keys.map((k) => st.get(k)));
  const sessions = [];
  chunks.forEach((c) => { if (Array.isArray(c)) sessions.push(...c); });
  return {
    types: mergeDefaults(types, DEFAULT_TYPES),
    subTypes: mergeDefaults(subTypes, DEFAULT_SUBTYPES),
    reportTargets: mergeDefaults(reportTargets, DEFAULT_REPORT_TARGETS),
    tasks: Array.isArray(tasks) ? tasks : [],
    scripts: Array.isArray(scripts) ? scripts : [],
    programs: progs,
    people: Array.isArray(people) ? people : [],
    sessions,
  };
}

// 회차는 과정별 문서에 나눠 저장한다.
export async function saveSessionsOf(st, pid, allSessions) {
  await st.set(K.sessions(pid), allSessions.filter((s) => String(s.pid) === String(pid)));
}
export async function removeSessionsOf(st, pid) {
  await st.del(K.sessions(pid));
}
