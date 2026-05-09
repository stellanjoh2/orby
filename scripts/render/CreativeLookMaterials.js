import * as THREE from 'three';

/**
 * Animated presets read `uTime` as one shared timeline: MaterialController sets
 * `uTime = elapsedSeconds * creativeLook.shaderAnimationSpeed` (after pause freeze).
 * Shader fragments use `float t = uTime` so flow-field, plasma, holographic, and spectral-storm stay cohesive.
 */

/** @typedef {'neon-edge' | 'flow-field' | 'plasma' | 'toon' | 'holographic' | 'spectral-storm'} CreativeLookPreset */

export const CREATIVE_LOOK_PRESETS = /** @type {const} */ ([
  'neon-edge',
  'flow-field',
  'plasma',
  'toon',
  'holographic',
  'spectral-storm',
]);

/** @param {string | undefined} preset */
export function normalizeCreativeLookPreset(preset) {
  let p = typeof preset === 'string' ? preset : '';
  if (p === 'matcap' || p === 'halftone') p = 'spectral-storm';
  if (typeof p === 'string' && CREATIVE_LOOK_PRESETS.includes(p)) {
    return /** @type {CreativeLookPreset} */ (p);
  }
  return 'neon-edge';
}

const NEON_VERTEX = /* glsl */ `
varying vec3 vNormalView;
varying vec3 vPosView;
void main() {
  vNormalView = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vPosView = mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const NEON_FRAGMENT = /* glsl */ `
varying vec3 vNormalView;
varying vec3 vPosView;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uRimPower;
uniform float uOpacity;

void main() {
  vec3 viewDir = normalize(-vPosView);
  float ndotv = max(dot(normalize(vNormalView), viewDir), 0.0);
  float rim = pow(1.0 - ndotv, uRimPower);
  vec3 color = mix(uCoreColor, uEdgeColor, rim);
  gl_FragColor = vec4(color, uOpacity);
}
`;

const FLOW_VERTEX = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPosition = wp.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLOW_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;

void main() {
  vec3 p = vWorldPosition * (0.35 / max(uPatternScale, 0.001));
  float t = uTime;
  float n = sin(p.x + t) * cos(p.y - t * 0.6) + sin(p.z * 1.2 + t * 0.35);
  float m = n * 0.5 + 0.5;
  vec3 col = mix(uColorA, uColorB, m);
  float bands = sin(dot(p, vec3(1.0, 1.3, 0.7)) * 2.5 + t) * 0.5 + 0.5;
  col = mix(col, uColorB * 1.1, bands * 0.25);
  gl_FragColor = vec4(col, uOpacity);
}
`;

const PLASMA_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uOpacity;

void main() {
  vec3 p = vWorldPosition * (1.15 / max(uPatternScale, 0.001));
  float t = uTime;
  float w1 = sin(p.x * 2.1 + t * 1.05) + sin(p.y * 2.35 - t * 0.88) + sin(p.z * 1.62 + t * 0.72);
  float w2 = sin(length(p.xy) * 3.4 + t * 2.1);
  float w3 = sin(dot(p, vec3(0.95, 1.35, 1.05)) * 2.75 - t * 1.35);
  float v = w1 + w2 * 0.62 + w3 * 0.48;
  vec3 col = 0.5 + 0.5 * cos(v * vec3(2.15, 2.45, 2.75) + t * 0.55 + vec3(0.0, 2.15, 4.35));
  col = clamp(col, vec3(0.0), vec3(1.0));
  col = pow(col, vec3(0.88));
  gl_FragColor = vec4(col, uOpacity);
}
`;

const WORLD_VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPosition = wp.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TOON_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform vec3 uLightDir;
uniform vec3 uShadow;
uniform vec3 uLight;
uniform float uBands;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float b = max(uBands, 2.0);
  float idx = floor(ndl * b);
  float stepped = idx / max(b - 1.0, 1.0);
  stepped = clamp(stepped, 0.0, 1.0);
  vec3 col = mix(uShadow, uLight, stepped);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  col += rim * vec3(0.12, 0.18, 0.48);
  gl_FragColor = vec4(col, uOpacity);
}
`;

/**
 * Rich iridescent / thin-film look: near-black body, oil-slick phase warp,
 * chromatic phase offsets at grazing angles, layered Fresnel + sharp spec (in-shader “bloom friend” via toneMapped off).
 */
const HOLOGRAPHIC_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndv = max(dot(N, V), 1e-4);
  float F = 1.0 - ndv;

  float fresnelWide = pow(F, 1.28);
  float fresnel = pow(F, 2.05);
  float fresnelTight = pow(F, 5.0);

  vec3 pw = vWorldPosition * (1.35 / max(uPatternScale, 0.001));
  float t = uTime;

  float oil =
    sin(pw.x * 0.72 + t * 0.72) * cos(pw.y * 0.78 - t * 0.62) +
    sin(pw.z * 0.68 + t * 0.42) * 0.45 +
    sin(dot(pw, vec3(0.72, 1.02, 0.58)) * 1.05 + t * 0.85) * 0.35;
  oil *= 0.22;

  float film =
    fresnel * 6.2 +
    oil * 1.45 +
    dot(N, vec3(0.15, 0.97, 0.18)) * 0.38 +
    t * 0.48;

  float chrom = fresnel * fresnel * 1.55;
  vec3 phase = film * vec3(3.45, 4.15, 4.95) + vec3(0.0, 2.2, 5.0);
  phase += vec3(chrom * 1.05, -chrom * 0.78, chrom * 0.92);

  vec3 holo = 0.5 + 0.53 * cos(phase);
  holo *= 0.96 + 0.04 * sin(film * 4.2 + t * 1.15);
  holo = pow(max(holo, vec3(0.0)), vec3(0.93));

  vec3 base = vec3(0.0035, 0.0065, 0.0165);
  float rimMix = fresnelWide * 0.82 + fresnel * 0.58 + fresnelTight * 0.38;
  rimMix = clamp(rimMix, 0.0, 1.0);
  vec3 col = mix(base, holo, rimMix);

  vec3 L = normalize(vec3(0.42, 0.9, 0.36));
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spHi = pow(nh, 228.0);
  float spLo = pow(nh, 68.0);
  vec3 specTint = mix(vec3(0.72, 0.94, 1.05), vec3(1.05, 0.58, 0.92), fresnel);
  col += specTint * (spHi * 1.25 + spLo * 0.38) * (0.18 + fresnel * 0.92);

  vec3 rimPink = vec3(1.0, 0.28, 0.82);
  col += fresnelTight * rimPink * 0.62;
  col += fresnel * vec3(0.1, 0.48, 1.05) * 0.48;
  col += oil * (fresnel + 0.15) * vec3(0.2, 0.88, 1.0) * 0.14;

  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Slow BW plasma: extreme contrast, mostly pure black/white with thin animated boundary (`uTime`). */
const SPECTRAL_STORM_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 p = vWorldPosition * (2.6 / max(uPatternScale, 0.001));
  float t = uTime;

  float wave =
    sin(p.x * 3.5 + t * 2.05) * cos(p.y * 3.0 - t * 1.6) +
    sin(p.z * 4.2 + t * 2.5) * 0.92 +
    sin(dot(p, vec3(1.08, 0.95, 1.18)) * 5.8 + t * 3.9) * 0.68;

  float radial = sin(length(p.xy) * 6.5 - t * 5.4);
  wave += radial * 0.58;

  float slices = sin(wave * 8.5 + t * 2.35);
  float poster = smoothstep(0.12, 0.88, slices * 0.5 + 0.5);

  float plasma = wave * 0.15 + radial * 0.11 + (poster - 0.5) * 0.26;
  plasma = plasma * 0.62 + 0.5;
  plasma = clamp(plasma, 0.0, 1.0);
  plasma = clamp((plasma - 0.5) * 8.5 + 0.5, 0.0, 1.0);

  float sweep = sin(t * 0.5 + dot(p, vec3(2.05, 1.62, 2.35)) * 3.4) * 0.035;
  float bw = smoothstep(0.458 + sweep, 0.542 + sweep, plasma);

  vec3 col = vec3(bw);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  float strobe = sin(t * 15.0 + dot(p, vec3(8.5, 5.3, 7.1))) * 0.5 + 0.5;
  float rimGate = rim * (0.42 + 0.58 * strobe);
  col = mix(col, vec3(1.0), rimGate * 0.82);

  gl_FragColor = vec4(col, uOpacity);
}
`;

/**
 * @param {CreativeLookPreset | string} preset
 * @param {object} opts
 * @param {boolean} [opts.transparent]
 * @param {number} [opts.opacity]
 * @param {number} [opts.side]
 * @param {number} [opts.time] — initial uTime for animated presets
 * @param {number} [opts.patternScale] — 1 = preset default; higher values make the pattern larger
 * @returns {THREE.ShaderMaterial}
 */
export function createCreativeLookMaterial(preset, opts = {}) {
  const transparent = !!opts.transparent;
  const opacity = Math.min(
    1,
    Math.max(0, Number.isFinite(opts.opacity) ? opts.opacity : 1),
  );
  /** When not in the transparent pipeline, force alpha 1 so Three never blends/sorts like a ~opaque fade (causes black flashes with orbit/zoom). */
  const shaderAlpha = transparent ? opacity : 1;
  const side = opts.side ?? THREE.FrontSide;
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const patternScale = Number.isFinite(opts.patternScale)
    ? THREE.MathUtils.clamp(opts.patternScale, 0.1, 5)
    : 1;
  const id = normalizeCreativeLookPreset(preset);

  /** Align with post half-float + linear workflow; `toneMapped: false` mismatched encoding on some GPUs (random black frames). Bloom still reads scene RT before exposure/tone passes. */
  const commonMatOpts = {
    transparent,
    opacity: shaderAlpha,
    side,
    depthTest: true,
    depthWrite: !transparent || opacity >= 0.99,
    toneMapped: true,
  };

  const finish = (mat) => {
    if ('outputColorSpace' in mat && THREE.LinearSRGBColorSpace) {
      mat.outputColorSpace = THREE.LinearSRGBColorSpace;
    }
    return mat;
  };

  if (id === 'flow-field') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uColorA: { value: new THREE.Color(0x1a0a2e) },
        uColorB: { value: new THREE.Color(0x00e5ff) },
        uOpacity: { value: shaderAlpha },
      },
      vertexShader: FLOW_VERTEX,
      fragmentShader: FLOW_FRAGMENT,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'flow-field';
    return finish(mat);
  }

  if (id === 'plasma') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
      },
      vertexShader: FLOW_VERTEX,
      fragmentShader: PLASMA_FRAGMENT,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'plasma';
    return finish(mat);
  }

  if (id === 'toon') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        /** Default; overridden each frame from the scene key light when MaterialController supplies `getCreativeLookKeyLightDir`. */
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uShadow: { value: new THREE.Color(0x1a2040) },
        uLight: { value: new THREE.Color(0xe8f0ff) },
        uBands: { value: 4.0 },
        uOpacity: { value: shaderAlpha },
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: TOON_FRAGMENT,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'toon';
    return finish(mat);
  }

  if (id === 'holographic') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: HOLOGRAPHIC_FRAGMENT,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'holographic';
    return finish(mat);
  }

  if (id === 'spectral-storm') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: SPECTRAL_STORM_FRAGMENT,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'spectral-storm';
    return finish(mat);
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color(0x0a0a12) },
      uEdgeColor: { value: new THREE.Color(0x00ffd5) },
      uRimPower: { value: 2.2 },
      uOpacity: { value: shaderAlpha },
    },
    vertexShader: NEON_VERTEX,
    fragmentShader: NEON_FRAGMENT,
    ...commonMatOpts,
  });
  mat.userData.orbyCreativeLook = 'neon-edge';
  return finish(mat);
}
