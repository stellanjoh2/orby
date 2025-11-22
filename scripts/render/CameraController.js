import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

export class CameraController {
  constructor(
    camera,
    canvas,
    {
      initialFov = 60,
      getFocusPoint = null,
      onAltLightRotate = null,
      onAltLightRotateEnd = null,
      altLightRotateSensitivity = 0.5,
      onModelBoundsChanged = null,
    } = {},
  ) {
    this.camera = camera;
    this.canvas = canvas;
    this.callbacks = {
      getFocusPoint,
      onAltLightRotate,
      onAltLightRotateEnd,
      onModelBoundsChanged,
    };
    this.altLightRotateSensitivity = altLightRotateSensitivity;
    this.modelBounds = null;

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this._orbitOffset = new THREE.Vector3();
    this._orbitSpherical = new THREE.Spherical();
    this._panRight = new THREE.Vector3();
    this._panUp = new THREE.Vector3();
    this._panMove = new THREE.Vector3();
    this._dollyDirection = new THREE.Vector3();
    this._dollyOffset = new THREE.Vector3();
    this.camera.fov = initialFov;
    this.camera.updateProjectionMatrix();
    this.controls.update();

    this.altRightDragging = false;
    this.altLeftDragging = false;
    this.altLeftTargetSet = false;
    this.lastMouseX = 0;
    this.originalControlState = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
    };

    this._bindAltInteractions();
  }

  getControls() {
    return this.controls;
  }

  getTargetDistance() {
    if (!this.controls?.target) return 1;
    return this.camera.position.distanceTo(this.controls.target);
  }

  orbit(deltaAzimuth, deltaPolar) {
    if (!this.controls) return;
    if (Math.abs(deltaAzimuth) > 1e-4) {
      if (typeof this.controls.rotateLeft === 'function') {
        this.controls.rotateLeft(deltaAzimuth);
      } else if (this.controls.sphericalDelta) {
        this.controls.sphericalDelta.theta -= deltaAzimuth;
      } else {
        this._applyOrbitFallback(deltaAzimuth, 0);
      }
    }
    if (Math.abs(deltaPolar) > 1e-4) {
      if (typeof this.controls.rotateUp === 'function') {
        this.controls.rotateUp(deltaPolar);
      } else if (this.controls.sphericalDelta) {
        this.controls.sphericalDelta.phi -= deltaPolar;
      } else {
        this._applyOrbitFallback(0, deltaPolar);
      }
    }
    this.controls.update();
  }

  pan(deltaX, deltaY) {
    if (!this.controls) return;
    if (Math.abs(deltaX) < 1e-5 && Math.abs(deltaY) < 1e-5) return;
    if (typeof this.controls.pan === 'function') {
      this.controls.pan(deltaX, deltaY);
    } else if (this.camera) {
      this.camera.matrix.extractBasis(
        this._panRight,
        this._panUp,
        new THREE.Vector3(),
      );
      this._panRight.normalize().multiplyScalar(deltaX);
      this._panUp.normalize().multiplyScalar(deltaY);
      this._panMove.copy(this._panRight).add(this._panUp);
      this.camera.position.add(this._panMove);
      if (this.controls.target) {
        this.controls.target.add(this._panMove);
      }
    }
    this.controls.update();
  }

  dolly(amount) {
    if (!this.controls || Math.abs(amount) < 1e-5) return;
    const scale = 1 + Math.min(Math.abs(amount), 1);
    if (typeof this.controls.dollyIn === 'function') {
      if (amount > 0) {
        this.controls.dollyIn(scale);
      } else {
        this.controls.dollyOut(scale);
      }
    } else {
      const target = this.controls.target ?? new THREE.Vector3();
      this._dollyDirection
        .subVectors(target, this.camera.position)
        .normalize();
      const distance = amount;
      this._dollyOffset.copy(this._dollyDirection).multiplyScalar(distance);
      this.camera.position.add(this._dollyOffset);
      this.camera.lookAt(target);
    }
    this.controls.update();
  }

  _applyOrbitFallback(deltaTheta, deltaPhi) {
    const target = this.controls.target ?? new THREE.Vector3();
    this._orbitOffset.copy(this.camera.position).sub(target);
    this._orbitSpherical.setFromVector3(this._orbitOffset);
    this._orbitSpherical.theta -= deltaTheta;
    this._orbitSpherical.phi -= deltaPhi;
    const EPS = 1e-4;
    this._orbitSpherical.phi = THREE.MathUtils.clamp(
      this._orbitSpherical.phi,
      EPS,
      Math.PI - EPS,
    );
    this._orbitOffset.setFromSpherical(this._orbitSpherical);
    this.camera.position.copy(target).add(this._orbitOffset);
    this.camera.lookAt(target);
  }

  update() {
    this.controls.update();
  }

  /**
   * Get the current model bounds
   * @returns {Object|null} Model bounds object with box, size, center, radius
   */
  getModelBounds() {
    return this.modelBounds;
  }

  /**
   * Fit camera to an object, calculating bounds and positioning camera
   * @param {THREE.Object3D} object - The object to fit the camera to
   */
  fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.modelBounds = { box, size, center, radius: size.length() / 2 };
      
      // Notify other systems that model bounds have changed
      this.callbacks.onModelBoundsChanged?.(this.modelBounds);
      
      this.controls.target.copy(center);
      const distance = this.modelBounds.radius * 2.2 || 5;
      const direction = new THREE.Vector3(1.5, 1.2, 1.5).normalize();
      this.camera.position.copy(center.clone().add(direction.multiplyScalar(distance)));
      this.camera.near = Math.max(0.01, distance / 200);
      this.camera.far = distance * 50;
      this.camera.updateProjectionMatrix();
      this.controls.update();
    }
  }

  /**
   * Smoothly animate camera to focus on an object
   * @param {THREE.Object3D} object - The object to focus on
   * @param {number} duration - Animation duration in seconds (default: 1.0)
   */
  focusOnObjectAnimated(object, duration = 1.0) {
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      this.modelBounds = { box, size, center, radius: size.length() / 2 };
      
      // Notify other systems that model bounds have changed
      this.callbacks.onModelBoundsChanged?.(this.modelBounds);
      
      // Calculate target position and target point
      const distance = this.modelBounds.radius * 2.2 || 5;
      const direction = new THREE.Vector3(1.5, 1.2, 1.5).normalize();
      const targetPosition = center.clone().add(direction.multiplyScalar(distance));
      const targetPoint = center.clone();
      
      // Store current values for animation
      const startPosition = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      
      // Temporarily disable controls during animation
      const wasPanEnabled = this.controls.enablePan;
      const wasRotateEnabled = this.controls.enableRotate;
      this.controls.enablePan = false;
      this.controls.enableRotate = false;
      
      // Create temporary objects for GSAP animation
      const positionObj = { x: startPosition.x, y: startPosition.y, z: startPosition.z };
      const targetObj = { x: startTarget.x, y: startTarget.y, z: startTarget.z };
      
      // Animate camera position and target together
      gsap.to(positionObj, {
        x: targetPosition.x,
        y: targetPosition.y,
        z: targetPosition.z,
        duration: duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.camera.position.set(positionObj.x, positionObj.y, positionObj.z);
        },
      });
      
      // Animate controls target
      gsap.to(targetObj, {
        x: targetPoint.x,
        y: targetPoint.y,
        z: targetPoint.z,
        duration: duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          this.controls.target.set(targetObj.x, targetObj.y, targetObj.z);
          // Use lookAt for smooth camera orientation during animation
          this.camera.lookAt(this.controls.target);
          this.controls.update();
        },
        onComplete: () => {
          // Update camera near/far planes and restore controls
          this.camera.near = Math.max(0.01, distance / 200);
          this.camera.far = distance * 50;
          this.camera.updateProjectionMatrix();
          this.controls.enablePan = wasPanEnabled;
          this.controls.enableRotate = wasRotateEnabled;
          this.controls.update();
        },
      });
    }
  }

  /**
   * Apply a camera preset (front, three-quarter, top)
   * @param {string} preset - Preset name ('front', 'three-quarter', 'top')
   */
  applyCameraPreset(preset) {
    if (!this.modelBounds) return;
    const { center, radius } = this.modelBounds;
    const distance = radius * 2.4 || 5;
    const target = center.clone();
    let position;
    
    if (preset === 'front') {
      position = target.clone().add(new THREE.Vector3(0, radius * 0.2, distance));
    } else if (preset === 'three-quarter') {
      position = target
        .clone()
        .add(new THREE.Vector3(distance, radius * 0.4, distance));
    } else if (preset === 'top') {
      position = target.clone().add(new THREE.Vector3(0, distance, 0.0001));
    }
    
    if (position) {
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  dispose() {
    this.controls.dispose();
    this._unbindAltInteractions();
  }

  _bindAltInteractions() {
    this.mousedownHandler = (event) => {
      if (!event.altKey) return;

      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        this.altRightDragging = true;
        this.lastMouseX = event.clientX;
        this._storeControlState();
        this.controls.enablePan = false;
        this.controls.enableRotate = false;
      } else if (event.button === 0) {
        event.preventDefault();
        event.stopPropagation();
        this.altLeftDragging = true;
        this.altLeftTargetSet = false;
        this._focusOnModelCenter(true);
      }
    };

    this.mousemoveHandler = (event) => {
      if (this.altRightDragging) {
        const deltaX = event.clientX - this.lastMouseX;
        this.lastMouseX = event.clientX;
        const deltaDegrees = deltaX * this.altLightRotateSensitivity;
        this.callbacks.onAltLightRotate?.(deltaDegrees);
      } else if (this.altLeftDragging) {
        this._focusOnModelCenter(true);
      }
    };

    this.mouseupHandler = (event) => {
      if (this.altRightDragging && event.button === 2) {
        this.altRightDragging = false;
        this._restoreControlState();
        this.callbacks.onAltLightRotateEnd?.();
      } else if (this.altLeftDragging && event.button === 0) {
        this.altLeftDragging = false;
        this.altLeftTargetSet = false;
      }
    };

    this.mouseleaveHandler = () => {
      if (this.altRightDragging) {
        this.altRightDragging = false;
        this._restoreControlState();
        this.callbacks.onAltLightRotateEnd?.();
      }
      if (this.altLeftDragging) {
        this.altLeftDragging = false;
        this.altLeftTargetSet = false;
      }
    };

    this.contextMenuHandler = (event) => {
      if (event.altKey) {
        event.preventDefault();
      }
    };

    this.canvas.addEventListener('mousedown', this.mousedownHandler);
    window.addEventListener('mousemove', this.mousemoveHandler);
    window.addEventListener('mouseup', this.mouseupHandler);
    this.canvas.addEventListener('mouseleave', this.mouseleaveHandler);
    this.canvas.addEventListener('contextmenu', this.contextMenuHandler);
  }

  _unbindAltInteractions() {
    this.canvas.removeEventListener('mousedown', this.mousedownHandler);
    window.removeEventListener('mousemove', this.mousemoveHandler);
    window.removeEventListener('mouseup', this.mouseupHandler);
    this.canvas.removeEventListener('mouseleave', this.mouseleaveHandler);
    this.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
  }

  _storeControlState() {
    this.originalControlState = {
      pan: this.controls.enablePan,
      rotate: this.controls.enableRotate,
    };
  }

  _restoreControlState() {
    if (this.originalControlState) {
      this.controls.enablePan =
        this.originalControlState.pan ?? this.controls.enablePan;
      this.controls.enableRotate =
        this.originalControlState.rotate ?? this.controls.enableRotate;
    }
  }

  _focusOnModelCenter(forceUpdate = false) {
    if (!forceUpdate && this.altLeftTargetSet) return;

    // Prefer modelBounds center if available, otherwise use callback
    let point = null;
    if (this.modelBounds?.center) {
      point = this.modelBounds.center;
    } else if (this.callbacks.getFocusPoint) {
      point = this.callbacks.getFocusPoint();
    }
    
    if (!point) return;

    this.controls.target.copy(point);
    this.controls.update();
    this.altLeftTargetSet = true;
  }
}

