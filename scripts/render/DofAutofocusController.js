import * as THREE from 'three';
import { DOF_FOCUS_MIN_M, normalizeDofFocusMode } from '../constants.js';
import { worldPointToViewDepth } from './dofFocalDepth.js';

const SMOOTH_HZ = 10;

/**
 * Keeps DOF focus distance in sync with camera / pointer for non-manual focus modes.
 */
export class DofAutofocusController {
  /**
   * @param {{
   *   getCamera: () => import('three').Camera | null | undefined,
   *   getCurrentModel: () => import('three').Object3D | null | undefined,
   *   getControlsTarget: () => import('three').Vector3 | null | undefined,
   *   getModelBounds: () => { radius?: number } | null | undefined,
   *   stateStore: import('../StateStore.js').StateStore,
   *   eventBus: import('../EventBus.js').EventBus,
   * }} deps
   */
  constructor(deps) {
    this.getCamera = deps.getCamera;
    this.getCurrentModel = deps.getCurrentModel;
    this.getControlsTarget = deps.getControlsTarget;
    this.getModelBounds = deps.getModelBounds;
    this.stateStore = deps.stateStore;
    this.eventBus = deps.eventBus;

    this.raycaster = new THREE.Raycaster();
    this._ndcCenter = new THREE.Vector2(0, 0);
    this._viewDir = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._smoothFocus = DOF_FOCUS_MIN_M;
  }

  resetSmoothFocus(focus) {
    this._smoothFocus = Math.max(DOF_FOCUS_MIN_M, focus);
  }

  /**
   * @param {number} delta
   * @returns {boolean} whether focus distance changed enough to matter
   */
  tick(delta) {
    const dof = this.stateStore.getState().dof;
    if (!dof?.enabled) return false;

    const mode = normalizeDofFocusMode(dof.focusMode);
    if (mode === 'manual') return false;

    let targetFocus = null;
    if (mode === 'center') {
      targetFocus = this._raycastFocus(this._ndcCenter);
    } else if (mode === 'target') {
      targetFocus = this._targetFocusDistance();
    }

    if (targetFocus == null || !Number.isFinite(targetFocus)) return false;

    targetFocus = Math.max(DOF_FOCUS_MIN_M, targetFocus);
    const alpha = 1 - Math.exp(-SMOOTH_HZ * Math.max(0, delta));
    this._smoothFocus += (targetFocus - this._smoothFocus) * alpha;

    const focus = Math.max(DOF_FOCUS_MIN_M, this._smoothFocus);
    if (Math.abs(focus - dof.focus) < 0.001) return false;

    const next = { ...dof, focus };
    this.stateStore.set('dof.focus', focus);
    this.eventBus.emit('render:dof', next);
    this.eventBus.emit('ui:dof-focus-changed', focus);
    return true;
  }

  /**
   * @param {import('three').Intersection} intersection
   */
  setFocusFromIntersection(intersection) {
    const dof = this.stateStore.getState().dof;
    if (!dof?.enabled || !intersection?.point) return;

    const camera = this.getCamera?.();
    if (!camera) return;

    const viewDepth = worldPointToViewDepth(intersection.point, camera);
    if (!Number.isFinite(viewDepth)) return;

    this._applyFocusPick(Math.max(DOF_FOCUS_MIN_M, viewDepth), dof);
  }

  /**
   * @param {number} distance legacy ray length — prefer setFocusFromIntersection
   */
  setFocusFromClick(distance) {
    const dof = this.stateStore.getState().dof;
    if (!dof?.enabled || !Number.isFinite(distance)) return;
    this._applyFocusPick(Math.max(DOF_FOCUS_MIN_M, distance), dof);
  }

  /**
   * @param {number} focus view depth in meters
   * @param {object} dof
   */
  _applyFocusPick(focus, dof) {
    this._smoothFocus = focus;
    const mode = normalizeDofFocusMode(dof.focusMode);
    const lockManual = mode === 'center' || mode === 'target';

    if (lockManual) {
      this.stateStore.set('dof.focusMode', 'manual');
    }
    this.stateStore.set('dof.focus', focus);

    const next = {
      ...dof,
      focus,
      ...(lockManual ? { focusMode: 'manual' } : {}),
    };
    this.eventBus.emit('render:dof', next);
    this.eventBus.emit('ui:dof-focus-changed', focus);
    this.eventBus.emit('dof:reset-smooth-focus', focus);
    if (lockManual) {
      this.eventBus.emit('ui:dof-focus-mode-changed', 'manual');
    }
  }

  /**
   * @param {object | undefined} dof
   * @returns {number} 0..1 multiplier
   */
  computeZoomAttenuation(dof) {
    if (!dof?.zoomAttenuation) return 1;

    const bounds = this.getModelBounds?.();
    const camera = this.getCamera?.();
    const target = this.getControlsTarget?.();
    if (!bounds?.radius || !camera || !target) return 1;

    const dist = camera.position.distanceTo(target);
    const threshold = Math.max(bounds.radius * 0.85, 0.25);
    if (dist <= threshold) return 1;

    const span = Math.max(bounds.radius * 1.25, 0.5);
    const t = Math.min(1, (dist - threshold) / span);
    return 1 - t * 0.92;
  }

  /**
   * @param {import('three').Vector2} ndc
   * @returns {number | null} view depth in meters
   */
  _raycastFocus(ndc) {
    const camera = this.getCamera?.();
    const model = this.getCurrentModel?.();
    if (!camera || !model) return null;

    this.raycaster.setFromCamera(ndc, camera);
    const hits = this.raycaster.intersectObject(model, true);
    if (!hits.length) return null;
    return worldPointToViewDepth(hits[0].point, camera);
  }

  /** @returns {number | null} */
  _targetFocusDistance() {
    const camera = this.getCamera?.();
    const target = this.getControlsTarget?.();
    if (!camera || !target) return null;

    camera.getWorldDirection(this._viewDir);
    this._toTarget.subVectors(target, camera.position);
    const alongView = this._toTarget.dot(this._viewDir);
    return alongView > DOF_FOCUS_MIN_M ? alongView : null;
  }
}
