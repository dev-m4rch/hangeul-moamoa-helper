// 화면 인식: 게임 화면 프레임(ImageData 모양 {width,height,data})에서 "보유 조각" 카드 3장을 찾고 조각을 읽는다.
// 브라우저(<script>, engine.js 뒤)와 Node(require) 공용.
// ponytail: 보유 조각만 읽는다. 게임판(블록·능력 아이콘) 인식은 블록이 놓인 화면 표본이 있어야 색 기준을 잡을 수 있음.
const Vision = (() => {
  const P = () => (typeof Engine !== 'undefined' ? Engine : require('./engine.js')).PIECES;
  // 조각 칸(분홍·연두 등 채도 높은 색)인가
  const sat = (d, i) => { const mx = Math.max(d[i], d[i + 1], d[i + 2]); return mx - Math.min(d[i], d[i + 1], d[i + 2]) > 70 && mx > 120; };

  // 흰 카드 3장이 세로로 나란히 쌓인 곳을 찾는다. 반환: [{x,y,w,h} x3] 또는 null
  function findCards(img) {
    const g = 4, { width: w, height: h, data: d } = img, gw = (w / g) | 0, gh = (h / g) | 0;
    const white = new Uint8Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = ((y * g + 2) * w + x * g + 2) * 4;
      white[y * gw + x] = Math.min(d[i], d[i + 1], d[i + 2]) > 232 ? 1 : 0;
    }
    // 흰 영역을 덩어리로 묶어 카드 크기·비율인 것만 남긴다
    const boxes = [], st = [];
    for (let s = 0; s < white.length; s++) {
      if (white[s] !== 1) continue;
      let x0 = gw, y0 = gh, x1 = 0, y1 = 0, n = 0; st.push(s); white[s] = 2;
      while (st.length) {
        const k = st.pop(), x = k % gw, y = (k / gw) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && white[k - 1] === 1) { white[k - 1] = 2; st.push(k - 1); }
        if (x < gw - 1 && white[k + 1] === 1) { white[k + 1] = 2; st.push(k + 1); }
        if (y > 0 && white[k - gw] === 1) { white[k - gw] = 2; st.push(k - gw); }
        if (y < gh - 1 && white[k + gw] === 1) { white[k + gw] = 2; st.push(k + gw); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw >= 15 && bw <= 150 && bw / bh > 1.2 && bw / bh < 2.4 && n / (bw * bh) > 0.45) boxes.push({ x0, y0, bw, bh });
    }
    boxes.sort((a, b) => a.y0 - b.y0);
    const near = (a, b) => Math.abs(a.x0 - b.x0) <= 2 && Math.abs(a.bw - b.bw) <= 3 && Math.abs(a.bh - b.bh) <= 3 &&
      b.y0 - (a.y0 + a.bh) >= 0 && b.y0 - (a.y0 + a.bh) < a.bh * 0.5;
    for (const a of boxes) for (const b of boxes) if (near(a, b)) for (const c of boxes) if (near(b, c))
      return [a, b, c].map(o => ({ x: o.x0 * g, y: o.y0 * g, w: o.bw * g, h: o.bh * g }));
    return null;
  }

  // 카드 왼쪽 절반(조각 미리보기)에서 조각을 읽는다. 반환: 조각 id, 못 읽으면 -1
  function readPiece(img, card) {
    const { width: w, data: d } = img;
    const X0 = Math.round(card.x + card.w * 0.03), X1 = Math.round(card.x + card.w * 0.47);
    const Y0 = Math.round(card.y + card.h * 0.04), Y1 = Math.round(card.y + card.h * 0.96);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) if (sat(d, (y * w + x) * 4)) {
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return -1;
    // "사용 완료" 카드는 카드 전체가 파란색이다 → 빈 칸. (가장 큰 조각도 이 영역의 20% 미만)
    if (n * 2 > (X1 - X0) * (Y1 - Y0)) return -1;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // 칸 크기를 몰라도 되도록, 조각의 모든 방향에 대해 테두리 크기가 그 방향의 칸 수 비율과 맞는지 본다
    // 여러 개가 맞으면 칸 수가 가장 많은 격자를 고른다(예: ㅈ 의 3x3 테두리는 1칸짜리로도 읽힘)
    let best = -1, bestCells = 0;
    for (const p of P()) for (const o of p.orients) {
      // 칸 크기는 칸 수가 많은 쪽 변에서 구한다(칸 사이 틈 때문에 생기는 오차가 작음)
      const s = o.w >= o.h ? bw / o.w : bh / o.h;
      if (s < 4 || Math.abs(bw - s * o.w) > s * 0.35 || Math.abs(bh - s * o.h) > s * 0.35) continue;
      let ok = true;
      for (let r = 0; r < o.h && ok; r++) for (let c = 0; c < o.w && ok; c++) {
        let on = 0, all = 0; // 칸 가운데 절반 영역의 과반이 조각 색이면 채워진 칸
        for (let y = Math.round(y0 + (r + 0.25) * s); y < y0 + (r + 0.75) * s; y++)
          for (let x = Math.round(x0 + (c + 0.25) * s); x < x0 + (c + 0.75) * s; x++) { all++; if (sat(d, (y * w + x) * 4)) on++; }
        if ((on * 2 > all) !== !!(o.masks[r] >> c & 1)) ok = false;
      }
      if (ok && o.w * o.h > bestCells) { best = p.id; bestCells = o.w * o.h; }
    }
    return best;
  }
  return { findCards, readPiece };
})();
if (typeof module !== 'undefined') module.exports = Vision;
