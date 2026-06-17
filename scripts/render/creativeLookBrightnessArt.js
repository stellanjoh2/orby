import { DEFAULT_MATERIAL_BRIGHTNESS } from '../constants.js';

/**
 * Shader Lab brightness caps — stricter than Lit mode (`MaterialController._diffuseColorWithBrightness`).
 * Lit keeps `MATERIAL_TEXTURED_BRIGHTNESS_HDR_PEAK` (2.5) and its metal clamp unchanged.
 */

/** HDR peak for dielectric Shader Lab prep / effects. */
export const CREATIVE_LOOK_BRIGHTNESS_DIELECTRIC_PEAK = 2.2;

/** HDR peak for conductors (chrome) — env reflections already carry energy. */
export const CREATIVE_LOOK_BRIGHTNESS_METAL_PEAK = 1.9;

/** Shoulder above peak — higher = stronger Shader Lab roll-off toward slider max. */
export const CREATIVE_LOOK_BRIGHTNESS_ROLLOFF = 0.62;

/**
 * Shader Lab only — effective brightness multiplier with soft shoulder above peak.
 * @param {number} [brightness]
 * @param {{ metalness?: number }} [options]
 */
export function creativeLookBrightnessEffectiveScale(brightness, options = {}) {
  const b = Number(brightness);
  const scale = Number.isFinite(b) ? Math.max(0, b) : DEFAULT_MATERIAL_BRIGHTNESS;
  const metal = Math.min(1, Math.max(0, Number(options.metalness ?? 0)));
  const peak = metal > 0.5
    ? CREATIVE_LOOK_BRIGHTNESS_METAL_PEAK
    : CREATIVE_LOOK_BRIGHTNESS_DIELECTRIC_PEAK;
  if (scale <= peak) return scale;
  const excess = scale - peak;
  return peak + excess / (1 + excess * CREATIVE_LOOK_BRIGHTNESS_ROLLOFF);
}

export const CREATIVE_LOOK_BRIGHTNESS_UNIFORM_GLSL = /* glsl */ `
uniform float uBrightness;
`;

export const CREATIVE_LOOK_APPLY_BRIGHTNESS_GLSL = /* glsl */ `
const float BRIGHT_PEAK_DIELECTRIC = ${CREATIVE_LOOK_BRIGHTNESS_DIELECTRIC_PEAK.toFixed(4)};
const float BRIGHT_PEAK_METAL = ${CREATIVE_LOOK_BRIGHTNESS_METAL_PEAK.toFixed(4)};
const float BRIGHT_ROLLOFF = ${CREATIVE_LOOK_BRIGHTNESS_ROLLOFF.toFixed(4)};

float creativeLookBrightnessEffectiveScale(float raw, float metalness) {
  float b = max(raw, 0.0);
  float metal = clamp(metalness, 0.0, 1.0);
  float peak = mix(BRIGHT_PEAK_DIELECTRIC, BRIGHT_PEAK_METAL, step(0.5, metal));
  if (b <= peak) return b;
  float excess = b - peak;
  return peak + excess / (1.0 + excess * BRIGHT_ROLLOFF);
}

vec3 applyCreativeBrightness(vec3 color) {
  if (abs(uBrightness - 1.0) < 0.0001) return color;
  float eff = creativeLookBrightnessEffectiveScale(uBrightness, 0.0);
  return color * eff;
}
`;
