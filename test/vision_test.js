// 화면 인식 검사: 실제 게임 화면 캡처(test/panel.png)에서 보유 조각 ㄱ ㅈ ㄹ 을 읽어내는지. 사용: node test/vision_test.js
const assert = require('assert'), fs = require('fs'), zlib = require('zlib'), path = require('path');
const V = require('../vision.js'), { PIECES } = require('../engine.js');

// 최소 PNG 디코더(8비트 RGBA, 비인터레이스)
function png(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('latin1', p + 4, p + 8), body = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); assert.deepEqual([body[8], body[9], body[12]], [8, 6, 0], 'RGBA 8비트만 지원'); }
    if (type === 'IDAT') idat.push(body);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp, out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0, u = y ? out[(y - 1) * stride + i] : 0, c = i >= bpp && y ? out[(y - 1) * stride + i - bpp] : 0;
      const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c);
      out[y * stride + i] = raw[y * (stride + 1) + 1 + i] + [0, a, u, (a + u) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? u : c][f];
    }
  }
  return { width: w, height: h, data: out };
}
// 배율 k 로 키우고(최근접) 어두운 바탕의 (ox, oy)에 붙인다: 창 위치·화면 배율이 달라도 되는지 확인
function embed(img, k, ox, oy) {
  const w = Math.round(img.width * k) + ox + 40, h = Math.round(img.height * k) + oy + 40, data = new Uint8Array(w * h * 4).fill(30);
  for (let y = 0; y < Math.round(img.height * k); y++) for (let x = 0; x < Math.round(img.width * k); x++) {
    const s = (Math.min(img.height - 1, (y / k) | 0) * img.width + Math.min(img.width - 1, (x / k) | 0)) * 4;
    data.set(img.data.subarray(s, s + 4), ((y + oy) * w + x + ox) * 4);
  }
  return { width: w, height: h, data };
}
const src = png(path.join(__dirname, 'panel.png'));
for (const [k, ox, oy] of [[1, 0, 0], [1, 301, 77], [1.25, 13, 250], [1.5, 120, 9], [2, 3, 3], [0.8, 50, 50]]) {
  const img = embed(src, k, ox, oy), cards = V.findCards(img);
  assert(cards, `카드 못 찾음 (배율 ${k})`);
  const names = cards.map(c => { const id = V.readPiece(img, c); return id < 0 ? '?' : PIECES[id].name; });
  assert.deepEqual(names, ['ㄱ', 'ㅈ', 'ㄹ'], `배율 ${k}: ${names}`);
}
// 19종의 모든 방향을 카드에 그려 넣고 다시 읽는다(칸 11px + 틈 1px, 실제 화면과 같은 배치)
for (const p of PIECES) for (const o of p.orients) {
  const w = 220, h = 140, card = { x: 20, y: 20, w: 164, h: 100 }, data = new Uint8Array(w * h * 4).fill(30);
  const fill = (x0, y0, x1, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([...rgb, 255], (y * w + x) * 4); };
  fill(card.x, card.y, card.x + card.w, card.y + card.h, [252, 253, 253]);
  fill(card.x + 95, card.y + 30, card.x + 155, card.y + 50, [20, 150, 240]); // 회전 버튼 자리의 파란색은 무시해야 함
  const px = card.x + 40 - o.w * 6, py = card.y + 50 - o.h * 6;
  o.masks.forEach((m, r) => { for (let c = 0; c < o.w; c++) if (m >> c & 1) fill(px + c * 12, py + r * 12, px + c * 12 + 11, py + r * 12 + 11, [240, 90, 170]); });
  assert.equal(V.readPiece({ width: w, height: h, data }, card), p.id, `${p.name} 방향 ${p.orients.indexOf(o)}`);
}
// "사용 완료" 카드(전체가 파란색)는 조각이 아니라 빈 칸으로 읽어야 한다 (실제 화면 캡처)
{
  const used = png(path.join(__dirname, 'used.png'));
  assert.equal(V.findCards(used), null, '사용 완료 카드를 조각 카드로 찾음');
  for (const y of [52, 160]) assert.equal(V.readPiece(used, { x: 12, y, w: 176, h: 100 }), -1, '사용 완료 카드를 조각으로 읽음');
}
// 놓으려고 선택 중인 카드(노란 배경)에서도 조각을 그대로 읽어야 한다 (실제 화면 캡처, ㄴ 3칸)
{
  const sel = png(path.join(__dirname, 'selected.png'));
  for (const card of [{ x: 9, y: 42, w: 182, h: 97 }, { x: 14, y: 46, w: 166, h: 90 }, { x: 5, y: 38, w: 190, h: 104 }])
    assert.equal(PIECES[V.readPiece(sel, card)]?.name, 'ㄴ', '선택 중인 카드: ' + JSON.stringify(card));
}
// 조각이 없는 화면에서는 아무것도 찾지 않는다
assert.equal(V.findCards({ width: 400, height: 300, data: new Uint8Array(400 * 300 * 4).fill(255) }), null);
console.log('화면 인식 검사 통과');
