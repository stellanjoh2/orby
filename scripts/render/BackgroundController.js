import * as THREE from 'three';
import { APP_BACKGROUND } from '../constants.js';
import { HdriShadowReceiver } from './HdriShadowReceiver.js';

/**
 * BackgroundController
 * 
 * Manages the solid background color independently from HDRI/environment.
 * Handles:
 * - Setting renderer clear color
 * - Managing background sphere for DOF depth
 * - Visibility based on HDRI background state
 */
export class BackgroundController {
  constructor({ renderer, scene, camera, initialColor = APP_BACKGROUND } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.color = initialColor;
    
    // Track HDRI state to know when to show/hide background
    this.hdriBackgroundEnabled = false;
    this.hdriEnabled = false;
    
    // Create background sphere for DOF depth handling
    this.backgroundSphere = this._createBackgroundSphere(this.color);
    this.backgroundSphere.visible = false;
    this.scene.add(this.backgroundSphere);
    
    this.hdriShadowReceiver = new HdriShadowReceiver(this.scene, {
      groundY: 0,
    });

    /** @type {import('./backgroundGradient/BackgroundGradientController.js').BackgroundGradientController | null} */
    this.gradientController = null;

    // Initialize clear color
    this._applyClearColor();
  }

  /**
   * @param {import('./backgroundGradient/BackgroundGradientController.js').BackgroundGradientController | null} controller
   */
  setGradientController(controller) {
    this.gradientController = controller;
    this.refreshAppearance();
  }
  
  /**
   * Create a large background sphere for DOF depth information
   */
  _createBackgroundSphere(color) {
    const geometry = new THREE.SphereGeometry(10000, 32, 32);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(0, 0, -5000);
    sphere.renderOrder = -1000; // Render first, behind everything
    sphere.frustumCulled = false;
    // Camera sits inside this large sphere; flip winding so FrontSide (and MeshDepthMaterial prepass)
    // rasterizes the inward-facing shell — otherwise the sphere is fully back-face culled and writes
    // no depth for DOF.
    sphere.scale.set(-1, 1, 1);
    sphere.userData.meshglDofDepthProxy = true;

    return sphere;
  }
  
  /**
   * Update the background color
   */
  setColor(color) {
    if (!color) return;
    
    // Validate color - ensure it's a valid hex string
    const colorStr = String(color).trim();
    if (!colorStr.startsWith('#')) {
      console.warn('Invalid background color format:', color);
      return;
    }
    
    this.color = colorStr;
    
    // Update background sphere color (for DOF when needed)
    if (this.backgroundSphere && this.backgroundSphere.material) {
      this.backgroundSphere.material.color.set(colorStr);
    }
    
    this.refreshAppearance();
  }

  /** Re-apply flat color or delegate to the gradient controller. */
  refreshAppearance() {
    this._applyClearColor();
  }
  
  /**
   * Set HDRI background state (called by SceneManager when HDRI state changes)
   */
  setHdriBackgroundEnabled(enabled) {
    this.hdriBackgroundEnabled = enabled;
    this.hdriShadowReceiver?.setHdriBackgroundEnabled(enabled);
    this.refreshAppearance();
  }
  
  /**
   * Set HDRI enabled state (called by SceneManager when HDRI is toggled)
   */
  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    this.hdriShadowReceiver?.setHdriEnabled(enabled);
    this.refreshAppearance();
  }

  setReceiveShadowsAoEnabled(enabled) {
    this.hdriShadowReceiver?.setReceiveShadowsAoEnabled(enabled);
  }

  setGroundSolid(enabled) {
    this.hdriShadowReceiver?.setGroundSolid(enabled);
  }

  setGroundY(value) {
    this.hdriShadowReceiver?.setGroundY(value);
  }

  setShadowReceiverOpacity(opacity) {
    this.hdriShadowReceiver?.setShadowOpacity(opacity);
  }

  updateHdriShadowReceiverFromModel(modelRoot) {
    this.hdriShadowReceiver?.updateFromModel(modelRoot);
  }

  setHdriShadowReceiverAoRadius(radius) {
    this.hdriShadowReceiver?.setAoRadius(radius);
  }
  
  /**
   * Apply the clear color to the renderer
   * Only shows when HDRI background is disabled
   */
  _applyClearColor() {
    // If HDRI background is on, don't show solid color (HDRI texture will show)
    if (this.hdriBackgroundEnabled && this.hdriEnabled) {
      /* Sphere stays hidden for the beauty pass so `scene.background` shows the HDRI.
         MeshglBokehPass turns it on only for the DOF depth prepass so depth matches color. */
      if (this.backgroundSphere) {
        this.backgroundSphere.visible = false;
      }
      // Don't set clear color - HDRI texture handles background
      return;
    }
    
    if (this.gradientController?.applyIfActive?.()) {
      return;
    }

    // HDRI background is off - show solid color
    // CRITICAL: scene.background MUST be null for clear color to show
    this.scene.background = null;
    
    // Ensure renderer is set up for opaque clear color
    this.renderer.setClearAlpha(1);
    this.renderer.autoClear = true;
    
    // Set clear color
    try {
      const background = new THREE.Color(this.color);
      this.renderer.setClearColor(background, 1);
    } catch (error) {
      console.error('Failed to set background color:', this.color, error);
      return;
    }
    
    // Hide background sphere - we want to use clear color, not the sphere mesh
    // The sphere is only for DOF depth when needed
    if (this.backgroundSphere) {
      this.backgroundSphere.visible = false;
    }
  }
  
  /**
   * Update background sphere position to follow camera (for DOF)
   */
  updateSpherePosition() {
    if (!this.backgroundSphere || !this.camera) return;

    // Position sphere far behind camera
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    const distance = 5000;
    this.backgroundSphere.position.copy(this.camera.position);
    this.backgroundSphere.position.addScaledVector(cameraDirection, -distance);
  }

  /**
   * Get current background color
   */
  getColor() {
    return this.color;
  }
  
  /**
   * Get background sphere (for DOF depth)
   */
  getBackgroundSphere() {
    return this.backgroundSphere;
  }
  
  /**
   * Get HDRI background enabled state
   */
  getHdriBackgroundEnabled() {
    return this.hdriBackgroundEnabled;
  }
  
  /**
   * Dispose of resources
   */
  dispose() {
    this.hdriShadowReceiver?.dispose();
    this.hdriShadowReceiver = null;
    if (this.backgroundSphere) {
      this.scene.remove(this.backgroundSphere);
      this.backgroundSphere.geometry.dispose();
      this.backgroundSphere.material.dispose();
      this.backgroundSphere = null;
    }
  }
}

