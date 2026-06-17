import {
  CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL,
  CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL,
} from './creativeLookInkArt.js';
import {
  SKETCH_INK_WOBBLE,
  SKETCH_OUTLINE_ANIM_AMP,
  SKETCH_OUTLINE_ANIM_FPS,
  SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO,
  SKETCH_PAPER_RGB,
  SKETCH_SHADOW_BLACK_RGB,
  SKETCH_VIEW_RIM_POWER,
  SKETCH_VIEW_RIM_POST,
} from './creativeLookSketchArt.js';

/** Warm off-white poster paper — same studio backdrop as Sketch family. */
export { SKETCH_PAPER_HEX } from './creativeLookSketchArt.js';

/** Mesh prepass — hard flat light bands (opaque poster paint). */
export const GOUACHE_LIGHT_BANDS = 5;
export const GOUACHE_SHADE_FLOOR = 0.72;
export const GOUACHE_SHADE_CEIL = 1.05;
export const GOUACHE_BAND_INK_STRENGTH = 0.18;
export const GOUACHE_SATURATION_BOOST = 1.14;
export const GOUACHE_VIEW_RIM_MESH = 0.18;

/** Post — flat poster blocks + matte chalk grain. */
export const GOUACHE_POST_BANDS = 4;
export const GOUACHE_CONTRAST_PIVOT = 0.36;
export const GOUACHE_CONTRAST_EXP = 1.38;
export const GOUACHE_POST_BAND_INK = 0.24;
export const GOUACHE_MATTTE_CHALK = 0.072;
export const GOUACHE_CHALK_FINE_SCALE = 720.0;
export const GOUACHE_CHALK_MICRO_SCALE = 96.0;
export const GOUACHE_HIGHLIGHT_DESAT = 0.9;
export const GOUACHE_OVERLAP_DARKEN = 0.9;
export const GOUACHE_CHROMA_EDGE_WEIGHT = 0.52;

/** Ink outline — comic poster strokes. */
export const GOUACHE_INK_EDGE_LOW = 0.012;
export const GOUACHE_INK_EDGE_HIGH = 0.3;
export const GOUACHE_INK_STRENGTH = 1.38;
export const GOUACHE_INK_WOBBLE = SKETCH_INK_WOBBLE * 0.85;

/** Shader Lab Scale bounds — matches global slider (0.02–5). */
export const GOUACHE_PATTERN_SCALE_MIN = 0.02;
export const GOUACHE_PATTERN_SCALE_MAX = 5;

/** Post ink width @ min / max Scale (Sketch Stroke Width floor is 0.2). */
export const GOUACHE_INK_WIDTH_MIN = 0.18;
export const GOUACHE_INK_WIDTH_MAX = 2.2;

/** Edge dilation — thinner than Sketch so min Scale can read as fine pen. */
export const GOUACHE_INK_DILATE_MIN = 0.72;
export const GOUACHE_INK_DILATE_MAX = 1.42;

/** Silhouette ink boost — lighter than Sketch so outer contour stays delicate. */
export const GOUACHE_SILHOUETTE_EDGE = 1.22;

/** @param {number | undefined} patternScale */
export function normalizeCreativeLookGouachePatternScale(patternScale) {
  const ps = Number(patternScale);
  if (!Number.isFinite(ps)) return 1;
  return Math.max(GOUACHE_PATTERN_SCALE_MIN, Math.min(GOUACHE_PATTERN_SCALE_MAX, ps));
}

/** 0–1 across Shader Lab Scale slider. */
export function creativeLookGouacheScaleT(patternScale) {
  const ps = normalizeCreativeLookGouachePatternScale(patternScale);
  return (ps - GOUACHE_PATTERN_SCALE_MIN)
    / (GOUACHE_PATTERN_SCALE_MAX - GOUACHE_PATTERN_SCALE_MIN);
}

/**
 * Clip-space wobble divisor — gentler than Watercolour; Scale still widens blocks & ink.
 * @param {number} patternScale
 */
export function creativeGouacheWobbleScale(patternScale) {
  const t = creativeLookGouacheScaleT(patternScale);
  return 240 - t * 80;
}

/**
 * Vertex drift — light hand-painted wobble.
 * @param {number} patternScale
 */
export function creativeGouacheVertexDrift(patternScale) {
  const t = creativeLookGouacheScaleT(patternScale);
  return 0.32 + t * 0.38;
}

/**
 * Edge-collapse decimation — between Watercolour and Sketch.
 * @param {number} patternScale
 */
export function creativeGouacheMergeFactor(patternScale) {
  const t = creativeLookGouacheScaleT(patternScale);
  return 1.0 + t * 0.72;
}

/** @param {number} patternScale */
export function creativeLookGouacheInkWidth(patternScale) {
  const t = creativeLookGouacheScaleT(patternScale);
  return GOUACHE_INK_WIDTH_MIN + t * (GOUACHE_INK_WIDTH_MAX - GOUACHE_INK_WIDTH_MIN);
}

/** @param {number} patternScale */
export function creativeLookGouacheInkDilate(patternScale) {
  const t = creativeLookGouacheScaleT(patternScale);
  return GOUACHE_INK_DILATE_MIN + t * (GOUACHE_INK_DILATE_MAX - GOUACHE_INK_DILATE_MIN);
}

/** @param {number} patternScale */
export function creativeLookGouacheGrainScale(patternScale) {
  const t = creativeLookGouacheScaleT(patternScale);
  return 0.85 + t * 1.35;
}

const GOUACHE_GLSL_CORE = /* glsl */ `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 PAPER = vec3(${SKETCH_PAPER_RGB.map((v) => v.toFixed(6)).join(', ')});
const vec3 SHADOW = vec3(${SKETCH_SHADOW_BLACK_RGB.map((v) => v.toFixed(6)).join(', ')});

float luma(vec3 c) {
  return dot(c, LUMA);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float hash22(vec2 p) {
  return fract(sin(dot(p, vec2(39.3468, 11.1355))) * 22578.1459);
}

float gouacheContrast(float lum, float crush) {
  float centered = lum - ${GOUACHE_CONTRAST_PIVOT.toFixed(4)};
  float shaped = centered * mix(1.0, ${GOUACHE_CONTRAST_EXP.toFixed(4)}, crush);
  return clamp(shaped + ${GOUACHE_CONTRAST_PIVOT.toFixed(4)}, 0.0, 1.0);
}

float gouacheBands(float lum, float crush, float bandCount) {
  float c = gouacheContrast(lum, crush);
  float b = max(bandCount, 2.0);
  return floor(c * b + 0.001) / max(b - 1.0, 1.0);
}

float postBandInk(float lum, float crush, float bandCount) {
  float c = gouacheContrast(lum, crush);
  float edge = abs(fract(c * bandCount - 0.001) - 0.5) * 2.0;
  return smoothstep(0.88, 1.0, edge);
}

float chalkGrain(vec2 uv, float grainScale) {
  vec2 p = uv * grainScale;
  float fineF =
    hash21(p * ${GOUACHE_CHALK_FINE_SCALE.toFixed(1)}) * 0.55
    + hash22(p * ${(GOUACHE_CHALK_FINE_SCALE * 1.21).toFixed(1)} + 2.1) * 0.28
    + hash21(p * ${(GOUACHE_CHALK_FINE_SCALE * 1.88).toFixed(1)} + 4.3) * 0.17;
  vec2 micCell = floor(p * ${GOUACHE_CHALK_MICRO_SCALE.toFixed(1)}) + floor(p.yx * 6.0) * 0.17;
  float hMic = hash21(micCell);
  float dust = smoothstep(0.78, 0.94, hMic);
  float sparkle = (hash22(p * ${(GOUACHE_CHALK_FINE_SCALE * 2.4).toFixed(1)}) - 0.5) * dust * 0.35;
  return (fineF - 0.5) * 2.0 + sparkle;
}

float gouacheNdv(vec4 tap) {
  return tap.a;
}

float objectPresence(vec4 tap) {
  if (tap.a >= 0.995) return 0.0;
  return clamp(tap.a, 0.0, 1.0);
}

float presenceTap(sampler2D tex, vec2 uv) {
  return objectPresence(texture2D(tex, uv));
}

float silhouetteEdge(sampler2D tex, vec2 uv, vec2 texel) {
  float c = presenceTap(tex, uv);
  float px = presenceTap(tex, uv + vec2(texel.x, 0.0));
  float nx = presenceTap(tex, uv - vec2(texel.x, 0.0));
  float py = presenceTap(tex, uv + vec2(0.0, texel.y));
  float ny = presenceTap(tex, uv - vec2(0.0, texel.y));
  return length(vec2(px - nx, py - ny));
}

float gouacheInkDilate() {
  return mix(
    ${GOUACHE_INK_DILATE_MIN.toFixed(2)},
    ${GOUACHE_INK_DILATE_MAX.toFixed(2)},
    smoothstep(${GOUACHE_INK_WIDTH_MIN.toFixed(2)}, 1.15, uInkWidthScale)
  );
}

float silhouetteEdgeThick(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 inkTexel = texel * uOutlinePxScale * uInkWidthScale;
  float e = silhouetteEdge(tex, uv, inkTexel);
  float dilate = gouacheInkDilate();
  vec2 o1 = inkTexel * dilate;
  vec2 o2 = inkTexel * dilate * 1.45;
  e = max(e, silhouetteEdge(tex, uv + vec2(o1.x, 0.0), texel));
  e = max(e, silhouetteEdge(tex, uv - vec2(o1.x, 0.0), texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(0.0, o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv - vec2(0.0, o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv + o1, texel));
  e = max(e, silhouetteEdge(tex, uv - o1, texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(o1.x, -o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(-o1.x, o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(o2.x, 0.0), texel) * 0.94);
  e = max(e, silhouetteEdge(tex, uv - vec2(o2.x, 0.0), texel) * 0.94);
  e = max(e, silhouetteEdge(tex, uv + vec2(0.0, o2.y), texel) * 0.94);
  e = max(e, silhouetteEdge(tex, uv - vec2(0.0, o2.y), texel) * 0.94);
  return e;
}

float viewRimOutline(float ndv, float pres) {
  float rim = pow(1.0 - clamp(ndv, 0.0, 1.0), ${SKETCH_VIEW_RIM_POWER.toFixed(2)});
  return smoothstep(0.04, 0.88, rim) * pres;
}

float edgeStrength(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 d = texel;
  vec3 rx =
    texture2D(tex, uv + vec2(d.x, 0.0)).rgb
    - texture2D(tex, uv - vec2(d.x, 0.0)).rgb;
  vec3 ry =
    texture2D(tex, uv + vec2(0.0, d.y)).rgb
    - texture2D(tex, uv - vec2(0.0, d.y)).rgb;
  float lumEdge = length(vec2(dot(rx, LUMA), dot(ry, LUMA)));
  float chromaEdge = length(vec2(length(rx), length(ry)));
  return max(lumEdge, chromaEdge * ${GOUACHE_CHROMA_EDGE_WEIGHT.toFixed(4)});
}

float edgeStrengthThick(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 inkTexel = texel * uOutlinePxScale * uInkWidthScale;
  float e = edgeStrength(tex, uv, inkTexel);
  float dilate = gouacheInkDilate();
  vec2 o1 = inkTexel * dilate;
  vec2 o2 = inkTexel * dilate * 1.45;
  e = max(e, edgeStrength(tex, uv + vec2(o1.x, 0.0), texel));
  e = max(e, edgeStrength(tex, uv - vec2(o1.x, 0.0), texel));
  e = max(e, edgeStrength(tex, uv + vec2(0.0, o1.y), texel));
  e = max(e, edgeStrength(tex, uv - vec2(0.0, o1.y), texel));
  e = max(e, edgeStrength(tex, uv + o1, texel));
  e = max(e, edgeStrength(tex, uv - o1, texel));
  e = max(e, edgeStrength(tex, uv + vec2(o1.x, -o1.y), texel));
  e = max(e, edgeStrength(tex, uv + vec2(-o1.x, o1.y), texel));
  e = max(e, edgeStrength(tex, uv + vec2(o2.x, 0.0), texel) * 0.9);
  e = max(e, edgeStrength(tex, uv - vec2(o2.x, 0.0), texel) * 0.9);
  e = max(e, edgeStrength(tex, uv + vec2(0.0, o2.y), texel) * 0.9);
  e = max(e, edgeStrength(tex, uv - vec2(0.0, o2.y), texel) * 0.9);
  return e;
}

float outlineAnimFrame() {
  return floor(uTime * ${SKETCH_OUTLINE_ANIM_FPS.toFixed(2)});
}

float inkWobble(vec2 uv) {
  float frame = outlineAnimFrame();
  float n = hash21(uv * 480.0 + frame * 9.41);
  return 1.0 - ${GOUACHE_INK_WOBBLE.toFixed(4)} + n * ${GOUACHE_INK_WOBBLE.toFixed(4)} * 2.0;
}

vec2 outlineAnimOffset(vec2 uv) {
  float frame = outlineAnimFrame();
  vec2 seed = uv * 118.0 + vec2(frame * 1.4142135624, frame * 0.6180339887);
  vec2 n = vec2(hash21(seed), hash22(seed + 3.7)) * 2.0 - 1.0;
  float amp = length(uTexelSize) * uOutlinePxScale * uInkWidthScale
    * ${SKETCH_OUTLINE_ANIM_AMP.toFixed(4)} * 0.72
    * mix(0.5, 1.0, clamp(uIntensity, 0.0, 1.0));
  return n * amp;
}

vec3 posterizeColour(vec3 base, float banded) {
  float lum = luma(base);
  float targetLum = mix(luma(SHADOW), luma(PAPER), banded);
  if (lum < 1e-4) {
    return mix(SHADOW, PAPER, banded);
  }
  vec3 col = base * (targetLum / lum);
  float outLum = luma(col);
  col = mix(vec3(outLum), col, ${GOUACHE_SATURATION_BOOST.toFixed(4)});
  col = mix(vec3(outLum), col, mix(1.0, ${GOUACHE_HIGHLIGHT_DESAT.toFixed(4)}, smoothstep(0.72, 0.98, banded)));
  return clamp(col, 0.0, 1.0);
}

${CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL}

${CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL}
`;

/** Mesh prepass — hard flat lit colormap + ndv in alpha. */
export const GOUACHE_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uOpacity;

void main() {
  vec3 baseCol = clamp(uTint, vec3(0.0), vec3(1.0));
  float mapAlpha = 1.0;
  if (uHasMap > 0.5) {
    vec2 uvAff = vTexAffine.xy / max(vTexAffine.z, 1e-5);
    vec4 mapSample = texture2D(uMap, uvAff);
    baseCol = mapSample.rgb;
    mapAlpha = mapSample.a;
  }

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);

  float bands = ${GOUACHE_LIGHT_BANDS.toFixed(1)};
  float stepped = floor(ndl * bands + 0.001) / max(bands - 1.0, 1.0);
  float shade = mix(${GOUACHE_SHADE_FLOOR.toFixed(2)}, ${GOUACHE_SHADE_CEIL.toFixed(2)}, stepped);
  float bandInk = abs(fract(ndl * bands - 0.001) - 0.5) * 2.0;
  shade *= 1.0 - smoothstep(0.86, 1.0, bandInk) * ${GOUACHE_BAND_INK_STRENGTH.toFixed(3)};

  vec3 col = baseCol * shade;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, ${GOUACHE_SATURATION_BOOST.toFixed(4)});

  float viewInk = smoothstep(0.0, 0.55, pow(1.0 - ndv, ${SKETCH_VIEW_RIM_POWER.toFixed(2)}));
  col *= 1.0 - viewInk * ${GOUACHE_VIEW_RIM_MESH.toFixed(4)};

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), min(ndv * uOpacity * mapAlpha, 0.99));
}
`;

/** Full-res composite — flat poster blocks + matte chalk + ink outlines. */
export const GOUACHE_COMPOSITE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uGrainScale;
uniform vec2 uTexelSize;
uniform float uOutlinePxScale;
uniform float uInkWidthScale;
uniform float uTime;

${GOUACHE_GLSL_CORE}

const float INK_EDGE_LOW = ${GOUACHE_INK_EDGE_LOW.toFixed(4)};
const float INK_EDGE_HIGH = ${GOUACHE_INK_EDGE_HIGH.toFixed(4)};
const float INK_STRENGTH = ${GOUACHE_INK_STRENGTH.toFixed(4)};
const float POST_BANDS = ${GOUACHE_POST_BANDS.toFixed(1)};
const float POST_BAND_INK = ${GOUACHE_POST_BAND_INK.toFixed(4)};
const float CHALK = ${GOUACHE_MATTTE_CHALK.toFixed(4)};
const float SIL_EDGE = ${GOUACHE_SILHOUETTE_EDGE.toFixed(4)};
const float VIEW_RIM = ${SKETCH_VIEW_RIM_POST.toFixed(4)};
const float OVERLAP = ${GOUACHE_OVERLAP_DARKEN.toFixed(4)};

void main() {
  vec4 srcTap = texture2D(tDiffuse, vUv);
  float pres = objectPresence(srcTap);
  if (pres < 0.01) {
    gl_FragColor = vec4(srcTap.rgb, 1.0);
    return;
  }

  float lum = luma(srcTap.rgb);
  float ndv = gouacheNdv(srcTap);
  vec3 src = srcTap.rgb;

  float inten = clamp(uIntensity, 0.0, 2.0);
  float crush = mix(0.32, 0.68, clamp(inten, 0.0, 1.0));
  if (inten > 1.0) {
    crush = mix(crush, 0.82, (inten - 1.0) * 0.65);
  }

  float banded = gouacheBands(lum, crush, POST_BANDS);
  vec3 col = posterizeColour(src, banded);

  float bandInk = postBandInk(lum, crush, POST_BANDS) * POST_BAND_INK;
  col = mix(col, resolveStrokeInk(col), bandInk * smoothstep(0.05, 0.35, pres));

  vec2 inkUv = vUv + outlineAnimOffset(vUv);
  float colorEdge = edgeStrengthThick(tDiffuse, inkUv, uTexelSize);
  float silEdge = silhouetteEdgeThick(tDiffuse, inkUv, uTexelSize);
  float viewEdge = viewRimOutline(ndv, pres);
  float edge = max(colorEdge, max(silEdge * SIL_EDGE, viewEdge * VIEW_RIM));

  float overlap = smoothstep(0.04, 0.22, colorEdge) * pres;
  col *= mix(1.0, OVERLAP, overlap * 0.55);

  float inkLine = smoothstep(INK_EDGE_LOW, INK_EDGE_HIGH, edge);
  float inkAmt = inkLine * INK_STRENGTH * inkWobble(vUv) * mix(0.7, 1.0, crush);
  inkAmt *= 0.6 + 0.4 * clamp(inten, 0.0, 1.0);
  inkAmt *= smoothstep(0.02, 0.4, pres + edge * 0.32);
  col = mix(col, resolveStrokeInk(col), clamp(inkAmt, 0.0, 1.0));

  float grain = chalkGrain(vUv, uGrainScale);
  float grainMask = smoothstep(0.06, 0.42, banded) * pres * (1.0 - inkAmt * 0.55);
  float chalkGain = clamp(uIntensity, 0.0, 2.0);
  col += vec3(grain * CHALK * grainMask * chalkGain);
  col -= vec3(grain * CHALK * 0.35 * grainMask * (1.0 - banded) * chalkGain);

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

export { SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO };
