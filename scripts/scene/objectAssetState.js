import * as THREE from 'three';
import { deepClone } from '../utils/deepClone.js';
import {
  hydrateObjectSliceFromFontStamp,
  reconcileFontExtrudeSliceForMesh,
} from './fontExtrudeAssetState.js';
import { isFontExtrudeModel, isSvgFileExtrudeModel } from './SvgExtrudeSceneOps.js';

export {
  stampFontExtrudeAssetSettings,
  syncFontExtrudeStampColorsFromMesh,
  readFontExtrudeAssetSettings,
  reconcileFontExtrudeSliceForMesh,
  commitFontAssetDocument,
  commitFontAssetDocumentIfOwned,
  hydrateObjectSliceFromFontStamp,
  readOwnedFontExtrude,
  resolveFontExtrudeForMesh,
} from './fontExtrudeAssetState.js';

/**
 * Object-menu state. Studio, lights, camera, and Camera & FX stay on the shared scene.
 * Display mode (shaded, unlit, clay, wireframe) is scene-wide, so selection does not
 * restore a different look on the other assets.
 * Gizmo toggles stay global so selection does not turn widgets on and off.
 * Object Info foldout (`advanced.objectInfoOpen`) is UI chrome — kept open across selects.
 * Shape Library panel (`shapeLibrary.panelOpen`) is scene chrome — selection must not open/close it.
 */
export const OBJECT_ASSET_STATE_KEYS = [
  'scale',
  'scaleY',
  'scaleZ',
  'xOffset',
  'yOffset',
  'zOffset',
  'rotationX',
  'rotationY',
  'rotationZ',
  'autoRotate',
  'autoRotateDirection',
  'objectHidden',
  'modifiers',
  'material',
  'advanced',
  'clay',
  'wireframe',
  'creativeLook',
  'fresnel',
  'subsurface',
  'fbxMapSlots',
  'fontExtrude',
  'svgExtrude',
  'shapeLibrary',
  'animation',
];

/**
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {object} source
 */
function sliceKeys(source) {
  const out = {};
  for (const key of OBJECT_ASSET_STATE_KEYS) {
    if (source[key] !== undefined) out[key] = deepClone(source[key]);
  }
  return out;
}

/** @param {import('../StateStore.js').StateStore} stateStore */
export function captureObjectAssetState(stateStore) {
  return sliceKeys(stateStore.getState());
}

/** @param {import('../StateStore.js').StateStore} stateStore */
export function defaultObjectAssetState(stateStore) {
  return sliceKeys(stateStore.getDefaults());
}

/**
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {object} slice
 */
export function writeObjectAssetState(stateStore, slice) {
  // Foldout / library disclosure is scene chrome — not per-mesh look.
  const live = stateStore.peekState();
  const objectInfoOpen = !!live?.advanced?.objectInfoOpen;
  const shapeLibraryPanelOpen = !!live?.shapeLibrary?.panelOpen;
  stateStore.batch(() => {
    for (const key of OBJECT_ASSET_STATE_KEYS) {
      if (slice?.[key] === undefined) continue;
      const value = deepClone(slice[key]);
      if (key === 'advanced' && value && typeof value === 'object') {
        value.objectInfoOpen = objectInfoOpen;
      }
      if (key === 'shapeLibrary' && value && typeof value === 'object') {
        value.panelOpen = shapeLibraryPanelOpen;
      }
      stateStore.set(key, value);
    }
  });
}

/**
 * Font and SVG extrude settings belong to that mesh only.
 * A neighbouring import must not keep the other asset's text or SVG session.
 * @param {object} slice
 * @param {import('three').Object3D | null | undefined} mesh
 * @param {object} defaults
 * @param {object | null | undefined} [parkedSlice]
 */
export function sanitizeObjectAssetSlice(slice, mesh, defaults, parkedSlice = null) {
  if (!slice || !defaults) return slice;
  const font = isFontExtrudeModel(mesh);
  const svgFile = !font && isSvgFileExtrudeModel(mesh);
  if (!font && defaults.fontExtrude) {
    slice.fontExtrude = deepClone(defaults.fontExtrude);
  }
  if (!font && !svgFile && defaults.svgExtrude) {
    slice.svgExtrude = deepClone(defaults.svgExtrude);
  }
  if (font) {
    reconcileFontExtrudeSliceForMesh(slice, mesh, parkedSlice);
    // Stamp is the document — parked objectState must never win over the mesh.
    hydrateObjectSliceFromFontStamp(slice, mesh);
  }
  return slice;
}

/**
 * Live translate / rotate / scale on an asset pivot (or modelRoot in a one-asset scene).
 * @param {import('three').Object3D | null | undefined} root
 */
export function readObjectTransform(root) {
  if (!root) {
    return {
      scale: 1,
      scaleY: 1,
      scaleZ: 1,
      xOffset: 0,
      yOffset: 0,
      zOffset: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    };
  }
  return {
    scale: root.scale.x,
    scaleY: root.scale.y,
    scaleZ: root.scale.z,
    xOffset: root.position.x,
    yOffset: root.position.y,
    zOffset: root.position.z,
    rotationX: THREE.MathUtils.radToDeg(root.rotation.x),
    rotationY: THREE.MathUtils.radToDeg(root.rotation.y),
    rotationZ: THREE.MathUtils.radToDeg(root.rotation.z),
  };
}

/**
 * Park `newcomer` just to the +X side of `anchors`, near them and the origin.
 * @param {import('three').Object3D[]} anchors
 * @param {import('three').Object3D} newcomer
 * @returns {number}
 */
export function placeAssetBeside(anchors, newcomer) {
  newcomer.updateMatrixWorld(true);
  const newcomers = new THREE.Box3().setFromObject(newcomer);
  const occupied = new THREE.Box3();
  for (const anchor of anchors) {
    if (!anchor) continue;
    anchor.updateMatrixWorld(true);
    occupied.expandByObject(anchor);
  }
  if (occupied.isEmpty() || newcomers.isEmpty()) {
    newcomer.position.x = 1.25;
    return newcomer.position.x;
  }
  const occupiedSize = occupied.getSize(new THREE.Vector3());
  const newcomerSize = newcomers.getSize(new THREE.Vector3());
  const gap = Math.max(0.25, Math.min(occupiedSize.x, newcomerSize.x) * 0.2);
  newcomer.position.x += occupied.max.x - newcomers.min.x + gap;
  return newcomer.position.x;
}
