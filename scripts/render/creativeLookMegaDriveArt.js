import { APP_BACKGROUND } from '../constants.js';
import { FLAT_POST_MASTER_HUE_GLSL } from './creativeLookFlatPostMasterHue.js';

/**
 * Mega Drive / Genesis VDP — 9-bit RGB (512 colors).
 * Each channel: 3 bits → 8 levels (0–7), uniform snap in sRGB.
 * @see https://en.wikipedia.org/wiki/List_of_video_game_console_palettes
 * @see https://wiki.megadrive.org/index.php?title=VDP_Palette
 */
export const MD_CHANNEL_LEVELS = 8;

/** NTSC active field — 320×224 (PAL is 320×240). */
export const MD_NATIVE_WIDTH = 320;
export const MD_NATIVE_HEIGHT = 224;

export const MD_REF_LOGICAL_WIDTH = 1280;
export const MD_REF_LOGICAL_HEIGHT = Math.round(
  (MD_REF_LOGICAL_WIDTH * MD_NATIVE_HEIGHT) / MD_NATIVE_WIDTH,
);

export const MD_CELL_PX = MD_REF_LOGICAL_WIDTH / MD_NATIVE_WIDTH;

export const MD_FIXED_INTENSITY = 1;
export const MD_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookMegaDriveFixedIntensity() {
  return MD_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookMegaDriveFixedScale() {
  return MD_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeMegaDriveCellSize(_patternScale) {
  return {
    width: MD_CELL_PX,
    height: MD_CELL_PX,
  };
}

export const MD_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);

/**
 * Mesh prepass — colormap × cel form before 9-bit VDP snap.
 */
export const MD_PREP_FRAGMENT = /* glsl */ `
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

  form = pow(clamp(form, 0.0, 1.0), 1.06);
  form = smoothstep(0.03, 0.92, form);

  const vec3 MD_LUMA = vec3(0.2126, 0.7152, 0.0722);
  float srcLum = max(dot(baseCol, MD_LUMA), 1e-4);
  float shadeLum = mix(0.42, 1.0, form);
  vec3 lit = baseCol * (shadeLum / srcLum);

  float shadowAmt = pow(1.0 - form, 1.3);
  vec3 n = baseCol / srcLum;
  vec3 shadowAccent = vec3(0.0, 0.0, 0.533); // deep blue — common MD shadow
  if (n.r > n.g + 0.1 && n.r > n.b + 0.08) {
    shadowAccent = vec3(0.573, 0.0, 0.0); // #920000-ish maroon
  } else if (n.g > n.r + 0.06) {
    shadowAccent = vec3(0.0, 0.286, 0.0); // forest
  }
  lit = mix(lit, mix(lit, shadowAccent, 0.48), shadowAmt);

  gl_FragColor = vec4(clamp(lit, vec3(0.0), vec3(1.0)), uOpacity * mapAlpha);
}
`;

/** 320×224 NTSC — 9-bit per-channel snap + 2×2 Bayer dither. */
export const MD_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;

${FLAT_POST_MASTER_HUE_GLSL}

const vec3 MD_LUMA = vec3(0.2126, 0.7152, 0.0722);

float mdBayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

vec3 snapMegaDriveChannel(vec3 rgb, float dither) {
  float lum = dot(rgb, MD_LUMA);
  float lumBias = (dither - 0.5) * 0.09;
  vec3 biased = rgb + vec3(lumBias);
  return clamp(floor(biased * 7.0 + 0.5) / 7.0, 0.0, 1.0);
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

  float bayer = mdBayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = snapMegaDriveChannel(applyFlatPostMasterHue(cellColor.rgb), bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;
