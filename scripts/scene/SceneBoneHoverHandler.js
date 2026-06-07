import * as THREE from 'three';
import { formatBoneName } from '../render/MeshDiagnosticsController.js';

const HOVER_CLEAR_DELAY_MS = 40;

/** Hover tooltips for skeleton joints in the viewport. */
export class SceneBoneHoverHandler {
  constructor(deps) {
    this.canvas = deps.canvas;
    this.camera = deps.camera;
    this.getDiagnostics = deps.getDiagnostics;
    this.getControls = deps.getControls;
    this.getIsGizmoDragging = deps.getIsGizmoDragging;
    this.getShowJointNames = deps.getShowJointNames;
    this.tooltips = deps.tooltips;

    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2();
    this._activeBoneUuid = null;
    this._clearHoverTimer = null;
    this._lastPointerEvent = null;

    this._onPointerMove = null;
    this._onPointerLeave = null;
  }

  attach() {
    this._onPointerMove = (event) => {
      this._evaluatePointer(event);
    };

    this._onPointerLeave = () => {
      this._scheduleClearHover();
    };

    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerleave', this._onPointerLeave);
  }

  detach() {
    if (this._onPointerMove) {
      this.canvas.removeEventListener('pointermove', this._onPointerMove);
    }
    if (this._onPointerLeave) {
      this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    }
    this._onPointerMove = null;
    this._onPointerLeave = null;
    this._cancelClearHover();
    this._clearHoverImmediate();
  }

  _cancelClearHover() {
    if (this._clearHoverTimer) {
      clearTimeout(this._clearHoverTimer);
      this._clearHoverTimer = null;
    }
  }

  _scheduleClearHover() {
    this._cancelClearHover();
    this._clearHoverTimer = setTimeout(() => {
      this._clearHoverTimer = null;
      this._clearHoverImmediate();
    }, HOVER_CLEAR_DELAY_MS);
  }

  _clearHoverImmediate() {
    this._activeBoneUuid = null;
    this._lastPointerEvent = null;
    this.getDiagnostics?.()?.clearBoneHover?.();
    this.tooltips?.hideTooltip?.();
  }

  _evaluatePointer(event) {
    this._lastPointerEvent = event;

    const diagnostics = this.getDiagnostics?.();
    if (!diagnostics?.jointMarkers) {
      this._scheduleClearHover();
      return;
    }

    const controls = this.getControls?.();
    if (controls?.state) {
      this._scheduleClearHover();
      return;
    }

    if (this.getIsGizmoDragging?.()) {
      this._scheduleClearHover();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;

    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const pick = diagnostics.pickJoint(this.raycaster);
    if (!pick?.bone) {
      this._scheduleClearHover();
      return;
    }

    this._cancelClearHover();
    diagnostics.setJointHover(pick);

    if (this.getShowJointNames?.()) {
      return;
    }

    const boneUuid = pick.bone.uuid;
    const label = formatBoneName(pick.bone, {
      fallbackIndex: pick.jointIndex,
    });

    if (this._activeBoneUuid === boneUuid && this.tooltips?.isVisible) {
      this.tooltips.updatePositionAtPoint(event.clientX, event.clientY);
      return;
    }

    this._activeBoneUuid = boneUuid;
    this.tooltips?.showAtPoint?.(event.clientX, event.clientY, label);
  }
}
