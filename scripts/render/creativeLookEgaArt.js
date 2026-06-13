import { APP_BACKGROUND } from '../constants.js';
import { FLAT_POST_MASTER_HUE_GLSL } from './creativeLookFlatPostMasterHue.js';

/**
 * IBM EGA 16-color palette (mode 10h — 640×350, 16 of 64 colors).
 * Curated for SCUMM / Monkey Island night-scene vibes: deep blues, magenta accents, cyan stars.
 * sRGB 0–1.
 */
export const EGA_PALETTE_RGB = [
  [0.0, 0.0, 0.0], // 0 black
  [0.0, 0.0, 0.667], // 1 blue
  [0.0, 0.667, 0.0], // 2 green
  [0.0, 0.667, 0.667], // 3 cyan
  [0.667, 0.0, 0.0], // 4 red
  [0.667, 0.0, 0.667], // 5 magenta
  [0.667, 0.333, 0.0], // 6 brown
  [0.667, 0.667, 0.667], // 7 light gray
  [0.333, 0.333, 0.333], // 8 dark gray
  [0.333, 0.333, 1.0], // 9 bright blue
  [0.333, 1.0, 0.333], // 10 bright green
  [0.333, 1.0, 1.0], // 11 bright cyan
  [1.0, 0.333, 0.333], // 12 bright red
  [1.0, 0.333, 1.0], // 13 bright magenta
  [1.0, 1.0, 0.333], // 14 yellow
  [1.0, 1.0, 1.0], // 15 white
];

/** EGA mode 10h native framebuffer — 640×350. */
export const EGA_NATIVE_WIDTH = 640;
export const EGA_NATIVE_HEIGHT = 350;

/** Reference logical framebuffer at 2px/texel → 640 cols × 350 rows. */
export const EGA_REF_LOGICAL_WIDTH = 1280;
export const EGA_REF_LOGICAL_HEIGHT = Math.round(
  (EGA_REF_LOGICAL_WIDTH * EGA_NATIVE_HEIGHT) / EGA_NATIVE_WIDTH,
);

export const EGA_CELL_PX = EGA_REF_LOGICAL_WIDTH / EGA_NATIVE_WIDTH;

export const EGA_FIXED_INTENSITY = 1;
export const EGA_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookEgaFixedIntensity() {
  return EGA_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookEgaFixedScale() {
  return EGA_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeEgaCellSize(_patternScale) {
  return {
    width: EGA_CELL_PX,
    height: EGA_CELL_PX,
  };
}

/**
 * Mesh prepass — colormap albedo × cel form with SCUMM-style purple/blue shadow accents.
 * Outputs lit RGB; alpha = mesh coverage for the EGA post pass.
 */
export const EGA_PREP_FRAGMENT = /* glsl */ `
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

  float srcLum = max(dot(baseCol, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float shadeLum = mix(0.44, 1.0, form);
  vec3 lit = baseCol * (shadeLum / srcLum);

  // SCUMM / Monkey Island shadow tones — purple dither bias in cool night scenes.
  float shadowAmt = pow(1.0 - form, 1.35);
  vec3 n = baseCol / srcLum;
  vec3 shadowAccent = vec3(0.667, 0.0, 0.667); // magenta title purple
  if (n.b > n.r + 0.06 && n.b > n.g * 0.85) {
    shadowAccent = vec3(0.0, 0.0, 0.667); // deep navy
  } else if (n.b > n.g && n.b > n.r * 0.9) {
    shadowAccent = vec3(0.333, 0.333, 1.0); // bright blue starlight
  } else if (n.g > n.r + 0.07) {
    shadowAccent = vec3(0.0, 0.667, 0.667); // cyan horizon
  } else if (n.r > n.g + 0.12 && n.r > n.b + 0.08) {
    shadowAccent = mix(vec3(0.667, 0.0, 0.0), vec3(1.0, 0.333, 1.0), 0.58); // warm fire → magenta
  }
  lit = mix(lit, mix(lit, shadowAccent, 0.56), shadowAmt);

  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);
}
`;

/** Screen-space EGA crush — 640×350 macro pixels, 2×2 Bayer dither, 16-color snap. */
export const EGA_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}

const vec3 EGA_LUMA = vec3(0.2126, 0.7152, 0.0722);

const vec3 EGA_0 = vec3(0.0, 0.0, 0.0);
const vec3 EGA_1 = vec3(0.0, 0.0, 0.667);
const vec3 EGA_2 = vec3(0.0, 0.667, 0.0);
const vec3 EGA_3 = vec3(0.0, 0.667, 0.667);
const vec3 EGA_4 = vec3(0.667, 0.0, 0.0);
const vec3 EGA_5 = vec3(0.667, 0.0, 0.667);
const vec3 EGA_6 = vec3(0.667, 0.333, 0.0);
const vec3 EGA_7 = vec3(0.667, 0.667, 0.667);
const vec3 EGA_8 = vec3(0.333, 0.333, 0.333);
const vec3 EGA_9 = vec3(0.333, 0.333, 1.0);
const vec3 EGA_10 = vec3(0.333, 1.0, 0.333);
const vec3 EGA_11 = vec3(0.333, 1.0, 1.0);
const vec3 EGA_12 = vec3(1.0, 0.333, 0.333);
const vec3 EGA_13 = vec3(1.0, 0.333, 1.0);
const vec3 EGA_14 = vec3(1.0, 1.0, 0.333);
const vec3 EGA_15 = vec3(1.0, 1.0, 1.0);

vec3 egaColor(int idx) {
  vec3 c;
  if (idx == 0) c = EGA_0;
  else if (idx == 1) c = EGA_1;
  else if (idx == 2) c = EGA_2;
  else if (idx == 3) c = EGA_3;
  else if (idx == 4) c = EGA_4;
  else if (idx == 5) c = EGA_5;
  else if (idx == 6) c = EGA_6;
  else if (idx == 7) c = EGA_7;
  else if (idx == 8) c = EGA_8;
  else if (idx == 9) c = EGA_9;
  else if (idx == 10) c = EGA_10;
  else if (idx == 11) c = EGA_11;
  else if (idx == 12) c = EGA_12;
  else if (idx == 13) c = EGA_13;
  else if (idx == 14) c = EGA_14;
  else c = EGA_15;
  return applyFlatPostMasterHue(c);
}

float egaBayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

float egaPalLuma(vec3 c) {
  return dot(c, EGA_LUMA);
}

float egaPalSat(vec3 c) {
  float l = egaPalLuma(c);
  return length(c - vec3(l));
}

// Hue-aware snap + 2-color Bayer — purple/blue night-scene bias over neutral grays.
vec3 quantizeEga(vec3 rgb, float dither) {
  rgb = applyFlatPostMasterHue(rgb);
  float srcLum = egaPalLuma(rgb);
  float srcSat = egaPalSat(rgb);
  float targetLum = clamp(srcLum + (dither - 0.5) * 0.12, 0.0, 1.0);

  int bestIdx = 0;
  int secondIdx = 1;
  float bestScore = 1e6;
  float secondScore = 1e6;

  for (int i = 0; i < 16; i++) {
    vec3 pal = egaColor(i);
    float palLum = egaPalLuma(pal);
    float lumDiff = abs(palLum - targetLum);
    float colDist = distance(rgb, pal);

    float palSat = egaPalSat(pal);
    float neutralPenalty = 0.0;
    if (srcSat > 0.04 && palSat < 0.035) {
      neutralPenalty = 0.2 + srcSat * 0.8;
    }
    if (i == 0 && srcLum > 0.07) {
      neutralPenalty += 0.24;
    }
    if (i == 7 || i == 8) {
      neutralPenalty += srcSat * 0.42;
    }
    if (i == 6 && rgb.b > rgb.r * 0.75) {
      neutralPenalty += 0.22;
    }

    // Monkey Island purple vibes — favor magenta/blue in shadows and cool hues.
    float purpleBonus = 0.0;
    if (srcLum < 0.42) {
      if (i == 5 || i == 13) purpleBonus = 0.14;
      if (i == 1 || i == 9) purpleBonus = max(purpleBonus, 0.1);
    }
    if (rgb.b > rgb.r + 0.05 && (i == 1 || i == 9 || i == 3 || i == 11)) {
      purpleBonus = max(purpleBonus, 0.08);
    }
    if (rgb.r > rgb.b && rgb.r > rgb.g && (i == 5 || i == 13)) {
      purpleBonus = max(purpleBonus, 0.06);
    }

    float score = lumDiff * 0.5 + colDist * 0.36 + neutralPenalty - purpleBonus;
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
    vec3 a = egaColor(bestIdx);
    vec3 b = egaColor(secondIdx);
    if (egaPalLuma(b) < egaPalLuma(a)) {
      return dither > 0.5 ? b : a;
    }
    return dither > 0.5 ? a : b;
  }
  return egaColor(bestIdx);
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

  float bayer = egaBayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = quantizeEga(cellColor.rgb, bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;

export const EGA_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);
