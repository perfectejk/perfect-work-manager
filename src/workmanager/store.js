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
  sessions: (pid) => `wm:sessions:${pid}`,
  sessionsPrefix: "wm:sessions:",
};

// 유형은 처음 열었을 때 바로 쓸 수 있도록 기본값을 준다. (샘플 작업·교육 데이터는 넣지 않는다)
// 색은 기존 앱이 쓰는 브랜드색 계열로 맞춘다.
export const DEFAULT_TYPES = [
  { k: "script", n: "스크립트·멘트", c: "#0071CE", kw: ["스크립트", "멘트"] },
  { k: "ppt", n: "PPT 자료", c: "#8468D3", kw: ["PPT", "ppt", "피피티", "자료"] },
  { k: "report", n: "보고", c: "#b45309", kw: ["보고"] },
  { k: "etc", n: "기타", c: "#6b7280", kw: [] },
];

export const STATUS = [["todo", "대기"], ["doing", "진행중"], ["review", "검토"], ["done", "완료"]];
export const SESSION_STATUS = { plan: "예정", done: "완료", skip: "취소" };
export const EDU_COLOR = "#10b981";   // 교육 회차 — 기존 앱의 초록과 통일

// 한 번에 모든 업무관리 데이터를 읽어온다.
export async function loadAll(st) {
  const [types, tasks, scripts, programs, people] = await Promise.all([
    st.get(K.types), st.get(K.tasks), st.get(K.scripts), st.get(K.programs), st.get(K.people),
  ]);
  const progs = Array.isArray(programs) ? programs : [];
  const keys = await st.list(K.sessionsPrefix);
  const chunks = await Promise.all(keys.map((k) => st.get(k)));
  const sessions = [];
  chunks.forEach((c) => { if (Array.isArray(c)) sessions.push(...c); });
  return {
    types: Array.isArray(types) && types.length ? types : DEFAULT_TYPES,
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
