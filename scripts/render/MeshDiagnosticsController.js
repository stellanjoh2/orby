import * as THREE from 'three';
import { LineSegments2 } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineMaterial.js';
import { ORBY_LIME } from '../constants.js';
import { expandBox3FromArmature, isBoneOnlyArmature } from '../import/bvhArmatureBounds.js';

/** Mesh opacity while "Show bones" ghosts the surface. */
const BONES_GHOST_OPACITY = 0.18;

/** Joint marker radius as a fraction of the model bounding-sphere diameter. */
const JOINT_RADIUS_FACTOR = 0.014;

const JOINT_SCALE_MIN = 0.25;
const JOINT_SCALE_MAX = 3;

const BONE_STROKE_MIN = 1;
const BONE_STROKE_MAX = 8;
const BONE_STROKE_DEFAULT = 2;

const BONE_HOVER_WHITE = 0xffffff;

/** Hovered joint highlight scale relative to base joint radius. */
const JOINT_HOVER_SCALE = 1.22;
/** Scale lerp speed — higher = snappier (~80ms settle). */
const JOINT_HOVER_SCALE_SPEED = 32;
/** Hide base joint once hover highlight is visibly enlarged. */
const JOINT_HOVER_HIDE_BASE_SCALE = 1.06;

/** SkeletonHelper expects a bone hierarchy root — not a SkinnedMesh (empty lines). */
function collectArmatureRootBones(model) {
  const roots = new Map();
  model?.traverse((child) => {
    if (!child.isSkinnedMesh || !child.skeleton?.bones?.length) return;
    for (const bone of child.skeleton.bones) {
      let root = bone;
      while (root.parent?.isBone) {
        root = root.parent;
      }
      roots.set(root.uuid, root);
    }
  });
  if (roots.size > 0) {
    return [...roots.values()];
  }

  model?.traverse((child) => {
    if (!child.isBone) return;
    let root = child;
    while (root.parent?.isBone) {
      root = root.parent;
    }
    roots.set(root.uuid, root);
  });
  return [...roots.values()];
}

function collectAllBones(model) {
  /** @type {Map<string, THREE.Bone>} name or uuid → bone (one marker per logical joint) */
  const unique = new Map();

  const register = (bone) => {
    if (!bone?.isBone) return;
    const nameKey = typeof bone.name === 'string' ? bone.name.trim() : '';
    const key = nameKey || bone.uuid;
    if (!unique.has(key)) {
      unique.set(key, bone);
    }
  };

  // Prefer skeleton bind bones (canonical for skinned GLTF / Mixamo).
  model?.traverse((child) => {
    if (child.isSkinnedMesh && child.skeleton?.bones?.length) {
      for (const bone of child.skeleton.bones) {
        register(bone);
      }
    }
  });

  model?.traverse((child) => {
    if (child.isBone) {
      register(child);
    }
  });

  return [...unique.values()];
}

function getBoneList(object) {
  const boneList = [];
  if (object.isBone === true) {
    boneList.push(object);
  }
  for (let i = 0; i < object.children.length; i++) {
    boneList.push(...getBoneList(object.children[i]));
  }
  return boneList;
}

function collectBoneSegments(rootBone) {
  return getBoneList(rootBone)
    .filter((bone) => bone.parent?.isBone)
    .map((bone) => ({ bone, parent: bone.parent }));
}

function clampBoneStrokeWidth(value) {
  return THREE.MathUtils.clamp(Number(value) || BONE_STROKE_DEFAULT, BONE_STROKE_MIN, BONE_STROKE_MAX);
}

function createBoneLineHelper(rootBone, strokeWidth, resolution) {
  const segments = collectBoneSegments(rootBone);
  const positions = new Float32Array(Math.max(6, segments.length * 6));
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  const material = new LineMaterial({
    color: new THREE.Color(ORBY_LIME).getHex(),
    linewidth: clampBoneStrokeWidth(strokeWidth),
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: false,
    worldUnits: false,
  });
  material.resolution.set(resolution.width, resolution.height);

  const lines = new LineSegments2(geometry, material);
  lines.frustumCulled = false;
  lines.renderOrder = 999;

  return { lines, material, geometry, segments, positions };
}

function computeJointRadius(model, scale = 1) {
  if (!model) return 0.01;
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) {
    expandBox3FromArmature(model, bounds);
  }
  if (bounds.isEmpty()) return 0.01;
  const size = bounds.getSize(new THREE.Vector3());
  const diameter = size.length();
  const clampedScale = THREE.MathUtils.clamp(
    Number(scale) || 1,
    JOINT_SCALE_MIN,
    JOINT_SCALE_MAX,
  );
  return Math.max(0.004, diameter * JOINT_RADIUS_FACTOR * clampedScale);
}

/** Human-readable label for rig bones (preserves name; strips common DCC prefixes). */
export function formatBoneName(bone, { fallbackIndex = null } = {}) {
  const raw = typeof bone?.name === 'string' ? bone.name.trim() : '';
  if (raw) {
    return raw.replace(/^mixamorig:/i, '');
  }
  if (fallbackIndex != null) {
    return `Bone ${fallbackIndex + 1}`;
  }
  return 'Unnamed bone';
}

export class MeshDiagnosticsController {
  constructor({ scene, modelRoot, getLineResolution = () => ({ width: 1, height: 1 }) }) {
    this.scene = scene;
    this.modelRoot = modelRoot;
    this.getLineResolution = getLineResolution;

    this.boneHelpers = [];
    this.jointMarkers = null;
    this._jointBones = [];
    this.jointScale = 0.5;
    this.boneStrokeWidth = BONE_STROKE_DEFAULT;
    this.currentModel = null;
    this.currentShading = null;
    this.showBones = false;
    this.hideMesh = false;
    this._ghostSnapshots = new Map();
    this._meshVisibilitySnapshots = new Map();
    this._jointMatrix = new THREE.Matrix4();
    this._jointPosition = new THREE.Vector3();
    this._boneParentPosition = new THREE.Vector3();
    this._jointQuaternion = new THREE.Quaternion();
    this._jointScale = new THREE.Vector3();
    this._jointHighlight = null;
    this._hoverJointIndex = -1;
    this._lastHoverJointIndex = -1;
    this._jointHighlightVisualScale = 1;
  }

  hasSkinnedSkeleton(model = this.currentModel) {
    if (!model) return false;
    let foundSkinned = false;
    model.traverse((child) => {
      if (foundSkinned) return;
      if (child.isSkinnedMesh && child.skeleton?.bones?.length) {
        foundSkinned = true;
      }
    });
    if (foundSkinned) return true;
    return isBoneOnlyArmature(model);
  }

  setModel(model, shading) {
    this.clearSkeletonVisuals();
    this.clearMeshDebugVisual();
    this.showBones = false;
    this.currentModel = model;
    this.currentShading = shading;
  }

  setShowBones(enabled) {
    this.showBones = !!enabled;
    this.refreshBoneHelpers(this.currentShading);
    return this.showBones;
  }

  setHideMesh(enabled) {
    this.hideMesh = !!enabled;
    this.syncGhostMesh();
    return this.hideMesh;
  }

  setJointScale(scale) {
    const next = THREE.MathUtils.clamp(
      Number(scale) || 0.5,
      JOINT_SCALE_MIN,
      JOINT_SCALE_MAX,
    );
    this.jointScale = next;
    if (this.jointMarkers) {
      this._updateJointMarkers();
    }
    return this.jointScale;
  }

  setBoneStrokeWidth(width) {
    this.boneStrokeWidth = clampBoneStrokeWidth(width);
    for (const entry of this.boneHelpers) {
      entry.material.linewidth = this.boneStrokeWidth;
    }
    return this.boneStrokeWidth;
  }

  syncBoneLineResolution(width, height) {
    const w = width ?? this.getLineResolution().width;
    const h = height ?? this.getLineResolution().height;
    if (!(w > 0) || !(h > 0)) return;
    for (const entry of this.boneHelpers) {
      entry.material.resolution.set(w, h);
    }
  }

  _shouldShowSkeleton() {
    return (
      !!this.currentModel
      && (this.currentShading === 'wireframe' || this.showBones)
    );
  }

  refreshBoneHelpers(shading) {
    if (shading !== undefined) {
      this.currentShading = shading;
    }

    this.clearSkeletonVisuals();

    const shouldShowSkeleton = this._shouldShowSkeleton();
    if (!shouldShowSkeleton) {
      this.syncGhostMesh();
      return;
    }

    if (this.currentModel) {
      const resolution = this.getLineResolution();
      for (const rootBone of collectArmatureRootBones(this.currentModel)) {
        const entry = createBoneLineHelper(
          rootBone,
          this.boneStrokeWidth,
          resolution,
        );
        this.scene.add(entry.lines);
        this.boneHelpers.push(entry);
      }

      for (const entry of this.boneHelpers) {
        this._updateBoneLines(entry);
      }

      this._buildJointMarkers();
      this._buildJointHighlight();
    }

    this.syncGhostMesh();
  }

  _buildJointMarkers() {
    const bones = collectAllBones(this.currentModel);
    if (!bones.length) return;

    this._jointBones = bones;

    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: ORBY_LIME,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    this.jointMarkers = new THREE.InstancedMesh(geometry, material, bones.length);
    this.jointMarkers.frustumCulled = false;
    this.jointMarkers.renderOrder = 1001;
    this.jointMarkers.userData.orbyJointMarker = true;

    this.scene.add(this.jointMarkers);

    this._updateJointMarkers();
  }

  _buildJointHighlight() {
    this._disposeJointHighlight();

    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: BONE_HOVER_WHITE,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
      transparent: false,
      opacity: 1,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1003;
    mesh.visible = false;
    this.scene.add(mesh);
    this._jointHighlight = mesh;
  }

  _disposeJointHighlight() {
    if (!this._jointHighlight) return;
    this.scene.remove(this._jointHighlight);
    this._jointHighlight.geometry?.dispose?.();
    this._jointHighlight.material?.dispose?.();
    this._jointHighlight = null;
    this._jointHighlightVisualScale = 1;
  }

  _updateBoneLines(entry) {
    if (!entry?.segments?.length) return;

    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
    }

    for (let i = 0; i < entry.segments.length; i++) {
      const { bone, parent } = entry.segments[i];
      bone.updateWorldMatrix(true, false);
      parent.updateWorldMatrix(true, false);
      bone.getWorldPosition(this._jointPosition);
      parent.getWorldPosition(this._boneParentPosition);
      const offset = i * 6;
      entry.positions[offset] = this._boneParentPosition.x;
      entry.positions[offset + 1] = this._boneParentPosition.y;
      entry.positions[offset + 2] = this._boneParentPosition.z;
      entry.positions[offset + 3] = this._jointPosition.x;
      entry.positions[offset + 4] = this._jointPosition.y;
      entry.positions[offset + 5] = this._jointPosition.z;
    }

    entry.geometry.setPositions(entry.positions);
  }

  _updateJointMarkers() {
    if (!this.jointMarkers || !this._jointBones.length) {
      return;
    }

    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
    }

    const radius = computeJointRadius(this.currentModel, this.jointScale);
    const hiddenJointIndex = this._getHiddenJointIndex();

    for (let i = 0; i < this._jointBones.length; i++) {
      const bone = this._jointBones[i];
      bone.updateWorldMatrix(true, false);
      bone.getWorldPosition(this._jointPosition);
      this._jointQuaternion.identity();
      const jointRadius = i === hiddenJointIndex ? 0 : radius;
      this._jointScale.set(jointRadius, jointRadius, jointRadius);
      this._jointMatrix.compose(
        this._jointPosition,
        this._jointQuaternion,
        this._jointScale,
      );
      this.jointMarkers.setMatrixAt(i, this._jointMatrix);
    }

    this.jointMarkers.instanceMatrix.needsUpdate = true;
  }

  refreshGhostMesh() {
    this.syncGhostMesh();
  }

  syncGhostMesh() {
    if (!this.showBones) {
      this.clearMeshDebugVisual();
      return;
    }
    if (this.hideMesh) {
      this.clearGhostMesh();
      this.applyHideMesh();
    } else {
      this.restoreMeshVisibility();
      this.applyGhostMesh();
    }
  }

  _isDebugMeshTarget(child) {
    return (
      child.isMesh
      && !child.userData.isWireframeOverlay
      && !child.userData.isUvCheckerOverlay
      && !child.userData.isNormalViewOverlay
      && !child.userData.isTopologyWarningsOverlay
    );
  }

  applyHideMesh() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!this._isDebugMeshTarget(child)) return;
      if (!this._meshVisibilitySnapshots.has(child)) {
        this._meshVisibilitySnapshots.set(child, child.visible);
      }
      child.visible = false;
    });
  }

  restoreMeshVisibility() {
    this._meshVisibilitySnapshots.forEach((visible, mesh) => {
      mesh.visible = visible;
    });
    this._meshVisibilitySnapshots.clear();
  }

  clearMeshDebugVisual() {
    this.clearGhostMesh();
    this.restoreMeshVisibility();
  }

  applyGhostMesh() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!this._isDebugMeshTarget(child)) {
        return;
      }

      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const material of materials) {
        if (!material || this._ghostSnapshots.has(material.uuid)) continue;

        this._ghostSnapshots.set(material.uuid, {
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });

        material.transparent = true;
        material.opacity = BONES_GHOST_OPACITY;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    });
  }

  clearGhostMesh() {
    this._ghostSnapshots.forEach((snapshot, uuid) => {
      const material = this._findMaterialByUuid(uuid);
      if (!material) return;
      material.opacity = snapshot.opacity;
      material.transparent = snapshot.transparent;
      material.depthWrite = snapshot.depthWrite;
      material.needsUpdate = true;
    });
    this._ghostSnapshots.clear();
  }

  _findMaterialByUuid(uuid) {
    if (!this.currentModel) return null;
    let found = null;
    this.currentModel.traverse((child) => {
      if (found || !child.isMesh) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        if (material?.uuid === uuid) {
          found = material;
        }
      }
    });
    return found;
  }

  clearSkeletonVisuals() {
    this._hoverJointIndex = -1;
    this._lastHoverJointIndex = -1;
    this._jointHighlightVisualScale = 1;
    if (this._jointHighlight) {
      this._jointHighlight.visible = false;
    }
    this.boneHelpers.forEach((entry) => {
      this.scene.remove(entry.lines);
      entry.geometry?.dispose?.();
      entry.material?.dispose?.();
    });
    this.boneHelpers = [];
    this._disposeJointHighlight();
    this.clearJointMarkers();
  }

  clearJointMarkers() {
    if (!this.jointMarkers) return;
    this.scene.remove(this.jointMarkers);
    this.jointMarkers.geometry?.dispose?.();
    this.jointMarkers.material?.dispose?.();
    this.jointMarkers = null;
    this._jointBones = [];
  }

  clearBoneHelpers() {
    this.clearSkeletonVisuals();
  }

  hasActiveDiagnostics() {
    return this.boneHelpers.length > 0 || !!this.jointMarkers;
  }

  /**
   * Pick a joint under the cursor ray.
   * @param {THREE.Raycaster} raycaster — must already have ray set from camera + NDC pointer
   * @returns {{ bone: THREE.Bone, jointIndex: number }|null}
   */
  pickJoint(raycaster) {
    if (!this.jointMarkers || !this._jointBones.length || !raycaster) return null;

    const meshPick = this._pickJointFromMesh(raycaster);
    if (meshPick) return meshPick;

    return this._pickJointByProximity(raycaster);
  }

  _pickJointFromMesh(raycaster) {
    const jointHits = raycaster.intersectObject(this.jointMarkers, false);
    if (jointHits.length === 0) return null;

    const instanceId = jointHits[0].instanceId;
    if (instanceId == null || !this._jointBones[instanceId]) return null;

    return {
      bone: this._jointBones[instanceId],
      jointIndex: instanceId,
    };
  }

  _pickJointByProximity(raycaster) {
    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
    }

    const pickRadius = computeJointRadius(this.currentModel, this.jointScale) * 1.75;
    const ray = raycaster.ray;

    let bestIndex = -1;
    let bestDist = pickRadius;

    for (let i = 0; i < this._jointBones.length; i++) {
      const bone = this._jointBones[i];
      bone.updateWorldMatrix(true, false);
      bone.getWorldPosition(this._jointPosition);
      const dist = ray.distanceToPoint(this._jointPosition);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) return null;

    return {
      bone: this._jointBones[bestIndex],
      jointIndex: bestIndex,
    };
  }

  /** @deprecated Use pickJoint */
  pickBone(raycaster) {
    return this.pickJoint(raycaster);
  }

  setJointHover(pick) {
    if (!pick?.bone || pick.jointIndex == null || pick.jointIndex < 0) {
      this.clearBoneHover();
      return;
    }

    const prevIndex = this._hoverJointIndex;
    const switchingJoint = prevIndex >= 0 && prevIndex !== pick.jointIndex;
    const entering = prevIndex < 0;

    this._lastHoverJointIndex = pick.jointIndex;
    this._hoverJointIndex = pick.jointIndex;

    if (switchingJoint && this._jointHighlightVisualScale > 1.05) {
      this._jointHighlightVisualScale = JOINT_HOVER_SCALE;
    } else if (entering && this._jointHighlightVisualScale < 1.02) {
      this._jointHighlightVisualScale = 1;
    }

    if (this._jointHighlight) {
      this._jointHighlight.visible = true;
    }
    this._updateJointHighlightPosition(this._hoverJointIndex);
  }

  clearBoneHover() {
    this._hoverJointIndex = -1;
  }

  /** Lime joint hidden once hover highlight has grown in (keeps pick target stable). */
  _getHiddenJointIndex() {
    if (!this._jointHighlight?.visible) return -1;
    if (this._jointHighlightVisualScale < JOINT_HOVER_HIDE_BASE_SCALE) return -1;
    if (this._hoverJointIndex >= 0) return this._hoverJointIndex;
    if (this._lastHoverJointIndex >= 0) return this._lastHoverJointIndex;
    return -1;
  }

  _tickJointHighlightScale(delta) {
    if (!this._jointHighlight) return;

    const targetScale = this._hoverJointIndex >= 0 ? JOINT_HOVER_SCALE : 1;
    const t = 1 - Math.exp(-JOINT_HOVER_SCALE_SPEED * delta);
    this._jointHighlightVisualScale += (targetScale - this._jointHighlightVisualScale) * t;

    if (Math.abs(this._jointHighlightVisualScale - targetScale) < 0.001) {
      this._jointHighlightVisualScale = targetScale;
    }

    const animatingOut = this._hoverJointIndex < 0 && this._jointHighlightVisualScale > 1.001;
    const active = this._hoverJointIndex >= 0;

    if (active || animatingOut) {
      const jointIndex = active ? this._hoverJointIndex : this._lastHoverJointIndex;
      if (jointIndex >= 0) {
        this._updateJointHighlightPosition(jointIndex);
        this._jointHighlight.visible = true;
        return;
      }
    }

    this._jointHighlight.visible = false;
    this._jointHighlightVisualScale = 1;
  }

  _updateJointHighlightPosition(jointIndex) {
    if (
      !this._jointHighlight
      || jointIndex == null
      || jointIndex < 0
      || !this._jointBones[jointIndex]
    ) {
      return;
    }

    if (this.currentModel) {
      this.currentModel.updateMatrixWorld(true);
    }

    const bone = this._jointBones[jointIndex];
    bone.updateWorldMatrix(true, false);
    bone.getWorldPosition(this._jointPosition);

    const radius = computeJointRadius(this.currentModel, this.jointScale)
      * this._jointHighlightVisualScale;
    this._jointHighlight.position.copy(this._jointPosition);
    this._jointHighlight.scale.setScalar(radius);
  }

  getJointBoneIndex(bone) {
    if (!bone) return -1;
    return this._jointBones.indexOf(bone);
  }

  getJointBones() {
    return this._jointBones;
  }

  update(delta) {
    for (const entry of this.boneHelpers) {
      this._updateBoneLines(entry);
    }
    this._tickJointHighlightScale(delta);
    if (this.jointMarkers) {
      this._updateJointMarkers();
    }
  }

  calculateStats(object, file, gltfMetadata, modelBounds) {
    const stats = {
      triangles: 0,
      vertices: 0,
      materials: new Set(),
      textures: new Set(),
    };

    object.traverse((child) => {
      if (child.isMesh) {
        const geometry = child.geometry;
        if (!geometry) return;

        const position = geometry.attributes.position;
        if (geometry.index) {
          stats.triangles += geometry.index.count / 3;
        } else if (position) {
          stats.triangles += position.count / 3;
        }

        if (position) {
          stats.vertices += position.count;
        }

        const material = child.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat && stats.materials.add(mat.uuid));
        } else if (material) {
          stats.materials.add(material.uuid);
        }

        const registerTexture = (map) => map && stats.textures.add(map.uuid);
        if (material) {
          registerTexture(material.map);
          registerTexture(material.normalMap);
          registerTexture(material.roughnessMap);
          registerTexture(material.metalnessMap);
          registerTexture(material.emissiveMap);
          registerTexture(material.alphaMap);
        }
      }
    });

    const fileSize =
      file?.size != null ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : '—';

    let boundsText = '—';
    if (modelBounds?.size) {
      const { size } = modelBounds;
      boundsText = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
    }

    return {
      triangles: Math.round(stats.triangles),
      vertices: Math.round(stats.vertices),
      materials: stats.materials.size,
      textures: stats.textures.size,
      fileSize,
      bounds: boundsText,
      assetName:
        gltfMetadata?.assetName ||
        file?.name?.replace(/\.[^/.]+$/, '') ||
        '—',
      generator: gltfMetadata?.generator || '—',
      version: gltfMetadata?.version || '—',
      copyright: gltfMetadata?.copyright || '—',
    };
  }
}
