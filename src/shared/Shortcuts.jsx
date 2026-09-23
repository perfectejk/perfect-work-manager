import React, { useState } from "react";

// ===== 자주 쓰는 외부 사이트 바로가기 =====
// 누르면 새 탭에서 열린다. 아이콘은 각 사이트의 favicon 을 그대로 쓰고,
// 없으면 대체 주소 → 그래도 없으면 글자 아이콘 순으로 넘어간다.
export const SHORTCUTS = [
  { n: "Adlog", url: "https://www.adlog.kr/adlog/" },
  { n: "MarketingMall", url: "https://marketingmall.co.kr/main" },
  { n: "ReviewNow", url: "https://manager.reviewnow.co.kr/" },
  { n: "CMS", url: "https://ad-1.co.kr/cms" },
];

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ""; } };
// ① 그 사이트의 favicon.ico  ② 구글 아이콘 서비스  (ad-1.co.kr 처럼 favicon 이 없는 곳 대비)
const iconSources = (url) => {
  const h = hostOf(url);
  if (!h) return [];
  return [`https://${h}/favicon.ico`, `https://www.google.com/s2/favicons?domain=${h}&sz=64`];
};

export function Favicon({ url, size = 16, name = "" }) {
  const [step, setStep] = useState(0);
  const list = iconSources(url);
  if (step >= list.length) {
    // 아이콘을 못 가져오면 이름 첫 글자로 대신한다
    return (
      <span style={{ width: size, height: size, borderRadius: 4, flexShrink: 0, background: "#eef1f5",
        color: "#6b7280", fontSize: size * 0.6, fontWeight: 800, display: "inline-flex",
        alignItems: "center", justifyContent: "center" }}>{(name || "?").slice(0, 1)}</span>
    );
  }
  return (
    <img src={list[step]} alt="" width={size} height={size} onError={() => setStep((s) => s + 1)}
      style={{ width: size, height: size, borderRadius: 4, objectFit: "contain", flexShrink: 0 }} />
  );
}

export const openSite = (url) => window.open(url, "_blank", "noopener,noreferrer");
