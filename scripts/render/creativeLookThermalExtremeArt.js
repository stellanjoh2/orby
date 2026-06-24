/** Shader Lab thermal-extreme — crushed poster-style false-color IR (Serge Posters–inspired). */

/** Default Shader Lab intensity — higher crush vs standard Thermal. */
export const THERMAL_EXTREME_DEFAULT_INTENSITY = 1.35;

/** Default Shader Lab scale — halo width + grain + band coarseness. */
export const THERMAL_EXTREME_DEFAULT_PATTERN_SCALE = 1;

/** @param {string | undefined | null} preset */
export function isThermalExtremeCreativeLookPreset(preset) {
  return preset === 'thermal-extreme';
}

export const THERMAL_EXTREME_PALETTE_GLSL = /* glsl */ `
vec3 orbyThermalExtremePalette(float t) {
  t = clamp(t, 0.0, 1.0);
  // Neon IR poster ramp — purple shadows → cyan → lime → yellow → orange → pure red.
  const vec3 purple = vec3(0.44, 0.04, 0.78);
  const vec3 cyan = vec3(0.04, 0.94, 1.0);
  const vec3 green = vec3(0.14, 0.98, 0.22);
  const vec3 yellow = vec3(0.98, 0.94, 0.06);
  const vec3 orange = vec3(1.0, 0.44, 0.04);
  const vec3 red = vec3(0.98, 0.06, 0.02);

  if (t < 0.16) return mix(purple, cyan, t / 0.16);
  if (t < 0.36) return mix(cyan, green, (t - 0.16) / 0.20);
  if (t < 0.56) return mix(green, yellow, (t - 0.36) / 0.20);
  if (t < 0.76) return mix(yellow, orange, (t - 0.56) / 0.20);
  return mix(orange, red, (t - 0.76) / 0.24);
}

vec3 orbyThermalExtremeSaturate(vec3 rgb, float amount) {
  float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  return clamp(mix(vec3(lum), rgb, amount), 0.0, 1.0);
}
`;

export const THERMAL_EXTREME_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;

float orbyThermalExtremeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

${THERMAL_EXTREME_PALETTE_GLSL}

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
  float edgePow = mix(2.0, 4.2, u);
  float bandCount = mix(5.0, 9.0, u);
  float haloWide = mix(0.55, 0.92, u);

  float specPow = mix(160.0, 10.0, rough);
  float spec = pow(ndh, specPow) * mix(0.12, 1.0, metal);
  float core = ndl * 0.58 + pow(ndl, 0.38) * 0.32;
  float heat = core + spec * mix(0.28, 0.62, metal);

  float edgeCool = pow(1.0 - ndv, edgePow);
  heat -= edgeCool * mix(0.22, 0.08, metal);

  float bright = clamp(uBrightness, 0.0, 2.5);
  heat *= mix(0.68, 1.32, bright * 0.5);

  heat = clamp((heat - 0.5) * (1.35 + up * 1.15 - down * 0.45) + 0.5, 0.0, 1.0);
  heat = floor(heat * bandCount + 0.001) / bandCount;

  float rim = pow(1.0 - ndv, mix(1.6, 3.2, u));
  float halo = smoothstep(0.06, haloWide, rim);
  float glowHeat = clamp(heat + halo * (0.48 + up * 0.22), 0.0, 1.0);
  glowHeat = floor(glowHeat * bandCount + 0.001) / bandCount;

  vec3 col = orbyThermalExtremePalette(glowHeat);

  vec3 coldPurple = vec3(0.40, 0.06, 0.72);
  float coldFill = (1.0 - halo) * (1.0 - ndl * 0.72);
  col = mix(col, coldPurple, coldFill * (0.48 + down * 0.10));

  float coreShadow = smoothstep(0.38, 0.12, heat) * (1.0 - halo * 0.88);
  col = mix(col, coldPurple * 0.55, coreShadow * 0.72);

  col += orbyThermalExtremePalette(clamp(halo + heat * 0.35, 0.0, 1.0))
    * halo * (0.34 + up * 0.28);

  float hotRim = smoothstep(0.72, 0.98, glowHeat) * halo;
  col += vec3(1.0, 0.22, 0.04) * hotRim * (0.28 + up * 0.32);

  vec2 grainUv = gl_FragCoord.xy * mix(0.85, 0.35, u);
  float grain = orbyThermalExtremeHash(floor(grainUv)) * 0.14 - 0.07;
  col += grain * (0.45 + halo * 0.35);

  col = orbyThermalExtremeSaturate(col, 1.38);
  col = clamp(col, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(col, uOpacity);
}
`;
