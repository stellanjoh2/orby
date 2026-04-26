import { evalTonePchip, pchipDydx4 } from '../math/toneCurvePchip.js';

/**
 * Minimal 2-point luminance tone curve: smooth PCHIP + canvas editor + state sync.
 * Control points are constrained so x1 < x2 (shadows / highlights regions).
 */
const MIN_GAP = 0.06;
const MIN_CSS_W = 200;
const MIN_CSS_H = 120;
const BRAND = '#c4ff00';
const BG = '#0a0a0f';
const MARGIN = 0.02;

const DEFAULTS = {
  p1: { x: 0.25, y: 0.25 },
  p2: { x: 0.75, y: 0.75 },
};

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function copyCurve(toneCurve) {
  const t = toneCurve ?? {};
  return {
    p1: {
      x: typeof t.p1?.x === 'number' ? t.p1.x : DEFAULTS.p1.x,
      y: typeof t.p1?.y === 'number' ? t.p1.y : DEFAULTS.p1.y,
    },
    p2: {
      x: typeof t.p2?.x === 'number' ? t.p2.x : DEFAULTS.p2.x,
      y: typeof t.p2?.y === 'number' ? t.p2.y : DEFAULTS.p2.y,
    },
  };
}

function constrainOrder(c) {
  let { p1, p2 } = c;
  p1 = { ...p1, x: clamp(p1.x, MARGIN, 1 - MARGIN), y: clamp(p1.y, 0, 1) };
  p2 = { ...p2, x: clamp(p2.x, MARGIN, 1 - MARGIN), y: clamp(p2.y, 0, 1) };
  if (p1.x > p2.x - MIN_GAP) {
    const mid = (p1.x + p2.x) * 0.5;
    p1 = { ...p1, x: mid - MIN_GAP * 0.5 };
    p2 = { ...p2, x: mid + MIN_GAP * 0.5 };
  }
  p1.x = clamp(p1.x, MARGIN, p2.x - MIN_GAP);
  p2.x = clamp(p2.x, p1.x + MIN_GAP, 1 - MARGIN);
  return { p1, p2 };
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
    this._resizeObserver = null;
  }

  _getPad() {
    const w = this.w;
    if (w < 8) return 4;
    return Math.min(16, Math.max(6, w * 0.05));
  }

  bind() {
    this.canvas = document.getElementById('toneCurveCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    const wrap = this.canvas.parentElement;
    this._resize();
    this._draw();
    const onResize = () => {
      this._resize();
      this._draw();
    };
    window.addEventListener('resize', onResize);
    if (wrap && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(onResize);
      this._resizeObserver.observe(wrap);
    }
    requestAnimationFrame(() => {
      onResize();
    });
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this._onPointerUp(e));
  }

  syncFromState(state) {
    if (!this.canvas) return;
    this._draw();
  }

  _resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // getBoundingClientRect() can be 0 before layout / in hidden tabs; keep a real bitmap size
    const cssW = Math.max(MIN_CSS_W, rect.width || 0, this.canvas.clientWidth || 0);
    const cssH = Math.max(MIN_CSS_H, rect.height || 0, this.canvas.clientHeight || 0);
    this.canvas.width = Math.max(1, Math.floor(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * this.dpr));
    this.w = this.canvas.width;
    this.h = this.canvas.height;
  }

  toNorm(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const u = (clientX - rect.left) / Math.max(rect.width, 1);
    const v = 1 - (clientY - rect.top) / Math.max(rect.height, 1);
    return { x: clamp(u, 0, 1), y: clamp(v, 0, 1) };
  }

  fromNormToPix(p) {
    const pad = this._getPad();
    const innerW = Math.max(1, this.w - 2 * pad);
    const innerH = Math.max(1, this.h - 2 * pad);
    return {
      x: pad + p.x * innerW,
      y: pad + (1 - p.y) * innerH,
    };
  }

  _hit(pn, c) {
    const a = this.fromNormToPix(c.p1);
    const b = this.fromNormToPix(c.p2);
    const pa = this.fromNormToPix(pn);
    const d1 = (pa.x - a.x) ** 2 + (pa.y - a.y) ** 2;
    const d2 = (pa.x - b.x) ** 2 + (pa.y - b.y) ** 2;
    const th = 12 * this.dpr;
    if (d1 < th * th) return 'p1';
    if (d2 < th * th) return 'p2';
    return null;
  }

  _onPointerDown(e) {
    const state = this.stateStore.getState();
    const c = copyCurve(state.toneCurve);
    const pn = this.toNorm(e.clientX, e.clientY);
    const hit = this._hit(pn, c);
    if (!hit) return;
    this.drag = hit;
    this.canvas.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this.drag) return;
    const pn = this.toNorm(e.clientX, e.clientY);
    const state = this.stateStore.getState();
    const c0 = copyCurve(state.toneCurve);
    if (this.drag === 'p1') {
      c0.p1.x = pn.x;
      c0.p1.y = pn.y;
    } else {
      c0.p2.x = pn.x;
      c0.p2.y = pn.y;
    }
    const c = constrainOrder(c0);
    const prevLook = this.stateStore.getState().lookFilterPreset;
    this.stateStore.set('toneCurve', c);
    if (prevLook !== 'custom') {
      this.stateStore.set('lookFilterPreset', 'custom');
    }
    this.eventBus.emit('render:tone-curve', c);
    this._draw();
  }

  _onPointerUp(e) {
    if (this.drag && this.canvas) {
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    this.drag = null;
  }

  _draw() {
    if (!this.ctx) return;
    const state = this.stateStore.getState();
    const c = constrainOrder(copyCurve(state.toneCurve));
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const pad = this._getPad();
    const innerW = w - 2 * pad;
    const innerH = h - 2 * pad;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const p0 = { x: 0, y: 0 };
    const p1 = c.p1;
    const p2 = c.p2;
    const p3 = { x: 1, y: 1 };
    const A = this.fromNormToPix(p0);
    const B = this.fromNormToPix(p1);
    const C = this.fromNormToPix(p2);
    const D = this.fromNormToPix(p3);

    // Subtle grid
    ctx.strokeStyle = 'rgba(196, 255, 0, 0.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const gx = pad + (i / 4) * innerW;
      const gy = pad + (i / 4) * innerH;
      ctx.beginPath();
      ctx.moveTo(gx, pad);
      ctx.lineTo(gx, h - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad, gy);
      ctx.lineTo(w - pad, gy);
      ctx.stroke();
    }

    // Identity
    ctx.strokeStyle = 'rgba(196, 255, 0, 0.18)';
    ctx.setLineDash([3 * this.dpr, 4 * this.dpr]);
    ctx.lineWidth = 1 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(D.x, D.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const p1n = c.p1;
    const p2n = c.p2;
    const m = pchipDydx4(p1n.x, p1n.y, p2n.x, p2n.y);
    const steps = 100;
    ctx.strokeStyle = BRAND;
    ctx.lineWidth = 2 * this.dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps);
      const yn = evalTonePchip(t, p1n.x, p1n.y, p2n.x, p2n.y, m);
      const P = this.fromNormToPix({ x: t, y: yn });
      if (i === 0) ctx.moveTo(P.x, P.y);
      else ctx.lineTo(P.x, P.y);
    }
    ctx.stroke();

    const r = 6 * this.dpr;
    const drawKnob = (P) => {
      ctx.beginPath();
      ctx.arc(P.x, P.y, r, 0, Math.PI * 2);
      ctx.fillStyle = BRAND;
      ctx.fill();
      ctx.strokeStyle = 'rgba(2, 3, 5, 0.95)';
      ctx.lineWidth = 2 * this.dpr;
      ctx.stroke();
    };
    drawKnob(B);
    drawKnob(C);
  }
}
