import * as THREE from 'three';

/** @typedef {'geometry' | 'tangent'} NormalViewMode */

export const NORMAL_VIEW_MODES = ['geometry', 'tangent'];
export const DEFAULT_NORMAL_VIEW_MODE = 'geometry';

const OVERLAY_MATERIAL_OPTS = {
  side: THREE.DoubleSide,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  depthWrite: false,
};

const TANGENT_VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

varying vec2 vMapUv;

void main() {
  #include <uv_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  vMapUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const TANGENT_FRAGMENT = /* glsl */ `
uniform sampler2D normalMap;
uniform float hasNormalMap;
uniform float flipY;
varying vec2 vMapUv;

void main() {
  if (hasNormalMap < 0.5) {
    gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0);
    return;
  }
  vec3 tNormal = texture2D(normalMap, vMapUv).xyz * 2.0 - 1.0;
  if (flipY > 0.5) {
    tNormal.y = -tNormal.y;
  }
  tNormal = normalize(tNormal);
  gl_FragColor = vec4(tNormal * 0.5 + 0.5, 1.0);
}
`;

/**
 * @param {string | null | undefined} mode
 * @returns {NormalViewMode}
 */
export function normalizeNormalViewMode(mode) {
  return NORMAL_VIEW_MODES.includes(mode) ? mode : DEFAULT_NORMAL_VIEW_MODE;
}

/**
 * @param {import('three').Material | null | undefined} sourceMaterial
 * @param {NormalViewMode} mode
 * @param {{ isSkinned?: boolean }} [opts]
 * @returns {import('three').Material}
 */
export function createNormalViewMaterial(sourceMaterial, mode, { isSkinned = false } = {}) {
  if (normalizeNormalViewMode(mode) === 'geometry') {
    return createGeometryNormalViewMaterial({ isSkinned });
  }
  return createTangentNormalViewMaterial(sourceMaterial, { isSkinned });
}

/**
 * World-space vertex normals as RGB (standard mesh QA view).
 * @param {{ isSkinned?: boolean }} [opts]
 */
export function createGeometryNormalViewMaterial({ isSkinned = false } = {}) {
  const material = new THREE.MeshNormalMaterial({
    ...OVERLAY_MATERIAL_OPTS,
    flatShading: false,
  });
  if (isSkinned) {
    material.skinning = true;
  }
  material.userData.orbyNormalViewMode = 'geometry';
  return material;
}

/**
 * Tangent-space normal map texels as RGB; flat +Z blue when no map is assigned.
 * @param {import('three').Material | null | undefined} sourceMaterial
 * @param {{ isSkinned?: boolean }} [opts]
 */
export function createTangentNormalViewMaterial(sourceMaterial, { isSkinned = false } = {}) {
  const normalMap = sourceMaterial?.normalMap?.isTexture ? sourceMaterial.normalMap : null;
  const material = new THREE.ShaderMaterial({
    ...OVERLAY_MATERIAL_OPTS,
    uniforms: {
      normalMap: { value: normalMap },
      hasNormalMap: { value: normalMap ? 1 : 0 },
      flipY: { value: normalMap && normalMap.flipY === false ? 0 : 1 },
    },
    vertexShader: TANGENT_VERTEX,
    fragmentShader: TANGENT_FRAGMENT,
  });
  if (isSkinned) {
    material.skinning = true;
  }
  material.userData.orbyNormalViewMode = 'tangent';
  return material;
}
