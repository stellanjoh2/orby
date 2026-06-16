import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  RENDER_QUALITY,
  BLOOM_QUALITY,
} from '../../../scripts/constants.js';

/**
 * Orby studio startup material sliders — matches saved session defaults on desktop
 * when the import carries metalness/roughness maps (sliders multiply textures).
 */
export const MOBILE_MATERIAL_DEFAULTS = {
  brightness: DEFAULT_MATERIAL_BRIGHTNESS,
  /** Only applied when {@link MOBILE_MATERIAL_MR_MAP_DEFAULTS} applies. */
  metalness: 1,
  roughness: 1,
  emissive: 0,
};

/** Desktop session PBR sliders for textured (MR-mapped) imports. */
export const MOBILE_MATERIAL_MR_MAP_DEFAULTS = {
  metalness: 1,
  roughness: 1,
};

/** Scalar-only imports — keep glTF factors; do not force full metal. */
export const MOBILE_MATERIAL_SCALAR_DEFAULTS = {
  metalness: DEFAULT_MATERIAL_METALNESS,
  roughness: DEFAULT_MATERIAL_ROUGHNESS,
};

/** Desktop `renderQuality: medium` × `bloom.quality: medium` internal bloom scale. */
export const MOBILE_BLOOM_RESOLUTION_SCALE =
  RENDER_QUALITY.medium.bloomResolutionScale * BLOOM_QUALITY.medium.resolutionScale;

/** Desktop `#aberrationAmount` slider max — mobile had wrongly capped at legacy offset 0.0025. */
export const MOBILE_ABERRATION_AMOUNT_MAX = 0.02;
export const MOBILE_ABERRATION_AMOUNT_STEP = 0.0001;

/** Desktop `#grainIntensity` UI 0–1 → stored 0–0.15; mobile slider uses stored values directly. */
export const MOBILE_GRAIN_INTENSITY_MAX = 0.15;
export const MOBILE_GRAIN_INTENSITY_STEP = 0.001;

/**
 * Film grain uses screen-space UV — same stored intensity reads finer on narrow mobile buffers.
 * Boost at render time (not in stored state) so look-filter presets stay portable.
 */
export const MOBILE_GRAIN_REFERENCE_PIXEL_WIDTH = 1600;
export const MOBILE_GRAIN_INTENSITY_SCALE_MAX = 2.5;

/** Desktop `#bloomStrength` slider max — mobile was capped at 1. */
export const MOBILE_BLOOM_STRENGTH_MAX = 2;

/**
 * @param {number} intensity Stored grain intensity (0..{@link MOBILE_GRAIN_INTENSITY_MAX}).
 * @param {number} [pixelWidth] Composer output width in physical pixels.
 */
export function mobileEffectiveGrainIntensity(intensity, pixelWidth) {
  if (!Number.isFinite(intensity) || intensity <= 0) return 0;
  const w = Math.max(1, pixelWidth ?? MOBILE_GRAIN_REFERENCE_PIXEL_WIDTH);
  const scale = Math.min(
    MOBILE_GRAIN_INTENSITY_SCALE_MAX,
    Math.max(1, MOBILE_GRAIN_REFERENCE_PIXEL_WIDTH / w),
  );
  return intensity * scale;
}
