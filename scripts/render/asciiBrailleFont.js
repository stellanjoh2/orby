/** Programmatic Unicode braille (U+2800–U+28FF) — 2×4 dot grid blitted into a bitmap cell. */

/**
 * Braille dot bit → cell position (1× texels, before integer upscale).
 * Unicode: bit0=dot1 … bit7=dot8.
 * @type {ReadonlyArray<readonly [number, number]>}
 */
const BRAILLE_DOT_XY = Object.freeze([
  [1, 1],
  [1, 3],
  [1, 5],
  [4, 1],
  [4, 3],
  [4, 5],
  [1, 7],
  [4, 7],
]);

/**
 * @param {number} code — 0–255 braille payload (code point − 0x2800)
 * @returns {number}
 */
export function braillePopcount(code) {
  let n = code & 0xff;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}

/**
 * Braille charset sorted by dot count (sparse → dense) for ink-fill mapping.
 * @returns {string}
 */
export function buildBrailleDensityCharset() {
  /** @type {Array<{ ch: string, pop: number, code: number }>} */
  const entries = [];
  for (let code = 0; code <= 0xff; code += 1) {
    entries.push({
      ch: String.fromCharCode(0x2800 + code),
      pop: braillePopcount(code),
      code,
    });
  }
  entries.sort((a, b) => a.pop - b.pop || a.code - b.code);
  return entries.map((e) => e.ch).join('');
}

/**
 * Blit one braille glyph (hard pixels).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} ch
 * @param {number} destX
 * @param {number} destY
 * @param {number} [scale=1]
 * @param {number} [cellW=6]
 * @param {number} [cellH=10]
 */
export function blitBrailleGlyph(ctx, ch, destX, destY, scale = 1, cellW = 6, cellH = 10) {
  const payload = ch.charCodeAt(0) - 0x2800;
  if (payload < 0 || payload > 0xff) return;
  const s = Math.max(1, Math.floor(scale));
  const outW = cellW * s;
  const outH = cellH * s;
  const img = ctx.createImageData(outW, outH);
  const d = img.data;
  const dotW = Math.max(1, s >= 2 ? 2 * s : s);
  const dotH = Math.max(1, s >= 2 ? 2 * s : s);

  for (let bit = 0; bit < 8; bit += 1) {
    if (((payload >> bit) & 1) === 0) continue;
    const [cx, cy] = BRAILLE_DOT_XY[bit];
    for (let dy = 0; dy < dotH; dy += 1) {
      for (let dx = 0; dx < dotW; dx += 1) {
        const px = cx * s + dx;
        const py = cy * s + dy;
        if (px < 0 || py < 0 || px >= outW || py >= outH) continue;
        const i = (py * outW + px) * 4;
        d[i] = 255;
        d[i + 1] = 255;
        d[i + 2] = 255;
        d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, destX, destY);
}
