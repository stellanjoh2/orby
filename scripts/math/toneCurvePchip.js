/**
 * PCHIP (Fritsch–Carlson) through fixed knots: (0,0), (x1,y1), (x2,y2), (1,1).
 * Produces a smooth, monotone luma remapping (no overshoot) when the data is monotone.
 * Matches scipy.interpolate.PchipInterpolator for 4 points.
 */
const EPS = 1e-7;

/**
 * @param {number} h0
 * @param {number} h1
 * @param {number} m0
 * @param {number} m1
 */
function edgeCase(h0, h1, m0, m1) {
  if (h0 + h1 < EPS) return 0;
  let d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
  if (m0 !== 0 && Math.sign(d) !== Math.sign(m0)) d = 0;
  else if (
    m0 !== 0
    && Math.sign(m0) !== Math.sign(m1)
    && Math.abs(d) > 3 * Math.abs(m0)
  ) {
    d = 3 * m0;
  }
  return d;
}

/**
 * @returns {readonly [number, number, number, number]} dy/dx at x = 0, x1, x2, 1
 */
export function pchipDydx4(x1, y1, x2, y2) {
  const x0 = 0;
  const x3 = 1;
  const y0 = 0;
  const y3 = 1;
  const hk = [x1 - x0, x2 - x1, x3 - x2];
  const mk = [
    (y1 - y0) / Math.max(hk[0], EPS),
    (y2 - y1) / Math.max(hk[1], EPS),
    (y3 - y2) / Math.max(hk[2], EPS),
  ];

  if (x2 <= x1 + EPS) {
    // Degenerate: fall back to something finite
    const s = (y2 - y0) / Math.max(x2 - x0, EPS);
    return [s, s, s, s];
  }

  const dk = [0, 0, 0, 0];
  // Interior k = 1, 2
  for (let j = 0; j < 2; j += 1) {
    const a = j;
    const w1 = 2 * hk[j + 1] + hk[j];
    const w2 = hk[j + 1] + 2 * hk[j];
    const a0 = mk[j];
    const a1 = mk[j + 1];
    if (a0 * a1 <= 0 || a0 === 0 || a1 === 0) {
      dk[j + 1] = 0;
    } else {
      const wh = (w1 / a0 + w2 / a1) / (w1 + w2);
      dk[j + 1] = 1 / wh;
    }
  }
  dk[0] = edgeCase(hk[0], hk[1], mk[0], mk[1]);
  dk[3] = edgeCase(hk[2], hk[1], mk[2], mk[1]);

  return [dk[0], dk[1], dk[2], dk[3]];
}

/**
 * 1D cubic Hermite in x (not bezier t): y when x runs from 0 to h, u = xPos / h
 */
function hermite1d(xPos, h, y0, y1, m0, m1) {
  if (h < EPS) return y0;
  const u = xPos / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * y0
    + (u3 - 2 * u2 + u) * (h * m0)
    + (-2 * u3 + 3 * u2) * y1
    + (u3 - u2) * (h * m1)
  );
}

/**
 * @param {number} t input luma in [0,1]
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {readonly [number, number, number, number]} m dy/dx at four knots
 */
export function evalTonePchip(
  t,
  x1,
  y1,
  x2,
  y2,
  m = pchipDydx4(x1, y1, x2, y2),
) {
  const x3 = 1;
  const y0 = 0;
  const y3 = 1;
  t = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (t < EPS) return 0;
  if (t > 1 - EPS) return 1;
  if (t <= x1) {
    return hermite1d(t, x1, y0, y1, m[0], m[1]);
  }
  if (t <= x2) {
    return hermite1d(t - x1, x2 - x1, y1, y2, m[1], m[2]);
  }
  return hermite1d(t - x2, x3 - x2, y2, y3, m[2], m[3]);
}
