/**
 * After `EffectComposer.render()` with `renderToScreen === false`, each enabled pass that
 * `needsSwap` writes to `writeBuffer` then swaps — the latest image is always in `readBuffer`.
 * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
 * @returns {import('three').WebGLRenderTarget | null}
 */
export function getComposerOutputRenderTarget(composer) {
  return composer?.readBuffer ?? null;
}
