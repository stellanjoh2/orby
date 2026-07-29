import { APP_BACKGROUND } from '../constants.js';
import {
  FLAT_POST_EMPTY_CELL_GLSL,
  FLAT_POST_MASTER_HUE_GLSL,
} from './creativeLookFlatPostMasterHue.js';

/**
 * Apple II Hi-Res (HGR) — 280×192 luminance framebuffer + composite artifact decode.
 * Prepass outputs grayscale only (no color in VRAM). Post pass binarizes to ON/OFF dots
 * and applies the hardware display rules: 2+ adjacent ON → white, isolated ON → artifact
 * hue by column parity and 7-pixel MSB phase (~140×192 effective color).
 * @see https://en.wikipedia.org/wiki/Apple_II_graphics
 * @see https://nerdlypleasures.blogspot.com/2013/09/the-overlooked-artifact-color.html
 */
export const A2_NATIVE_WIDTH = 280;
export const A2_NATIVE_HEIGHT = 192;

export const A2_REF_LOGICAL_WIDTH = 1280;
export const A2_REF_LOGICAL_HEIGHT = Math.round(
  (A2_REF_LOGICAL_WIDTH * A2_NATIVE_HEIGHT) / A2_NATIVE_WIDTH,
);

export const A2_CELL_PX = A2_REF_LOGICAL_WIDTH / A2_NATIVE_WIDTH;

export const A2_FIXED_INTENSITY = 1;
export const A2_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookApple2FixedIntensity() {
  return A2_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookApple2FixedScale() {
  return A2_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeApple2CellSize(_patternScale) {
  return {
    width: A2_CELL_PX,
    height: A2_CELL_PX,
  };
}

/** Default empty-cell fill — overridden live from Studio Color via `uBgColor`. */
export const A2_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);

/**
 * Mesh prepass — grayscale luminance only (HGR VRAM stores dots, not color).
 */
export const A2_PREP_FRAGMENT = /* glsl */ `
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
  vec3 qN = normalize(sign(N) * floor(abs(N) * 4.0 + 0.499) / 4.0 + vec3(1e-4));
  vec3 V = normalize(cameraPosition - vWorldPosition);

  const vec3 KEY = normalize(vec3(0.38, 0.88, 0.38));
  const float CEL_LIGHT = 6.0;
  const float CEL_VIEW = 5.0;

  float ndl = max(dot(qN, KEY), 0.0);
  float ndv = max(dot(qN, V), 0.0);

  float lightBand = floor(ndl * CEL_LIGHT + 0.001) / max(CEL_LIGHT - 1.0, 1.0);
  float viewBand = floor(ndv * CEL_VIEW + 0.001) / max(CEL_VIEW - 1.0, 1.0);

  float form = lightBand * mix(0.12, 1.0, viewBand);

  vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
  float depthNorm = clamp(-viewPos.z * 0.045, 0.0, 1.0);
  form *= mix(0.70, 1.0, depthNorm);

  form = pow(clamp(form, 0.0, 1.0), 0.92);
  form = smoothstep(0.02, 0.96, form);

  const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
  float albedoLum = dot(baseCol, LUMA);
  float lum = mix(0.26, 1.0, form);
  lum *= mix(0.92, 1.08, albedoLum);

  gl_FragColor = vec4(vec3(clamp(lum, 0.0, 1.0)), uOpacity * mapAlpha);
}
`;

/**
 * 280×192 HGR post — binarize luminance to VRAM dots, decode with Apple display rules.
 * Ordered dither approximates artist bit patterns; color emerges only from dot placement.
 */
export const A2_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}
${FLAT_POST_EMPTY_CELL_GLSL}

const vec3 A2_LUMA = vec3(0.2126, 0.7152, 0.0722);

const vec3 A2_BLACK = vec3(0.031, 0.031, 0.031);
const vec3 A2_WHITE = vec3(1.0, 1.0, 1.0);
const vec3 A2_GREEN = vec3(0.0, 0.82, 0.22);
const vec3 A2_PURPLE = vec3(0.62, 0.12, 0.82);
const vec3 A2_ORANGE = vec3(1.0, 0.42, 0.08);
const vec3 A2_BLUE = vec3(0.22, 0.22, 0.95);

float a2Bayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

float a2SampleLum(vec2 res, vec2 cellPx, vec2 cellId) {
  vec2 centerPx = cellId * cellPx + floor(cellPx * 0.5);
  vec2 centerUv = (centerPx + 0.5) / res;
  vec4 texel = texture2D(tDiffuse, centerUv);
  if (texel.a < 0.04) {
    return -1.0;
  }
  return dot(texel.rgb, A2_LUMA);
}

float a2MapLumForVram(float lum) {
  float t = clamp(lum, 0.0, 1.0);
  return mix(0.36, 0.84, pow(t, 0.76));
}

float a2VramDot(float lum, float dither) {
  if (lum < 0.0) {
    return 0.0;
  }
  float mapped = a2MapLumForVram(lum);
  float threshold = 0.50 + (dither - 0.5) * 0.30;
  return mapped >= threshold ? 1.0 : 0.0;
}

int a2MsbPhase(int cx) {
  return int(mod(floor(float(cx) / 7.0), 2.0));
}

int a2ColumnParity(int cx) {
  return int(mod(float(cx), 2.0));
}

vec3 a2ArtifactHue(int phase, int parity) {
  if (phase == 0) {
    return applyFlatPostMasterHue(parity == 1 ? A2_GREEN : A2_PURPLE);
  }
  return applyFlatPostMasterHue(parity == 1 ? A2_ORANGE : A2_BLUE);
}

vec3 a2DecodeHgrDot(float onL, float onC, float onR, int phase, int parity, float mappedLum) {
  if (onC < 0.5) {
    return applyFlatPostMasterHue(A2_BLACK);
  }
  if ((onL > 0.5 || onR > 0.5) && mappedLum > 0.80) {
    return applyFlatPostMasterHue(A2_WHITE);
  }
  return a2ArtifactHue(phase, parity);
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

  int cx = int(cellId.x);
  int phase = a2MsbPhase(cx);
  int parity = a2ColumnParity(cx);

  float bayerC = a2Bayer2(ivec2(cellId)) / 4.0;
  float bayerL = a2Bayer2(ivec2(cellId - vec2(1.0, 0.0))) / 4.0;
  float bayerR = a2Bayer2(ivec2(cellId + vec2(1.0, 0.0))) / 4.0;

  float lumC = a2SampleLum(res, cellPx, cellId);
  float lumL = a2SampleLum(res, cellPx, cellId - vec2(1.0, 0.0));
  float lumR = a2SampleLum(res, cellPx, cellId + vec2(1.0, 0.0));

  float mappedC = a2MapLumForVram(lumC);

  float onL = a2VramDot(lumL, bayerL);
  float onC = a2VramDot(lumC, bayerC);
  float onR = a2VramDot(lumR, bayerR);

  vec3 outCol = a2DecodeHgrDot(onL, onC, onR, phase, parity, mappedC);
  gl_FragColor = vec4(outCol, 1.0);
}
`;
