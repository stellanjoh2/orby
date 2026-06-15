import { APP_BACKGROUND } from '../constants.js';
import {
  CREATIVE_LOOK_LIFT_CRUSH_GLSL,
  FLAT_POST_MASTER_HUE_GLSL,
} from './creativeLookFlatPostMasterHue.js';

/** Reference logical grid — 320 cols at 4 px/texel (1280 wide). */
export const DITHER_NEUTRAL_NATIVE_WIDTH = 320;
export const DITHER_NEUTRAL_NATIVE_HEIGHT = 240;

export const DITHER_NEUTRAL_REF_LOGICAL_WIDTH = 1280;
export const DITHER_NEUTRAL_REF_LOGICAL_HEIGHT = Math.round(
  (DITHER_NEUTRAL_REF_LOGICAL_WIDTH * DITHER_NEUTRAL_NATIVE_HEIGHT) /
    DITHER_NEUTRAL_NATIVE_WIDTH,
);

export const DITHER_NEUTRAL_BASE_CELL_PX =
  DITHER_NEUTRAL_REF_LOGICAL_WIDTH / DITHER_NEUTRAL_NATIVE_WIDTH;

/** Scale 0 = 1:1 screen-pixel dither (no macro blocks). */
export const DITHER_NEUTRAL_DEFAULT_PATTERN_SCALE = 0;
export const DITHER_NEUTRAL_DEFAULT_INTENSITY = 2;

export const DITHER_TRITONE_DEFAULT_PATTERN_SCALE = 0.5;
export const DITHER_TRITONE_DEFAULT_INTENSITY = 2;

export const DITHER_CROSSHATCH_DEFAULT_PATTERN_SCALE = 1;
export const DITHER_CROSSHATCH_DEFAULT_INTENSITY = 0;

export const DITHER_RASTER_DEFAULT_PATTERN_SCALE = 1;
export const DITHER_RASTER_DEFAULT_INTENSITY = 0;
export const DITHER_RASTER_MIN_CELL_PX = 8;
export const DITHER_RASTER_SPHERE_GAP_PX = 1;

/** @param {number} [patternScale] */
export function creativeDitherRasterCellSize(patternScale = DITHER_RASTER_DEFAULT_PATTERN_SCALE) {
  const cell = creativeDitherCellSize(patternScale);
  return {
    width: Math.max(DITHER_RASTER_MIN_CELL_PX, cell.width),
    height: Math.max(DITHER_RASTER_MIN_CELL_PX, cell.height),
  };
}

/** Shader Lab Dither — hard square pixel presets (round halftone is a separate subgroup). */
export const DITHER_PIXEL_CREATIVE_LOOK_PRESETS = /** @type {const} */ ([
  'dither-neutral',
  'dither-tritone',
  'dither-crosshatch',
  'dither-raster',
]);

/** @param {number} [patternScale] */
export function creativeDitherCellSize(patternScale = DITHER_NEUTRAL_DEFAULT_PATTERN_SCALE) {
  const s = Number(patternScale);
  if (!Number.isFinite(s) || s <= 0) {
    return { width: 1, height: 1 };
  }
  return {
    width: DITHER_NEUTRAL_BASE_CELL_PX * s,
    height: DITHER_NEUTRAL_BASE_CELL_PX * s,
  };
}

/** @deprecated use {@link creativeDitherCellSize} */
export function creativeDitherNeutralCellSize(patternScale) {
  return creativeDitherCellSize(patternScale);
}

/**
 * Mesh prepass — smooth lit colormap for neutral ordered dither (no retro palette crush).
 */
export const DITHER_NEUTRAL_PREP_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uTint;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;

void main() {
  float mapAlpha = 1.0;
  vec3 baseCol = clamp(uTint, vec3(0.0), vec3(1.0));
  if (uHasMap > 0.5) {
    vec4 mapSample = texture2D(uMap, vUv);
    baseCol = mapSample.rgb;
    mapAlpha = mapSample.a;
  }
  if (mapAlpha < 0.01) {
    discard;
  }

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(vec3(0.35, 0.92, 0.42));
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 H = normalize(L + V);

  float metal = clamp(uMetalness, 0.0, 1.0);
  float rough = clamp(uRoughness, 0.02, 1.0);

  float ndl = max(dot(N, L), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float ndv = max(dot(N, V), 0.0);

  float diffFloor = mix(0.22, 0.45, rough);
  float diffCeil = mix(0.88, 1.05, 1.0 - rough * 0.35);
  float diffuse = mix(diffFloor, diffCeil, ndl) * (1.0 - metal * 0.92);

  float specPow = mix(96.0, 6.0, rough);
  float spec = pow(ndh, specPow) * mix(0.12, 0.95, 1.0 - rough * 0.6);
  spec *= mix(0.15, 1.0, metal);

  float rim = pow(1.0 - ndv, mix(2.4, 5.5, rough));
  rim *= mix(0.06, 0.42, metal) * mix(0.5, 1.0, 1.0 - rough);

  vec3 dielectric = baseCol * diffuse;
  vec3 specTint = mix(vec3(0.92, 0.94, 0.98), baseCol, metal);
  vec3 lit = dielectric + specTint * (spec + rim);
  lit *= mix(0.82, 1.0, ndv);
  lit = clamp(lit, vec3(0.0), vec3(1.0));

  gl_FragColor = vec4(lit, uOpacity * mapAlpha);
}
`;

const DITHER_BAYER4_GLSL = /* glsl */ `
float ditherBayer4(ivec2 p) {
  int x = int(mod(float(p.x), 4.0));
  int y = int(mod(float(p.y), 4.0));
  if (y == 0) {
    if (x == 0) return 0.0;
    if (x == 1) return 8.0;
    if (x == 2) return 2.0;
    return 10.0;
  }
  if (y == 1) {
    if (x == 0) return 12.0;
    if (x == 1) return 4.0;
    if (x == 2) return 14.0;
    return 6.0;
  }
  if (y == 2) {
    if (x == 0) return 3.0;
    if (x == 1) return 11.0;
    if (x == 2) return 1.0;
    return 9.0;
  }
  if (x == 0) return 15.0;
  if (x == 1) return 7.0;
  if (x == 2) return 13.0;
  return 5.0;
}
`;

const DITHER_POST_MAIN_GLSL = /* glsl */ `
void main() {
  vec2 res = max(floor(uResolution + 0.5), vec2(1.0));
  vec2 cellPx = max(floor(uCellSize + 0.5), vec2(1.0));
  vec2 ip = floor(gl_FragCoord.xy);
  vec2 cellId = floor(ip / cellPx);

  vec2 centerPx = cellId * cellPx + floor(cellPx * 0.5);
  vec2 centerUv = (centerPx + 0.5) / res;
  vec4 cellColor = texture2D(tDiffuse, centerUv);
  float srcLuma = dot(cellColor.rgb, vec3(0.2126, 0.7152, 0.0722));

  if (cellColor.a < 0.04 && srcLuma < 0.001) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  float bayer = ditherBayer4(ivec2(ip)) / 16.0;
  vec3 crushed = ditherCrush(cellColor.rgb, bayer, uIntensity);
  crushed = applyCreativeLiftCrush(crushed);
  gl_FragColor = vec4(crushed, 1.0);
}
`;

/** Screen-space neutral crush — macro square pixels + 4×4 Bayer ordered dither. */
export const DITHER_NEUTRAL_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;
uniform float uIntensity;

${FLAT_POST_MASTER_HUE_GLSL}

${CREATIVE_LOOK_LIFT_CRUSH_GLSL}

${DITHER_BAYER4_GLSL}

float ditherNeutralLevels(float intensity) {
  float t = clamp(intensity / 2.0, 0.0, 1.0);
  return mix(48.0, 3.0, t);
}

vec3 ditherCrush(vec3 rgb, float bayer, float intensity) {
  rgb = applyFlatPostMasterHue(rgb);
  float levels = ditherNeutralLevels(intensity);
  vec3 q;
  q.r = floor(rgb.r * levels + bayer) / levels;
  q.g = floor(rgb.g * levels + bayer) / levels;
  q.b = floor(rgb.b * levels + bayer) / levels;
  return clamp(q, 0.0, 1.0);
}

${DITHER_POST_MAIN_GLSL}
`;

/** Tritone — hard 3-tier luminance poster with Neutral-style Bayer band edges. */
export const DITHER_TRITONE_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;
uniform float uIntensity;

${FLAT_POST_MASTER_HUE_GLSL}

${CREATIVE_LOOK_LIFT_CRUSH_GLSL}

${DITHER_BAYER4_GLSL}

const vec3 DITHER_LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 ditherCrush(vec3 rgb, float bayer, float intensity) {
  rgb = applyFlatPostMasterHue(rgb);
  float t = clamp(intensity / 2.0, 0.0, 1.0);

  float srcLum = max(dot(rgb, DITHER_LUMA), 1e-4);
  float lum = srcLum;
  lum = pow(lum, mix(1.0, 2.45, t));
  lum = (lum - 0.5) * mix(1.0, 3.35, t) + 0.5;
  lum = clamp(lum, 0.0, 1.0);

  float shadowTier = mix(0.11, 0.05, t);
  float midTier = mix(0.50, 0.38, t);
  float highTier = mix(0.84, 0.96, t);

  float band = floor(lum * 3.0 + bayer * 0.96 - 0.02);
  band = clamp(band, 0.0, 2.0);

  float tierLum = shadowTier;
  if (band >= 1.5) {
    tierLum = highTier;
  } else if (band >= 0.5) {
    tierLum = midTier;
  }

  vec3 outCol = clamp(rgb * (tierLum / srcLum), 0.0, 1.0);
  float outLum = dot(outCol, DITHER_LUMA);
  outCol = mix(vec3(outLum), outCol, mix(1.0, 1.22, t));
  return clamp(outCol, 0.0, 1.0);
}

${DITHER_POST_MAIN_GLSL}
`;

const DITHER_CROSSHATCH4_GLSL = /* glsl */ `
float ditherBayer4(ivec2 p) {
  int x = int(mod(float(p.x), 4.0));
  int y = int(mod(float(p.y), 4.0));
  // Transposed 4×4 Bayer — diagonal crosshatch flow when paired with chunky pixels.
  if (x == 0) {
    if (y == 0) return 0.0;
    if (y == 1) return 12.0;
    if (y == 2) return 3.0;
    return 15.0;
  }
  if (x == 1) {
    if (y == 0) return 8.0;
    if (y == 1) return 4.0;
    if (y == 2) return 11.0;
    return 7.0;
  }
  if (x == 2) {
    if (y == 0) return 2.0;
    if (y == 1) return 14.0;
    if (y == 2) return 1.0;
    return 13.0;
  }
  if (y == 0) return 10.0;
  if (y == 1) return 6.0;
  if (y == 2) return 9.0;
  return 5.0;
}
`;

/** Extreme 8-color crosshatch crush — chunky pixels + transposed Bayer lattice. */
export const DITHER_CROSSHATCH_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;
uniform float uIntensity;

${FLAT_POST_MASTER_HUE_GLSL}

${CREATIVE_LOOK_LIFT_CRUSH_GLSL}

${DITHER_CROSSHATCH4_GLSL}

const vec3 DITHER_LUMA = vec3(0.2126, 0.7152, 0.0722);
const int CRUNCH_PAL_MAX = 8;

const vec3 CRUNCH_0 = vec3(0.031, 0.031, 0.031);
const vec3 CRUNCH_1 = vec3(0.082, 0.059, 0.165);
const vec3 CRUNCH_2 = vec3(0.102, 0.157, 0.282);
const vec3 CRUNCH_3 = vec3(0.157, 0.345, 0.408);
const vec3 CRUNCH_4 = vec3(0.282, 0.471, 0.533);
const vec3 CRUNCH_5 = vec3(0.408, 0.345, 0.533);
const vec3 CRUNCH_6 = vec3(0.784, 0.722, 0.408);
const vec3 CRUNCH_7 = vec3(0.925, 0.910, 0.847);

vec3 crunchColor(int idx) {
  vec3 c;
  if (idx == 0) c = CRUNCH_0;
  else if (idx == 1) c = CRUNCH_1;
  else if (idx == 2) c = CRUNCH_2;
  else if (idx == 3) c = CRUNCH_3;
  else if (idx == 4) c = CRUNCH_4;
  else if (idx == 5) c = CRUNCH_5;
  else if (idx == 6) c = CRUNCH_6;
  else c = CRUNCH_7;
  return applyFlatPostMasterHue(c);
}

float crunchPalLuma(vec3 c) {
  return dot(c, DITHER_LUMA);
}

float crunchPalSat(vec3 c) {
  float l = crunchPalLuma(c);
  return length(c - vec3(l));
}

vec3 quantizeCrunch(vec3 rgb, float dither, float crush) {
  float srcLum = crunchPalLuma(rgb);
  float srcSat = crunchPalSat(rgb);
  float spread = mix(0.12, 0.24, crush);
  float targetLum = clamp(srcLum + (dither - 0.5) * spread, 0.0, 1.0);

  int bestIdx = 0;
  int secondIdx = 1;
  float bestScore = 1e6;
  float secondScore = 1e6;

  for (int i = 0; i < CRUNCH_PAL_MAX; i++) {
    vec3 pal = crunchColor(i);
    float palLum = crunchPalLuma(pal);
    float lumDiff = abs(palLum - targetLum);
    float colDist = distance(rgb, pal);

    float palSat = crunchPalSat(pal);
    float neutralPenalty = 0.0;
    if (srcSat > 0.04 && palSat < 0.035) {
      neutralPenalty = 0.22 + srcSat * 0.85;
    }
    if (i == 0 && srcLum > 0.07) {
      neutralPenalty += 0.28;
    }
    if (i == 7 && srcLum < 0.68) {
      neutralPenalty += 0.14;
    }

    float score = lumDiff * 0.58 + colDist * 0.34 + neutralPenalty;
    if (score < bestScore) {
      secondScore = bestScore;
      secondIdx = bestIdx;
      bestScore = score;
      bestIdx = i;
    } else if (score < secondScore) {
      secondScore = score;
      secondIdx = i;
    }
  }

  if (secondScore < bestScore * 1.22 && secondIdx != bestIdx) {
    vec3 a = crunchColor(bestIdx);
    vec3 b = crunchColor(secondIdx);
    if (crunchPalLuma(b) < crunchPalLuma(a)) {
      return dither > 0.5 ? b : a;
    }
    return dither > 0.5 ? a : b;
  }
  return crunchColor(bestIdx);
}

vec3 ditherCrush(vec3 rgb, float bayer, float intensity) {
  rgb = applyFlatPostMasterHue(rgb);
  float crush = clamp(intensity / 2.0, 0.0, 1.0);

  float lum = dot(rgb, DITHER_LUMA);
  lum = pow(clamp(lum, 0.0, 1.0), mix(1.0, 2.55, crush));
  lum = (lum - 0.5) * mix(1.0, 3.0, crush) + 0.5;
  lum = clamp(lum, 0.0, 1.0);

  float srcLum = max(dot(rgb, DITHER_LUMA), 1e-4);
  rgb = clamp(rgb * (lum / srcLum), 0.0, 1.0);

  return quantizeCrunch(rgb, bayer, crush);
}

${DITHER_POST_MAIN_GLSL}
`;

/** Amplitude-modulated halftone — circular raster dots sized by cell luminance. */
export const DITHER_RASTER_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;
uniform float uIntensity;

${FLAT_POST_MASTER_HUE_GLSL}

${CREATIVE_LOOK_LIFT_CRUSH_GLSL}

const vec3 DITHER_LUMA = vec3(0.2126, 0.7152, 0.0722);
const float RASTER_MIN_CELL_PX = ${DITHER_RASTER_MIN_CELL_PX}.0;
const float RASTER_GAP_PX = ${DITHER_RASTER_SPHERE_GAP_PX}.0;

float rasterDiscCoverage(vec2 localPx, float radiusPx) {
  float cov = 0.0;
  cov += step(length(localPx + vec2(-0.25, -0.25)), radiusPx);
  cov += step(length(localPx + vec2( 0.25, -0.25)), radiusPx);
  cov += step(length(localPx + vec2(-0.25,  0.25)), radiusPx);
  cov += step(length(localPx + vec2( 0.25,  0.25)), radiusPx);
  return cov * 0.25;
}

void main() {
  vec2 res = max(uResolution, vec2(1.0));
  vec2 cellPx = max(uCellSize, vec2(RASTER_MIN_CELL_PX));
  vec2 ip = gl_FragCoord.xy;
  vec2 cellId = floor(ip / cellPx);

  vec2 centerPx = cellId * cellPx + cellPx * 0.5;
  vec2 centerUv = centerPx / res;
  vec4 cellColor = texture2D(tDiffuse, centerUv);
  float srcLuma = dot(cellColor.rgb, DITHER_LUMA);

  if (cellColor.a < 0.04 && srcLuma < 0.001) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  vec2 localPx = ip + 0.5 - centerPx;
  float cellHalf = min(cellPx.x, cellPx.y) * 0.5;

  float t = clamp(uIntensity / 2.0, 0.0, 1.0);

  float lum = clamp(srcLuma * mix(1.42, 1.0, t) + mix(0.10, 0.0, t), 0.0, 1.0);
  lum = mix(lum, sqrt(lum), mix(0.52, 0.0, t));
  lum = pow(lum, mix(0.80, 1.85, t));
  lum = (lum - 0.5) * mix(1.0, 2.35, t) + 0.5;
  lum = clamp(lum, 0.0, 1.0);

  float depthT = lum;
  depthT = pow(depthT, mix(1.15, 1.7, t));
  depthT = (depthT - 0.5) * mix(1.3, 2.15, t) + 0.5;
  depthT = clamp(depthT, 0.0, 1.0);
  depthT = depthT * depthT * (3.0 - 2.0 * depthT);

  float maxRadiusPx = max(cellHalf - RASTER_GAP_PX * 0.5, 1.0);
  float minRadiusPx = max(maxRadiusPx * mix(0.18, 0.05, t), 0.75);
  float radiusPx = mix(minRadiusPx, maxRadiusPx, depthT);

  float inDot = rasterDiscCoverage(localPx, radiusPx);

  vec3 dotCol = applyFlatPostMasterHue(cellColor.rgb);
  dotCol *= mix(1.62, 1.0, t);
  float dotLum = max(dot(dotCol, DITHER_LUMA), 1e-4);
  float minDotLum = mix(0.68, 0.12, t);
  dotCol = clamp(dotCol * max(minDotLum / dotLum, 1.0), 0.0, 1.0);
  dotCol *= mix(0.90, 1.08, depthT);
  dotCol = clamp(dotCol, 0.0, 1.0);

  vec3 outCol = mix(uBgColor, dotCol, inDot);
  outCol = applyCreativeLiftCrush(outCol);
  gl_FragColor = vec4(outCol, 1.0);
}
`;

export const DITHER_NEUTRAL_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);
