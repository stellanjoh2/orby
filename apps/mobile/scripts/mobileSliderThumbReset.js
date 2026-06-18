import { DEFAULT_BACKGROUND_GRADIENT } from '../../../scripts/render/backgroundGradient/backgroundGradientDefaults.js';
import { isPointerOnSliderThumb } from '../../../scripts/ui/sliderDefaultPaths.js';
import { MOBILE_HDRI_STRENGTH_DEFAULT } from './MobileScene.js';
import {
  MOBILE_CAMERA_FOV,
  MOBILE_FX_BLOOM_SLIDERS,
  MOBILE_FX_LENS_ROWS,
  MOBILE_FX_SLIDER_SECTIONS,
} from './mobileFxControls.js';
import { mobileHaptic } from './mobileHaptics.js';
import { MOBILE_MATERIAL_SLIDERS } from './mobileMaterialControls.js';
import { MOBILE_BASE_SCALE } from './mobileObjectBaseControls.js';
import {
  MOBILE_STYLE_SLIDERS,
  buildMobileCreativeLookResetPatch,
} from './mobileStyleControls.js';
import { updateMobileSliderFill } from './mobileSliderHelpers.js';

const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DIST_PX = 24;
const THUMB_HIT_TOLERANCE_PX = 22;
const TAP_MOVE_MAX_PX = 6;

/** @param {string} path */
function findFxSliderDef(path) {
  for (const section of MOBILE_FX_SLIDER_SECTIONS) {
    const def = section.sliders.find((slider) => slider.path === path);
    if (def) return def;
  }
  if (path === 'fov') return MOBILE_CAMERA_FOV;
  return null;
}

/**
 * @param {HTMLInputElement} input
 * @param {{ selection?: { style?: { id?: string } } } | null | undefined} ctx
 * @returns {number | undefined}
 */
export function resolveMobileSliderDefaultValue(input, ctx) {
  if (!(input instanceof HTMLInputElement) || input.disabled) return undefined;

  const materialPath = input.getAttribute('data-material-path');
  if (materialPath) {
    return MOBILE_MATERIAL_SLIDERS.find((def) => def.path === materialPath)?.defaultValue;
  }

  if (input.hasAttribute('data-object-base-scale')) {
    return MOBILE_BASE_SCALE.defaultValue;
  }

  const stylePath = input.getAttribute('data-style-path');
  if (stylePath) {
    const presetId = ctx?.selection?.style?.id;
    if (presetId && presetId !== 'none' && presetId !== 'standard') {
      const patch = buildMobileCreativeLookResetPatch(presetId);
      const patched = patch[stylePath];
      if (typeof patched === 'number' && Number.isFinite(patched)) return patched;
    }
    return MOBILE_STYLE_SLIDERS.find((def) => def.path === stylePath)?.defaultValue;
  }

  const fxPath = input.getAttribute('data-fx-path');
  if (fxPath) return findFxSliderDef(fxPath)?.defaultValue;

  const bloomPath = input.getAttribute('data-fx-bloom');
  if (bloomPath) {
    return MOBILE_FX_BLOOM_SLIDERS.find((def) => def.path === bloomPath)?.defaultValue;
  }

  const lensPath = input.getAttribute('data-fx-lens');
  if (lensPath) {
    return MOBILE_FX_LENS_ROWS.find((row) => row.sliderPath === lensPath)?.min ?? 0;
  }

  if (input.hasAttribute('data-hdri-brightness-input')) return MOBILE_HDRI_STRENGTH_DEFAULT;
  if (input.hasAttribute('data-hdri-blur-input')) return 0;
  if (input.hasAttribute('data-bg-gradient-angle')) return DEFAULT_BACKGROUND_GRADIENT.angle;
  if (input.hasAttribute('data-bg-gradient-center-x')) return DEFAULT_BACKGROUND_GRADIENT.centerX;
  if (input.hasAttribute('data-bg-gradient-center-y')) return DEFAULT_BACKGROUND_GRADIENT.centerY;

  return undefined;
}

/**
 * @param {HTMLInputElement} input
 * @param {{ selection?: { style?: { id?: string } } } | null | undefined} ctx
 * @returns {boolean}
 */
export function resetMobileSliderToDefault(input, ctx) {
  const defaultValue = resolveMobileSliderDefaultValue(input, ctx);
  if (!Number.isFinite(defaultValue)) return false;

  const current = parseFloat(input.value);
  if (Number.isFinite(current) && Math.abs(current - defaultValue) < 1e-6) return false;

  input.value = String(defaultValue);
  updateMobileSliderFill(input);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Double-tap the lime thumb to restore a slider default (single tap stays free for drag).
 * @param {{
 *   root: HTMLElement,
 *   getCtx?: () => { selection?: { style?: { id?: string } } } | null | undefined,
 *   isDragActive?: () => boolean,
 * }} opts
 */
export function bindMobileSliderThumbDoubleTapReset({ root, getCtx, isDragActive }) {
  /** @type {{ input: HTMLInputElement, time: number, x: number, y: number } | null} */
  let lastTap = null;
  /** @type {Map<number, { input: HTMLInputElement, startX: number, startY: number }>} */
  const pendingPointers = new Map();

  /** @param {EventTarget | null} target */
  const resolveRangeInput = (target) => {
    if (!(target instanceof Element) || !root.contains(target)) return null;
    if (target.closest('.effect-toggle, button, .orby-mobile-preset, .orby-mobile-color-swatch')) {
      return null;
    }
    if (target instanceof HTMLInputElement && target.type === 'range' && !target.disabled) {
      return target;
    }
    return null;
  };

  /**
   * @param {HTMLInputElement} input
   * @param {number} clientX
   * @param {number} clientY
   */
  const maybeReset = (input, clientX, clientY) => {
    if (!isPointerOnSliderThumb(input, clientX, THUMB_HIT_TOLERANCE_PX)) return;

    const now = performance.now();
    if (
      lastTap
      && lastTap.input === input
      && now - lastTap.time < DOUBLE_TAP_MS
      && Math.hypot(clientX - lastTap.x, clientY - lastTap.y) < DOUBLE_TAP_DIST_PX
    ) {
      lastTap = null;
      if (resetMobileSliderToDefault(input, getCtx?.())) {
        mobileHaptic('light');
      }
      return;
    }

    lastTap = { input, time: now, x: clientX, y: clientY };
  };

  /** @param {PointerEvent} e */
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const input = resolveRangeInput(e.target);
    if (!input || !isPointerOnSliderThumb(input, e.clientX, THUMB_HIT_TOLERANCE_PX)) return;
    pendingPointers.set(e.pointerId, { input, startX: e.clientX, startY: e.clientY });
  };

  /** @param {PointerEvent} e */
  const onPointerEnd = (e) => {
    const pending = pendingPointers.get(e.pointerId);
    pendingPointers.delete(e.pointerId);
    if (!pending) return;
    if (isDragActive?.()) return;

    const { input, startX, startY } = pending;
    if (Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_MOVE_MAX_PX) return;

    const endInput = resolveRangeInput(e.target) ?? input;
    if (endInput !== input) return;

    maybeReset(input, e.clientX, e.clientY);
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerEnd, true);
  document.addEventListener('pointercancel', onPointerEnd, true);
}
