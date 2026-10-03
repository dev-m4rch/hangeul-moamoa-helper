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

  // 카드 왼쪽 절반(조각 미리보기)에서 조각을 읽는다.
  // 반환: 조각 id / -2 = "사용 완료" 카드 / -1 = 못 읽음(마우스 포인터에 가려짐 등)
  function readPiece(img, card) {
    const { width: w, data: d } = img;
    // 카드 테두리(선택 중이면 노란 테두리가 생김)를 피하려고 안쪽만 본다
    const X0 = Math.round(card.x + card.w * 0.06), X1 = Math.round(card.x + card.w * 0.46);
    const Y0 = Math.round(card.y + card.h * 0.08), Y1 = Math.round(card.y + card.h * 0.92);
    // 바탕색 = 영역에서 가장 흔한 색. 평소엔 흰색, 조각을 선택 중이면 노란색, 사용 완료면 파란색이다.
    const hist = new Uint32Array(4096); let top = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const i = (y * w + x) * 4, k = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | d[i + 2] >> 4;
      if (++hist[k] > hist[top]) top = k;
    }
    const bg = [(top >> 8) * 16 + 8, (top >> 4 & 15) * 16 + 8, (top & 15) * 16 + 8];
    if (bg[2] - bg[0] > 80) return -2; // 파란 바탕 = "사용 완료" 카드
    // 조각 칸 = 채도가 높고 바탕색과도 확실히 다른 픽셀
    const cell = i => sat(d, i) && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 120;
    // 조각의 테두리 상자. 행(열)마다 조각 색 픽셀 수를 세어, 3개 이상인 줄이 이어진 구간을 찾는다.
    // 칸 사이 틈(3px 이하)은 같은 구간으로 잇고, 4줄 미만의 가는 줄(카드 테두리)은 버린다.
    // 구간이 여럿이면(선택 중인 카드의 짙은 노란 테두리 등) 미리보기 중심에 가장 가까운 것이 조각이다.
    const span = (len, center, count) => {
      const groups = []; let run = 0;
      for (let i = 0; i <= len; i++) {
        if (i < len && count(i) >= 3) { run++; continue; }
        if (run >= 4) {
          const g = groups[groups.length - 1], lo = i - run;
          if (g && lo - g[1] <= 4) g[1] = i - 1; else groups.push([lo, i - 1]);
        }
        run = 0;
      }
      const dist = g => Math.max(g[0] - center, center - g[1], 0);
      return groups.sort((p, q) => dist(p) - dist(q))[0] || null;
    };
    const ry = span(Y1 - Y0, card.y + card.h * 0.5 - Y0, r => { let c = 0; for (let x = X0; x < X1; x++) if (cell(((Y0 + r) * w + x) * 4)) c++; return c; });
    if (!ry) return -1;
    const y0 = Y0 + ry[0], y1 = Y0 + ry[1];
    const rx = span(X1 - X0, card.x + card.w * 0.25 - X0, c => { let n = 0; for (let y = y0; y <= y1; y++) if (cell((y * w + X0 + c) * 4)) n++; return n; });
    if (!rx) return -1;
    const x0 = X0 + rx[0], x1 = X0 + rx[1];
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    // 칸 크기를 몰라도 되도록, 조각의 모든 방향에 대해 테두리 크기가 그 방향의 칸 수 비율과 맞는지 본다
    // 여러 개가 맞으면 칸 수가 가장 많은 격자를 고른다(예: ㅈ 의 3x3 테두리는 1칸짜리로도 읽힘)
    let best = -1, bestCells = 0;
    for (const p of P()) for (const o of p.orients) {
      // 칸 크기는 칸 수가 많은 쪽 변에서 구한다(칸 사이 틈 때문에 생기는 오차가 작음)
      const s = o.w >= o.h ? bw / o.w : bh / o.h;
      if (s < 4 || Math.abs(bw - s * o.w) > s * 0.35 || Math.abs(bh - s * o.h) > s * 0.35) continue;
      // 칸 크기는 카드 폭의 약 7.2%로 일정하다. 이 검사가 없으면 1칸짜리를 2x2로 쪼개 읽거나(광택 때문에 ㄴ 으로 보임)
      // ㄴ 을 큰 1칸으로 읽는 식으로 배율을 착각한다.
      if (Math.abs(s / (card.w * 0.072) - 1) > 0.3) continue;
      let ok = true;
      for (let r = 0; r < o.h && ok; r++) for (let c = 0; c < o.w && ok; c++) {
        let on = 0, all = 0; // 칸 가운데 절반 영역의 과반이 조각 색이면 채워진 칸
        for (let y = Math.round(y0 + (r + 0.25) * s); y < y0 + (r + 0.75) * s; y++)
          for (let x = Math.round(x0 + (c + 0.25) * s); x < x0 + (c + 0.75) * s; x++) { all++; if (cell((y * w + x) * 4)) on++; }
        if ((on * 2 > all) !== !!(o.masks[r] >> c & 1)) ok = false;
      }
      if (ok && o.w * o.h > bestCells) { best = p.id; bestCells = o.w * o.h; }
    }
    return best;
  }
  return { findCards, readPiece };
})();
if (typeof module !== 'undefined') module.exports = Vision;
