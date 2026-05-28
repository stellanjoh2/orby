import { evalToneCurveAt, normalizeToneCurve } from '../math/toneCurvePchip.js';

/**
 * Four-handle luminance curve: (0, blackY), p1, p2, (1, whiteY), Catmull–Rom-style spline.
 * Plot uses the canvas edge-to-edge aside from a thin margin sized for corner knob stroke.
 */
const MIN_GAP = 0.06;
const MIN_CSS_W = 220;
const MIN_CSS_H = 220;
const BRAND = '#c4ff00';

const DIAG_ALPHA = 0.28125; // identity reference (solid), visible on app black
const MARGIN = 0.02;

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function copyCurve(toneCurve) {
  return normalizeToneCurve(toneCurve);
}

function constrainInteriorX(c) {
  let a = {
    x: clamp(c.p1.x, MARGIN, 1 - MARGIN),
    y: clamp(c.p1.y, 0, 1),
  };
  let b = {
    x: clamp(c.p2.x, MARGIN, 1 - MARGIN),
    y: clamp(c.p2.y, 0, 1),
  };
  if (a.x > b.x) {
    const t = a;
    a = b;
    b = t;
  }
  for (let iter = 0; iter < 12; iter += 1) {
    a.x = clamp(a.x, MARGIN, b.x - MIN_GAP);
    b.x = clamp(b.x, a.x + MIN_GAP, 1 - MARGIN);
  }
  return { blackY: c.blackY, whiteY: c.whiteY, p1: a, p2: b };
}

/** Non-decreasing output y; backward pass then forward pass (repeat) so endpoints can move past interiors. */
function constrainMonotoneY(c) {
  const out = constrainInteriorX(c);
  const ys = [
    clamp(out.blackY, 0, 1),
    clamp(out.p1.y, 0, 1),
    clamp(out.p2.y, 0, 1),
    clamp(out.whiteY, 0, 1),
  ];
  for (let iter = 0; iter < 14; iter += 1) {
    for (let i = 2; i >= 0; i -= 1) {
      ys[i] = Math.min(ys[i], ys[i + 1]);
    }
    for (let i = 1; i <= 3; i += 1) {
      ys[i] = Math.max(ys[i], ys[i - 1]);
    }
  }
  return {
    blackY: ys[0],
    whiteY: ys[3],
    p1: { x: out.p1.x, y: ys[1] },
    p2: { x: out.p2.x, y: ys[2] },
  };
}

export class ToneCurveController {
  constructor(eventBus, stateStore) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.w = 1;
    this.h = 1;
    this.drag = null;
    this.hover = null;
    this._previewCurve = null;
    this._mounted = false;
    this._resizeObserver = null;
    this._onWindowResize = null;
    this._onPointerDown = null;
    this._onPointerMove = null;
    this._onPointerUp = null;
    this._onPointerLeave = null;
    this._onResize = null;
  }

  _getPad() {
    return 0;
  }

  /** Half knob + stroke so corner handles stay inside the canvas (no %-based shrink). */
  _plotEdgeInsetPx() {
    const r0 = 6 * this.dpr;
    const strokeHalf = 2 * this.dpr;
    return Math.ceil(r0 * 1.333 + strokeHalf) + 1;
  }

  _chartXInsetPx() {
    return this._plotEdgeInsetPx();
  }

  _chartYInsetPx() {
    return this._plotEdgeInsetPx();
  }

  bind() {
    this.canvas = document.getElementById('toneCurveCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
  }

  /** Mount canvas observers/listeners when the Curve fold-out is open. */
  setFoldoutOpen(open) {
    if (open) this.mount();
    else this.unmount();
  }

  mount() {
    if (this._mounted || !this.canvas || !this.ctx) return;
    this._mounted = true;
    const wrap = this.canvas.parentElement;
    this._onResize = () => {
      this._resize();
      this._draw();
    };
    this._onWindowResize = this._onResize;
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerUp = (e) => this._handlePointerUp(e);
    this._onPointerLeave = (e) => this._handlePointerLeave(e);
    window.addEventListener('resize', this._onWindowResize);
    if (wrap && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(wrap);
    }
    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointerleave', this._onPointerLeave);
    this._resize();
    this._draw();
    requestAnimationFrame(this._onResize);
  }

  unmount() {
    if (!this._mounted || !this.canvas) return;
    this._mounted = false;
    this.drag = null;
    this.hover = null;
    if (this._onWindowResize) {
      window.removeEventListener('resize', this._onWindowResize);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._onPointerDown) {
      this.canvas.removeEventListener('pointerdown', this._onPointerDown);
      this.canvas.removeEventListener('pointermove', this._onPointerMove);
      this.canvas.removeEventListener('pointerup', this._onPointerUp);
      this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    }
    this._onWindowResize = null;
    this._onResize = null;
    this._onPointerDown = null;
    this._onPointerMove = null;
    this._onPointerUp = null;
    this._onPointerLeave = null;
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.w, this.h);
    }
  }

  syncFromState(state) {
    if (!this.canvas || !this._mounted) return;
    this._draw();
  }

  _resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(MIN_CSS_W, rect.width || 0, this.canvas.clientWidth || 0);
    const cssH = Math.max(MIN_CSS_H, rect.height || 0, this.canvas.clientHeight || 0);
    this.canvas.width = Math.max(1, Math.floor(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * this.dpr));
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  toNorm(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / Math.max(rect.width, 1);
    const sy = this.canvas.height / Math.max(rect.height, 1);
    const cx = (clientX - rect.left) * sx;
    const cy = (clientY - rect.top) * sy;
    const pad = this._getPad();
    const xInset = this._chartXInsetPx();
    const yInset = this._chartYInsetPx();
    const chartW = Math.max(1, this.w - 2 * pad - 2 * xInset);
    const chartH = Math.max(1, this.h - 2 * pad - 2 * yInset);
    const u = (cx - pad - xInset) / chartW;
    const v = 1 - (cy - pad - yInset) / chartH;
    return { x: clamp(u, 0, 1), y: clamp(v, 0, 1) };
  }

  fromNormToPix(p) {
    const pad = this._getPad();
    const xInset = this._chartXInsetPx();
    const yInset = this._chartYInsetPx();
    const chartW = Math.max(1, this.w - 2 * pad - 2 * xInset);
    const chartH = Math.max(1, this.h - 2 * pad - 2 * yInset);
    return {
      x: pad + xInset + p.x * chartW,
      y: pad + yInset + (1 - p.y) * chartH,
    };
  }

  _hit(pn, c) {
    const pa = this.fromNormToPix(pn);
    const th = 12 * this.dpr;
    const th2 = th * th;

    const Pblack = this.fromNormToPix({ x: 0, y: c.blackY });
    if ((pa.x - Pblack.x) ** 2 + (pa.y - Pblack.y) ** 2 < th2) return 'pBlack';

    const Pwhite = this.fromNormToPix({ x: 1, y: c.whiteY });
    if ((pa.x - Pwhite.x) ** 2 + (pa.y - Pwhite.y) ** 2 < th2) return 'pWhite';

    for (const key of ['p1', 'p2']) {
      const P = this.fromNormToPix(c[key]);
      const d = (pa.x - P.x) ** 2 + (pa.y - P.y) ** 2;
      if (d < th2) return key;
    }
    return null;
  }

  _handlePointerDown(e) {
    const state = this.stateStore.getState();
    const c = constrainMonotoneY(copyCurve(state.toneCurve));
    const pn = this.toNorm(e.clientX, e.clientY);
    const hit = this._hit(pn, c);
    if (!hit) return;
    this.drag = hit;
    this.canvas.setPointerCapture(e.pointerId);
    this._draw();
  }

  _handlePointerMove(e) {
    const pn = this.toNorm(e.clientX, e.clientY);
    const state = this.stateStore.getState();
    const cCurve = constrainMonotoneY(copyCurve(state.toneCurve));

    if (!this.drag) {
      const h = this._hit(pn, cCurve);
      if (h !== this.hover) {
        this.hover = h;
        this._draw();
      }
      return;
    }

    const c0 = copyCurve(state.toneCurve);
    if (this.drag === 'pBlack') {
      c0.blackY = pn.y;
    } else if (this.drag === 'pWhite') {
      c0.whiteY = pn.y;
    } else {
      c0[this.drag].x = pn.x;
      c0[this.drag].y = pn.y;
    }
    const c = constrainMonotoneY(c0);
    this._previewCurve = c;
    this.eventBus.emit('render:tone-curve', c);
    this._draw();
  }

  _handlePointerLeave(e) {
    if (this.hover !== null) {
      this.hover = null;
      this._draw();
    }
    this._handlePointerUp(e);
  }

  _handlePointerUp(e) {
    if (this.drag && this._previewCurve) {
      const c = this._previewCurve;
      const prevLook = this.stateStore.getState().lookFilterPreset;
      this.stateStore.batch(() => {
        this.stateStore.set('toneCurve', c);
        if (prevLook !== 'custom') {
          this.stateStore.set('lookFilterPreset', 'custom');
        }
      });
      this.eventBus.emit('ui:reset-section-touched', 'tone-curve');
      this._previewCurve = null;
    }
    if (this.drag && this.canvas) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    this.drag = null;
    this._draw();
  }

  _draw() {
    if (!this.ctx) return;
    const state = this.stateStore.getState();
    const c = constrainMonotoneY(
      copyCurve(this._previewCurve ?? state.toneCurve),
    );
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;

    ctx.clearRect(0, 0, w, h);

    const pDiag0 = { x: 0, y: 0 };
    const pDiag1 = { x: 1, y: 1 };
    const A = this.fromNormToPix(pDiag0);
    const D = this.fromNormToPix(pDiag1);
    const B = this.fromNormToPix(c.p1);
    const C = this.fromNormToPix(c.p2);
    const K0 = this.fromNormToPix({ x: 0, y: c.blackY });
    const K5 = this.fromNormToPix({ x: 1, y: c.whiteY });

    ctx.strokeStyle = `rgba(196, 255, 0, ${DIAG_ALPHA})`;
    ctx.lineWidth = 1 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(D.x, D.y);
    ctx.stroke();

    const steps = 120;
    ctx.strokeStyle = BRAND;
    ctx.lineWidth = 2 * this.dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const yn = evalToneCurveAt(t, c);
      const P = this.fromNormToPix({ x: t, y: yn });
      if (i === 0) ctx.moveTo(P.x, P.y);
      else ctx.lineTo(P.x, P.y);
    }
    ctx.stroke();

    const r0 = 6 * this.dpr;
    const knobScale = (key) => {
      if (this.drag === key) return 1.333;
      if (!this.drag && this.hover === key) return 1.083;
      return 1;
    };
    const drawKnob = (P, scale) => {
      const r = r0 * scale;
      ctx.beginPath();
      ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
      ctx.fillStyle = BRAND;
      ctx.fill();
      ctx.strokeStyle = 'rgba(2, 3, 5, 0.95)';
      ctx.lineWidth = 2 * this.dpr;
      ctx.stroke();
    };
    drawKnob(K0, knobScale('pBlack'));
    drawKnob(K5, knobScale('pWhite'));
    drawKnob(B, knobScale('p1'));
    drawKnob(C, knobScale('p2'));
  }
}
