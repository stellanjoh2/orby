import * as THREE from 'three';

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
  constructor({ renderer, scene, camera, initialColor = '#000000' } = {}) {
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
    
    // Initialize clear color
    this._applyClearColor();
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
    
    // Apply the color if HDRI background is off
    this._applyClearColor();
  }
  
  /**
   * Set HDRI background state (called by SceneManager when HDRI state changes)
   */
  setHdriBackgroundEnabled(enabled) {
    this.hdriBackgroundEnabled = enabled;
    this._applyClearColor();
  }
  
  /**
   * Set HDRI enabled state (called by SceneManager when HDRI is toggled)
   */
  setHdriEnabled(enabled) {
    this.hdriEnabled = enabled;
    this._applyClearColor();
  }
  
  /**
   * Apply the clear color to the renderer
   * Only shows when HDRI background is disabled
   */
  _applyClearColor() {
    // If HDRI background is on, don't show solid color (HDRI texture will show)
    if (this.hdriBackgroundEnabled && this.hdriEnabled) {
      // Hide background sphere - HDRI texture will show
      if (this.backgroundSphere) {
        this.backgroundSphere.visible = false;
      }
      // Don't set clear color - HDRI texture handles background
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
   * Dispose of resources
   */
  dispose() {
    if (this.backgroundSphere) {
      this.scene.remove(this.backgroundSphere);
      this.backgroundSphere.geometry.dispose();
      this.backgroundSphere.material.dispose();
      this.backgroundSphere = null;
    }
  }
}

