/**
 * Chromatic aberration — shader, defaults, look presets, direction modes, and pass wiring.
 * Add new uniforms in `applyChromaticAberrationToPass` when extending settings.
 */

/**
 * @typedef {Object} ChromaticAberrationSettings
 * @property {boolean} [enabled]
 * @property {number} [offset]
 * @property {number} [strength]
 * @property {string} [look]  Key from {@link ABERRATION_LOOK_IDS}
 * @property {string} [direction]  Key from {@link ABERRATION_DIRECTION_IDS}
 */

/** Ordered list matching fragment shader `lookIndex` (float). */
export const ABERRATION_LOOK_IDS = Object.freeze([
  'classic',
  'redCyan',
  'magentaGreen',
  'prismatic',
  'yellowViolet',
  'orangeTeal',
  'vhs',
]);

/** Ordered list matching fragment shader `directionIndex` (float). */
export const ABERRATION_DIRECTION_IDS = Object.freeze([
  'radial',
  'horizontal',
  'vertical',
  'diagonal',
  'zoom',
]);

/** App default; merged by look filters and `StateStore.defaults`. */
export const defaultAberration = Object.freeze({
  enabled: false,
  offset: 0.0025,
  strength: 0.24,
  look: 'classic',
  direction: 'radial',
});

export function mergeAberrationSettings(settings) {
  return {
    enabled: defaultAberration.enabled,
    offset: defaultAberration.offset,
    strength: defaultAberration.strength,
    look: defaultAberration.look,
    direction: defaultAberration.direction,
    ...(settings && typeof settings === 'object' ? settings : {}),
  };
}

export function lookToIndex(id) {
  const i = ABERRATION_LOOK_IDS.indexOf(id);
  return i >= 0 ? i : 0;
}

export function directionToIndex(id) {
  const i = ABERRATION_DIRECTION_IDS.indexOf(id);
  return i >= 0 ? i : 0;
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
uniform float offset;
uniform float strength;
uniform float aspectRatio;
uniform float lookIndex;
uniform float directionIndex;

void main() {
  vec2 invAspect = vec2(aspectRatio, 1.0);
  vec2 p = (vUv - 0.5) * invAspect;
  float dist = length(p);

  float maxR = length(vec2(0.5 * aspectRatio, 0.5));
  float t = clamp(dist / maxR, 0.0, 1.0);
  float radialWeight = pow(t, 1.1);
  float baseMag = offset * strength * radialWeight;

  vec2 dirP;
  if (directionIndex < 0.5) {
    dirP = dist > 1e-5 ? p / dist : vec2(1.0, 0.0);
  } else if (directionIndex < 1.5) {
    dirP = vec2(1.0, 0.0);
  } else if (directionIndex < 2.5) {
    dirP = vec2(0.0, 1.0);
  } else if (directionIndex < 3.5) {
    dirP = normalize(vec2(1.0, 1.0));
  } else {
    dirP = dist > 1e-5 ? p / dist : vec2(1.0, 0.0);
  }

  vec2 perpP = vec2(-dirP.y, dirP.x);
  float tangAmt = (directionIndex < 0.5) ? 0.028 : 0.0;
  vec2 tangP = perpP * baseMag * tangAmt;

  float kR = 1.06;
  float kB = 0.94;

  // --- Zoom / scale split (subtle per-channel magnification from center) ---
  if (directionIndex > 3.5 && directionIndex < 4.5) {
    vec2 c = vUv - 0.5;
    float mz = baseMag * 1.45;
    if (lookIndex > 2.5 && lookIndex < 3.5) {
      float r = texture2D(tDiffuse, 0.5 + c * (1.0 + mz * 1.08)).r;
      float g = texture2D(tDiffuse, 0.5 + c * (1.0 + mz * 0.06)).g;
      float b = texture2D(tDiffuse, 0.5 + c * (1.0 - mz * 1.02)).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    } else {
      float r = texture2D(tDiffuse, 0.5 + c * (1.0 + mz * kR)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, 0.5 + c * (1.0 - mz * kB)).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
    return;
  }

  // --- VHS-style luma vs chroma bleed (along separation axis) ---
  if (lookIndex > 5.5) {
    vec3 c0 = texture2D(tDiffuse, vUv).rgb;
    float y = dot(c0, vec3(0.299, 0.587, 0.114));
    vec2 deltaUv = (dirP * baseMag * 4.2) / invAspect;
    vec3 cP = texture2D(tDiffuse, vUv + deltaUv).rgb;
    vec3 cM = texture2D(tDiffuse, vUv - deltaUv).rgb;
    vec3 cAvg = (cP + cM) * 0.5;
    float yAvg = dot(cAvg, vec3(0.299, 0.587, 0.114));
    vec3 chroma = cAvg - vec3(yAvg);
    vec3 outRgb = vec3(y) + chroma * 1.28;
    gl_FragColor = vec4(outRgb, 1.0);
    return;
  }

  vec2 deltaR = dirP * baseMag * kR + tangP;
  vec2 deltaB = dirP * baseMag * -kB - tangP * 0.35;
  vec2 shiftR = deltaR / invAspect;
  vec2 shiftB = deltaB / invAspect;

  // 0 classic — red / blue lateral CA (your previous default): R one way, G center, B other way
  if (lookIndex < 0.5) {
    float r = texture2D(tDiffuse, vUv + shiftR).r;
    float g = texture2D(tDiffuse, vUv).g;
    float b = texture2D(tDiffuse, vUv + shiftB).b;
    gl_FragColor = vec4(r, g, b, 1.0);
    return;
  }

  // 1 red / cyan — R vs G+B shifted opposite (complementary pop)
  if (lookIndex < 1.5) {
    vec2 sC = (dirP * baseMag * -1.0) / invAspect;
    float r = texture2D(tDiffuse, vUv + shiftR).r;
    float g = texture2D(tDiffuse, vUv + sC).g;
    float b = texture2D(tDiffuse, vUv + sC).b;
    gl_FragColor = vec4(r, g, b, 1.0);
    return;
  }

  // 2 magenta / green — R+B vs G
  if (lookIndex < 2.5) {
    float r = texture2D(tDiffuse, vUv + shiftR).r;
    float g = texture2D(tDiffuse, vUv + shiftB).g;
    float b = texture2D(tDiffuse, vUv + shiftR).b;
    gl_FragColor = vec4(r, g, b, 1.0);
    return;
  }

  // 3 prismatic — R / G / B at visibly different offsets along axis
  if (lookIndex < 3.5) {
    vec2 sR = (dirP * baseMag * 1.18 + tangP * 0.5) / invAspect;
    vec2 sG = (dirP * baseMag * 0.07) / invAspect;
    vec2 sB = (dirP * baseMag * -1.18 - tangP * 0.25) / invAspect;
    float r = texture2D(tDiffuse, vUv + sR).r;
    float g = texture2D(tDiffuse, vUv + sG).g;
    float b = texture2D(tDiffuse, vUv + sB).b;
    gl_FragColor = vec4(r, g, b, 1.0);
    return;
  }

  // 4 yellow / violet — warm vs cool split
  if (lookIndex < 4.5) {
    vec3 c0 = texture2D(tDiffuse, vUv).rgb;
    vec3 cPlus = texture2D(tDiffuse, vUv + shiftR).rgb;
    vec3 cMinus = texture2D(tDiffuse, vUv + shiftB).rgb;
    float r = cPlus.r;
    float g = mix(c0.g, cPlus.g, 0.62);
    float b = cMinus.b;
    gl_FragColor = vec4(r, g, b, 1.0);
    return;
  }

  // 5 orange / teal — blockbuster-style warm / cool channel bias
  float r = texture2D(tDiffuse, vUv + shiftR).r;
  float g = mix(texture2D(tDiffuse, vUv + shiftB).g, texture2D(tDiffuse, vUv + shiftR).g, 0.52);
  float b = texture2D(tDiffuse, vUv + shiftB).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;

export const AberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: defaultAberration.offset },
    strength: { value: defaultAberration.strength },
    aspectRatio: { value: 1 },
    lookIndex: { value: 0 },
    directionIndex: { value: 0 },
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
  return (
    wants &&
    (s.strength ?? 0) > 0.0001 &&
    Math.abs(s.offset ?? 0) > 0.0001
  );
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
  pass.uniforms.offset.value = s.offset;
  pass.uniforms.strength.value = s.strength;
  pass.uniforms.lookIndex.value = lookToIndex(s.look);
  pass.uniforms.directionIndex.value = directionToIndex(s.direction);
}
