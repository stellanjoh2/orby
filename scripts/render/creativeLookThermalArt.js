/** Shader Lab thermal — smooth false-color IR / heat-map imaging. */

/** Default Shader Lab intensity (contrast toward hot/cold extremes). */
export const THERMAL_DEFAULT_INTENSITY = 1.15;

/** Default Shader Lab scale (heat contour sharpness). */
export const THERMAL_DEFAULT_PATTERN_SCALE = 1;

/** @param {string | undefined | null} preset */
export function isThermalCreativeLookPreset(preset) {
  return preset === 'thermal';
}

/**
 * Classic FLIR-style ramp: cold blue → cyan → green → yellow → orange → red → white hot.
 * @param {number} t 0..1 heat
 */
export const THERMAL_PALETTE_GLSL = /* glsl */ `
vec3 orbyThermalPalette(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(0.01, 0.02, 0.06);
  const vec3 c1 = vec3(0.05, 0.08, 0.42);
  const vec3 c2 = vec3(0.08, 0.42, 0.88);
  const vec3 c3 = vec3(0.12, 0.78, 0.38);
  const vec3 c4 = vec3(0.92, 0.88, 0.12);
  const vec3 c5 = vec3(0.98, 0.48, 0.08);
  const vec3 c6 = vec3(0.92, 0.12, 0.06);
  const vec3 c7 = vec3(1.0, 0.96, 0.88);

  if (t < 0.12) return mix(c0, c1, t / 0.12);
  if (t < 0.26) return mix(c1, c2, (t - 0.12) / 0.14);
  if (t < 0.42) return mix(c2, c3, (t - 0.26) / 0.16);
  if (t < 0.58) return mix(c3, c4, (t - 0.42) / 0.16);
  if (t < 0.72) return mix(c4, c5, (t - 0.58) / 0.14);
  if (t < 0.86) return mix(c5, c6, (t - 0.72) / 0.14);
  return mix(c6, c7, (t - 0.86) / 0.14);
}
`;

export const THERMAL_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;

${THERMAL_PALETTE_GLSL}

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
  float edgePow = mix(2.8, 4.8, u);
  float heatGain = mix(0.92, 1.12, u);

  float specPow = mix(160.0, 10.0, rough);
  float spec = pow(ndh, specPow) * mix(0.12, 1.0, metal);
  float core = ndl * 0.58 + pow(ndl, 0.38) * 0.32;
  float heat = (core + spec * mix(0.28, 0.62, metal)) * heatGain;

  float edgeCool = pow(1.0 - ndv, edgePow);
  heat -= edgeCool * mix(0.34, 0.14, metal);

  float bright = clamp(uBrightness, 0.0, 2.5);
  heat *= mix(0.72, 1.28, bright * 0.5);

  heat = clamp((heat - 0.5) * (1.05 + up * 0.85 - down * 0.55) + 0.5, 0.0, 1.0);
  heat = smoothstep(0.0, 1.0, heat);

  vec3 col = orbyThermalPalette(heat);

  float hotGlow = smoothstep(0.78, 0.96, heat);
  col += vec3(1.0, 0.92, 0.75) * hotGlow * (0.18 + up * 0.22);

  col = clamp(col, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(col, uOpacity);
}
`;
