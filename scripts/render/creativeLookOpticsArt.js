/** Shared viewport optics — mesh luminance prep + full-frame thermal / NVG post. */

import {
  THERMAL_PALETTE_GLSL,
  THERMAL_DEFAULT_INTENSITY,
  THERMAL_DEFAULT_PATTERN_SCALE,
} from './creativeLookThermalArt.js';
import {
  THERMAL_EXTREME_PALETTE_GLSL,
  THERMAL_EXTREME_DEFAULT_INTENSITY,
  THERMAL_EXTREME_DEFAULT_PATTERN_SCALE,
} from './creativeLookThermalExtremeArt.js';
import {
  THERMAL_ACID_PALETTE_GLSL,
  THERMAL_ACID_DEFAULT_INTENSITY,
  THERMAL_ACID_DEFAULT_PATTERN_SCALE,
  THERMAL_ACID_SCENE_GAIN,
} from './creativeLookThermalAcidArt.js';
import {
  CREATIVE_LOOK_LIFT_CRUSH_GLSL,
  FLAT_POST_MASTER_HUE_GLSL,
} from './creativeLookFlatPostMasterHue.js';

export {
  THERMAL_DEFAULT_INTENSITY,
  THERMAL_DEFAULT_PATTERN_SCALE,
  THERMAL_EXTREME_DEFAULT_INTENSITY,
  THERMAL_EXTREME_DEFAULT_PATTERN_SCALE,
  THERMAL_ACID_DEFAULT_INTENSITY,
  THERMAL_ACID_DEFAULT_PATTERN_SCALE,
  THERMAL_ACID_SCENE_GAIN,
};

/** @typedef {'thermal' | 'thermal-extreme' | 'thermal-acid'} OpticsCreativeLookVariant */

export const OPTICS_CREATIVE_LOOK_PRESETS = /** @type {const} */ ([
  'thermal',
  'thermal-extreme',
  'thermal-acid',
]);

/** @param {string | undefined | null} preset */
export function isOpticsCreativeLookPreset(preset) {
  return resolveOpticsCreativeLookVariant(preset) !== null;
}

/** @param {string | undefined | null} preset @returns {OpticsCreativeLookVariant | null} */
export function resolveOpticsCreativeLookVariant(preset) {
  if (preset === 'thermal' || preset === 'thermal-extreme' || preset === 'thermal-acid') {
    return preset;
  }
  if (preset === 'night-vision') return 'thermal-acid';
  return null;
}

const OPTICS_LUMA_GLSL = /* glsl */ `
const vec3 OPTICS_LUMA = vec3(0.2126, 0.7152, 0.0722);

float opticsLuma(vec3 c) {
  return dot(c, OPTICS_LUMA);
}
`;

const OPTICS_HASH_GLSL = /* glsl */ `
float opticsHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float opticsHash2(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 24634.6345);
}
`;

const OPTICS_INTENSITY_GLSL = /* glsl */ `
float opticsIntensityDelta(float inten) {
  return inten - 1.0;
}

vec2 opticsIntensityUpDown(float inten) {
  float d = opticsIntensityDelta(inten);
  return vec2(max(d, 0.0), max(-d, 0.0));
}

float opticsScaleNorm(float sc) {
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  return (log2(clamp(sc, 0.1, 5.0)) - logMin) / (logMax - logMin);
}

// seamHard 0 = smooth continuous ramp; 1 = hard poster band steps.
float opticsThermalBandLuma(float lum, float bandCount, float seamHard) {
  lum = clamp(lum, 0.0, 1.0);
  seamHard = clamp(seamHard, 0.0, 1.0);
  bandCount = max(bandCount, 2.0);
  float scaled = lum * bandCount;
  float bandBase = floor(scaled);
  float bandFrac = fract(scaled);
  float edgeWidth = mix(0.5, 0.004, seamHard);
  float shaped = smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, bandFrac);
  return (bandBase + shaped) / bandCount;
}
`;

/**
 * Mesh prep — PBR heat luminance only; viewport post applies palette + contrast to the full frame.
 * Intensity/contrast runs once in post (avoids double-crush + edge ghosting on mesh).
 */
export const OPTICS_LUMINANCE_PREP_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uPatternScale;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;
uniform float uLuminanceGain;

${OPTICS_INTENSITY_GLSL}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(vec3(0.35, 0.92, 0.42));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float metal = clamp(uMetalness, 0.0, 1.0);
  float rough = clamp(uRoughness, 0.02, 1.0);
  float u = opticsScaleNorm(uPatternScale);
  float edgePow = mix(2.4, 4.6, u);

  float specPow = mix(140.0, 8.0, rough);
  float spec = pow(ndh, specPow) * mix(0.14, 1.0, metal);
  float core = ndl * 0.56 + pow(ndl, 0.34) * 0.34;
  float gain = core + spec * mix(0.32, 0.68, metal);

  gain -= pow(1.0 - ndv, edgePow) * mix(0.28, 0.10, metal);

  float bright = clamp(uBrightness, 0.0, 5.0);
  gain *= mix(0.64, 1.36, bright * 0.5);
  gain *= max(uLuminanceGain, 0.0);

  gl_FragColor = vec4(vec3(clamp(gain, 0.0, 1.0)), uOpacity);
}
`;

const OPTICS_POST_HEADER = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uPatternScale;
uniform float uTime;
uniform float uSceneGain;
uniform float uBackdropFlat;
uniform vec3 uBackdropColor;

${OPTICS_LUMA_GLSL}
${OPTICS_HASH_GLSL}
${OPTICS_INTENSITY_GLSL}
${CREATIVE_LOOK_LIFT_CRUSH_GLSL}
${FLAT_POST_MASTER_HUE_GLSL}

vec3 opticsFinishGrade(vec3 col) {
  col = applyCreativeLiftCrush(col);
  col = applyFlatPostMasterHue(col);
  return clamp(col, 0.0, 1.0);
}

float opticsSceneLuma(vec3 c) {
  return opticsLuma(c) * uSceneGain;
}

bool opticsIsFlatBackdrop(vec3 rgb) {
  if (uBackdropFlat < 0.5) return false;
  vec3 d = abs(rgb - uBackdropColor);
  return max(d.r, max(d.g, d.b)) < 0.012;
}

float opticsBlurLuma(sampler2D tex, vec2 uv, vec2 px) {
  float acc = opticsSceneLuma(texture2D(tex, uv).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv + vec2(px.x, 0.0)).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv - vec2(px.x, 0.0)).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv + vec2(0.0, px.y)).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv - vec2(0.0, px.y)).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv + px).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv - px).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv + vec2(px.x, -px.y)).rgb);
  acc += opticsSceneLuma(texture2D(tex, uv + vec2(-px.x, px.y)).rgb);
  return acc * 0.1111111;
}

float opticsHighlightBleed(sampler2D tex, vec2 uv, vec2 px, float lum) {
  float blurred = opticsBlurLuma(tex, uv, px);
  return max(0.0, blurred - lum);
}

vec2 opticsGrain(vec2 pix, float grainCoarse, float t) {
  vec2 gUv1 = floor(pix * grainCoarse + vec2(t * 47.3, t * 31.7));
  vec2 gUv2 = floor(pix * grainCoarse * 2.35 + vec2(-t * 83.1, t * 59.2));
  vec2 gUv3 = floor(pix * grainCoarse * 0.55 + vec2(t * 19.7, -t * 27.4));
  float n1 = opticsHash(gUv1) * 2.0 - 1.0;
  float n2 = opticsHash2(gUv2) * 2.0 - 1.0;
  float n3 = opticsHash(gUv3 + 41.0) * 2.0 - 1.0;
  float grain = n1 * 0.48 + n2 * 0.32 + n3 * 0.20;
  float spike = step(0.90, opticsHash(gUv1 + 113.0)) * 2.0 - 1.0;
  return vec2(grain, spike);
}
`;

export const OPTICS_THERMAL_POST_FRAGMENT = /* glsl */ `
${OPTICS_POST_HEADER}
${THERMAL_PALETTE_GLSL}

void main() {
  vec3 src = texture2D(tDiffuse, vUv).rgb;
  if (opticsIsFlatBackdrop(src)) {
    gl_FragColor = vec4(uBackdropColor, 1.0);
    return;
  }
  float rawLum = opticsSceneLuma(src);
  float inten = clamp(uIntensity, 0.0, 2.0);
  vec2 upDown = opticsIntensityUpDown(inten);
  float up = upDown.x;
  float down = upDown.y;
  float u = opticsScaleNorm(uPatternScale);
  float seamHard = u;
  float bandCount = mix(4.0, 10.0, u);

  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float bleed = opticsHighlightBleed(tDiffuse, vUv, px * mix(1.2, 2.8, u), rawLum);
  float halo = bleed * (0.22 + up * 0.18);

  float lum = clamp((rawLum - 0.5) * (1.05 + up * 0.85 - down * 0.55) + 0.5, 0.0, 1.0);
  lum = smoothstep(0.0, 1.0, lum);
  lum = clamp(lum + halo, 0.0, 1.0);
  lum = opticsThermalBandLuma(lum, bandCount, seamHard);

  vec3 col = orbyThermalPalette(lum);

  float hotGlow = smoothstep(0.82, 0.97, lum);
  col += vec3(1.0, 0.92, 0.75) * hotGlow * (0.14 + up * 0.16);

  gl_FragColor = vec4(opticsFinishGrade(col), 1.0);
}
`;

export const OPTICS_THERMAL_EXTREME_POST_FRAGMENT = /* glsl */ `
${OPTICS_POST_HEADER}
${THERMAL_EXTREME_PALETTE_GLSL}

void main() {
  vec3 src = texture2D(tDiffuse, vUv).rgb;
  if (opticsIsFlatBackdrop(src)) {
    gl_FragColor = vec4(uBackdropColor, 1.0);
    return;
  }
  float rawLum = opticsSceneLuma(src);
  float inten = clamp(uIntensity, 0.0, 2.0);
  vec2 upDown = opticsIntensityUpDown(inten);
  float up = upDown.x;
  float down = upDown.y;
  float u = opticsScaleNorm(uPatternScale);
  float seamHard = u;
  float bandCount = mix(5.0, 9.0, u);
  float grainCoarse = mix(1.4, 0.58, u);

  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float bleed = opticsHighlightBleed(tDiffuse, vUv, px * mix(1.4, 3.2, u), rawLum);
  float halo = bleed * (0.38 + up * 0.22);

  float lum = clamp((rawLum - 0.5) * (1.35 + up * 1.15 - down * 0.45) + 0.5, 0.0, 1.0);
  lum = opticsThermalBandLuma(lum, bandCount, seamHard);
  float glowLum = clamp(lum + halo, 0.0, 1.0);
  glowLum = opticsThermalBandLuma(glowLum, bandCount, seamHard);

  vec3 col = orbyThermalExtremePalette(glowLum);

  vec3 coldPurple = vec3(0.40, 0.06, 0.72);
  float coldFill = (1.0 - clamp(halo * 3.0, 0.0, 1.0)) * (1.0 - lum * 0.72);
  col = mix(col, coldPurple, coldFill * (0.48 + down * 0.10));

  float coreShadow = smoothstep(0.38, 0.12, lum) * (1.0 - clamp(halo * 2.5, 0.0, 1.0));
  col = mix(col, coldPurple * 0.55, coreShadow * 0.72);

  col += orbyThermalExtremePalette(clamp(glowLum + halo * 0.35, 0.0, 1.0)) * halo * (0.28 + up * 0.22);

  float hotRim = smoothstep(0.78, 0.98, glowLum) * clamp(halo * 2.0, 0.0, 1.0);
  col += vec3(1.0, 0.22, 0.04) * hotRim * (0.22 + up * 0.26);

  float spike;
  vec2 grainPair = opticsGrain(gl_FragCoord.xy, grainCoarse, uTime);
  float grain = grainPair.x;
  spike = grainPair.y;
  grain += spike * (0.22 + up * 0.14);
  col += grain * (0.12 + halo * 0.10);

  col = orbyThermalExtremeSaturate(col, 1.38);
  gl_FragColor = vec4(opticsFinishGrade(col), 1.0);
}
`;

export const OPTICS_THERMAL_ACID_POST_FRAGMENT = /* glsl */ `
${OPTICS_POST_HEADER}
${THERMAL_ACID_PALETTE_GLSL}

void main() {
  vec3 src = texture2D(tDiffuse, vUv).rgb;
  if (opticsIsFlatBackdrop(src)) {
    gl_FragColor = vec4(uBackdropColor, 1.0);
    return;
  }
  float rawLum = opticsSceneLuma(src);
  float inten = clamp(uIntensity, 0.0, 2.0);
  vec2 upDown = opticsIntensityUpDown(inten);
  float up = upDown.x;
  float down = upDown.y;
  float u = opticsScaleNorm(uPatternScale);
  float seamHard = u;
  float grainCoarse = mix(1.55, 0.62, u);
  float bandCount = mix(6.0, 10.0, u);

  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float bleed = opticsHighlightBleed(tDiffuse, vUv, px * mix(1.6, 3.8, u), rawLum);
  float halo = bleed * (0.42 + up * 0.26);

  float lum = clamp((rawLum - 0.5) * (1.38 + up * 1.18 - down * 0.38) + 0.5, 0.0, 1.0);
  lum = pow(lum, mix(1.02, 0.84, up));
  lum = opticsThermalBandLuma(lum, bandCount, seamHard);
  float peakLift = smoothstep(0.62, 0.92, rawLum) * (0.08 + up * 0.06);
  float glowLum = clamp(lum + halo + peakLift, 0.0, 1.0);
  glowLum = opticsThermalBandLuma(glowLum, bandCount, seamHard);

  vec3 col = orbyThermalAcidPalette(glowLum);

  vec3 coldBlue = vec3(0.05, 0.12, 0.78);
  float coldFill = (1.0 - clamp(halo * 2.5, 0.0, 1.0)) * (1.0 - glowLum * 0.68);
  col = mix(col, coldBlue, coldFill * (0.40 + down * 0.12));

  col += orbyThermalAcidPalette(clamp(glowLum + halo * 0.38, 0.0, 1.0)) * halo * (0.36 + up * 0.28);

  float neonEdge = smoothstep(0.38, 0.72, glowLum) * clamp(halo * 2.6 + peakLift * 2.8, 0.0, 1.0);
  col += vec3(0.12, 0.98, 0.18) * neonEdge * (0.26 + up * 0.30);

  float hotStart = mix(0.74, 0.60, up);
  float hot = smoothstep(hotStart, hotStart + 0.14, glowLum);
  col = mix(col, mix(vec3(0.98, 0.94, 0.06), vec3(0.98, 0.10, 0.04), hot), hot * (0.72 + up * 0.20));

  vec2 grainPair = opticsGrain(gl_FragCoord.xy, grainCoarse, uTime);
  float grain = grainPair.x;
  float spike = grainPair.y;
  grain += spike * (0.28 + up * 0.18);
  float grainMask = mix(0.55, 1.0, smoothstep(0.08, 0.72, glowLum));
  grainMask *= mix(1.0, 0.82, hot);
  col += grain * grainMask * (0.24 + up * 0.16);

  float scint = sin(uTime * 18.5 + opticsHash(floor(gl_FragCoord.xy * 0.4)) * 6.28) * 0.5 + 0.5;
  col += (scint - 0.5) * 0.04 * grainMask * (1.0 - hot * 0.5);

  col = orbyThermalAcidSaturate(col, 1.42);
  gl_FragColor = vec4(opticsFinishGrade(col), 1.0);
}
`;

/** @type {Record<OpticsCreativeLookVariant, string>} */
export const OPTICS_POST_FRAGMENTS = {
  thermal: OPTICS_THERMAL_POST_FRAGMENT,
  'thermal-extreme': OPTICS_THERMAL_EXTREME_POST_FRAGMENT,
  'thermal-acid': OPTICS_THERMAL_ACID_POST_FRAGMENT,
};
