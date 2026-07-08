import * as THREE from 'three';
import { ORBY_LIME, ORBY_PINK, ORBY_PURPLE_BRIGHT } from '../constants.js';

const RENDER_ORDER = 1005;
const ORBIT_SEGMENTS = 72;
/** +25% over stock TransformControls gizmo — easier to see and grab in the viewport. */
const LIGHT_MANIP_BOOST = 1.25;
/** Match TransformControls gizmo tube radius (before setSize scale). */
const GIZMO_TUBE = 0.00375 * LIGHT_MANIP_BOOST;
const GIZMO_UNIT_HALF = 0.5;
const GIZMO_ARROW_RADIUS = 0.02 * LIGHT_MANIP_BOOST;
const GIZMO_ARROW_HEIGHT = 0.1 * LIGHT_MANIP_BOOST;

const _Y_AXIS = new THREE.Vector3(0, 1, 0);
const _TANGENT_CCW = new THREE.Vector3();
const _TANGENT_CW = new THREE.Vector3();
const _ORBIT_QUAT = new THREE.Quaternion();

/** @param {number} segments */
function createOrbitCircleGeometry(segments = ORBIT_SEGMENTS) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

/** Same cone + stem as {@link TransformControls} translate handles. */
function createGizmoArrowGeometry() {
  const geometry = new THREE.CylinderGeometry(
    0,
    GIZMO_ARROW_RADIUS,
    GIZMO_ARROW_HEIGHT,
    12,
  );
  geometry.translate(0, GIZMO_ARROW_HEIGHT * 0.5, 0);
  return geometry;
}

function createGizmoShaftGeometry() {
  const geometry = new THREE.CylinderGeometry(GIZMO_TUBE, GIZMO_TUBE, GIZMO_UNIT_HALF, 3);
  geometry.translate(0, GIZMO_UNIT_HALF * 0.5, 0);
  return geometry;
}

/**
 * Viewport widget for a selected spotlight — orbit line + TransformControls-style axis handles.
 */
export class LightManipulatorWidget {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'LightManipulator';
    this.root.frustumCulled = false;
    this.root.visible = false;
    this.root.userData.orbyLightManipulator = true;
    this.root.userData.skipBokehDepth = true;

    this._materials = this._createMaterials();
    this._orbitUnitGeometry = createOrbitCircleGeometry();
    this._arrowGeometry = createGizmoArrowGeometry();
    this._shaftGeometry = createGizmoShaftGeometry();
    this._build();
    /** @type {string | null} */
    this._hoverPart = null;
  }

  _createMaterials() {
    const shared = {
      depthTest: false,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      transparent: true,
    };

    return {
      orbitLineMat: new THREE.LineBasicMaterial({
        ...shared,
        color: ORBY_PURPLE_BRIGHT,
        opacity: 0.5,
      }),
      heightMat: new THREE.MeshBasicMaterial({
        ...shared,
        color: ORBY_LIME,
        opacity: 0.5,
      }),
      rotateMat: new THREE.MeshBasicMaterial({
        ...shared,
        color: ORBY_PINK,
        opacity: 0.5,
      }),
      pickerMat: new THREE.MeshBasicMaterial({
        ...shared,
        opacity: 0.001,
      }),
    };
  }

  _build() {
    const ringGroup = new THREE.Group();
    ringGroup.name = 'LightManipulatorRing';

    const ringLine = new THREE.LineLoop(
      this._orbitUnitGeometry,
      this._materials.orbitLineMat,
    );
    ringLine.name = 'LightManipulatorOrbitLine';
    ringLine.renderOrder = RENDER_ORDER;
    ringLine.userData.orbyLightManipPart = 'rotate';

    ringGroup.add(ringLine);
    this._ringGroup = ringGroup;
    this._ringLine = ringLine;

    const handlesGroup = new THREE.Group();
    handlesGroup.name = 'LightManipulatorHandles';

    this._heightUp = this._createAxisHandle('heightUp', this._materials.heightMat, 1);
    this._heightDown = this._createAxisHandle('heightDown', this._materials.heightMat, -1);
    this._rotateRight = this._createAxisHandle('rotateRight', this._materials.rotateMat, 1);
    this._rotateLeft = this._createAxisHandle('rotateLeft', this._materials.rotateMat, -1);

    handlesGroup.add(
      this._heightUp.group,
      this._heightDown.group,
      this._rotateRight.group,
      this._rotateLeft.group,
    );
    this._handlesGroup = handlesGroup;

    this.root.add(ringGroup, handlesGroup);
  }

  /**
   * @param {string} part
   * @param {THREE.MeshBasicMaterial} material
   * @param {1 | -1} sign
   */
  _createAxisHandle(part, material, sign) {
    const group = new THREE.Group();
    group.userData.orbyLightManipPart = part;

    const shaft = new THREE.Mesh(this._shaftGeometry, material);
    shaft.renderOrder = RENDER_ORDER;

    const head = new THREE.Mesh(this._arrowGeometry, material);
    head.position.y = GIZMO_UNIT_HALF;
    head.renderOrder = RENDER_ORDER + 1;

    const picker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0, 0.6, 4),
      this._materials.pickerMat,
    );
    picker.position.y = GIZMO_UNIT_HALF * 0.6;
    picker.userData.orbyLightManipPart = part;

    if (sign < 0) {
      group.rotation.x = Math.PI;
    }

    group.add(shaft, head, picker);
    return { group, shaft, head, picker, sign };
  }

  /**
   * @param {{
   *   center: import('three').Vector3,
   *   lightPosition: import('three').Vector3,
   *   extent: number,
   *   rotateMotionX?: number,
   *   rotateMotionZ?: number,
   * }} layout
   */
  updateLayout({ center, lightPosition, extent, rotateMotionX = 0, rotateMotionZ = 0 }) {
    const safeExtent = Math.max(Number(extent) || 0, 0.5);
    const widgetSize = Math.max(safeExtent * 0.42 * LIGHT_MANIP_BOOST, 0.35 * LIGHT_MANIP_BOOST);
    const ringRadius = Math.max(
      Math.hypot(lightPosition.x - center.x, lightPosition.z - center.z),
      safeExtent * 0.35,
    );
    const ringY = lightPosition.y;

    this._ringGroup.position.set(center.x, ringY, center.z);
    this._ringLine.scale.set(ringRadius, 1, ringRadius);

    const dx = lightPosition.x - center.x;
    const dz = lightPosition.z - center.z;
    const orbitLen = Math.hypot(dx, dz) || 1;
    const motionLen = Math.hypot(rotateMotionX, rotateMotionZ);
    if (motionLen > 1e-6) {
      _TANGENT_CCW.set(rotateMotionX / motionLen, 0, rotateMotionZ / motionLen);
      _TANGENT_CW.set(-rotateMotionX / motionLen, 0, -rotateMotionZ / motionLen);
    } else {
      _TANGENT_CCW.set(-dz / orbitLen, 0, dx / orbitLen);
      _TANGENT_CW.set(dz / orbitLen, 0, -dx / orbitLen);
    }

    this._handlesGroup.position.copy(lightPosition);

    this._heightUp.group.quaternion.identity();
    this._heightDown.group.quaternion.setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI,
    );

    _ORBIT_QUAT.setFromUnitVectors(_Y_AXIS, _TANGENT_CCW);
    this._rotateRight.group.quaternion.copy(_ORBIT_QUAT);

    _ORBIT_QUAT.setFromUnitVectors(_Y_AXIS, _TANGENT_CW);
    this._rotateLeft.group.quaternion.copy(_ORBIT_QUAT);

    for (const handle of [
      this._heightUp,
      this._heightDown,
      this._rotateRight,
      this._rotateLeft,
    ]) {
      handle.group.scale.setScalar(widgetSize);
    }
  }

  setVisible(visible) {
    this.root.visible = !!visible;
    if (!visible) {
      this.setHoveredPart(null);
    }
  }

  /**
   * Match TransformControls — 50% at rest, full opacity on the hovered handle.
   * @param {string | null} part
   */
  setHoveredPart(part) {
    if (part === this._hoverPart) return;
    this._hoverPart = part;

    const orbitHover = part === 'rotate';
    const heightHover = part === 'heightUp' || part === 'heightDown';
    const rotateHover = part === 'rotateLeft' || part === 'rotateRight';

    this._materials.orbitLineMat.opacity = orbitHover ? 1.0 : 0.5;
    this._materials.heightMat.opacity = heightHover ? 1.0 : 0.5;
    this._materials.rotateMat.opacity = rotateHover ? 1.0 : 0.5;
  }

  dispose() {
    this._orbitUnitGeometry.dispose();
    this._arrowGeometry.dispose();
    this._shaftGeometry.dispose();
    for (const mat of Object.values(this._materials)) {
      mat.dispose();
    }
    this.root.removeFromParent();
  }
}
