import { normalizeHex } from '../colorUtils.js';

/** @returns {boolean} */
export function isNativeEyeDropperSupported() {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

/**
 * OS-level screen sampler — same engine as the native `<input type="color">` eyedropper.
 *
 * @returns {Promise<string | null>}
 */
export async function openNativeEyeDropper() {
  if (!isNativeEyeDropperSupported()) {
    return null;
  }

  // @ts-expect-error EyeDropper is Chromium-only
  const dropper = new EyeDropper();
  const result = await dropper.open();
  const hex = result?.sRGBHex;
  return hex ? normalizeHex(hex) : null;
}

/**
 * Fallback when EyeDropper is unavailable: open the anchor chip's native color popover
 * (includes the browser eyedropper inside).
 *
 * @param {HTMLInputElement} anchor
 * @param {{ onInput?: (hex: string) => void }} [callbacks]
 * @returns {boolean}
 */
export function openNativeColorInputPicker(anchor, { onInput } = {}) {
  if (!(anchor instanceof HTMLInputElement) || anchor.type !== 'color') {
    return false;
  }
  if (typeof anchor.showPicker !== 'function') {
    return false;
  }

  const handleInput = () => {
    onInput?.(normalizeHex(anchor.value));
  };

  anchor.addEventListener('input', handleInput, { once: true });
  anchor.addEventListener(
    'change',
    () => {
      handleInput();
      anchor.removeEventListener('input', handleInput);
    },
    { once: true },
  );

  try {
    anchor.showPicker();
    return true;
  } catch {
    anchor.removeEventListener('input', handleInput);
    return false;
  }
}
