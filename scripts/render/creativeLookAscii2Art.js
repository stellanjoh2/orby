import * as THREE from 'three';
import { ORBY_BLACK, ORBY_LIME } from '../constants.js';
import { blitBrailleGlyph, buildBrailleDensityCharset } from './asciiBrailleFont.js';
import {
  ASCII_ART_FIXED_INTENSITY,
  ASCII_ART_INK_HEX,
  ASCII_SHADOW_INK_FLOOR,
} from './creativeLookAsciiArt.js';

/** Solid Orby lime — Master Hue rotates from this base. */
export const ASCII_2_INK_HEX = ASCII_ART_INK_HEX;

/** Mid-tone ink tier — shadows at {@link ASCII_SHADOW_INK_FLOOR}. */
export const ASCII_2_SHADOW_INK_OPACITY = ASCII_SHADOW_INK_FLOOR;

/** Braille cell texels (compact 6×10). */
export const ASCII_2_CELL_W = 6;
export const ASCII_2_CELL_H = 10;

/** Integer upscale per atlas texel → screen (nearest). */
export const ASCII_2_SCREEN_SCALE = 2;

/** 256 braille patterns sorted by dot count — smooth halftone ramp. */
export const ASCII_2_CHARSET = buildBrailleDensityCharset();

export const ASCII_2_ATLAS_COLS = 16;

/** Bump when cell/font/atlas bake changes so cached atlases rebuild. */
export const ASCII_2_ATLAS_VERSION = 1;

/** Atlas supersample — 4× nearest upscale (24×40 texels per glyph). */
export const ASCII_2_BAKE_SCALE = 4;

/** Locked Shader Lab intensity — baked contrast. */
export const ASCII_2_FIXED_INTENSITY = ASCII_ART_FIXED_INTENSITY;

/** @returns {number} */
export function creativeLookAscii2FixedIntensity() {
  return ASCII_2_FIXED_INTENSITY;
}

/** @param {number} [_patternScale] */
export function creativeAscii2CellSize(_patternScale) {
  return {
    width: ASCII_2_CELL_W * ASCII_2_SCREEN_SCALE,
    height: ASCII_2_CELL_H * ASCII_2_SCREEN_SCALE,
  };
}

/** Shader Lab Scale slider locked for ASCII 2. */
export function creativeLookAscii2FixedScale() {
  return 1;
}

function bakeAscii2Glyph(ctx, ch, col, row, atlasW, atlasH) {
  const x = col * atlasW;
  const y = row * atlasH;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, atlasW, atlasH);
  blitBrailleGlyph(ctx, ch, x, y, ASCII_2_BAKE_SCALE, ASCII_2_CELL_W, ASCII_2_CELL_H);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.charset]
 */
export function createAscii2FontAtlas(opts = {}) {
  const charset = opts.charset ?? ASCII_2_CHARSET;
  const chars = [...charset];
  const count = chars.length;
  const cols = ASCII_2_ATLAS_COLS;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = ASCII_2_CELL_W;
  const cellH = ASCII_2_CELL_H;
  const displayGlyphW = cellW * ASCII_2_SCREEN_SCALE;
  const displayGlyphH = cellH * ASCII_2_SCREEN_SCALE;
  const atlasGlyphW = cellW * ASCII_2_BAKE_SCALE;
  const atlasGlyphH = cellH * ASCII_2_BAKE_SCALE;

  const canvas = document.createElement('canvas');
  canvas.width = cols * atlasGlyphW;
  canvas.height = rows * atlasGlyphH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('ASCII 2 font atlas: 2D canvas unavailable');
  }

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    bakeAscii2Glyph(ctx, chars[i], col, row, atlasGlyphW, atlasGlyphH);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if ('colorSpace' in texture) {
    texture.colorSpace = THREE.NoColorSpace;
  }
  texture.needsUpdate = true;

  return {
    texture,
    charCount: count,
    cellGlyphW: displayGlyphW,
    cellGlyphH: displayGlyphH,
    atlasGlyphW,
    atlasGlyphH,
    bakeScale: ASCII_2_BAKE_SCALE,
    cols,
    rows,
  };
}

/** @type {ReturnType<typeof createAscii2FontAtlas> | null} */
let sharedAscii2FontAtlas = null;
/** @type {Promise<ReturnType<typeof createAscii2FontAtlas>> | null} */
let ascii2AtlasPromise = null;
/** @type {number} */
let loadedAscii2AtlasVersion = -1;

export function getSharedAscii2FontAtlas() {
  if (!sharedAscii2FontAtlas || loadedAscii2AtlasVersion !== ASCII_2_ATLAS_VERSION) {
    sharedAscii2FontAtlas?.texture?.dispose?.();
    sharedAscii2FontAtlas = createAscii2FontAtlas();
    loadedAscii2AtlasVersion = ASCII_2_ATLAS_VERSION;
    ascii2AtlasPromise = null;
    void ensureAscii2FontAtlasLoaded();
  }
  return sharedAscii2FontAtlas;
}

export function ensureAscii2FontAtlasLoaded() {
  if (ascii2AtlasPromise && loadedAscii2AtlasVersion === ASCII_2_ATLAS_VERSION) {
    return ascii2AtlasPromise;
  }
  ascii2AtlasPromise = Promise.resolve().then(() => {
    const next = createAscii2FontAtlas();
    sharedAscii2FontAtlas?.texture?.dispose?.();
    sharedAscii2FontAtlas = next;
    loadedAscii2AtlasVersion = ASCII_2_ATLAS_VERSION;
    return next;
  });
  return ascii2AtlasPromise;
}

/** Softer cel bands than ASCII v1 — smoother braille halftone. */
export const ASCII_2_LUMINANCE_PREP_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uOpacity;

void main() {
  float mapAlpha = 1.0;
  if (uHasMap > 0.5) {
    mapAlpha = texture2D(uMap, vUv).a;
  }
  if (mapAlpha < 0.01) {
    discard;
  }

  vec3 N = normalize(vWorldNormal);
  vec3 qN = normalize(sign(N) * floor(abs(N) * 5.0 + 0.499) / 5.0 + vec3(1e-4));
  vec3 V = normalize(cameraPosition - vWorldPosition);

  const vec3 TERMINAL_KEY = normalize(vec3(0.38, 0.88, 0.38));
  const float CEL_LIGHT = 9.0;
  const float CEL_VIEW = 8.0;

  float ndl = max(dot(qN, TERMINAL_KEY), 0.0);
  float ndv = max(dot(qN, V), 0.0);

  float lightBand = floor(ndl * CEL_LIGHT + 0.001) / max(CEL_LIGHT - 1.0, 1.0);
  float viewBand = floor(ndv * CEL_VIEW + 0.001) / max(CEL_VIEW - 1.0, 1.0);

  float form = lightBand * mix(0.22, 1.0, viewBand);

  vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
  float depthNorm = clamp(-viewPos.z * 0.045, 0.0, 1.0);
  form *= mix(0.82, 1.0, depthNorm);

  form = pow(clamp(form, 0.0, 1.0), 1.08);
  form = smoothstep(0.02, 0.92, form);

  gl_FragColor = vec4(form, ndv, 1.0, uOpacity * mapAlpha);
}
`;

export const ASCII_2_POST_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform vec3 uInkColor;
uniform vec3 uBgColor;
uniform sampler2D uFontAtlas;
uniform float uCharCount;
uniform vec2 uCellGlyphSize;
uniform vec2 uAtlasGlyphSize;
uniform vec2 uAtlasGrid;
uniform float uMasterHue;
uniform float uInkFloor;

const float ASCII_FORM_EMPTY = 0.04;
const float ASCII_FORM_FULL = 0.78;
const float ASCII_INK_CEIL = 1.0;

vec3 applyAsciiMasterHue(vec3 color) {
  if (abs(uMasterHue) < 0.0001) return color;
  const mat3 RGB_TO_YIQ = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  const mat3 YIQ_TO_RGB = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = RGB_TO_YIQ * color;
  float cosA = cos(uMasterHue);
  float sinA = sin(uMasterHue);
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  yiq.yz = rot * yiq.yz;
  return clamp(YIQ_TO_RGB * yiq, 0.0, 4.0);
}

float sampleAsciiAtlasPx(vec2 atlasSize, vec2 pixel) {
  vec2 atlasUv = (floor(pixel) + 0.5) / atlasSize;
  return texture2D(uFontAtlas, atlasUv).r;
}

float sampleAsciiGlyph(float charIdx, vec2 glyphPx) {
  float cols = max(uAtlasGrid.x, 1.0);
  float rows = max(uAtlasGrid.y, 1.0);
  float idx = clamp(floor(charIdx + 0.5), 0.0, max(uCharCount - 1.0, 0.0));
  float col = mod(idx, cols);
  float row = floor(idx / cols);
  vec2 atlasSize = vec2(cols * uAtlasGlyphSize.x, rows * uAtlasGlyphSize.y);
  vec2 atlasRatio = uAtlasGlyphSize / max(uCellGlyphSize, vec2(1.0));
  vec2 atlasPx = glyphPx * atlasRatio + floor(atlasRatio * 0.5);
  vec2 blockOrigin = vec2(col * uAtlasGlyphSize.x, row * uAtlasGlyphSize.y) + atlasPx;

  float on = sampleAsciiAtlasPx(atlasSize, blockOrigin);
  return on;
}

void main() {
  vec2 res = max(floor(uResolution + 0.5), vec2(1.0));
  vec2 cellPx = floor(uCellSize + 0.5);
  vec2 ip = floor(gl_FragCoord.xy);
  vec2 cellId = floor(ip / cellPx);
  vec2 gp = ip - cellId * cellPx;

  vec2 centerPx = cellId * cellPx + floor(cellPx * 0.5);
  vec2 centerUv = (centerPx + 0.5) / res;
  vec4 cellCenter = texture2D(tDiffuse, centerUv);
  float form = cellCenter.r;
  float ndv = cellCenter.g;
  float meshAlpha = cellCenter.a;
  float meshMask = cellCenter.b;

  if (meshMask < 0.5 || meshAlpha < 0.04) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  float maxIdx = max(uCharCount - 1.0, 1.0);

  float solid = form * mix(0.72, 1.0, smoothstep(0.1, 0.94, ndv));
  solid = smoothstep(ASCII_FORM_EMPTY, ASCII_FORM_FULL, solid);

  float charIdx = clamp(floor(solid * maxIdx + 0.5), 0.0, maxIdx);
  if (solid < ASCII_FORM_EMPTY) {
    charIdx = 0.0;
  }

  if (gp.x < 0.0 || gp.y < 0.0 || gp.x >= cellPx.x || gp.y >= cellPx.y) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  vec2 glyphScale = max(cellPx / uCellGlyphSize, vec2(1.0));
  vec2 glyphPx = clamp(floor(gp / glyphScale), vec2(0.0), uCellGlyphSize - vec2(1.0));

  float glyph = sampleAsciiGlyph(charIdx, glyphPx);
  if (glyph < 0.5) {
    gl_FragColor = vec4(uBgColor, 1.0);
    return;
  }

  float inkStrength = mix(
    uInkFloor,
    ASCII_INK_CEIL,
    smoothstep(0.0, 0.72, solid)
  );
  vec3 ink = applyAsciiMasterHue(uInkColor) * inkStrength;
  gl_FragColor = vec4(ink, 1.0);
}
`;

export const ASCII_2_BG_HEX = ORBY_BLACK;
