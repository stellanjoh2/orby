/**
 * Chromatic aberration — shader, defaults, look presets, direction modes, and pass wiring.
 * Add new uniforms in `applyChromaticAberrationToPass` when extending settings.
 *
 * Settings model: `amount` is the scalar channel-separation magnitude
 * (approximately the old `offset * strength` product).
 *
 * Old saved state may still carry `offset` / `strength`; {@link mergeAberrationSettings}
 * migrates the product into `amount` for backward compatibility.
 */

/**
 * @typedef {Object} ChromaticAberrationSettings
 * @property {boolean} [enabled]
 * @property {number} [amount]   Magnitude of channel separation (0..0.02 typical)
 * @property {number} [offset]   Legacy: combined with `strength` to derive `amount`
 * @property {number} [strength] Legacy: combined with `offset` to derive `amount`
 */

/** App default; merged by look filters and `StateStore.defaults`. */
export const defaultAberration = Object.freeze({
  enabled: false,
  /** Old default = offset (0.0025) × strength (0.24). */
  amount: 0.0006,
});

/**
 * Migrate a settings patch into the single-amount model.
 * Accepts both new (`amount`) and legacy (`offset` + `strength`) fields.
 */
export function mergeAberrationSettings(settings) {
  const base = {
    enabled: defaultAberration.enabled,
    amount: defaultAberration.amount,
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
  delete merged.falloff;
  delete merged.look;
  delete merged.direction;
  if (typeof merged.amount !== 'number' || Number.isNaN(merged.amount)) {
    merged.amount = defaultAberration.amount;
  }
  return merged;
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
uniform float aspectRatio;

void main() {
  vec2 invAspect = vec2(aspectRatio, 1.0);
  vec2 p = (vUv - 0.5) * invAspect;
  float dist = length(p);

  float maxR = length(vec2(0.5 * aspectRatio, 0.5));
  float t = clamp(dist / maxR, 0.0, 1.0);
  float baseMag = amount * t;

  vec2 dirP = dist > 1e-5 ? p / dist : vec2(1.0, 0.0);
  vec2 shift = (dirP * baseMag) / invAspect;
  float r = texture2D(tDiffuse, vUv + shift * 1.06).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - shift * 0.94).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

export const AberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: defaultAberration.amount },
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
  pass.enabled = true;
  pass.uniforms.amount.value = s.amount;
}
