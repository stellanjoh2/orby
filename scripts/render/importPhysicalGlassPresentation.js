import * as THREE from 'three';
import {
  CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE,
  CREATIVE_GLASS_BASE_SPECULAR_INTENSITY,
} from './CreativeLookMaterials.js';

/**
 * MeshPhysicalMaterial transmission for import / heuristic glass — refraction via Three.js
 * transmission pass; reflections via PBR roughness + env map (not planar Reflector).
 */

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
  const glassTintHex =
    typeof glass.glassTintHex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(glass.glassTintHex.trim())
      ? glass.glassTintHex.trim()
      : '#080808';
  const bodyDarken = Math.max(0.06, 1 - 0.72 * glassBody);
  const tint = new THREE.Color(glassTintHex);
  return { glassOpacity, glassBody, glassReflection, glassTintHex, bodyDarken, tint };
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
  const opacityMul = THREE.MathUtils.lerp(0.58, 1, params.glassOpacity);
  mat.transmission = THREE.MathUtils.clamp(baseT * opacityMul, 0.12, 1);
  mat.thickness = Number.isFinite(opts.baselineThickness) && opts.baselineThickness > 0
    ? opts.baselineThickness
    : THREE.MathUtils.lerp(0.35, 1.1, params.glassBody);
  mat.ior = Number.isFinite(opts.baselineIor) && opts.baselineIor > 1
    ? opts.baselineIor
    : 1.5;

  const importRough = Number.isFinite(opts.baselineRoughness)
    ? opts.baselineRoughness
    : 0.08;
  mat.roughness = THREE.MathUtils.clamp(importRough, 0.02, 0.42);
  mat.metalness = 0;

  if (opts.baselineColor?.isColor) {
    mat.color.copy(opts.baselineColor).lerp(params.tint, 0.55);
  } else {
    mat.color.copy(params.tint);
  }
  mat.color.multiplyScalar(params.bodyDarken);

  mat.attenuationColor.copy(params.tint).lerp(new THREE.Color(0xffffff), 0.35);
  const bodyAtten = THREE.MathUtils.lerp(
    CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE * 1.35,
    CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE * 0.42,
    params.glassBody,
  );
  mat.attenuationDistance = Math.max(0.18, bodyAtten);

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

  const b = opts.baseline ?? m.userData?.orbyGltfImportBaseline ?? null;
  if (opts.restoreMaps !== false && b) {
    if (b.map && !target.map) target.map = b.map;
    if (b.transmissionMap && !target.transmissionMap) target.transmissionMap = b.transmissionMap;
    if (b.thicknessMap && !target.thicknessMap) target.thicknessMap = b.thicknessMap;
    target.alphaMap = null;
  }

  applyPhysicalGlassSurfaceParams(target, params, {
    baselineTransmission: Number(b?.transmission) || 1,
    baselineThickness: Number.isFinite(b?.thickness) ? b.thickness : undefined,
    baselineIor: Number.isFinite(b?.ior) ? b.ior : undefined,
    baselineRoughness: Number.isFinite(b?.roughness) ? b.roughness : undefined,
    baselineColor: b?.color?.isColor ? b.color : null,
    frontFacesOnly: opts.frontFacesOnly,
    baselineSide: b?.side,
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
