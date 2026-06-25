import * as THREE from 'three';

/**
 * Holo Glass reads too hot at default Object → Material brightness (~1.75).
 * Bias tuned to match the look of mesh brightness ~0.75 without dialing the slider.
 */
export const CREATIVE_HOLO_GLASS_EXPOSURE_BIAS = 0.5;

/** Shader Lab holo-glass — HDRI reflection scale (transmission carries the backdrop). */
export const CREATIVE_HOLO_GLASS_ENV_MAP_MUL = 0.62 * CREATIVE_HOLO_GLASS_EXPOSURE_BIAS;

const OPAQUE_FRAGMENT = '#include <opaque_fragment>';
const COMMON_INCLUDE = '#include <common>';

const HOLO_GLASS_VERTEX_DECL = /* glsl */ `
varying vec3 vOrbyHoloWorldPos;
varying vec3 vOrbyHoloWorldNormal;
`;

const HOLO_GLASS_VERTEX_ASSIGN = /* glsl */ `
  vOrbyHoloWorldPos = worldPosition.xyz;
  vOrbyHoloWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

/** When `worldpos_vertex` is absent, assign from `transformed` before projection. */
const HOLO_GLASS_VERTEX_ASSIGN_FALLBACK = /* glsl */ `
  vec4 orbyHoloWorldPos4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    orbyHoloWorldPos4 = instanceMatrix * orbyHoloWorldPos4;
  #endif
  orbyHoloWorldPos4 = modelMatrix * orbyHoloWorldPos4;
  vOrbyHoloWorldPos = orbyHoloWorldPos4.xyz;
  vOrbyHoloWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

const HOLO_GLASS_FRAG_VARYINGS = /* glsl */ `
varying vec3 vOrbyHoloWorldPos;
varying vec3 vOrbyHoloWorldNormal;
`;

const HOLO_GLASS_FRAG_HELPERS = /* glsl */ `
uniform float uOrbyHoloTime;
uniform float uOrbyHoloPatternScale;
uniform float uOrbyHoloIntensity;

vec3 orbyHoloGlassFilm(vec3 worldPos, vec3 worldNormal, vec3 viewDir) {
  vec3 N = normalize(worldNormal);
  vec3 V = normalize(viewDir);
  float ndv = max(dot(N, V), 1e-4);
  float F = 1.0 - ndv;
  float inten = clamp(uOrbyHoloIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);

  float fresnelWide = pow(F, 1.22);
  float fresnel = pow(F, 1.95);
  float fresnelTight = pow(F, 4.6);

  float sc = clamp(uOrbyHoloPatternScale, 0.1, 5.0);
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  float u = (log2(sc) - logMin) / (logMax - logMin);
  float wFreq = mix(2.923, 0.25, u);
  vec3 pw = worldPos * wFreq;
  float t = uOrbyHoloTime * (wFreq / 1.35);

  float oil =
    sin(pw.x * 0.72 + t * 0.72) * cos(pw.y * 0.78 - t * 0.62) +
    sin(pw.z * 0.68 + t * 0.42) * 0.45 +
    sin(dot(pw, vec3(0.72, 1.02, 0.58)) * 1.05 + t * 0.85) * 0.35;
  oil *= 1.0 - down * 0.42 + up * 0.68;

  float film =
    fresnel * (5.8 + up * 2.0 - down * 1.8) +
    oil * (1.35 + up * 0.55 - down * 0.45) +
    dot(N, vec3(0.15, 0.97, 0.18)) * (0.34 + up * 0.12 - down * 0.14) +
    t * (0.42 + up * 0.18 - down * 0.18);

  float chrom = fresnel * fresnel * (1.45 + up * 0.18 - down * 0.65);
  vec3 phase = film * vec3(3.45, 4.15, 4.95) + vec3(0.0, 2.2, 5.0);
  phase += vec3(chrom * 1.05, -chrom * 0.78, chrom * 0.92);

  vec3 holo = 0.5 + 0.53 * cos(phase);
  holo *= 0.96 + 0.04 * sin(film * 4.2 + t * 1.15);
  holo = pow(max(holo, vec3(0.0)), vec3(0.92 - down * 0.06 + up * 0.06));

  float rimMix = fresnelWide * 0.78 + fresnel * 0.62 + fresnelTight * 0.42;
  rimMix = clamp(rimMix * (1.0 + up * 0.32 - down * 0.52), 0.0, 1.0);

  vec3 specTint = mix(vec3(0.72, 0.94, 1.05), vec3(1.05, 0.58, 0.92), fresnel);
  vec3 L = normalize(vec3(0.42, 0.9, 0.36));
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  holo += specTint * (pow(nh, 220.0) * 1.15 + pow(nh, 64.0) * 0.32) * (0.14 + fresnel * 0.88);
  holo += fresnelTight * vec3(1.0, 0.28, 0.82) * (0.52 + up * 0.38 - down * 0.38);
  holo += fresnel * vec3(0.1, 0.48, 1.05) * (0.42 + up * 0.22 - down * 0.22);

  return holo * rimMix;
}
`;

const HOLO_GLASS_FRAG_APPLY = /* glsl */ `
{
  vec3 holo = orbyHoloGlassFilm(
    vOrbyHoloWorldPos,
    vOrbyHoloWorldNormal,
    cameraPosition - vOrbyHoloWorldPos
  );
  outgoingLight.rgb = mix(outgoingLight.rgb, holo, clamp(length(holo) * 0.28, 0.0, 0.55));
  outgoingLight.rgb += holo * (0.36 + uOrbyHoloIntensity * 0.14);
}
`;

function ensureHoloGlassVertexPatch(vertexShader) {
  let vs = vertexShader;
  if (!vs.includes('vOrbyHoloWorldPos')) {
    vs = vs.replace(COMMON_INCLUDE, `${COMMON_INCLUDE}\n${HOLO_GLASS_VERTEX_DECL}`);
  }
  if (!vs.includes('vOrbyHoloWorldPos =')) {
    if (vs.includes('#include <worldpos_vertex>')) {
      vs = vs.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n\t${HOLO_GLASS_VERTEX_ASSIGN}`,
      );
    } else {
      vs = vs.replace(
        '#include <project_vertex>',
        `${HOLO_GLASS_VERTEX_ASSIGN_FALLBACK}\n\t#include <project_vertex>`,
      );
    }
  }
  return vs;
}

function ensureHoloGlassFragmentPatch(fragmentShader) {
  let fs = fragmentShader;
  if (fs.includes('orbyHoloGlassFilm')) return fs;

  fs = fs.replace(
    COMMON_INCLUDE,
    `${COMMON_INCLUDE}\n${HOLO_GLASS_FRAG_VARYINGS}\n${HOLO_GLASS_FRAG_HELPERS}`,
  );
  fs = fs.replace(
    OPAQUE_FRAGMENT,
    `${HOLO_GLASS_FRAG_APPLY}\n\t${OPAQUE_FRAGMENT}`,
  );
  return fs;
}

function resolvePreviousOnBeforeCompile(material) {
  const live = material.onBeforeCompile;
  if (typeof live === 'function' && !live.__orbyHoloGlassPatch) return live;
  const stored = material.userData?.orbyHoloGlass?.previousOnBeforeCompile;
  if (typeof stored === 'function' && !stored.__orbyHoloGlassPatch) return stored;
  return () => {};
}

/**
 * Physical transmission glass/water params — duplicated here to avoid circular imports.
 * @returns {{ thickness: number, roughness: number }}
 */
export function creativeHoloGlassBaseParams(patternScale, hdriBlurriness = 0) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const thickness = THREE.MathUtils.clamp(0.18 + ps * 0.42, 0.12, 2.6);
  let roughness = THREE.MathUtils.clamp(
    0.052 + Math.abs(ps - 1) * 0.072,
    0.032,
    0.48,
  );
  const blur = THREE.MathUtils.clamp(Number(hdriBlurriness) || 0, 0, 1);
  if (blur > 0) {
    roughness = Math.min(1, roughness + blur * 0.42);
  }
  roughness = Math.min(1, roughness + 0.022);
  return { thickness, roughness };
}

/**
 * @param {number} patternScale
 * @param {number} hdriBlurriness
 * @param {THREE.Mesh | null | undefined} mesh
 * @returns {{ thickness: number, roughness: number, iridescence: number, iridescenceThicknessRange: [number, number] }}
 */
export function creativeHoloGlassParamsForMesh(patternScale, hdriBlurriness, mesh, intensity = 1) {
  const base = creativeHoloGlassBaseParams(patternScale, hdriBlurriness);
  let thickness = base.thickness;
  if (mesh?.geometry) {
    if (!mesh.geometry.boundingSphere) {
      mesh.geometry.computeBoundingSphere();
    }
    const radius = mesh.geometry.boundingSphere?.radius;
    if (Number.isFinite(radius) && radius > 1e-6) {
      thickness = THREE.MathUtils.clamp(
        radius * THREE.MathUtils.lerp(0.22, 0.42, THREE.MathUtils.clamp(base.thickness / 2.6, 0, 1)),
        0.012,
        base.thickness,
      );
    }
  }
  const inten = THREE.MathUtils.clamp(Number(intensity) || 1, 0, 2);
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const u = (ps - 0.1) / 4.9;
  const iridescence = THREE.MathUtils.clamp(0.38 + inten * 0.3, 0.28, 0.88);
  const thicknessMin = Math.round(THREE.MathUtils.lerp(90, 140, u));
  const thicknessMax = Math.round(THREE.MathUtils.lerp(420, 780, u));
  return {
    thickness,
    roughness: base.roughness,
    iridescence,
    iridescenceThicknessRange: /** @type {[number, number]} */ ([thicknessMin, thicknessMax]),
  };
}

/**
 * @param {THREE.MeshPhysicalMaterial} mat
 * @param {{ time?: number, patternScale?: number, intensity?: number }} opts
 */
export function attachCreativeLookHoloGlassShader(mat, opts = {}) {
  if (!mat?.isMeshPhysicalMaterial) return;

  const stash = mat.userData.orbyHoloGlass ?? {};
  stash.time = Number.isFinite(opts.time) ? opts.time : stash.time ?? 0;
  stash.patternScale = Number.isFinite(opts.patternScale) ? opts.patternScale : stash.patternScale ?? 1;
  stash.intensity = Number.isFinite(opts.intensity) ? opts.intensity : stash.intensity ?? 1;
  mat.userData.orbyHoloGlass = stash;

  if (mat.userData.orbyHoloGlassPatched && mat.onBeforeCompile === mat.userData.orbyHoloGlassOnBeforeCompile) {
    syncCreativeLookHoloGlassUniforms(mat, opts);
    return;
  }

  const previous = resolvePreviousOnBeforeCompile(mat);
  stash.previousOnBeforeCompile = previous;

  const holoCompile = function orbyHoloGlassCompile(shader) {
    previous.call(mat, shader);

    if (!shader.uniforms.uOrbyHoloTime) {
      shader.uniforms.uOrbyHoloTime = { value: stash.time };
      shader.uniforms.uOrbyHoloPatternScale = { value: stash.patternScale };
      shader.uniforms.uOrbyHoloIntensity = { value: stash.intensity };
    } else {
      shader.uniforms.uOrbyHoloTime.value = stash.time;
      shader.uniforms.uOrbyHoloPatternScale.value = stash.patternScale;
      shader.uniforms.uOrbyHoloIntensity.value = stash.intensity;
    }

    shader.vertexShader = ensureHoloGlassVertexPatch(shader.vertexShader);
    shader.fragmentShader = ensureHoloGlassFragmentPatch(shader.fragmentShader);

    stash.uniforms = {
      time: shader.uniforms.uOrbyHoloTime,
      patternScale: shader.uniforms.uOrbyHoloPatternScale,
      intensity: shader.uniforms.uOrbyHoloIntensity,
    };
  };
  holoCompile.__orbyHoloGlassPatch = true;

  mat.userData.orbyHoloGlassPatched = true;
  mat.userData.orbyHoloGlassOnBeforeCompile = holoCompile;
  mat.onBeforeCompile = holoCompile;

  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = function orbyHoloGlassCacheKey() {
    return `${typeof prevKey === 'function' ? prevKey() : ''}:orbyHoloGlass`;
  };

  mat.needsUpdate = true;
}

/** @param {THREE.MeshPhysicalMaterial} mat @param {{ time?: number, patternScale?: number, intensity?: number }} opts */
export function syncCreativeLookHoloGlassUniforms(mat, opts = {}) {
  const stash = mat.userData?.orbyHoloGlass;
  if (!stash) return;
  if (Number.isFinite(opts.time)) stash.time = opts.time;
  if (Number.isFinite(opts.patternScale)) stash.patternScale = opts.patternScale;
  if (Number.isFinite(opts.intensity)) stash.intensity = opts.intensity;
  if (stash.uniforms?.time) stash.uniforms.time.value = stash.time;
  if (stash.uniforms?.patternScale) stash.uniforms.patternScale.value = stash.patternScale;
  if (stash.uniforms?.intensity) stash.uniforms.intensity.value = stash.intensity;
}

/**
 * @param {THREE.MeshPhysicalMaterial} mat
 * @param {number} patternScale
 * @param {number} hdriBlurriness
 * @param {number} intensity
 */
export function applyCreativeLookHoloGlassPhysicalParams(mat, patternScale, hdriBlurriness, intensity) {
  if (!mat?.isMeshPhysicalMaterial) return;
  const { roughness, iridescence, iridescenceThicknessRange } = creativeHoloGlassParamsForMesh(
    patternScale,
    hdriBlurriness,
    null,
    intensity,
  );
  mat.roughness = roughness;
  mat.iridescence = iridescence;
  mat.iridescenceThicknessRange = iridescenceThicknessRange;
}
