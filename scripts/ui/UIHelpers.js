import { formatDofFStopLabel, cameraShadowsUiToShader } from '../constants.js';
import {
  getAtPath,
  isPointerOnSliderThumb,
  resolveSliderDefaultValue,
  resolveSliderInputKey,
} from './sliderDefaultPaths.js';
import {
  parseManifestRangeValue,
  writeStateAndEmit,
} from '../state/controlManifestCore.js';

/**
 * UIHelpers - Utility methods for UI management
 * Provides helper functions for sliders, labels, controls, and UI state
 */
export class UIHelpers {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager; // Reference to UIManager for accessing inputs/dom
  }

  /**
   * Format slider value with appropriate unit and decimals
   * @param {number} value - The numeric value
   * @param {string} type - Format type: 'angle', 'distance', 'multiplier', 'decimal', 'integer'
   * @param {number} decimals - Optional override for decimal places
   * @returns {string} Formatted string
   */
  formatSliderValue(value, type = 'decimal', decimals = null) {
    if (!Number.isFinite(value)) return '—';
    
    if (type === 'kelvin') {
      const rounded = Math.round(value);
      return `${rounded}K`;
    }

    if (type === 'fstop') {
      return formatDofFStopLabel(value);
    }

    const formatMap = {
      angle: { decimals: 0, unit: '°' },
      signedAngle: { decimals: 0, unit: '°', signed: true },
      signedDecimal: { decimals: 2, unit: '', signed: true },
      distance: { decimals: 2, unit: 'm' },
      multiplier: { decimals: 2, unit: '×' },
      decimal: { decimals: 2, unit: '' },
      integer: { decimals: 0, unit: '' },
    };
    
    const config = formatMap[type] || formatMap.decimal;
    const dec = decimals !== null ? decimals : config.decimals;
    const formatted = dec === 0 ? Math.round(value).toString() : value.toFixed(dec);
    const signed = config.signed && value > 0 ? '+' : '';
    return config.unit ? `${signed}${formatted}${config.unit}` : `${signed}${formatted}`;
  }

  /**
   * Update value label for a slider
   * @param {string} key - The data-output key
   * @param {string|number} value - The value to display (or formatted string)
   * @param {string} type - Format type if value is number
   * @param {number} decimals - Optional override for decimal places
   */
  /** @returns {HTMLElement | undefined} */
  getValueLabel(key) {
    if (!this._valueLabels) {
      this._valueLabels = new Map();
      document.querySelectorAll('[data-output]').forEach((el) => {
        const id = el.dataset.output;
        if (id) this._valueLabels.set(id, el);
      });
    }
    return this._valueLabels.get(key);
  }

  updateValueLabel(key, value, type = null, decimals = null) {
    const label = this.getValueLabel(key);
    if (!label || label.classList.contains('is-editing')) return;

    if (typeof value === 'number' && type) {
      label.dataset.format = type;
      if (decimals !== null) {
        label.dataset.decimals = String(decimals);
      } else {
        delete label.dataset.decimals;
      }
      label.textContent = this.formatSliderValue(value, type, decimals);
    } else {
      delete label.dataset.format;
      delete label.dataset.decimals;
      label.textContent = String(value);
    }
  }

  /**
   * Parse typed numeric input (strips display units like °, m, ×, %, K).
   * @param {string} text
   * @returns {number}
   */
  parseNumericInput(text) {
    const cleaned = String(text)
      .trim()
      .replace(/,/g, '.')
      .replace(/\s*(°|×|%|K|m)$/i, '')
      .trim();
    if (!cleaned || cleaned === '-' || cleaned === '.') return NaN;
    return parseFloat(cleaned);
  }

  /**
   * Clamp and snap a value to a range input's min, max, and step.
   */
  snapToSliderRange(value, slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step);
    const lo = Number.isFinite(min) ? min : 0;
    const hi = Number.isFinite(max) ? max : 100;
    let v = Number.isFinite(value) ? value : lo;
    v = Math.max(lo, Math.min(hi, v));
    if (Number.isFinite(step) && step > 0) {
      const steps = Math.round((v - lo) / step);
      v = lo + steps * step;
      v = Math.max(lo, Math.min(hi, v));
    }
    return v;
  }

  /**
   * Resolve the range input tied to a value label.
   */
  resolveSliderForValueLabel(label) {
    if (!label?.dataset?.output) return null;
    const key = label.dataset.output;
    const fromInputs = this.ui?.inputs?.[key];
    if (fromInputs?.type === 'range') return fromInputs;
    return label.closest('.slider-line')?.querySelector('input[type="range"]') ?? null;
  }

  /**
   * Double-click a slider value label to reset to default; Shift+double-click to type an exact value.
   */
  setupValueLabelInlineEdit() {
    if (this._valueLabelEditBound) return;
    this._valueLabelEditBound = true;
    this._editingValueLabel = null;

    const root = this.ui?.dom?.panelsContainer ?? document;
    root.addEventListener('dblclick', (event) => {
      const label = event.target.closest('.value[data-output], #svgExtrudeColorDepths .value');
      if (!label) return;
      event.preventDefault();

      if (event.shiftKey) {
        this.startValueLabelEdit(label);
        return;
      }

      const slider = this.resolveSliderForValueLabel(label);
      if (slider) {
        this.resetRangeSliderToDefault(slider);
      }
    });
  }

  /**
   * Restore one range slider to its StateStore (or export) default and emit `input`.
   * @returns {boolean} true when the value changed
   */
  resetRangeSliderToDefault(slider) {
    if (!(slider instanceof HTMLInputElement) || slider.type !== 'range' || slider.disabled) {
      return false;
    }

    const inputKey = resolveSliderInputKey(slider, this.ui?.inputs ?? {});
    const defaults = this.stateStore?.getDefaults?.();
    const defaultValue = resolveSliderDefaultValue(slider, inputKey, defaults);
    if (!Number.isFinite(defaultValue)) return false;

    const current = parseFloat(slider.value);
    if (Number.isFinite(current) && Math.abs(current - defaultValue) < 1e-6) return false;

    this.setRangeValueProgrammatically(slider, defaultValue);
    this.updateSliderFill(slider);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  startValueLabelEdit(label) {
    if (this._editingValueLabel === label) return;
    if (this._editingValueLabel) this.commitValueLabelEdit();

    const slider = this.resolveSliderForValueLabel(label);
    if (!slider || slider.disabled) return;

    const current = parseFloat(slider.value);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'value-inline-input';
    input.setAttribute('aria-label', `Edit ${label.dataset.output} value`);
    input.value = Number.isFinite(current) ? String(current) : '';

    label.dataset.editBackup = label.textContent;
    label.textContent = '';
    label.classList.add('is-editing');
    label.appendChild(input);
    this._editingValueLabel = label;
    this._editingValueSlider = slider;

    input.focus();
    input.select();

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitValueLabelEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.cancelValueLabelEdit();
      }
    });

    input.addEventListener('blur', () => {
      requestAnimationFrame(() => {
        if (this._editingValueLabel === label) {
          this.commitValueLabelEdit();
        }
      });
    });
  }

  commitValueLabelEdit() {
    const label = this._editingValueLabel;
    const slider = this._editingValueSlider;
    if (!label || !slider) return;

    const input = label.querySelector('.value-inline-input');
    const parsed = input ? this.parseNumericInput(input.value) : NaN;
    const fallback = parseFloat(slider.value);
    const next = Number.isFinite(parsed)
      ? this.snapToSliderRange(parsed, slider)
      : (Number.isFinite(fallback) ? fallback : 0);

    label.classList.remove('is-editing');
    label.textContent = label.dataset.editBackup ?? label.textContent;
    delete label.dataset.editBackup;
    this._editingValueLabel = null;
    this._editingValueSlider = null;

    slider.value = String(next);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  cancelValueLabelEdit() {
    const label = this._editingValueLabel;
    if (!label) return;

    label.classList.remove('is-editing');
    label.textContent = label.dataset.editBackup ?? label.textContent;
    delete label.dataset.editBackup;
    this._editingValueLabel = null;
    this._editingValueSlider = null;
  }

  /**
   * While a range slider or color chip is held, state writes still apply but
   * StateStore.notify (full UI sync) waits until pointer release.
   * Tracks range drags so snap-to-center is skipped while scrubbing, and
   * restores the thumb if post-release sync overwrites the dropped value.
   */
  /** True while a shelf range/color control is held (deferred notify scrub). */
  isViewportScrubActive() {
    if (this._draggingRangeSliders?.size > 0) return true;
    if (this._deferNotifyPointerIds?.size > 0) return true;
    return !!this.stateStore?.isNotifyDeferred?.();
  }

  requestViewportRender() {
    this.ui?.scene?.requestRender?.();
  }

  setupDeferredControlNotify() {
    if (this._deferredControlNotifyBound) return;
    this._deferredControlNotifyBound = true;

    const isDeferredControl = (el) =>
      el instanceof HTMLInputElement
      && (el.type === 'range' || el.type === 'color')
      && !el.disabled;

    /** @type {Map<number, { slider: HTMLInputElement, startX: number, startY: number, dragged: boolean }>} */
    this._rangePointerDrags = new Map();
    /** @type {Set<HTMLInputElement>} */
    this._draggingRangeSliders = new Set();
    /** @type {Set<HTMLInputElement>} sliders protected from sync during scrub + post-release mesh */
    this._scrubProtectedSliders = new Set();

    /** @type {Set<number>} pointerIds that opened a deferred-notify scope */
    this._deferNotifyPointerIds = new Set();
    this._programmaticRangeUpdate = false;

    document.addEventListener(
      'input',
      (event) => {
        if (this._programmaticRangeUpdate) {
          event.stopImmediatePropagation();
        }
      },
      true,
    );

    const onPointerDown = (event) => {
      if (
        event.target instanceof HTMLInputElement
        && event.target.type === 'range'
        && !event.target.disabled
      ) {
        this._scrubProtectedSliders.add(event.target);
        this._rangePointerDrags.set(event.pointerId, {
          slider: event.target,
          startX: event.clientX,
          startY: event.clientY,
          dragged: false,
        });
      }
      if (!isDeferredControl(event.target)) return;
      this._deferNotifyPointerIds.add(event.pointerId);
      this.stateStore.beginDeferredNotify();
      this.requestViewportRender();
    };

    const onPointerMove = (event) => {
      const drag = this._rangePointerDrags.get(event.pointerId);
      if (!drag || drag.dragged) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) {
        drag.dragged = true;
        this._draggingRangeSliders.add(drag.slider);
      }
    };

    const onPointerEnd = (event) => {
      const drag = this._rangePointerDrags.get(event.pointerId);
      const scrubbingRange = drag?.slider instanceof HTMLInputElement ? drag.slider : null;

      if (drag) {
        this._rangePointerDrags.delete(event.pointerId);
        this._draggingRangeSliders.delete(drag.slider);
      }

      if (this._deferNotifyPointerIds.delete(event.pointerId)) {
        this.stateStore.endDeferredNotify();
      }

      if (scrubbingRange) {
        const slider = scrubbingRange;
        requestAnimationFrame(() => {
          this.eventBus?.emit('ui:range-scrub-end', slider);
          requestAnimationFrame(() => {
            this.releaseScrubProtection(slider);
          });
        });
      }

      this._reconcileOrphanedDeferredNotify();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerEnd, true);
    document.addEventListener('pointercancel', onPointerEnd, true);

    window.addEventListener('blur', () => {
      this.flushRangeSliderInteractionState();
    });
  }

  /** Drop stale scrub / defer state when pointer sessions end without a balanced pointerup. */
  _reconcileOrphanedDeferredNotify() {
    if (this._rangePointerDrags.size > 0 || this._deferNotifyPointerIds.size > 0) return;
    if (this.stateStore?.isNotifyDeferred?.()) {
      this.stateStore.flushDeferredNotify();
    }
  }

  /**
   * Clear in-progress range scrub state — e.g. shelf tab switch while a slider is held/focused.
   * Ensures deferred notify depth returns to zero so syncControls / applyBlockStates resume.
   */
  flushRangeSliderInteractionState() {
    this._rangePointerDrags?.clear();
    this._draggingRangeSliders?.clear();
    for (const slider of [...(this._scrubProtectedSliders ?? [])]) {
      this.releaseScrubProtection(slider);
    }
    this._deferNotifyPointerIds?.clear();

    const mc = this.ui?.meshControls;
    if (mc?.fresnelInteracting) {
      mc.fresnelInteracting.color = false;
      mc.fresnelInteracting.radius = false;
      mc.fresnelInteracting.strength = false;
    }

    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === 'range') {
      active.blur();
    }

    this.stateStore?.flushDeferredNotify?.();
  }

  protectScrubSlider(slider) {
    if (slider instanceof HTMLInputElement && slider.type === 'range') {
      this._scrubProtectedSliders.add(slider);
    }
  }

  releaseScrubProtection(slider) {
    this._scrubProtectedSliders?.delete(slider);
  }

  /** Set a range value without re-entering slider input handlers. */
  setRangeValueProgrammatically(slider, value) {
    if (!(slider instanceof HTMLInputElement) || slider.type !== 'range') return;
    const next = String(value);
    if (slider.value === next) return;
    this._programmaticRangeUpdate = true;
    try {
      slider.value = next;
    } finally {
      this._programmaticRangeUpdate = false;
    }
  }

  /** True while the user is dragging a range input (movement > 4px). */
  isRangeSliderDragging(slider) {
    return this._draggingRangeSliders?.has(slider) ?? false;
  }

  /**
   * Whether a full UI sync should skip writing onto this range input.
   * Protects active scrubs (including post-release mesh rebuild) from stale state.
   */
  shouldSkipRangeSyncWrite(slider) {
    if (!(slider instanceof HTMLInputElement) || slider.type !== 'range') return false;
    if (this._scrubProtectedSliders?.has(slider)) return true;
    if (this.isRangeSliderDragging(slider)) return true;
    if (document.activeElement === slider) return true;
    return false;
  }

  /**
   * Apply state to a range input unless the slider is under user control.
   * @returns {boolean} true when the slider `.value` was updated
   */
  syncRangeFromState(slider, value) {
    if (!(slider instanceof HTMLInputElement) || slider.type !== 'range') return false;
    if (this.shouldSkipRangeSyncWrite(slider)) return false;
    const next = String(value);
    if (slider.value === next) return false;
    this.setRangeValueProgrammatically(slider, next);
    return true;
  }

  /**
   * Clamp to min/max/step and write the canonical string back to the range input.
   * @returns {number}
   */
  canonicalizeRangeInputValue(slider, value = parseFloat(slider.value)) {
    const canonical = this.snapToSliderRange(value, slider);
    this.setRangeValueProgrammatically(slider, canonical);
    return canonical;
  }

  setupSliderFillUpdates() {
    // Add global listener for all slider inputs
    document.addEventListener('input', (event) => {
      if (event.target.type === 'range') {
        this.updateSliderFill(event.target);
      }
    }, true); // Use capture phase to catch all events

    this.setupDeferredControlNotify();
    this.setupSliderThumbReset();

    this.markToggleOnlySliderLines();

    // Initialize fill for all existing sliders
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      this.updateSliderFill(slider);
    });
  }

  /**
   * Click the slider thumb (dot) without dragging to restore the StateStore default.
   * Skips track clicks so jumping the value still works normally.
   */
  setupSliderThumbReset() {
    if (this._sliderThumbResetBound) return;
    this._sliderThumbResetBound = true;

    const root = this.ui?.dom?.panelsContainer ?? document;
    let pending = null;

    const clearPending = () => {
      if (!pending) return;
      window.removeEventListener('pointerup', pending.onEnd, true);
      window.removeEventListener('pointercancel', pending.onEnd, true);
      pending = null;
    };

    const onEnd = (event) => {
      if (!pending || event.pointerId !== pending.pointerId) return;
      const { slider, startX, startY } = pending;
      clearPending();

      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 4) return;

      // Thumb-only gesture — do not require value unchanged between down/up; some
      // browsers (notably on full-gradient rails) nudge the value on click.
      this.resetRangeSliderToDefault(slider);
    };

    root.addEventListener(
      'pointerdown',
      (event) => {
        if (event.button !== 0) return;
        const slider = event.target.closest?.('input[type="range"]');
        if (!(slider instanceof HTMLInputElement) || slider.disabled) return;
        if (!root.contains(slider)) return;
        if (!isPointerOnSliderThumb(slider, event.clientX)) return;

        clearPending();
        pending = {
          slider,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          onEnd,
        };
        window.addEventListener('pointerup', onEnd, true);
        window.addEventListener('pointercancel', onEnd, true);
      },
      true,
    );
  }

  /** Class hook for toggle-only rows — avoids :has() in shelf slider-line layout CSS. */
  markToggleOnlySliderLines() {
    document.querySelectorAll('.slider-line').forEach((line) => {
      const hasRange = line.querySelector('input[type="range"]') !== null;
      line.classList.toggle('slider-line--toggle-only', !hasRange);
    });
  }

  /**
   * Update slider fill effect using CSS variable
   * Calculates fill percentage based on slider value, min, and max
   * Supports both left-to-right fill and center-outward fill for centered sliders
   * @param {HTMLInputElement} slider - The slider input element
   */
  updateSliderFill(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Skip temperature, tint, and saturation sliders (custom gradient rails)
    const sliderLine = slider.closest('.slider-line');
    if (sliderLine?.classList.contains('slider-line--temperature') || 
        sliderLine?.classList.contains('slider-line--tint') ||
        sliderLine?.classList.contains('slider-line--saturation')) {
      return;
    }
    
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    
    // Detect if this is a centered slider (min < 0 and max > 0)
    const isCentered = min < 0 && max > 0;
    
    if (isCentered) {
      // Center-outward fill: fill from center point outward
      const center = 0;
      const range = max - min;
      const centerPercent = ((center - min) / range) * 100; // Position of center on track
      
      if (value === center) {
        // At center: no fill
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      } else if (value > center) {
        // Positive value: fill from center to value (right side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${valuePercent}%`);
      } else {
        // Negative value: fill from value to center (left side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${valuePercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      }
    } else {
      const range = max - min;
      const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
      const isRtl =
        sliderLine?.classList.contains('slider-line--surface-detail') ||
        getComputedStyle(slider).direction === 'rtl';
      if (isRtl) {
        // Track is mirrored (direction: rtl, e.g. Surface Detail) so the thumb sits at
        // (100 - fillPercent)% from the left. Fill the left edge up to the thumb so lime
        // grows left→thumb like every other slider (was filling thumb→right = backwards).
        slider.style.setProperty('--slider-fill-start', '0%');
        slider.style.setProperty('--slider-fill-end', `${100 - fillPercent}%`);
      } else {
        slider.style.setProperty('--slider-fill-start', '0%');
        slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
      }
    }
  }

  /**
   * Apply snap-to-center for sliders with center default values
   * @param {HTMLInputElement} slider - The slider input element
   * @param {number} min - Minimum slider value
   * @param {number} max - Maximum slider value
   * @param {number} centerValue - The center/default value to snap to
   * @param {Event|null} [inputEvent] - Original input event; when non-trusted (e.g. synthetic `input` from keyboard stepping), snap is skipped so small nudges aren’t pulled to center.
   * @param {number} thresholdPercent - Threshold as percentage of range (default: 3%)
   * @returns {number} - The value (snapped if within threshold, otherwise original)
   */
  applySnapToCenter(slider, min, max, centerValue, inputEvent = null, thresholdPercent = 3) {
    if (!slider) return parseFloat(slider.value);

    const currentValue = parseFloat(slider.value);

    // Snap is for real pointer drags (trusted `input`). Keyboard code dispatches synthetic events (isTrusted === false).
    if (inputEvent != null && inputEvent.isTrusted === false) {
      return Number.isFinite(currentValue) ? currentValue : centerValue;
    }

    // Skip magnetic snap while scrubbing — only track clicks / keyboard apply snap.
    if (this.isRangeSliderDragging(slider)) {
      return Number.isFinite(currentValue) ? currentValue : centerValue;
    }

    const range = max - min;
    const threshold = (range * thresholdPercent) / 100;
    const distanceFromCenter = Math.abs(currentValue - centerValue);

    // If within threshold, snap to center
    if (distanceFromCenter <= threshold) {
      slider.value = centerValue;
      return centerValue;
    }

    return currentValue;
  }

  /**
   * Setup keyboard support for all range inputs
   */
  setupSliderKeyboardSupport() {
    // Find all range inputs and ensure they're focusable
    const allSliders = document.querySelectorAll('input[type="range"]');
    allSliders.forEach((slider) => {
      // Ensure focusable
      if (!slider.hasAttribute('tabindex')) {
        slider.setAttribute('tabindex', '0');
      }
      
      // Ensure focus on click
      slider.addEventListener('click', () => {
        slider.focus();
      }, { passive: true });
    });
  }

  /**
   * Enable keyboard arrow key stepping for a slider
   * @param {HTMLInputElement} slider - The slider input element
   * @deprecated - Keyboard stepping is now handled at document level for all sliders
   */
  enableSliderKeyboardStepping(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Just ensure slider is focusable - keyboard handling is done at document level
    slider.setAttribute('tabindex', '0');
    
    // Ensure slider gets focus on click
    slider.addEventListener('click', (event) => {
      if (event.target === slider) {
        slider.focus();
      }
    });
  }

  /**
   * Unified method to set control disabled state
   * @param {string|string[]} inputIds - Single ID or array of IDs
   * @param {boolean} disabled - Whether to disable
   * @param {object} options - Additional options
   */
  setControlDisabled(inputIds, disabled, options = {}) {
    const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
    const { applyBlockMute = false, blockKey = null } = options;
    
    ids.forEach((id) => {
      const input = this.ui.inputs[id];
      if (!input) return;
      
      input.disabled = disabled;
      // Use consistent class name
      input.classList.toggle('is-disabled-handle', disabled);
    });
    
    // Optionally apply block muting
    if (applyBlockMute && blockKey) {
      this.ui.setBlockMuted(blockKey, disabled);
    }
  }

  /**
   * Dual-write helper — persist state and emit scene apply event.
   */
  writeStateAndEmit(statePath, event, value) {
    writeStateAndEmit(this.stateStore, this.eventBus, statePath, event, value);
  }

  /**
   * Bind a range input from a UI manifest entry.
   * @param {import('../state/uiMeshControlManifest.js').UiControlManifestEntry} entry
   */
  bindManifestRangeControl(entry) {
    const input = this.ui.inputs[entry.inputId];
    if (!input) return;

    input.addEventListener('input', (event) => {
      const value = parseManifestRangeValue(event.target.value, {
        min: entry.clampMin,
        max: entry.clampMax,
        fallback: entry.fallback,
      });
      if (entry.labelKey) {
        this.updateValueLabel(entry.labelKey, value, entry.labelType);
      }
      this.writeStateAndEmit(entry.statePath, entry.event, value);
    });
    this.enableSliderKeyboardStepping(input);
  }

  /**
   * Bind a checkbox from a UI manifest entry.
   * @param {import('../state/uiMeshControlManifest.js').UiControlManifestEntry} entry
   */
  bindManifestCheckboxControl(entry) {
    const input = this.ui.inputs[entry.inputId];
    if (!input) return;

    input.addEventListener('change', (event) => {
      const value = !!event.target.checked;
      this.writeStateAndEmit(entry.statePath, entry.event, value);
    });
  }

  /**
   * Bind a color input from a UI manifest entry.
   * @param {import('../state/uiMeshControlManifest.js').UiControlManifestEntry} entry
   */
  bindManifestColorControl(entry) {
    this.bindColorInput(entry.inputId, entry.statePath, entry.event);
  }

  /**
   * Bind multiple UI manifest entries (range / checkbox / color).
   * @param {import('../state/uiMeshControlManifest.js').UiControlManifestEntry[]} entries
   */
  bindManifestControls(entries) {
    for (const entry of entries) {
      const type = entry.inputType ?? 'range';
      if (type === 'color') this.bindManifestColorControl(entry);
      else if (type === 'checkbox') this.bindManifestCheckboxControl(entry);
      else this.bindManifestRangeControl(entry);
    }
  }

  /**
   * Bind Render-style manifest entries — optional look-filter batch wrapper,
   * slice emit, scalar transforms, snap-to-center, and emit hooks.
   * @param {import('../state/uiRenderControlManifest.js').RenderManifestEntry[]} entries
   * @param {{ commitLookFilterTouchWith?: (fn: () => void) => void, emitHooks?: Record<string, () => void> }} [options]
   */
  bindLookFilterManifestControls(entries, options = {}) {
    const { commitLookFilterTouchWith, emitHooks = {} } = options;

    for (const entry of entries) {
      const input = this.ui.inputs[entry.inputId];
      if (!input) continue;

      const writeState = (value) => {
        const apply = () => this.stateStore.set(entry.statePath, value);
        if (entry.lookFilterTouch && commitLookFilterTouchWith) {
          commitLookFilterTouchWith(apply);
        } else {
          apply();
        }
      };

      const emitAfter = (scalarValue) => {
        if (entry.emitHook && emitHooks[entry.emitHook]) {
          emitHooks[entry.emitHook]();
          return;
        }
        if (entry.emitNoPayload) {
          this.eventBus.emit(entry.event);
          return;
        }
        if (entry.emitSlice) {
          this.eventBus.emit(entry.event, getAtPath(this.stateStore.getState(), entry.emitSlice));
          return;
        }
        let emitVal = scalarValue;
        if (entry.emitTransform === 'divide100') emitVal = scalarValue / 100;
        else if (entry.emitTransform === 'shadowsShader') {
          emitVal = cameraShadowsUiToShader(scalarValue);
        }
        this.eventBus.emit(entry.event, emitVal);
      };

      const type = entry.inputType ?? 'range';
      if (type === 'checkbox') {
        input.addEventListener('change', (event) => {
          const value = !!event.target.checked;
          writeState(value);
          emitAfter(value);
        });
        continue;
      }
      if (type === 'color') {
        input.addEventListener('input', (event) => {
          const value = event.target.value;
          writeState(value);
          emitAfter(value);
        });
        continue;
      }

      input.addEventListener('input', (event) => {
        const slider = event.target;
        let value;
        if (entry.snapCenter) {
          const { min, max, center } = entry.snapCenter;
          value = this.applySnapToCenter(slider, min, max, center, event);
          if (entry.fallback != null && !Number.isFinite(value)) {
            value = entry.fallback;
          }
        } else {
          value = parseManifestRangeValue(slider.value, {
            min: entry.clampMin,
            max: entry.clampMax,
            fallback: entry.fallback,
          });
          if (entry.rewriteClamp && parseFloat(slider.value) !== value) {
            slider.value = String(value);
          }
        }
        if (!Number.isFinite(value)) return;
        if (entry.labelKey) {
          this.updateValueLabel(
            entry.labelKey,
            value,
            entry.labelType,
            entry.labelDecimals,
          );
        }
        writeState(value);
        emitAfter(value);
      });
      this.enableSliderKeyboardStepping(input);
    }
  }

  /**
   * Unified color input handler
   * @param {string} inputId - The color input ID
   * @param {string} statePath - StateStore path (e.g., 'clay.color', 'lensFlare.color')
   * @param {string} eventName - Event bus event name
   */
  bindColorInput(inputId, statePath, eventName) {
    const input = this.ui.inputs[inputId];
    if (!input) return;

    // Native <input type=color> fires `input` continuously while the OS picker is open.
    // Defer UI sync until the picker closes (`change`/`blur`) so syncControls doesn't write
    // `.value` back mid-drag — that write-back makes the picker appear frozen/unresponsive.
    let editing = false;
    const endEditing = () => {
      if (!editing) return;
      editing = false;
      this.stateStore.endDeferredNotify();
    };

    input.addEventListener('input', (event) => {
      if (!editing) {
        editing = true;
        this.stateStore.beginDeferredNotify();
        this.requestViewportRender();
      }
      this.writeStateAndEmit(statePath, eventName, event.target.value);
    });
    input.addEventListener('change', (event) => {
      this.writeStateAndEmit(statePath, eventName, event.target.value);
      endEditing();
    });
    input.addEventListener('blur', endEditing);
  }

  /**
   * Show toast notification — delegates to UIManager (long strings use dismissible dialog).
   * @param {{ caution?: boolean }} [toastOptions]
   */
  showToast(message, durationMs = 3200, toastOptions = {}) {
    if (typeof this.ui?.showToast === 'function') {
      this.ui.showToast(message, durationMs, toastOptions);
    }
  }

  /**
   * Set block muted state (for visual feedback)
   * @param {string} blockKey - Block identifier
   * @param {boolean} muted - Whether block is muted
   */
  setBlockMuted(blockKey, muted) {
    // First try to find a subsection (for merged blocks)
    const subsection = this.ui.dom?.subsections?.[blockKey];
    if (subsection) {
      subsection.classList.toggle('is-muted', muted);
      return;
    }
    // Fall back to regular block
    const block = this.ui.dom?.blocks?.[blockKey];
    if (!block) {
      // Silently fail - block might not exist yet or key might be wrong
      return;
    }
    // Only toggle the class - don't affect other blocks
    block.classList.toggle('is-muted', muted);
  }
}

