import { APP_BACKGROUND } from '../constants.js';
import {
  FLAT_POST_EMPTY_CELL_GLSL,
  FLAT_POST_MASTER_HUE_GLSL,
} from './creativeLookFlatPostMasterHue.js';

/**
 * Game Boy Advance — 15-bit RGB (32,768 colors, 5 bits per channel).
 * @see https://en.wikipedia.org/wiki/List_of_video_game_console_palettes
 * @see https://en.wikipedia.org/wiki/Game_Boy_Advance
 */
export const GBA_CHANNEL_LEVELS = 32;

/** Native LCD — 240×160 (landscape). */
export const GBA_NATIVE_WIDTH = 240;
export const GBA_NATIVE_HEIGHT = 160;

export const GBA_REF_LOGICAL_WIDTH = 1280;
export const GBA_REF_LOGICAL_HEIGHT = Math.round(
  (GBA_REF_LOGICAL_WIDTH * GBA_NATIVE_HEIGHT) / GBA_NATIVE_WIDTH,
);

export const GBA_CELL_PX = GBA_REF_LOGICAL_WIDTH / GBA_NATIVE_WIDTH;

export const GBA_FIXED_INTENSITY = 1;
export const GBA_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookGbaFixedIntensity() {
  return GBA_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookGbaFixedScale() {
  return GBA_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeGbaCellSize(_patternScale) {
  return {
    width: GBA_CELL_PX,
    height: GBA_CELL_PX,
  };
}

/** Default empty-cell fill — overridden live from Studio Color via `uBgColor`. */
export const GBA_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);

/**
 * Mesh prepass — keep import albedo, cel-shade form only. 15-bit snap is the color pass.
 */
export const GBA_PREP_FRAGMENT = /* glsl */ `
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

  float form = lightBand * mix(0.2, 1.0, viewBand);

  vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
  float depthNorm = clamp(-viewPos.z * 0.045, 0.0, 1.0);
  form *= mix(0.82, 1.0, depthNorm);

  form = pow(clamp(form, 0.0, 1.0), 1.04);
  form = smoothstep(0.03, 0.93, form);

  float shade = mix(0.55, 1.0, form);
  vec3 lit = baseCol * shade;

  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);
}
`;

/** 240×160 — 15-bit per-channel snap + 2×2 Bayer dither. */
export const GBA_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}
${FLAT_POST_EMPTY_CELL_GLSL}

float gbaBayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

vec3 snapGba15Bit(vec3 rgb, float dither) {
  float peak = max(rgb.r, max(rgb.g, rgb.b));
  rgb *= 1.0 / max(peak, 1.0);
  float lumBias = (dither - 0.5) * 0.08;
  vec3 biased = rgb + vec3(lumBias);
  return clamp(floor(biased * 31.0 + 0.5) / 31.0, 0.0, 1.0);
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

  float bayer = gbaBayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = snapGba15Bit(applyFlatPostMasterHue(cellColor.rgb), bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;
