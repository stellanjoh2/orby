import * as THREE from 'three';
import { APP_BACKGROUND, ORBY_LIME } from '../constants.js';
import { blitVga8x16Glyph } from './asciiVga8x16Font.js';

/** Solid Orby lime — Master Hue rotates from this base. */
export const ASCII_ART_INK_HEX = parseInt(ORBY_LIME.slice(1), 16);

/** Shadow ink floor for all ASCII presets — highlights stay at 1.0. */
export const ASCII_SHADOW_INK_FLOOR = 0.25;

/** @deprecated use {@link ASCII_SHADOW_INK_FLOOR} */
export const ASCII_ART_SHADOW_INK_OPACITY = ASCII_SHADOW_INK_FLOOR;

/** @deprecated use {@link ASCII_ART_INK_HEX} */
export const ASCII_ART_FG_HEX = ASCII_ART_INK_HEX;
/** @deprecated */
export const ASCII_ART_HIGHLIGHT_HEX = ASCII_ART_INK_HEX;
/** @deprecated */
export const ASCII_ART_SHADOW_HEX = ASCII_ART_INK_HEX;

/** VGA atlas texels per glyph (IBM 8×16). */
export const ASCII_CELL_W = 8;
export const ASCII_CELL_H = 16;

/** Integer upscale: each atlas pixel → N×N screen pixels (nearest, no blur). */
export const ASCII_SCREEN_SCALE = 2;

/**
 * Hacker / 80s terminal charset — ink-fill ordered for VGA 8×16 (+ CP437 block glyphs).
 * Unicode block chars (▀░▓█) and Greek letters are not in the VGA ROM; closest CP437 bytes:
 * \xB0 ░ \xB1 ▒ \xB2 ▓ \xDB █ \xDC ▄ \xDD ▌ \xDE ▐ \xDF ▀ \xC4 ─
 */
export const ASCII_ART_CHARSET =
  " .`-" +
  "_,:'" +
  "\xC4;" +
  "~^=\"" +
  "/+<>§()" +
  "|\\i%{}!" +
  "[]*c?\xA8" +
  "xt17v" +
  "\xB8fzun" +
  "\xB0Y\xB4" +
  "\xA3Z\xB7" +
  "0X&#O" +
  "@$8HR" +
  "BWMNQ" +
  "\xDF\xB1" +
  "\xDD\xDE" +
  "\xDC\xB2" +
  "\xDB";

export const ASCII_ATLAS_COLS = 16;

/** Bump when cell/font/atlas bake changes so cached atlases rebuild. */
export const ASCII_ATLAS_VERSION = 22;

/**
 * Atlas supersample — VGA 8×16 nearest-upscaled into atlas (4× → 32×64 texels).
 * On-screen cell stays {@link ASCII_SCREEN_SCALE}× (16×32 logical); shader picks block center.
 */
export const ASCII_BAKE_SCALE = 4;

/** Locked Shader Lab intensity — ASCII Art uses baked contrast instead. */
export const ASCII_ART_FIXED_INTENSITY = 1;

/** @returns {number} */
export function creativeLookAsciiFixedIntensity() {
  return ASCII_ART_FIXED_INTENSITY;
}

/** @param {number} [_patternScale] — ignored; ASCII Art uses a fixed terminal cell size */
export function creativeAsciiCellSize(_patternScale) {
  return {
    width: ASCII_CELL_W * ASCII_SCREEN_SCALE,
    height: ASCII_CELL_H * ASCII_SCREEN_SCALE,
  };
}

/** Shader Lab Scale slider is locked for ASCII Art (fixed terminal grid). */
export function creativeLookAsciiFixedScale() {
  return 1;
}

/**
 * Blit VGA 8×16 into atlas at {@link ASCII_BAKE_SCALE}× (nearest), matching screen cell size.
 */
function bakeGlyph(ctx, ch, col, row, atlasW, atlasH) {
  const x = col * atlasW;
  const y = row * atlasH;
  ctx.fillStyle = '#000000';
  ctx.fillRect(x, y, atlasW, atlasH);
  blitVga8x16Glyph(ctx, ch, x, y, ASCII_BAKE_SCALE);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.charset]
 */
export function createAsciiFontAtlas(opts = {}) {
  const charset = opts.charset ?? ASCII_ART_CHARSET;
  // Keep duplicate code points — same glyph can sit in multiple density bands (e.g. dark `.` slots).
  const chars = [...charset];
  const count = chars.length;
  const cols = ASCII_ATLAS_COLS;
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = ASCII_CELL_W;
  const cellH = ASCII_CELL_H;
  const displayGlyphW = cellW * ASCII_SCREEN_SCALE;
  const displayGlyphH = cellH * ASCII_SCREEN_SCALE;
  const atlasGlyphW = cellW * ASCII_BAKE_SCALE;
  const atlasGlyphH = cellH * ASCII_BAKE_SCALE;

  const canvas = document.createElement('canvas');
  canvas.width = cols * atlasGlyphW;
  canvas.height = rows * atlasGlyphH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Ascii font atlas: 2D canvas unavailable');
  }

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    bakeGlyph(ctx, chars[i], col, row, atlasGlyphW, atlasGlyphH);
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
    bakeScale: ASCII_BAKE_SCALE,
    /** @deprecated use atlasGlyphW / cellGlyphW */
    glyphW: atlasGlyphW,
    /** @deprecated use atlasGlyphH / cellGlyphH */
    glyphH: atlasGlyphH,
    cols,
    rows,
  };
}

/** @type {ReturnType<typeof createAsciiFontAtlas> | null} */
let sharedAsciiFontAtlas = null;
/** @type {Promise<ReturnType<typeof createAsciiFontAtlas>> | null} */
let geistAtlasPromise = null;
/** @type {number} */
let loadedAtlasVersion = -1;

export function getSharedAsciiFontAtlas() {
  if (!sharedAsciiFontAtlas || loadedAtlasVersion !== ASCII_ATLAS_VERSION) {
    sharedAsciiFontAtlas?.texture?.dispose?.();
    sharedAsciiFontAtlas = createAsciiFontAtlas();
    loadedAtlasVersion = ASCII_ATLAS_VERSION;
    geistAtlasPromise = null;
    void ensureAsciiFontAtlasLoaded();
  }
  return sharedAsciiFontAtlas;
}

/** Rebuild atlas when version changes (VGA bitmap is synchronous — no webfont wait). */
export function ensureAsciiFontAtlasLoaded() {
  if (geistAtlasPromise && loadedAtlasVersion === ASCII_ATLAS_VERSION) {
    return geistAtlasPromise;
  }
  geistAtlasPromise = Promise.resolve().then(() => {
    const next = createAsciiFontAtlas();
    sharedAsciiFontAtlas?.texture?.dispose?.();
    sharedAsciiFontAtlas = next;
    loadedAtlasVersion = ASCII_ATLAS_VERSION;
    return next;
  });
  return geistAtlasPromise;
}

/** Mesh prepass — encodes form density (R) + view-facing (G) for the ASCII post pass. */
export const ASCII_LUMINANCE_PREP_FRAGMENT = /* glsl */ `
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

  // Fixed terminal key — aesthetic portrait light, not the studio rig.
  const vec3 TERMINAL_KEY = normalize(vec3(0.38, 0.88, 0.38));
  const float CEL_LIGHT = 7.0;
  const float CEL_VIEW = 6.0;

  float ndl = max(dot(qN, TERMINAL_KEY), 0.0);
  float ndv = max(dot(qN, V), 0.0);

  float lightBand = floor(ndl * CEL_LIGHT + 0.001) / max(CEL_LIGHT - 1.0, 1.0);
  float viewBand = floor(ndv * CEL_VIEW + 0.001) / max(CEL_VIEW - 1.0, 1.0);

  // Light defines mass; view-facing suppresses cavity/silhouette (depth read).
  float form = lightBand * mix(0.18, 1.0, viewBand);

  // Mild view-space depth punch — nearer surfaces read slightly more solid.
  vec3 viewPos = (viewMatrix * vec4(vWorldPosition, 1.0)).xyz;
  float depthNorm = clamp(-viewPos.z * 0.045, 0.0, 1.0);
  form *= mix(0.8, 1.0, depthNorm);

  form = pow(clamp(form, 0.0, 1.0), 1.2);
  form = smoothstep(0.03, 0.88, form);

  // R = solid fill, G = view-facing, B = mesh mask for post pass.
  gl_FragColor = vec4(form, ndv, 1.0, uOpacity * mapAlpha);
}
`;

export const ASCII_POST_FRAGMENT = /* glsl */ `
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

// Recess → sparse charset head + faint ink; solid form → dense tail + full ink.
const float ASCII_FORM_EMPTY = 0.06;
const float ASCII_FORM_FULL = 0.72;
const float ASCII_INK_FLOOR = 0.25;
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

  // Form from prepass; view-facing refines solid read on frontal planes.
  float solid = form * mix(0.7, 1.0, smoothstep(0.12, 0.92, ndv));
  solid = smoothstep(ASCII_FORM_EMPTY, ASCII_FORM_FULL, solid);

  // Charset is ink-fill sorted: low index = sparse punct, high = dense symbols.
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
    ASCII_INK_FLOOR,
    ASCII_INK_CEIL,
    smoothstep(0.0, 0.68, solid)
  );
  vec3 ink = applyAsciiMasterHue(uInkColor) * inkStrength;
  gl_FragColor = vec4(ink, 1.0);
}
`;

/** @deprecated Mesh no longer samples glyphs — kept for export symmetry. */
export const ASCII_ART_FRAGMENT = ASCII_LUMINANCE_PREP_FRAGMENT;

/** Background token for ASCII pass (re-export for callers). */
export const ASCII_ART_BG_HEX = parseInt(APP_BACKGROUND.slice(1), 16);
