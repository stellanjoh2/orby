/**
 * After `EffectComposer.render()` with `renderToScreen === false`, each enabled pass that
 * `needsSwap` writes to `writeBuffer` then swaps — the latest image is in `readBuffer`.
 * When the last enabled pass does not swap, the image stays in `writeBuffer`.
 *
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @returns {import('three').WebGLRenderTarget | null}
 */
export function getComposerOutputRenderTarget(composer) {
  if (!composer?.readBuffer) return null;

  let lastEnabledPass = null;
  const passes = composer.passes ?? [];
  for (let i = passes.length - 1; i >= 0; i -= 1) {
    const pass = passes[i];
    if (pass?.enabled) {
      lastEnabledPass = pass;
      break;
    }
  }

  if (lastEnabledPass && lastEnabledPass.needsSwap === false) {
    return composer.writeBuffer ?? composer.readBuffer;
  }
  return composer.readBuffer;
}

/**
 * Post-stack overlays (ground grid, wireframe) draw to screen in the live loop. During offline
 * capture the composer targets RTs — composite overlays onto `readBuffer` so readback includes them.
 *
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer | null | undefined} composer
 * @returns {import('three').WebGLRenderTarget | null}
 */
export function resolvePostStackOverlayRenderTarget(composer) {
  if (composer?.renderToScreen === false) {
    return getComposerOutputRenderTarget(composer);
  }
  return null;
}
