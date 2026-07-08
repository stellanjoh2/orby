import * as THREE from 'three';
import {
  applyPerLightHeightDelta,
  applyPerLightRotateDelta,
  applyPerLightTransformLive,
  canAdjustLightTransformFromViewport,
  commitPerLightTransform,
  readPerLightTransform,
} from '../lights/lightViewportTransform.js';
import { isDirectionalLightId } from '../lights/lightCastShadowEffective.js';
import { LightManipulatorWidget } from '../render/LightManipulatorWidget.js';

const CLICK_THRESHOLD_PX = 14;
const CLICK_TIME_MS = 280;
/** Fallback when the height axis is edge-on to the camera. */
const HEIGHT_DRAG_SENSITIVITY = 0.1;
const ROTATE_DRAG_SENSITIVITY = 0.5;
const _NDC = new THREE.Vector2();
const _CENTER = new THREE.Vector3();
const _LIGHT_POS = new THREE.Vector3();
const _WORLD_TIP = new THREE.Vector3();
const _NDC3 = new THREE.Vector3();
const _SCREEN_ORIGIN = new THREE.Vector2();
const _SCREEN_TIP = new THREE.Vector2();
const _SCREEN_AXIS = new THREE.Vector2();
let _rotatePixelsPerDegree = 1;

/**
 * Click-to-select spotlight cones; drag orbit line or axis arrows to adjust per-light transform.
 */
export class LightViewportSelectionController {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   * @param {{
   *   canvas: HTMLCanvasElement,
   *   onSelectionChange?: () => void,
   * }} deps
   */
  constructor(scene, { canvas, onSelectionChange }) {
    this.scene = scene;
    this.canvas = canvas;
    this.onSelectionChange = onSelectionChange;

    this.raycaster = new THREE.Raycaster();
    this.widget = new LightManipulatorWidget();
    scene.scene.add(this.widget.root);

    /** @type {string | null} */
    this._selectedLightId = null;
    /** @type {null | {
     *   kind: 'rotate' | 'rotateLeft' | 'rotateRight' | 'heightUp' | 'heightDown',
     *   lightId: string,
     *   pointerId: number,
     *   startX?: number,
     *   baseRotate?: number,
     *   baseHeight?: number,
     *   startY?: number,
     *   currentRotate?: number,
     *   currentHeight?: number,
     * }} */
    this._drag = null;
    /** @type {{ pan: boolean, rotate: boolean } | null} */
    this._savedOrbitState = null;

    this._pointerDownPos = null;
    this._pointerDownTime = 0;
    this._pendingDeselect = false;
    /** @type {string | null} */
    this._hoverPart = null;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerMoveHover = this._onPointerMoveHover.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerCancel = this._onPointerCancel.bind(this);
    this._onPointerLeaveCanvas = this._onPointerLeaveCanvas.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // Capture phase — run before OrbitControls so cone/manip clicks do not start orbit.
    this.canvas?.addEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas?.addEventListener('pointermove', this._onPointerMoveHover);
    this.canvas?.addEventListener('pointerleave', this._onPointerLeaveCanvas);
    document.addEventListener('pointerup', this._onPointerUp, true);
    document.addEventListener('pointercancel', this._onPointerCancel, true);
    document.addEventListener('keydown', this._onKeyDown);
  }

  get selectedLightId() {
    return this._selectedLightId;
  }

  /** @returns {import('three').Group | null} */
  getOverlayRoot() {
    return this.widget.root;
  }

  /** @param {number} clientX @param {number} clientY @returns {boolean} */
  hitsLightConeAt(clientX, clientY) {
    return this._pickAt(clientX, clientY)?.type === 'cone';
  }

  deselect() {
    if (!this._selectedLightId) return;
    this._endDrag(false);
    this._setHoverPart(null);
    this._selectedLightId = null;
    this.scene.lightsController?.setSelectedLightId?.(null);
    this.widget.setVisible(false);
    this.onSelectionChange?.();
    this.scene.lightIndicatorHud?.update?.();
    this.scene.requestRender?.();
  }

  /** @param {string | null} lightId */
  selectLight(lightId) {
    if (!lightId || !isDirectionalLightId(lightId)) {
      this.deselect();
      return;
    }

    const state = this.scene.stateStore.getState();
    if (!canAdjustLightTransformFromViewport(state, lightId)) {
      this.deselect();
      return;
    }

    this._ensureLightEnabled(lightId);
    this._clearMeshWidgets();

    this._selectedLightId = lightId;
    this.scene.lightsController?.setSelectedLightId?.(lightId);
    this.scene.cameraController?.onMeshGizmoDragStart?.();
    this.widget.setVisible(true);
    this.updateWidget();
    this.onSelectionChange?.();
    this.scene.lightIndicatorHud?.update?.();
    this.scene.requestRender?.();
  }

  updateWidget() {
    if (!this._selectedLightId) {
      this.widget.setVisible(false);
      return;
    }

    const lc = this.scene.lightsController;
    const light = lc?.lights?.[this._selectedLightId];
    if (!light) {
      this.deselect();
      return;
    }

    light.getWorldPosition(_LIGHT_POS);
    lc._getIndicatorCenter?.(_CENTER);
    const { rotate } = readPerLightTransform(this.scene, this._selectedLightId);
    this._computeLightWorldPositionAtRotate(lc, this._selectedLightId, rotate, _LIGHT_POS);
    this._computeLightWorldPositionAtRotate(lc, this._selectedLightId, rotate + 1, _WORLD_TIP);
    this.widget.updateLayout({
      center: _CENTER,
      lightPosition: _LIGHT_POS,
      extent: lc._indicatorFrustumExtent ?? 3,
      rotateMotionX: _WORLD_TIP.x - _LIGHT_POS.x,
      rotateMotionZ: _WORLD_TIP.z - _LIGHT_POS.z,
    });
    this.widget.setVisible(true);
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    if (event.button !== 0) return;
    if (!this._canInteract()) return;

    const target = event.target;
    const onCanvas = target === this.canvas || this.canvas.contains(target);
    if (!onCanvas) return;
    if (target instanceof Element && target.closest('.light-indicator-hud-layer')) return;

    this._pointerDownPos = { x: event.clientX, y: event.clientY };
    this._pointerDownTime = performance.now();
    this._pendingDeselect = false;

    const pick = this._pickAt(event.clientX, event.clientY);

    if (pick?.type === 'manip' && this._selectedLightId) {
      event.preventDefault();
      event.stopPropagation();
      this._startManipDrag(pick.part, event);
      return;
    }

    if (pick?.type === 'cone') {
      event.preventDefault();
      event.stopPropagation();
      this.selectLight(pick.lightId);
      return;
    }

    this._pendingDeselect = !!this._selectedLightId;
  }

  /** @param {PointerEvent} event */
  _onPointerMoveHover(event) {
    if (this._drag || !this._selectedLightId || !this.widget.root.visible) {
      this._setHoverPart(null);
      return;
    }

    const pick = this._pickAt(event.clientX, event.clientY);
    const part = pick?.type === 'manip' ? pick.part : null;
    this._setHoverPart(part);
  }

  _onPointerLeaveCanvas() {
    this._setHoverPart(null);
  }

  /** @param {string | null} part */
  _setHoverPart(part) {
    if (part === this._hoverPart) return;
    this._hoverPart = part;
    this.widget.setHoveredPart(part);
    this.scene.requestRender?.();
  }

  /** @param {PointerEvent} event */
  _onPointerMove(event) {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    event.preventDefault();

    if (this._drag.kind === 'rotate') {
      this._applyScreenSpaceRotateDrag(event.clientX, event.clientY);
    } else if (this._drag.kind === 'rotateLeft' || this._drag.kind === 'rotateRight') {
      this._applyScreenSpaceRotateDrag(event.clientX, event.clientY);
    } else {
      this._applyHeightDrag(event.clientX, event.clientY);
    }
  }

  /** @param {PointerEvent} event */
  _onPointerUp(event) {
    if (this._drag && event.pointerId === this._drag.pointerId) {
      this._endDrag(true);
      this._resetPointerState();
      return;
    }

    if (!this._pointerDownPos) {
      this._resetPointerState();
      return;
    }

    if (event.target instanceof Element && event.target.closest('.light-indicator-hud-layer')) {
      this._resetPointerState();
      return;
    }

    const move = Math.hypot(
      event.clientX - this._pointerDownPos.x,
      event.clientY - this._pointerDownPos.y,
    );
    const elapsed = performance.now() - this._pointerDownTime;
    const wasClick = move < CLICK_THRESHOLD_PX && elapsed < CLICK_TIME_MS;

    if (wasClick) {
      const pick = this._pickAt(event.clientX, event.clientY);
      if (pick?.type === 'cone') {
        this.selectLight(pick.lightId);
      } else if (this._pendingDeselect) {
        this.deselect();
      }
    }

    this._resetPointerState();
  }

  /** @param {PointerEvent} event */
  _onPointerCancel(event) {
    if (this._drag && event.pointerId === this._drag.pointerId) {
      this._endDrag(true);
    }
    this._resetPointerState();
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    if (event.key === 'Escape' && this._selectedLightId) {
      this.deselect();
    }
  }

  _resetPointerState() {
    this._pointerDownPos = null;
    this._pointerDownTime = 0;
    this._pendingDeselect = false;
  }

  _canInteract() {
    const state = this.scene.stateStore.getState();
    return canAdjustLightTransformFromViewport(state, 'key');
  }

  /** @param {number} clientX @param {number} clientY */
  _updateRaycaster(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return false;
    _NDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _NDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_NDC, this.scene.camera);
    return true;
  }

  /** @param {import('three').Object3D} object */
  _resolveManipPart(object) {
    let current = object;
    while (current) {
      const part = current.userData?.orbyLightManipPart;
      if (
        part === 'rotate'
        || part === 'rotateLeft'
        || part === 'rotateRight'
        || part === 'heightUp'
        || part === 'heightDown'
      ) {
        return part;
      }
      current = current.parent;
    }
    return null;
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{ type: 'cone', lightId: string, distance: number } | { type: 'manip', part: string, distance: number } | null}
   */
  _pickAt(clientX, clientY) {
    if (!this._updateRaycaster(clientX, clientY)) return null;

    const lc = this.scene.lightsController;
    const extent = lc?._indicatorFrustumExtent ?? 3;
    this.raycaster.params.Line.threshold = Math.max(0.1, extent * 0.045);

    const selectedId = this._selectedLightId;

    if (selectedId && this.widget.root.visible) {
      this.widget.root.updateMatrixWorld(true);
      for (const hit of this.raycaster.intersectObject(this.widget.root, true)) {
        const part = this._resolveManipPart(hit.object);
        if (part) {
          return { type: 'manip', part, distance: hit.distance };
        }
      }
    }

    const indicators = lc?.lightIndicators;
    if (indicators?.visible) {
      indicators.updateMatrixWorld(true);
      for (const hit of this.raycaster.intersectObject(indicators, true)) {
        const lightId = hit.object.userData.lightId
          ?? hit.object.parent?.userData?.lightId;
        if (!isDirectionalLightId(lightId)) continue;
        if (selectedId && lightId === selectedId) continue;
        return { type: 'cone', lightId, distance: hit.distance };
      }
    }

    return null;
  }

  /** @param {'rotate' | 'rotateLeft' | 'rotateRight' | 'heightUp' | 'heightDown'} kind @param {PointerEvent} event */
  _startManipDrag(kind, event) {
    const lightId = this._selectedLightId;
    if (!lightId) return;

    const { rotate, height } = readPerLightTransform(this.scene, lightId);
    /** @type {NonNullable<typeof this._drag>} */
    const drag = {
      kind,
      lightId,
      pointerId: event.pointerId,
      baseRotate: rotate,
      baseHeight: height,
      currentRotate: rotate,
      currentHeight: height,
      startX: event.clientX,
      startY: event.clientY,
    };

    this._drag = drag;
    this.scene._lightMoveDragActive = true;
    this.scene.cameraController?.onMeshGizmoDragStart?.();
    this._suspendOrbit();

    document.addEventListener('pointermove', this._onPointerMove, true);
    document.addEventListener('pointerup', this._onPointerUp, true);
    document.addEventListener('pointercancel', this._onPointerCancel, true);

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  /**
   * @param {import('../render/LightsController.js').LightsController} lc
   * @param {string} lightId
   * @param {number} rotateDeg
   * @param {import('three').Vector3} out
   */
  _computeLightWorldPositionAtRotate(lc, lightId, rotateDeg, out) {
    const base = lc.basePositions[lightId];
    const props = lc.individualProperties[lightId];
    const globalRadians = THREE.MathUtils.degToRad(lc.rotation ?? 0);
    const individualRadians = THREE.MathUtils.degToRad(rotateDeg);
    const totalRotation = globalRadians + individualRadians;
    const cos = Math.cos(totalRotation);
    const sin = Math.sin(totalRotation);
    const scale = lc.rigScale ?? 1;
    const rawY = props?.height ?? lc.lightsHeight ?? base.y;
    const y = (Number.isFinite(Number(rawY)) ? Number(rawY) : base.y) * scale;
    out.set(
      (base.x * cos + base.z * sin) * scale,
      y,
      (-base.x * sin + base.z * cos) * scale,
    );
  }

  /**
   * Screen-space axis for +1° individual rotate (or −1° for rotateLeft).
   * Uses actual light motion, not the orbit ring tangent around the indicator center.
   * @param {string} lightId
   * @param {number} rotateDeg
   * @param {'rotate' | 'rotateLeft' | 'rotateRight'} kind
   * @param {THREE.Vector2} outAxis
   * @returns {boolean}
   */
  _getRotateScreenDragScale(lightId, rotateDeg, kind, outAxis) {
    const lc = this.scene.lightsController;
    if (!lc?.basePositions?.[lightId]) return false;

    const stepDeg = kind === 'rotateLeft' ? -1 : 1;
    this._computeLightWorldPositionAtRotate(lc, lightId, rotateDeg, _LIGHT_POS);
    this._computeLightWorldPositionAtRotate(lc, lightId, rotateDeg + stepDeg, _WORLD_TIP);
    this._worldToClientXY(_LIGHT_POS, _SCREEN_ORIGIN);
    this._worldToClientXY(_WORLD_TIP, _SCREEN_TIP);
    outAxis.subVectors(_SCREEN_TIP, _SCREEN_ORIGIN);
    _rotatePixelsPerDegree = outAxis.length();
    if (!(_rotatePixelsPerDegree > 1e-4)) {
      outAxis.set(kind === 'rotateLeft' ? -1 : 1, 0);
      _rotatePixelsPerDegree = 0;
      return false;
    }
    outAxis.divideScalar(_rotatePixelsPerDegree);
    return true;
  }

  /** @param {number} clientX @param {number} clientY */
  _applyScreenSpaceRotateDrag(clientX, clientY) {
    const drag = this._drag;
    if (
      !drag
      || (drag.kind !== 'rotate'
        && drag.kind !== 'rotateLeft'
        && drag.kind !== 'rotateRight')
    ) {
      return;
    }

    const deltaX = clientX - (drag.startX ?? clientX);
    const deltaY = clientY - (drag.startY ?? clientY);

    let signedDelta = (drag.kind === 'rotateLeft' ? -deltaX : deltaX) * ROTATE_DRAG_SENSITIVITY;
    if (this._getRotateScreenDragScale(drag.lightId, drag.baseRotate ?? 0, drag.kind, _SCREEN_AXIS)) {
      signedDelta = (deltaX * _SCREEN_AXIS.x + deltaY * _SCREEN_AXIS.y) / _rotatePixelsPerDegree;
    }

    drag.currentRotate = applyPerLightRotateDelta(
      drag.baseRotate ?? 0,
      signedDelta,
      { fine: false },
    );

    this._applyRotateLive(drag);
  }

  /** @param {NonNullable<typeof this._drag>} drag */
  _applyRotateLive(drag) {
    applyPerLightTransformLive(this.scene, drag.lightId, {
      rotate: drag.currentRotate,
    });
    this.updateWidget();
    this.scene.lightIndicatorHud?.update?.();
  }

  /** @param {import('three').Vector3} world @param {THREE.Vector2} out */
  _worldToClientXY(world, out) {
    const rect = this.canvas.getBoundingClientRect();
    _NDC3.copy(world).project(this.scene.camera);
    out.x = (_NDC3.x * 0.5 + 0.5) * rect.width + rect.left;
    out.y = (-_NDC3.y * 0.5 + 0.5) * rect.height + rect.top;
  }

  /**
   * Screen pixels per one logical height unit at the current camera/light pose.
   * @param {import('three').Vector3} lightWorldPos
   * @returns {number}
   */
  _logicalHeightPixelsPerUnit(lightWorldPos) {
    const rigScale = this.scene.lightsController?.rigScale ?? 1;
    this._worldToClientXY(lightWorldPos, _SCREEN_ORIGIN);
    _WORLD_TIP.set(lightWorldPos.x, lightWorldPos.y + rigScale, lightWorldPos.z);
    this._worldToClientXY(_WORLD_TIP, _SCREEN_TIP);
    return Math.max(_SCREEN_ORIGIN.distanceTo(_SCREEN_TIP), 1e-3);
  }

  /**
   * Screen-space unit axis for height drag — matches the grabbed arrow direction.
   * @param {'heightUp' | 'heightDown'} kind
   * @param {import('three').Vector3} lightWorldPos
   * @param {THREE.Vector2} out
   * @returns {boolean}
   */
  _getHeightDragScreenAxis(kind, lightWorldPos, out) {
    const rigScale = this.scene.lightsController?.rigScale ?? 1;
    this._worldToClientXY(lightWorldPos, _SCREEN_ORIGIN);
    _WORLD_TIP.copy(lightWorldPos).y += rigScale;
    this._worldToClientXY(_WORLD_TIP, _SCREEN_TIP);
    out.subVectors(_SCREEN_TIP, _SCREEN_ORIGIN);
    if (kind === 'heightDown') {
      out.multiplyScalar(-1);
    }
    const len = out.length();
    if (!(len > 1e-4)) {
      out.set(0, kind === 'heightDown' ? 1 : -1);
      return false;
    }
    out.divideScalar(len);
    return true;
  }

  /** @param {number} clientX @param {number} clientY */
  _applyHeightDrag(clientX, clientY) {
    const drag = this._drag;
    if (!drag || drag.kind === 'rotate' || drag.kind === 'rotateLeft' || drag.kind === 'rotateRight') {
      return;
    }

    const deltaX = clientX - (drag.startX ?? clientX);
    const deltaY = clientY - (drag.startY ?? clientY);

    const lc = this.scene.lightsController;
    lc?.lights?.[drag.lightId]?.getWorldPosition(_LIGHT_POS);

    let heightDelta = -deltaY * HEIGHT_DRAG_SENSITIVITY;
    if (
      (drag.kind === 'heightUp' || drag.kind === 'heightDown')
      && this._getHeightDragScreenAxis(drag.kind, _LIGHT_POS, _SCREEN_AXIS)
    ) {
      const pixelsPerUnit = this._logicalHeightPixelsPerUnit(_LIGHT_POS);
      heightDelta = (deltaX * _SCREEN_AXIS.x + deltaY * _SCREEN_AXIS.y) / pixelsPerUnit;
    } else if (drag.kind === 'heightDown') {
      heightDelta = deltaY * HEIGHT_DRAG_SENSITIVITY;
    }

    drag.currentHeight = applyPerLightHeightDelta(
      drag.baseHeight ?? 0,
      heightDelta,
      { fine: false },
    );

    applyPerLightTransformLive(this.scene, drag.lightId, {
      height: drag.currentHeight,
    });
    this.updateWidget();
    this.scene.lightIndicatorHud?.update?.();
  }

  /** @param {boolean} commit */
  _endDrag(commit) {
    const drag = this._drag;
    if (!drag) return;

    document.removeEventListener('pointermove', this._onPointerMove, true);
    document.removeEventListener('pointerup', this._onPointerUp, true);
    document.removeEventListener('pointercancel', this._onPointerCancel, true);

    try {
      this.canvas.releasePointerCapture(drag.pointerId);
    } catch {
      // ignore
    }

    if (commit) {
      commitPerLightTransform(this.scene, drag.lightId, {
        rotate: drag.currentRotate,
        height: drag.currentHeight,
      });
    }

    this._drag = null;
    this.scene._lightMoveDragActive = false;
    this._restoreOrbit();
    this.updateWidget();
    this.scene.requestRender?.();
  }

  /** @param {string} lightId */
  _ensureLightEnabled(lightId) {
    const state = this.scene.stateStore.getState();
    if (state.lights?.[lightId]?.enabled === true) return;

    this.scene.stateStore.set(`lights.${lightId}.enabled`, true);
    this.scene.eventBus.emit('lights:update', {
      lightId,
      property: 'enabled',
      value: true,
    });

    const enabledInput = this.scene.ui?.inputs?.[`${lightId}LightEnabled`];
    if (enabledInput) enabledInput.checked = true;

    if (!this.scene.stateStore.getState().lightsEnabled) {
      this.scene.stateStore.set('lightsEnabled', true);
      this.scene.eventBus.emit('lights:enabled', true);
      if (this.scene.ui?.inputs?.lightsEnabled) {
        this.scene.ui.inputs.lightsEnabled.checked = true;
      }
    }

    this.scene.ui?.syncControls?.(this.scene.stateStore.getState());
  }

  _clearMeshWidgets() {
    this.scene.stateStore.set('moveWidgetEnabled', false);
    this.scene.stateStore.set('rotateWidgetEnabled', false);
    this.scene.stateStore.set('scaleWidgetEnabled', false);
    this.scene.eventBus.emit('mesh:move-widget-enabled', false);
    this.scene.eventBus.emit('mesh:rotate-widget-enabled', false);
    this.scene.eventBus.emit('mesh:scale-widget-enabled', false);
  }

  _suspendOrbit() {
    const cc = this.scene.cameraController;
    if (!cc?.controls || this._savedOrbitState) return;
    this._savedOrbitState = {
      pan: cc.controls.enablePan,
      rotate: cc.controls.enableRotate,
    };
    cc.controls.enablePan = false;
    cc.controls.enableRotate = false;
  }

  _restoreOrbit() {
    const cc = this.scene.cameraController;
    if (!cc?.controls || !this._savedOrbitState) return;
    cc.controls.enablePan = this._savedOrbitState.pan;
    cc.controls.enableRotate = this._savedOrbitState.rotate;
    this._savedOrbitState = null;
  }

  dispose() {
    this._endDrag(false);
    this.deselect();
    this.canvas?.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas?.removeEventListener('pointermove', this._onPointerMoveHover);
    this.canvas?.removeEventListener('pointerleave', this._onPointerLeaveCanvas);
    document.removeEventListener('pointerup', this._onPointerUp, true);
    document.removeEventListener('pointercancel', this._onPointerCancel, true);
    document.removeEventListener('keydown', this._onKeyDown);
    this.widget.dispose();
  }
}
