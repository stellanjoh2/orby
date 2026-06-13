import { APP_BACKGROUND } from '../constants.js';
import { FLAT_POST_MASTER_HUE_GLSL } from './creativeLookFlatPostMasterHue.js';

/**
 * Mattel Intellivision STIC — 16-color fixed palette (Primary 0–7 + Pastel 8–15).
 * @see https://en.wikipedia.org/wiki/List_of_video_game_console_palettes
 * @see https://wiki.intellivision.us/index.php/STIC
 */
export const INTV_PALETTE_RGB = [
  [0.047, 0.0, 0.02], // 0 black
  [0.0, 0.176, 1.0], // 1 blue
  [1.0, 0.243, 0.0], // 2 red
  [0.788, 0.831, 0.392], // 3 tan
  [0.0, 0.471, 0.059], // 4 dark green
  [0.0, 0.655, 0.125], // 5 green
  [0.98, 0.918, 0.153], // 6 yellow
  [1.0, 0.988, 1.0], // 7 white
  [0.655, 0.659, 0.659], // 8 gray
  [0.353, 0.796, 1.0], // 9 cyan
  [1.0, 0.651, 0.0], // 10 orange
  [0.235, 0.345, 0.0], // 11 brown
  [1.0, 0.196, 0.463], // 12 pink
  [0.741, 0.584, 1.0], // 13 light blue
  [0.424, 0.804, 0.188], // 14 yellow-green
  [0.784, 0.102, 0.49], // 15 purple
];

/** STIC background plane — 160×96. */
export const INTV_NATIVE_WIDTH = 160;
export const INTV_NATIVE_HEIGHT = 96;

export const INTV_REF_LOGICAL_WIDTH = 1280;
export const INTV_REF_LOGICAL_HEIGHT = Math.round(
  (INTV_REF_LOGICAL_WIDTH * INTV_NATIVE_HEIGHT) / INTV_NATIVE_WIDTH,
);

export const INTV_CELL_PX = INTV_REF_LOGICAL_WIDTH / INTV_NATIVE_WIDTH;

export const INTV_FIXED_INTENSITY = 1;
export const INTV_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookIntellivisionFixedIntensity() {
  return INTV_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookIntellivisionFixedScale() {
  return INTV_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeIntellivisionCellSize(_patternScale) {
  return {
    width: INTV_CELL_PX,
    height: INTV_CELL_PX,
  };
}

export const INTV_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);

/**
 * Mesh prepass — colormap × cel form before STIC 16-color crush.
 * Tan/brown shadow accents match classic INTV title art.
 */
export const INTV_PREP_FRAGMENT = /* glsl */ `
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

  float form = lightBand * mix(0.16, 1.0, viewBand);

  vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
  float depthNorm = clamp(-viewPos.z * 0.045, 0.0, 1.0);
  form *= mix(0.78, 1.0, depthNorm);

  form = pow(clamp(form, 0.0, 1.0), 1.08);
  form = smoothstep(0.03, 0.9, form);

  const vec3 INTV_LUMA = vec3(0.2126, 0.7152, 0.0722);
  float srcLum = max(dot(baseCol, INTV_LUMA), 1e-4);
  float shadeLum = mix(0.38, 1.0, form);
  vec3 lit = baseCol * (shadeLum / srcLum);

  float shadowAmt = pow(1.0 - form, 1.35);
  vec3 n = baseCol / srcLum;
  vec3 shadowAccent = vec3(0.235, 0.345, 0.0); // brown
  if (n.b > n.r + 0.08 && n.b > n.g * 0.9) {
    shadowAccent = vec3(0.0, 0.176, 1.0); // blue
  } else if (n.r > n.g + 0.12 && n.r > n.b + 0.1) {
    shadowAccent = vec3(1.0, 0.243, 0.0); // red
  } else if (n.g > n.r + 0.06) {
    shadowAccent = vec3(0.0, 0.471, 0.059); // dark green
  } else if (srcLum > 0.45) {
    shadowAccent = vec3(0.788, 0.831, 0.392); // tan highlight roll-off
  }
  lit = mix(lit, mix(lit, shadowAccent, 0.52), shadowAmt);

  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);
}
`;

/** 160×96 STIC grid — 16-color snap + 2×2 Bayer dither. */
export const INTV_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}

const vec3 INTV_LUMA = vec3(0.2126, 0.7152, 0.0722);

const vec3 INTV_0 = vec3(0.047, 0.0, 0.02);
const vec3 INTV_1 = vec3(0.0, 0.176, 1.0);
const vec3 INTV_2 = vec3(1.0, 0.243, 0.0);
const vec3 INTV_3 = vec3(0.788, 0.831, 0.392);
const vec3 INTV_4 = vec3(0.0, 0.471, 0.059);
const vec3 INTV_5 = vec3(0.0, 0.655, 0.125);
const vec3 INTV_6 = vec3(0.98, 0.918, 0.153);
const vec3 INTV_7 = vec3(1.0, 0.988, 1.0);
const vec3 INTV_8 = vec3(0.655, 0.659, 0.659);
const vec3 INTV_9 = vec3(0.353, 0.796, 1.0);
const vec3 INTV_10 = vec3(1.0, 0.651, 0.0);
const vec3 INTV_11 = vec3(0.235, 0.345, 0.0);
const vec3 INTV_12 = vec3(1.0, 0.196, 0.463);
const vec3 INTV_13 = vec3(0.741, 0.584, 1.0);
const vec3 INTV_14 = vec3(0.424, 0.804, 0.188);
const vec3 INTV_15 = vec3(0.784, 0.102, 0.49);

vec3 intvColor(int idx) {
  vec3 c;
  if (idx == 0) c = INTV_0;
  else if (idx == 1) c = INTV_1;
  else if (idx == 2) c = INTV_2;
  else if (idx == 3) c = INTV_3;
  else if (idx == 4) c = INTV_4;
  else if (idx == 5) c = INTV_5;
  else if (idx == 6) c = INTV_6;
  else if (idx == 7) c = INTV_7;
  else if (idx == 8) c = INTV_8;
  else if (idx == 9) c = INTV_9;
  else if (idx == 10) c = INTV_10;
  else if (idx == 11) c = INTV_11;
  else if (idx == 12) c = INTV_12;
  else if (idx == 13) c = INTV_13;
  else if (idx == 14) c = INTV_14;
  else c = INTV_15;
  return applyFlatPostMasterHue(c);
}

float intvBayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

float intvPalLuma(vec3 c) {
  return dot(c, INTV_LUMA);
}

float intvPalSat(vec3 c) {
  float l = intvPalLuma(c);
  return length(c - vec3(l));
}

vec3 quantizeIntv(vec3 rgb, float dither) {
  rgb = applyFlatPostMasterHue(rgb);
  float srcLum = intvPalLuma(rgb);
  float srcSat = intvPalSat(rgb);
  float targetLum = clamp(srcLum + (dither - 0.5) * 0.12, 0.0, 1.0);

  int bestIdx = 0;
  int secondIdx = 1;
  float bestScore = 1e6;
  float secondScore = 1e6;

  for (int i = 0; i < 16; i++) {
    vec3 pal = intvColor(i);
    float palLum = intvPalLuma(pal);
    float lumDiff = abs(palLum - targetLum);
    float colDist = distance(rgb, pal);

    float palSat = intvPalSat(pal);
    float neutralPenalty = 0.0;
    if (srcSat > 0.045 && palSat < 0.035) {
      neutralPenalty = 0.2 + srcSat * 0.8;
    }
    if (i == 0 && srcLum > 0.08) {
      neutralPenalty += 0.24;
    }
    if (i == 8 && srcSat > 0.05) {
      neutralPenalty += 0.16 + srcSat * 0.4;
    }
    if ((i == 3 || i == 11) && srcSat > 0.08) {
      neutralPenalty += srcSat * 0.22;
    }
    if (i == 7 && srcLum < 0.72) {
      neutralPenalty += 0.12;
    }

    float score = lumDiff * 0.54 + colDist * 0.36 + neutralPenalty;
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

  if (secondScore < bestScore * 1.26 && secondIdx != bestIdx) {
    vec3 a = intvColor(bestIdx);
    vec3 b = intvColor(secondIdx);
    if (intvPalLuma(b) < intvPalLuma(a)) {
      return dither > 0.5 ? b : a;
    }
    return dither > 0.5 ? a : b;
  }
  return intvColor(bestIdx);
}

void main() {
  vec2 res = max(floor(uResolution + 0.5), vec2(1.0));
  vec2 cellPx = max(floor(uCellSize + 0.5), vec2(1.0));
  vec2 ip = floor(gl_FragCoord.xy);
  vec2 cellId = floor(ip / cellPx);

  vec2 centerPx = cellId * cellPx + floor(cellPx * 0.5);
  vec2 centerUv = (centerPx + 0.5) / res;
  vec4 cellColor = texture2D(tDiffuse, centerUv);

  if (cellColor.a < 0.04) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  float bayer = intvBayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = quantizeIntv(cellColor.rgb, bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;
