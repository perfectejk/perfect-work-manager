// ===== 대시보드 위젯 자리 계산 =====
// 위젯마다 격자 위치(x = 왼쪽에서 몇 칸, y = 위에서 몇 줄)와 크기(w, h)를 들고 있다.
// 순서대로 밀어 넣지 않고 저장된 자리에 그대로 두기 때문에, 오른쪽 아래처럼
// 빈 곳을 남겨 두고 배치할 수 있다.

export const ROW_H = 30;   // 세로 한 줄 높이(px)
export const GAP = 12;     // 칸 사이 간격(px)

const key = (x, y) => x + "," + y;

// 그 자리에 이미 다른 카드가 있는지
export function hits(occ, x, y, w, h) {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (occ.has(key(x + i, y + j))) return true;
  return false;
}
export function mark(occ, x, y, w, h) {
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) occ.add(key(x + i, y + j));
}

/**
 * 저장된 자리를 최대한 지키면서 겹치지 않게 실제 자리를 정한다.
 * · 칸 수가 줄어든 화면에서는 폭과 위치를 안으로 당긴다
 * · 그래도 겹치면 아래로 한 줄씩 내린다 (빈 곳은 그대로 둔다)
 * · 자리 정보가 없는 예전 배치는 위에서부터 차례로 채운다
 */
export function resolveLayout(list, cols) {
  const occ = new Set();
  const out = [];
  const sorted = [...list].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

  sorted.forEach((it) => {
    const w = Math.max(1, Math.min(it.w || 1, cols));
    const h = Math.max(3, it.h || 6);
    let x, y;
    if (it.x == null || it.y == null) {
      // 예전 배치 — 빈 자리를 위에서부터 찾는다
      outer: for (y = 0; y < 400; y++) {
        for (x = 0; x + w <= cols; x++) if (!hits(occ, x, y, w, h)) break outer;
      }
    } else {
      x = Math.max(0, Math.min(it.x, cols - w));
      y = Math.max(0, it.y);
      let guard = 0;
      while (hits(occ, x, y, w, h) && guard++ < 400) y++;
    }
    mark(occ, x, y, w, h);
    out.push({ ...it, x, y, w, h });
  });
  return out;
}

// 격자 전체가 몇 줄인지 (편집 중에는 아래에 여유를 더 준다)
export const totalRows = (placed, extra) =>
  Math.max(8, ...placed.map((p) => p.y + p.h)) + (extra || 0);

// 화면 좌표 → 격자 칸
export function cellFromPoint(gridEl, clientX, clientY, cols) {
  const r = gridEl.getBoundingClientRect();
  const cellW = (r.width - GAP * (cols - 1)) / cols;
  const x = Math.floor((clientX - r.left) / (cellW + GAP));
  const y = Math.floor((clientY - r.top) / (ROW_H + GAP));
  return { x, y, cellW };
}
