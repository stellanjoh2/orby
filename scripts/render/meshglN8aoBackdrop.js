/**
 * Meshgl N8AO + HDRI backdrop contract — single source of truth for regression tests.
 * See `.cursor/rules/n8ao-hdri-backdrop.mdc` and `meshglN8aoBackdrop.test.mjs`.
 */

/** Raw beauty depth at or above this is treated as sky (cleared far plane). */
export const N8AO_SKY_DEPTH_THRESHOLD = 0.9995;

/**
 * Mirrors `n8aoBackdropRestoreShader` — `mix(backdrop, ao, geometry)`.
 *
 * @param {[number, number, number]} backdropRgb
 * @param {[number, number, number]} aoRgb
 * @param {number} rawDepth
 * @param {number} [threshold]
 * @returns {[number, number, number]}
 */
export function compositeAoWithBackdrop(
  backdropRgb,
  aoRgb,
  rawDepth,
  threshold = N8AO_SKY_DEPTH_THRESHOLD,
) {
  const geometry = rawDepth < threshold ? 1 : 0;
  return [
    backdropRgb[0] * (1 - geometry) + aoRgb[0] * geometry,
    backdropRgb[1] * (1 - geometry) + aoRgb[1] * geometry,
    backdropRgb[2] * (1 - geometry) + aoRgb[2] * geometry,
  ];
}

/** Files guarded by meshglN8aoBackdrop regression tests (repo-relative). */
export const N8AO_GUARDED_SOURCE_FILES = [
  'scripts/render/MeshglN8AOPass.js',
  'scripts/render/n8aoBackdropRestoreShader.js',
  'scripts/render/PostProcessingPipeline.js',
  'scripts/render/MeshglRenderPass.js',
  'scripts/render/renderSceneBeautyToTarget.js',
];
