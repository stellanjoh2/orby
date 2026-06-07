import * as THREE from 'three';
import { formatBoneName } from './MeshDiagnosticsController.js';

const LABEL_GAP_PX = 6;
const LABEL_OFFSET_PX = 10;
const SEPARATION_ITERATIONS = 6;
const ANCHOR_PULL = 0.22;
const MAX_DRIFT_PX = 72;

/**
 * Screen-space joint name labels snapped to rig joints during playback.
 */
export class JointNameLabelsController {
  constructor({ viewport, getCamera, getDiagnostics, getEnabled = () => false }) {
    this.viewport = viewport;
    this.getCamera = getCamera;
    this.getDiagnostics = getDiagnostics;
    this.getEnabled = getEnabled;

    this._worldPos = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
    this._slots = [];
    this._labelCount = 0;

    this._root = document.createElement('div');
    this._root.className = 'joint-name-labels';
    this._root.setAttribute('aria-hidden', 'true');
    this._root.hidden = true;
    viewport?.appendChild(this._root);
  }

  isActive() {
    return !!this.getEnabled?.() && !!this.getDiagnostics?.()?.jointMarkers;
  }

  /** Keep updating while enabled so labels hide when the skeleton is torn down. */
  shouldUpdate() {
    if (!this._root) return false;
    return !!this.getEnabled?.() || !this._root.hidden;
  }

  setVisible(visible) {
    if (!this._root) return;
    this._root.hidden = !visible;
  }

  _hideAll() {
    this.setVisible(false);
    for (const slot of this._slots) {
      slot.visible = false;
      if (slot.el) slot.el.hidden = true;
    }
  }

  dispose() {
    this._root?.remove();
    this._root = null;
    this._slots = [];
    this._labelCount = 0;
  }

  _ensureLabelElements(count) {
    if (count === this._labelCount) return;

    this._root.textContent = '';
    this._slots = [];

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'joint-name-label';
      this._root.appendChild(el);
      this._slots.push({
        el,
        anchorX: 0,
        anchorY: 0,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        z: 0,
        visible: false,
      });
    }

    this._labelCount = count;
  }

  _measureSlots() {
    for (const slot of this._slots) {
      if (!slot.visible) {
        slot.el.hidden = true;
        continue;
      }
      slot.el.hidden = false;
      const rect = slot.el.getBoundingClientRect();
      slot.width = rect.width;
      slot.height = rect.height;
    }
  }

  _resolveOverlaps() {
    for (let pass = 0; pass < SEPARATION_ITERATIONS; pass++) {
      for (let i = 0; i < this._slots.length; i++) {
        const a = this._slots[i];
        if (!a.visible) continue;

        for (let j = i + 1; j < this._slots.length; j++) {
          const b = this._slots[j];
          if (!b.visible) continue;

          const overlapX =
            (a.width + b.width) * 0.5 + LABEL_GAP_PX - Math.abs(a.x - b.x);
          const overlapY =
            (a.height + b.height) * 0.5 + LABEL_GAP_PX - Math.abs(a.y - b.y);
          if (overlapX <= 0 || overlapY <= 0) continue;

          const push = Math.min(overlapX, overlapY) * 0.55;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.001) {
            const angle = ((i * 0.91 + j * 0.37) % 1) * Math.PI * 2;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
          } else {
            dx /= dist;
            dy /= dist;
          }

          a.x += dx * push;
          a.y += dy * push;
          b.x -= dx * push;
          b.y -= dy * push;
        }
      }

      for (const slot of this._slots) {
        if (!slot.visible) continue;
        const preferredY = slot.anchorY - LABEL_OFFSET_PX - slot.height * 0.5;
        slot.x += (slot.anchorX - slot.x) * ANCHOR_PULL;
        slot.y += (preferredY - slot.y) * ANCHOR_PULL;

        const dx = slot.x - slot.anchorX;
        const dy = slot.y - (slot.anchorY - LABEL_OFFSET_PX);
        const drift = Math.hypot(dx, dy);
        if (drift > MAX_DRIFT_PX) {
          const s = MAX_DRIFT_PX / drift;
          slot.x = slot.anchorX + dx * s;
          slot.y = slot.anchorY - LABEL_OFFSET_PX + dy * s;
        }
      }
    }
  }

  _applySlotPositions(viewportRect) {
    for (const slot of this._slots) {
      if (!slot.visible) {
        slot.el.hidden = true;
        continue;
      }
      slot.el.hidden = false;
      const left = slot.x - slot.width * 0.5 - viewportRect.left;
      const top = slot.y - slot.height * 0.5 - viewportRect.top;
      slot.el.style.transform = `translate(${left}px, ${top}px)`;
    }
  }

  update() {
    if (!this._root) return;

    const enabled = !!this.getEnabled?.();
    const diagnostics = this.getDiagnostics();
    const hasJoints = !!diagnostics?.jointMarkers;

    if (!enabled || !hasJoints) {
      this._hideAll();
      return;
    }

    const camera = this.getCamera?.();
    const viewport = this.viewport;
    if (!camera || !viewport) {
      this._hideAll();
      return;
    }

    const bones = diagnostics.getJointBones?.() ?? [];
    if (!bones.length) {
      this._hideAll();
      return;
    }

    this.setVisible(true);
    this._ensureLabelElements(bones.length);

    if (diagnostics.currentModel) {
      diagnostics.currentModel.updateMatrixWorld(true);
    }

    const viewportRect = viewport.getBoundingClientRect();
    if (!(viewportRect.width > 0) || !(viewportRect.height > 0)) {
      this._hideAll();
      return;
    }

    for (let i = 0; i < bones.length; i++) {
      const slot = this._slots[i];
      const bone = bones[i];
      bone.updateWorldMatrix(true, false);
      bone.getWorldPosition(this._worldPos);
      this._ndc.copy(this._worldPos).project(camera);

      if (this._ndc.z > 1 || this._ndc.z < -1) {
        slot.visible = false;
        continue;
      }

      slot.anchorX = (this._ndc.x * 0.5 + 0.5) * viewportRect.width;
      slot.anchorY = (-this._ndc.y * 0.5 + 0.5) * viewportRect.height;
      slot.x = slot.anchorX;
      slot.y = slot.anchorY - LABEL_OFFSET_PX;
      slot.z = this._ndc.z;
      slot.visible = true;
      slot.el.textContent = formatBoneName(bone, { fallbackIndex: i });
    }

    this._slots.sort((a, b) => b.z - a.z);
    this._applySlotPositions(viewportRect);
    this._measureSlots();
    this._resolveOverlaps();
    this._applySlotPositions(viewportRect);

    const visibleSlots = this._slots
      .filter((slot) => slot.visible)
      .sort((a, b) => a.z - b.z);
    for (const slot of visibleSlots) {
      this._root.appendChild(slot.el);
    }
  }
}
