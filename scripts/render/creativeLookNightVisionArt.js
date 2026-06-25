/** Shader Lab night-vision — Gen-2+ phosphor green NVG; extreme ISO scintillation + burnt highlights. */

/** Default Shader Lab intensity — moderate contrast; scene gain handles overall brightness. */
export const NIGHT_VISION_DEFAULT_INTENSITY = 1.0;

/** Built-in scene luminance gain (~−50% vs ungraded HDR) before NV palette mapping. */
export const NIGHT_VISION_SCENE_GAIN = 0.52;

/** Mesh prep luminance boost — NVG tube gain on geometry only (not HDRI). */
export const NIGHT_VISION_MESH_GAIN = 1.32;

/** Default Shader Lab scale — grain coarseness + halation width. */
export const NIGHT_VISION_DEFAULT_PATTERN_SCALE = 1;

/** @param {string | undefined | null} preset */
export function isNightVisionCreativeLookPreset(preset) {
  return preset === 'night-vision';
}

/** P31-style phosphor ramp: crushed black-green → murky mids → neon lime → white-hot burn. */
export const NIGHT_VISION_PALETTE_GLSL = /* glsl */ `
vec3 orbyNightVisionPalette(float t) {
  t = clamp(t, 0.0, 1.0);
  const vec3 crush = vec3(0.006, 0.018, 0.008);
  const vec3 shadow = vec3(0.022, 0.072, 0.024);
  const vec3 mid = vec3(0.10, 0.36, 0.11);
  const vec3 bright = vec3(0.32, 0.86, 0.26);
  const vec3 hot = vec3(0.66, 1.0, 0.46);
  const vec3 burnt = vec3(0.94, 1.0, 0.82);

  if (t < 0.16) return mix(crush, shadow, t / 0.16);
  if (t < 0.38) return mix(shadow, mid, (t - 0.16) / 0.22);
  if (t < 0.60) return mix(mid, bright, (t - 0.38) / 0.22);
  if (t < 0.76) return mix(bright, hot, (t - 0.60) / 0.16);
  return mix(hot, burnt, (t - 0.76) / 0.24);
}
`;

export const NIGHT_VISION_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;
uniform float uMetalness;
uniform float uRoughness;

float orbyNvHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float orbyNvHash2(vec2 p) {
  return fract(sin(dot(p, vec2(269.5, 183.3))) * 24634.6345);
}

${NIGHT_VISION_PALETTE_GLSL}

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

  float rim = pow(1.0 - ndv, mix(1.8, 3.4, u));
  float halo = smoothstep(0.04, haloWide, rim);
  float glowGain = clamp(gain + halo * (0.52 + up * 0.26) + spec * mix(0.18, 0.42, metal), 0.0, 1.0);

  float lum = glowGain;
  vec3 col = orbyNightVisionPalette(lum);

  float burnStart = mix(0.74, 0.58, up);
  float burn = smoothstep(burnStart, burnStart + 0.14, lum);
  col = mix(col, vec3(0.94, 1.0, 0.82), burn * (0.82 + up * 0.18));

  col += orbyNightVisionPalette(clamp(lum + halo * 0.42, 0.0, 1.0))
    * halo * (0.38 + up * 0.32);

  float hotSpec = smoothstep(0.68, 0.96, lum) * (spec + rim * 0.5);
  col += vec3(0.88, 1.0, 0.72) * hotSpec * (0.32 + up * 0.38);

  float tubeVig = pow(ndv, mix(0.35, 0.65, u));
  col *= mix(0.72, 1.0, tubeVig);

  float t = uTime;
  vec2 pix = gl_FragCoord.xy;
  vec2 gUv1 = floor(pix * grainCoarse + vec2(t * 47.3, t * 31.7));
  vec2 gUv2 = floor(pix * grainCoarse * 2.35 + vec2(-t * 83.1, t * 59.2));
  vec2 gUv3 = floor(pix * grainCoarse * 0.55 + vec2(t * 19.7, -t * 27.4));

  float n1 = orbyNvHash(gUv1) * 2.0 - 1.0;
  float n2 = orbyNvHash2(gUv2) * 2.0 - 1.0;
  float n3 = orbyNvHash(gUv3 + 41.0) * 2.0 - 1.0;
  float grain = n1 * 0.48 + n2 * 0.32 + n3 * 0.20;

  float spike = step(0.90, orbyNvHash(gUv1 + 113.0)) * 2.0 - 1.0;
  grain += spike * (0.28 + up * 0.18);

  float grainMask = mix(0.55, 1.0, smoothstep(0.08, 0.72, lum));
  grainMask *= mix(1.0, 0.78, burn);
  col += grain * grainMask * (0.22 + up * 0.16);

  float scint = sin(t * 18.5 + orbyNvHash(floor(pix * 0.4)) * 6.28) * 0.5 + 0.5;
  col += (scint - 0.5) * 0.04 * grainMask * (1.0 - burn * 0.6);

  col = clamp(col, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(col, uOpacity);
}
`;
