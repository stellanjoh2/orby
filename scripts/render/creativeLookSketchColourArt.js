import {
  CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL,
  CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL,
} from './creativeLookInkArt.js';
import {
  SKETCH_BAND_INK_STRENGTH,
  SKETCH_CONTRAST_EXP,
  SKETCH_CONTRAST_PIVOT,
  SKETCH_GRAIN_FINE_SCALE,
  SKETCH_GRAIN_MICRO_SCALE,
  SKETCH_INK_DILATE,
  SKETCH_INK_EDGE_HIGH,
  SKETCH_INK_EDGE_LOW,
  SKETCH_INK_STRENGTH,
  SKETCH_INK_WOBBLE,
  SKETCH_LIGHT_BANDS,
  SKETCH_OUTLINE_ANIM_AMP,
  SKETCH_OUTLINE_ANIM_FPS,
  SKETCH_PAPER_GRAIN,
  SKETCH_PAPER_RGB,
  SKETCH_POST_BANDS,
  SKETCH_POST_BAND_INK,
  SKETCH_RIM_STRENGTH,
  SKETCH_SCREENTONE_ANGLE_RAD,
  SKETCH_SCREENTONE_CELL_PX,
  SKETCH_SCREENTONE_DOT_MIN,
  SKETCH_SCREENTONE_DOT_RADIUS,
  SKETCH_SCREENTONE_TONE_HIGH,
  SKETCH_SCREENTONE_TONE_LOW,
  SKETCH_SHADOW_GRAIN,
  SKETCH_SHADOW_PUSH,
  SKETCH_SHADE_CEIL,
  SKETCH_SHADE_FLOOR,
  SKETCH_SHADOW_BLACK_RGB,
  SKETCH_SILHOUETTE_EDGE,
  SKETCH_VIEW_RIM_MESH,
  SKETCH_VIEW_RIM_POST,
  SKETCH_VIEW_RIM_POWER,
  SKETCH_PATTERN_SCALE_MAX,
  SKETCH_PATTERN_SCALE_MIN,
  normalizeCreativeLookSketchRasterSize,
} from './creativeLookSketchArt.js';
import {
  WATERCOLOUR_BAND_INK_STRENGTH,
  WATERCOLOUR_LIGHT_BANDS,
  WATERCOLOUR_PASS_RESOLUTION_SCALE,
  WATERCOLOUR_PREPASS_SOFT_BLEND,
  WATERCOLOUR_SHADE_CEIL,
  WATERCOLOUR_SHADE_FLOOR,
  WATERCOLOUR_TEXEL_SCALE,
} from './creativeLookWatercolourArt.js';

export { SKETCH_PAPER_HEX } from './creativeLookSketchArt.js';
export {
  resolveCreativeLookSketchParams,
  normalizeCreativeLookSketchStrokeWidth,
  normalizeCreativeLookSketchRasterSize,
  creativeLookSketchGrainScale,
  creativeSketchWobbleScale,
  creativeSketchVertexDrift,
  creativeSketchMergeFactor,
} from './creativeLookSketchArt.js';

export { SKETCH_OUTLINE_REFERENCE_PIXEL_RATIO } from './creativeLookSketchArt.js';

/** Half-res Kuwahara wash — same resolution scale as Watercolour. */
export const SKETCH_COLOUR_PASS_RESOLUTION_SCALE = WATERCOLOUR_PASS_RESOLUTION_SCALE;

/** Watercolour-style colormap ink on coloured strokes. */
export const SKETCH_COLOUR_INK_PAINT_BLEND = 0.48;
export const SKETCH_COLOUR_CHROMA_EDGE_WEIGHT = 0.42;
/** Kuwahara wash mix @ intensity 1 (sharp marks vs soft fill). */
export const SKETCH_COLOUR_WASH_MIX = 0.58;
export const SKETCH_COLOUR_WASH_GAIN = 1.06;

/** @param {number} rasterSize */
export function creativeLookSketchColourWashRadius(rasterSize) {
  const rs = normalizeCreativeLookSketchRasterSize(rasterSize);
  if (rs <= 0) return 0;
  const t = (rs - SKETCH_PATTERN_SCALE_MIN) / (SKETCH_PATTERN_SCALE_MAX - SKETCH_PATTERN_SCALE_MIN);
  return 2.8 + t * 4.2;
}

const SKETCH_COLOUR_GLSL_CORE = /* glsl */ `
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

float sketchNdv(vec4 tap) {
  return tap.a;
}

float sketchLum(vec4 tap) {
  return luma(tap.rgb);
}

float objectPresence(vec4 tap) {
  // Mesh prepass tags pixels with alpha < 1; studio backdrop/HDRI/gradient stay at 1.
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
  vec3 rx =
    texture2D(tex, uv + vec2(d.x, 0.0)).rgb
    - texture2D(tex, uv - vec2(d.x, 0.0)).rgb;
  vec3 ry =
    texture2D(tex, uv + vec2(0.0, d.y)).rgb
    - texture2D(tex, uv - vec2(0.0, d.y)).rgb;
  float lumEdge = length(vec2(dot(rx, LUMA), dot(ry, LUMA)));
  float chromaEdge = length(vec2(length(rx), length(ry)));
  return max(lumEdge, chromaEdge * ${SKETCH_COLOUR_CHROMA_EDGE_WEIGHT.toFixed(4)});
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

vec3 applyLumaBands(vec3 base, float banded) {
  float lum = luma(base);
  float targetLum = mix(luma(SHADOW), luma(PAPER), banded);
  if (lum < 1e-4) {
    return mix(SHADOW, PAPER, banded);
  }
  vec3 col = base * (targetLum / lum);
  col = mix(col, mix(col, PAPER, 0.28), smoothstep(0.74, 0.98, banded));
  return clamp(col, 0.0, 1.0);
}

${CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL}

${CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL}
`;

/** Mesh prepass — soft lit colormap (watercolour-style) + ndv in alpha. */
export const SKETCH_COLOUR_FRAGMENT = /* glsl */ `
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

  float bands = ${WATERCOLOUR_LIGHT_BANDS.toFixed(1)};
  float stepped = floor(ndl * bands) / max(bands - 1.0, 1.0);
  float wrap = smoothstep(0.0, 1.0, ndl * 0.32 + 0.68);
  float shadeT = mix(stepped, wrap, ${WATERCOLOUR_PREPASS_SOFT_BLEND.toFixed(2)});
  float shade = mix(${WATERCOLOUR_SHADE_FLOOR.toFixed(2)}, ${WATERCOLOUR_SHADE_CEIL.toFixed(2)}, shadeT);
  float bandInk = abs(fract(ndl * bands - 0.001) - 0.5) * 2.0;
  shade *= 1.0 - smoothstep(0.84, 1.0, bandInk) * ${WATERCOLOUR_BAND_INK_STRENGTH.toFixed(3)};

  vec3 col = baseCol * shade;

  float viewInk = smoothstep(0.0, 0.58, pow(1.0 - ndv, ${SKETCH_VIEW_RIM_POWER.toFixed(2)}));
  col *= 1.0 - viewInk * ${(SKETCH_VIEW_RIM_MESH * 0.55).toFixed(4)};

  gl_FragColor = vec4(col, min(ndv * uOpacity * mapAlpha, 0.99));
}
`;

/** Full-res composite — sketch ink + screentone on Kuwahara-washed colour. */
export const SKETCH_COLOUR_COMPOSITE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tPaint;
uniform float uIntensity;
uniform float uGrainScale;
uniform vec2 uTexelSize;
uniform float uOutlinePxScale;
uniform float uInkWidthScale;
uniform float uRasterScale;
uniform float uTime;

${SKETCH_COLOUR_GLSL_CORE}

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
const float WASH_MIX = ${SKETCH_COLOUR_WASH_MIX.toFixed(4)};
const float WASH_GAIN = ${SKETCH_COLOUR_WASH_GAIN.toFixed(4)};
const float INK_PAINT_BLEND = ${SKETCH_COLOUR_INK_PAINT_BLEND.toFixed(4)};

void main() {
  vec4 srcTap = texture2D(tDiffuse, vUv);
  float pres = objectPresence(srcTap);
  if (pres < 0.01) {
    gl_FragColor = vec4(srcTap.rgb, 1.0);
    return;
  }
  float lum = sketchLum(srcTap);
  float ndv = sketchNdv(srcTap);
  vec3 src = srcTap.rgb;
  vec3 painted = texture2D(tPaint, vUv).rgb;

  float inten = clamp(uIntensity, 0.0, 2.0);
  float crush = mix(0.42, 0.82, clamp(inten, 0.0, 1.0));
  if (inten > 1.0) {
    crush = mix(crush, 0.92, (inten - 1.0) * 0.75);
  }

  float washAmt = WASH_MIX * min(inten, 1.0);
  vec3 baseCol = mix(src, painted, washAmt) * WASH_GAIN;

  float banded = sketchBands(lum, crush, POST_BANDS);
  float deepShadow = deepestShadow(lum, crush, POST_BANDS);

  vec3 col = applyLumaBands(baseCol, banded);

  float bandInk = postBandInk(lum, crush, POST_BANDS) * POST_BAND_INK * mix(0.75, 1.0, crush);
  vec3 bandInkCol = resolveStrokeInk(baseCol);
  col = mix(col, bandInkCol, bandInk * smoothstep(0.05, 0.35, pres) * (1.0 - deepShadow));

  vec2 inkUv = vUv + outlineAnimOffset(vUv);
  float colorEdge = edgeStrengthThick(tDiffuse, inkUv, uTexelSize);
  float silEdge = silhouetteEdgeThick(tDiffuse, inkUv, uTexelSize);
  float viewEdge = viewRimOutline(ndv, pres);
  float edge = max(colorEdge, max(silEdge * SIL_EDGE, viewEdge * VIEW_RIM));

  float inkLine = smoothstep(INK_EDGE_LOW, INK_EDGE_HIGH, edge);
  float inkAmt = inkLine * INK_STRENGTH * inkWobble(vUv) * mix(0.75, 1.0, crush);
  inkAmt *= 0.65 + 0.35 * clamp(inten, 0.0, 1.0);
  inkAmt *= smoothstep(0.02, 0.42, pres + edge * 0.35);
  vec3 inkLocal = mix(src, painted, INK_PAINT_BLEND);
  vec3 inkColor = resolveStrokeInk(inkLocal);
  col = mix(col, inkColor, clamp(inkAmt, 0.0, 1.0));

  float rim = smoothstep(0.72, 0.98, banded) * smoothstep(0.02, 0.14, edge) * RIM;
  col = mix(col, mix(col, PAPER, 0.45), rim * (1.0 - inkAmt * 0.65));

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
  vec3 screentoneCol = mix(col, resolveStrokeInk(col), screentoneDot);
  col = mix(col, screentoneCol, clamp(screentoneMask, 0.0, 1.0));

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
