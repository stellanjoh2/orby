/** Shadow map resolution (texels per side) per lights Shadow Quality preset. */
export const SHADOW_MAP_SIZE_BY_QUALITY = {
  low: 512,
  medium: 1024,
  high: 2048,
  ultra: 4096,
};

/**
 * PCF filter sample count per quality tier (Three.js DirectionalLightShadow.blurSamples).
 * Ultra uses PCFSoft + 4096 maps — not VSM (streaks on studio backdrop).
 */
export const SHADOW_BLUR_SAMPLES_BY_QUALITY = {
  low: 4,
  medium: 8,
  high: 16,
  ultra: 32,
};

/**
 * Gobo softness kernel tier — 0 = single tap, 1 = 5-tap separable (~9 fetches),
 * 2 = isotropic 3×3 (~9 fetches). Ultra matches high; quality tier only affects cast-shadow maps.
 */
export const GOBO_BLUR_MODE_BY_QUALITY = {
  low: 0,
  medium: 1,
  high: 1,
  ultra: 1,
};

export function normalizeShadowQuality(quality) {
  return quality === 'low' || quality === 'high' || quality === 'ultra'
    ? quality
    : 'medium';
}

export function shadowMapSizeForQuality(quality) {
  const q = normalizeShadowQuality(quality);
  return SHADOW_MAP_SIZE_BY_QUALITY[q] ?? SHADOW_MAP_SIZE_BY_QUALITY.medium;
}

export function shadowBlurSamplesForQuality(quality) {
  const q = normalizeShadowQuality(quality);
  return SHADOW_BLUR_SAMPLES_BY_QUALITY[q] ?? SHADOW_BLUR_SAMPLES_BY_QUALITY.medium;
}

export function goboBlurModeForQuality(quality) {
  const q = normalizeShadowQuality(quality);
  return GOBO_BLUR_MODE_BY_QUALITY[q] ?? GOBO_BLUR_MODE_BY_QUALITY.medium;
}
