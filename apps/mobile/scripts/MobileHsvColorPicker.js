import { hexToHsv, hsvToHex, hsvToRgb, normalizeHex } from './mobileColorUtils.js';

/** @typedef {{ h: number, s: number, v: number }} Hsv */

/**
 * Minimal HSV picker — hue ring + saturation/value square (no hex/RGB sliders).
 */
export class MobileHsvColorPicker {
  /**
   * @param {HTMLElement} host
   * @param {{ onInput?: (hex: string) => void, ariaLabel?: string, defaultValue?: string }} [options]
   */
  constructor(host, options = {}) {
    this.host = host;
    this.onInput = options.onInput;
    this.ariaLabel = options.ariaLabel ?? 'Color';
    /** @type {Hsv} */
    this.hsv = hexToHsv(options.defaultValue ?? '#080808');
    this._disabled = false;
    /** @type {'hue' | 'sv' | null} */
    this._dragMode = null;

    host.classList.add('orby-mobile-hsv-picker');
    host.replaceChildren();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'orby-mobile-hsv-picker__canvas';
    this.canvas.setAttribute('role', 'slider');
    this.canvas.setAttribute('aria-label', this.ariaLabel);
    this.canvas.setAttribute('aria-valuetext', hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v));
    host.append(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas 2D unavailable');

    /** @type {null | { size: number, outerR: number, innerR: number, svSize: number, svLeft: number, svTop: number, cx: number, cy: number }} */
    this._layout = null;
    /** @type {ImageData | null} */
    this._hueRingImage = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(host);
    this._resize();
  }

  /** @param {string} hex */
  setValue(hex) {
    this.hsv = hexToHsv(normalizeHex(hex));
    this._syncAria();
    this._draw();
  }

  getValue() {
    return hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
  }

  /** @param {boolean} disabled */
  setDisabled(disabled) {
    this._disabled = disabled;
    this.host.classList.toggle('is-disabled', disabled);
    this.canvas.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }

  resize() {
    this._resize();
  }

  destroy() {
    this._resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    this.host.replaceChildren();
    this.host.classList.remove('orby-mobile-hsv-picker', 'is-disabled');
  }

  _resize() {
    const cssSize = Math.min(this.host.clientWidth || 280, 320);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.max(180, Math.round(cssSize * dpr));
    if (this.canvas.width !== px || this.canvas.height !== px) {
      this.canvas.width = px;
      this.canvas.height = px;
      this.canvas.style.width = `${cssSize}px`;
      this.canvas.style.height = `${cssSize}px`;
    }
    this._computeLayout(px);
    this._buildHueRingCache();
    this._draw();
  }

  _buildHueRingCache() {
    const layout = this._layout;
    const ctx = this.ctx;
    if (!layout || !ctx) return;

    const { size, outerR, innerR, cx, cy } = layout;
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const outerR2 = outerR * outerR;
    const innerR2 = innerR * innerR;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > outerR2 || dist2 < innerR2) continue;

        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const rgb = hsvToRgb(angle < 0 ? angle + 360 : angle, 1, 1);
        const idx = (y * size + x) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }

    this._hueRingImage = image;
  }

  _drawSvSquare() {
    const layout = this._layout;
    const ctx = this.ctx;
    if (!layout || !ctx) return;

    const { size, svSize, svLeft, svTop } = layout;
    const hue = this.hsv.h;
    const x0 = Math.max(0, Math.floor(svLeft));
    const y0 = Math.max(0, Math.floor(svTop));
    const x1 = Math.min(size, Math.ceil(svLeft + svSize));
    const y1 = Math.min(size, Math.ceil(svTop + svSize));
    const image = ctx.createImageData(x1 - x0, y1 - y0);
    const data = image.data;
    const w = x1 - x0;

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const s = (x + 0.5 - svLeft) / svSize;
        const v = 1 - (y + 0.5 - svTop) / svSize;
        const rgb = hsvToRgb(hue, s, v);
        const idx = ((y - y0) * w + (x - x0)) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(image, x0, y0);
  }

  /** @param {number} size */
  _computeLayout(size) {
    const pad = size * 0.04;
    const outerR = size / 2 - pad;
    const ringWidth = size * 0.11;
    const innerR = outerR - ringWidth;
    const svSize = innerR * 1.55;
    const cx = size / 2;
    const cy = size / 2;
    this._layout = {
      size,
      outerR,
      innerR,
      svSize,
      svLeft: cx - svSize / 2,
      svTop: cy - svSize / 2,
      cx,
      cy,
    };
  }

  _draw() {
    const layout = this._layout;
    const ctx = this.ctx;
    if (!layout || !ctx) return;

    const { size, outerR, innerR, svSize, svLeft, svTop, cx, cy } = layout;
    ctx.clearRect(0, 0, size, size);

    if (this._hueRingImage) {
      ctx.putImageData(this._hueRingImage, 0, 0);
    }

    this._drawSvSquare();

    const hue = this.hsv.h;
    const hueAngle = (hue * Math.PI) / 180;
    const hueR = (outerR + innerR) / 2;
    this._drawHandle(
      cx + Math.cos(hueAngle) * hueR,
      cy + Math.sin(hueAngle) * hueR,
      size * 0.045,
    );
    this._drawHandle(
      svLeft + this.hsv.s * svSize,
      svTop + (1 - this.hsv.v) * svSize,
      size * 0.038,
    );
  }

  /** @param {number} x @param {number} y @param {number} radius */
  _drawHandle(x, y, radius) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = radius * 0.55;
    ctx.shadowOffsetY = radius * 0.15;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(1, radius * 0.12);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.stroke();
    ctx.restore();
  }

  /** @param {number} x @param {number} y */
  _pickMode(x, y) {
    const layout = this._layout;
    if (!layout) return null;
    const { outerR, innerR, svLeft, svTop, svSize, cx, cy } = layout;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);

    if (
      x >= svLeft &&
      x <= svLeft + svSize &&
      y >= svTop &&
      y <= svTop + svSize
    ) {
      return 'sv';
    }

    if (dist >= innerR && dist <= outerR) return 'hue';
    return null;
  }

  /** @param {number} clientX @param {number} clientY */
  _updateFromPointer(clientX, clientY) {
    const layout = this._layout;
    if (!layout || !this._dragMode) return;

    const rect = this.canvas.getBoundingClientRect();
    const scale = layout.size / rect.width;
    const x = (clientX - rect.left) * scale;
    const y = (clientY - rect.top) * scale;

    if (this._dragMode === 'hue') {
      const angle = (Math.atan2(y - layout.cy, x - layout.cx) * 180) / Math.PI;
      this.hsv.h = angle < 0 ? angle + 360 : angle;
    } else {
      const s = (x - layout.svLeft) / layout.svSize;
      const v = 1 - (y - layout.svTop) / layout.svSize;
      this.hsv.s = Math.min(1, Math.max(0, s));
      this.hsv.v = Math.min(1, Math.max(0, v));
    }

    this._syncAria();
    this._draw();
    this._emitInput();
  }

  _syncAria() {
    this.canvas.setAttribute('aria-valuetext', this.getValue());
  }

  _emitInput() {
    if (!this.onInput) return;
    this.onInput(this.getValue());
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    if (this._disabled) return;
    const layout = this._layout;
    if (!layout) return;

    const rect = this.canvas.getBoundingClientRect();
    const scale = layout.size / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;
    const mode = this._pickMode(x, y);
    if (!mode) return;

    event.preventDefault();
    this._dragMode = mode;
    this.canvas.setPointerCapture(event.pointerId);
    this._updateFromPointer(event.clientX, event.clientY);
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (!this._dragMode) return;
    event.preventDefault();
    this._updateFromPointer(event.clientX, event.clientY);
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    if (!this._dragMode) return;
    this._dragMode = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.onInput?.(this.getValue());
  }
}
