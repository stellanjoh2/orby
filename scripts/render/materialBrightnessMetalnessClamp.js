import * as THREE from 'three';
import { IMPORT_MATERIAL_MR_MULTIPLIER } from '../constants.js';

/**
 * Metalness used to clamp Object → Material brightness on dielectrics.
 * Authored glTF imports store slider 1.0 as “preserve file metalness”, not literal metal —
 * use authored × slider so dielectrics keep HDR brightness headroom.
 *
 * @param {object} options
 * @param {number | undefined | null} [options.explicitMetalness]
 * @param {boolean} [options.hasMrMaps]
 * @param {boolean} [options.isShapeLibrary]
 * @param {number | undefined | null} [options.sliderMetalness]
 * @param {{ metalness?: number } | null | undefined} [options.authored]
 */
export function resolveMaterialBrightnessMetalnessClamp(options = {}) {
  const {
    explicitMetalness,
    hasMrMaps = false,
    isShapeLibrary = false,
    sliderMetalness,
    authored = null,
  } = options;

  if (explicitMetalness !== undefined && explicitMetalness !== null) {
    return explicitMetalness;
  }
  if (hasMrMaps) return 0;
  if (isShapeLibrary) {
    const m = Number(sliderMetalness);
    return Number.isFinite(m) ? THREE.MathUtils.clamp(m, 0, 1) : 0;
  }
  if (authored && Number.isFinite(authored.metalness)) {
    const globalM = Number.isFinite(Number(sliderMetalness))
      ? Number(sliderMetalness)
      : IMPORT_MATERIAL_MR_MULTIPLIER;
    return THREE.MathUtils.clamp(authored.metalness * globalM, 0, 1);
  }
  const m = Number(sliderMetalness);
  return Number.isFinite(m) ? THREE.MathUtils.clamp(m, 0, 1) : 0;
}
