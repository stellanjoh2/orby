/**
 * Viewport load spinner — shows #viewportLoadSpinner while heavy diagnostic / overlay work runs.
 * Mirrors the Shader Lab apply path in SceneManager (double rAF so the spinner paints first).
 */

/** @returns {Promise<void>} */
export function deferSpinnerPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * @param {import('../UIManager.js').UIManager | null | undefined} ui
 * @param {string} statusPrefix
 * @param {() => void | Promise<void>} work
 */
export async function withViewportLoadSpinner(ui, statusPrefix, work) {
  if (!ui?.beginLoadSpinner) {
    return work();
  }

  ui.setLoadSpinnerStatusPrefix?.(statusPrefix);
  ui.beginLoadSpinner();
  ui.beginLoadSpinnerElapsed?.();
  await deferSpinnerPaint();

  try {
    return await work();
  } finally {
    ui.endLoadSpinner?.();
  }
}
