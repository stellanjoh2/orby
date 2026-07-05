import { ORBY_BLACK } from '../constants.js';
import {
  hexToHsl,
  hexToHsv,
  hexToRgb,
  hslToHex,
  hsvToHex,
  normalizeHex,
  rgbToHex,
} from '../colorUtils.js';
import {
  collectScrollContainers,
  computePopoverPlacement,
  getPopoverAnchorRect,
} from './popoverPlacement.js';

/** @typedef {{ h: number, s: number, v: number }} Hsv */
/** @typedef {'hex' | 'rgb' | 'hsl'} ColorScale */

const RECENT_STORAGE_KEY = 'orby.recentColors';
const RECENT_SWATCHES_PER_ROW = 7;
/** Horizontal + row gutters between recent swatches — 8px, evenly fills padded row width. */
const RECENT_GAP_PX = 8;
const PICKER_PAD_PX = 14;
/** Max stored recents — 2 rows × 7; oldest drops when full. */
const MAX_RECENT = RECENT_SWATCHES_PER_ROW * 2;
const PANEL_INNER_WIDTH_PX = 288;
const PANEL_WIDTH_PX = PANEL_INNER_WIDTH_PX + PICKER_PAD_PX * 2;

/**
 * Custom Orby color picker — SV field, hue slider, hex/RGB/HSL inputs, recent swatches.
 */
export class OrbyColorPicker {
  constructor() {
    /** @type {Hsv} */
    this.hsv = hexToHsv(ORBY_BLACK);
    /** @type {ColorScale} */
    this.scale = 'hex';
    /** @type {'sv' | 'hue' | null} */
    this._dragMode = null;
    /** @type {HTMLElement | null} */
    this._anchor = null;
    /** @type {{ clientX: number, clientY: number } | null} */
    this._anchorPoint = null;
    /** @type {EventTarget[]} */
    this._scrollTargets = [];
    this._open = false;

    this.root = document.createElement('div');
    this.root.className = 'orby-color-picker';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Choose color');
    this.root.innerHTML = `
      <div class="orby-color-picker__head">
        <h2 class="orby-color-picker__title block-title">Select Color</h2>
        <button type="button" class="close-btn orby-color-picker__close" aria-label="Close color picker"></button>
      </div>
      <div class="orby-color-picker__sv" tabindex="0" role="slider" aria-label="Saturation and brightness">
        <div class="orby-color-picker__sv-thumb"></div>
      </div>
      <div class="orby-color-picker__body">
        <div class="orby-color-picker__hue" tabindex="0" role="slider" aria-label="Hue">
          <div class="orby-color-picker__hue-track"></div>
          <div class="orby-color-picker__hue-thumb"></div>
        </div>
        <div class="orby-color-picker__inputs">
          <button
            type="button"
            class="orby-color-picker__eyedropper"
            aria-label="Pick color from screen"
          >
            <i class="fa-solid fa-eye-dropper" aria-hidden="true"></i>
          </button>
          <div class="orby-color-picker__fields-wrap">
            <div class="orby-color-picker__fields orby-color-picker__fields--hex is-visible">
              <input
                type="text"
                id="orbyColorPickerHex"
                name="orbyColorPickerHex"
                class="orby-color-picker__hex"
                spellcheck="false"
                autocomplete="off"
                aria-label="Hex color"
              />
            </div>
            <div class="orby-color-picker__fields orby-color-picker__fields--rgb">
              <input type="text" id="orbyColorPickerR" name="orbyColorPickerR" class="orby-color-picker__channel" data-channel="r" inputmode="numeric" aria-label="Red" />
              <input type="text" id="orbyColorPickerG" name="orbyColorPickerG" class="orby-color-picker__channel" data-channel="g" inputmode="numeric" aria-label="Green" />
              <input type="text" id="orbyColorPickerB" name="orbyColorPickerB" class="orby-color-picker__channel" data-channel="b" inputmode="numeric" aria-label="Blue" />
            </div>
            <div class="orby-color-picker__fields orby-color-picker__fields--hsl">
              <input type="text" id="orbyColorPickerH" name="orbyColorPickerH" class="orby-color-picker__channel" data-channel="h" inputmode="numeric" aria-label="Hue" />
              <input type="text" id="orbyColorPickerS" name="orbyColorPickerS" class="orby-color-picker__channel" data-channel="s" inputmode="numeric" aria-label="Saturation" />
              <input type="text" id="orbyColorPickerL" name="orbyColorPickerL" class="orby-color-picker__channel" data-channel="l" inputmode="numeric" aria-label="Lightness" />
            </div>
          </div>
          <div class="orby-color-picker__scale-combo">
            <button
              type="button"
              class="orby-color-picker__scale-trigger"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label="Color format"
            >
              HEX
            </button>
            <ul class="orby-color-picker__scale-list" role="listbox" tabindex="-1" hidden>
              <li class="orby-color-picker__scale-option is-selected" role="option" data-value="hex" aria-selected="true">HEX</li>
              <li class="orby-color-picker__scale-option" role="option" data-value="rgb" aria-selected="false">RGB</li>
              <li class="orby-color-picker__scale-option" role="option" data-value="hsl" aria-selected="false">HSL</li>
            </ul>
          </div>
        </div>
        <div class="orby-color-picker__recent">
          <div class="orby-color-picker__recent-rule" aria-hidden="true"></div>
          <div class="orby-color-picker__recent-swatches" role="list" aria-label="Recently used colors"></div>
        </div>
      </div>
    `;

    this.sv = this.root.querySelector('.orby-color-picker__sv');
    this.svThumb = this.root.querySelector('.orby-color-picker__sv-thumb');
    this.hue = this.root.querySelector('.orby-color-picker__hue');
    this.hueTrack = this.root.querySelector('.orby-color-picker__hue-track');
    this.hueThumb = this.root.querySelector('.orby-color-picker__hue-thumb');
    this.hexInput = this.root.querySelector('.orby-color-picker__hex');
    this.rgbFields = this.root.querySelector('.orby-color-picker__fields--rgb');
    this.hslFields = this.root.querySelector('.orby-color-picker__fields--hsl');
    this.hexFields = this.root.querySelector('.orby-color-picker__fields--hex');
    this.scaleCombo = this.root.querySelector('.orby-color-picker__scale-combo');
    this.scaleTrigger = this.root.querySelector('.orby-color-picker__scale-trigger');
    this.scaleList = this.root.querySelector('.orby-color-picker__scale-list');
    this.closeButton = this.root.querySelector('.orby-color-picker__close');
    this.eyeDropperButton = this.root.querySelector('.orby-color-picker__eyedropper');
    this.recentSwatches = this.root.querySelector('.orby-color-picker__recent-swatches');

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onDocClick = this._onDocClick.bind(this);
    this._onDocKey = this._onDocKey.bind(this);
    this._reposition = this._positionPanel.bind(this);

    this.sv?.addEventListener('pointerdown', this._onPointerDown);
    this.hue?.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    this.hexInput?.addEventListener('input', () => this._applyHexInput(this.hexInput?.value ?? ''));
    this.hexInput?.addEventListener('change', () => this._commitHexInput());
    this.hexInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this._commitHexInput();
        this.hexInput?.blur();
      }
    });

    this.root.querySelectorAll('.orby-color-picker__channel').forEach((input) => {
      input.addEventListener('input', () => this._applyChannelInputs());
      input.addEventListener('change', () => this._applyChannelInputs(true));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this._applyChannelInputs(true);
          input.blur();
        }
      });
    });

    this.scaleTrigger?.addEventListener('click', (event) => {
      event.stopPropagation();
      this._toggleScaleList();
    });

    this.scaleList?.querySelectorAll('.orby-color-picker__scale-option').forEach((option) => {
      option.addEventListener('click', (event) => {
        event.stopPropagation();
        const value = option instanceof HTMLElement ? option.dataset.value : null;
        if (value === 'hex' || value === 'rgb' || value === 'hsl') {
          this.setScale(value);
          this._closeScaleList();
        }
      });
    });

    this.closeButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.close();
    });

    this.eyeDropperButton?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onEyeDropper?.();
    });

    this._ensurePortal();
  }

  /** @param {(hex: string) => void} [onInput] @param {() => void} [onClose] @param {() => void} [onEyeDropper] */
  setCallbacks({ onInput, onClose, onEyeDropper } = {}) {
    this.onInput = onInput;
    this.onClose = onClose;
    this.onEyeDropper = onEyeDropper;
  }

  /** @param {HTMLInputElement} anchor @param {{ clientX?: number, clientY?: number }} [point] */
  open(anchor, point) {
    if (!(anchor instanceof HTMLInputElement) || anchor.disabled) return;
    this._anchor = anchor;
    this._anchorPoint =
      point?.clientX != null && point?.clientY != null
        ? { clientX: point.clientX, clientY: point.clientY }
        : null;
    this.setScale('hex');
    this.setValue(anchor.value || ORBY_BLACK);
    this._renderRecent();
    this.root.hidden = false;
    this.root.classList.add('is-open');
    this._open = true;

    this._positionPanel();

    this._bindRepositionListeners();
    document.addEventListener('click', this._onDocClick, true);
    document.addEventListener('keydown', this._onDocKey, true);
    requestAnimationFrame(() => {
      this._positionPanel();
      this.hexInput?.focus({ preventScroll: true });
      this.hexInput?.select();
    });
  }

  close({ commitRecent = true } = {}) {
    if (!this._open) return;
    this._closeScaleList();
    if (commitRecent && this._anchor) {
      pushRecentColor(this.getValue());
    }
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    this._open = false;
    this._dragMode = null;
    document.removeEventListener('click', this._onDocClick, true);
    document.removeEventListener('keydown', this._onDocKey, true);
    this._unbindRepositionListeners();
    this._clearPanelPosition();
    this.onClose?.();
    this._anchor = null;
    this._anchorPoint = null;
  }

  /** @param {string} hex */
  setValue(hex) {
    this.hsv = hexToHsv(normalizeHex(hex));
    this._syncUi();
  }

  getValue() {
    return hsvToHex(this.hsv.h, this.hsv.s, this.hsv.v);
  }

  /** @param {ColorScale} scale */
  setScale(scale) {
    this.scale = scale;
    if (this.scaleTrigger) {
      this.scaleTrigger.textContent = scale.toUpperCase();
    }
    this.root.dataset.colorScale = scale;
    this.scaleList?.querySelectorAll('.orby-color-picker__scale-option').forEach((option) => {
      if (!(option instanceof HTMLElement)) return;
      const selected = option.dataset.value === scale;
      option.classList.toggle('is-selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    this.hexFields?.classList.toggle('is-visible', scale === 'hex');
    this.rgbFields?.classList.toggle('is-visible', scale === 'rgb');
    this.hslFields?.classList.toggle('is-visible', scale === 'hsl');
    this._syncFieldValues();
  }

  _toggleScaleList() {
    if (!this.scaleList || !this.scaleTrigger) return;
    const open = this.scaleList.hidden;
    if (open) {
      this.scaleList.hidden = false;
      this.scaleTrigger.setAttribute('aria-expanded', 'true');
      this.scaleCombo?.classList.add('is-open');
    } else {
      this._closeScaleList();
    }
  }

  _closeScaleList() {
    if (!this.scaleList || !this.scaleTrigger) return;
    this.scaleList.hidden = true;
    this.scaleTrigger.setAttribute('aria-expanded', 'false');
    this.scaleCombo?.classList.remove('is-open');
  }

  _ensurePortal() {
    let portal = document.getElementById('orby-color-picker-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'orby-color-picker-portal';
      document.body.appendChild(portal);
    }
    if (this.root.parentElement !== portal) {
      portal.appendChild(this.root);
    }
  }

  _positionPanel() {
    const anchor = this._anchor;
    if (!anchor?.isConnected) return;

    this.root.style.width = `${PANEL_WIDTH_PX}px`;
    this.root.style.visibility = 'hidden';
    void this.root.offsetHeight;

    const panelHeight = this.root.getBoundingClientRect().height;
    const panel = {
      width: PANEL_WIDTH_PX,
      height: panelHeight > 0 ? panelHeight : 320,
    };

    const anchorRect = getPopoverAnchorRect(anchor, this._anchorPoint);
    const { left, top } = computePopoverPlacement(anchorRect, panel, this._anchorPoint);

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.visibility = 'visible';
  }

  _bindRepositionListeners() {
    this._unbindRepositionListeners();
    this._scrollTargets = collectScrollContainers(this._anchor);
    for (const target of this._scrollTargets) {
      target.addEventListener('scroll', this._reposition, { passive: true });
    }
    window.addEventListener('resize', this._reposition, { passive: true });
  }

  _unbindRepositionListeners() {
    for (const target of this._scrollTargets) {
      target.removeEventListener('scroll', this._reposition);
    }
    this._scrollTargets = [];
    window.removeEventListener('resize', this._reposition);
  }

  _clearPanelPosition() {
    this.root.style.width = '';
    this.root.style.left = '';
    this.root.style.top = '';
    this.root.style.visibility = '';
  }

  _syncUi() {
    const hue = this.hsv.h;
    if (this.sv) {
      this.sv.style.background = [
        'linear-gradient(to top, #000, transparent)',
        'linear-gradient(to right, #fff, transparent)',
        `hsl(${hue} 100% 50%)`,
      ].join(', ');
    }
    if (this.svThumb) {
      this.svThumb.style.left = `${this.hsv.s * 100}%`;
      this.svThumb.style.top = `${(1 - this.hsv.v) * 100}%`;
    }
    if (this.hue) {
      this.hue.style.setProperty('--hue-ratio', String(hue / 360));
    }
    this._syncFieldValues();
  }

  _syncFieldValues() {
    const hex = this.getValue();
    if (this.hexInput && this.scale === 'hex') {
      this.hexInput.value = hex.toUpperCase();
    }
    if (this.scale === 'rgb' && this.rgbFields) {
      const { r, g, b } = hexToRgb(hex);
      this._setChannelValue('r', String(r));
      this._setChannelValue('g', String(g));
      this._setChannelValue('b', String(b));
    }
    if (this.scale === 'hsl' && this.hslFields) {
      const { h, s, l } = hexToHsl(hex);
      this._setChannelValue('h', String(Math.round(h)));
      this._setChannelValue('s', `${Math.round(s)}%`);
      this._setChannelValue('l', `${Math.round(l)}%`);
    }
  }

  /** @param {string} channel @param {string} value */
  _setChannelValue(channel, value) {
    const input = this.root.querySelector(`.orby-color-picker__channel[data-channel="${channel}"]`);
    if (input instanceof HTMLInputElement) input.value = value;
  }

  _emitInput() {
    this._syncUi();
    this.onInput?.(this.getValue());
  }

  /** @param {string} raw */
  _applyHexInput(raw) {
    const trimmed = raw.trim();
    if (!/^#?[0-9a-fA-F]{3,6}$/.test(trimmed)) return;
    let hex = trimmed;
    if (!hex.startsWith('#')) hex = `#${hex}`;
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      this.hsv = hexToHsv(normalizeHex(hex));
      this._emitInput();
    }
  }

  _commitHexInput() {
    const hex = normalizeHex(this.hexInput?.value ?? '', this.getValue());
    this.hsv = hexToHsv(hex);
    this._emitInput();
  }

  /** @param {boolean} [force] */
  _applyChannelInputs(force = false) {
    const hex = this.getValue();
    if (this.scale === 'rgb') {
      const r = parseInt(this._channelValue('r'), 10);
      const g = parseInt(this._channelValue('g'), 10);
      const b = parseInt(this._channelValue('b'), 10);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return;
      if (!force && (r > 255 || g > 255 || b > 255 || r < 0 || g < 0 || b < 0)) return;
      this.hsv = hexToHsv(rgbToHex(r, g, b));
      this._emitInput();
      return;
    }
    if (this.scale === 'hsl') {
      const h = parseFloat(this._channelValue('h'));
      const s = parseFloat(this._channelValue('s'));
      const l = parseFloat(this._channelValue('l'));
      if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return;
      this.hsv = hexToHsv(hslToHex(h, s, l));
      this._emitInput();
    } else if (force) {
      this._syncFieldValues();
    }
    void hex;
  }

  /** @param {string} channel */
  _channelValue(channel) {
    const input = this.root.querySelector(`.orby-color-picker__channel[data-channel="${channel}"]`);
    return String(input?.value ?? '').replace(/%/g, '').trim();
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains('orby-color-picker__sv')) this._dragMode = 'sv';
    else if (target.classList.contains('orby-color-picker__hue')) this._dragMode = 'hue';
    else return;

    event.preventDefault();
    target.setPointerCapture(event.pointerId);
    this._updateFromPointer(event.clientX, event.clientY);
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (!this._dragMode) return;
    this._updateFromPointer(event.clientX, event.clientY);
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    if (!this._dragMode) return;
    this.sv?.releasePointerCapture?.(event.pointerId);
    this.hue?.releasePointerCapture?.(event.pointerId);
    this._dragMode = null;
  }

  /** @param {number} clientX @param {number} clientY */
  _updateFromPointer(clientX, clientY) {
    if (this._dragMode === 'sv' && this.sv) {
      const rect = this.sv.getBoundingClientRect();
      const s = (clientX - rect.left) / rect.width;
      const v = 1 - (clientY - rect.top) / rect.height;
      this.hsv.s = Math.min(1, Math.max(0, s));
      this.hsv.v = Math.min(1, Math.max(0, v));
      this._emitInput();
      return;
    }
    if (this._dragMode === 'hue' && this.hueTrack) {
      const rect = this.hueTrack.getBoundingClientRect();
      const h = ((clientX - rect.left) / rect.width) * 360;
      this.hsv.h = Math.min(360, Math.max(0, h));
      this._emitInput();
    }
  }

  /** @param {MouseEvent} event */
  _onDocClick(event) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) {
      if (this.scaleCombo && !this.scaleCombo.contains(target)) {
        this._closeScaleList();
      }
      return;
    }
    if (this._anchor?.contains(target)) return;
    this.close();
  }

  /** @param {KeyboardEvent} event */
  _onDocKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.scaleList && !this.scaleList.hidden) {
        this._closeScaleList();
        return;
      }
      this.close({ commitRecent: false });
    }
  }

  _renderRecent() {
    if (!this.recentSwatches) return;
    const colors = loadRecentColors();
    this.recentSwatches.replaceChildren();
    const recentSection = this.root.querySelector('.orby-color-picker__recent');
    if (colors.length === 0) {
      if (recentSection instanceof HTMLElement) recentSection.hidden = true;
      return;
    }
    if (recentSection instanceof HTMLElement) recentSection.hidden = false;
    colors.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'orby-color-picker__recent-swatch';
      button.style.backgroundColor = color;
      button.setAttribute('aria-label', color);
      button.title = color;
      button.addEventListener('click', () => {
        this.setValue(color);
        this._emitInput();
      });
      this.recentSwatches.append(button);
    });
  }
}

/** @returns {string[]} */
function loadRecentColors() {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (typeof entry === 'string' ? normalizeHex(entry, '') : ''))
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** @param {string} hex */
function pushRecentColor(hex) {
  const normalized = normalizeHex(hex);
  const list = loadRecentColors().filter((color) => color !== normalized);
  list.unshift(normalized);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  } catch {
    /* quota / private mode */
  }
}
