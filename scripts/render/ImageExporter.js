import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/postprocessing/ShaderPass.js';

/**
 * ImageExporter
 * 
 * Handles exporting the 3D scene as images (PNG, transparent PNG, etc.)
 * Manages render targets, cropping, pixel manipulation, and file downloads
 */
export class ImageExporter {
  constructor({ renderer, scene, camera, composer, postPipeline, backgroundController } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = composer;
    this.postPipeline = postPipeline;
    this.backgroundController = backgroundController;
  }

  /**
   * Export scene as PNG (with background)
   */
  async exportPng(currentFile, originalSize, originalPixelRatio) {
    const targetWidth = originalSize.x * 2;
    const targetHeight = originalSize.y * 2;

    this.renderer.setPixelRatio(originalPixelRatio * 2);
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.composer.setSize(targetWidth, targetHeight);
    
    // Render through composer to get all effects
    this.composer.render();
    
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    this._downloadImage(dataUrl, currentFile, 'orby.png');

    this.renderer.setPixelRatio(originalPixelRatio);
    this.renderer.setSize(originalSize.x, originalSize.y, false);
    this.composer.setSize(originalSize.x, originalSize.y);
  }

  /**
   * Export scene as transparent PNG (cropped to mesh bounds)
   */
  async exportTransparentPng(currentModel, currentFile, cameraController) {
    if (!currentModel) {
      console.warn('No model loaded to export');
      return;
    }

    // Save current state
    const state = this._saveState();

    // Set up for transparent export
    this._setupTransparentRender();

    // Calculate mesh bounds and crop region
    const cropInfo = this._calculateCropRegion(currentModel, cameraController, state.originalSize);
    if (!cropInfo) {
      console.warn('Could not calculate mesh bounds');
      this._restoreState(state);
      return;
    }

    // Render to render target with transparency
    const renderTarget = this._renderToTarget(cropInfo, state);

    // Extract and export cropped region
    const dataUrl = this._extractCroppedImage(renderTarget, cropInfo, state);

    // Download the image
    this._downloadImage(dataUrl, currentFile, 'transparent.png');

    // Clean up and restore state
    renderTarget.dispose();
    this._restoreState(state);
  }

  /**
   * Save current renderer/scene state
   */
  _saveState() {
    const originalSize = new THREE.Vector2();
    this.renderer.getSize(originalSize);
    
    return {
      originalSize: originalSize.clone(),
      originalPixelRatio: this.renderer.getPixelRatio(),
      originalClearColor: this.renderer.getClearColor(new THREE.Color()).clone(),
      originalClearAlpha: this.renderer.getClearAlpha(),
      originalBackground: this.scene.background,
      originalBackgroundSphereVisible: this.backgroundController?.getBackgroundSphere()?.visible ?? false,
      originalHdriBackgroundEnabled: this.backgroundController?.getHdriBackgroundEnabled() ?? false,
      originalAutoClear: this.renderer.autoClear,
    };
  }

  /**
   * Set up scene for transparent rendering
   */
  _setupTransparentRender() {
    // Temporarily disable HDRI background
    if (this.backgroundController?.hdriBackgroundEnabled) {
      this.scene.background = null;
    }

    // Hide background sphere
    const backgroundSphere = this.backgroundController?.getBackgroundSphere();
    if (backgroundSphere) {
      backgroundSphere.visible = false;
    }

    // Set transparent clear color
    this.renderer.setClearColor(0x000000, 0); // Black with 0 alpha = transparent
    this.renderer.setClearAlpha(0);
    this.scene.background = null;
  }

  /**
   * Calculate crop region based on mesh bounds in screen space
   */
  _calculateCropRegion(currentModel, cameraController, originalSize) {
    const bounds = cameraController?.getModelBounds();
    if (!bounds) {
      return null;
    }

    // Get mesh bounding box in world space
    const box = new THREE.Box3();
    box.setFromObject(currentModel);

    // Project bounding box corners to screen space
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    const screenCorners = corners.map((corner) => {
      const vector = corner.clone();
      vector.project(this.camera);
      return vector;
    });

    // Find bounding rectangle in screen space
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    screenCorners.forEach((corner) => {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    });

    // Convert from normalized device coordinates (-1 to 1) to pixel coordinates
    const width = originalSize.x;
    const height = originalSize.y;
    const padding = 20; // Padding in pixels

    const pixelMinX = Math.max(0, ((minX + 1) / 2) * width - padding);
    const pixelMinY = Math.max(0, ((1 - maxY) / 2) * height - padding); // Flip Y
    const pixelMaxX = Math.min(width, ((maxX + 1) / 2) * width + padding);
    const pixelMaxY = Math.min(height, ((1 - minY) / 2) * height + padding); // Flip Y

    const cropWidth = pixelMaxX - pixelMinX;
    const cropHeight = pixelMaxY - pixelMinY;

    // Render at higher resolution (2x for better quality)
    const scale = 2;
    const renderWidth = Math.ceil(cropWidth * scale);
    const renderHeight = Math.ceil(cropHeight * scale);
    const fullRenderWidth = width * scale;
    const fullRenderHeight = height * scale;

    return {
      pixelMinX,
      pixelMinY,
      pixelMaxX,
      pixelMaxY,
      cropWidth,
      cropHeight,
      renderWidth,
      renderHeight,
      fullRenderWidth,
      fullRenderHeight,
      scale,
    };
  }

  /**
   * Render scene to render target with transparency
   * SIMPLE: Render composer to our render target directly
   */
  _renderToTarget(cropInfo, state) {
    // Save original settings
    const originalSize = new THREE.Vector2();
    this.renderer.getSize(originalSize);
    const originalPixelRatio = this.renderer.getPixelRatio();
    const originalClearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const originalClearAlpha = this.renderer.getClearAlpha();
    const originalRenderPassClearAlpha = this.postPipeline?.renderPass?.clearAlpha ?? 1;
    
    // Set transparent clear color
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setClearAlpha(0);
    
    // Set render pass to clear with transparent alpha
    if (this.postPipeline?.renderPass) {
      this.postPipeline.renderPass.clearAlpha = 0;
    }
    
    // Resize renderer and composer
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(cropInfo.fullRenderWidth, cropInfo.fullRenderHeight, false);
    if (this.composer) {
      this.composer.setSize(cropInfo.fullRenderWidth, cropInfo.fullRenderHeight);
    }
    
    // Create our render target with alpha
    const renderTarget = new THREE.WebGLRenderTarget(
      cropInfo.fullRenderWidth,
      cropInfo.fullRenderHeight,
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        alpha: true,
        premultipliedAlpha: false,
      },
    );
    
    // Step 1: Render scene directly to our render target
    this.renderer.setRenderTarget(renderTarget);
    this.renderer.clear(); // Clear with transparent background (alpha = 0)
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    
    // Post-processing disabled for now - basic export works without it
    // TODO: Add post-processing back once we have a reliable method
    // The issue is that applying passes breaks the export, likely due to
    // render target format mismatches or ping-pong issues
    
    // Restore original settings
    this.renderer.setPixelRatio(originalPixelRatio);
    this.renderer.setSize(originalSize.x, originalSize.y, false);
    if (this.composer) {
      this.composer.setSize(originalSize.x, originalSize.y);
    }
    this.renderer.setClearColor(originalClearColor, originalClearAlpha);
    if (this.postPipeline?.renderPass) {
      this.postPipeline.renderPass.clearAlpha = originalRenderPassClearAlpha;
    }
    
    return renderTarget;
  }

  /**
   * Extract cropped region from render target and convert to image
   */
  _extractCroppedImage(renderTarget, cropInfo, state) {
    // Create a temporary canvas for the cropped export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = cropInfo.renderWidth;
    exportCanvas.height = cropInfo.renderHeight;
    const exportContext = exportCanvas.getContext('2d', { alpha: true });

    // Clear the canvas with transparent pixels
    exportContext.clearRect(0, 0, cropInfo.renderWidth, cropInfo.renderHeight);

    // Calculate crop coordinates in render target space
    const cropX = Math.floor(cropInfo.pixelMinX * cropInfo.scale);
    const cropY = Math.floor((state.originalSize.y - cropInfo.pixelMaxY) * cropInfo.scale); // Flip Y
    const cropW = Math.ceil(cropInfo.renderWidth);
    const cropH = Math.ceil(cropInfo.renderHeight);

    // Read pixels from the render target
    const pixels = new Uint8Array(cropW * cropH * 4);
    this.renderer.readRenderTargetPixels(
      renderTarget,
      cropX,
      cropY,
      cropW,
      cropH,
      pixels,
    );

    // Flip pixels vertically (WebGL uses bottom-left origin, canvas uses top-left)
    const flippedPixels = new Uint8Array(cropW * cropH * 4);
    for (let y = 0; y < cropH; y++) {
      const srcRow = cropH - 1 - y;
      for (let x = 0; x < cropW; x++) {
        const srcIdx = (srcRow * cropW + x) * 4;
        const dstIdx = (y * cropW + x) * 4;
        flippedPixels[dstIdx] = pixels[srcIdx];
        flippedPixels[dstIdx + 1] = pixels[srcIdx + 1];
        flippedPixels[dstIdx + 2] = pixels[srcIdx + 2];
        flippedPixels[dstIdx + 3] = pixels[srcIdx + 3];
      }
    }

    // Create ImageData and put it on the export canvas
    const imageData = exportContext.createImageData(cropInfo.renderWidth, cropInfo.renderHeight);
    imageData.data.set(flippedPixels);
    exportContext.putImageData(imageData, 0, 0);

    // Export as PNG (PNG format preserves transparency)
    return exportCanvas.toDataURL('image/png');
  }

  /**
   * Download image file
   */
  _downloadImage(dataUrl, currentFile, suffix) {
    const link = document.createElement('a');
    const name = currentFile?.name ?? 'orby';
    link.href = dataUrl;
    link.download = `${name.replace(/\.[a-z0-9]+$/i, '')}-${suffix}`;
    link.click();
  }

  /**
   * Restore original renderer/scene state
   */
  _restoreState(state) {
    this.renderer.setClearColor(state.originalClearColor, state.originalClearAlpha);
    this.scene.background = state.originalBackground;
    const backgroundSphere = this.backgroundController?.getBackgroundSphere();
    if (backgroundSphere) {
      backgroundSphere.visible = state.originalBackgroundSphereVisible;
    }
    this.renderer.setPixelRatio(state.originalPixelRatio);
    this.renderer.setSize(state.originalSize.x, state.originalSize.y, false);
    if (this.composer) {
      this.composer.setSize(state.originalSize.x, state.originalSize.y);
    }
    this.renderer.autoClear = state.originalAutoClear;

    // Re-apply background if HDRI was enabled
    if (state.originalHdriBackgroundEnabled) {
      this.backgroundController?.setHdriBackgroundEnabled(true);
    }
  }
}

