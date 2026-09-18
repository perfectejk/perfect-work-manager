import React from "react";
import { C, input, btn, badge } from "../shared/ui";
import { SpTitle, SpSub, Props, PropLabel, Section, CheckList, Textarea } from "../shared/SidePanel";

// ===== 목록 탭 일정 상세 페이지 =====
// 기존 일정 데이터의 구조와 저장 위치는 그대로 두고, 여기서는 값을 보여주고 고칠 뿐이다.
// 새로 쓰는 항목(time / subs / contractId)은 전부 선택 필드라, 예전에 만든 일정도
// 그 값이 없는 채로 문제없이 열린다.
const PRIORITY = [["high", "높음"], ["medium", "중간"], ["low", "낮음"]];
const STATUS = [["todo", "할 일"], ["doing", "진행 중"], ["done", "완료"]];

export default function TaskDetailPanel({ task, contracts, projectCategories, canEdit, onPatch, onDelete }) {
  if (!task) return null;
  const ro = !canEdit;
  const p = (patch) => { if (!ro) onPatch(task, patch); };
  const sel = input({ padding: "5px 7px", fontSize: 12, background: ro ? "#fafbfc" : C.soft, border: "1px solid transparent" });
  const linked = task.contractId ? contracts.find((c) => c.id === task.contractId) : null;
  const st = STATUS.find((x) => x[0] === task.status) || STATUS[0];

  return (
    <>
      <SpTitle value={task.title || ""} readOnly={ro} onChange={(v) => p({ title: v })} />
      <SpSub>
        목록 일정
        {task.owner ? ` · ${task.owner}` : ""}
        {task._sk === "tasks:_pub" ? " · 공용" : ""}
      </SpSub>

      <Props>
        <PropLabel>상태</PropLabel>
        {ro ? <span style={badge(C.text, C.soft)}>{st[1]}</span>
          : <select value={task.status || "todo"} onChange={(e) => p({ status: e.target.value })} style={sel}>
              {STATUS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>}

        <PropLabel>우선순위</PropLabel>
        {ro ? <span style={{ fontSize: 12, color: C.text }}>{(PRIORITY.find((x) => x[0] === task.priority) || PRIORITY[1])[1]}</span>
          : <select value={task.priority || "medium"} onChange={(e) => p({ priority: e.target.value })} style={sel}>
              {PRIORITY.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>}

        <PropLabel>날짜</PropLabel>
        <input type="date" value={task.due || ""} disabled={ro}
          onChange={(e) => p({ due: e.target.value })} style={sel} />

        <PropLabel>시간</PropLabel>
        <input type="time" value={task.time || ""} disabled={ro}
          onChange={(e) => p({ time: e.target.value })} style={sel} />

        <PropLabel>마감일</PropLabel>
        <input type="date" value={task.deadline || ""} disabled={ro}
          onChange={(e) => p({ deadline: e.target.value })} style={sel} />

        <PropLabel>프로젝트</PropLabel>
        {ro ? <span style={{ fontSize: 12, color: C.text }}>{task.project || "—"}</span>
          : <select value={task.project || ""} onChange={(e) => p({ project: e.target.value })} style={sel}>
              <option value="">선택 안 함</option>
              {projectCategories.map((x) => <option key={x} value={x}>{x}</option>)}
              {task.project && !projectCategories.includes(task.project) && <option value={task.project}>{task.project}</option>}
            </select>}

        <PropLabel>연결된 업체</PropLabel>
        {ro ? <span style={{ fontSize: 12, color: C.text }}>{linked ? linked.name : "—"}</span>
          : <select value={task.contractId || ""} onChange={(e) => p({ contractId: e.target.value })} style={sel}>
              <option value="">연결 안 함</option>
              {linked && !contracts.some((c) => c.id === linked.id) && <option value={linked.id}>{linked.name}</option>}
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.startDate ? ` (${c.startDate.slice(2)})` : ""}
                </option>
              ))}
            </select>}
      </Props>

      {linked && (
        <div style={{ background: C.mainBg, border: "1px solid #bfd7f5", borderRadius: 9,
          padding: "9px 11px", marginBottom: 16, fontSize: 11.5, color: C.text, lineHeight: 1.6 }}>
          <b style={{ color: C.main }}>{linked.name}</b>
          {linked.manager ? ` · 담당 ${linked.manager}` : ""}
          {linked.startDate && linked.endDate ? <div style={{ color: C.faint }}>{linked.startDate} ~ {linked.endDate}</div> : null}
        </div>
      )}

      <Section title="상세 메모">
        <Textarea value={task.memo || ""} disabled={ro}
          onChange={(e) => p({ memo: e.target.value })}
          placeholder="이 일정에 대해 자유롭게 적으세요." />
      </Section>

      <Section title="하위 체크리스트"
        count={`${(task.subs || []).filter((x) => x.d).length}/${(task.subs || []).length}`}>
        {ro
          ? ((task.subs || []).length === 0
            ? <p style={{ fontSize: 12, color: C.faint, margin: 0 }}>항목이 없습니다.</p>
            : (task.subs || []).map((a, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: "3px 0", color: a.d ? C.faint : C.text,
                textDecoration: a.d ? "line-through" : "none" }}>{a.d ? "✓ " : "· "}{a.t}</div>
            )))
          : <CheckList items={task.subs || []} onChange={(v) => p({ subs: v })} placeholder="할 일 추가 (입력 후 Enter)" />}
      </Section>

      {canEdit && !task._ir && (
        <button onClick={() => onDelete(task)} style={btn("danger")}>일정 삭제</button>
      )}
      {ro && (
        <div style={{ fontSize: 11, color: C.faint, background: C.soft, borderRadius: 8, padding: "9px 11px", lineHeight: 1.6 }}>
          다른 사람의 일정이라 읽기만 할 수 있습니다.
        </div>
      )}
    </>
  );
}
