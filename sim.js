// 자가 대국 + 규칙 자체 검사. 사용: node sim.js [판수] [최대턴] [가중치 JSON]
const assert = require('assert');
const E = require('./engine.js');

// --- 규칙 검사 ---
assert.equal(E.PIECES.length, 19);
assert.deepEqual(E.PIECES.map(p => p.size), [1, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 9, 10, 10]);
assert.equal(E.PIECES[0].orients.length, 1);
assert.equal(E.PIECES[4].orients.length, 8); // ㄱ(L 테트로미노)
assert.equal(E.PIECES[13].orients.length, 1); // ㅁ
{
  // ㅣ(5칸) 두 개로 맨 아랫줄 완성 → 줄 삭제, 다른 줄은 내려오지 않음
  const b = new Array(16).fill(0); b[3] = 0b1;
  const r = E.solve(b, [8, 8], { beam: 200 });
  assert.equal(r.placed, 2);
  assert.equal(r.gain, 5 + 5 + 300);
  assert.equal(r.board[3], 1);
  // 꽉 찬 판에서는 놓을 수 없음
  assert.equal(E.solve(new Array(16).fill(E.FULL ^ 1), [5]).placed, 0); // ㅗ는 1칸 폭 기둥에 못 들어감
}
console.log('규칙 검사 통과');

// --- 자가 대국 ---
function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32; }
function play(seed, maxTurns, opts) {
  const rand = rng(seed);
  let b = new Array(16).fill(0), score = 0, turns = 0;
  while (turns < maxTurns) {
    const hand = [0, 0, 0].map(() => (rand() * 19) | 0);
    const r = E.solve(b, hand, opts);
    score += r.steps.reduce((s, st) => s + (E.PIECES[st.piece].size + 300 * st.cleared.length ** 2), 0);
    if (r.placed < 3) break; // 능력 없이 끝까지 가는 보수적 측정
    b = r.board; turns++;
  }
  return { score, turns };
}
if (require.main === module) {
  const games = +process.argv[2] || 10, maxTurns = +process.argv[3] || 300;
  const weights = { ...E.WT, ...(process.argv[4] ? JSON.parse(process.argv[4]) : {}) };
  const beam = +process.argv[5] || 60, samples = +process.argv[6] || 0, top = +process.argv[7] || 6;
  const t = Date.now(); let S = 0, T = 0, alive = 0;
  for (let g = 0; g < games; g++) { const r = play(g + 1, maxTurns, { weights, beam, samples, top }); S += r.score; T += r.turns; alive += r.turns >= maxTurns; }
  console.log(JSON.stringify({ avgScore: Math.round(S / games), avgTurns: T / games, alive, games, msPerTurn: Math.round((Date.now() - t) / Math.max(T, 1)) }));
}
