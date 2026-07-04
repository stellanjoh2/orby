/**
 * Chromatic aberration — shader, defaults, look presets, and pass wiring.
 * Add new uniforms in `applyChromaticAberrationToPass` when extending settings.
 *
 * Settings model: `amount` is the scalar channel-separation magnitude
 * (approximately the old `offset * strength` product).
 *
 * Old saved state may still carry `offset` / `strength`; {@link mergeAberrationSettings}
 * migrates the product into `amount` for backward compatibility.
 */

/** @typedef {'low' | 'medium' | 'high' | 'ultra'} AberrationQualityId */

/**
 * @typedef {Object} ChromaticAberrationSettings
 * @property {boolean} [enabled]
 * @property {number} [amount]   Magnitude of channel separation (0..0.02 typical)
 * @property {number} [blur]     Radial smear / streak length (0..1)
 * @property {number} [falloff]  Edge spread (0.5..3) — higher = more CA toward center
 * @property {AberrationQualityId | string} [quality] Blur sample count when smear is active
 * @property {number} [offset]   Legacy: combined with `strength` to derive `amount`
 * @property {number} [strength] Legacy: combined with `offset` to derive `amount`
 */

/** Edge ramp slider range — stored value is UI-facing; shader gets {@link aberrationFalloffToShaderExponent}. */
export const ABERRATION_FALLOFF_MIN = 0.5;
export const ABERRATION_FALLOFF_MAX = 3;

/** Blur streak sample range per quality tier (min at blur→0, max at blur→1). */
export const ABERRATION_QUALITY_DEFAULT = /** @type {const} */ ('medium');
export const ABERRATION_QUALITY = Object.freeze({
  low: { minBlurSamples: 3, maxBlurSamples: 6 },
  medium: { minBlurSamples: 4, maxBlurSamples: 12 },
  high: { minBlurSamples: 6, maxBlurSamples: 16 },
  ultra: { minBlurSamples: 8, maxBlurSamples: 24 },
});

/** Compile-time loop cap — must be ≥ largest tier `maxBlurSamples`. */
export const ABERRATION_MAX_SHADER_SAMPLES = 24;

/**
 * @param {string | undefined} id
 * @returns {AberrationQualityId}
 */
export function normalizeAberrationQualityId(id) {
  if (id === 'low' || id === 'high' || id === 'ultra') return id;
  return 'medium';
}

/**
 * @param {string | undefined} id
 * @returns {typeof ABERRATION_QUALITY['medium']}
 */
export function resolveAberrationQualityTier(id) {
  const k = normalizeAberrationQualityId(id);
  return ABERRATION_QUALITY[k] ?? ABERRATION_QUALITY.medium;
}

/** App default; merged by look filters and `StateStore.defaults`. */
export const defaultAberration = Object.freeze({
  enabled: false,
  /** Old default = offset (0.0025) × strength (0.24). */
  amount: 0.0006,
  blur: 0,
  falloff: 1,
  quality: ABERRATION_QUALITY_DEFAULT,
});

/**
 * Migrate a settings patch into the single-amount model.
 * Accepts both new (`amount`) and legacy (`offset` + `strength`) fields.
 */
export function mergeAberrationSettings(settings) {
  const base = {
    enabled: defaultAberration.enabled,
    amount: defaultAberration.amount,
    blur: defaultAberration.blur,
    falloff: defaultAberration.falloff,
    quality: defaultAberration.quality,
  };
  if (!settings || typeof settings !== 'object') return base;

  const merged = { ...base, ...settings };
  // Legacy: prefer explicit `amount` if present, otherwise derive from offset × strength.
  if (
    typeof settings.amount !== 'number' &&
    (typeof settings.offset === 'number' || typeof settings.strength === 'number')
  ) {
    const o =
      typeof settings.offset === 'number' ? settings.offset : 0.0025;
    const s =
      typeof settings.strength === 'number' ? settings.strength : 0.24;
    merged.amount = o * s;
  }
  // Strip legacy/removed fields so they don't pollute future writes.
  delete merged.offset;
  delete merged.strength;
  delete merged.look;
  delete merged.direction;
  if (typeof merged.amount !== 'number' || Number.isNaN(merged.amount)) {
    merged.amount = defaultAberration.amount;
  }
  if (typeof merged.blur !== 'number' || Number.isNaN(merged.blur)) {
    merged.blur = defaultAberration.blur;
  } else {
    merged.blur = Math.min(1, Math.max(0, merged.blur));
  }
  if (typeof merged.falloff !== 'number' || Number.isNaN(merged.falloff)) {
    merged.falloff = defaultAberration.falloff;
  } else {
    merged.falloff = Math.min(
      ABERRATION_FALLOFF_MAX,
      Math.max(ABERRATION_FALLOFF_MIN, merged.falloff),
    );
  }
  merged.quality = normalizeAberrationQualityId(
    typeof merged.quality === 'string' ? merged.quality : defaultAberration.quality,
  );
  return merged;
}

/**
 * Map UI Edge slider value to the radial ramp exponent used in the shader.
 * Higher slider = more dispersion toward center (lower pow exponent).
 * @param {number} falloff
 */
export function aberrationFalloffToShaderExponent(falloff) {
  const f = Math.min(
    ABERRATION_FALLOFF_MAX,
    Math.max(ABERRATION_FALLOFF_MIN, falloff),
  );
  return ABERRATION_FALLOFF_MIN + ABERRATION_FALLOFF_MAX - f;
}

const aberrationVertex = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const aberrationFragment = `
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float amount;
uniform float blur;
uniform float falloff;
uniform float minBlurSamples;
uniform float maxBlurSamples;
uniform float aspectRatio;

const int MAX_SAMPLES = ${ABERRATION_MAX_SHADER_SAMPLES};

void main() {
  vec2 invAspect = vec2(aspectRatio, 1.0);
  vec2 p = (vUv - 0.5) * invAspect;
  float dist = length(p);

  float maxR = length(vec2(0.5 * aspectRatio, 0.5));
  float t = clamp(dist / maxR, 0.0, 1.0);
  t = pow(t, max(falloff, 0.25));
  float baseMag = amount * t;

  vec2 dirP = dist > 1e-5 ? p / dist : vec2(1.0, 0.0);
  vec2 shift = (dirP * baseMag) / invAspect;
  vec2 shiftDir = dirP / invAspect;

  // Sharp split — baseline when blur is off.
  vec3 sharp;
  sharp.r = texture2D(tDiffuse, vUv + shift * 1.06).r;
  sharp.g = texture2D(tDiffuse, vUv).g;
  sharp.b = texture2D(tDiffuse, vUv - shift * 0.94).b;

  if (blur < 0.002) {
    gl_FragColor = vec4(sharp, 1.0);
    return;
  }

  float streak = blur * baseMag * 10.0;
  int samples = int(mix(minBlurSamples, maxBlurSamples, clamp(blur, 0.0, 1.0)));

  float rAcc = 0.0;
  float gAcc = 0.0;
  float bAcc = 0.0;
  float wSum = 0.0;

  for (int i = 0; i < MAX_SAMPLES; i++) {
    if (i >= samples) break;
    float u = samples > 1 ? (float(i) / float(samples - 1) - 0.5) * 2.0 : 0.0;
    vec2 smear = shiftDir * streak * u;
    rAcc += texture2D(tDiffuse, vUv + shift * 1.06 + smear).r;
    gAcc += texture2D(tDiffuse, vUv).g;
    bAcc += texture2D(tDiffuse, vUv - shift * 0.94 - smear).b;
    wSum += 1.0;
  }

  vec3 smeared = vec3(rAcc, gAcc, bAcc) / wSum;

  // Smear taps can pull bloom halos from offset UVs — re-anchor luma to the sharp CA
  // split so streak blur adds fringe without raising exposure or ghosting green.
  float ySharp = dot(sharp, vec3(0.299, 0.587, 0.114));
  float ySm = dot(smeared, vec3(0.299, 0.587, 0.114));
  smeared = vec3(ySharp) + (smeared - vec3(ySm));

  gl_FragColor = vec4(smeared, 1.0);
}
`;

const defaultAberrationQualityTier = resolveAberrationQualityTier(defaultAberration.quality);

export const AberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: defaultAberration.amount },
    blur: { value: defaultAberration.blur },
    falloff: { value: defaultAberration.falloff },
    minBlurSamples: { value: defaultAberrationQualityTier.minBlurSamples },
    maxBlurSamples: { value: defaultAberrationQualityTier.maxBlurSamples },
    aspectRatio: { value: 1 },
  },
  vertexShader: aberrationVertex,
  fragmentShader: aberrationFragment,
};

/**
 * @param {ChromaticAberrationSettings | null | undefined} settings
 */
export function isChromaticAberrationActive(settings) {
  const s = mergeAberrationSettings(settings);
  const wants =
    s.enabled === undefined ? true : Boolean(s.enabled);
  return wants && Math.abs(s.amount ?? 0) > 0.0001;
}

/**
 * Sync a ShaderPass built from {@link AberrationShader} with scene settings.
 * @param {object} [pass]  EffectComposer `ShaderPass` with `enabled` and `uniforms`
 * @param {ChromaticAberrationSettings | null | undefined} [settings]
 */
export function applyChromaticAberrationToPass(pass, settings) {
  if (!pass?.uniforms) return;
  const s = mergeAberrationSettings(settings);
  if (!isChromaticAberrationActive(s)) {
    pass.enabled = false;
    return;
  }
  const tier = resolveAberrationQualityTier(s.quality);
  pass.enabled = true;
  pass.uniforms.amount.value = s.amount;
  pass.uniforms.blur.value = s.blur;
  pass.uniforms.falloff.value = aberrationFalloffToShaderExponent(s.falloff);
  pass.uniforms.minBlurSamples.value = tier.minBlurSamples;
  pass.uniforms.maxBlurSamples.value = tier.maxBlurSamples;
}
