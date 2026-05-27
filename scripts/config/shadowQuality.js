/**
 * Directional shadow ortho half-extent = modelBounds.radius × padding (mesh fit).
 * {@link LightsController} also expands the frustum to cover the solid base / HDRI catcher
 * so receivers outside the mesh bbox do not get a false square shadow.
 */
export const SHADOW_CAMERA_ORTHO_PADDING_BY_QUALITY = {
  low: 2.4,
  medium: 2.0,
  high: 1.6,
  ultra: 1.2,
};

/** HdriShadowReceiver disc sizing — keep in sync with shadow camera padding above. */
export const SHADOW_CATCHER_ORTHO_PADDING = 2.8;

/** Shadow map resolution (texels per side) per lights Shadow Quality preset. */
export const SHADOW_MAP_SIZE_BY_QUALITY = {
  low: 512,
  medium: 1024,
  high: 2048,
  ultra: 4096,
};

/**
 * PCF filter sample count per quality tier (VSM only in Three.js r167; kept for future use).
 * Spotlight softness uses PCFShadowMap + {@link effectiveDirectionalShadowRadius}, not VSM
 * (VSM can streak on large cyclorama / HDRI receivers).
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

export function shadowCameraOrthoPaddingForQuality(quality) {
  const q = normalizeShadowQuality(quality);
  return (
    SHADOW_CAMERA_ORTHO_PADDING_BY_QUALITY[q]
    ?? SHADOW_CAMERA_ORTHO_PADDING_BY_QUALITY.medium
  );
}

export function goboBlurModeForQuality(quality) {
  const q = normalizeShadowQuality(quality);
  return GOBO_BLUR_MODE_BY_QUALITY[q] ?? GOBO_BLUR_MODE_BY_QUALITY.medium;
}

const SHADOW_SOFTNESS_REFERENCE_QUALITY = 'low';

/**
 * Shadow-map blur radius (texels) for the lights Softness slider.
 * Scales with map resolution and inversely with ortho padding so Ultra’s tighter
 * frustum does not halve world-space penumbra vs Low.
 */
export function effectiveDirectionalShadowRadius(softness, quality) {
  const q = normalizeShadowQuality(quality);
  const s = Math.min(4, Math.max(0, Number(softness) || 0));
  const currentSize = SHADOW_MAP_SIZE_BY_QUALITY[q] ?? SHADOW_MAP_SIZE_BY_QUALITY.medium;
  const referenceSize =
    SHADOW_MAP_SIZE_BY_QUALITY[SHADOW_SOFTNESS_REFERENCE_QUALITY];
  const padding = shadowCameraOrthoPaddingForQuality(q);
  const refPadding = shadowCameraOrthoPaddingForQuality(
    SHADOW_SOFTNESS_REFERENCE_QUALITY,
  );
  return s * (currentSize / referenceSize) * (refPadding / padding);
}
