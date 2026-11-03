import React from "react";
import { C, input, btn, fmtDate, WD } from "../shared/ui";
import { setDates, findClash, clashText } from "./recur";

// 스크립트(멘트) 고르기 — 분류별로 묶은 드롭다운
export function ScriptSelect({ scripts, value, onChange, style }) {
  const cats = [...new Set(scripts.map((x) => x.cat || "미분류"))];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={style}>
      <option value="">멘트 선택</option>
      {cats.map((c) => (
        <optgroup key={c} label={c}>
          {scripts.filter((x) => (x.cat || "미분류") === c).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// 세트 교육 입력칸 — 단계별 요일·시간, 첫 세트 주, 세트별 멘트 2개와 순서
export default function SetFields({ steps, onSteps, start, onStart, sets, onSets, scripts, taken = [] }) {
  const label = { display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 5 };
  const sm = input({ padding: "5px 7px", fontSize: 12 });
  const setStep = (i, patch) => onSteps(steps.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const setMent = (k, slot, id) => onSets(sets.map((m, j) => (j === k ? (slot === 0 ? [id, m[1]] : [m[0], id]) : m)));
  // 세트 순서 바꾸기 — 날짜는 그대로 두고 멘트만 위아래로 옮긴다
  const move = (k, dir) => {
    const t = k + dir;
    if (t < 0 || t >= sets.length) return;
    const next = [...sets];
    [next[k], next[t]] = [next[t], next[k]];
    onSets(next);
  };
  const count = sets.length;
  const setCount = (v) => {
    const n = Math.max(1, Math.min(30, parseInt(v) || 1));
    onSets(n > count ? [...sets, ...Array.from({ length: n - count }, () => ["", ""])] : sets.slice(0, n));
  };

  return (
    <>
      <label style={label}>단계별 요일·시간 <span style={{ fontWeight: 600, color: C.faint }}>(다른 기수와 겹치지 않게 바꿀 수 있어요)</span></label>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 9, marginBottom: 12, display: "grid", gap: 5 }}>
        {steps.map((st, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr 70px 96px", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}>{i + 1}</span>
            <input value={st.n} onChange={(e) => setStep(i, { n: e.target.value })} style={sm} />
            <select value={st.wd} onChange={(e) => setStep(i, { wd: Number(e.target.value) })} style={sm}>
              {[1, 2, 3, 4, 5, 6, 0].map((x) => <option key={x} value={x}>{WD[x]}요일</option>)}
            </select>
            <input type="time" value={st.time} onChange={(e) => setStep(i, { time: e.target.value })} style={sm} />
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <label style={label}>첫 세트 시작 주</label>
          <input type="date" value={start} onChange={(e) => onStart(e.target.value)} style={input()} />
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 3 }}>그 주의 월요일부터 단계 요일에 맞춰 잡혀요.</div>
        </div>
        <div>
          <label style={label}>세트 수</label>
          <input type="number" min="1" max="30" value={count} onChange={(e) => setCount(e.target.value)} style={input()} />
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 3 }}>나중에 [+ 세트 추가]로 늘릴 수 있어요.</div>
        </div>
      </div>

      <label style={label}>
        세트별 멘트 <span style={{ fontWeight: 600, color: C.faint }}>(↑↓ 로 순서를 바꾸면 멘트만 옮겨가요)</span>
        <span style={{ float: "right", fontWeight: 600, color: C.faint }}>{count * steps.length}회 만들어짐</span>
      </label>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 9, marginBottom: 14, maxHeight: 300, overflowY: "auto", display: "grid", gap: 7 }}>
        {scripts.length === 0 && <div style={{ fontSize: 11.5, color: C.red }}>스크립트 목록이 비어 있어요. 스크립트 탭에서 멘트를 먼저 추가하면 고를 수 있어요.</div>}
        {sets.map((m, k) => {
          const ds = setDates(start, k + 1, steps);
          const first = ds.length ? [...ds].sort()[0] : "";
          // 이 세트의 단계 중 다른 과정과 겹치는 것
          const clashes = steps.map((st, i) => ({ st, d: ds[i], list: findClash(taken, ds[i], st.time) })).filter((x) => x.list.length);
          return (
            <div key={k} style={{ background: C.soft, borderRadius: 8, padding: "7px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <b style={{ fontSize: 12.5, color: C.title }}>{k + 1}세트</b>
                <span style={{ fontSize: 11, color: C.faint }}>{first ? fmtDate(first) + " 주" : ""}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
                  <button type="button" onClick={() => move(k, -1)} disabled={k === 0} title="위로"
                    style={btn("ghost", { padding: "2px 8px", fontSize: 11 })}>↑</button>
                  <button type="button" onClick={() => move(k, 1)} disabled={k === sets.length - 1} title="아래로"
                    style={btn("ghost", { padding: "2px 8px", fontSize: 11 })}>↓</button>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <ScriptSelect scripts={scripts} value={m[0]} onChange={(id) => setMent(k, 0, id)} style={sm} />
                <ScriptSelect scripts={scripts} value={m[1]} onChange={(id) => setMent(k, 1, id)} style={sm} />
              </div>
              {clashes.map((x, j) => (
                <div key={j} style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{fmtDate(x.d)} {x.st.n} {x.st.time} — {clashText(x.list)}</div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
