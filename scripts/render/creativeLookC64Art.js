import { APP_BACKGROUND } from '../constants.js';
import {
  FLAT_POST_EMPTY_CELL_GLSL,
  FLAT_POST_MASTER_HUE_GLSL,
} from './creativeLookFlatPostMasterHue.js';

/** Authentic Commodore 64 16-color palette (sRGB 0–1). */
export const C64_PALETTE_RGB = [
  [0, 0, 0], // 0 black
  [1, 1, 1], // 1 white
  [0.533, 0, 0], // 2 red
  [0.667, 1, 0.933], // 3 cyan
  [0.8, 0.267, 0.8], // 4 purple
  [0, 0.8, 0.333], // 5 green
  [0, 0, 0.667], // 6 blue
  [0.933, 0.933, 0.467], // 7 yellow
  [0.867, 0.533, 0.333], // 8 orange
  [0.4, 0.267, 0], // 9 brown
  [1, 0.467, 0.467], // 10 light red
  [0.2, 0.2, 0.2], // 11 dark grey
  [0.467, 0.467, 0.467], // 12 grey
  [0.667, 1, 0.4], // 13 light green
  [0, 0.533, 1], // 14 light blue
  [0.733, 0.733, 0.733], // 15 light grey
];

/** C64 native framebuffer — 320×200 (PAL/NTSC logical). */
export const C64_NATIVE_WIDTH = 320;
export const C64_NATIVE_HEIGHT = 200;

/** Reference logical framebuffer at 4px/texel → 320 cols × 200 rows. */
export const C64_REF_LOGICAL_WIDTH = 1280;
export const C64_REF_LOGICAL_HEIGHT = Math.round(
  (C64_REF_LOGICAL_WIDTH * C64_NATIVE_HEIGHT) / C64_NATIVE_WIDTH,
);

export const C64_CELL_PX = C64_REF_LOGICAL_WIDTH / C64_NATIVE_WIDTH;

/** Locked Shader Lab intensity — baked contrast. */
export const C64_FIXED_INTENSITY = 1;

/** Locked Shader Lab scale — fixed 320×200 grid. */
export const C64_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookC64FixedIntensity() {
  return C64_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookC64FixedScale() {
  return C64_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeC64CellSize(_patternScale) {
  return {
    width: C64_CELL_PX,
    height: C64_CELL_PX,
  };
}

/**
 * Mesh prepass — colormap albedo × ASCII-style cel form (terminal key + view-facing + depth).
 * Outputs lit RGB; alpha = mesh coverage for the C64 post pass.
 */
export const C64_PREP_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uTint;
uniform float uOpacity;

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
  vec3 qN = normalize(sign(N) * floor(abs(N) * 5.0 + 0.499) / 5.0 + vec3(1e-4));
  vec3 V = normalize(cameraPosition - vWorldPosition);

  const vec3 TERMINAL_KEY = normalize(vec3(0.38, 0.88, 0.38));
  const float CEL_LIGHT = 7.0;
  const float CEL_VIEW = 6.0;

  float ndl = max(dot(qN, TERMINAL_KEY), 0.0);
  float ndv = max(dot(qN, V), 0.0);

  float lightBand = floor(ndl * CEL_LIGHT + 0.001) / max(CEL_LIGHT - 1.0, 1.0);
  float viewBand = floor(ndv * CEL_VIEW + 0.001) / max(CEL_VIEW - 1.0, 1.0);

  float form = lightBand * mix(0.18, 1.0, viewBand);

  vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
  float depthNorm = clamp(-viewPos.z * 0.045, 0.0, 1.0);
  form *= mix(0.8, 1.0, depthNorm);

  form = pow(clamp(form, 0.0, 1.0), 1.08);
  form = smoothstep(0.03, 0.92, form);

  // Luma bands with hue kept in shadows — avoid baseCol * 0.28 → muddy brown/black.
  float srcLum = max(dot(baseCol, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float shadeLum = mix(0.44, 1.0, form);
  vec3 lit = baseCol * (shadeLum / srcLum);

  // C64 artist shadow tones — warm/cool accents instead of neutral grey crush.
  float shadowAmt = pow(1.0 - form, 1.35);
  vec3 n = baseCol / srcLum;
  vec3 shadowAccent = vec3(0.8, 0.267, 0.8); // purple — classic C64 shadow
  if (n.b > n.r + 0.06 && n.b > n.g * 0.85) {
    shadowAccent = vec3(0.0, 0.0, 0.667); // cool → blue
  } else if (n.g > n.r + 0.07) {
    shadowAccent = vec3(0.0, 0.533, 1.0); // green → light blue
  } else if (n.r > n.g + 0.12 && n.r > n.b + 0.08) {
    shadowAccent = mix(vec3(0.533, 0.0, 0.0), vec3(0.8, 0.267, 0.8), 0.45); // warm → red/purple
  }
  lit = mix(lit, mix(lit, shadowAccent, 0.52), shadowAmt);

  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);
}
`;

/** @deprecated use {@link FLAT_POST_MASTER_HUE_GLSL} */
export const C64_MASTER_HUE_GLSL = FLAT_POST_MASTER_HUE_GLSL;

/** Screen-space C64 crush — camera-locked macro pixels, 2×2 Bayer dither, 16-color snap. */
export const C64_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}
${FLAT_POST_EMPTY_CELL_GLSL}

const vec3 C64_LUMA = vec3(0.2126, 0.7152, 0.0722);

const vec3 C64_0 = vec3(0.0, 0.0, 0.0);
const vec3 C64_1 = vec3(1.0, 1.0, 1.0);
const vec3 C64_2 = vec3(0.533, 0.0, 0.0);
const vec3 C64_3 = vec3(0.667, 1.0, 0.933);
const vec3 C64_4 = vec3(0.8, 0.267, 0.8);
const vec3 C64_5 = vec3(0.0, 0.8, 0.333);
const vec3 C64_6 = vec3(0.0, 0.0, 0.667);
const vec3 C64_7 = vec3(0.933, 0.933, 0.467);
const vec3 C64_8 = vec3(0.867, 0.533, 0.333);
const vec3 C64_9 = vec3(0.4, 0.267, 0.0);
const vec3 C64_10 = vec3(1.0, 0.467, 0.467);
const vec3 C64_11 = vec3(0.2, 0.2, 0.2);
const vec3 C64_12 = vec3(0.467, 0.467, 0.467);
const vec3 C64_13 = vec3(0.667, 1.0, 0.4);
const vec3 C64_14 = vec3(0.0, 0.533, 1.0);
const vec3 C64_15 = vec3(0.733, 0.733, 0.733);

vec3 c64Color(int idx) {
  vec3 c;
  if (idx == 0) c = C64_0;
  else if (idx == 1) c = C64_1;
  else if (idx == 2) c = C64_2;
  else if (idx == 3) c = C64_3;
  else if (idx == 4) c = C64_4;
  else if (idx == 5) c = C64_5;
  else if (idx == 6) c = C64_6;
  else if (idx == 7) c = C64_7;
  else if (idx == 8) c = C64_8;
  else if (idx == 9) c = C64_9;
  else if (idx == 10) c = C64_10;
  else if (idx == 11) c = C64_11;
  else if (idx == 12) c = C64_12;
  else if (idx == 13) c = C64_13;
  else if (idx == 14) c = C64_14;
  else c = C64_15;
  return applyFlatPostMasterHue(c);
}

float c64Bayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

float c64PalLuma(vec3 c) {
  return dot(c, C64_LUMA);
}

float c64PalSat(vec3 c) {
  float l = c64PalLuma(c);
  return length(c - vec3(l));
}

// Hue-aware snap + 2-color Bayer — colored shadows over grey/brown defaults.
vec3 quantizeC64(vec3 rgb, float dither) {
  rgb = applyFlatPostMasterHue(rgb);
  float srcLum = c64PalLuma(rgb);
  float srcSat = c64PalSat(rgb);
  float targetLum = clamp(srcLum + (dither - 0.5) * 0.11, 0.0, 1.0);

  int bestIdx = 0;
  int secondIdx = 1;
  float bestScore = 1e6;
  float secondScore = 1e6;

  for (int i = 0; i < 16; i++) {
    vec3 pal = c64Color(i);
    float palLum = c64PalLuma(pal);
    float lumDiff = abs(palLum - targetLum);
    float colDist = distance(rgb, pal);

    float palSat = c64PalSat(pal);
    float neutralPenalty = 0.0;
    if (srcSat > 0.045 && palSat < 0.035) {
      neutralPenalty = 0.18 + srcSat * 0.75;
    }
    if (i == 0 && srcLum > 0.07) {
      neutralPenalty += 0.22;
    }
    if (i == 11 || i == 12 || i == 15) {
      neutralPenalty += srcSat * 0.35;
    }
    if (i == 9 && rgb.b > rgb.r * 0.82) {
      neutralPenalty += 0.18;
    }

    float score = lumDiff * 0.52 + colDist * 0.38 + neutralPenalty;
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

  if (secondScore < bestScore * 1.28 && secondIdx != bestIdx) {
    vec3 a = c64Color(bestIdx);
    vec3 b = c64Color(secondIdx);
    if (c64PalLuma(b) < c64PalLuma(a)) {
      return dither > 0.5 ? b : a;
    }
    return dither > 0.5 ? a : b;
  }
  return c64Color(bestIdx);
}

void main() {
  vec2 res = max(floor(uResolution + 0.5), vec2(1.0));
  vec2 cellPx = max(floor(uCellSize + 0.5), vec2(1.0));
  vec2 ip = floor(gl_FragCoord.xy);
  vec2 cellId = floor(ip / cellPx);

  vec2 centerPx = cellId * cellPx + floor(cellPx * 0.5);
  vec2 centerUv = (centerPx + 0.5) / res;
  vec4 cellColor = texture2D(tDiffuse, centerUv);

  if (isFlatPostEmptyCell(cellColor, uBgColor)) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  float bayer = c64Bayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = quantizeC64(cellColor.rgb, bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;

export const C64_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);
