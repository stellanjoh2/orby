/**
 * Luminance tone curve: Catmull–Rom-style Hermite splines (neighbor tangents) + 256-step LUT
 * for GPU. Legacy scene migration still uses a short PCHIP segment internally.
 */
const EPS = 1e-7;

export const TONE_LUT_SIZE = 256;

export const TONE_CURVE_DEFAULTS = {
  blackY: 0,
  whiteY: 1,
  /** Interior x at ⅓ and ⅔ so the four knots split [0,1] into three equal spans (PS-style even spacing). */
  p1: { x: 1 / 3, y: 1 / 3 },
  p2: { x: 2 / 3, y: 2 / 3 },
};

// --- legacy PCHIP (migration only) ------------------------------------------

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

function pchipSlopesGeneral(xs, ys) {
  const n = xs.length;
  if (n < 2) return [1];
  const h = [];
  const delta = [];
  for (let i = 0; i < n - 1; i += 1) {
    const hi = xs[i + 1] - xs[i];
    const hh = Math.max(hi, EPS);
    h.push(hh);
    delta.push((ys[i + 1] - ys[i]) / hh);
  }
  const d = new Array(n);
  if (n === 2) {
    d[0] = delta[0];
    d[1] = delta[0];
    return d;
  }
  for (let k = 1; k <= n - 2; k += 1) {
    const w1 = 2 * h[k] + h[k - 1];
    const w2 = h[k] + 2 * h[k - 1];
    const a0 = delta[k - 1];
    const a1 = delta[k];
    if (a0 * a1 <= 0 || a0 === 0 || a1 === 0) {
      d[k] = 0;
    } else {
      const wh = (w1 / a0 + w2 / a1) / (w1 + w2);
      d[k] = 1 / wh;
    }
  }
  d[0] = edgeCase(h[0], h[1], delta[0], delta[1]);
  d[n - 1] = edgeCase(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
  return d;
}

function hermite1dPchip(xPos, h, y0, y1, m0, m1) {
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

function evalTonePchipKnots(t, xs, ys, m) {
  t = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (t < EPS) return ys[0];
  if (t > 1 - EPS) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i += 1) {
    if (t <= xs[i + 1] + EPS) {
      return hermite1dPchip(t - xs[i], xs[i + 1] - xs[i], ys[i], ys[i + 1], m[i], m[i + 1]);
    }
  }
  return hermite1dPchip(
    t - xs[xs.length - 2],
    xs[xs.length - 1] - xs[xs.length - 2],
    ys[ys.length - 2],
    ys[ys.length - 1],
    m[m.length - 2],
    m[m.length - 1],
  );
}

// --- Catmull–Rom tangents + Hermite (Photoshop / Lightroom style) ----------

function hermiteSeg(u, h, y0, y1, m0, m1) {
  if (h < EPS) return y0;
  const t = u / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * y0
    + (t3 - 2 * t2 + t) * (h * m0)
    + (-2 * t3 + 3 * t2) * y1
    + (t3 - t2) * (h * m1)
  );
}

/**
 * Slope at knot i: neighbor-based (interior matches Catmull–Rom chord tangents).
 * @param {{x:number,y:number}[]} pts sorted by x
 */
function slopeAt(pts, i) {
  const n = pts.length;
  if (i <= 0) {
    return (pts[1].y - pts[0].y) / Math.max(pts[1].x - pts[0].x, EPS);
  }
  if (i >= n - 1) {
    return (pts[n - 1].y - pts[n - 2].y) / Math.max(pts[n - 1].x - pts[n - 2].x, EPS);
  }
  return (pts[i + 1].y - pts[i - 1].y) / Math.max(pts[i + 1].x - pts[i - 1].x, EPS);
}

/**
 * @param {number} x input luma in [0,1]
 * @param {{x:number,y:number}[]} pts sorted by x, length >= 2
 */
export function evalToneCurveSpline(x, pts) {
  const n = pts.length;
  if (n < 2) return clamp01(x);
  if (x <= pts[0].x + EPS) return pts[0].y;
  if (x >= pts[n - 1].x - EPS) return pts[n - 1].y;
  for (let i = 0; i < n - 1; i += 1) {
    if (x <= pts[i + 1].x + EPS) {
      const m0 = slopeAt(pts, i);
      const m1 = slopeAt(pts, i + 1);
      const u = x - pts[i].x;
      const h = pts[i + 1].x - pts[i].x;
      return hermiteSeg(u, h, pts[i].y, pts[i + 1].y, m0, m1);
    }
  }
  return pts[n - 1].y;
}

export function curveToSortedPoints(c) {
  return [
    { x: 0, y: c.blackY },
    { x: c.p1.x, y: c.p1.y },
    { x: c.p2.x, y: c.p2.y },
    { x: 1, y: c.whiteY },
  ];
}

/**
 * @param {number} t input luma in [0,1]
 * @param {object} c normalized tone curve
 */
export function evalToneCurveAt(t, c) {
  return evalToneCurveSpline(t, curveToSortedPoints(c));
}

/**
 * Bake curve to 256×1 RGBA bytes (R = output luma) + tail slope for HDR extrapolation.
 * Applies cumulative max on samples so the baked map is non-decreasing (legal tone response).
 * @param {object} c normalized curve
 * @returns {{ data: Uint8Array, width: number, height: number, tailSlope: number }}
 */
export function buildToneCurveLutBytes(c) {
  const pts = curveToSortedPoints(c);
  const n = TONE_LUT_SIZE;
  const lutF = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = n <= 1 ? 0 : i / (n - 1);
    lutF[i] = clamp01(evalToneCurveSpline(x, pts));
  }
  for (let i = 1; i < n; i += 1) {
    lutF[i] = Math.max(lutF[i], lutF[i - 1]);
  }
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const v = Math.min(255, Math.round(lutF[i] * 255));
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  const invDx = n > 1 ? n - 1 : 1;
  const tailSlope = (lutF[n - 1] - lutF[n - 2]) * invDx;
  return { data, width: n, height: 1, tailSlope };
}

// --- state ------------------------------------------------------------------

function pickPt(p, def) {
  return {
    x: typeof p?.x === 'number' ? p.x : def.x,
    y: typeof p?.y === 'number' ? p.y : def.y,
  };
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

/**
 * @param {object} [raw]
 * @returns {{ blackY: number, whiteY: number, p1: {x:number,y:number}, p2: {x:number,y:number} }}
 */
export function normalizeToneCurve(raw) {
  const D = TONE_CURVE_DEFAULTS;
  const blackY = typeof raw?.blackY === 'number' ? clamp01(raw.blackY) : D.blackY;
  const whiteY = typeof raw?.whiteY === 'number' ? clamp01(raw.whiteY) : D.whiteY;

  const hadFourInterior =
    raw?.p3
    && raw?.p4
    && typeof raw.p3.x === 'number'
    && typeof raw.p4.x === 'number';
  if (hadFourInterior) {
    const pts = [
      pickPt(raw.p1, D.p1),
      pickPt(raw.p2, D.p2),
      pickPt(raw.p3, D.p3),
      pickPt(raw.p4, D.p4),
    ].sort((a, b) => a.x - b.x);
    return {
      blackY,
      whiteY,
      p1: { ...pts[1] },
      p2: { ...pts[2] },
    };
  }

  const hadExplicitEnds =
    typeof raw?.blackY === 'number' || typeof raw?.whiteY === 'number';

  const p1Raw = pickPt(raw?.p1, D.p1);
  const p2Raw = pickPt(raw?.p2, D.p2);
  const p1 = p1Raw.x <= p2Raw.x ? p1Raw : p2Raw;
  const p2 = p1Raw.x <= p2Raw.x ? p2Raw : p1Raw;

  if (hadExplicitEnds) {
    return { blackY, whiteY, p1, p2 };
  }

  const lo = p1;
  const hi = p2;
  const xs4 = [0, lo.x, hi.x, 1];
  const ys4 = [0, lo.y, hi.y, 1];
  const m4 = pchipSlopesGeneral(xs4, ys4);
  const span = hi.x - lo.x;
  const xA = lo.x + span * (1 / 3);
  const xB = lo.x + span * (2 / 3);
  const yA = evalTonePchipKnots(xA, xs4, ys4, m4);
  const yB = evalTonePchipKnots(xB, xs4, ys4, m4);
  return {
    blackY: 0,
    whiteY: 1,
    p1: { x: xA, y: yA },
    p2: { x: xB, y: yB },
  };
}
