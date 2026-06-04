/** Match user-facing warnings/errors (override with `caution: false` on showToast). */
export function inferToastCaution(text) {
  const s = String(text).toLowerCase();
  return (
    /\bunsupported\b|\bunrecognized\b|\binvalid\b|\bcouldn't\b|\bcould not\b|\bfailed\b|\bnot supported\b|\bno supported\b|\berror\b|\bwarning\b/.test(s)
    || /not available yet/.test(s)
    || /\bunable\b/.test(s)
    || /\bload a mesh\b/.test(s)
    || /\bno model\b/.test(s)
  );
}

/** Match success / neutral-positive feedback (does not override caution when both match). */
export function inferToastPositive(text) {
  if (inferToastCaution(text)) return false;
  const s = String(text).toLowerCase();
  return (
    /\bloaded\b|\bcopied\b|\bexported\b|\bexport complete\b|\bsaved\b|\bsuccess\b|\bcomplete\b|\bconnected\b|\bthanks\b|\brestored\b|\bapplied\b|\bsnapped\b/.test(s)
    || /\bcopied to clipboard\b/.test(s)
    || /\bsettings reset\b/.test(s)
    || /^model loaded\b/.test(s.trim())
    || /^folder loaded\b/.test(s.trim())
  );
}

/**
 * @param {string} text
 * @param {{ caution?: boolean, success?: boolean, icon?: false | 'success' | 'info' }} [toastOptions]
 * @returns {'success' | 'info' | null}
 */
export function resolveToastIconKind(text, toastOptions = {}) {
  if (toastOptions.icon === false) return null;
  if (toastOptions.icon === 'success' || toastOptions.icon === 'info') {
    return toastOptions.icon;
  }

  const wantCaution =
    toastOptions.caution === true
    || (toastOptions.caution !== false && inferToastCaution(text));
  if (wantCaution) return null;

  if (toastOptions.success === true || inferToastPositive(text)) {
    return 'success';
  }

  return 'info';
}
