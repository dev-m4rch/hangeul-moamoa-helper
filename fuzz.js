// 불변식 검사: solve 결과 판 == 수순을 원래 판에 그대로 재현한 판, 지워지지 않은 줄의 기존 블록은 전부 보존
const assert = require('assert'); const E = require('./engine.js');
let seed = 7; const rnd = n => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32 * n) | 0;
let b = new Array(16).fill(0), turns = 0, resets = 0;
for (let t = 0; t < 400; t++) {
  const dot = rnd(4) === 0, hand = [rnd(19), rnd(19), rnd(19)], ids = dot ? [...hand, 0] : hand;
  const icons = [rnd(16), rnd(16)];
  const r = E.solve(b, ids, { beam: 12, leaf: 6, samples: 4, top: 4, icons, dotIdx: dot ? 3 : undefined });
  let cur = b.slice(); const cleared = new Set();
  for (const s of r.steps) {
    assert.deepEqual(s.before, cur, 'before 불일치');
    assert(E.fits(cur, s.orient, s.r, s.c), '겹침');
    const [nb, cl] = E.place(cur, s.orient, s.r, s.c); assert.deepEqual(cl, s.cleared); cl.forEach(x => cleared.add(x)); cur = nb;
  }
  assert.deepEqual(r.board, cur, '결과 판 불일치');
  for (let row = 0; row < 16; row++) if (!cleared.has(row)) assert.equal(r.board[row] & b[row], b[row], '기존 블록 유실 row ' + row);
  if (r.placed < ids.length) { b = new Array(16).fill(0).map(() => rnd(1024) & rnd(1024)); resets++; } else { b = r.board; turns++; }
}
console.log('fuzz 통과', { turns, resets });
