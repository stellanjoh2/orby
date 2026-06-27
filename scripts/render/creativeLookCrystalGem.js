import * as THREE from 'three';

/** Shader Lab crystal-gem — HDRI reflection scale (transmission carries the backdrop). */
export const CREATIVE_CRYSTAL_GEM_ENV_MAP_MUL = 0.54;

/** @typedef {'max' | 'medium' | 'low'} CreativeCrystalGemTransmissionTierId */

/** Transmission cost dominates crystal-gem FPS (Three default is 10 samples @ full res). */
export const CREATIVE_CRYSTAL_GEM_TRANSMISSION = {
  max: { samples: 4, resolutionScale: 0.65 },
  medium: { samples: 3, resolutionScale: 0.5 },
  low: { samples: 2, resolutionScale: 0.4 },
};

/** @deprecated Use CREATIVE_CRYSTAL_GEM_TRANSMISSION.max */
export const CREATIVE_CRYSTAL_GEM_TRANSMISSION_SAMPLES =
  CREATIVE_CRYSTAL_GEM_TRANSMISSION.max.samples;

/** @deprecated Use CREATIVE_CRYSTAL_GEM_TRANSMISSION.max */
export const CREATIVE_CRYSTAL_GEM_TRANSMISSION_RES_SCALE =
  CREATIVE_CRYSTAL_GEM_TRANSMISSION.max.resolutionScale;

/**
 * @param {string | undefined} renderQuality
 * @returns {typeof CREATIVE_CRYSTAL_GEM_TRANSMISSION['max']}
 */
export function resolveCreativeCrystalGemTransmission(renderQuality) {
  if (renderQuality === 'low') return CREATIVE_CRYSTAL_GEM_TRANSMISSION.low;
  if (renderQuality === 'medium') return CREATIVE_CRYSTAL_GEM_TRANSMISSION.medium;
  return CREATIVE_CRYSTAL_GEM_TRANSMISSION.max;
}

const OPAQUE_FRAGMENT = '#include <opaque_fragment>';
const COMMON_INCLUDE = '#include <common>';

const CRYSTAL_GEM_VERTEX_DECL = /* glsl */ `
varying vec3 vOrbyCrystalWorldPos;
varying vec3 vOrbyCrystalWorldNormal;
`;

const CRYSTAL_GEM_VERTEX_ASSIGN = /* glsl */ `
  vOrbyCrystalWorldPos = worldPosition.xyz;
  vOrbyCrystalWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

const CRYSTAL_GEM_VERTEX_ASSIGN_FALLBACK = /* glsl */ `
  vec4 orbyCrystalWorldPos4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    orbyCrystalWorldPos4 = instanceMatrix * orbyCrystalWorldPos4;
  #endif
  orbyCrystalWorldPos4 = modelMatrix * orbyCrystalWorldPos4;
  vOrbyCrystalWorldPos = orbyCrystalWorldPos4.xyz;
  vOrbyCrystalWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

const CRYSTAL_GEM_FRAG_VARYINGS = /* glsl */ `
varying vec3 vOrbyCrystalWorldPos;
varying vec3 vOrbyCrystalWorldNormal;
`;

const CRYSTAL_GEM_FRAG_HELPERS = /* glsl */ `
uniform float uOrbyCrystalTime;
uniform float uOrbyCrystalPatternScale;
uniform float uOrbyCrystalIntensity;

float orbyCrystalHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float orbyCrystalInclusion(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = orbyCrystalHash2(i);
  float b = orbyCrystalHash2(i + vec2(1.0, 0.0));
  float c = orbyCrystalHash2(i + vec2(0.0, 1.0));
  float d = orbyCrystalHash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float orbyCrystalFbm2(vec2 p) {
  return orbyCrystalInclusion(p);
}

vec3 orbyCrystalGemVolume(vec3 worldPos, vec3 worldNormal, vec3 viewDir) {
  vec3 N = normalize(worldNormal);
  vec3 V = normalize(viewDir);
  float ndv = max(dot(N, V), 1e-4);
  float F = 1.0 - ndv;
  float inten = clamp(uOrbyCrystalIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);

  float sc = clamp(uOrbyCrystalPatternScale, 0.1, 5.0);
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  float u = (log2(sc) - logMin) / (logMax - logMin);
  float facetFreq = mix(2.4, 0.38, u);
  float inclFreq = mix(1.35, 0.28, u);
  float t = uOrbyCrystalTime * 0.22;

  vec3 pw = worldPos * facetFreq;
  vec3 fcell = abs(fract(pw) - 0.5);
  float facetEdge = max(fcell.x, max(fcell.y, fcell.z));
  facetEdge = smoothstep(0.38, 0.46, facetEdge);
  float detail = smoothstep(0.03, 0.34, F);

  vec2 inclUv = worldPos.xy * inclFreq + worldPos.z * inclFreq * 0.37;
  inclUv += vec2(t * 0.08, -t * 0.06);
  float incl = smoothstep(0.28, 0.82, orbyCrystalFbm2(inclUv)) * detail;

  vec3 facetN = normalize(N + (fcell - 0.5) * 0.42);
  vec3 R = reflect(-V, N);
  vec3 L = normalize(vec3(0.38, 0.94, 0.32));
  float r1 = max(dot(R, L), 0.0);
  float r2 = max(dot(reflect(-V, facetN), L), 0.0);
  float internal = (r1 * r1 * r1 * 0.55 + r2 * r2 * r2 * r2 * 0.38) * detail;

  float path = pow(1.0 - ndv, mix(1.15, 2.4, u)) * (0.55 + up * 0.35 - down * 0.22);
  vec3 bodyDeep = vec3(0.01, 0.08, 0.22);
  vec3 bodyMid = vec3(0.04, 0.28, 0.52);
  vec3 bodyLit = vec3(0.12, 0.62, 0.88);
  vec3 body = mix(bodyDeep, bodyMid, path);
  body = mix(body, bodyLit, internal * (0.35 + up * 0.2));

  float disp = F * F * (0.65 + inten * 0.55);
  vec3 prism = vec3(
    0.5 + 0.5 * cos(disp * 8.2 + ndv * 14.0 + t * 0.35),
    0.5 + 0.5 * cos(disp * 8.9 + ndv * 14.0 + 2.15 + t * 0.28),
    0.5 + 0.5 * cos(disp * 9.6 + ndv * 14.0 + 4.35 + t * 0.22)
  );
  prism = pow(max(prism, vec3(0.0)), vec3(1.05 + up * 0.12));

  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float sparkTight = pow(nh, 128.0);
  float sparkWide = pow(nh, 18.0);
  float spark =
    sparkTight * (1.15 + up * 0.45) +
    sparkWide * 0.22 +
    facetEdge * pow(nh, 12.0) * 0.65;

  vec3 gem = body * (0.42 + path * 0.58);
  gem += prism * F * (0.32 + inten * 0.28 - down * 0.12);
  gem += vec3(0.55, 0.92, 1.05) * internal * (0.22 + inten * 0.18);
  gem += vec3(1.0, 0.98, 1.0) * spark;
  gem += vec3(0.08, 0.42, 0.72) * incl * (0.14 + inten * 0.16 - down * 0.08);

  vec3 fringe = vec3(
    pow(F, 2.0),
    pow(F, 2.35),
    pow(F, 2.75)
  ) * (0.28 + inten * 0.32 - down * 0.14);

  gem += fringe;
  gem *= 0.88 + facetEdge * 0.18;

  return gem;
}
`;

const CRYSTAL_GEM_FRAG_APPLY = /* glsl */ `
{
  vec3 viewDir = cameraPosition - vOrbyCrystalWorldPos;
  vec3 N = normalize(vOrbyCrystalWorldNormal);
  vec3 V = normalize(viewDir);
  float F = 1.0 - max(dot(N, V), 1e-4);
  vec3 gem = orbyCrystalGemVolume(vOrbyCrystalWorldPos, N, V);
  float edge = smoothstep(0.02, 0.42, F);
  float disp = uOrbyCrystalIntensity * 0.014 * F * F * edge;

  vec3 refr = outgoingLight.rgb;
  refr.r *= 1.0 + disp * 1.35;
  refr.g *= 1.0 - disp * 0.15;
  refr.b *= 1.0 - disp * 1.25;
  outgoingLight.rgb = mix(outgoingLight.rgb, refr, clamp(F * 0.55 * edge, 0.0, 0.72));

  outgoingLight.rgb = mix(outgoingLight.rgb, gem, clamp(length(gem) * 0.28, 0.0, 0.62));
  outgoingLight.rgb += gem * (0.42 + uOrbyCrystalIntensity * 0.2);
}
`;

function ensureCrystalGemVertexPatch(vertexShader) {
  let vs = vertexShader;
  if (!vs.includes('vOrbyCrystalWorldPos')) {
    vs = vs.replace(COMMON_INCLUDE, `${COMMON_INCLUDE}\n${CRYSTAL_GEM_VERTEX_DECL}`);
  }
  if (!vs.includes('vOrbyCrystalWorldPos =')) {
    if (vs.includes('#include <worldpos_vertex>')) {
      vs = vs.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\n\t${CRYSTAL_GEM_VERTEX_ASSIGN}`,
      );
    } else {
      vs = vs.replace(
        '#include <project_vertex>',
        `${CRYSTAL_GEM_VERTEX_ASSIGN_FALLBACK}\n\t#include <project_vertex>`,
      );
    }
  }
  return vs;
}

function ensureCrystalGemFragmentPatch(fragmentShader) {
  let fs = fragmentShader;
  if (fs.includes('orbyCrystalGemVolume')) return fs;

  fs = fs.replace(
    COMMON_INCLUDE,
    `${COMMON_INCLUDE}\n${CRYSTAL_GEM_FRAG_VARYINGS}\n${CRYSTAL_GEM_FRAG_HELPERS}`,
  );
  fs = fs.replace(
    OPAQUE_FRAGMENT,
    `${CRYSTAL_GEM_FRAG_APPLY}\n\t${OPAQUE_FRAGMENT}`,
  );
  return fs;
}

function resolvePreviousOnBeforeCompile(material) {
  const live = material.onBeforeCompile;
  if (typeof live === 'function' && !live.__orbyCrystalGemPatch) return live;
  const stored = material.userData?.orbyCrystalGem?.previousOnBeforeCompile;
  if (typeof stored === 'function' && !stored.__orbyCrystalGemPatch) return stored;
  return () => {};
}

/**
 * @param {number} patternScale
 * @param {number} hdriBlurriness
 * @returns {{ thickness: number, roughness: number, attenuationDistance: number }}
 */
export function creativeCrystalGemBaseParams(patternScale, hdriBlurriness = 0) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const thickness = THREE.MathUtils.clamp(0.28 + ps * 0.52, 0.18, 3.2);
  let roughness = THREE.MathUtils.clamp(
    0.028 + Math.abs(ps - 1) * 0.038,
    0.018,
    0.22,
  );
  const blur = THREE.MathUtils.clamp(Number(hdriBlurriness) || 0, 0, 1);
  if (blur > 0) {
    roughness = Math.min(1, roughness + blur * 0.28);
  }
  const attenuationDistance = THREE.MathUtils.clamp(0.42 + ps * 0.22, 0.32, 1.35);
  return { thickness, roughness, attenuationDistance };
}

/**
 * @param {number} patternScale
 * @param {number} hdriBlurriness
 * @param {THREE.Mesh | null | undefined} mesh
 * @param {number} [intensity]
 * @returns {{ thickness: number, roughness: number, attenuationDistance: number }}
 */
export function creativeCrystalGemParamsForMesh(patternScale, hdriBlurriness, mesh, intensity = 1) {
  const base = creativeCrystalGemBaseParams(patternScale, hdriBlurriness);
  let thickness = base.thickness;
  if (mesh?.geometry) {
    if (!mesh.geometry.boundingSphere) {
      mesh.geometry.computeBoundingSphere();
    }
    const radius = mesh.geometry.boundingSphere?.radius;
    if (Number.isFinite(radius) && radius > 1e-6) {
      thickness = THREE.MathUtils.clamp(
        radius * THREE.MathUtils.lerp(0.28, 0.48, THREE.MathUtils.clamp(base.thickness / 3.2, 0, 1)),
        0.014,
        base.thickness,
      );
    }
  }
  const inten = THREE.MathUtils.clamp(Number(intensity) || 1, 0, 2);
  const attenuationDistance = THREE.MathUtils.clamp(
    base.attenuationDistance * THREE.MathUtils.lerp(1.08, 0.72, (inten - 1) * 0.5 + 0.5),
    0.28,
    1.45,
  );
  return {
    thickness,
    roughness: base.roughness,
    attenuationDistance,
  };
}

/**
 * @param {THREE.MeshPhysicalMaterial} mat
 * @param {{ time?: number, patternScale?: number, intensity?: number, renderQuality?: string }} opts
 */
export function attachCreativeLookCrystalGemShader(mat, opts = {}) {
  if (!mat?.isMeshPhysicalMaterial) return;

  const stash = mat.userData.orbyCrystalGem ?? {};
  stash.time = Number.isFinite(opts.time) ? opts.time : stash.time ?? 0;
  stash.patternScale = Number.isFinite(opts.patternScale) ? opts.patternScale : stash.patternScale ?? 1;
  stash.intensity = Number.isFinite(opts.intensity) ? opts.intensity : stash.intensity ?? 1;
  mat.userData.orbyCrystalGem = stash;

  if (mat.userData.orbyCrystalGemPatched && mat.onBeforeCompile === mat.userData.orbyCrystalGemOnBeforeCompile) {
    syncCreativeLookCrystalGemUniforms(mat, opts);
    return;
  }

  const previous = resolvePreviousOnBeforeCompile(mat);
  stash.previousOnBeforeCompile = previous;

  const crystalCompile = function orbyCrystalGemCompile(shader) {
    previous.call(mat, shader);

    if (!shader.uniforms.uOrbyCrystalTime) {
      shader.uniforms.uOrbyCrystalTime = { value: stash.time };
      shader.uniforms.uOrbyCrystalPatternScale = { value: stash.patternScale };
      shader.uniforms.uOrbyCrystalIntensity = { value: stash.intensity };
    } else {
      shader.uniforms.uOrbyCrystalTime.value = stash.time;
      shader.uniforms.uOrbyCrystalPatternScale.value = stash.patternScale;
      shader.uniforms.uOrbyCrystalIntensity.value = stash.intensity;
    }

    shader.vertexShader = ensureCrystalGemVertexPatch(shader.vertexShader);
    shader.fragmentShader = ensureCrystalGemFragmentPatch(shader.fragmentShader);

    stash.uniforms = {
      time: shader.uniforms.uOrbyCrystalTime,
      patternScale: shader.uniforms.uOrbyCrystalPatternScale,
      intensity: shader.uniforms.uOrbyCrystalIntensity,
    };
  };
  crystalCompile.__orbyCrystalGemPatch = true;

  mat.userData.orbyCrystalGemPatched = true;
  mat.userData.orbyCrystalGemOnBeforeCompile = crystalCompile;
  mat.onBeforeCompile = crystalCompile;

  applyCreativeLookCrystalGemPerformanceTuning(mat, opts.renderQuality);

  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = function orbyCrystalGemCacheKey() {
    return `${typeof prevKey === 'function' ? prevKey() : ''}:orbyCrystalGem`;
  };

  mat.needsUpdate = true;
}

/** @param {THREE.MeshPhysicalMaterial} mat @param {{ time?: number, patternScale?: number, intensity?: number }} opts */
export function syncCreativeLookCrystalGemUniforms(mat, opts = {}) {
  const stash = mat.userData?.orbyCrystalGem;
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
export function applyCreativeLookCrystalGemPhysicalParams(mat, patternScale, hdriBlurriness, intensity) {
  if (!mat?.isMeshPhysicalMaterial) return;
  const { roughness, attenuationDistance } = creativeCrystalGemParamsForMesh(
    patternScale,
    hdriBlurriness,
    null,
    intensity,
  );
  mat.roughness = roughness;
  mat.attenuationDistance = attenuationDistance;
}

/** Lower transmission RT cost — biggest win after mesh complexity. */
export function applyCreativeLookCrystalGemPerformanceTuning(mat, renderQuality) {
  if (!mat?.isMeshPhysicalMaterial) return;
  const tier = resolveCreativeCrystalGemTransmission(renderQuality);
  mat.samples = tier.samples;
  if ('transmissionResolutionScale' in mat) {
    mat.transmissionResolutionScale = tier.resolutionScale;
  }
}

/**
 * Re-apply transmission tier when viewport render quality changes.
 * @param {THREE.Object3D | null | undefined} root
 * @param {string | undefined} renderQuality
 */
export function retuneCreativeCrystalGemMaterials(root, renderQuality) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (mat?.userData?.orbyCreativeLook !== 'crystal-gem' || !mat.isMeshPhysicalMaterial) continue;
      applyCreativeLookCrystalGemPerformanceTuning(mat, renderQuality);
    }
  });
}
