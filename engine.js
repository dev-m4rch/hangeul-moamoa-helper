// 한글 모아모아 엔진: 규칙 + 빔 탐색. 브라우저(<script>)와 Node(require) 공용.
// 규칙: 10x16, 가로줄만 삭제, 삭제 후 중력 없음, 점수 = 칸 수 + 300*n^2 (+ 능력 획득 50)
const W = 10, H = 16, FULL = (1 << W) - 1;

const PIECES = [
  ['·', ['X']],
  ['ㅅ', ['.X.', 'X.X']],
  ['ㅡ', ['XXX']],
  ['ㄴ', ['X.', 'XX']],
  ['ㄱ', ['XXX', 'X..']],
  ['ㅗ', ['.X.', 'XXX']],
  ['ㅇ', ['.X.', 'X.X', '.X.']],
  ['ㄷ', ['XX', 'X.', 'XX']],
  ['ㅣ', ['XXXXX']],
  ['ㅈ', ['XXX', '.X.', 'X.X']],
  ['ㅋ', ['XX', '.X', 'XX', '.X']],
  ['ㅑ', ['X.', 'XX', 'X.', 'XX', 'X.']],
  ['ㅊ', ['.X.', 'XXX', '.X.', 'X.X']],
  ['ㅁ', ['XXX', 'X.X', 'XXX']],
  ['ㄹ', ['XX', '.X', 'XX', 'X.', 'XX']],
  ['ㅌ', ['XX', 'X.', 'XX', 'X.', 'XX']],
  ['ㅎ', ['..X..', 'XXXXX', '.X.X.', '..X..']],
  ['ㅂ', ['X.X', 'XXX', 'X.X', 'XXX']],
  ['ㅒ', ['X.X', 'XXX', 'XXX', 'X.X']],
].map(([name, rows], id) => {
  // 회전 4 x 반전 2 → 중복 제거
  const seen = new Set(), orients = [];
  let g = rows.map(r => [...r].map(c => c === 'X'));
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      const key = g.map(row => row.map(c => +c).join('')).join('/');
      if (!seen.has(key)) {
        seen.add(key);
        orients.push({ h: g.length, w: g[0].length, rot: r, flip: f,
          masks: g.map(row => row.reduce((m, c, x) => m | (c << x), 0)) });
      }
      g = g[0].map((_, x) => g.map(row => row[x]).reverse()); // 시계방향 90도
    }
    g = g.map(row => [...row].reverse());
  }
  return { id, name, size: rows.join('').split('X').length - 1, base: rows, orients };
});

const POP = new Uint8Array(1 << W);
for (let i = 1; i < POP.length; i++) POP[i] = POP[i >> 1] + (i & 1);

function fits(b, o, r, c) {
  for (let i = 0; i < o.h; i++) if (b[r + i] & (o.masks[i] << c)) return false;
  return true;
}
function canPlace(b, p) {
  for (const o of p.orients)
    for (let r = 0; r + o.h <= H; r++)
      for (let c = 0; c + o.w <= W; c++) if (fits(b, o, r, c)) return true;
  return false;
}
// 놓고 줄 삭제. 반환: [새 판, 지워진 행 목록]
function place(b, o, r, c) {
  const nb = b.slice(), cleared = [];
  for (let i = 0; i < o.h; i++) {
    nb[r + i] |= o.masks[i] << c;
    if (nb[r + i] === FULL) { nb[r + i] = 0; cleared.push(r + i); }
  }
  return [nb, cleared];
}

// 가중치: sim.js 자가 대국으로 조정한 값
const WT = { rowBase: 20, rowEmpty: 6, rowTr: 12, colTr: 6, hole1: 60, open3: 4, cap3: 30, dead: 400, deadBig: 5, mobCap: 4 };

// 판 평가(높을수록 좋음). 중력이 없으므로 "적은 줄에 몰아 채우고, 넓은 빈 공간을 남긴 판"이 좋은 판.
function evaluate(b, w = WT) {
  let v = 0, open3 = 0;
  for (let r = 0; r < H; r++) {
    const row = b[r], n = POP[row];
    // 손댄 줄은 빈 칸이 많을수록 비용 → 여러 줄에 흩뿌리지 않고 한 줄씩 끝낸다
    if (n) v -= w.rowBase + w.rowEmpty * (W - n);
    // 가로 경계(벽은 채워진 것으로 봄): 줄이 들쭉날쭉할수록 완성하기 어렵다
    v -= w.rowTr * (POP[(row ^ ((row << 1) | 1)) & FULL] + (row >> (W - 1) & 1 ^ 1));
    const up = r ? b[r - 1] : FULL, down = r < H - 1 ? b[r + 1] : FULL;
    v -= w.colTr * POP[row ^ up];
    // 사방이 막힌 빈 칸 1개: 점 찍기나 대각선 조각 없이는 메울 수 없음
    v -= w.hole1 * POP[~row & FULL & ((row << 1) | 1) & ((row >> 1) | (1 << (W - 1))) & up & down];
    // 3x3 빈 공간이 들어가는 자리 수: 큰 조각(ㅁ ㅂ ㅒ ㅎ)을 받을 여유
    if (r + 2 < H) { const m = ~(row | b[r + 1] | b[r + 2]) & FULL; open3 += POP[m & (m >> 1) & (m >> 2)]; }
  }
  v -= w.colTr * POP[b[H - 1] ^ FULL];
  return v + w.open3 * Math.min(open3, w.cap3);
}
// 다음 손패 대비: 조각별로 놓을 자리가 적을수록 벌점(큰 조각일수록 자주 문제)
function mobility(b, w = WT) {
  let v = 0;
  for (const p of PIECES) {
    let n = 0;
    scan: for (const o of p.orients)
      for (let r = 0; r + o.h <= H; r++)
        for (let c = 0; c + o.w <= W; c++) if (fits(b, o, r, c) && ++n >= w.mobCap) break scan;
    v -= (w.dead + w.deadBig * p.size) * (1 - n / w.mobCap) ** 2 * (n ? 1 : 2);
  }
  return v;
}

function perms(a) {
  if (a.length < 2) return [a];
  const out = [], used = new Set();
  a.forEach((x, i) => {
    if (used.has(x)) return; used.add(x);
    for (const p of perms([...a.slice(0, i), ...a.slice(i + 1)])) out.push([x, ...p]);
  });
  return out;
}

// hand: 조각 id 배열(1~4개). opts.icons: 능력 아이콘이 있는 행 번호 배열, opts.free: 점수 없는 조각 id(점 찍기)
// 반환: { steps:[{piece, orient, r, c, cleared, before}], board, gain, placed } — 전부 못 놓으면 놓을 수 있는 만큼.
function solve(board, hand, opts = {}) {
  const beam = opts.beam || 60, w = opts.weights || WT;
  const iconVal = opts.iconValue ?? 250; // 능력 1개의 가치(50점 + 생존 보험)
  const cands = new Map(); // 최종 판 → 후보(같은 판이면 점수 높은 쪽)
  let best = null;
  for (const order of perms(hand.map((id, i) => (opts.dotIdx === i ? -1 : id)))) {
    let level = [{ b: board, gain: 0, steps: [], icons: opts.icons || [] }];
    for (let d = 0; d < order.length; d++) {
      const isDot = order[d] === -1, p = PIECES[isDot ? 0 : order[d]];
      const next = new Map();
      for (const s of level) {
        for (const o of p.orients)
          for (let r = 0; r + o.h <= H; r++)
            for (let c = 0; c + o.w <= W; c++) {
              if (!fits(s.b, o, r, c)) continue;
              const [nb, cleared] = place(s.b, o, r, c);
              const got = cleared.filter(x => s.icons.includes(x));
              const gain = s.gain + (isDot ? 0 : p.size) + 300 * cleared.length ** 2 + iconVal * got.length;
              const key = nb.join(',');
              const old = next.get(key);
              if (old && old.gain >= gain) continue;
              next.set(key, { b: nb, key, gain, h: gain + evaluate(nb, w), prev: s,
                icons: got.length ? s.icons.filter(x => !got.includes(x)) : s.icons,
                step: { piece: p.id, dot: isDot, orient: o, r, c, cleared, before: s.b } });
            }
      }
      if (!next.size) break; // 이 순서로는 더 못 놓음
      level = [...next.values()].sort((a, b) => b.h - a.h).slice(0, beam);
      // 부분 배치도 후보(전부 놓는 수가 없을 때 대비). 놓은 개수가 많을수록 우선.
      const fin = d === order.length - 1;
      for (const s of fin ? level.slice(0, opts.leaf || 12) : level.slice(0, 1)) {
        const total = s.h + (fin ? mobility(s.b, w) : 0);
        if (fin) { const o = cands.get(s.key); if (!o || o.total < total) cands.set(s.key, { total, node: s }); }
        if (!best || d + 1 > best.placed || (d + 1 === best.placed && total > best.total)) best = { total, node: s, placed: d + 1 };
      }
    }
  }
  if (!best) return { steps: [], board, gain: 0, placed: 0, total: -DEATH * hand.length };
  // 미리보기: 상위 후보마다 무작위 다음 손패 몇 개를 실제로 풀어 보고 평균이 가장 좋은 판을 고른다
  if (opts.samples && best.placed === hand.length) {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 * PIECES.length) | 0;
    const hands = Array.from({ length: opts.samples }, () => [rnd(), rnd(), rnd()]);
    const top = [...cands.values()].sort((a, b) => b.total - a.total).slice(0, opts.top || 6);
    for (const cnd of top) {
      let sum = 0;
      for (const h of hands) sum += solve(cnd.node.b, h, { beam: 4, leaf: 2, weights: w }).total;
      cnd.look = cnd.node.gain + sum / hands.length;
    }
    const b2 = top.reduce((a, b) => (b.look > a.look ? b : a));
    best = { ...b2, placed: hand.length };
  }
  const steps = [];
  for (let n = best.node; n.step; n = n.prev) steps.unshift(n.step);
  return { steps, board: best.node.b, gain: best.node.gain, placed: best.placed,
    total: best.total - DEATH * (hand.length - best.placed) };
}
const DEATH = 3000; // 조각 하나를 못 놓는 상황의 벌점(미리보기용)

const Engine = { W, H, FULL, PIECES, fits, canPlace, place, evaluate, mobility, solve, WT };
if (typeof module !== 'undefined') module.exports = Engine;
