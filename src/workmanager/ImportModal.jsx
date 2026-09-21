import React, { useState, useEffect, useCallback } from "react";
import { C, FONT, input, btn, badge, modalBg, modalCard, fmtDate, uid } from "../shared/ui";
import { buildPlan } from "./importLegacy";
import { CONTRACT_TYPE } from "./store";

// ===== 기존 일정 가져오기 (슈퍼관리자 전용) =====
// 1) 미리보기를 먼저 보여주고
// 2) 확인 버튼을 눌러야 실제로 저장하고
// 3) 업체 연결에 실패한 목록을 보여줘 직접 연결하게 한다.
// 원본(tasks:...)은 읽기만 하며 절대 고치지 않는다.
export default function ImportModal({ st, contracts, subTypes, existing, today, onDone, onClose }) {
  const [step, setStep] = useState("loading");   // loading | preview | saving | result
  const [plan, setPlan] = useState(null);
  const [legacy, setLegacy] = useState([]);
  const [saved, setSaved] = useState([]);        // 방금 저장한 작업들
  const [links, setLinks] = useState({});        // {작업id: 계약id} — 직접 연결
  const [err, setErr] = useState("");

  const makePlan = useCallback((docs, already) =>
    buildPlan(docs, already, { contracts, subTypes, today, newId: uid }), [contracts, subTypes, today]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 기존 일정 문서들을 읽기만 한다
        const keys = await st.list("tasks:");
        const docs = await Promise.all(keys.map(async (k) => ({ key: k, items: (await st.get(k)) || [] })));
        if (!alive) return;
        setLegacy(docs);
        setPlan(makePlan(docs, existing));
        setStep("preview");
      } catch (e) {
        if (!alive) return;
        setErr("기존 일정을 읽지 못했습니다: " + (e && e.message ? e.message : e));
        setStep("preview");
      }
    })();
    return () => { alive = false; };
  }, [st, existing, makePlan]);

  const run = async () => {
    if (!plan || plan.toAdd.length === 0) return;
    setStep("saving");
    const added = plan.toAdd.map((r) => r.task);
    await onDone([...existing, ...added]);   // wm:tasks 에 덧붙이기만 한다
    setSaved(added);
    setStep("result");
  };

  // 업체 연결 실패분을 직접 연결
  const applyLinks = async () => {
    const ids = Object.keys(links).filter((id) => links[id]);
    if (ids.length === 0) { onClose(); return; }
    const next = [...existing, ...saved].map((t) => {
      if (!links[t.id]) return t;
      return { ...t, contractId: links[t.id], type: CONTRACT_TYPE };
    });
    await onDone(next);
    onClose();
  };

  const label = { display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 };
  const statBox = (n, l, color, bg) => (
    <div key={l} style={{ background: bg, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{l}</div>
    </div>
  );

  const unlinkedSaved = saved.filter((t) => !t.contractId);

  return (
    <div style={modalBg(1300)} onClick={step === "saving" ? undefined : onClose}>
      <div style={modalCard(600)} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.title, marginBottom: 4 }}>기존 일정 가져오기</div>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            목록·캘린더 탭의 일정을 업무관리로 <b>복사</b>합니다. 원본은 그대로 남습니다.
            이미 가져온 일정은 자동으로 건너뛰므로 여러 번 눌러도 중복되지 않습니다.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {step === "loading" && <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.faint }}>기존 일정을 읽는 중…</div>}

          {err && <div style={{ background: C.redBg, border: "1px solid #fecaca", borderRadius: 9, padding: "10px 12px", fontSize: 12, color: C.redDeep, marginBottom: 12 }}>{err}</div>}

          {step === "preview" && plan && (<>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8, marginBottom: 14 }}>
              {statBox(plan.toAdd.length, "옮길 일정", C.main, C.mainBg)}
              {statBox(plan.linkedCount, "업체 연결 성공", "#0891b2", "#ecfeff")}
              {statBox(plan.unlinkedCount, "업체 연결 실패", C.amber, C.amberBg)}
              {statBox(plan.skipped.length, "옮길 수 없음", C.muted, C.soft)}
            </div>

            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.7, background: C.soft, borderRadius: 9, padding: "10px 12px", marginBottom: 14 }}>
              기존 일정 전체 <b>{plan.total}건</b>
              {plan.already.length > 0 && <> · 이미 가져옴 <b>{plan.already.length}건</b>(건너뜀)</>}
              <br />
              날짜와 시간, 내용, 완료 여부를 그대로 가져옵니다. 완료된 지난 일정도 기록으로 함께 옮깁니다.<br />
              프로젝트·우선순위·마감일은 업무관리 작업에 없는 항목이라 옮기지 않습니다.
            </div>

            {plan.skipped.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={label}>옮길 수 없는 일정 {plan.skipped.length}건</div>
                {plan.skipped.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "5px 8px", background: C.soft, borderRadius: 7, marginBottom: 4 }}>
                    <span style={badge(C.muted, C.white, { fontSize: 10 })}>{s.reason}</span>
                    <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                  </div>
                ))}
              </div>
            )}

            {plan.toAdd.length > 0 && (
              <div>
                <div style={label}>옮길 일정 미리보기</div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 9 }}>
                  {plan.toAdd.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12,
                      padding: "7px 10px", borderBottom: `1px solid ${C.soft}` }}>
                      <span style={{ color: C.faint, whiteSpace: "nowrap", fontSize: 11 }}>{fmtDate(r.task.date)}</span>
                      {r.task.status === "done" && <span style={badge(C.greenDeep, C.greenBg, { fontSize: 10 })}>완료</span>}
                      <span style={{ flex: 1, minWidth: 0, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.task.title}</span>
                      {r.task.contractId
                        ? <span style={badge("#0891b2", "#ecfeff", { fontSize: 10 })}>
                            {(contracts.find((c) => c.id === r.task.contractId) || {}).name || "업체"}</span>
                        : r.ambiguous
                          ? <span style={badge(C.amber, C.amberBg, { fontSize: 10 })}>{r.matchedName} 계약 여러 건</span>
                          : <span style={{ fontSize: 10.5, color: C.faint }}>연결 없음</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}

          {step === "saving" && <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: C.faint }}>옮기는 중…</div>}

          {step === "result" && (<>
            <div style={{ background: C.greenBg, border: "1px solid #bbf7d0", borderRadius: 9,
              padding: "11px 13px", fontSize: 12.5, color: C.greenDeep, marginBottom: 14, lineHeight: 1.6 }}>
              <b>{saved.length}건을 가져왔습니다.</b><br />
              기존 목록·캘린더 탭과 원본 데이터는 그대로 남아 있습니다.
            </div>

            {unlinkedSaved.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.muted }}>모든 일정이 업체에 연결되었습니다.</div>
            ) : (<>
              <div style={label}>업체 연결에 실패한 {unlinkedSaved.length}건 — 직접 연결할 수 있습니다</div>
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 8, lineHeight: 1.6 }}>
                지금 고르지 않아도 됩니다. 나중에 각 일정의 상세 화면에서도 연결할 수 있습니다.
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {unlinkedSaved.map((t) => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "1fr 170px", gap: 8,
                    alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: C.faint, fontSize: 11, marginRight: 6 }}>{fmtDate(t.date)}</span>{t.title}
                    </div>
                    <select value={links[t.id] || ""} onChange={(e) => setLinks((p) => ({ ...p, [t.id]: e.target.value }))}
                      style={input({ padding: "5px 7px", fontSize: 11.5 })}>
                      <option value="">연결 안 함</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.startDate ? ` (${c.startDate.slice(2)}~)` : ""}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>)}
          </>)}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          {step === "preview" && (<>
            <button onClick={onClose} style={btn("ghost", { padding: "9px 18px", fontSize: 12.5 })}>취소</button>
            <button onClick={run} disabled={!plan || plan.toAdd.length === 0}
              style={btn("primary", { padding: "9px 18px", fontSize: 12.5,
                opacity: (!plan || plan.toAdd.length === 0) ? 0.5 : 1,
                cursor: (!plan || plan.toAdd.length === 0) ? "not-allowed" : "pointer" })}>
              {plan && plan.toAdd.length > 0 ? `${plan.toAdd.length}건 가져오기` : "가져올 일정 없음"}
            </button>
          </>)}
          {step === "result" && (
            <button onClick={applyLinks} style={btn("primary", { padding: "9px 18px", fontSize: 12.5 })}>
              {Object.values(links).some(Boolean) ? "연결 저장하고 닫기" : "닫기"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
