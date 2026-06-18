import * as THREE from 'three';
import { DOF_FOCUS_MIN_M, ORBY_PURPLE_BRIGHT } from '../constants.js';
import {
  focusDistanceToBokehFocalDepth,
  viewDepthPlaneExtents,
  viewDepthToWorldPointOnAxis,
} from './dofFocalDepth.js';

/**
 * Debug overlay: camera-aligned plane at the DOF focus distance (view depth, meters).
 * Uses the same view-depth convention as BokehDepthShader / BokehShader2 `focalDepth`.
 */
export class DofFocusPlaneHelper {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.visible = false;

    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(ORBY_PURPLE_BRIGHT),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'DofFocusPlane';
    this.mesh.renderOrder = 1005;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.meshglDofFocusPlane = true;
    this.mesh.userData.skipBokehDepth = true;
    this.mesh.userData.lensflare = 'no-occlusion';

    const edgeGeo = new THREE.EdgesGeometry(geometry);
    const edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(ORBY_PURPLE_BRIGHT),
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      toneMapped: false,
    });
    this.edge = new THREE.LineSegments(edgeGeo, edgeMat);
    this.mesh.add(this.edge);

    this.scene.add(this.mesh);
  }

  /**
   * @param {boolean} enabled
   */
  setVisible(enabled) {
    this.visible = !!enabled;
    this.mesh.visible = this.visible;
  }

  /**
   * @param {import('three').PerspectiveCamera | null | undefined} camera
   * @param {number} focusDistanceM UI focus distance or shader focalDepth (meters)
   * @param {{ near?: number, far?: number, focalDepth?: number }} [opts]
   */
  update(camera, focusDistanceM, opts = {}) {
    if (!this.visible || !camera) return;

    const near = opts.near ?? camera.near ?? 0.1;
    const far = opts.far ?? camera.far ?? 100;
    const focalDepth =
      typeof opts.focalDepth === 'number' && Number.isFinite(opts.focalDepth)
        ? Math.max(DOF_FOCUS_MIN_M, opts.focalDepth)
        : focusDistanceToBokehFocalDepth(
            Math.max(DOF_FOCUS_MIN_M, focusDistanceM),
            camera,
            near,
            far,
          );

    viewDepthToWorldPointOnAxis(focalDepth, camera, this.mesh.position);
    this.mesh.quaternion.copy(camera.quaternion);

    const { width, height } = viewDepthPlaneExtents(focalDepth, camera);
    const pad = 1.08;
    this.mesh.scale.set(width * pad, height * pad, 1);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry?.dispose?.();
    this.mesh.material?.dispose?.();
    this.edge?.geometry?.dispose?.();
    this.edge?.material?.dispose?.();
  }
}
