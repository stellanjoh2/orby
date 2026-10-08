import * as THREE from 'three';
import { clone as cloneSkinnedHierarchy } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/SkeletonUtils.js';
import { centerModelGeometryOnRoot } from './centerModelPivot.js';
import {
  MATERIAL_MAP_TEXTURE_PROPS,
} from '../render/disposeMaterialTextures.js';
import { deepClone } from '../utils/deepClone.js';
import {
  captureObjectAssetState,
  defaultObjectAssetState,
  placeAssetBeside,
  readObjectTransform,
  sanitizeObjectAssetSlice,
  writeObjectAssetState,
} from './objectAssetState.js';
import { AnimationController } from '../render/AnimationController.js';

/**
 * Several imported assets in one studio.
 * Each asset keeps its own Object-menu state and pivot.
 * Studio, lights, and Camera & FX stay on the scene.
 */
export class SceneObjectsController {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {object[]} */
    this.assets = [];
    /** @type {number | null} */
    this.activeId = null;
    this._nextId = 1;
    /** While a new asset is being installed, do not snapshot the previous Object menu onto it. */
    this._installing = false;
  }

  isMulti() {
    return this.assets.length > 1;
  }

  usesPerAssetTransforms() {
    return this.assets.some((asset) => asset.group);
  }

  getActive() {
    if (this.activeId == null) return null;
    return this.assets.find((asset) => asset.id === this.activeId) ?? null;
  }

  /** Assets other than the one the Object menu is editing. */
  peerAssets() {
    return this.assets.filter((asset) => asset.id !== this.activeId && asset.mesh);
  }

  /** Pivot that Object rotate / scale / move should write. */
  getTransformTarget() {
    const active = this.getActive();
    if (active?.group) return active.group;
    return this.scene.modelRoot;
  }

  getPickRoots() {
    if (!this.isMulti()) return [];
    return this.assets.map((asset) => asset.group || asset.mesh).filter(Boolean);
  }

  /**
   * @param {import('three').Object3D | null | undefined} object
   * @returns {number | null}
   */
  findAssetIdFromObject(object) {
    let node = object;
    while (node) {
      const id = node.userData?.orbyAssetId;
      if (Number.isFinite(id)) return id;
      node = node.parent;
    }
    return null;
  }

  getSnapshot() {
    const active = this.getActive();
    return {
      count: this.assets.length,
      activeId: this.activeId,
      multi: this.isMulti(),
      assets: this.assets.map((asset) => ({ id: asset.id, name: asset.name })),
      activeName: active?.name ?? null,
    };
  }

  reset() {
    for (const asset of this.assets) {
      AnimationController.disposeSession(asset.animationSession);
      asset.animationSession = null;
    }
    this.assets = [];
    this.activeId = null;
    this.scene.transformController?.setTarget(this.scene.modelRoot);
    this._emit();
  }

  /** Park the live GLB mixer on an asset so selection does not stop or unpause it. */
  _parkActiveAnimationSession(asset = this.getActive()) {
    if (!asset) return;
    const session = this.scene.animationController?.detachSession?.();
    if (session) asset.animationSession = session;
  }

  /**
   * Restore a parked mixer, or bind clips fresh when the asset has none parked.
   * @returns {boolean} true when a parked session was reattached
   */
  _restoreAnimationSession(asset) {
    const scene = this.scene;
    const ac = scene.animationController;
    if (!ac || !asset) return false;
    if (asset.animationSession) {
      const session = asset.animationSession;
      asset.animationSession = null;
      ac.attachSession(session);
      return true;
    }
    ac.setModel?.(asset.mesh, asset.animations ?? []);
    return false;
  }

  /**
   * Remember the current single model before a second import.
   * @returns {object | null}
   */
  ensureActiveRegistered() {
    if (this.assets.length) return this.getActive();
    const mesh = this.scene.currentModel;
    if (!mesh) return null;
    const record = this._createRecord(mesh, {
      file: this.scene.currentFile,
      animations: this.scene.animationController?.animations ?? [],
      group: null,
    });
    this.assets.push(record);
    this.activeId = record.id;
    this.commitActive();
    return record;
  }

  /** Copy the live Object menu and import bindings onto the active asset. */
  commitActive() {
    if (this._installing) return;
    const asset = this.getActive();
    if (!asset) return;
    const slice = captureObjectAssetState(this.scene.stateStore);
    const pivot = asset.group || this.scene.modelRoot;
    Object.assign(slice, readObjectTransform(pivot));
    sanitizeObjectAssetSlice(slice, asset.mesh, defaultObjectAssetState(this.scene.stateStore));
    asset.objectState = slice;
    asset.file = this.scene.currentFile ?? asset.file ?? null;
    asset.gltfMetadata = this.scene.currentAssetMetadata ?? asset.gltfMetadata ?? null;
    asset.svgExtrudeImporter = this.scene.svgExtrudeImporter ?? null;
    asset.isSvgExtrudeModel = !!this.scene.isSvgExtrudeModel;
    asset.isImportSmoothingModel = !!this.scene.isImportSmoothingModel;
    asset.pivotCenterDelta = this.scene._pivotCenterDelta ?? null;
    asset.fbxImportBundle = this.scene._fbxImportBundle ?? null;
    if (this.scene.animationController?.animations) {
      asset.animations = this.scene.animationController.animations;
    }
  }

  /**
   * Move user transforms off modelRoot onto each asset so later imports do not ride along.
   */
  promoteToPerAssetTransforms() {
    const scene = this.scene;
    const root = scene.modelRoot;
    if (!root) return;

    const position = root.position.clone();
    const quaternion = root.quaternion.clone();
    const scale = root.scale.clone();
    const needsPromote = this.assets.some((asset) => !asset.group);
    if (!needsPromote) return;

    for (const asset of this.assets) {
      if (asset.group || !asset.mesh) continue;
      root.remove(asset.mesh);
    }
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.set(1, 1, 1);
    root.visible = true;

    for (const asset of this.assets) {
      if (asset.group || !asset.mesh) continue;
      const group = new THREE.Group();
      group.name = asset.name;
      group.userData.orbyAssetId = asset.id;
      group.position.copy(position);
      group.quaternion.copy(quaternion);
      group.scale.copy(scale);
      group.add(asset.mesh);
      root.add(group);
      asset.group = group;
    }

    scene.transformController?.setTarget(this.getTransformTarget());
    scene._syncTransformControlsForObjectHidden?.();
  }

  /**
   * @param {import('three').Object3D} mesh
   * @param {{ file?: File | null, animations?: object[], name?: string }} info
   */
  beginAdditionalAsset(mesh, info = {}) {
    const scene = this.scene;
    const record = this._createRecord(mesh, {
      file: info.file ?? null,
      animations: info.animations ?? [],
      group: new THREE.Group(),
    });
    if (info.name) record.name = this._uniqueName(info.name);
    record.group.name = record.name;
    record.group.userData.orbyAssetId = record.id;
    record.group.add(mesh);
    scene.modelRoot.add(record.group);
    if (info.center !== false) centerModelGeometryOnRoot(record.group, mesh);

    this.assets.push(record);
    this.activeId = record.id;
    scene.currentModel = mesh;
    scene.currentFile = record.file;
    scene.transformController?.setTarget(record.group);
    scene.ui?.updateTitle?.(record.name);
    scene.ui?.updateTopBarDetail?.(`${record.name} — Loading…`);
    return record;
  }

  /**
   * Clone the active object and park the copy beside it.
   * The clone keeps the source look, including shaders, and does not stack on it.
   */
  duplicateActive() {
    const scene = this.scene;
    if (!scene.currentModel) return null;
    this.ensureActiveRegistered();
    this.commitActive();
    const source = this.getActive();
    if (!source?.mesh) return null;
    this.promoteToPerAssetTransforms();

    const cloned = withPlainUserData(source.mesh, () => cloneSkinnedHierarchy(source.mesh));
    cloned.traverse((node) => {
      if (node.userData && 'orbyAssetId' in node.userData) delete node.userData.orbyAssetId;
    });
    this._uniquifyClonedResources(source.mesh, cloned);
    this._copyMaterialBaselines(source.mesh, cloned);

    const record = this.beginAdditionalAsset(cloned, {
      file: source.file,
      animations: source.animations,
      name: source.name,
      center: false,
    });
    const sourcePivot = source.group || scene.modelRoot;
    record.group.quaternion.copy(sourcePivot.quaternion);
    record.group.scale.copy(sourcePivot.scale);
    record.gltfMetadata = source.gltfMetadata ?? null;
    record.svgExtrudeImporter = source.svgExtrudeImporter ?? null;
    record.isSvgExtrudeModel = !!source.isSvgExtrudeModel;
    record.isImportSmoothingModel = !!source.isImportSmoothingModel;
    record.pivotCenterDelta = clonePivotDelta(source.pivotCenterDelta);
    record.fbxImportBundle = source.fbxImportBundle ?? null;

    this.placeAdditionalAsset(record);

    const slice = source.objectState
      ? deepClone(source.objectState)
      : defaultObjectAssetState(scene.stateStore);
    slice.objectHidden = false;
    Object.assign(slice, readObjectTransform(record.group));
    record.objectState = slice;

    const id = record.id;
    this._parkActiveAnimationSession(source);
    this.activeId = null;
    this.select(id, { commit: false, applyLook: false });
    scene.ui?.showToast?.('Object duplicated', 2200, { notification: false });
    return record;
  }

  /** Remove the active object. The last one clears the scene. */
  deleteActive() {
    const scene = this.scene;
    if (!scene.currentModel) return false;
    this.ensureActiveRegistered();
    const active = this.getActive();
    if (!active) return false;
    if (this.assets.length <= 1) {
      scene.clearModel();
      scene.ui?.showToast?.('Object deleted', 2200, { notification: false });
      return true;
    }

    const index = this.assets.findIndex((asset) => asset.id === active.id);
    const next = this.assets[index + 1] || this.assets[index - 1];
    const node = active.group || active.mesh;
    AnimationController.disposeSession(active.animationSession);
    active.animationSession = null;
    // Drop the live mixer with the deleted asset (do not park it onto the next one).
    scene.animationController?.dispose?.();
    this.assets = this.assets.filter((asset) => asset.id !== active.id);
    this.activeId = null;
    this.select(next.id, { commit: false });
    node.parent?.remove(node);
    this._disposeAssetNode(node);
    scene.ui?.showToast?.('Object deleted', 2200, { notification: false });
    scene.requestRender?.();
    return true;
  }

  /** Sit the new asset beside the ones already in the scene and match the offset sliders. */
  placeAdditionalAsset(record) {
    const anchors = this.assets
      .filter((asset) => asset.id !== record.id)
      .map((asset) => asset.group || asset.mesh);
    placeAssetBeside(anchors, record.group);
    const live = readObjectTransform(record.group);
    this.scene.stateStore.batch(() => {
      this.scene.stateStore.set('xOffset', live.xOffset);
      this.scene.stateStore.set('yOffset', live.yOffset);
      this.scene.stateStore.set('zOffset', live.zOffset);
    });
  }

  captureActiveState() {
    this.commitActive();
  }

  /**
   * Point scene systems at one asset and show that asset's Object menu.
   * @param {number} id
   * @param {{ commit?: boolean, applyLook?: boolean }} [options]
   */
  select(id, options = {}) {
    const commit = options.commit !== false;
    if (id === this.activeId) {
      this._emit();
      return false;
    }
    const next = this.assets.find((asset) => asset.id === id);
    if (!next?.mesh) return false;
    const previous = this.getActive();
    if (commit) this.commitActive();
    this._parkActiveAnimationSession(previous);

    this.activeId = next.id;
    const scene = this.scene;
    scene.currentModel = next.mesh;
    scene.currentFile = next.file ?? null;
    scene.currentAssetMetadata = next.gltfMetadata ?? null;
    scene.svgExtrudeImporter = next.svgExtrudeImporter ?? null;
    scene.isSvgExtrudeModel = !!next.isSvgExtrudeModel;
    scene.isImportSmoothingModel = !!next.isImportSmoothingModel;
    scene._pivotCenterDelta = next.pivotCenterDelta ?? null;
    scene._fbxImportBundle = next.fbxImportBundle ?? null;

    const defaults = defaultObjectAssetState(scene.stateStore);
    const slice = next.objectState ? { ...next.objectState } : defaults;
    sanitizeObjectAssetSlice(slice, next.mesh, defaults);
    const pivot = next.group || scene.modelRoot;
    Object.assign(slice, readObjectTransform(pivot));
    next.objectState = slice;

    const materials = scene.materialController;
    // Display mode stays on the scene. A stored per-asset shading value must not
    // retarget the controller before the live mode is applied.
    const look = { ...slice };
    delete look.shading;
    materials?.focusModel?.(next.mesh, look);
    materials?.beginAssetMaterialLock?.();
    try {
      writeObjectAssetState(scene.stateStore, slice);
    } finally {
      materials?.endAssetMaterialLock?.();
    }
    const displayMode = scene.stateStore.peekState()?.shading || materials?.currentShading;
    if (options.applyLook !== false && this.isMulti()) {
      materials?.setShading?.(displayMode);
    }

    scene.transformController?.setTarget(this.getTransformTarget());
    scene.setAutoRotateSpeed?.(slice.autoRotate ?? 0, { silent: true });
    scene.setAutoRotateDirection?.(slice.autoRotateDirection ?? 'forward');
    scene.updateWireframeOverlay?.();
    scene.modifierController?.parkWithoutRestore?.();
    scene.modifierController?.bindModel?.(next.mesh);
    scene.applyModifiersFromState?.(slice);
    const restoredSession = this._restoreAnimationSession(next);
    const clipMode = restoredSession
      ? (scene.animationController?.clipPlaybackMode ?? 'loop')
      : (slice.animation?.clipPlaybackMode ?? 'loop');
    scene.animationController?.setClipPlaybackMode?.(clipMode);
    scene.ui?.syncAnimationClipMode?.(
      clipMode,
      (scene.animationController?.animations?.length ?? next.animations?.length ?? 0) > 0,
    );
    scene.diagnosticsController?.setModel?.(next.mesh, displayMode);
    scene.topologyWarningsOverlay?.setModel?.(next.mesh);
    if (slice.animation) {
      scene.diagnosticsController?.setJointScale?.(slice.animation.jointScale ?? 0.5);
      scene.diagnosticsController?.setBoneStrokeWidth?.(slice.animation.boneStrokeWidth ?? 2);
      scene.setAnimationShowBones?.(!!slice.animation.showBones);
      scene.setAnimationShowJointNames?.(!!slice.animation.showJointNames);
    }
    scene.fontTextRevealController?.bindModel?.(next.mesh);
    scene.creativeLookSceneSync?.syncAsciiPass?.();
    scene.creativeLookSceneSync?.syncTransmissionBackdrop?.();
    this.applyVisibility();
    scene._syncTransformControlsForObjectHidden?.();
    this.refreshFocusBounds();
    scene.updateStatsUI?.(next.file ?? null, next.mesh, next.gltfMetadata ?? null);
    scene._emitImportSmoothingControlsVisibility?.();
    scene.ui?.updateTitle?.(next.name);
    scene.ui?.updateTopBarDetail?.(`${next.name} — Idle`);
    scene.eventBus?.emit?.('scene:asset-focus-changed', { id: next.id, name: next.name });
    scene.requestRender?.();
    this._emit();
    return true;
  }

  /**
   * Drop a half-added asset and return the Object menu to the previous one.
   * @param {number} failedId
   * @param {number | null} previousId
   */
  abortAdditional(failedId, previousId) {
    const failed = this.assets.find((asset) => asset.id === failedId);
    if (failed) {
      AnimationController.disposeSession(failed.animationSession);
      failed.animationSession = null;
    }
    if (this.activeId === failedId) {
      this.scene.animationController?.dispose?.();
    }
    if (failed?.group) {
      failed.group.parent?.remove(failed.group);
      this.scene.modelLifecycle?.disposeNode?.(failed.group);
    }
    this.assets = this.assets.filter((asset) => asset.id !== failedId);
    this.activeId = null;
    if (previousId != null) this.select(previousId, { commit: false });
    else this._emit();
  }

  applyVisibility() {
    const scene = this.scene;
    if (!this.usesPerAssetTransforms()) return;
    if (scene.modelRoot) scene.modelRoot.visible = true;
    const liveHidden = !!scene.stateStore.getState().objectHidden;
    for (const asset of this.assets) {
      if (!asset.group) continue;
      const hidden = asset.id === this.activeId
        ? liveHidden
        : !!asset.objectState?.objectHidden;
      asset.group.visible = !hidden;
    }
  }

  /** Spin assets that are not selected, using the speed saved on each one. */
  tick(delta) {
    if (!this.usesPerAssetTransforms() || !delta) return;
    for (const asset of this.assets) {
      if (asset.id === this.activeId || !asset.group) continue;
      const speed = Number(asset.objectState?.autoRotate) || 0;
      if (!speed) continue;
      const sign = asset.objectState?.autoRotateDirection === 'reverse' ? -1 : 1;
      asset.group.rotation.y += delta * speed * sign;
    }
  }

  refreshFocusBounds() {
    const scene = this.scene;
    if (scene.currentModel) {
      scene.cameraController?.refreshModelBounds(scene.currentModel);
    }
    if (!this.isMulti()) return;
    const box = new THREE.Box3();
    for (const asset of this.assets) {
      const node = asset.group || asset.mesh;
      if (!node?.visible) continue;
      box.expandByObject(node);
    }
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    scene._syncShadowCameraBounds?.({
      box,
      size,
      center,
      radius: size.length() / 2,
    });
  }

  /**
   * @param {import('three').Object3D} mesh
   * @param {{ file?: File | null, animations?: object[], group?: import('three').Group | null }} info
   */
  _createRecord(mesh, info) {
    const id = this._nextId++;
    const base = this._displayName(info.file, mesh);
    const name = this._uniqueName(base);
    mesh.userData.orbyAssetId = id;
    return {
      id,
      name,
      group: info.group ?? null,
      mesh,
      file: info.file ?? null,
      animations: info.animations ?? [],
      gltfMetadata: null,
      objectState: null,
      svgExtrudeImporter: null,
      isSvgExtrudeModel: false,
      isImportSmoothingModel: false,
      pivotCenterDelta: null,
      fbxImportBundle: null,
      animationSession: null,
    };
  }

  /**
   * @param {File | null | undefined} file
   * @param {import('three').Object3D} mesh
   */
  _displayName(file, mesh) {
    const fromFile = typeof file?.name === 'string'
      ? file.name.replace(/\.[^/.]+$/, '')
      : '';
    return fromFile || mesh?.name || `Object ${this._nextId}`;
  }

  /** @param {string} base */
  _uniqueName(base) {
    const name = base?.trim() || 'Object';
    const taken = new Set(this.assets.map((asset) => asset.name));
    if (!taken.has(name)) return name;
    let index = 2;
    while (taken.has(`${name} ${index}`)) index += 1;
    return `${name} ${index}`;
  }

  _emit() {
    this.scene.eventBus?.emit?.('scene:assets-changed', this.getSnapshot());
  }

  /**
   * Give the clone its own geometry and materials so disposing one object
   * leaves the other intact. Textures stay shared.
   * @param {import('three').Object3D} source
   * @param {import('three').Object3D} clone
   */
  _uniquifyClonedResources(source, clone) {
    const srcNodes = [];
    const dstNodes = [];
    source.traverse((node) => {
      if (node.isMesh || node.isLine || node.isPoints) srcNodes.push(node);
    });
    clone.traverse((node) => {
      if (node.isMesh || node.isLine || node.isPoints) dstNodes.push(node);
    });
    const count = Math.min(srcNodes.length, dstNodes.length);
    for (let i = 0; i < count; i += 1) {
      const src = srcNodes[i];
      const dst = dstNodes[i];
      if (src.geometry) dst.geometry = src.geometry.clone();
      dst.material = cloneMaterial(src.material);
      const cached = src.userData?.orbyModifierBase;
      if (cached?.base) {
        dst.userData.orbyModifierBase = {
          base: new Float32Array(cached.base),
          baseNormal: cached.baseNormal ? new Float32Array(cached.baseNormal) : null,
        };
      }
    }
  }

  /**
   * @param {import('three').Object3D} source
   * @param {import('three').Object3D} clone
   */
  _copyMaterialBaselines(source, clone) {
    const baselines = this.scene.materialController?.originalMaterials;
    if (!baselines) return;
    const srcNodes = [];
    const dstNodes = [];
    source.traverse((node) => {
      if (node.isMesh) srcNodes.push(node);
    });
    clone.traverse((node) => {
      if (node.isMesh) dstNodes.push(node);
    });
    const count = Math.min(srcNodes.length, dstNodes.length);
    for (let i = 0; i < count; i += 1) {
      const stored = baselines.get(srcNodes[i]) ?? srcNodes[i].material;
      baselines.set(dstNodes[i], cloneMaterial(stored));
    }
  }

  /**
   * Dispose one asset's geometry and materials. Skip textures still used by
   * a remaining object.
   * @param {import('three').Object3D} root
   */
  _disposeAssetNode(root) {
    const keep = new Set();
    for (const asset of this.assets) {
      this._noteObjectTextures(asset.mesh, keep);
      if (asset.group && asset.group !== asset.mesh) this._noteObjectTextures(asset.group, keep);
    }
    const seen = new Set();
    const baselines = this.scene.materialController?.originalMaterials;
    root.traverse((node) => {
      if (!node.isMesh && !node.isLine && !node.isPoints) return;
      node.geometry?.dispose?.();
      const mats = materialList(node.material);
      const stored = baselines?.get(node);
      for (const mat of materialList(stored)) {
        if (mat && !mats.includes(mat)) mats.push(mat);
      }
      for (const mat of mats) {
        disposeMaterialTexturesExcept(mat, keep, seen);
        mat.dispose?.();
      }
    });
  }

  /**
   * @param {import('three').Object3D | null | undefined} root
   * @param {Set<string>} into
   */
  _noteObjectTextures(root, into) {
    if (!root) return;
    const baselines = this.scene.materialController?.originalMaterials;
    root.traverse((node) => {
      noteMaterialTextures(node.material, into);
      if (baselines) noteMaterialTextures(baselines.get(node), into);
    });
  }
}

/**
 * @param {import('three').Material | import('three').Material[] | null | undefined} material
 */
function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map((mat) => cloneOneMaterial(mat));
  return cloneOneMaterial(material);
}

/**
 * Material.clone JSON-copies userData and throws when a shader hook stored
 * a function or a live object there. Clone from a plain snapshot instead.
 * @param {import('three').Material | null | undefined} material
 */
function cloneOneMaterial(material) {
  if (!material?.clone) return material;
  const saved = material.userData;
  material.userData = plainUserData(saved);
  try {
    const cloned = material.clone();
    cloned.userData = plainUserData(saved);
    return cloned;
  } finally {
    material.userData = saved;
  }
}

/**
 * @param {import('three').Object3D} root
 * @param {() => import('three').Object3D} cloneFn
 */
function withPlainUserData(root, cloneFn) {
  /** @type {[import('three').Object3D, object][]} */
  const saved = [];
  root.traverse((node) => {
    saved.push([node, node.userData]);
    node.userData = plainUserData(node.userData);
  });
  try {
    return cloneFn();
  } finally {
    for (const [node, data] of saved) node.userData = data;
  }
}

/** @param {object | undefined} data */
function plainUserData(data) {
  const safe = {};
  if (!data) return safe;
  for (const key of Object.keys(data)) {
    const value = data[key];
    const kind = typeof value;
    if (value == null || kind === 'string' || kind === 'number' || kind === 'boolean') {
      safe[key] = value;
    }
  }
  return safe;
}

/**
 * @param {import('three').Material | import('three').Material[] | null | undefined} material
 * @returns {import('three').Material[]}
 */
function materialList(material) {
  if (!material) return [];
  return Array.isArray(material) ? material.filter(Boolean) : [material];
}

/**
 * @param {import('three').Material | import('three').Material[] | null | undefined} material
 * @param {Set<string>} into
 */
function noteMaterialTextures(material, into) {
  for (const mat of materialList(material)) {
    for (const prop of MATERIAL_MAP_TEXTURE_PROPS) {
      const texture = mat[prop];
      if (texture?.isTexture) into.add(texture.uuid);
    }
    const uniforms = mat.uniforms;
    if (!uniforms) continue;
    for (const key of Object.keys(uniforms)) {
      const value = uniforms[key]?.value;
      if (value?.isTexture) into.add(value.uuid);
    }
  }
}

/**
 * @param {import('three').Material} material
 * @param {Set<string>} keep
 * @param {Set<string>} seen
 */
function disposeMaterialTexturesExcept(material, keep, seen) {
  if (!material) return;
  for (const prop of MATERIAL_MAP_TEXTURE_PROPS) {
    disposeTextureIfUnshared(material[prop], keep, seen);
  }
  const uniforms = material.uniforms;
  if (!uniforms) return;
  for (const key of Object.keys(uniforms)) {
    disposeTextureIfUnshared(uniforms[key]?.value, keep, seen);
  }
}

/**
 * @param {import('three').Texture | null | undefined} texture
 * @param {Set<string>} keep
 * @param {Set<string>} seen
 */
function disposeTextureIfUnshared(texture, keep, seen) {
  if (!texture?.isTexture) return;
  if (keep.has(texture.uuid) || seen.has(texture.uuid)) return;
  seen.add(texture.uuid);
  const blobUrl = texture.userData?.orbyFbxBlobUrl;
  texture.dispose();
  if (typeof blobUrl === 'string') URL.revokeObjectURL(blobUrl);
}

/**
 * @param {{ modelDelta?: import('three').Vector3, rootDelta?: import('three').Vector3 } | null | undefined} delta
 */
function clonePivotDelta(delta) {
  if (!delta?.modelDelta?.clone || !delta?.rootDelta?.clone) return delta ?? null;
  return {
    modelDelta: delta.modelDelta.clone(),
    rootDelta: delta.rootDelta.clone(),
  };
}
