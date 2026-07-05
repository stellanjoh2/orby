import * as THREE from 'three';
import { stepToggleScaleAnimation } from './toggleScaleAnimation.js';

/**
 * Orchestrates studio ground grid, podium/base, and cyclorama backdrop —
 * cross-cutting shadow, gobo, background, UI, and appear-animation side effects.
 * Low-level meshes/materials stay in {@link GroundController}.
 */
export class StudioGroundFacade {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  constructor(scene) {
    this.scene = scene;
    this._groundGridBottomAlignRaf = 0;
  }

  get groundController() {
    return this.scene.groundController;
  }

  get backgroundController() {
    return this.scene.backgroundController;
  }

  get stateStore() {
    return this.scene.stateStore;
  }

  get ui() {
    return this.scene.ui;
  }

  get currentModel() {
    return this.scene.currentModel;
  }

  /** Ground solid / podium — same scale curves as Reference colors (see toggleScaleAnimation.js). */
  updateBaseAppearAnimation() {
    const gc = this.groundController;
    const root = gc?.podiumRoot;
    const solid = gc?.podium;
    if (!root || !solid) return;

    const st = this.stateStore.getState();
    const groundSolid = !!st.groundSolid;
    const glassOn = !!(
      st.baseGlassSurface ?? st.podiumReflectMesh ?? false
    );
    const r = stepToggleScaleAnimation(
      this.scene._baseToggleCtx,
      performance.now(),
      groundSolid,
    );

    const baseAnimating =
      this.scene._baseToggleCtx.phase === 'in' || this.scene._baseToggleCtx.phase === 'out';
    const glassAnimating =
      this.scene._baseGlassToggleCtx.phase === 'in' || this.scene._baseGlassToggleCtx.phase === 'out';
    root.visible = groundSolid || glassOn || baseAnimating || glassAnimating;

    solid.scale.setScalar(r.animMul);

    if (groundSolid || baseAnimating) {
      solid.visible = r.visible;
      if (solid.material) {
        solid.material.visible =
          r.visible && (groundSolid || this.scene._baseToggleCtx.phase === 'out');
      }
    } else if (glassOn) {
      solid.visible = false;
      if (solid.material) solid.material.visible = false;
    } else {
      solid.visible = r.visible;
      if (solid.material) solid.material.visible = true;
    }
  }

  /** Base glass on the base top — same shared scale curves as base toggles. */
  updateBaseGlassAppearAnimation() {
    const reflector = this.groundController?.podiumReflector;
    const st = this.stateStore.getState();
    const glassOn = !!(
      st.baseGlassSurface ?? st.podiumReflectMesh ?? false
    );

    if (!reflector) {
      this.scene._baseGlassToggleCtx.prevEnabled = glassOn;
      return;
    }

    const r = stepToggleScaleAnimation(
      this.scene._baseGlassToggleCtx,
      performance.now(),
      glassOn,
    );
    reflector.visible = r.visible;
    reflector.scale.setScalar(r.animMul);
    if (
      !glassOn &&
      !r.visible &&
      this.scene._baseGlassToggleCtx.phase === 'idle' &&
      this.groundController?.podiumReflector
    ) {
      this.groundController.disposeBaseReflector();
    }
  }

  updateBackdropAppearAnimation() {
    const backdrop = this.groundController?.backdrop;
    if (!backdrop) return;
    const enabled = !!this.stateStore.getState().backdropEnabled;
    const r = stepToggleScaleAnimation(
      this.scene._backdropToggleCtx,
      performance.now(),
      enabled,
    );
    this.groundController?.setBackdropAnimationState(r.animMul, r.visible);
  }

  updateInfinityCoveAppearAnimation() {
    const cove = this.groundController?.infinityCove;
    if (!cove) return;
    const enabled = !!this.stateStore.getState().infinityCoveEnabled;
    const r = stepToggleScaleAnimation(
      this.scene._infinityCoveToggleCtx,
      performance.now(),
      enabled,
    );
    cove.setAnimationState(r.animMul, r.visible);
  }

  setGroundSolid(enabled) {
    this.groundController?.setSolidEnabled(enabled);
    this.backgroundController?.setGroundSolid(!!enabled);
    this.scene._syncShadowCameraBounds();
    this.updateBaseAppearAnimation();
    this.updateBaseGlassAppearAnimation();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setGroundY(value) {
    this.groundController?.setGroundY(value);
    this.backgroundController?.setGroundY(value);
    this.scene._updateHdriShadowReceiverContact();
    this.scene._syncShadowCameraBounds();
  }

  /**
   * Align podium, grid, and infinity cove Y to the current model bottom without forcing visibility.
   * Used for first-load QoL so toggling them on starts at the correct vertical placement.
   */
  alignGroundAndGridToCurrentModelBottom({
    updateState = true,
    includePodium = true,
    includeGrid = true,
    includeInfinityCove = true,
  } = {}) {
    if (!this.currentModel) return null;
    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) return null;

    const podiumY = includePodium ? this.groundController?.snapBaseToBounds(bounds) : null;
    const gridY = includeGrid ? this.groundController?.snapGridToBounds(bounds) : null;
    const infinityCoveY = includeInfinityCove
      ? this.groundController?.infinityCove?.snapToBounds(bounds)
      : null;

    if (updateState) {
      if (includePodium && podiumY !== null && podiumY !== undefined) {
        this.stateStore.set('groundY', podiumY);
      }
      if (includeGrid && gridY !== null && gridY !== undefined) {
        this.stateStore.set('gridY', gridY);
      }
      if (includeInfinityCove && infinityCoveY !== null && infinityCoveY !== undefined) {
        this.stateStore.set('infinityCoveY', infinityCoveY);
      }
    }
    return {
      podiumY,
      gridY,
      infinityCoveY,
    };
  }

  cancelGroundGridBottomAlignAnimation() {
    if (this._groundGridBottomAlignRaf) {
      cancelAnimationFrame(this._groundGridBottomAlignRaf);
      this._groundGridBottomAlignRaf = 0;
    }
  }

  animateGroundAndGridToCurrentModelBottom({ durationMs = 420 } = {}) {
    const snap = this.alignGroundAndGridToCurrentModelBottom({
      updateState: false,
      includePodium: true,
      includeGrid: true,
      includeInfinityCove: true,
    });
    if (!snap) return false;

    const targetGroundY = Number.isFinite(snap.podiumY) ? snap.podiumY : null;
    const targetGridY = Number.isFinite(snap.gridY) ? snap.gridY : null;
    const targetInfinityCoveY = Number.isFinite(snap.infinityCoveY) ? snap.infinityCoveY : null;
    if (targetGroundY === null && targetGridY === null && targetInfinityCoveY === null) {
      return false;
    }

    const startGroundYRaw = this.groundController?.getGroundY?.();
    const startGridYRaw = this.groundController?.getGridY?.();
    const startInfinityCoveYRaw = this.groundController?.infinityCove?.y;
    const startGroundY = Number.isFinite(startGroundYRaw) ? startGroundYRaw : targetGroundY;
    const startGridY = Number.isFinite(startGridYRaw) ? startGridYRaw : targetGridY;
    const startInfinityCoveY = Number.isFinite(startInfinityCoveYRaw)
      ? startInfinityCoveYRaw
      : targetInfinityCoveY;

    const groundDelta =
      targetGroundY === null || startGroundY === null ? 0 : Math.abs(targetGroundY - startGroundY);
    const gridDelta =
      targetGridY === null || startGridY === null ? 0 : Math.abs(targetGridY - startGridY);
    const infinityCoveDelta =
      targetInfinityCoveY === null || startInfinityCoveY === null
        ? 0
        : Math.abs(targetInfinityCoveY - startInfinityCoveY);
    if (groundDelta < 1e-5 && gridDelta < 1e-5 && infinityCoveDelta < 1e-5) {
      if (targetGroundY !== null) this.stateStore.set('groundY', targetGroundY);
      if (targetGridY !== null) this.stateStore.set('gridY', targetGridY);
      if (targetInfinityCoveY !== null) this.stateStore.set('infinityCoveY', targetInfinityCoveY);
      return true;
    }

    this.cancelGroundGridBottomAlignAnimation();
    const start = performance.now();
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;

    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / Math.max(1, durationMs));
      const e = easeOutCubic(t);

      if (targetGroundY !== null && startGroundY !== null) {
        const y = startGroundY + (targetGroundY - startGroundY) * e;
        this.groundController?.setGroundY(y);
      }
      if (targetGridY !== null && startGridY !== null) {
        const y = startGridY + (targetGridY - startGridY) * e;
        this.groundController?.setGridY(y);
      }
      if (targetInfinityCoveY !== null && startInfinityCoveY !== null) {
        const y = startInfinityCoveY + (targetInfinityCoveY - startInfinityCoveY) * e;
        this.groundController?.infinityCove?.setY(y);
      }

      if (t < 1) {
        this._groundGridBottomAlignRaf = requestAnimationFrame(tick);
      } else {
        this._groundGridBottomAlignRaf = 0;
        if (targetGroundY !== null) this.stateStore.set('groundY', targetGroundY);
        if (targetGridY !== null) this.stateStore.set('gridY', targetGridY);
        if (targetInfinityCoveY !== null) {
          this.stateStore.set('infinityCoveY', targetInfinityCoveY);
        }
      }
    };

    this._groundGridBottomAlignRaf = requestAnimationFrame(tick);
    return true;
  }

  snapBaseToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the base');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }

    const bottomY = this.groundController?.snapBaseToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.stateStore.set('groundY', bottomY);

    const currentState = this.stateStore.getState();
    const glassOn = !!(
      currentState.baseGlassSurface ?? currentState.podiumReflectMesh ?? false
    );
    if (!currentState.groundSolid && !glassOn) {
      this.setGroundSolid(true);
      this.stateStore.set('groundSolid', true);
    }

    this.ui?.showToast?.(
      'Base snapped to mesh',
      3200,
      { notification: false },
    );
  }

  snapGridToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the grid');
      return;
    }

    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }

    const bottomY = this.groundController?.snapGridToBounds(bounds);
    if (bottomY === null || bottomY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.stateStore.set('gridY', bottomY);
    this.ui?.showToast?.(
      'Grid snapped to mesh',
      3200,
      { notification: false },
    );
  }

  setBaseScale(value, { updateState = true } = {}) {
    const newGroundY = this.groundController?.setBaseScale(value);
    if (updateState && typeof newGroundY === 'number') {
      this.stateStore.set('groundY', newGroundY);
    }
    this.scene._syncShadowCameraBounds();
    this.scene._syncStudioGroundSurfaces();
  }

  setBaseSurface(settings = {}, { updateState = true } = {}) {
    const state = this.stateStore.getState();
    const preset = settings.preset ?? state.baseSurfacePreset ?? 'none';
    const scale = settings.scale ?? state.baseSurfaceScale ?? 1;
    const strength = settings.strength ?? state.baseSurfaceStrength ?? 1;
    if (updateState) {
      if (settings.preset !== undefined) this.stateStore.set('baseSurfacePreset', preset);
      if (settings.scale !== undefined) this.stateStore.set('baseSurfaceScale', scale);
      if (settings.strength !== undefined) this.stateStore.set('baseSurfaceStrength', strength);
    }
    this.groundController?.setBaseSurface({ preset, scale, strength });
    this.scene._syncStudioGroundSurfaces();
  }

  setBaseGlassSurface(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBaseGlassSurface(on);
    if (updateState) this.stateStore.set('baseGlassSurface', on);
    this.updateBaseAppearAnimation();
    this.updateBaseGlassAppearAnimation();
    this.scene._syncStudioGroundSurfaces();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setBackdropEnabled(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    this.groundController?.setBackdropEnabled(on);
    if (updateState) this.stateStore.set('backdropEnabled', on);
    this.updateBackdropAppearAnimation();
    this.scene._syncShadowAndGobo();
    this.scene._syncShadowCameraBounds();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setBackdropScale(value, { updateState = true } = {}) {
    this.groundController?.setBackdropScale(value);
    if (updateState) this.stateStore.set('backdropScale', value);
    this._syncGoboUniforms();
    this.scene._syncShadowCameraBounds();
  }

  setBackdropWidth(value, { updateState = true } = {}) {
    this.groundController?.setBackdropWidth(value);
    if (updateState) this.stateStore.set('backdropWidth', value);
    this._syncGoboUniforms();
    this.scene._syncShadowCameraBounds();
  }

  setBackdropRotation(value, { updateState = true } = {}) {
    this.groundController?.setBackdropRotation(value);
    if (updateState) this.stateStore.set('backdropRotation', value);
    this.scene._syncShadowCameraBounds();
  }

  setBackdropY(value, { updateState = true } = {}) {
    this.groundController?.setBackdropY(value);
    if (updateState) this.stateStore.set('backdropY', value);
    this._syncGoboUniforms();
    this.scene._syncShadowCameraBounds();
  }

  setBackdropSurface(settings = {}, { updateState = true } = {}) {
    const state = this.stateStore.getState();
    const preset = settings.preset ?? state.backdropSurfacePreset ?? 'none';
    const scale = settings.scale ?? state.backdropSurfaceScale ?? 1;
    const strength = settings.strength ?? state.backdropSurfaceStrength ?? 1;
    if (updateState) {
      if (settings.preset !== undefined) this.stateStore.set('backdropSurfacePreset', preset);
      if (settings.scale !== undefined) this.stateStore.set('backdropSurfaceScale', scale);
      if (settings.strength !== undefined) this.stateStore.set('backdropSurfaceStrength', strength);
    }
    this.groundController?.setBackdropSurface({ preset, scale, strength });
    this.scene._syncStudioGroundSurfaces();
  }

  snapBackdropToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the backdrop');
      return;
    }
    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    const backdropY = this.groundController?.snapBackdropToBounds(bounds);
    if (backdropY === null || backdropY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.setBackdropY(backdropY);
    if (!this.stateStore.getState().backdropEnabled) {
      this.setBackdropEnabled(true);
      this.stateStore.set('backdropEnabled', true);
    } else {
      this.scene._syncShadowCameraBounds();
    }
    this.ui?.showToast?.(
      'Backdrop snapped to mesh',
      3200,
      { notification: false },
    );
  }

  setInfinityCoveEnabled(enabled, { updateState = true } = {}) {
    const on = !!enabled;
    if (on && this.currentModel) {
      const coveY = this.stateStore.getState().infinityCoveY ?? 0;
      const floorY = this.groundController?.getGroundY?.() ?? 0;
      // Mesh load aligns base/grid Y but older sessions may still have cove at default 0.
      if (Math.abs(coveY) < 1e-5 && Math.abs(floorY - coveY) > 1e-5) {
        this.setInfinityCoveY(floorY, { updateState });
      }
    }
    this.groundController?.infinityCove?.setEnabled(on);
    if (updateState) this.stateStore.set('infinityCoveEnabled', on);
    this.updateInfinityCoveAppearAnimation();
    this.scene._syncShadowAndGobo();
    this.scene._syncShadowCameraBounds();
    this.ui?.applyBlockStates?.(this.stateStore.getState());
  }

  setInfinityCoveScale(value, { updateState = true } = {}) {
    this.groundController?.infinityCove?.setScale(value);
    if (updateState) this.stateStore.set('infinityCoveScale', value);
    this._syncGoboUniforms();
    this.scene._syncShadowCameraBounds();
  }

  setInfinityCoveWidth(value, { updateState = true } = {}) {
    this.groundController?.infinityCove?.setWidth(value);
    if (updateState) this.stateStore.set('infinityCoveWidth', value);
    this._syncGoboUniforms();
    this.scene._syncShadowCameraBounds();
  }

  setInfinityCoveRotation(value, { updateState = true } = {}) {
    this.groundController?.infinityCove?.setRotation(value);
    if (updateState) this.stateStore.set('infinityCoveRotation', value);
    this.scene._syncShadowCameraBounds();
  }

  setInfinityCoveY(value, { updateState = true } = {}) {
    this.groundController?.infinityCove?.setY(value);
    if (updateState) this.stateStore.set('infinityCoveY', value);
    this._syncGoboUniforms();
    this.scene._syncShadowCameraBounds();
  }

  setInfinityCoveSurface(settings = {}, { updateState = true } = {}) {
    const state = this.stateStore.getState();
    const preset = settings.preset ?? state.infinityCoveSurfacePreset ?? 'none';
    const scale = settings.scale ?? state.infinityCoveSurfaceScale ?? 1;
    const strength = settings.strength ?? state.infinityCoveSurfaceStrength ?? 1;
    if (updateState) {
      if (settings.preset !== undefined) this.stateStore.set('infinityCoveSurfacePreset', preset);
      if (settings.scale !== undefined) this.stateStore.set('infinityCoveSurfaceScale', scale);
      if (settings.strength !== undefined) {
        this.stateStore.set('infinityCoveSurfaceStrength', strength);
      }
    }
    this.groundController?.infinityCove?.setSurface({ preset, scale, strength });
    this.scene._syncStudioGroundSurfaces();
  }

  snapInfinityCoveToBottom() {
    if (!this.currentModel) {
      this.ui?.showToast?.('Load a mesh before snapping the infinity cove');
      return;
    }
    const bounds = new THREE.Box3().setFromObject(this.currentModel);
    if (!bounds || !isFinite(bounds.min.y)) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    const coveY = this.groundController?.infinityCove?.snapToBounds(bounds);
    if (coveY === null || coveY === undefined) {
      this.ui?.showToast?.('Unable to align to mesh');
      return;
    }
    this.setInfinityCoveY(coveY);
    if (!this.stateStore.getState().infinityCoveEnabled) {
      this.setInfinityCoveEnabled(true);
      this.stateStore.set('infinityCoveEnabled', true);
    } else {
      this.scene._syncShadowCameraBounds();
    }
    this.ui?.showToast?.(
      'Infinity cove snapped to mesh',
      3200,
      { notification: false },
    );
  }

  _syncGoboUniforms() {
    this.scene.goboProjection?.syncUniformsOnScene(this.scene._getGoboSceneTargets());
  }
}
