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
