import * as THREE from 'three';

/** Shader Lab presets that use MeshPhysicalMaterial.transmission. */
export const PHYSICAL_TRANSMISSION_CREATIVE_PRESETS = /** @type {const} */ ([
  'glass',
  'holo-glass',
  'crystal-gem',
]);

/** @param {string | null | undefined} preset */
export function isPhysicalTransmissionCreativeLookPreset(preset) {
  const id = typeof preset === 'string' ? preset.trim().toLowerCase() : '';
  return /** @type {readonly string[]} */ (PHYSICAL_TRANSMISSION_CREATIVE_PRESETS).includes(id);
}

export const CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN = 1;
export const CREATIVE_LOOK_TRANSMISSION_SAMPLES_MAX = 10;
export const CREATIVE_LOOK_TRANSMISSION_SAMPLES_DEFAULT = 4;

export const CREATIVE_LOOK_TRANSMISSION_DISPERSION_DEFAULT = 0.28;
export const CREATIVE_LOOK_TRANSMISSION_DISPERSION_MAX = 1;

export const CREATIVE_LOOK_SOLID_MESH_GLASS_DEFAULT = false;

const SOLID_MESH_VIEW_BLUR_MUL = 2.25;
const SOLID_MESH_ROUGHNESS_FLOOR_BOOST = 0.14;
const SOLID_MESH_CULL_THRESHOLD = 0.08;

const _solidGlassCenterScratch = new THREE.Vector3();

/** @param {number | string | null | undefined} value */
export function normalizeCreativeLookTransmissionSamples(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CREATIVE_LOOK_TRANSMISSION_SAMPLES_DEFAULT;
  return THREE.MathUtils.clamp(
    Math.round(n),
    CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN,
    CREATIVE_LOOK_TRANSMISSION_SAMPLES_MAX,
  );
}

/** @param {number | string | null | undefined} value */
export function normalizeCreativeLookTransmissionDispersion(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CREATIVE_LOOK_TRANSMISSION_DISPERSION_DEFAULT;
  return THREE.MathUtils.clamp(n, 0, CREATIVE_LOOK_TRANSMISSION_DISPERSION_MAX);
}

/**
 * UI 0–1 → Three.js physical dispersion (subtle RGB split in transmission).
 * @param {number} slider
 */
export function resolveCreativeLookTransmissionDispersion(slider) {
  const t = normalizeCreativeLookTransmissionDispersion(slider);
  // Three.js spread scales with (ior - 1) * 0.025 * dispersion — needs ~1–3 for visible RGB split.
  return t <= 1e-4 ? 0 : THREE.MathUtils.lerp(0.2, 4.8, t);
}

/**
 * Three r167 has no `material.samples` — transmission blur comes from roughness LOD in the
 * physical shader. Lower slider → softer refraction; 10 → sharpest.
 *
 * @param {number} samples
 * @param {{ solidMeshGlass?: boolean }} [opts]
 */
export function resolveCreativeLookTransmissionRoughnessFloor(samples, opts = {}) {
  const s = normalizeCreativeLookTransmissionSamples(samples);
  const t = (s - CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN)
    / (CREATIVE_LOOK_TRANSMISSION_SAMPLES_MAX - CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN);
  let floor = THREE.MathUtils.lerp(0.26, 0.022, t);
  if (opts.solidMeshGlass === true) {
    floor = Math.min(1, floor + SOLID_MESH_ROUGHNESS_FLOOR_BOOST);
  }
  return floor;
}

/**
 * Future three.js builds expose per-material transmission RT scale — keep for forward compat.
 * @param {number} samples
 */
export function resolveCreativeLookTransmissionResolutionScale(samples) {
  const s = normalizeCreativeLookTransmissionSamples(samples);
  if (s <= 2) return 0.4;
  if (s <= 3) return 0.5;
  if (s <= 4) return 0.65;
  if (s <= 6) return 0.8;
  if (s <= 8) return 0.9;
  return 1;
}

/**
 * @param {number} samples
 * @param {{ solidMeshGlass?: boolean }} [opts]
 */
export function resolveCreativeLookTransmissionViewBlur(samples, opts = {}) {
  const s = normalizeCreativeLookTransmissionSamples(samples);
  const t = (s - CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN)
    / (CREATIVE_LOOK_TRANSMISSION_SAMPLES_MAX - CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN);
  let blur = THREE.MathUtils.lerp(0.58, 0.08, t);
  if (opts.solidMeshGlass === true) {
    blur = Math.min(1, blur * SOLID_MESH_VIEW_BLUR_MUL);
  }
  return blur;
}

/**
 * @param {number} samples
 */
export function resolveSolidMeshMinTransmissionRoughness(samples) {
  const s = normalizeCreativeLookTransmissionSamples(samples);
  const t = (s - CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN)
    / (CREATIVE_LOOK_TRANSMISSION_SAMPLES_MAX - CREATIVE_LOOK_TRANSMISSION_SAMPLES_MIN);
  return THREE.MathUtils.lerp(0.48, 0.16, t);
}

const TRANSMISSION_VIEW_BLUR_UNIFORM = 'uOrbyTransmissionViewBlur';
const SOLID_MESH_UNIFORM = 'uOrbySolidMeshGlass';
const SOLID_CENTER_UNIFORM = 'uOrbySolidGlassCenter';
const SOLID_CULL_UNIFORM = 'uOrbySolidGlassCullThreshold';
const SOLID_MIN_ROUGH_UNIFORM = 'uOrbySolidMeshMinTransRoughness';

const TRANSMISSION_PATCH_UNIFORMS = /* glsl */ `
uniform float ${TRANSMISSION_VIEW_BLUR_UNIFORM};
uniform float ${SOLID_MESH_UNIFORM};
uniform float ${SOLID_MIN_ROUGH_UNIFORM};
uniform vec3 ${SOLID_CENTER_UNIFORM};
uniform float ${SOLID_CULL_UNIFORM};
`;

const TRANSMISSION_VIEW_BLUR_MARKER = 'orbyTransmissionRoughness';

/**
 * @param {string} fragmentShader
 */
export function patchCreativeLookTransmissionViewBlurFragment(fragmentShader) {
  if (!fragmentShader.includes('getIBLVolumeRefraction')
    || fragmentShader.includes(TRANSMISSION_VIEW_BLUR_MARKER)) {
    return fragmentShader;
  }

  let fs = fragmentShader;
  if (!fs.includes(TRANSMISSION_VIEW_BLUR_UNIFORM)) {
    fs = fs.replace('#include <common>', `#include <common>\n${TRANSMISSION_PATCH_UNIFORMS}`);
  }

  if (!fs.includes('orbySolidMeshGlassCull')) {
    fs = fs.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
#ifdef USE_TRANSMISSION
  if ( ${SOLID_MESH_UNIFORM} > 0.5 ) {
    vec3 orbyOutward = normalize( vWorldPosition - ${SOLID_CENTER_UNIFORM} );
    float orbyShellFacing = dot( normalize( normal ), orbyOutward );
    if ( orbyShellFacing < ${SOLID_CULL_UNIFORM} ) discard;
  }
#endif`,
    );
  }

  fs = fs.replace(
    'vec4 transmitted = getIBLVolumeRefraction(',
    `float orbyDotNV = saturate( dot( n, v ) );
\tfloat orbyTransmissionRoughness = max( material.roughness, ${TRANSMISSION_VIEW_BLUR_UNIFORM} * orbyDotNV );
\tif ( ${SOLID_MESH_UNIFORM} > 0.5 ) {
\t\torbyTransmissionRoughness = max( orbyTransmissionRoughness, ${SOLID_MIN_ROUGH_UNIFORM} );
\t}
\tvec4 transmitted = getIBLVolumeRefraction(`,
  );
  fs = fs.replace(
    /getIBLVolumeRefraction\(\s*n,\s*v,\s*material\.roughness,/,
    'getIBLVolumeRefraction( n, v, orbyTransmissionRoughness,',
  );
  return fs;
}

/**
 * @param {import('three').MeshPhysicalMaterial} material
 */
function resolvePreviousTransmissionOnBeforeCompile(material) {
  const live = material.onBeforeCompile;
  if (typeof live === 'function' && !live.__orbyTransmissionPatch) return live;
  const stored = material.userData.orbyTransmissionPatch?.previousOnBeforeCompile;
  if (typeof stored === 'function' && !stored.__orbyTransmissionPatch) return stored;
  return () => {};
}

/**
 * @param {import('three').MeshPhysicalMaterial} material
 */
function resolvePreviousTransmissionOnBeforeRender(material) {
  const live = material.onBeforeRender;
  if (typeof live === 'function' && !live.__orbyTransmissionSolidCenter) return live;
  const stored = material.userData.orbyTransmissionPatch?.previousOnBeforeRender;
  if (typeof stored === 'function' && !stored.__orbyTransmissionSolidCenter) return stored;
  return () => {};
}

/**
 * @param {import('three').MeshPhysicalMaterial} material
 * @param {{ viewBlur: number, solidMeshGlass: boolean, solidMinRoughness?: number, dispersionOn?: boolean }} tuning
 */
function attachCreativeLookTransmissionShaderPatch(material, tuning) {
  if (!material?.isMeshPhysicalMaterial) return;

  const viewBlur = THREE.MathUtils.clamp(Number(tuning.viewBlur) || 0, 0, 1);
  const solidMeshGlass = tuning.solidMeshGlass === true;
  const solidMinRoughness = THREE.MathUtils.clamp(Number(tuning.solidMinRoughness) || 0, 0, 1);
  const dispersionOn = tuning.dispersionOn === true;
  const stash = material.userData.orbyTransmissionPatch ?? {};
  const prevSolidMeshGlass = stash.solidMeshGlass === true;
  const prevSolidMinRoughness = stash.solidMinRoughness;
  const prevViewBlur = stash.viewBlur;
  stash.viewBlur = viewBlur;
  stash.solidMeshGlass = solidMeshGlass;
  stash.solidMinRoughness = solidMinRoughness;
  stash.dispersionOn = dispersionOn;
  material.userData.orbyTransmissionPatch = stash;

  if (stash.uniforms?.viewBlur) stash.uniforms.viewBlur.value = viewBlur;
  if (stash.uniforms?.solidMesh) stash.uniforms.solidMesh.value = solidMeshGlass ? 1 : 0;
  if (stash.uniforms?.solidMinRoughness) {
    stash.uniforms.solidMinRoughness.value = solidMeshGlass ? solidMinRoughness : 0;
  }

  if (material.userData.orbyTransmissionPatchPatched
    && material.onBeforeCompile === material.userData.orbyTransmissionPatchOnBeforeCompile) {
    syncCreativeLookTransmissionSolidCenterHook(material, solidMeshGlass);
    if (prevSolidMeshGlass !== solidMeshGlass
      || prevSolidMinRoughness !== solidMinRoughness
      || prevViewBlur !== viewBlur) {
      material.needsUpdate = true;
    }
    return;
  }

  const previousCompile = resolvePreviousTransmissionOnBeforeCompile(material);
  stash.previousOnBeforeCompile = previousCompile;

  const compile = function orbyTransmissionPatchCompile(shader) {
    previousCompile.call(material, shader);
    if (!shader.uniforms[TRANSMISSION_VIEW_BLUR_UNIFORM]) {
      shader.uniforms[TRANSMISSION_VIEW_BLUR_UNIFORM] = { value: viewBlur };
      shader.uniforms[SOLID_MESH_UNIFORM] = { value: solidMeshGlass ? 1 : 0 };
      shader.uniforms[SOLID_CENTER_UNIFORM] = { value: new THREE.Vector3() };
      shader.uniforms[SOLID_CULL_UNIFORM] = { value: SOLID_MESH_CULL_THRESHOLD };
      shader.uniforms[SOLID_MIN_ROUGH_UNIFORM] = {
        value: solidMeshGlass ? solidMinRoughness : 0,
      };
    } else {
      shader.uniforms[TRANSMISSION_VIEW_BLUR_UNIFORM].value = viewBlur;
      shader.uniforms[SOLID_MESH_UNIFORM].value = solidMeshGlass ? 1 : 0;
      shader.uniforms[SOLID_MIN_ROUGH_UNIFORM].value = solidMeshGlass ? solidMinRoughness : 0;
    }
    shader.fragmentShader = patchCreativeLookTransmissionViewBlurFragment(shader.fragmentShader);
    stash.uniforms = {
      viewBlur: shader.uniforms[TRANSMISSION_VIEW_BLUR_UNIFORM],
      solidMesh: shader.uniforms[SOLID_MESH_UNIFORM],
      solidCenter: shader.uniforms[SOLID_CENTER_UNIFORM],
      solidCull: shader.uniforms[SOLID_CULL_UNIFORM],
      solidMinRoughness: shader.uniforms[SOLID_MIN_ROUGH_UNIFORM],
    };
  };
  compile.__orbyTransmissionPatch = true;

  material.userData.orbyTransmissionPatchPatched = true;
  material.userData.orbyTransmissionPatchOnBeforeCompile = compile;
  material.onBeforeCompile = compile;

  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = function orbyTransmissionPatchCacheKey() {
    const disp = material.dispersion > 1e-4 ? 'd1' : 'd0';
    const solid = stash.solidMeshGlass === true ? 's1' : 's0';
    return `${typeof prevKey === 'function' ? prevKey() : ''}:orbyTxPatch:${disp}:${solid}`;
  };

  syncCreativeLookTransmissionSolidCenterHook(material, solidMeshGlass);
  material.needsUpdate = true;
}

/**
 * @param {import('three').MeshPhysicalMaterial} material
 * @param {boolean} solidMeshGlass
 */
function syncCreativeLookTransmissionSolidCenterHook(material, solidMeshGlass) {
  const stash = material.userData.orbyTransmissionPatch ?? {};
  if (!solidMeshGlass) {
    if (stash.solidCenterHookActive && material.onBeforeRender === stash.solidCenterOnBeforeRender) {
      material.onBeforeRender = stash.previousOnBeforeRender ?? (() => {});
    }
    stash.solidCenterHookActive = false;
    return;
  }

  if (stash.solidCenterHookActive && material.onBeforeRender === stash.solidCenterOnBeforeRender) {
    return;
  }

  const previousRender = resolvePreviousTransmissionOnBeforeRender(material);
  stash.previousOnBeforeRender = previousRender;

  const renderHook = function orbyTransmissionSolidCenterRender(
    renderer,
    scene,
    camera,
    geometry,
    object,
  ) {
    previousRender.call(material, renderer, scene, camera, geometry, object);
    const centerUniform = stash.uniforms?.solidCenter;
    if (!centerUniform || !object?.isMesh || !geometry) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    _solidGlassCenterScratch
      .copy(geometry.boundingSphere.center)
      .applyMatrix4(object.matrixWorld);
    centerUniform.value.copy(_solidGlassCenterScratch);
  };
  renderHook.__orbyTransmissionSolidCenter = true;

  stash.solidCenterOnBeforeRender = renderHook;
  stash.solidCenterHookActive = true;
  material.onBeforeRender = renderHook;
}

/**
 * @param {import('three').MeshPhysicalMaterial} material
 * @param {{
 *   samples?: number,
 *   doubleSide?: boolean,
 *   solidMeshGlass?: boolean,
 *   dispersion?: number,
 *   baseRoughness?: number,
 * }} opts
 */
export function applyCreativeLookPhysicalTransmissionTuning(material, opts = {}) {
  if (!material?.isMeshPhysicalMaterial) return;

  const samples = normalizeCreativeLookTransmissionSamples(opts.samples);
  const solidMeshGlass = opts.solidMeshGlass === true;
  const doubleSide = !solidMeshGlass && opts.doubleSide === true;
  const prev = material.userData.orbyTransmissionTuning ?? {};
  const side = doubleSide ? THREE.DoubleSide : THREE.FrontSide;

  const baseRoughness = Number.isFinite(opts.baseRoughness)
    ? opts.baseRoughness
    : Number.isFinite(material.userData.orbyCreativeLookBaseRoughness)
      ? material.userData.orbyCreativeLookBaseRoughness
      : material.roughness;
  material.userData.orbyCreativeLookBaseRoughness = baseRoughness;

  const roughnessOpts = { solidMeshGlass };
  const roughnessFloor = resolveCreativeLookTransmissionRoughnessFloor(samples, roughnessOpts);
  const nextRoughness = Math.min(1, Math.max(baseRoughness, roughnessFloor));
  const viewBlur = resolveCreativeLookTransmissionViewBlur(samples, roughnessOpts);
  const dispersion = resolveCreativeLookTransmissionDispersion(opts.dispersion);
  const solidMinRoughness = solidMeshGlass
    ? resolveSolidMeshMinTransmissionRoughness(samples)
    : 0;

  const sideChanged = material.side !== side;
  const roughnessChanged = material.roughness !== nextRoughness;
  const dispersionChanged = (material.dispersion ?? 0) !== dispersion;
  const tuningChanged = prev.samples !== samples
    || prev.doubleSide !== doubleSide
    || prev.solidMeshGlass !== solidMeshGlass
    || prev.dispersion !== normalizeCreativeLookTransmissionDispersion(opts.dispersion);

  if (!sideChanged && !roughnessChanged && !dispersionChanged && !tuningChanged
    && material.userData.orbyTransmissionPatch?.viewBlur === viewBlur
    && material.userData.orbyTransmissionPatch?.solidMeshGlass === solidMeshGlass
    && material.userData.orbyTransmissionPatch?.solidMinRoughness === solidMinRoughness
    && material.userData.orbyTransmissionPatch?.dispersionOn === (dispersion > 1e-4)) {
    return;
  }

  material.roughness = nextRoughness;
  material.side = side;
  material.forceSinglePass = !doubleSide;
  material.transparent = true;
  material.depthWrite = false;
  material.dispersion = dispersion;
  if (solidMeshGlass && 'specularIntensity' in material) {
    const baseSpec = Number.isFinite(material.userData.orbyCreativeLookBaseSpecular)
      ? material.userData.orbyCreativeLookBaseSpecular
      : material.specularIntensity;
    material.userData.orbyCreativeLookBaseSpecular = baseSpec;
    material.specularIntensity = baseSpec * 0.78;
  } else if (Number.isFinite(material.userData.orbyCreativeLookBaseSpecular)) {
    material.specularIntensity = material.userData.orbyCreativeLookBaseSpecular;
  }

  material.samples = samples;
  if ('transmissionResolutionScale' in material) {
    material.transmissionResolutionScale = resolveCreativeLookTransmissionResolutionScale(samples);
  }

  material.userData.orbyTransmissionTuning = {
    samples,
    doubleSide,
    solidMeshGlass,
    dispersion: normalizeCreativeLookTransmissionDispersion(opts.dispersion),
  };

  attachCreativeLookTransmissionShaderPatch(material, {
    viewBlur,
    solidMeshGlass,
    solidMinRoughness,
    dispersionOn: dispersion > 1e-4,
  });

  if (sideChanged || roughnessChanged || dispersionChanged || tuningChanged) {
    material.needsUpdate = true;
  }
}

/**
 * @param {{
 *   transmissionSamples?: number,
 *   transmissionDoubleSide?: boolean,
 *   transmissionSolidMeshGlass?: boolean,
 *   transmissionDispersion?: number,
 * } | null | undefined} creativeLook
 */
export function creativeLookTransmissionTuningFromState(creativeLook) {
  return {
    samples: normalizeCreativeLookTransmissionSamples(creativeLook?.transmissionSamples),
    doubleSide: creativeLook?.transmissionDoubleSide === true,
    solidMeshGlass: creativeLook?.transmissionSolidMeshGlass === true,
    dispersion: normalizeCreativeLookTransmissionDispersion(creativeLook?.transmissionDispersion),
  };
}

/**
 * Import KHR volumes (amber / resin): cull inward shell faces and add extra
 * transmission roughness so geometry seen through the glass softens.
 * Does not change material.side — the shader discard handles inner facets.
 *
 * @param {import('three').MeshPhysicalMaterial} material
 * @param {{ refractionBlur?: number, solidMesh?: boolean }} [opts]
 */
export function applyImportPhysicalTransmissionMeshPatch(material, opts = {}) {
  if (!material?.isMeshPhysicalMaterial) return;
  const blur = THREE.MathUtils.clamp(Number(opts.refractionBlur) || 0, 0, 1);
  const solidMesh = opts.solidMesh !== false;
  const viewBlur = THREE.MathUtils.lerp(0.08, 0.64, blur);
  const solidMinRoughness = solidMesh
    ? THREE.MathUtils.lerp(0.14, 0.55, blur)
    : 0;
  attachCreativeLookTransmissionShaderPatch(material, {
    viewBlur,
    solidMeshGlass: solidMesh,
    solidMinRoughness,
    dispersionOn: false,
  });
}

/** True when Shader Lab glass transmission controls should show in the shelf. */
export function creativeLookTransmissionControlsVisible(state) {
  if (!state?.creativeLook?.enabled) return false;
  return isPhysicalTransmissionCreativeLookPreset(state.creativeLook.preset);
}
