import {
  DEFAULT_BACKGROUND_GRADIENT,
  MAX_BACKGROUND_GRADIENT_STOPS,
  normalizeBackgroundGradient,
} from '../render/backgroundGradient/backgroundGradientDefaults.js';
import {
  drawBackgroundGradientStopStrip,
  sampleGradientColorAt,
} from '../render/backgroundGradient/backgroundGradientCanvas.js';
import { isBackgroundFallbackActive } from '../render/backgroundFallback.js';
import {
  applyBackgroundMode,
  getBackgroundMode,
} from '../render/backgroundMode.js';
import { ORBY_LIME } from '../constants.js';
const MIN_STOP_GAP = 1;

/**
 * Studio → Background gradient editor (preview bar + type / angle).
 * Isolated from render pipeline — emits `scene:background-gradient` only.
 */
export class BackgroundGradientControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} ui
   * @param {import('./UIHelpers.js').UIHelpers} helpers
   */
  constructor(eventBus, stateStore, ui, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this.helpers = helpers;
    this.preview = null;
    this.previewCtx = null;
    this.typeButtons = [];
    this.angleRow = null;
    this.centerRow = null;
    this.selectedStopIndex = 0;
    this.drag = null;
    this._mounted = false;
  }

  bind() {
    this.preview = document.getElementById('backgroundGradientPreview');
    this.angleRow = document.getElementById('backgroundGradientAngleRow');
    this.centerRow = document.getElementById('backgroundGradientCenterRow');
    this.typeButtons = Array.from(
      document.querySelectorAll('[data-bg-gradient-type]'),
    );
    if (!this.preview) return;

    this.previewCtx = this.preview.getContext('2d', { alpha: false });
    this._mounted = true;

    this.ui.inputs.backgroundGradientEnabled?.addEventListener('change', (event) => {
      const checked = event.target.checked;
      if (checked) {
        applyBackgroundMode(this.stateStore, this.eventBus, 'gradient');
        return;
      }
      if (getBackgroundMode(this.stateStore.getState()) === 'gradient') {
        applyBackgroundMode(this.stateStore, this.eventBus, 'solid');
      }
    });

    this.ui.inputs.backgroundGradientStopColor?.addEventListener('input', (event) => {
      this._updateStop(this.selectedStopIndex, { color: event.target.value });
    });

    this.ui.inputs.backgroundGradientAngle?.addEventListener('input', (event) => {
      const angle = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backgroundGradientAngle', angle, 'angle');
      this._commit({ angle }, { deferNotify: true });
    });

    this.ui.inputs.backgroundGradientCenterX?.addEventListener('input', (event) => {
      const centerX = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backgroundGradientCenterX', `${Math.round(centerX)}%`);
      this._commit({ centerX }, { deferNotify: true });
    });

    this.ui.inputs.backgroundGradientCenterY?.addEventListener('input', (event) => {
      const centerY = parseFloat(event.target.value);
      this.helpers.updateValueLabel('backgroundGradientCenterY', `${Math.round(centerY)}%`);
      this._commit({ centerY }, { deferNotify: true });
    });

    this.typeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.dataset.bgGradientType;
        if (type !== 'linear' && type !== 'radial') return;
        this.ui.uiSounds?.playSelect?.();
        this._commit({ type });
      });
    });

    this._onPreviewPointerDown = (event) => this._handlePreviewPointerDown(event);
    this._onPreviewPointerMove = (event) => this._handlePreviewPointerMove(event);
    this._onPreviewPointerUp = (event) => this._handlePreviewPointerUp(event);
    this.preview.addEventListener('pointerdown', this._onPreviewPointerDown);
    window.addEventListener('pointermove', this._onPreviewPointerMove);
    window.addEventListener('pointerup', this._onPreviewPointerUp);
    window.addEventListener('pointercancel', this._onPreviewPointerUp);
  }

  sync(state) {
    if (!this._mounted) return;
    const gradient = normalizeBackgroundGradient(
      state.backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT,
    );
    const mode = getBackgroundMode(state);
    const gradientOn = mode === 'gradient';
    const fallbackActive = isBackgroundFallbackActive(state);

    if (this.ui.inputs.backgroundGradientEnabled) {
      this.ui.inputs.backgroundGradientEnabled.checked = gradientOn;
    }
    if (this.ui.inputs.backgroundGradientAngle) {
      this.ui.inputs.backgroundGradientAngle.value = gradient.angle;
      this.helpers.updateValueLabel('backgroundGradientAngle', gradient.angle, 'angle');
    }
    if (this.ui.inputs.backgroundGradientCenterX) {
      this.ui.inputs.backgroundGradientCenterX.value = gradient.centerX;
      this.helpers.updateValueLabel('backgroundGradientCenterX', `${Math.round(gradient.centerX)}%`);
    }
    if (this.ui.inputs.backgroundGradientCenterY) {
      this.ui.inputs.backgroundGradientCenterY.value = gradient.centerY;
      this.helpers.updateValueLabel('backgroundGradientCenterY', `${Math.round(gradient.centerY)}%`);
    }

    this.typeButtons.forEach((button) => {
      const active = button.dataset.bgGradientType === gradient.type;
      button.classList.toggle('active', active);
    });

    const isLinear = gradient.type === 'linear';
    if (this.angleRow) this.angleRow.hidden = !isLinear;
    if (this.centerRow) this.centerRow.hidden = isLinear;

    this.selectedStopIndex = Math.min(
      this.selectedStopIndex,
      Math.max(0, gradient.stops.length - 1),
    );
    const selectedStop = gradient.stops[this.selectedStopIndex];
    if (this.ui.inputs.backgroundGradientStopColor && selectedStop) {
      this.ui.inputs.backgroundGradientStopColor.value = selectedStop.color;
    }

    const detailDisabled = !gradientOn || !fallbackActive;
    this.ui.setControlDisabled('backgroundGradientEnabled', !fallbackActive);
    this.ui.setControlDisabled(
      [
        'backgroundGradientStopColor',
        'backgroundGradientCenterX',
        'backgroundGradientCenterY',
      ],
      detailDisabled,
    );
    this.ui.setControlDisabled(
      'backgroundGradientAngle',
      detailDisabled || !isLinear,
    );
    this._setGradientDetailDisabled(detailDisabled);
    this._drawPreview(gradient);
  }

  _setGradientDetailDisabled(disabled) {
    this.typeButtons.forEach((button) => {
      button.disabled = disabled;
      button.classList.toggle('is-disabled', disabled);
    });
    if (this.preview) {
      this.preview.classList.toggle('is-disabled-handle', disabled);
      this.preview.style.pointerEvents = disabled ? 'none' : '';
    }
  }

  _commit(patch, { deferNotify = false } = {}) {
    if (deferNotify) this.stateStore.beginDeferredNotify();
    const current = this.stateStore.getState().backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT;
    const next = normalizeBackgroundGradient({ ...current, ...patch });
    this.stateStore.set('backgroundGradient', next);
    this.eventBus.emit('scene:background-gradient', next);
    if (deferNotify) this.stateStore.endDeferredNotify();
  }

  _addStopAt(position) {
    const current = normalizeBackgroundGradient(
      this.stateStore.getState().backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT,
    );
    if (current.stops.length >= MAX_BACKGROUND_GRADIENT_STOPS) return;
    const color = sampleGradientColorAt(current, position / 100);
    const stops = current.stops.map((stop) => ({ ...stop }));
    stops.push({ color, position });
    this.selectedStopIndex = stops.length - 1;
    this._commit({ stops });
  }

  _updateStop(index, patch, { deferNotify = false } = {}) {
    const current = normalizeBackgroundGradient(
      this.stateStore.getState().backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT,
    );
    const stops = current.stops.map((stop, i) =>
      i === index ? { ...stop, ...patch } : { ...stop },
    );
    this._commit({ stops }, { deferNotify });
  }

  _previewGradientFromStore() {
    return normalizeBackgroundGradient(
      this.stateStore.getState().backgroundGradient ?? DEFAULT_BACKGROUND_GRADIENT,
    );
  }

  _redrawPreviewFromStore() {
    this._drawPreview(this._previewGradientFromStore());
  }

  _drawPreview(gradient) {
    if (!this.preview || !this.previewCtx) return;
    const rect = this.preview.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.preview.width !== width || this.preview.height !== height) {
      this.preview.width = width;
      this.preview.height = height;
    }
    drawBackgroundGradientStopStrip(this.previewCtx, width, height, gradient);
    this._drawStopHandles(gradient, width, height);
  }

  _drawStopHandles(gradient, width, height) {
    const ctx = this.previewCtx;
    const pad = 10 * (window.devicePixelRatio || 1);
    const y = height * 0.5;
    for (let i = 0; i < gradient.stops.length; i += 1) {
      const stop = gradient.stops[i];
      const x = pad + (stop.position / 100) * (width - pad * 2);
      const selected = i === this.selectedStopIndex;
      ctx.beginPath();
      ctx.fillStyle = stop.color;
      ctx.strokeStyle = selected ? ORBY_LIME : 'rgba(255,255,255,0.85)';
      ctx.lineWidth = selected ? 3 * (window.devicePixelRatio || 1) : 2 * (window.devicePixelRatio || 1);
      const r = 7 * (window.devicePixelRatio || 1);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  _handlePreviewPointerDown(event) {
    const gradient = this._previewGradientFromStore();
    if (getBackgroundMode(this.stateStore.getState()) !== 'gradient') return;
    if (!isBackgroundFallbackActive(this.stateStore.getState())) return;

    const hitIndex = this._hitStopIndex(event, gradient);
    if (hitIndex >= 0) {
      event.preventDefault();
      this.selectedStopIndex = hitIndex;
      this.drag = { index: hitIndex };
      this.stateStore.beginDeferredNotify();
      this.preview.setPointerCapture?.(event.pointerId);
      this._applyDragPosition(event);
      return;
    }

    if (gradient.stops.length >= MAX_BACKGROUND_GRADIENT_STOPS) return;

    const rect = this.preview.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (event.clientX - rect.left) * dpr;
    const pad = 10 * dpr;
    const width = this.preview.width;
    const t = (x - pad) / Math.max(1, width - pad * 2);
    const position = Math.min(100, Math.max(0, t * 100));
    this._addStopAt(Math.round(position));
  }

  _applyDragPosition(event) {
    if (!this.drag || !this.preview) return;
    const rect = this.preview.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (event.clientX - rect.left) * dpr;
    const pad = 10 * dpr;
    const width = this.preview.width;
    const t = (x - pad) / Math.max(1, width - pad * 2);
    let position = Math.min(100, Math.max(0, t * 100));
    const current = this._previewGradientFromStore();
    const others = current.stops
      .map((stop, index) => (index === this.drag.index ? null : stop.position))
      .filter((v) => v != null);
    position = this._clampStopPosition(position, others);
    this._updateStop(this.drag.index, { position });
    this._redrawPreviewFromStore();
  }

  _handlePreviewPointerMove(event) {
    if (!this.drag) return;
    this._applyDragPosition(event);
  }

  _handlePreviewPointerUp(event) {
    if (!this.drag) return;
    if (this.preview?.hasPointerCapture?.(event?.pointerId)) {
      this.preview.releasePointerCapture(event.pointerId);
    }
    this.stateStore.endDeferredNotify();
    this.drag = null;
  }

  _hitStopIndex(event, gradient) {
    const rect = this.preview.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    const pad = 10 * dpr;
    const width = this.preview.width;
    const cy = this.preview.height * 0.5;
    const hitR = 12 * dpr;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < gradient.stops.length; i += 1) {
      const stop = gradient.stops[i];
      const sx = pad + (stop.position / 100) * (width - pad * 2);
      const dist = Math.hypot(x - sx, y - cy);
      if (dist <= hitR && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  }

  _clampStopPosition(position, otherPositions) {
    let next = position;
    for (const other of otherPositions) {
      if (Math.abs(next - other) < MIN_STOP_GAP) {
        next = next < other ? other - MIN_STOP_GAP : other + MIN_STOP_GAP;
      }
    }
    return Math.min(100, Math.max(0, next));
  }
}
