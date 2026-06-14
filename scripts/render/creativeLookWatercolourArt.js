/**
 * Loop bound for Kuwahara (fixed for WebGL). Kernel reach is widened via `uTexelScale`
 * so we avoid radius 12²×4×2 samples per pixel.
 */
import {
  CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL,
  CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL,
} from './creativeLookInkArt.js';

export const KUWAHARA_MAX_RADIUS = 8;

/** Default kernel radius at pattern scale 1.0 (half-res paint pass). */
export const WATERCOLOUR_DEFAULT_RADIUS = 4;

/** Widen each tap in screen space without extra loop iterations. */
export const WATERCOLOUR_TEXEL_SCALE = 1.7;

/** Kuwahara paint buffer — half-res for soft wash; composite is full-res + edge carve. */
export const WATERCOLOUR_PASS_RESOLUTION_SCALE = 0.5;

/** Hybrid prepass — soft wrap blended with light stepped bands. */
export const WATERCOLOUR_SHADE_FLOOR = 0.86;
export const WATERCOLOUR_SHADE_CEIL = 1.1;
export const WATERCOLOUR_LIGHT_BANDS = 3;
/** 0 = stepped only, 1 = smooth wrap only. */
export const WATERCOLOUR_PREPASS_SOFT_BLEND = 0.42;

/** Edge carve — only strong gradients pull back toward the sharp source. */
export const WATERCOLOUR_EDGE_LOW = 0.055;
export const WATERCOLOUR_EDGE_HIGH = 0.22;
export const WATERCOLOUR_CRISP_EDGE_STRENGTH = 0.58;

/** Specular peaks — lighter reinjection than full edge carve. */
export const WATERCOLOUR_SPEC_LOW = 0.78;
export const WATERCOLOUR_SPEC_HIGH = 0.94;
export const WATERCOLOUR_CRISP_SPEC_STRENGTH = 0.36;

/** Comic ink outline — post-process line art (Delphine Decuyper–style NPR). */
/** @deprecated Stroke colour comes from local colormap — kept for docs / fallback floor. */
export const WATERCOLOUR_INK_RGB = [8 / 255, 8 / 255, 8 / 255];
/** Narrower smoothstep band ≈ 50% thinner strokes vs prior defaults. */
export const WATERCOLOUR_INK_EDGE_LOW = 0.07;
export const WATERCOLOUR_INK_EDGE_HIGH = 0.3;
export const WATERCOLOUR_INK_STRENGTH = 1.92375;
/** Hand-drawn line weight wobble (0 = uniform, 0.2 = noticeable). */
export const WATERCOLOUR_INK_WOBBLE = 0.14;
/** Bias stroke sample toward sharp source (marks) vs Kuwahara paint. */
export const WATERCOLOUR_INK_COLOUR_PAINT_BLEND = 0.42;

/** Sketch-style outer silhouette ink — adds stable object contour without thickening color edges. */
export const WATERCOLOUR_SILHOUETTE_EDGE = 1.85;
export const WATERCOLOUR_SILHOUETTE_DILATE = 1.375;

/** Prepass — faint ink at cel-band boundaries (interior comic shading). */
export const WATERCOLOUR_BAND_INK_STRENGTH = 0.253125;

/** Composite — chroma edges catch colour breaks (e.g. red markings on white). */
export const WATERCOLOUR_CHROMA_EDGE_WEIGHT = 0.38;

/** Outward paint bleed — soft wash extends past ink silhouettes. */
export const WATERCOLOUR_BLEED_RING_STEP = 9.75;
export const WATERCOLOUR_BLEED_RING_COUNT = 5;
export const WATERCOLOUR_BLEED_DIR_COUNT = 6;
/** Wide diffuse rings for organic exterior spill (even rings only in shader). */
export const WATERCOLOUR_BLEED_WIDE_STEP = 22.0;
export const WATERCOLOUR_BLEED_WIDE_RING_COUNT = 5;
/** Proximity search rings for exterior halo. */
export const WATERCOLOUR_BLEED_PROX_RINGS = 4;
/** Extra halo mix outside object edges. */
export const WATERCOLOUR_BLEED_HALO_STRENGTH = 1.35;
/** Fringe boost on the object side of the silhouette. */
export const WATERCOLOUR_BLEED_FRINGE_BOOST = 0.42;
/** Post-ink exterior-only wash (outside the outline). */
export const WATERCOLOUR_BLEED_EXT_HALO = 1.55;
/** Irregular bleed radius — hand-painted spill variation. */
export const WATERCOLOUR_BLEED_ORGANIC_WOBBLE = 0.32;

/** Secondary mega-halo — 50% wider than primary wide bleed, sparse half-res dilate. */
export const WATERCOLOUR_MEGA_BLEED_SCALE = 2.25;
export const WATERCOLOUR_MEGA_BLEED_STEP =
  WATERCOLOUR_BLEED_WIDE_STEP * WATERCOLOUR_MEGA_BLEED_SCALE;
export const WATERCOLOUR_MEGA_BLEED_RINGS = 3;
/** Cardinal-only dilate keeps the pass cheap (12 taps at half-res). */
export const WATERCOLOUR_MEGA_BLEED_OPACITY = 0.32;

/** Linear lift after Kuwahara mix (before Cam/FX grading); preserves contrast ratios. */
export const WATERCOLOUR_LINEAR_GAIN = 1.1;

/**
 * Clip-space wobble divisor — higher Shader Lab scale = stronger drift (no pixel-grid snap).
 * @param {number} patternScale
 */
export function creativeWatercolourWobbleScale(patternScale) {
  const ps = Math.max(0.1, Math.min(5, Number(patternScale) || 1));
  const t = (ps - 0.1) / 4.9;
  return 200 - t * 110;
}

/** @deprecated Use {@link creativeWatercolourWobbleScale}. */
export function creativeWatercolourSnapGrid(patternScale) {
  return creativeWatercolourWobbleScale(patternScale);
}

/**
 * Vertex drift amount for RETRO_CONSOLE-style wobble (mesh `uIntensity`, not post mix).
 * @param {number} patternScale
 */
export function creativeWatercolourVertexDrift(patternScale) {
  const ps = Math.max(0.1, Math.min(5, Number(patternScale) || 1));
  const t = (ps - 0.1) / 4.9;
  return 0.55 + t * 0.55;
}

/**
 * Light edge-collapse decimation — follows mesh edges, gentler than PSX crush.
 * @param {number} patternScale
 */
export function creativeWatercolourMergeFactor(patternScale) {
  const ps = Math.max(0.1, Math.min(5, Number(patternScale) || 1));
  const t = (ps - 0.1) / 4.9;
  return 1.02 + t * 0.95;
}

/**
 * Map Shader Lab Scale (0.1–5) to Kuwahara radius (3–8).
 * @param {number} patternScale
 */
export function creativeLookWatercolourRadius(patternScale) {
  const ps = Math.max(0.1, Math.min(5, Number(patternScale) || 1));
  const t = (ps - 0.1) / 4.9;
  return 3 + t * 5;
}

const KUWAHARA_CORE = /* glsl */ `
const int MAX_RADIUS = ${KUWAHARA_MAX_RADIUS};
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float luma(vec3 c) {
  return dot(c, LUMA);
}

vec3 kuwahara(sampler2D tex, vec2 uv, vec2 srcSize, float radius) {
  radius = clamp(radius, 1.0, float(MAX_RADIUS));
  float n = (radius + 1.0) * (radius + 1.0);

  vec3 m0 = vec3(0.0);
  vec3 m1 = vec3(0.0);
  vec3 m2 = vec3(0.0);
  vec3 m3 = vec3(0.0);
  float lm0 = 0.0;
  float lm1 = 0.0;
  float lm2 = 0.0;
  float lm3 = 0.0;
  float sl0 = 0.0;
  float sl1 = 0.0;
  float sl2 = 0.0;
  float sl3 = 0.0;
  vec3 c;
  float lum;

  for (int j = -MAX_RADIUS; j <= 0; j++) {
    for (int i = -MAX_RADIUS; i <= 0; i++) {
      if (float(i) < -radius || float(j) < -radius) continue;
      c = texture2D(tex, uv + vec2(float(i), float(j)) * srcSize).rgb;
      lum = luma(c);
      m0 += c;
      lm0 += lum;
      sl0 += lum * lum;
    }
  }

  for (int j = -MAX_RADIUS; j <= 0; j++) {
    for (int i = 0; i <= MAX_RADIUS; i++) {
      if (float(i) > radius || float(j) < -radius) continue;
      c = texture2D(tex, uv + vec2(float(i), float(j)) * srcSize).rgb;
      lum = luma(c);
      m1 += c;
      lm1 += lum;
      sl1 += lum * lum;
    }
  }

  for (int j = 0; j <= MAX_RADIUS; j++) {
    for (int i = 0; i <= MAX_RADIUS; i++) {
      if (float(i) > radius || float(j) > radius) continue;
      c = texture2D(tex, uv + vec2(float(i), float(j)) * srcSize).rgb;
      lum = luma(c);
      m2 += c;
      lm2 += lum;
      sl2 += lum * lum;
    }
  }

  for (int j = 0; j <= MAX_RADIUS; j++) {
    for (int i = -MAX_RADIUS; i <= 0; i++) {
      if (float(i) < -radius || float(j) > radius) continue;
      c = texture2D(tex, uv + vec2(float(i), float(j)) * srcSize).rgb;
      lum = luma(c);
      m3 += c;
      lm3 += lum;
      sl3 += lum * lum;
    }
  }

  float minSigma2 = 1e2;
  vec3 result = vec3(0.0);
  float meanLum;
  float sigma2;

  m0 /= n;
  meanLum = lm0 / n;
  sigma2 = abs(sl0 / n - meanLum * meanLum);
  if (sigma2 < minSigma2) {
    minSigma2 = sigma2;
    result = m0;
  }

  m1 /= n;
  meanLum = lm1 / n;
  sigma2 = abs(sl1 / n - meanLum * meanLum);
  if (sigma2 < minSigma2) {
    minSigma2 = sigma2;
    result = m1;
  }

  m2 /= n;
  meanLum = lm2 / n;
  sigma2 = abs(sl2 / n - meanLum * meanLum);
  if (sigma2 < minSigma2) {
    minSigma2 = sigma2;
    result = m2;
  }

  m3 /= n;
  meanLum = lm3 / n;
  sigma2 = abs(sl3 / n - meanLum * meanLum);
  if (sigma2 < minSigma2) {
    result = m3;
  }

  return result;
}
`;

/** Half-res Kuwahara — luma-variance quadrant pick (soft paint layer). */
export const WATERCOLOUR_KUWAHARA_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uTexelSize;
uniform float uRadius;
uniform float uTexelScale;

${KUWAHARA_CORE}

void main() {
  vec2 srcSize = uTexelSize * uTexelScale;
  vec3 painted = kuwahara(tDiffuse, vUv, srcSize, uRadius);
  gl_FragColor = vec4(painted, 1.0);
}
`;

/** Shared bleed helpers — baked at half-res in the prepass. */
const WATERCOLOUR_BLEED_GLSL = /* glsl */ `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 BG = vec3(0.031372549, 0.031372549, 0.031372549);
const float BLEED_STEP = ${WATERCOLOUR_BLEED_RING_STEP.toFixed(4)};
const int BLEED_RINGS = ${WATERCOLOUR_BLEED_RING_COUNT};
const float BLEED_WIDE_STEP = ${WATERCOLOUR_BLEED_WIDE_STEP.toFixed(4)};
const float BLEED_WOBBLE = ${WATERCOLOUR_BLEED_ORGANIC_WOBBLE.toFixed(4)};
const int PROX_RINGS = ${WATERCOLOUR_BLEED_PROX_RINGS};
const int BLEED_DIRS = ${WATERCOLOUR_BLEED_DIR_COUNT};

float luma(vec3 c) {
  return dot(c, LUMA);
}

float objectPresence(vec4 tap) {
  if (tap.a < 0.995) return clamp(tap.a, 0.0, 1.0);

  float lum = luma(tap.rgb);
  float chroma = length(tap.rgb - vec3(lum));
  float onBlack = 1.0 - smoothstep(0.02, 0.09, length(tap.rgb - BG));
  float onGrayBg = smoothstep(0.36, 0.64, lum) * (1.0 - smoothstep(0.02, 0.1, chroma));
  float bgMask = max(onBlack, onGrayBg);
  return (1.0 - bgMask) * smoothstep(0.03, 0.14, chroma + lum * 0.22);
}

float bleedOrganicWobble(vec2 uv) {
  float n1 = fract(sin(dot(uv * 180.0, vec2(12.9898, 78.233))) * 43758.5453);
  float n2 = fract(sin(dot(uv * 95.0, vec2(39.3468, 11.1355))) * 22578.1459);
  return 1.0 - BLEED_WOBBLE + (n1 * 0.65 + n2 * 0.35) * BLEED_WOBBLE * 2.0;
}

float interiorProximity(vec2 uv) {
  float maxPres = objectPresence(texture2D(tDiffuse, uv));
  vec2 px = uTexelSize;

  for (int ring = 1; ring <= PROX_RINGS; ring++) {
    float rad = float(ring) * BLEED_STEP * 0.95;
    maxPres = max(maxPres, objectPresence(texture2D(tDiffuse, uv + vec2(px.x * rad, 0.0))));
    maxPres = max(maxPres, objectPresence(texture2D(tDiffuse, uv - vec2(px.x * rad, 0.0))));
    maxPres = max(maxPres, objectPresence(texture2D(tDiffuse, uv + vec2(0.0, px.y * rad))));
    maxPres = max(maxPres, objectPresence(texture2D(tDiffuse, uv - vec2(0.0, px.y * rad))));
  }

  return maxPres;
}

vec3 computeBleedPack(vec2 uv, float pres, float near) {
  vec3 paint = texture2D(tPaint, uv).rgb;
  vec3 outSum = paint * max(pres, 0.04);
  vec3 wideSum = vec3(0.0);
  float outW = max(pres, 0.04);
  float wideW = 0.0;
  float wobble = bleedOrganicWobble(uv);
  vec2 px = uTexelSize;

  for (int ring = 1; ring <= BLEED_RINGS; ring++) {
    float radT = float(ring) * BLEED_STEP * wobble;
    for (int i = 0; i < BLEED_DIRS; i++) {
      float ang = float(i) * 1.0471975512;
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 offT = dir * px * radT;
      vec4 nTap = texture2D(tDiffuse, uv + offT);
      vec3 nPaint = texture2D(tPaint, uv + offT).rgb;
      float nPres = objectPresence(nTap);
      float ow = max(0.0, nPres - pres + 0.05) / max(radT, 0.5);
      outSum += nPaint * ow;
      outW += ow;

      if (ring >= 2 && mod(float(ring), 2.0) < 0.5) {
        float radW = float(ring) * BLEED_WIDE_STEP * 0.5 * wobble;
        vec2 offW = dir * px * radW;
        float wPres = objectPresence(texture2D(tDiffuse, uv + offW));
        float ww = wPres / max(radW, 0.75);
        wideSum += texture2D(tPaint, uv + offW).rgb * ww;
        wideW += ww;
      }
    }
  }

  vec3 outward = outSum / max(outW, 1e-4);
  vec3 wide = wideW > 1e-4 ? wideSum / wideW : paint;
  wide = mix(wide, paint, near * 0.35);
  float extZone = smoothstep(0.12, 0.5, near) * (1.0 - smoothstep(0.08, 0.5, pres));
  return mix(outward, wide, clamp(extZone * 0.88 + 0.12, 0.0, 1.0));
}
`;

/** Half-res bleed bake — outward + wide spill packed into RGB, proximity in alpha. */
export const WATERCOLOUR_BLEED_PREP_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tPaint;
uniform vec2 uTexelSize;

${WATERCOLOUR_BLEED_GLSL}

void main() {
  vec4 srcTap = texture2D(tDiffuse, vUv);
  float pres = objectPresence(srcTap);
  float near = interiorProximity(vUv);
  vec3 packed = computeBleedPack(vUv, pres, near);
  gl_FragColor = vec4(packed, near);
}
`;

/** Half-res mega-halo — dilates primary bleed 50% further (cardinal taps only). */
export const WATERCOLOUR_MEGA_BLEED_PREP_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tBleed;
uniform vec2 uTexelSize;

const float MEGA_STEP = ${WATERCOLOUR_MEGA_BLEED_STEP.toFixed(4)};
const int MEGA_RINGS = ${WATERCOLOUR_MEGA_BLEED_RINGS};
const float MEGA_WOBBLE = ${WATERCOLOUR_BLEED_ORGANIC_WOBBLE.toFixed(4)};

float megaWobble(vec2 uv) {
  float n = fract(sin(dot(uv * 120.0, vec2(41.9412, 23.8711))) * 31241.117);
  return 1.0 - MEGA_WOBBLE * 0.65 + n * MEGA_WOBBLE * 1.3;
}

void main() {
  vec4 tap = texture2D(tBleed, vUv);
  vec3 col = tap.rgb;
  float near = tap.a;
  vec3 sum = col * max(near, 0.05);
  float wSum = max(near, 0.05);
  vec2 px = uTexelSize;
  float wobble = megaWobble(vUv);

  for (int ring = 1; ring <= MEGA_RINGS; ring++) {
    float rad = float(ring) * MEGA_STEP * wobble;
    vec2 oX = vec2(px.x * rad, 0.0);
    vec2 oY = vec2(0.0, px.y * rad);
    vec4 sPX = texture2D(tBleed, vUv + oX);
    vec4 sNX = texture2D(tBleed, vUv - oX);
    vec4 sPY = texture2D(tBleed, vUv + oY);
    vec4 sNY = texture2D(tBleed, vUv - oY);
    float wX = max(sPX.a, sNX.a) / max(rad, 1.0);
    float wY = max(sPY.a, sNY.a) / max(rad, 1.0);
    sum += (sPX.rgb + sNX.rgb) * wX;
    sum += (sPY.rgb + sNY.rgb) * wY;
    wSum += (wX + wY) * 2.0;
  }

  gl_FragColor = vec4(sum / max(wSum, 1e-4), max(near, 0.0));
}
`;

/** Full-res composite — reads baked bleed; edge carve + comic ink only. */
export const WATERCOLOUR_COMPOSITE_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D tPaint;
uniform sampler2D tBleed;
uniform sampler2D tMegaBleed;
uniform float uIntensity;
uniform vec2 uTexelSize;
uniform float uInkWidthScale;
${CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const vec3 BG = vec3(0.031372549, 0.031372549, 0.031372549);
const float INK_COLOUR_PAINT_BLEND = ${WATERCOLOUR_INK_COLOUR_PAINT_BLEND.toFixed(4)};
const float LINEAR_GAIN = ${WATERCOLOUR_LINEAR_GAIN.toFixed(4)};
const float EDGE_LOW = ${WATERCOLOUR_EDGE_LOW.toFixed(4)};
const float EDGE_HIGH = ${WATERCOLOUR_EDGE_HIGH.toFixed(4)};
const float CRISP_EDGE = ${WATERCOLOUR_CRISP_EDGE_STRENGTH.toFixed(4)};
const float SPEC_LOW = ${WATERCOLOUR_SPEC_LOW.toFixed(4)};
const float SPEC_HIGH = ${WATERCOLOUR_SPEC_HIGH.toFixed(4)};
const float CRISP_SPEC = ${WATERCOLOUR_CRISP_SPEC_STRENGTH.toFixed(4)};
const float INK_EDGE_LOW = ${WATERCOLOUR_INK_EDGE_LOW.toFixed(4)};
const float INK_EDGE_HIGH = ${WATERCOLOUR_INK_EDGE_HIGH.toFixed(4)};
const float INK_STRENGTH = ${WATERCOLOUR_INK_STRENGTH.toFixed(4)};
const float INK_WOBBLE = ${WATERCOLOUR_INK_WOBBLE.toFixed(4)};
const float CHROMA_EDGE_W = ${WATERCOLOUR_CHROMA_EDGE_WEIGHT.toFixed(4)};
const float BLEED_HALO = ${WATERCOLOUR_BLEED_HALO_STRENGTH.toFixed(4)};
const float BLEED_FRINGE = ${WATERCOLOUR_BLEED_FRINGE_BOOST.toFixed(4)};
const float BLEED_EXT_HALO = ${WATERCOLOUR_BLEED_EXT_HALO.toFixed(4)};
const float BLEED_WOBBLE = ${WATERCOLOUR_BLEED_ORGANIC_WOBBLE.toFixed(4)};
const float MEGA_OPACITY = ${WATERCOLOUR_MEGA_BLEED_OPACITY.toFixed(4)};
const float SILHOUETTE_EDGE = ${WATERCOLOUR_SILHOUETTE_EDGE.toFixed(4)};
const float SILHOUETTE_DILATE = ${WATERCOLOUR_SILHOUETTE_DILATE.toFixed(4)};

float luma(vec3 c) {
  return dot(c, LUMA);
}

float objectPresence(vec4 tap) {
  if (tap.a < 0.995) return clamp(tap.a, 0.0, 1.0);

  float lum = luma(tap.rgb);
  float chroma = length(tap.rgb - vec3(lum));
  float onBlack = 1.0 - smoothstep(0.02, 0.09, length(tap.rgb - BG));
  float onGrayBg = smoothstep(0.36, 0.64, lum) * (1.0 - smoothstep(0.02, 0.1, chroma));
  float bgMask = max(onBlack, onGrayBg);
  return (1.0 - bgMask) * smoothstep(0.03, 0.14, chroma + lum * 0.22);
}

float edgeStrength(vec2 uv) {
  vec2 d = uTexelSize * uInkWidthScale;
  vec3 rx =
    texture2D(tDiffuse, uv + vec2(d.x, 0.0)).rgb
    - texture2D(tDiffuse, uv - vec2(d.x, 0.0)).rgb;
  vec3 ry =
    texture2D(tDiffuse, uv + vec2(0.0, d.y)).rgb
    - texture2D(tDiffuse, uv - vec2(0.0, d.y)).rgb;
  float lumEdge = length(vec2(dot(rx, LUMA), dot(ry, LUMA)));
  float chromaEdge = length(vec2(length(rx), length(ry)));
  return max(lumEdge, chromaEdge * CHROMA_EDGE_W);
}

float presenceTap(vec2 uv) {
  return objectPresence(texture2D(tDiffuse, uv));
}

float silhouetteEdge(vec2 uv, vec2 texel) {
  float px = presenceTap(uv + vec2(texel.x, 0.0));
  float nx = presenceTap(uv - vec2(texel.x, 0.0));
  float py = presenceTap(uv + vec2(0.0, texel.y));
  float ny = presenceTap(uv - vec2(0.0, texel.y));
  return length(vec2(px - nx, py - ny));
}

float silhouetteEdgeThick(vec2 uv, vec2 texel) {
  vec2 inkTexel = texel * uInkWidthScale;
  float e = silhouetteEdge(uv, inkTexel);
  vec2 o1 = inkTexel * SILHOUETTE_DILATE;
  vec2 o2 = inkTexel * SILHOUETTE_DILATE * 1.65;
  e = max(e, silhouetteEdge(uv + vec2(o1.x, 0.0), inkTexel));
  e = max(e, silhouetteEdge(uv - vec2(o1.x, 0.0), inkTexel));
  e = max(e, silhouetteEdge(uv + vec2(0.0, o1.y), inkTexel));
  e = max(e, silhouetteEdge(uv - vec2(0.0, o1.y), inkTexel));
  e = max(e, silhouetteEdge(uv + o1, inkTexel));
  e = max(e, silhouetteEdge(uv - o1, inkTexel));
  e = max(e, silhouetteEdge(uv + vec2(o1.x, -o1.y), inkTexel));
  e = max(e, silhouetteEdge(uv + vec2(-o1.x, o1.y), inkTexel));
  e = max(e, silhouetteEdge(uv + vec2(o2.x, 0.0), inkTexel) * 0.95);
  e = max(e, silhouetteEdge(uv - vec2(o2.x, 0.0), inkTexel) * 0.95);
  e = max(e, silhouetteEdge(uv + vec2(0.0, o2.y), inkTexel) * 0.95);
  e = max(e, silhouetteEdge(uv - vec2(0.0, o2.y), inkTexel) * 0.95);
  return e;
}

float bleedHaloMask(float pres, float edge, float nearObject) {
  float silhouette = smoothstep(0.04, 0.28, edge);
  float outside = smoothstep(0.28, 0.88, nearObject) * (1.0 - smoothstep(0.04, 0.4, pres));
  float fringe = smoothstep(0.06, 0.34, pres) * (1.0 - smoothstep(0.34, 0.78, pres));
  return silhouette * max(outside, fringe * BLEED_FRINGE);
}

float exteriorBleedMask(vec2 uv, float pres, float edge, float nearObject) {
  float silhouette = smoothstep(0.03, 0.22, edge);
  float outside = smoothstep(0.22, 0.92, nearObject) * (1.0 - smoothstep(0.02, 0.35, pres));
  float organic = 1.0 - BLEED_WOBBLE
    + fract(sin(dot(uv * 180.0, vec2(12.9898, 78.233))) * 43758.5453) * BLEED_WOBBLE * 2.0;
  return outside * silhouette * organic;
}

float megaBleedMask(float pres, float edge, float nearObject) {
  float silhouette = smoothstep(0.02, 0.16, edge);
  float outside = smoothstep(0.12, 0.98, nearObject) * (1.0 - smoothstep(0.01, 0.2, pres));
  return outside * silhouette;
}

float inkWobble(vec2 uv) {
  float n = fract(sin(dot(uv * 520.0, vec2(12.9898, 78.233))) * 43758.5453);
  return 1.0 - INK_WOBBLE + n * INK_WOBBLE * 2.0;
}

${CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL}

void main() {
  vec4 srcTap = texture2D(tDiffuse, vUv);
  vec3 src = srcTap.rgb;
  float pres = objectPresence(srcTap);

  vec3 paintK = texture2D(tPaint, vUv).rgb;
  vec4 bleedTap = texture2D(tBleed, vUv);
  float nearObject = bleedTap.a;
  vec3 packed = bleedTap.rgb;
  vec3 painted = mix(paintK, packed, 0.74);
  vec3 extPaint = packed;

  float mixAmt = clamp(uIntensity, 0.0, 2.0);
  float baseMix = min(mixAmt, 1.0);

  vec3 fuzzy = mix(src, painted, baseMix);
  if (mixAmt > 1.0) {
    float extra = mixAmt - 1.0;
    fuzzy = mix(fuzzy, mix(src, painted, 0.35), extra * 0.55);
  }

  float colorEdge = edgeStrength(vUv);
  float silEdge = silhouetteEdgeThick(vUv, uTexelSize);
  float inkEdge = max(colorEdge, silEdge * SILHOUETTE_EDGE);
  float edge = colorEdge;
  float halo = bleedHaloMask(pres, edge, nearObject);
  fuzzy = mix(fuzzy, mix(src, painted, baseMix * 0.95), halo * BLEED_HALO);

  float edgeMask = smoothstep(EDGE_LOW, EDGE_HIGH, edge);
  float specMask = smoothstep(SPEC_LOW, SPEC_HIGH, luma(src));
  float crispWeight = max(edgeMask * CRISP_EDGE, specMask * CRISP_SPEC);
  crispWeight *= smoothstep(0.05, 0.35, pres);

  vec3 col = mix(fuzzy, src, crispWeight);
  col = max(col, src * specMask * 0.42);

  float inkLine = smoothstep(INK_EDGE_LOW, INK_EDGE_HIGH, inkEdge);
  float inkAmt = inkLine * INK_STRENGTH * inkWobble(vUv) * (1.0 - specMask * 0.8);
  inkAmt *= 0.65 + 0.35 * clamp(mixAmt, 0.0, 1.0);
  vec3 inkLocal = mix(src, painted, INK_COLOUR_PAINT_BLEND);
  vec3 inkColor = resolveStrokeInk(inkLocal);
  col = mix(col, inkColor, inkAmt);

  float extMask = exteriorBleedMask(vUv, pres, edge, nearObject);
  float extAmt = clamp(extMask * BLEED_EXT_HALO * (1.0 - inkAmt * 0.28), 0.0, 0.98);
  col = mix(col, extPaint, extAmt);
  col = mix(col, mix(painted, extPaint, 0.55), halo * 0.45 * (1.0 - inkAmt * 0.4));

  vec3 megaPaint = texture2D(tMegaBleed, vUv).rgb;
  float megaMask = megaBleedMask(pres, edge, nearObject) * (1.0 - inkAmt * 0.82);
  col = mix(col, megaPaint, megaMask * MEGA_OPACITY);

  col *= LINEAR_GAIN;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
