import * as THREE from 'three';
import {
  clampFontRevealDurationSec,
  DEFAULT_FONT_REVEAL_DURATION_SEC,
} from './fontTextRevealDuration.js';
import {
  applyRevealPoseToGlyph,
  clampFontRevealSlideDepth,
  clampFontRevealSlideTime,
  computeGlyphRevealEase,
  computeGlyphSlotProgress,
  computeGlyphSlideProgress,
  DEFAULT_FONT_REVEAL_TYPE,
  DEFAULT_FONT_REVEAL_UNIT,
  DEFAULT_FONT_REVEAL_SLIDE_DIRECTION,
  DEFAULT_FONT_REVEAL_SLIDE_DEPTH,
  DEFAULT_FONT_REVEAL_SLIDE_TIME,
  normalizeFontRevealSlideDirection,
  normalizeFontRevealType,
  normalizeFontRevealUnit,
  resetRevealGlyphPose,
} from './fontTextRevealTypes.js';
import {
  applyRevealEmissiveSlam,
  clampFontRevealEmissiveDecaySec,
  clampFontRevealEmissiveStrength,
  computeGlyphEmissiveSlamFactor,
  DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
  DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
  DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
  DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH,
  captureMaterialEmissiveRest,
  normalizeFontRevealEmissiveColor,
  normalizeFontRevealEmissiveSlamEnabled,
  restoreRevealGlyphEmissive,
} from './fontTextRevealEmissive.js';

export {
  DEFAULT_FONT_REVEAL_DURATION_SEC,
  MIN_FONT_REVEAL_DURATION_SEC,
  MAX_FONT_REVEAL_DURATION_SEC,
  clampFontRevealDurationSec,
} from './fontTextRevealDuration.js';
export {
  DEFAULT_FONT_REVEAL_TYPE,
  DEFAULT_FONT_REVEAL_UNIT,
  DEFAULT_FONT_REVEAL_SLIDE_DEPTH,
  DEFAULT_FONT_REVEAL_SLIDE_DIRECTION,
  DEFAULT_FONT_REVEAL_SLIDE_TIME,
  clampFontRevealSlideDepth,
  clampFontRevealSlideTime,
  normalizeFontRevealSlideDirection,
  normalizeFontRevealType,
  normalizeFontRevealUnit,
} from './fontTextRevealTypes.js';
export {
  DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
  DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
  DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
  DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH,
  clampFontRevealEmissiveDecaySec,
  clampFontRevealEmissiveStrength,
  normalizeFontRevealEmissiveColor,
  normalizeFontRevealEmissiveSlamEnabled,
} from './fontTextRevealEmissive.js';

/** @param {THREE.Object3D | null | undefined} model */
export function isFontExtrudeRevealModel(model) {
  if (!model) return false;
  if (model.userData?.orbyFontGenerated || model.userData?.orbyFontExtrude) return true;
  let found = false;
  model.traverse((child) => {
    if (found || !child.isMesh) return;
    if (child.userData?.orbyFontExtrude) found = true;
  });
  return found;
}

/**
 * Character-by-character reveal for extruded font meshes.
 */
export class FontTextRevealController {
  /**
   * @param {{
   *   stateStore?: import('../StateStore.js').StateStore,
   *   onPreviewTimeUpdate?: (payload: {
   *     elapsed: number,
   *     duration: number,
   *     playing: boolean,
   *   }) => void,
   *   onNeedRender?: () => void,
   *   reapplyMaterialEmissive?: () => void,
   * }} [options]
   * @param {() => void} [options.reapplyMaterialEmissive] Re-apply Mesh → Emissive slider to live materials (no event loop).
   */
  constructor({
    stateStore,
    onPreviewTimeUpdate = null,
    onNeedRender = null,
    reapplyMaterialEmissive = null,
  } = {}) {
    this.stateStore = stateStore;
    this.onPreviewTimeUpdate = onPreviewTimeUpdate;
    this.onNeedRender = onNeedRender;
    this._reapplyMaterialEmissive = reapplyMaterialEmissive;
    /** @type {THREE.Object3D[]} */
    this._glyphGroups = [];
    /** @type {Array<import('./fontTextRevealTypes.js').RevealGlyphState>} */
    this._glyphStates = [];
    /** @type {number[] | null} */
    this._glyphWordIndices = null;
    this._wordCount = 0;
    /** @type {Map<number, { center: THREE.Vector3, slideDistance: number }>} */
    this._wordGroupMeta = new Map();
    /** @type {THREE.Object3D | null} */
    this._boundModel = null;
    this._elapsed = 0;
    this._exportDriveActive = false;
    /** @type {'idle' | 'playing' | 'paused'} */
    this._previewMode = 'idle';
    this._previewRaf = 0;
    this._previewLastTs = 0;
    /** Reentrancy guard — {@link #onMaterialBaselineChanged} may call {@link #_reapplyMaterialEmissive} → updateMaterials → callback again. */
    this._materialBaselineSyncDepth = 0;
  }

  getDurationSec() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealDurationSec;
    return clampFontRevealDurationSec(raw ?? DEFAULT_FONT_REVEAL_DURATION_SEC);
  }

  getRevealType() {
    return normalizeFontRevealType(this.stateStore?.getState()?.fontExtrude?.revealType);
  }

  getRevealUnit() {
    const unit = normalizeFontRevealUnit(this.stateStore?.getState()?.fontExtrude?.revealUnit);
    if (unit === 'word' && this._wordCount <= 0) return 'character';
    return unit;
  }

  /**
   * @param {number} glyphIndex
   * @returns {{ slotIndex: number, slotCount: number }}
   */
  _resolveRevealSlot(glyphIndex) {
    const glyphCount = this._glyphStates.length;
    if (this.getRevealUnit() === 'word' && this._glyphWordIndices) {
      return {
        slotIndex: this._glyphWordIndices[glyphIndex] ?? glyphIndex,
        slotCount: this._wordCount,
      };
    }
    return { slotIndex: glyphIndex, slotCount: glyphCount };
  }

  getSlideDepth() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealSlideDepth;
    return clampFontRevealSlideDepth(raw ?? DEFAULT_FONT_REVEAL_SLIDE_DEPTH);
  }

  getSlideTime() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealSlideTime;
    return clampFontRevealSlideTime(raw ?? DEFAULT_FONT_REVEAL_SLIDE_TIME);
  }

  getSlideDirection() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealSlideDirection;
    return normalizeFontRevealSlideDirection(raw ?? DEFAULT_FONT_REVEAL_SLIDE_DIRECTION);
  }

  isLoopEnabled() {
    const loop = this.stateStore?.getState()?.fontExtrude?.revealLoop;
    return loop !== false;
  }

  isEmissiveSlamEnabled() {
    return normalizeFontRevealEmissiveSlamEnabled(
      this.stateStore?.getState()?.fontExtrude?.revealEmissiveSlam ??
        DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
    );
  }

  getEmissiveSlamStrength() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealEmissiveStrength;
    return clampFontRevealEmissiveStrength(raw ?? DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH);
  }

  getEmissiveSlamDecaySec() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealEmissiveDecaySec;
    return clampFontRevealEmissiveDecaySec(raw ?? DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC);
  }

  getEmissiveSlamColor() {
    const raw = this.stateStore?.getState()?.fontExtrude?.revealEmissiveColor;
    return normalizeFontRevealEmissiveColor(raw ?? DEFAULT_FONT_REVEAL_EMISSIVE_COLOR);
  }

  isEnabled() {
    return this.getDurationSec() > 0 && this._glyphStates.length > 0;
  }

  isPreviewPlaying() {
    return this._previewMode === 'playing';
  }

  getPreviewElapsed() {
    return this._elapsed;
  }

  getGlyphCount() {
    return this._glyphStates.length;
  }

  _revealTimingOptions() {
    return { slideDepth: this.getSlideDepth(), slideTime: this.getSlideTime() };
  }

  _revealEmissiveDecaySec() {
    return this.isEmissiveSlamEnabled() && this.getEmissiveSlamStrength() > 0
      ? this.getEmissiveSlamDecaySec()
      : 0;
  }

  _revealFullySettledElapsedSec() {
    const duration = this.getDurationSec();
    const decaySec = this._revealEmissiveDecaySec();
    return duration + decaySec;
  }

  _areRevealEmissiveSlamMaterialsSettled(elapsedSec = this._elapsed) {
    if (!this.isEmissiveSlamEnabled() || this.getEmissiveSlamStrength() <= 0) return true;
    const duration = this.getDurationSec();
    const count = this._glyphStates.length;
    if (count <= 0 || duration <= 0) return true;
    const timing = this._revealTimingOptions();
    const decaySec = this.getEmissiveSlamDecaySec();
    const checkedSlots = new Set();
    for (let i = 0; i < count; i += 1) {
      const { slotIndex, slotCount } = this._resolveRevealSlot(i);
      const slotKey = `${slotIndex}:${slotCount}`;
      if (checkedSlots.has(slotKey)) continue;
      checkedSlots.add(slotKey);
      const factor = computeGlyphEmissiveSlamFactor(
        slotIndex,
        slotCount,
        elapsedSec,
        duration,
        decaySec,
        timing,
      );
      if (factor > 1e-6) return false;
    }
    return true;
  }

  _shouldRefreshMaterialEmissiveRest() {
    if (!this.isEmissiveSlamEnabled()) return true;
    return this._areRevealEmissiveSlamMaterialsSettled(this._elapsed);
  }

  /**
   * Sync Mesh → Emissive (and related material output) into per-glyph rest cache.
   * Reveal slam overlays this baseline — it never replaces the material slider long-term.
   * @param {{ skipReapply?: boolean }} [options]
   */
  syncMaterialEmissiveBaseline({ skipReapply = false } = {}) {
    if (!this._glyphStates.length) return;
    if (!skipReapply) {
      if (typeof this._reapplyMaterialEmissive === 'function') {
        this._reapplyMaterialEmissive();
      } else {
        this._restoreAllGlyphEmissive();
      }
    }
    for (const state of this._glyphStates) {
      for (const entry of state.meshMaterials) {
        const captured = captureMaterialEmissiveRest(entry.mat);
        entry.restEmissive.copy(captured.restEmissive);
        entry.restEmissiveIntensity = captured.restEmissiveIntensity;
      }
    }
  }

  /**
   * After MaterialController updates brightness/metalness/emissive, re-sync baseline
   * and re-apply the current reveal pose (slam overlay or rest restore).
   */
  onMaterialBaselineChanged() {
    if (!this._glyphStates.length) return;

    if (this._materialBaselineSyncDepth > 0) {
      this.syncMaterialEmissiveBaseline({ skipReapply: true });
      return;
    }

    const slamMayBeLive =
      this.isEmissiveSlamEnabled() &&
      this.getEmissiveSlamStrength() > 0 &&
      !this._areRevealEmissiveSlamMaterialsSettled(this._elapsed);

    this._materialBaselineSyncDepth += 1;
    try {
      if (slamMayBeLive && typeof this._reapplyMaterialEmissive === 'function') {
        // Partial material patches (e.g. fill color) leave reveal slam on live emissive;
        // re-run Mesh → Emissive via MaterialController before capturing rest.
        this._reapplyMaterialEmissive();
      } else {
        this.syncMaterialEmissiveBaseline({ skipReapply: true });
      }
    } finally {
      this._materialBaselineSyncDepth -= 1;
    }

    if (
      this._exportDriveActive
      || this._previewMode === 'playing'
      || this._previewMode === 'paused'
    ) {
      this.applyAtTime(this._elapsed);
      return;
    }
    if (this.isEnabled()) {
      this.applyAtTime(this._revealFullySettledElapsedSec());
    }
  }

  /**
   * Re-capture per-glyph rest emissive after Material emissive/brightness slider changes.
   */
  refreshMaterialEmissiveRest() {
    this.syncMaterialEmissiveBaseline();
  }

  _restoreAllGlyphEmissive() {
    for (const state of this._glyphStates) {
      restoreRevealGlyphEmissive(state);
    }
  }

  shouldRunLiveUpdate(scene) {
    if (this._previewRaf) return false;
    if (this._exportDriveActive) return false;
    if (scene?.exportMovementPreview?.isActive?.()) return false;
    if (scene?.animationController?.isExportSessionActive?.()) return false;
    return this._previewMode === 'playing' && this.isEnabled();
  }

  /**
   * @param {THREE.Object3D | null | undefined} model
   * @returns {boolean}
   */
  ensureBoundToModel(model) {
    if (!isFontExtrudeRevealModel(model)) return false;
    if (this._boundModel !== model || !this._glyphStates.length) {
      this.bindModel(model);
    }
    return this._glyphStates.length > 0;
  }

  /**
   * @param {THREE.Object3D | null | undefined} model
   */
  bindModel(model) {
    this._stopPreviewLoop();
    this._glyphGroups = [];
    this._glyphStates = [];
    this._glyphWordIndices = null;
    this._wordCount = 0;
    this._wordGroupMeta = new Map();
    this._previewMode = 'idle';

    if (!isFontExtrudeRevealModel(model)) {
      this._boundModel = null;
      this._elapsed = 0;
      this._notifyPreviewTime();
      return;
    }

    this._boundModel = model;
    this._collectGlyphGroups(model);
    if (!this._glyphGroups.length) {
      this._upgradeLegacyFontMesh(model);
      this._collectGlyphGroups(model);
    }
    this._buildWordRevealMeta();
    for (const glyphGroup of this._glyphGroups) {
      if (!glyphGroup.userData?.orbyFontGlyphPivotFixed) {
        const isCircularGlyph = !!glyphGroup.userData?.orbyFontCircularTransform;
        if (!isCircularGlyph) {
          this._fixGlyphGroupPivot(glyphGroup);
        }
        glyphGroup.userData.orbyFontGlyphPivotFixed = true;
      }
    }
    this._buildGlyphStates();
    this._buildWordGroupMeta();
    this.syncMaterialEmissiveBaseline();

    this._showIdlePose();
    this._notifyPreviewTime();
  }

  _buildWordRevealMeta() {
    const indices = this._glyphGroups.map((group) => {
      const idx = group.userData?.orbyFontRevealWordIndex;
      return Number.isFinite(idx) ? idx : NaN;
    });
    const hasWordData = indices.length > 0 && indices.every((idx) => Number.isFinite(idx));
    this._glyphWordIndices = hasWordData ? indices : null;
    this._wordCount = hasWordData ? Math.max(...indices) + 1 : 0;
  }

  _buildWordGroupMeta() {
    this._wordGroupMeta = new Map();
    if (!this._glyphWordIndices || this._wordCount <= 0 || !this._glyphStates.length) return;

    /** @type {Map<number, number[]>} */
    const indicesByWord = new Map();
    for (let i = 0; i < this._glyphWordIndices.length; i += 1) {
      const wordIndex = this._glyphWordIndices[i];
      if (!indicesByWord.has(wordIndex)) indicesByWord.set(wordIndex, []);
      indicesByWord.get(wordIndex).push(i);
    }

    for (const [wordIndex, glyphIndices] of indicesByWord) {
      const parent = this._glyphStates[glyphIndices[0]]?.group?.parent;
      if (!parent) continue;

      parent.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const glyphIndex of glyphIndices) {
        const { group } = this._glyphStates[glyphIndex];
        group.updateMatrixWorld(true);
        box.expandByObject(group);
      }
      if (box.isEmpty()) continue;

      const centerWorld = box.getCenter(new THREE.Vector3());
      const center = parent.worldToLocal(centerWorld.clone());
      const size = box.getSize(new THREE.Vector3());
      this._wordGroupMeta.set(wordIndex, {
        center,
        slideDistance: Math.max(size.y * 0.75, 0.08),
      });
    }
  }

  _buildGlyphStates() {
    this._glyphStates = this._glyphGroups.map((group) => {
      group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group);
      const size = box.getSize(new THREE.Vector3());
      const slideDistance = Math.max(size.y * 0.75, 0.08);

      /** @type {RevealGlyphState['meshMaterials']} */
      const meshMaterials = [];
      group.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          const { restEmissive, restEmissiveIntensity } = captureMaterialEmissiveRest(mat);
          meshMaterials.push({
            mat,
            opacity: Number.isFinite(mat.opacity) ? mat.opacity : 1,
            transparent: !!mat.transparent,
            restEmissive,
            restEmissiveIntensity,
          });
        }
      });

      return {
        group,
        restPosition: group.position.clone(),
        restRotationY: group.rotation.y,
        restRotationZ: group.rotation.z,
        restScale: group.scale.clone(),
        slideDistance,
        meshMaterials,
      };
    });
  }

  /** @param {THREE.Object3D} model */
  _collectGlyphGroups(model) {
    this._glyphGroups = [];
    model.traverse((child) => {
      if (child.userData?.orbyFontGlyphGroup) {
        this._glyphGroups.push(child);
      }
    });
    this._glyphGroups.sort(
      (a, b) =>
        (a.userData.orbyFontGlyphIndex ?? 0) - (b.userData.orbyFontGlyphIndex ?? 0),
    );
  }

  /**
   * @param {THREE.Object3D} glyphGroup
   */
  _fixGlyphGroupPivot(glyphGroup) {
    const parent = glyphGroup.parent;
    if (!parent) return;

    parent.updateMatrixWorld(true);
    glyphGroup.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(glyphGroup);
    if (box.isEmpty()) return;

    const centerWorld = box.getCenter(new THREE.Vector3());
    const childStates = glyphGroup.children.map((child) => {
      const worldPos = new THREE.Vector3();
      child.getWorldPosition(worldPos);
      return { child, worldPos };
    });

    const centerLocal = parent.worldToLocal(centerWorld.clone());
    glyphGroup.position.copy(centerLocal);
    glyphGroup.updateMatrixWorld(true);

    for (const { child, worldPos } of childStates) {
      child.position.copy(glyphGroup.worldToLocal(worldPos));
    }
    glyphGroup.updateMatrixWorld(true);
  }

  /**
   * @param {THREE.Object3D} model
   */
  _upgradeLegacyFontMesh(model) {
    if (model.userData?.orbyFontGlyphGroupsUpgraded) return;

    /** @type {Map<number, THREE.Mesh[]>} */
    const meshByGlyph = new Map();
    /** @type {THREE.Mesh[]} */
    const looseMeshes = [];

    model.traverse((child) => {
      if (!child.isMesh || !child.userData?.orbyFontExtrude) return;
      if (child.parent?.userData?.orbyFontGlyphGroup) return;
      const idx = child.userData.orbyFontGlyphIndex;
      if (Number.isFinite(idx)) {
        if (!meshByGlyph.has(idx)) meshByGlyph.set(idx, []);
        meshByGlyph.get(idx).push(child);
      } else {
        looseMeshes.push(child);
      }
    });

    let entries = [...meshByGlyph.entries()].sort((a, b) => a[0] - b[0]);
    if (!entries.length && looseMeshes.length) {
      entries = looseMeshes.map((mesh, index) => [index, [mesh]]);
    }
    if (!entries.length) return;

    for (const [idx, meshes] of entries) {
      const glyphGroup = new THREE.Group();
      glyphGroup.userData.orbyFontGlyphGroup = true;
      glyphGroup.userData.orbyFontGlyphIndex = idx;
      model.add(glyphGroup);

      for (const mesh of meshes) {
        mesh.parent?.remove(mesh);
        glyphGroup.add(mesh);
      }
    }

    model.userData.orbyFontGlyphGroupsUpgraded = true;
  }

  unbind() {
    this._stopPreviewLoop();
    this._resetGlyphs();
    this._glyphGroups = [];
    this._glyphStates = [];
    this._glyphWordIndices = null;
    this._wordCount = 0;
    this._wordGroupMeta = new Map();
    this._boundModel = null;
    this._elapsed = 0;
    this._exportDriveActive = false;
    this._previewMode = 'idle';
    this._notifyPreviewTime();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   */
  startPreview(model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;
    const duration = this.getDurationSec();

    if (this._previewMode === 'idle' || this._elapsed >= Math.max(0, duration - 1e-4)) {
      this._elapsed = 0;
      this.applyAtTime(0);
    }

    this._previewMode = 'playing';
    this._startPreviewLoop();
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   */
  pausePreview(model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;
    if (this._previewMode !== 'playing') return false;

    this._previewMode = 'paused';
    this._stopPreviewLoop();
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @returns {boolean}
   * @deprecated use startPreview / pausePreview
   */
  togglePreview(model) {
    if (this._previewMode === 'playing') return !this.pausePreview(model);
    return this.startPreview(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   * @deprecated use startPreview
   */
  restartPreview(model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;

    this._previewMode = 'playing';
    this._elapsed = 0;
    this.applyAtTime(0);
    this._startPreviewLoop();
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  /**
   * @param {number} progress
   * @param {THREE.Object3D | null | undefined} [model]
   */
  scrubPreview(progress, model) {
    const target = model ?? this._boundModel;
    if (!this.ensureBoundToModel(target)) return false;

    const duration = this.getDurationSec();
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    this._previewMode = 'paused';
    this._stopPreviewLoop();
    this._elapsed = p * duration;
    this.applyAtTime(this._elapsed);
    this._notifyPreviewTime();
    this._requestRender();
    return true;
  }

  stopPreview() {
    this._previewMode = 'idle';
    this._stopPreviewLoop();
    this._showIdlePose();
    this._notifyPreviewTime();
    this._requestRender();
  }

  /**
   * @param {number} elapsedSec
   */
  applyAtTime(elapsedSec) {
    const duration = this.getDurationSec();
    const count = this._glyphStates.length;
    if (duration <= 0 || count === 0) {
      this._resetGlyphs();
      return;
    }

    const type = this.getRevealType();
    const slideDepth = this.getSlideDepth();
    const slideTime = this.getSlideTime();
    const slideDirection = this.getSlideDirection();
    const emissiveEnabled = this.isEmissiveSlamEnabled();
    const emissiveStrength = this.getEmissiveSlamStrength();
    const emissiveDecaySec = this.getEmissiveSlamDecaySec();
    const emissiveColor = this.getEmissiveSlamColor();
    const timing = { slideDepth, slideTime };
    const useWordGroup = this.getRevealUnit() === 'word' && this._wordGroupMeta.size > 0;
    for (let i = 0; i < count; i += 1) {
      const state = this._glyphStates[i];
      const { slotIndex, slotCount } = this._resolveRevealSlot(i);
      const landLinear = computeGlyphSlotProgress(
        slotIndex,
        slotCount,
        elapsedSec,
        duration,
        timing,
      );
      const eased = computeGlyphRevealEase(
        type,
        slotIndex,
        slotCount,
        elapsedSec,
        duration,
        timing,
      );
      const slideProgress = computeGlyphSlideProgress(
        slotIndex,
        slotCount,
        elapsedSec,
        duration,
        timing,
      );
      const wordIndex = this._glyphWordIndices?.[i];
      const wordPivot =
        useWordGroup && Number.isFinite(wordIndex)
          ? this._wordGroupMeta.get(wordIndex)
          : undefined;
      applyRevealPoseToGlyph(type, eased, state, {
        slideProgress,
        landLinear,
        slideDepth,
        slideDirection,
        wordPivot,
      });
      applyRevealEmissiveSlam(state, {
        enabled: emissiveEnabled,
        strength: emissiveStrength,
        decaySec: emissiveDecaySec,
        colorHex: emissiveColor,
        glyphIndex: slotIndex,
        glyphCount: slotCount,
        elapsedSec,
        totalDurationSec: duration,
        slideDepth,
        slideTime,
      });
    }

    this._boundModel?.updateMatrixWorld?.(true);
  }

  _resetGlyphs() {
    for (const state of this._glyphStates) {
      resetRevealGlyphPose(state);
    }
    this._boundModel?.updateMatrixWorld?.(true);
  }

  /** Settle glyph groups before voxel SAT sampling (reveal offsets distort the grid). */
  snapGlyphsForVoxelization() {
    if (!this._boundModel || !this._glyphStates.length) return;
    if (this.isEnabled()) {
      this._elapsed = this._revealFullySettledElapsedSec();
      this.applyAtTime(this._elapsed);
    } else {
      this._resetGlyphs();
    }
    this._boundModel.updateMatrixWorld(true);
  }

  _showIdlePose() {
    if (this.isEnabled()) {
      this._elapsed = this._revealFullySettledElapsedSec();
      this.applyAtTime(this._elapsed);
      return;
    }
    this._resetGlyphs();
    this._elapsed = 0;
  }

  _notifyPreviewTime() {
    const duration = this.getDurationSec();
    this.onPreviewTimeUpdate?.({
      elapsed: this._elapsed,
      duration,
      playing: this._previewMode === 'playing',
    });
  }

  _requestRender() {
    this.onNeedRender?.();
  }

  _startPreviewLoop() {
    if (this._previewRaf) return;
    this._previewLastTs = performance.now();

    const tick = (now) => {
      this._previewRaf = 0;
      if (this._previewMode !== 'playing' || !this.isEnabled()) return;

      const delta = Math.max(0, (now - this._previewLastTs) / 1000);
      this._previewLastTs = now;
      this.update(delta);
      this._requestRender();

      if (this._previewMode === 'playing') {
        this._previewRaf = requestAnimationFrame(tick);
      }
    };

    this._previewRaf = requestAnimationFrame(tick);
  }

  _stopPreviewLoop() {
    if (!this._previewRaf) return;
    cancelAnimationFrame(this._previewRaf);
    this._previewRaf = 0;
  }

  /**
   * @param {number} delta
   */
  update(delta) {
    if (this._previewRaf) return;
    if (this._previewMode !== 'playing' || !this.isEnabled()) return;

    const duration = this.getDurationSec();
    const decaySec =
      this.isEmissiveSlamEnabled() && this.getEmissiveSlamStrength() > 0
        ? this.getEmissiveSlamDecaySec()
        : 0;
    const endTime = duration + decaySec;
    const d = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    this._elapsed += d;
    if (this._elapsed >= duration) {
      if (this.isLoopEnabled()) {
        this._elapsed = 0;
        this.applyAtTime(0);
      } else if (decaySec > 0 && this._elapsed < endTime) {
        this.applyAtTime(this._elapsed);
      } else {
        this._elapsed = decaySec > 0 ? endTime : duration;
        this._previewMode = 'paused';
        this._stopPreviewLoop();
        this.applyAtTime(this._elapsed);
      }
      this._notifyPreviewTime();
      return;
    }
    this.applyAtTime(this._elapsed);
    this._notifyPreviewTime();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onDurationChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onRevealTimingChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onRevealTypeChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  onRevealEmissiveChange(model) {
    this._applySettingsChange(model);
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  _applySettingsChange(model) {
    this.ensureBoundToModel(model ?? this._boundModel);
    const duration = this.getDurationSec();
    if (this._glyphStates.length && !this.isEmissiveSlamEnabled()) {
      this._restoreAllGlyphEmissive();
    }
    if (this._glyphStates.length && this._shouldRefreshMaterialEmissiveRest()) {
      this.refreshMaterialEmissiveRest();
    }
    if (!this._glyphStates.length) {
      this._notifyPreviewTime();
      return;
    }
    if (!this.isEnabled()) {
      this._previewMode = 'idle';
      this._stopPreviewLoop();
      this._resetGlyphs();
      this._elapsed = 0;
      this._notifyPreviewTime();
      this._requestRender();
      return;
    }
    if (this._previewMode === 'playing' || this._previewMode === 'paused') {
      this._elapsed = Math.min(this._elapsed, duration);
      this.applyAtTime(this._elapsed);
    } else {
      this._elapsed = this._revealFullySettledElapsedSec();
      this.applyAtTime(this._elapsed);
    }
    this._notifyPreviewTime();
    this._requestRender();
  }

  /**
   * @param {THREE.Object3D | null | undefined} [model]
   */
  beginExportDrive(model) {
    this._stopPreviewLoop();
    this.ensureBoundToModel(model ?? this._boundModel);
    if (!this.isEnabled()) {
      this._exportDriveActive = false;
      return;
    }
    this._exportDriveActive = true;
    this._previewMode = 'idle';
    this._elapsed = 0;
    this.applyAtTime(0);
    this._requestRender();
  }

  /**
   * @param {number} frameIndex
   * @param {number} fps
   * @param {THREE.Object3D | null | undefined} [model]
   */
  applyExportFrame(frameIndex, fps, model) {
    const elapsed = Math.max(0, frameIndex) / Math.max(1, fps);
    this.applyExportTime(elapsed, model);
  }

  /**
   * @param {number} exportTimeSec
   * @param {THREE.Object3D | null | undefined} [model]
   */
  applyExportTime(exportTimeSec, model) {
    this.ensureBoundToModel(model ?? this._boundModel);
    if (!this.isEnabled()) return;
    this._exportDriveActive = true;
    const elapsed = Math.max(0, exportTimeSec);
    this._elapsed = elapsed;
    this.applyAtTime(elapsed);
    this._requestRender();
  }

  endExportDrive() {
    if (!this._exportDriveActive) return;
    this._exportDriveActive = false;
    this._previewMode = 'idle';
    this._showIdlePose();
    this._notifyPreviewTime();
    this._requestRender();
  }
}
