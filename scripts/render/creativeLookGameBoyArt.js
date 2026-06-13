import { APP_BACKGROUND } from '../constants.js';
import { FLAT_POST_MASTER_HUE_GLSL } from './creativeLookFlatPostMasterHue.js';

/**
 * Original DMG 4-shade greenscale — non-backlit LCD pea-soup (BGP order).
 * Shade 0 = lightest, 3 = darkest.
 * @see https://en.wikipedia.org/wiki/List_of_video_game_console_palettes
 */
export const GB_DMG_ORIGINAL_PALETTE_RGB = [
  [0.608, 0.737, 0.059], // #9bbc0f
  [0.545, 0.675, 0.059], // #8bac0f
  [0.188, 0.384, 0.188], // #306230
  [0.059, 0.22, 0.059], // #0f380f
];

/** CGB LCD translation — desaturated olive (alternate). */
export const GB_DMG_CGB_PALETTE_RGB = [
  [0.769, 0.812, 0.631], // #c4cfa1
  [0.545, 0.584, 0.427], // #8b956d
  [0.302, 0.325, 0.235], // #4d533c
  [0.122, 0.122, 0.122], // #1f1f1f
];

/** Brighter sRGB "VGA emulator" greens — optional alternate. */
export const GB_DMG_VGA_PALETTE_RGB = [
  [0.878, 0.973, 0.812], // #e0f8cf
  [0.525, 0.753, 0.298], // #86c06c
  [0.188, 0.384, 0.313], // #306850
  [0.027, 0.094, 0.129], // #071821
];

/** Active palette — original DMG greenscale. */
export const GB_PALETTE_RGB = GB_DMG_ORIGINAL_PALETTE_RGB;

/** DMG LCD — 160×144. */
export const GB_NATIVE_WIDTH = 160;
export const GB_NATIVE_HEIGHT = 144;

/** Reference logical framebuffer at 8px/texel → 160 cols × 144 rows. */
export const GB_REF_LOGICAL_WIDTH = 1280;
export const GB_REF_LOGICAL_HEIGHT = Math.round(
  (GB_REF_LOGICAL_WIDTH * GB_NATIVE_HEIGHT) / GB_NATIVE_WIDTH,
);

export const GB_CELL_PX = GB_REF_LOGICAL_WIDTH / GB_NATIVE_WIDTH;

export const GB_FIXED_INTENSITY = 1;
export const GB_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookGameBoyFixedIntensity() {
  return GB_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookGameBoyFixedScale() {
  return GB_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeGameBoyCellSize(_patternScale) {
  return {
    width: GB_CELL_PX,
    height: GB_CELL_PX,
  };
}

/** Empty viewport — pure black (Shader Lab flat-post). */
export const GB_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);

/**
 * Mesh prepass — colormap × cel form; luma drives the 4-shade post pass (DMG ignores hue).
 */
export const GB_PREP_FRAGMENT = /* glsl */ `
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

  form = pow(clamp(form, 0.0, 1.0), 1.05);
  form = smoothstep(0.03, 0.92, form);

  const vec3 GB_LUMA = vec3(0.2126, 0.7152, 0.0722);
  float srcLum = max(dot(baseCol, GB_LUMA), 1e-4);
  float shadeLum = mix(0.4, 1.0, form);
  vec3 lit = baseCol * (shadeLum / srcLum);

  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);
}
`;

/** 160×144 feel — 4 DMG greens, luma snap + 2×2 Bayer between tiers. */
export const GB_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}

const vec3 GB_LUMA = vec3(0.2126, 0.7152, 0.0722);

const vec3 GB_0 = vec3(0.608, 0.737, 0.059);
const vec3 GB_1 = vec3(0.545, 0.675, 0.059);
const vec3 GB_2 = vec3(0.188, 0.384, 0.188);
const vec3 GB_3 = vec3(0.059, 0.22, 0.059);

vec3 gbShade(int idx) {
  vec3 c;
  if (idx <= 0) c = GB_0;
  else if (idx == 1) c = GB_1;
  else if (idx == 2) c = GB_2;
  else c = GB_3;
  return applyFlatPostMasterHue(c);
}

float gbBayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

vec3 quantizeGameBoy(vec3 rgb, float dither) {
  rgb = applyFlatPostMasterHue(rgb);
  float lum = dot(rgb, GB_LUMA);
  float biased = clamp(lum + (dither - 0.5) * 0.13, 0.0, 1.0);
  float tier = biased * 3.0;
  int lo = clamp(int(floor(tier)), 0, 2);
  int hi = lo + 1;
  float frac = tier - float(lo);
  if (frac > 0.42 + dither * 0.16) {
    return gbShade(hi);
  }
  return gbShade(lo);
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

  float bayer = gbBayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = quantizeGameBoy(cellColor.rgb, bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;

/** @deprecated use {@link GB_BG_HEX} */
export const GB_ART_BG_HEX = GB_BG_HEX;
