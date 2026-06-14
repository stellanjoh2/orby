/** Warm off-white drawing paper — sketch backdrop and highlight fill. */
export const SKETCH_PAPER_RGB = [0.965, 0.948, 0.922];

/** Pencil / ink outlines — Orby black. */
export const SKETCH_INK_RGB = [8 / 255, 8 / 255, 8 / 255];

/** Deepest toon shadow — dark pencil gray (not pure black). */
export const SKETCH_SHADOW_BLACK_RGB = [0.14, 0.13, 0.12];

/** Scene clear while Sketch is active. */
export const SKETCH_PAPER_HEX = '#f5f2eb';

/** Mesh prepass — toon bands (higher floor = more paper in shadow shapes). */
export const SKETCH_LIGHT_BANDS = 5;
export const SKETCH_SHADE_FLOOR = 0.24;
export const SKETCH_SHADE_CEIL = 1.0;
/** Interior band-edge ink from mesh prepass. */
export const SKETCH_BAND_INK_STRENGTH = 0.28;

/** Post — stepped toon bands on scene luminance (no screen-space blocks). */
export const SKETCH_POST_BANDS = 6;
/** Crush midtones before banding (higher = harder B&W). */
export const SKETCH_CONTRAST_EXP = 1.72;
export const SKETCH_CONTRAST_PIVOT = 0.4;
/** Push dark bands toward shadow fill (1 = linear, >1 = heavier). */
export const SKETCH_SHADOW_PUSH = 1.1;
/** Ink at post toon-band boundaries. */
export const SKETCH_POST_BAND_INK = 0.3;

/** Screen-space ink outline (watercolour-style edge detect). */
export const SKETCH_INK_EDGE_LOW = 0.008;
export const SKETCH_INK_EDGE_HIGH = 0.36;
export const SKETCH_INK_STRENGTH = 1.28;
export const SKETCH_INK_WOBBLE = 0.1375;
/** Hand-drawn outline — low-FPS hold + per-frame jitter (cel / boing-boom animation). */
export const SKETCH_OUTLINE_ANIM_FPS = 15;
/** UV offset scale in dilated texel units @ intensity 1 (+25% vs prior). */
export const SKETCH_OUTLINE_ANIM_AMP = 1.5625;
/** Outline dilation radius in pixels — widens detected edges. */
export const SKETCH_INK_DILATE = 2.75;
/** Camera-facing rim — grazing/silhouette surfaces (mesh + post). */
export const SKETCH_VIEW_RIM_POWER = 2.65;
export const SKETCH_VIEW_RIM_MESH = 0.3;
export const SKETCH_VIEW_RIM_POST = 0.68;
/** Object-vs-paper silhouette boundary (angle-stable outer contour). */
export const SKETCH_SILHOUETTE_EDGE = 1.85;

/** Medium-tier DPR — sketch ink width stays constant vs render quality (Ultra = 2×). */
export const SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO = 1;

/** Car-paint-style micro flake — very fine, low amplitude (×1.5 vs prior tuning @ intensity 1). */
export const SKETCH_PAPER_GRAIN = 0.0495;
export const SKETCH_SHADOW_GRAIN = 0.063;
export const SKETCH_GRAIN_MICRO_SCALE = 220.0;
export const SKETCH_GRAIN_FINE_SCALE = 1680.0;

/** Rim accent — thin highlight stroke on lit edges. */
export const SKETCH_RIM_STRENGTH = 0.22;

/** Manga screentone — screen-space halftone dots on shadow bands. */
export const SKETCH_SCREENTONE_CELL_PX = 5.5;
/** Max dot radius (fraction of cell half-width) — capped below 0.5 so dots keep diamond gutters. */
export const SKETCH_SCREENTONE_DOT_RADIUS = 0.44;
/** Min dot radius at lightest screentone tone. */
export const SKETCH_SCREENTONE_DOT_MIN = 0.075;
/** Grid rotation (classic 45° manga halftone). */
export const SKETCH_SCREENTONE_ANGLE_RAD = Math.PI * 0.25;
/** Tone range where screentone fades in (1−banded). */
export const SKETCH_SCREENTONE_TONE_LOW = 0.05;
export const SKETCH_SCREENTONE_TONE_HIGH = 0.42;

/**
 * Shader Lab Scale bounds for Sketch — controls screentone pitch, ink width, and grain.
 * Global slider is 0.02–5×; below ~0.6× dots collapse to sub-pixel mush.
 * @ 1× → ~5.5 px halftone pitch; 0.6× ≈ 3.3 px; 2.8× ≈ 15 px.
 */
export const SKETCH_PATTERN_SCALE_MIN = 0.6;
export const SKETCH_PATTERN_SCALE_MAX = 2.8;

/** Stroke Width slider — finer lines allowed vs raster (screentone has a higher floor). */
export const SKETCH_STROKE_WIDTH_MIN = 0.2;
export const SKETCH_STROKE_WIDTH_MAX = SKETCH_PATTERN_SCALE_MAX;

/** @param {number | undefined} patternScale */
export function normalizeCreativeLookSketchPatternScale(patternScale) {
  const ps = Number(patternScale);
  if (!Number.isFinite(ps)) return 1;
  return Math.max(SKETCH_PATTERN_SCALE_MIN, Math.min(SKETCH_PATTERN_SCALE_MAX, ps));
}

export const SKETCH_STROKE_WIDTH_DEFAULT = 1;
export const SKETCH_RASTER_SIZE_DEFAULT = 1;
/** 0 = sketch effect off (replaces a dedicated on/off toggle). */
export const SKETCH_RASTER_SIZE_MIN = 0;
export const SKETCH_RASTER_SIZE_MAX = SKETCH_PATTERN_SCALE_MAX;

/** @param {number | undefined} value */
export function normalizeCreativeLookSketchStrokeWidth(value) {
  const ps = Number(value);
  if (!Number.isFinite(ps)) return SKETCH_STROKE_WIDTH_DEFAULT;
  return Math.max(SKETCH_STROKE_WIDTH_MIN, Math.min(SKETCH_STROKE_WIDTH_MAX, ps));
}

/** @param {number | undefined} value */
export function normalizeCreativeLookSketchRasterSize(value) {
  const rs = Number(value);
  if (!Number.isFinite(rs)) return SKETCH_RASTER_SIZE_DEFAULT;
  return Math.max(SKETCH_RASTER_SIZE_MIN, Math.min(SKETCH_RASTER_SIZE_MAX, rs));
}

/** @param {number | undefined} rasterSize */
export function isCreativeLookSketchRasterActive(rasterSize) {
  return normalizeCreativeLookSketchRasterSize(rasterSize) > 0;
}

/**
 * @param {object} [presetParams]
 * @param {number} [patternScaleFallback]
 */
export function resolveCreativeLookSketchParams(presetParams = {}, patternScaleFallback = 1) {
  const sk = presetParams?.sketch ?? {};
  const fb = normalizeCreativeLookSketchPatternScale(patternScaleFallback);
  return {
    strokeWidth: normalizeCreativeLookSketchStrokeWidth(
      Number.isFinite(Number(sk.strokeWidth)) ? Number(sk.strokeWidth) : fb,
    ),
    rasterSize: normalizeCreativeLookSketchRasterSize(
      Number.isFinite(Number(sk.rasterSize)) ? Number(sk.rasterSize) : fb,
    ),
  };
}

/**
 * Map raster size to fine grain frequency (larger scale = coarser pencil texture).
 * @param {number} rasterSize
 */
export function creativeLookSketchGrainScale(rasterSize) {
  const rs = normalizeCreativeLookSketchRasterSize(rasterSize);
  if (rs <= 0) return 0;
  const effective = Math.max(rs, SKETCH_PATTERN_SCALE_MIN);
  const t = (effective - SKETCH_PATTERN_SCALE_MIN) / (SKETCH_PATTERN_SCALE_MAX - SKETCH_PATTERN_SCALE_MIN);
  return 2.4 + t * 5.2;
}

/**
 * Clip-space wobble divisor — higher scale = stronger hand-drawn drift.
 * @param {number} patternScale
 */
export function creativeSketchWobbleScale(strokeWidth) {
  const ps = normalizeCreativeLookSketchStrokeWidth(strokeWidth);
  const t = (ps - SKETCH_STROKE_WIDTH_MIN) / (SKETCH_STROKE_WIDTH_MAX - SKETCH_STROKE_WIDTH_MIN);
  return 220 - t * 120;
}

/**
 * Vertex drift for mesh wobble (RETRO_CONSOLE-style).
 * @param {number} patternScale
 */
export function creativeSketchVertexDrift(strokeWidth) {
  const ps = normalizeCreativeLookSketchStrokeWidth(strokeWidth);
  const t = (ps - SKETCH_STROKE_WIDTH_MIN) / (SKETCH_STROKE_WIDTH_MAX - SKETCH_STROKE_WIDTH_MIN);
  return 0.45 + t * 0.65;
}

/**
 * Edge-collapse decimation — gentler than watercolour, sketchier silhouette.
 * @param {number} patternScale
 */
export function creativeSketchMergeFactor(strokeWidth) {
  const ps = normalizeCreativeLookSketchStrokeWidth(strokeWidth);
  const t = (ps - SKETCH_STROKE_WIDTH_MIN) / (SKETCH_STROKE_WIDTH_MAX - SKETCH_STROKE_WIDTH_MIN);
  return 1.08 + t * 0.72;
}

const SKETCH_GLSL_CORE = /* glsl */ `
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

float sketchContrast(float lum, float crush) {
  float centered = lum - ${SKETCH_CONTRAST_PIVOT.toFixed(4)};
  float shaped = centered * mix(1.0, ${SKETCH_CONTRAST_EXP.toFixed(4)}, crush);
  return clamp(shaped + ${SKETCH_CONTRAST_PIVOT.toFixed(4)}, 0.0, 1.0);
}

float sketchBands(float lum, float crush, float bandCount) {
  float c = sketchContrast(lum, crush);
  float b = max(bandCount, 2.0);
  float stepped = floor(c * b + 0.001) / max(b - 1.0, 1.0);
  return pow(stepped, 1.0 / ${SKETCH_SHADOW_PUSH.toFixed(4)});
}

float deepestShadow(float lum, float crush, float bandCount) {
  float c = sketchContrast(lum, crush);
  float b = max(bandCount, 2.0);
  return step(floor(c * b + 0.001), 0.5);
}

float carPaintGrain(vec2 uv, float grainScale) {
  vec2 p = uv * grainScale;
  float fineF =
    hash21(p * ${SKETCH_GRAIN_FINE_SCALE.toFixed(1)}) * 0.5
    + hash22(p * ${(SKETCH_GRAIN_FINE_SCALE * 1.37).toFixed(1)} + 1.7) * 0.25
    + hash21(p * ${(SKETCH_GRAIN_FINE_SCALE * 2.15).toFixed(1)} + 3.1) * 0.15
    + hash22(p * ${(SKETCH_GRAIN_FINE_SCALE * 2.88).toFixed(1)} + 5.3) * 0.1;
  vec2 micCell = floor(p * ${SKETCH_GRAIN_MICRO_SCALE.toFixed(1)}) + floor(p.yx * 8.0) * 0.13;
  float hMic = hash21(micCell);
  float microFlake = smoothstep(0.82, 0.96, hMic);
  float sparkle = (hash22(p * ${(SKETCH_GRAIN_FINE_SCALE * 3.6).toFixed(1)}) - 0.5) * microFlake;
  return (fineF - 0.5) * 2.0 + sparkle;
}

float postBandInk(float lum, float crush, float bandCount) {
  float c = sketchContrast(lum, crush);
  float edge = abs(fract(c * bandCount - 0.001) - 0.5) * 2.0;
  return smoothstep(0.86, 1.0, edge);
}

float sketchLum(vec4 tap) {
  return tap.r;
}

float sketchNdv(vec4 tap) {
  return tap.b;
}

float objectPresence(vec4 tap) {
  // Mesh prepass tags pixels with alpha < 1; studio backdrop/HDRI/gradient stay at 1.
  if (tap.a >= 0.995) return 0.0;
  return clamp(tap.a * 1.2, 0.0, 1.0);
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

float silhouetteEdgeThick(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 inkTexel = texel * uOutlinePxScale * uInkWidthScale;
  float e = silhouetteEdge(tex, uv, inkTexel);
  float dilate = ${SKETCH_INK_DILATE.toFixed(2)};
  vec2 o1 = inkTexel * dilate;
  vec2 o2 = inkTexel * dilate * 1.65;
  e = max(e, silhouetteEdge(tex, uv + vec2(o1.x, 0.0), texel));
  e = max(e, silhouetteEdge(tex, uv - vec2(o1.x, 0.0), texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(0.0, o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv - vec2(0.0, o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv + o1, texel));
  e = max(e, silhouetteEdge(tex, uv - o1, texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(o1.x, -o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(-o1.x, o1.y), texel));
  e = max(e, silhouetteEdge(tex, uv + vec2(o2.x, 0.0), texel) * 0.95);
  e = max(e, silhouetteEdge(tex, uv - vec2(o2.x, 0.0), texel) * 0.95);
  e = max(e, silhouetteEdge(tex, uv + vec2(0.0, o2.y), texel) * 0.95);
  e = max(e, silhouetteEdge(tex, uv - vec2(0.0, o2.y), texel) * 0.95);
  return e;
}

float viewRimOutline(float ndv, float pres) {
  float rim = pow(1.0 - clamp(ndv, 0.0, 1.0), ${SKETCH_VIEW_RIM_POWER.toFixed(2)});
  return smoothstep(0.04, 0.9, rim) * pres;
}

float edgeStrength(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 d = texel;
  float rx =
    texture2D(tex, uv + vec2(d.x, 0.0)).r
    - texture2D(tex, uv - vec2(d.x, 0.0)).r;
  float ry =
    texture2D(tex, uv + vec2(0.0, d.y)).r
    - texture2D(tex, uv - vec2(0.0, d.y)).r;
  return length(vec2(rx, ry));
}

float edgeStrengthThick(sampler2D tex, vec2 uv, vec2 texel) {
  vec2 inkTexel = texel * uOutlinePxScale * uInkWidthScale;
  float e = edgeStrength(tex, uv, inkTexel);
  float dilate = ${SKETCH_INK_DILATE.toFixed(2)};
  vec2 o1 = inkTexel * dilate;
  vec2 o2 = inkTexel * dilate * 1.65;
  e = max(e, edgeStrength(tex, uv + vec2(o1.x, 0.0), texel));
  e = max(e, edgeStrength(tex, uv - vec2(o1.x, 0.0), texel));
  e = max(e, edgeStrength(tex, uv + vec2(0.0, o1.y), texel));
  e = max(e, edgeStrength(tex, uv - vec2(0.0, o1.y), texel));
  e = max(e, edgeStrength(tex, uv + o1, texel));
  e = max(e, edgeStrength(tex, uv - o1, texel));
  e = max(e, edgeStrength(tex, uv + vec2(o1.x, -o1.y), texel));
  e = max(e, edgeStrength(tex, uv + vec2(-o1.x, o1.y), texel));
  e = max(e, edgeStrength(tex, uv + vec2(o2.x, 0.0), texel) * 0.92);
  e = max(e, edgeStrength(tex, uv - vec2(o2.x, 0.0), texel) * 0.92);
  e = max(e, edgeStrength(tex, uv + vec2(0.0, o2.y), texel) * 0.92);
  e = max(e, edgeStrength(tex, uv - vec2(0.0, o2.y), texel) * 0.92);
  return e;
}

float outlineAnimFrame() {
  return floor(uTime * ${SKETCH_OUTLINE_ANIM_FPS.toFixed(2)});
}

float inkWobble(vec2 uv) {
  float frame = outlineAnimFrame();
  float n = hash21(uv * 520.0 + frame * 11.73);
  return 1.0 - ${SKETCH_INK_WOBBLE.toFixed(4)} + n * ${SKETCH_INK_WOBBLE.toFixed(4)} * 2.0;
}

vec2 outlineAnimOffset(vec2 uv) {
  float frame = outlineAnimFrame();
  vec2 seed = uv * 136.0 + vec2(frame * 1.6180339887, frame * 0.7316888687);
  vec2 n = vec2(hash21(seed), hash22(seed + 4.17)) * 2.0 - 1.0;
  float amp = length(uTexelSize) * uOutlinePxScale * uInkWidthScale
    * ${SKETCH_OUTLINE_ANIM_AMP.toFixed(4)}
    * mix(0.5625, 1.0, clamp(uIntensity, 0.0, 1.0));
  return n * amp;
}

vec2 sketchScreenPx(vec2 uv) {
  return uv / max(uTexelSize, vec2(1e-6));
}

/** Manga halftone — 45° grid, one dot per cell; 3×3 nearest-center + fwidth AA (no jitter). */
float mangaScreentone(vec2 screenPx, float tone) {
  float t = clamp(tone, 0.0, 1.0);
  if (t < 0.015) {
    return 0.0;
  }
  float ang = ${SKETCH_SCREENTONE_ANGLE_RAD.toFixed(8)};
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  vec2 sc = rot * screenPx;
  float pitch = max(
    ${SKETCH_SCREENTONE_CELL_PX.toFixed(2)} * uOutlinePxScale * uRasterScale,
    2.5
  );
  vec2 g = sc / pitch;
  vec2 f = fract(g);
  float dist = 1e5;
  for (int jy = -1; jy <= 1; jy++) {
    for (int jx = -1; jx <= 1; jx++) {
      vec2 c = vec2(float(jx), float(jy)) + f - 0.5;
      dist = min(dist, length(c));
    }
  }
  float rMax = ${SKETCH_SCREENTONE_DOT_RADIUS.toFixed(4)};
  float rMin = ${SKETCH_SCREENTONE_DOT_MIN.toFixed(4)};
  float r = mix(rMin, rMax, sqrt(t));
  float aa = max(fwidth(dist) * 0.85, 0.004);
  return 1.0 - smoothstep(r - aa, r + aa, dist);
}
`;

/** Mesh prepass — harsh B&W toon bands; packs view-facing ndv in blue for post outlines. */
export const SKETCH_FRAGMENT = /* glsl */ `
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
  float bands = ${SKETCH_LIGHT_BANDS.toFixed(1)};
  float stepped = floor(ndl * bands + 0.001) / max(bands - 1.0, 1.0);
  float shade = mix(${SKETCH_SHADE_FLOOR.toFixed(2)}, ${SKETCH_SHADE_CEIL.toFixed(2)}, stepped);
  float bandInk = abs(fract(ndl * bands - 0.001) - 0.5) * 2.0;
  shade *= 1.0 - smoothstep(0.82, 1.0, bandInk) * ${SKETCH_BAND_INK_STRENGTH.toFixed(3)};

  vec3 paper = vec3(${SKETCH_PAPER_RGB.map((v) => v.toFixed(6)).join(', ')});
  vec3 shadow = vec3(${SKETCH_SHADOW_BLACK_RGB.map((v) => v.toFixed(6)).join(', ')});
  vec3 col = mix(shadow, paper, shade);

  float viewInk = smoothstep(0.0, 0.58, pow(1.0 - ndv, ${SKETCH_VIEW_RIM_POWER.toFixed(2)}));
  col = mix(col, shadow, viewInk * ${SKETCH_VIEW_RIM_MESH.toFixed(2)});

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(lum, lum, ndv, min(uOpacity * mapAlpha, 0.99));
}
`;

/** Full-res composite — toon shadow bands + ink outline + car-paint grain. */
export const SKETCH_COMPOSITE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uIntensity;
uniform float uGrainScale;
uniform vec2 uTexelSize;
uniform float uOutlinePxScale;
uniform float uInkWidthScale;
uniform float uRasterScale;
uniform float uTime;
uniform vec3 uStrokeColor;

${SKETCH_GLSL_CORE}

const float INK_EDGE_LOW = ${SKETCH_INK_EDGE_LOW.toFixed(4)};
const float INK_EDGE_HIGH = ${SKETCH_INK_EDGE_HIGH.toFixed(4)};
const float INK_STRENGTH = ${SKETCH_INK_STRENGTH.toFixed(4)};
const float POST_BANDS = ${SKETCH_POST_BANDS.toFixed(1)};
const float POST_BAND_INK = ${SKETCH_POST_BAND_INK.toFixed(4)};
const float PAPER_GRAIN = ${SKETCH_PAPER_GRAIN.toFixed(4)};
const float SHADOW_GRAIN = ${SKETCH_SHADOW_GRAIN.toFixed(4)};
const float RIM = ${SKETCH_RIM_STRENGTH.toFixed(4)};
const float SIL_EDGE = ${SKETCH_SILHOUETTE_EDGE.toFixed(4)};
const float VIEW_RIM = ${SKETCH_VIEW_RIM_POST.toFixed(4)};
const float SCREENTONE_TONE_LOW = ${SKETCH_SCREENTONE_TONE_LOW.toFixed(4)};
const float SCREENTONE_TONE_HIGH = ${SKETCH_SCREENTONE_TONE_HIGH.toFixed(4)};

void main() {
  vec4 srcTap = texture2D(tDiffuse, vUv);
  float pres = objectPresence(srcTap);
  if (pres < 0.01) {
    gl_FragColor = vec4(srcTap.rgb, 1.0);
    return;
  }
  float lum = sketchLum(srcTap);
  float ndv = sketchNdv(srcTap);

  float inten = clamp(uIntensity, 0.0, 2.0);
  float crush = mix(0.42, 0.82, clamp(inten, 0.0, 1.0));
  if (inten > 1.0) {
    crush = mix(crush, 0.92, (inten - 1.0) * 0.75);
  }

  float banded = sketchBands(lum, crush, POST_BANDS);
  float deepShadow = deepestShadow(lum, crush, POST_BANDS);

  vec3 col = mix(SHADOW, PAPER, banded);

  float bandInk = postBandInk(lum, crush, POST_BANDS) * POST_BAND_INK * mix(0.75, 1.0, crush);
  col = mix(col, uStrokeColor, bandInk * smoothstep(0.05, 0.35, pres) * (1.0 - deepShadow));

  vec2 inkUv = vUv + outlineAnimOffset(vUv);
  float colorEdge = edgeStrengthThick(tDiffuse, inkUv, uTexelSize);
  float silEdge = silhouetteEdgeThick(tDiffuse, inkUv, uTexelSize);
  float viewEdge = viewRimOutline(ndv, pres);
  float edge = max(colorEdge, max(silEdge * SIL_EDGE, viewEdge * VIEW_RIM));

  float inkLine = smoothstep(INK_EDGE_LOW, INK_EDGE_HIGH, edge);
  float inkAmt = inkLine * INK_STRENGTH * inkWobble(vUv) * mix(0.75, 1.0, crush);
  inkAmt *= 0.65 + 0.35 * clamp(inten, 0.0, 1.0);
  inkAmt *= smoothstep(0.02, 0.42, pres + edge * 0.35);
  col = mix(col, uStrokeColor, clamp(inkAmt, 0.0, 1.0));

  float rim = smoothstep(0.72, 0.98, banded) * smoothstep(0.02, 0.14, edge) * RIM;
  col = mix(col, PAPER, rim * (1.0 - inkAmt * 0.65));

  float grain = carPaintGrain(vUv, uGrainScale);
  float grainMask = smoothstep(0.08, 0.28, banded) * smoothstep(0.05, 0.4, pres);
  float grainGain = clamp(uIntensity, 0.0, 2.0);
  col += vec3(grain * PAPER_GRAIN * grainMask * grainGain);
  col += vec3(grain * SHADOW_GRAIN * grainMask * (1.0 - banded) * grainGain);

  vec2 screenPx = sketchScreenPx(vUv);
  float shadowTone = clamp(1.0 - banded, 0.0, 1.0);
  shadowTone = max(shadowTone, deepShadow * 0.88);
  float screentoneDot = mangaScreentone(screenPx, shadowTone);
  float screentoneMask = smoothstep(SCREENTONE_TONE_LOW, SCREENTONE_TONE_HIGH, shadowTone);
  screentoneMask *= pres * (1.0 - inkAmt * 0.72);
  screentoneMask *= mix(0.55, 1.0, clamp(inten, 0.0, 1.0));
  vec3 screentoneCol = mix(PAPER, uStrokeColor, screentoneDot);
  col = mix(col, screentoneCol, clamp(screentoneMask, 0.0, 1.0));

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
