import * as THREE from 'three';
import { DEFAULT_MATERIAL_ROUGHNESS } from '../constants.js';

const DEFAULT_GLYPH_FILL = '#808080';

/** @param {string} [value] */
function normalizeFontExtrudeHex(value) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return DEFAULT_GLYPH_FILL;
}

/** Same threshold as {@link ./extrudeBoxUvs.js} — cap/bevel vs side walls. */
const CAP_BEVEL_Z_THRESHOLD = 0.35;

/** Front caps and bevel faces. */
export const FONT_EXTRUDE_CAP_MATERIAL_INDEX = 0;
/** Extruded side walls. */
export const FONT_EXTRUDE_SIDE_MATERIAL_INDEX = 1;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _cb = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _faceNormal = new THREE.Vector3();

/**
 * @param {number} nx
 * @param {number} ny
 * @param {number} nz
 */
export function isFontExtrudeCapBevelFaceNormal(nx, ny, nz) {
  return Math.abs(nz) >= CAP_BEVEL_Z_THRESHOLD;
}

/**
 * @param {string} fillHex
 * @param {string} extrudeHex
 */
export function fontExtrudeTwoToneActive(fillHex, extrudeHex) {
  return normalizeFontExtrudeHex(fillHex) !== normalizeFontExtrudeHex(extrudeHex);
}

/**
 * @param {THREE.BufferGeometry} geometry — non-indexed extrude mesh (post box UVs).
 * @returns {THREE.BufferGeometry}
 */
export function reorderGeometryForFontExtrudeTwoTone(geometry) {
  if (!geometry?.attributes?.position) return geometry;

  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const triCount = Math.floor(pos.count / 3);

  /** @type {number[]} */
  const capPosition = [];
  /** @type {number[]} */
  const sidePosition = [];
  /** @type {number[]} */
  const capNormal = [];
  /** @type {number[]} */
  const sideNormal = [];
  /** @type {number[]} */
  const capUv = [];
  /** @type {number[]} */
  const sideUv = [];

  for (let t = 0; t < triCount; t += 1) {
    const i0 = t * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    _vA.fromBufferAttribute(pos, i0);
    _vB.fromBufferAttribute(pos, i1);
    _vC.fromBufferAttribute(pos, i2);
    _cb.subVectors(_vC, _vB);
    _ab.subVectors(_vA, _vB);
    _faceNormal.crossVectors(_cb, _ab);
    const len = _faceNormal.length();
    if (len > 1e-10) {
      _faceNormal.multiplyScalar(1 / len);
    } else {
      _faceNormal.set(0, 0, 1);
    }

    const targetPos = isFontExtrudeCapBevelFaceNormal(
      _faceNormal.x,
      _faceNormal.y,
      _faceNormal.z,
    )
      ? capPosition
      : sidePosition;
    const targetNormal = targetPos === capPosition ? capNormal : sideNormal;
    const targetUv = targetPos === capPosition ? capUv : sideUv;

    for (const vi of [i0, i1, i2]) {
      targetPos.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
      if (normal) {
        targetNormal.push(normal.getX(vi), normal.getY(vi), normal.getZ(vi));
      }
      if (uv) {
        targetUv.push(uv.getX(vi), uv.getY(vi));
      }
    }
  }

  const capVertCount = capPosition.length / 3;
  const sideVertCount = sidePosition.length / 3;
  if (!capVertCount && !sideVertCount) return geometry;

  const mergedPos = new Float32Array(capPosition.length + sidePosition.length);
  mergedPos.set(capPosition, 0);
  mergedPos.set(sidePosition, capPosition.length);

  const next = new THREE.BufferGeometry();
  next.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));

  if (normal && capNormal.length + sideNormal.length === mergedPos.length) {
    const mergedNormal = new Float32Array(capNormal.length + sideNormal.length);
    mergedNormal.set(capNormal, 0);
    mergedNormal.set(sideNormal, capNormal.length);
    next.setAttribute('normal', new THREE.BufferAttribute(mergedNormal, 3));
  } else {
    next.computeVertexNormals();
  }

  if (uv && capUv.length + sideUv.length === (mergedPos.length / 3) * 2) {
    const mergedUv = new Float32Array(capUv.length + sideUv.length);
    mergedUv.set(capUv, 0);
    mergedUv.set(sideUv, capUv.length);
    next.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
  }

  next.clearGroups();
  if (capVertCount > 0) {
    next.addGroup(0, capVertCount, FONT_EXTRUDE_CAP_MATERIAL_INDEX);
  }
  if (sideVertCount > 0) {
    next.addGroup(capVertCount, sideVertCount, FONT_EXTRUDE_SIDE_MATERIAL_INDEX);
  }

  next.computeBoundingBox();
  next.computeBoundingSphere();
  geometry.dispose();
  return next;
}

/**
 * @param {string} fillHex
 * @param {string} extrudeHex
 * @param {{ applyBrightness?: (color: THREE.Color) => THREE.Color }} [options]
 */
export function createFontExtrudeTwoToneMaterials(fillHex, extrudeHex, options = {}) {
  const applyBrightness = options.applyBrightness ?? ((color) => color);
  const capColor = applyBrightness(new THREE.Color(normalizeFontExtrudeHex(fillHex)));
  const sideColor = applyBrightness(new THREE.Color(normalizeFontExtrudeHex(extrudeHex)));
  return [
    new THREE.MeshStandardMaterial({
      color: capColor,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      metalness: 0.0,
      side: THREE.FrontSide,
    }),
    new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      metalness: 0.0,
      side: THREE.FrontSide,
    }),
  ];
}

/**
 * @param {THREE.Mesh} mesh
 * @param {string} fillHex
 * @param {string} extrudeHex
 * @param {{ applyBrightness?: (color: THREE.Color) => THREE.Color }} [options]
 */
export function applyFontExtrudeTwoToneToMesh(mesh, fillHex, extrudeHex, options = {}) {
  if (!mesh?.geometry || !fontExtrudeTwoToneActive(fillHex, extrudeHex)) {
    mesh.userData.orbyExtrudeTwoTone = false;
    mesh.userData.orbyFontTwoTone = false;
    return false;
  }

  mesh.geometry = reorderGeometryForFontExtrudeTwoTone(mesh.geometry);

  const disposeMaterial = (material) => {
    if (!material) return;
    if (Array.isArray(material)) material.forEach((mat) => mat?.dispose?.());
    else material.dispose?.();
  };
  disposeMaterial(mesh.material);

  mesh.material = createFontExtrudeTwoToneMaterials(fillHex, extrudeHex, options);
  mesh.userData.orbyExtrudeTwoTone = true;
  mesh.userData.orbyFontTwoTone = true;
  mesh.userData.orbyFontCapColor = normalizeFontExtrudeHex(fillHex);
  mesh.userData.orbyFontExtrudeColor = normalizeFontExtrudeHex(extrudeHex);
  return true;
}

/**
 * @param {THREE.Group} group
 * @param {string} fillHex
 * @param {string} extrudeHex
 * @param {{ applyBrightness?: (color: THREE.Color) => THREE.Color }} [options]
 */
export function applyFontExtrudeTwoToneToGroup(group, fillHex, extrudeHex, options = {}) {
  if (!group || !fontExtrudeTwoToneActive(fillHex, extrudeHex)) return;
  group.traverse((child) => {
    if (!child.isMesh || !child.userData?.orbyFontExtrude) return;
    applyFontExtrudeTwoToneToMesh(child, fillHex, extrudeHex, options);
  });
}
