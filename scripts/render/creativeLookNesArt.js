import * as THREE from 'three';
import { APP_BACKGROUND } from '../constants.js';
import {
  FLAT_POST_EMPTY_CELL_GLSL,
  FLAT_POST_MASTER_HUE_GLSL,
} from './creativeLookFlatPostMasterHue.js';

/**
 * 2C02 PPU system palette — FCEUX default decode of all 64 indices ($00–$3F).
 * 55 unique sRGB values (duplicate blacks collapsed); matches the ~56-color hardware set.
 * @see https://www.nesdev.org/wiki/PPU_palettes
 * @see https://bitbeamcannon.com/nes-graphical-specs/
 */
export const NES_PALETTE_RGB = [
  [0.486, 0.486, 0.486], // 0 #7C7C7C — $00
  [0.0, 0.0, 0.988], // 1 #0000FC — $01
  [0.0, 0.0, 0.737], // 2 #0000BC — $02
  [0.267, 0.157, 0.737], // 3 #4428BC — $03
  [0.58, 0.0, 0.518], // 4 #940084 — $04
  [0.659, 0.0, 0.125], // 5 #A80020 — $05
  [0.659, 0.063, 0.0], // 6 #A81000 — $06
  [0.533, 0.078, 0.0], // 7 #881400 — $07
  [0.314, 0.188, 0.0], // 8 #503000 — $08
  [0.0, 0.471, 0.0], // 9 #007800 — $09
  [0.0, 0.408, 0.0], // 10 #006800 — $0A
  [0.0, 0.345, 0.0], // 11 #005800 — $0B
  [0.0, 0.251, 0.345], // 12 #004058 — $0C
  [0.0, 0.0, 0.0], // 13 #000000 — $0D–$3F blacks
  [0.737, 0.737, 0.737], // 14 #BCBCBC — $10
  [0.0, 0.471, 0.973], // 15 #0078F8 — $11
  [0.0, 0.345, 0.973], // 16 #0058F8 — $12
  [0.408, 0.267, 0.988], // 17 #6844FC — $13
  [0.847, 0.0, 0.8], // 18 #D800CC — $14
  [0.894, 0.0, 0.345], // 19 #E40058 — $15
  [0.973, 0.22, 0.0], // 20 #F83800 — $16
  [0.894, 0.361, 0.063], // 21 #E45C10 — $17
  [0.675, 0.486, 0.0], // 22 #AC7C00 — $18
  [0.0, 0.722, 0.0], // 23 #00B800 — $19
  [0.0, 0.659, 0.0], // 24 #00A800 — $1A
  [0.0, 0.659, 0.267], // 25 #00A844 — $1B
  [0.0, 0.533, 0.533], // 26 #008888 — $1C
  [0.973, 0.973, 0.973], // 27 #F8F8F8 — $20
  [0.235, 0.737, 0.988], // 28 #3CBCFC — $21
  [0.408, 0.533, 0.988], // 29 #6888FC — $22
  [0.596, 0.471, 0.973], // 30 #9878F8 — $23
  [0.973, 0.471, 0.973], // 31 #F878F8 — $24
  [0.973, 0.345, 0.596], // 32 #F85898 — $25
  [0.973, 0.471, 0.345], // 33 #F87858 — $26
  [0.988, 0.627, 0.267], // 34 #FCA044 — $27
  [0.973, 0.722, 0.0], // 35 #F8B800 — $28
  [0.722, 0.973, 0.094], // 36 #B8F818 — $29
  [0.345, 0.847, 0.329], // 37 #58D854 — $2A
  [0.345, 0.973, 0.596], // 38 #58F898 — $2B
  [0.0, 0.91, 0.847], // 39 #00E8D8 — $2C
  [0.471, 0.471, 0.471], // 40 #787878 — $2D
  [0.988, 0.988, 0.988], // 41 #FCFCFC — $30
  [0.643, 0.894, 0.988], // 42 #A4E4FC — $31
  [0.722, 0.722, 0.973], // 43 #B8B8F8 — $32
  [0.847, 0.722, 0.973], // 44 #D8B8F8 — $33
  [0.973, 0.722, 0.973], // 45 #F8B8F8 — $34
  [0.973, 0.643, 0.753], // 46 #F8A4C0 — $35
  [0.941, 0.816, 0.69], // 47 #F0D0B0 — $36
  [0.988, 0.878, 0.659], // 48 #FCE0A8 — $37
  [0.973, 0.847, 0.471], // 49 #F8D878 — $38
  [0.847, 0.973, 0.471], // 50 #D8F878 — $39
  [0.722, 0.973, 0.722], // 51 #B8F8B8 — $3A
  [0.722, 0.973, 0.847], // 52 #B8F8D8 — $3B
  [0.0, 0.988, 0.988], // 53 #00FCFC — $3C
  [0.973, 0.847, 0.973], // 54 #F8D8F8 — $3D
];

export const NES_PALETTE_COUNT = NES_PALETTE_RGB.length;

/** NTSC visible field — 256×224 (PAL is 256×240). */
export const NES_NATIVE_WIDTH = 256;
export const NES_NATIVE_HEIGHT = 224;

/** Reference logical framebuffer at 5px/texel → 256 cols × 224 rows. */
export const NES_REF_LOGICAL_WIDTH = 1280;
export const NES_REF_LOGICAL_HEIGHT = Math.round(
  (NES_REF_LOGICAL_WIDTH * NES_NATIVE_HEIGHT) / NES_NATIVE_WIDTH,
);

export const NES_CELL_PX = NES_REF_LOGICAL_WIDTH / NES_NATIVE_WIDTH;

export const NES_FIXED_INTENSITY = 1;
export const NES_FIXED_SCALE = 1;

/** @returns {number} */
export function creativeLookNesFixedIntensity() {
  return NES_FIXED_INTENSITY;
}

/** @returns {number} */
export function creativeLookNesFixedScale() {
  return NES_FIXED_SCALE;
}

/** @param {number} [_patternScale] */
export function creativeNesCellSize(_patternScale) {
  return {
    width: NES_CELL_PX,
    height: NES_CELL_PX,
  };
}

/** @returns {THREE.DataTexture} */
export function createNesPaletteTexture() {
  const data = new Uint8Array(NES_PALETTE_COUNT * 4);
  for (let i = 0; i < NES_PALETTE_COUNT; i += 1) {
    const [r, g, b] = NES_PALETTE_RGB[i];
    data[i * 4] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, NES_PALETTE_COUNT, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export const NES_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);

/**
 * Mesh prepass — keep import albedo, cel-shade form + PPU shadow accents. Palette snap is the color pass.
 */
export const NES_PREP_FRAGMENT = /* glsl */ `
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

  const vec3 NES_LUMA = vec3(0.2126, 0.7152, 0.0722);
  float srcLum = max(dot(baseCol, NES_LUMA), 1e-4);
  float shade = mix(0.42, 1.0, form);
  vec3 lit = baseCol * shade;

  float shadowAmt = pow(1.0 - form, 1.32);
  vec3 n = baseCol / srcLum;
  vec3 shadowAccent = vec3(0.267, 0.157, 0.737); // #4428bc — NES purple shadow
  if (n.b > n.r + 0.06 && n.b > n.g * 0.85) {
    shadowAccent = vec3(0.0, 0.0, 0.737); // #0000bc
  } else if (n.g > n.r + 0.07) {
    shadowAccent = vec3(0.0, 0.345, 0.0); // #005800
  } else if (n.r > n.g + 0.12 && n.r > n.b + 0.08) {
    shadowAccent = mix(vec3(0.659, 0.0, 0.125), vec3(0.267, 0.157, 0.737), 0.5); // #a80020 / purple
  }
  lit = mix(lit, mix(lit, shadowAccent, 0.5), shadowAmt);

  lit = clamp(lit, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(lit, uOpacity * mapAlpha);
}
`;

/** 256×224 NTSC macro pixels — full PPU palette snap + 2×2 Bayer dither. */
export const NES_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D uPalette;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uBgColor;
uniform float uPaletteCount;

${FLAT_POST_MASTER_HUE_GLSL}
${FLAT_POST_EMPTY_CELL_GLSL}

const vec3 NES_LUMA = vec3(0.2126, 0.7152, 0.0722);
const int NES_PAL_MAX = 55;

vec3 nesColor(int idx) {
  float u = (float(idx) + 0.5) / uPaletteCount;
  return applyFlatPostMasterHue(texture2D(uPalette, vec2(u, 0.5)).rgb);
}

float nesBayer2(ivec2 cell) {
  int x = int(mod(float(cell.x), 2.0));
  int y = int(mod(float(cell.y), 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

float nesPalLuma(vec3 c) {
  return dot(c, NES_LUMA);
}

float nesPalSat(vec3 c) {
  float l = nesPalLuma(c);
  return length(c - vec3(l));
}

vec3 quantizeNes(vec3 rgb, float dither) {
  rgb = applyFlatPostMasterHue(rgb);
  float peak = max(rgb.r, max(rgb.g, rgb.b));
  rgb *= 1.0 / max(peak, 1.0);
  float srcLum = nesPalLuma(rgb);
  float srcSat = nesPalSat(rgb);
  float targetLum = clamp(srcLum + (dither - 0.5) * 0.1, 0.0, 1.0);

  int bestIdx = 0;
  int secondIdx = 1;
  float bestScore = 1e6;
  float secondScore = 1e6;

  for (int i = 0; i < NES_PAL_MAX; i++) {
    vec3 pal = nesColor(i);
    float palLum = nesPalLuma(pal);
    float lumDiff = abs(palLum - targetLum);
    float colDist = distance(rgb, pal);

    float palSat = nesPalSat(pal);
    float neutralPenalty = 0.0;
    if (srcSat > 0.04 && palSat < 0.035) {
      neutralPenalty = 0.16 + srcSat * 0.7;
    }
    // Prefer hue shadows over flat black ($0D) on mid-tones.
    if (i == 13 && srcLum > 0.07) {
      neutralPenalty += 0.22;
    }
    // Greys — avoid washing saturated sources (BitBeamCannon: no true dark grey).
    if (i == 0 || i == 14 || i == 40) {
      neutralPenalty += srcSat * 0.34;
    }
    if ((i == 14 || i == 27 || i == 41) && srcLum < 0.82) {
      neutralPenalty += 0.08;
    }

    float score = lumDiff * 0.5 + colDist * 0.4 + neutralPenalty;
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
    vec3 a = nesColor(bestIdx);
    vec3 b = nesColor(secondIdx);
    if (nesPalLuma(b) < nesPalLuma(a)) {
      return dither > 0.5 ? b : a;
    }
    return dither > 0.5 ? a : b;
  }
  return nesColor(bestIdx);
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

  float bayer = nesBayer2(ivec2(cellId)) / 4.0;
  vec3 crushed = quantizeNes(cellColor.rgb, bayer);
  gl_FragColor = vec4(crushed, 1.0);
}
`;
