/** Shader Lab thermal-acid (Thermal 3) — expressive false-color IR; neon green mids + acid palette. */

/** Default Shader Lab intensity — punchy contrast for poster bands + hot zones. */
export const THERMAL_ACID_DEFAULT_INTENSITY = 1.2;

/** Built-in scene luminance gain before acid palette mapping. */
export const THERMAL_ACID_SCENE_GAIN = 0.55;

/** Mesh prep luminance boost — geometry heat gain (not HDRI). */
export const THERMAL_ACID_MESH_GAIN = 1.32;

/** Default Shader Lab scale — band seam softness, halo width, post grain. */
export const THERMAL_ACID_DEFAULT_PATTERN_SCALE = 1;

/** Fixed mesh crawl-wave scale — decoupled from Scale slider (always 5× under the hood). */
export const THERMAL_ACID_WAVE_PATTERN_SCALE = 5;

/** @param {string | undefined | null} preset */
export function isThermalAcidCreativeLookPreset(preset) {
  return preset === 'thermal-acid' || preset === 'night-vision';
}

/**
 * Acid thermal ramp: cobalt cold → purple/red shadow punch → cyan → wide neon green → yellow → red hot.
 * Inspired by expressive false-color thermography (not NVG phosphor green).
 */
export const THERMAL_ACID_PALETTE_GLSL = /* glsl */ `
vec3 orbyThermalAcidPalette(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 cobalt = vec3(0.04, 0.10, 0.82);
  const vec3 purple = vec3(0.38, 0.02, 0.68);
  const vec3 bloodRed = vec3(0.92, 0.04, 0.10);
  const vec3 cyan = vec3(0.06, 0.90, 1.0);
  const vec3 neonGreen = vec3(0.10, 0.98, 0.14);
  const vec3 acidLime = vec3(0.62, 1.0, 0.08);
  const vec3 yellow = vec3(0.98, 0.94, 0.04);
  const vec3 orange = vec3(1.0, 0.42, 0.02);
  const vec3 hotRed = vec3(0.98, 0.08, 0.02);

  if (t < 0.10) return mix(cobalt, purple, t / 0.10);
  if (t < 0.20) return mix(purple, bloodRed, (t - 0.10) / 0.10);
  if (t < 0.32) return mix(bloodRed, cyan, (t - 0.20) / 0.12);
  if (t < 0.50) return mix(cyan, neonGreen, (t - 0.32) / 0.18);
  if (t < 0.68) return mix(neonGreen, acidLime, (t - 0.50) / 0.18);
  if (t < 0.82) return mix(acidLime, yellow, (t - 0.68) / 0.14);
  if (t < 0.92) return mix(yellow, orange, (t - 0.82) / 0.10);
  return mix(orange, hotRed, (t - 0.92) / 0.08);
}

vec3 orbyThermalAcidSaturate(vec3 rgb, float amount) {
  float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(lum), rgb, amount), 0.0, 1.0);
}
`;

/**
 * Mesh luminance prep — PBR heat + Spectral Storm–style crawling wave bands (uTime).
 * Viewport post applies the acid palette to the full frame.
 */
export const THERMAL_ACID_LUMINANCE_PREP_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;
uniform float uLuminanceGain;

const float THERMAL_ACID_WAVE_SCALE = ${THERMAL_ACID_WAVE_PATTERN_SCALE}.0;

float orbyThermalAcidScaleNorm(float sc) {
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  return (log2(clamp(sc, 0.1, 5.0)) - logMin) / (logMax - logMin);
}

float orbyThermalAcidWaveMod(vec3 worldPos, float t) {
  vec3 p = worldPos * (2.6 / THERMAL_ACID_WAVE_SCALE);
  float wave =
    sin(p.x * 3.5 + t * 2.05) * cos(p.y * 3.0 - t * 1.6) +
    sin(p.z * 4.2 + t * 2.5) * 0.92 +
    sin(dot(p, vec3(1.08, 0.95, 1.18)) * 5.8 + t * 3.9) * 0.68;
  float radial = sin(length(p.xy) * 6.5 - t * 5.4);
  wave += radial * 0.58;
  float slices = sin(wave * 8.5 + t * 2.35);
  float poster = smoothstep(0.12, 0.88, slices * 0.5 + 0.5);
  return wave * 0.11 + (poster - 0.5) * 0.24;
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(vec3(0.35, 0.92, 0.42));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float metal = clamp(uMetalness, 0.0, 1.0);
  float rough = clamp(uRoughness, 0.02, 1.0);
  float sc = clamp(uPatternScale, 0.1, 5.0);
  float u = orbyThermalAcidScaleNorm(sc);
  float edgePow = mix(2.4, 4.6, u);

  float specPow = mix(140.0, 8.0, rough);
  float spec = pow(ndh, specPow) * mix(0.14, 1.0, metal);
  float core = ndl * 0.56 + pow(ndl, 0.34) * 0.34;
  float gain = core + spec * mix(0.32, 0.68, metal);

  gain -= pow(1.0 - ndv, edgePow) * mix(0.28, 0.10, metal);

  float bright = clamp(uBrightness, 0.0, 2.5);
  gain *= mix(0.64, 1.36, bright * 0.5);
  gain *= max(uLuminanceGain, 0.0);

  float t = uTime;
  float waveMod = orbyThermalAcidWaveMod(vWorldPosition, t);
  vec3 wavePos = vWorldPosition * (2.6 / THERMAL_ACID_WAVE_SCALE);
  float sweep = sin(t * 0.5 + dot(wavePos, vec3(2.05, 1.62, 2.35)) * 3.4) * 0.035;
  gain += waveMod + sweep;
  gain *= orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);

  gl_FragColor = vec4(vec3(clamp(gain, 0.0, 1.0)), uOpacity);
}
`;

export const THERMAL_ACID_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;

float orbyAcidHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float orbyAcidHash2(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 24634.6345);
}

${THERMAL_ACID_PALETTE_GLSL}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  vec3 L = normalize(vec3(0.35, 0.92, 0.42));
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);
  float ndh = max(dot(N, H), 0.0);
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);
  float metal = clamp(uMetalness, 0.0, 1.0);
  float rough = clamp(uRoughness, 0.02, 1.0);

  float sc = clamp(uPatternScale, 0.1, 5.0);
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  float u = (log2(sc) - logMin) / (logMax - logMin);
  float edgePow = mix(2.4, 4.6, u);
  float haloWide = mix(0.48, 0.88, u);
  float grainCoarse = mix(1.55, 0.62, u);
  float bandCount = mix(6.0, 10.0, u);

  float specPow = mix(140.0, 8.0, rough);
  float spec = pow(ndh, specPow) * mix(0.14, 1.0, metal);
  float core = ndl * 0.56 + pow(ndl, 0.34) * 0.34;
  float gain = core + spec * mix(0.32, 0.68, metal);

  float edgeCool = pow(1.0 - ndv, edgePow);
  gain -= edgeCool * mix(0.28, 0.10, metal);

  float bright = clamp(uBrightness, 0.0, 2.5);
  gain *= mix(0.64, 1.36, bright * 0.5);

  gain = clamp((gain - 0.5) * (1.42 + up * 1.28 - down * 0.38) + 0.5, 0.0, 1.0);
  gain = pow(gain, mix(1.08, 0.82, up));
  gain = floor(gain * bandCount + 0.001) / bandCount;

  float rim = pow(1.0 - ndv, mix(1.8, 3.4, u));
  float halo = smoothstep(0.04, haloWide, rim);
  float glowGain = clamp(gain + halo * (0.52 + up * 0.26) + spec * mix(0.18, 0.42, metal), 0.0, 1.0);
  glowGain = floor(glowGain * bandCount + 0.001) / bandCount;

  vec3 col = orbyThermalAcidPalette(glowGain);

  vec3 coldBlue = vec3(0.05, 0.12, 0.78);
  float coldFill = (1.0 - halo) * (1.0 - ndl * 0.68);
  col = mix(col, coldBlue, coldFill * (0.40 + down * 0.10));

  col += orbyThermalAcidPalette(clamp(glowGain + halo * 0.42, 0.0, 1.0))
    * halo * (0.36 + up * 0.30);

  float neonEdge = smoothstep(0.38, 0.72, glowGain) * (spec + rim * 0.5);
  col += vec3(0.12, 0.98, 0.18) * neonEdge * (0.28 + up * 0.32);

  float hotStart = mix(0.74, 0.60, up);
  float hot = smoothstep(hotStart, hotStart + 0.14, glowGain);
  col = mix(col, mix(vec3(0.98, 0.94, 0.06), vec3(0.98, 0.10, 0.04), hot), hot * (0.72 + up * 0.20));

  float t = uTime;
  vec2 pix = gl_FragCoord.xy;
  vec2 gUv1 = floor(pix * grainCoarse + vec2(t * 47.3, t * 31.7));
  vec2 gUv2 = floor(pix * grainCoarse * 2.35 + vec2(-t * 83.1, t * 59.2));
  vec2 gUv3 = floor(pix * grainCoarse * 0.55 + vec2(t * 19.7, -t * 27.4));

  float n1 = orbyAcidHash(gUv1) * 2.0 - 1.0;
  float n2 = orbyAcidHash2(gUv2) * 2.0 - 1.0;
  float n3 = orbyAcidHash(gUv3 + 41.0) * 2.0 - 1.0;
  float grain = n1 * 0.48 + n2 * 0.32 + n3 * 0.20;

  float spike = step(0.90, orbyAcidHash(gUv1 + 113.0)) * 2.0 - 1.0;
  grain += spike * (0.28 + up * 0.18);

  float grainMask = mix(0.55, 1.0, smoothstep(0.08, 0.72, glowGain));
  grainMask *= mix(1.0, 0.82, hot);
  col += grain * grainMask * (0.24 + up * 0.16);

  float scint = sin(t * 18.5 + orbyAcidHash(floor(pix * 0.4)) * 6.28) * 0.5 + 0.5;
  col += (scint - 0.5) * 0.04 * grainMask * (1.0 - hot * 0.5);

  col = orbyThermalAcidSaturate(col, 1.42);
  col = clamp(col, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(col, uOpacity);
}
`;
