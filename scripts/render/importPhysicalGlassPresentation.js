import * as THREE from 'three';
import {
  CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE,
  CREATIVE_GLASS_BASE_SPECULAR_INTENSITY,
} from './CreativeLookMaterials.js';
import { applyImportPhysicalTransmissionMeshPatch } from './creativeLookPhysicalTransmission.js';

/**
 * MeshPhysicalMaterial transmission for import / heuristic glass — refraction via Three.js
 * transmission pass; reflections via PBR roughness + env map (not planar Reflector).
 */

/** Real Three.js textures only — Material.clone() JSON-clones userData and turns maps into plain objects. */
export function isUsableImportTexture(tex) {
  return !!(tex && tex.isTexture);
}

/** Default Object → Advanced glass tint (window fallback). Not an authored amber/resin color. */
export function isDefaultGlassTintHex(hex) {
  return typeof hex !== 'string' || hex.trim().toLowerCase() === '#080808';
}

/**
 * KHR transmission / physical glass — Object brightness, metalness, and roughness
 * must not overwrite these. Named windows are handled separately via isWindowMesh.
 * @param {import('three').Material | null | undefined} m
 */
export function isImportGlassProtectedFromObjectSliders(m) {
  if (!m) return false;
  if (m.userData?.orbyGltfPhysicalGlass === true) return true;
  if (m.userData?.orbyGltfTransmissionFallback === true) return true;
  const importT = Number(m.userData?.orbyGltfImportBaseline?.transmission);
  return Number.isFinite(importT) && importT > 1e-4;
}

/**
 * Recover a Color from import baseline after Material.clone() JSON-clones userData.
 * THREE.Color.toJSON() is `[r,g,b]`; some paths store `{r,g,b}` or a hex number.
 * @param {unknown} c
 * @returns {import('three').Color | null}
 */
export function resolveBaselineColor(c) {
  if (c?.isColor) return c;
  if (Array.isArray(c) && c.length >= 3 && Number.isFinite(Number(c[0]))) {
    return new THREE.Color(Number(c[0]), Number(c[1]), Number(c[2]));
  }
  if (typeof c === 'number' && Number.isFinite(c)) return new THREE.Color(c);
  if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.trim())) {
    return new THREE.Color(c.trim());
  }
  if (c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b)) {
    return new THREE.Color(c.r, c.g, c.b);
  }
  return null;
}

/**
 * Prefer the un-cloned import snapshot. Shaded clones JSON-serialize
 * `orbyGltfImportBaseline`, which drops Color.isColor and Texture.matrix.
 * @param {object | null | undefined} liveBaseline
 * @param {object | null | undefined} importBaseline
 */
export function resolveImportGlassBaseline(liveBaseline, importBaseline) {
  const live = liveBaseline && typeof liveBaseline === 'object' ? liveBaseline : null;
  const imp = importBaseline && typeof importBaseline === 'object' ? importBaseline : null;
  const src = imp || live;
  if (!src) return null;
  const color = resolveBaselineColor(imp?.color) || resolveBaselineColor(live?.color);
  const map = isUsableImportTexture(imp?.map)
    ? imp.map
    : (isUsableImportTexture(live?.map) ? live.map : undefined);
  const transmissionMap = isUsableImportTexture(imp?.transmissionMap)
    ? imp.transmissionMap
    : (isUsableImportTexture(live?.transmissionMap) ? live.transmissionMap : undefined);
  const thicknessMap = isUsableImportTexture(imp?.thicknessMap)
    ? imp.thicknessMap
    : (isUsableImportTexture(live?.thicknessMap) ? live.thicknessMap : undefined);
  return { ...src, color, map, transmissionMap, thicknessMap };
}

/**
 * @param {{
 *   glassOpacity?: number,
 *   glassBody?: number,
 *   glassTintHex?: string,
 *   glassReflection?: number,
 * }} glass
 */
export function resolvePhysicalGlassUserParams(glass = {}) {
  const glassOpacity = Number.isFinite(Number(glass.glassOpacity))
    ? THREE.MathUtils.clamp(Number(glass.glassOpacity), 0.02, 1)
    : 0.45;
  const glassBody = Number.isFinite(Number(glass.glassBody))
    ? THREE.MathUtils.clamp(Number(glass.glassBody), 0, 1)
    : 0;
  const glassReflection = Number.isFinite(Number(glass.glassReflection))
    ? THREE.MathUtils.clamp(Number(glass.glassReflection), 0, 4)
    : 2;
  const glassRefractionBlur = Number.isFinite(Number(glass.glassRefractionBlur))
    ? THREE.MathUtils.clamp(Number(glass.glassRefractionBlur), 0, 1)
    : 0.08;
  const glassTintHex =
    typeof glass.glassTintHex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(glass.glassTintHex.trim())
      ? glass.glassTintHex.trim()
      : '#080808';
  const bodyDarken = Math.max(0.06, 1 - 0.72 * glassBody);
  const tint = new THREE.Color(glassTintHex);
  return {
    glassOpacity,
    glassBody,
    glassReflection,
    glassRefractionBlur,
    glassTintHex,
    bodyDarken,
    tint,
  };
}

/**
 * @param {import('three').MeshPhysicalMaterial} mat
 * @param {ReturnType<typeof resolvePhysicalGlassUserParams>} params
 * @param {{
 *   baselineTransmission?: number,
 *   baselineThickness?: number,
 *   baselineIor?: number,
 *   baselineRoughness?: number,
 *   baselineColor?: import('three').Color | null,
 *   frontFacesOnly?: boolean,
 *   baselineSide?: number,
 * }} opts
 */
export function applyPhysicalGlassSurfaceParams(mat, params, opts = {}) {
  const baseT = Number.isFinite(opts.baselineTransmission)
    ? THREE.MathUtils.clamp(opts.baselineTransmission, 0, 1)
    : 1;
  const defaultTint = isDefaultGlassTintHex(params.glassTintHex);
  const preserveAuthored = opts.preserveAuthoredColor === true && defaultTint;
  const opacityMul = preserveAuthored
    ? 1
    : THREE.MathUtils.lerp(0.58, 1, params.glassOpacity);
  mat.transmission = THREE.MathUtils.clamp(baseT * opacityMul, 0.12, 1);
  mat.thickness = Number.isFinite(opts.baselineThickness) && opts.baselineThickness > 0
    ? opts.baselineThickness
    : THREE.MathUtils.lerp(0.35, 1.1, params.glassBody);
  mat.ior = Number.isFinite(opts.baselineIor) && opts.baselineIor > 1
    ? opts.baselineIor
    : 1.5;

  mat.roughness = THREE.MathUtils.lerp(0.02, 0.72, params.glassRefractionBlur);
  if ('roughnessMap' in mat) mat.roughnessMap = null;
  mat.metalness = 0;

  const white = new THREE.Color(0xffffff);
  if (preserveAuthored && opts.baselineColor?.isColor) {
    mat.color.copy(opts.baselineColor);
    mat.attenuationColor.copy(opts.baselineColor).lerp(white, 0.55);
  } else if (opts.baselineColor?.isColor) {
    mat.color.copy(opts.baselineColor).lerp(params.tint, 0.55);
    mat.attenuationColor.copy(params.tint).lerp(white, 0.35);
  } else if (preserveAuthored || defaultTint) {
    mat.color.copy(white);
    mat.attenuationColor.copy(white);
  } else {
    mat.color.copy(params.tint);
    mat.attenuationColor.copy(params.tint).lerp(white, 0.35);
  }
  if (!preserveAuthored) {
    mat.color.multiplyScalar(params.bodyDarken);
  }

  const bodyAtten = THREE.MathUtils.lerp(
    CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE * 1.35,
    CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE * 0.42,
    params.glassBody,
  );
  mat.attenuationDistance = Math.max(
    preserveAuthored ? 2.4 : 0.18,
    bodyAtten * (preserveAuthored ? 2.8 : 1),
  );

  const reflScale = 0.55 + params.glassReflection * 0.22;
  mat.specularIntensity = CREATIVE_GLASS_BASE_SPECULAR_INTENSITY * reflScale;
  if (mat.specularColor) {
    mat.specularColor.setRGB(0.86, 0.88, 0.92);
  }

  mat.transparent = true;
  mat.opacity = 1;
  mat.depthWrite = false;
  if ('alphaHash' in mat) mat.alphaHash = false;
  mat.side = opts.frontFacesOnly
    ? THREE.FrontSide
    : (opts.baselineSide ?? THREE.DoubleSide);

  mat.userData.orbyGltfPhysicalGlass = true;
  mat.userData.orbySkipBlendMitigation = true;
  delete mat.userData.orbyGltfTransmissionFallback;
  delete mat.userData.orbyGltfGlassStandardFallback;
  mat.needsUpdate = true;
}

/**
 * @param {import('three').Material} m
 * @param {(src: import('three').Material) => import('three').MeshPhysicalMaterial} upgradeToPhysical
 * @param {ReturnType<typeof resolvePhysicalGlassUserParams>} params
 * @param {{
 *   baseline?: object | null,
 *   frontFacesOnly?: boolean,
 *   restoreMaps?: boolean,
 * }} opts
 * @returns {import('three').MeshPhysicalMaterial}
 */
export function applyImportPhysicalGlassPresentation(
  m,
  upgradeToPhysical,
  params,
  opts = {},
) {
  if (!m) return m;
  let target = m;
  if (!target.isMeshPhysicalMaterial) {
    target = upgradeToPhysical(m);
  }

  const b = resolveImportGlassBaseline(
    opts.baseline ?? m.userData?.orbyGltfImportBaseline,
    opts.importBaseline,
  );
  if (opts.restoreMaps !== false && b) {
    if (isUsableImportTexture(b.map) && !isUsableImportTexture(target.map)) {
      target.map = b.map;
    }
    if (isUsableImportTexture(b.transmissionMap) && !isUsableImportTexture(target.transmissionMap)) {
      target.transmissionMap = b.transmissionMap;
    }
    if (isUsableImportTexture(b.thicknessMap) && !isUsableImportTexture(target.thicknessMap)) {
      target.thicknessMap = b.thicknessMap;
    }
  }
  if (target.map && !isUsableImportTexture(target.map)) target.map = null;
  if (target.alphaMap && !isUsableImportTexture(target.alphaMap)) target.alphaMap = null;
  if (target.transmissionMap && !isUsableImportTexture(target.transmissionMap)) {
    target.transmissionMap = null;
  }
  if (target.thicknessMap && !isUsableImportTexture(target.thicknessMap)) {
    target.thicknessMap = null;
  }

  applyPhysicalGlassSurfaceParams(target, params, {
    baselineTransmission: Number(b?.transmission) || 1,
    baselineThickness: Number.isFinite(b?.thickness) ? b.thickness : undefined,
    baselineIor: Number.isFinite(b?.ior) ? b.ior : undefined,
    baselineRoughness: Number.isFinite(b?.roughness) ? b.roughness : undefined,
    baselineColor: resolveBaselineColor(b?.color),
    preserveAuthoredColor: true,
    frontFacesOnly: opts.frontFacesOnly,
    baselineSide: b?.side,
  });

  applyImportPhysicalTransmissionMeshPatch(target, {
    refractionBlur: params.glassRefractionBlur,
    solidMesh: true,
  });

  return target;
}

/**
 * Heuristic window meshes without KHR transmission — promote to physical glass.
 * @param {import('three').Material} m
 * @param {(src: import('three').Material) => import('three').MeshPhysicalMaterial} upgradeToPhysical
 * @param {ReturnType<typeof resolvePhysicalGlassUserParams>} params
 * @param {{ frontFacesOnly?: boolean, side?: number }} [opts]
 */
export function applyHeuristicPhysicalGlassPresentation(
  m,
  upgradeToPhysical,
  params,
  opts = {},
) {
  if (!m) return m;
  let target = m;
  if (!target.isMeshPhysicalMaterial) {
    target = upgradeToPhysical(m);
  }

  applyPhysicalGlassSurfaceParams(target, params, {
    baselineTransmission: 1,
    baselineThickness: undefined,
    baselineIor: 1.5,
    baselineRoughness: Number.isFinite(m.roughness) ? m.roughness : 0.08,
    baselineColor: m.color?.isColor ? m.color : null,
    frontFacesOnly: opts.frontFacesOnly,
    baselineSide: opts.side ?? m.side,
  });

  target.userData.orbyHeuristicPhysicalGlass = true;
  return target;
}
