import React, { useState, useMemo } from "react";
import QuickAddBar from "../shared/QuickAddBar";
import { C, btn, fmtDate } from "../shared/ui";

// ===== 목록 탭 한 줄 입력 =====
// 공용 부품 ①(QuickAddBar)을 쓰고, 여기에 "업체명 자동 인식"만 얹는다.
// 분류는 목록 탭이 원래 쓰던 프로젝트 카테고리를 그대로 넘겨받는다.
//
// 업체명이 여러 개 걸리면 자동으로 고르지 않고 후보를 보여주고 고르게 한다.
export default function TaskQuickAdd({ projectCategories = [], contracts = [], today, onAdd }) {
  const [pending, setPending] = useState(null);   // {parsed, candidates}

  // 프로젝트 카테고리를 분류 목록 형태로 바꾼다 (없으면 태그 인식 생략)
  const cats = useMemo(
    () => projectCategories.filter(Boolean).map((p) => ({ k: p, n: p, c: C.sub })),
    [projectCategories]
  );

  // 제목 안에 들어 있는 업체명 찾기 — 긴 이름부터 본다
  const matchContracts = (title) => {
    const t = String(title || "");
    const seen = new Set();
    return contracts
      .filter((c) => c.name && String(c.name).trim())
      .slice()
      .sort((a, b) => b.name.length - a.name.length)
      .filter((c) => {
        if (!t.includes(c.name)) return false;
        if (seen.has(c.name)) return false;   // 같은 상호의 재연장 계약은 한 번만
        seen.add(c.name);
        return true;
      });
  };

  const handleAdd = (parsed) => {
    const hits = matchContracts(parsed.title);
    if (hits.length === 1) { onAdd(parsed, hits[0].id); return; }
    if (hits.length > 1) { setPending({ parsed, candidates: hits }); return; }
    onAdd(parsed, "");
  };

  return (
    <>
      <TaskQuickAddBarWrap cats={cats} today={today} onAdd={handleAdd} hasCats={cats.length > 0} />

      {pending && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
          padding: "11px 14px", marginBottom: 12, fontFamily: "'Pretendard',-apple-system,sans-serif" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#92400e", marginBottom: 3 }}>
            업체명이 여러 개 있습니다. 어느 업체와 연결할까요?
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 9 }}>
            {pending.parsed.title} · {fmtDate(pending.parsed.date)}{pending.parsed.time ? " " + pending.parsed.time : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {pending.candidates.map((c) => (
              <button key={c.id} onClick={() => { onAdd(pending.parsed, c.id); setPending(null); }}
                style={btn("primary", { padding: "6px 13px", fontSize: 11.5 })}>
                {c.name}{c.manager ? ` · ${c.manager}` : ""}
              </button>
            ))}
            <button onClick={() => { onAdd(pending.parsed, ""); setPending(null); }}
              style={btn("ghost", { padding: "6px 13px", fontSize: 11.5 })}>연결 안 함</button>
            <button onClick={() => setPending(null)}
              style={btn("ghost", { padding: "6px 13px", fontSize: 11.5 })}>취소</button>
          </div>
        </div>
      )}
    </>
  );
}

// 안내 문구만 목록 탭에 맞게 바꿔 끼운다
function TaskQuickAddBarWrap({ cats, today, onAdd, hasCats }) {
  return (
    <QuickAddBar
      cats={cats}
      fallback={null}
      today={today}
      onAdd={onAdd}
      placeholder={hasCats
        ? "한 줄로 일정을 추가하세요.  예) 금요일 오후 2시 OO상회 순위 리포트 발송 #프로젝트"
        : "한 줄로 일정을 추가하세요.  예) 금요일 오후 2시 OO상회 순위 리포트 발송"}
    />
  );
}
