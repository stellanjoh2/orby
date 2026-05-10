import * as THREE from 'three';

/**
 * Animated presets read `uTime` as one shared timeline: MaterialController sets
 * `uTime = elapsedSeconds * creativeLook.shaderAnimationSpeed` (after pause freeze).
 * Shader fragments use `float t = uTime` for animated presets (flow-field, plasma, holographic, spectral-storm). Ordered dither uses a fixed screen Bayer grid (no time scroll).
 *
 * The chrome preset uses MeshPhysicalMaterial so PMREM / CubeUV environment maps match the rest of the viewer.
 * The glass preset uses MeshPhysicalMaterial.transmission for real refraction (Three.js transmission pipeline).
 */

/** @typedef {'neon-edge' | 'flow-field' | 'plasma' | 'toon' | 'ordered-dither' | 'holographic' | 'spectral-storm' | 'chrome' | 'glass'} CreativeLookPreset */

export const CREATIVE_LOOK_PRESETS = /** @type {const} */ ([
  'neon-edge',
  'flow-field',
  'plasma',
  'toon',
  'ordered-dither',
  'holographic',
  'chrome',
  'glass',
  'spectral-storm',
]);

/**
 * Base color for creative chrome (metalness 1): in Three’s metal workflow this tints
 * specular / env reflections. Dark values read as “black chrome”; silver uses light neutral F0.
 */
export const CREATIVE_CHROME_BASE_HEX = 0xeef1f5;

/** @param {string | undefined} preset */
export function normalizeCreativeLookPreset(preset) {
  let p = typeof preset === 'string' ? preset : '';
  if (p === 'matcap' || p === 'halftone') p = 'spectral-storm';
  if (p === 'glass-holo') p = 'holographic';
  if (typeof p === 'string' && CREATIVE_LOOK_PRESETS.includes(p)) {
    return /** @type {CreativeLookPreset} */ (p);
  }
  return 'neon-edge';
}

/**
 * Near-mirror chrome: lower roughness at small pattern scales, softer at large scales.
 * HDRI blur slider mixes toward rougher reflections (matches studio HDRI controls).
 * Higher `CREATIVE_CHROME_REFLECTION_SOFTNESS` + baseline curve = less mirror-crisp IBL.
 * @param {number} patternScale — creative look scale slider (0.1–5)
 * @param {number} [hdriBlurriness] — 0–1 scene HDRI blur
 */
const CREATIVE_CHROME_REFLECTION_SOFTNESS = 2.45;

export function creativeChromeRoughness(patternScale, hdriBlurriness = 0) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const raw = THREE.MathUtils.clamp(0.02 + ps * 0.022, 0.014, 0.22);
  const base = Math.min(1, raw * CREATIVE_CHROME_REFLECTION_SOFTNESS);
  const blur = THREE.MathUtils.clamp(Number(hdriBlurriness) || 0, 0, 1);
  if (blur > 0) {
    return Math.min(1, base + (1 - base) * blur);
  }
  return base;
}

/**
 * Screen pixels per dither tile for ordered-dither.
 * Tuned so scale **1** matches the old ~5px-tile look that previously needed scale ~0.1.
 * Lower scale → finer detail; higher → chunkier (EGA “macro-pixel”).
 * @param {number} patternScale — Creative Scale (typically 0.02–5)
 */
export function creativeOrderedDitherPixelScale(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const px = 5 * Math.pow(ps, 0.58);
  return THREE.MathUtils.clamp(px, 1.08, 34);
}

/**
 * Physical transmission glass/water: thickness + roughness from creative Scale; HDRI blur adds frost.
 * @returns {{ thickness: number, roughness: number }}
 */
export function creativeGlassParams(patternScale, hdriBlurriness = 0) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const thickness = THREE.MathUtils.clamp(0.18 + ps * 0.42, 0.12, 2.6);
  let roughness = THREE.MathUtils.clamp(
    0.028 + Math.abs(ps - 1) * 0.065,
    0.015,
    0.45,
  );
  const blur = THREE.MathUtils.clamp(Number(hdriBlurriness) || 0, 0, 1);
  if (blur > 0) {
    roughness = Math.min(1, roughness + blur * 0.42);
  }
  return { thickness, roughness };
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

/** Fixed screen-space Bayer 4×4 (no grid scroll) + Heckbert-style level selection; softer spec to avoid “sparkle” pixels. */
const ORDERED_DITHER_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform vec3 uLightDir;
uniform float uPixelScale;
uniform vec3 uTint;
uniform float uOpacity;

float bayerAt(int i) {
  if (i == 0) return 0.0;
  if (i == 1) return 8.0;
  if (i == 2) return 2.0;
  if (i == 3) return 10.0;
  if (i == 4) return 12.0;
  if (i == 5) return 4.0;
  if (i == 6) return 14.0;
  if (i == 7) return 6.0;
  if (i == 8) return 3.0;
  if (i == 9) return 11.0;
  if (i == 10) return 1.0;
  if (i == 11) return 9.0;
  if (i == 12) return 15.0;
  if (i == 13) return 7.0;
  if (i == 14) return 13.0;
  return 5.0;
}

float bayerTile(ivec2 cell) {
  int xi = int(mod(float(cell.x), 4.0));
  int yi = int(mod(float(cell.y), 4.0));
  return bayerAt(xi + yi * 4);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndl = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 22.0);
  spec = min(spec * 0.38, 0.22);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);

  float lumLin = clamp(ndl * 0.72 + 0.065 + spec + rim * 0.085, 0.0, 1.0);
  float lum = pow(lumLin, 1.0 / 2.05);

  vec2 pix = floor(gl_FragCoord.xy + 1e-3);
  float ps = max(uPixelScale, 1.0);
  ivec2 cell = ivec2(floor(pix / ps));

  float br = bayerTile(cell);
  float val = lum * 3.0 + (br + 0.5) / 16.0 - 0.5;
  float fi = clamp(floor(val + 0.5), 0.0, 3.0);

  vec3 c0 = vec3(0.035, 0.055, 0.11);
  vec3 c1 = vec3(0.05, 0.04, 0.06);
  vec3 c2 = clamp(uTint * vec3(1.08, 1.02, 1.02), vec3(0.0), vec3(1.0));
  vec3 c3 = vec3(1.0);

  vec3 col =
    fi < 0.5 ? c0 :
    fi < 1.5 ? c1 :
    fi < 2.5 ? c2 : c3;

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

  // Slider 0.1–5 is linear in the UI; map through log₂(scale) so equal steps feel even in pattern size.
  // Pin scale=1 to w=1.35 (legacy look); taper ends so low/high scales are not hyperbolic extremes.
  float sc = clamp(uPatternScale, 0.1, 5.0);
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  float u = (log2(sc) - logMin) / (logMax - logMin);
  float wFreq = mix(2.923, 0.25, u);
  vec3 pw = vWorldPosition * wFreq;
  float t = uTime * (wFreq / 1.35);

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
 * @param {number} [opts.hdriBlurriness] — for chrome / glass presets; roughness vs HDRI blur
 * @param {THREE.Color} [opts.diffuseTint] — for ordered-dither mid-tone (defaults to retro red if unset)
 * @returns {THREE.ShaderMaterial | THREE.MeshPhysicalMaterial}
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
    ? THREE.MathUtils.clamp(opts.patternScale, 0.02, 5)
    : 1;
  const hdriBlur = Number.isFinite(opts.hdriBlurriness)
    ? THREE.MathUtils.clamp(opts.hdriBlurriness, 0, 1)
    : 0;
  const diffuseTint =
    opts.diffuseTint instanceof THREE.Color
      ? opts.diffuseTint.clone()
      : null;
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

  if (id === 'ordered-dither') {
    const px = creativeOrderedDitherPixelScale(patternScale);
    const tint = diffuseTint ?? new THREE.Color(0xdc2838);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uPixelScale: { value: px },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: ORDERED_DITHER_FRAGMENT,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'ordered-dither';
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

  if (id === 'glass') {
    const { thickness, roughness } = creativeGlassParams(patternScale, hdriBlur);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0,
      roughness,
      transmission: 1,
      thickness,
      ior: 1.45,
      specularIntensity: 1,
      specularColor: new THREE.Color(0xececec),
      /** Grazing-angle lobe — subtler than chrome. */
      sheen: 0.34,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(0xdcdcdc),
      envMapIntensity: 1,
      transparent: true,
      opacity: 1,
      attenuationColor: new THREE.Color(0xe8e8e8),
      attenuationDistance: 1.35,
      side,
      toneMapped: true,
      depthWrite: false,
    });
    if ('outputColorSpace' in mat && THREE.LinearSRGBColorSpace) {
      mat.outputColorSpace = THREE.LinearSRGBColorSpace;
    }
    mat.userData.orbyCreativeLook = 'glass';
    return finish(mat);
  }

  if (id === 'chrome') {
    const rough = creativeChromeRoughness(patternScale, hdriBlur);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(CREATIVE_CHROME_BASE_HEX),
      metalness: 1,
      roughness: rough,
      envMapIntensity: 1,
      clearcoat: 0,
      transparent,
      opacity: shaderAlpha,
      side,
      toneMapped: true,
    });
    if ('outputColorSpace' in mat && THREE.LinearSRGBColorSpace) {
      mat.outputColorSpace = THREE.LinearSRGBColorSpace;
    }
    mat.userData.orbyCreativeLook = 'chrome';
    return mat;
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
