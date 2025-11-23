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
    const padding = 5; // Padding in pixels (max 5px from mesh edges)

    // Convert to pixel coordinates
    const pixelMinX_unpadded = ((minX + 1) / 2) * width;
    const pixelMinY_unpadded = ((1 - maxY) / 2) * height; // Flip Y
    const pixelMaxX_unpadded = ((maxX + 1) / 2) * width;
    const pixelMaxY_unpadded = ((1 - minY) / 2) * height; // Flip Y

    // Calculate center and size
    const centerX = (pixelMinX_unpadded + pixelMaxX_unpadded) / 2;
    const centerY = (pixelMinY_unpadded + pixelMaxY_unpadded) / 2;
    const boxWidth = pixelMaxX_unpadded - pixelMinX_unpadded;
    const boxHeight = pixelMaxY_unpadded - pixelMinY_unpadded;

    // Add padding symmetrically around center
    const paddedWidth = boxWidth + (padding * 2);
    const paddedHeight = boxHeight + (padding * 2);

    // Calculate padded bounds centered on the bounding box
    let pixelMinX = centerX - paddedWidth / 2;
    let pixelMinY = centerY - paddedHeight / 2;
    let pixelMaxX = centerX + paddedWidth / 2;
    let pixelMaxY = centerY + paddedHeight / 2;

    // Clamp to screen bounds, but try to maintain symmetry
    if (pixelMinX < 0) {
      const offset = -pixelMinX;
      pixelMinX = 0;
      pixelMaxX = Math.min(width, pixelMaxX + offset);
    }
    if (pixelMinY < 0) {
      const offset = -pixelMinY;
      pixelMinY = 0;
      pixelMaxY = Math.min(height, pixelMaxY + offset);
    }
    if (pixelMaxX > width) {
      const offset = pixelMaxX - width;
      pixelMaxX = width;
      pixelMinX = Math.max(0, pixelMinX - offset);
    }
    if (pixelMaxY > height) {
      const offset = pixelMaxY - height;
      pixelMaxY = height;
      pixelMinY = Math.max(0, pixelMinY - offset);
    }

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
    
    // Canvas Capture Approach: Render composer to canvas, then read from it
    // This works because composer already renders correctly in viewport
    if (this.composer) {
      // Set render pass to clear with transparent alpha
      if (this.postPipeline?.renderPass) {
        this.postPipeline.renderPass.clearAlpha = 0; // Transparent clear
      }
      
      // Ensure canvas size matches renderer size
      const canvas = this.renderer.domElement;
      canvas.width = cropInfo.fullRenderWidth;
      canvas.height = cropInfo.fullRenderHeight;
      
      // Render composer normally to canvas (this is what works in viewport!)
      this.composer.render();
      
      // Read pixels from canvas using WebGL readPixels
      // We need to bind the default framebuffer and read from it
      const gl = this.renderer.getContext();
      const fullPixels = new Uint8Array(cropInfo.fullRenderWidth * cropInfo.fullRenderHeight * 4);
      
      // Bind default framebuffer (canvas)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      
      // Read pixels from default framebuffer
      gl.readPixels(
        0,
        0,
        cropInfo.fullRenderWidth,
        cropInfo.fullRenderHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        fullPixels,
      );
      
      // Debug: Check if we got any content
      const centerIdx = Math.floor((cropInfo.fullRenderHeight / 2) * cropInfo.fullRenderWidth + cropInfo.fullRenderWidth / 2) * 4;
      const hasContent = fullPixels[centerIdx] > 0 || fullPixels[centerIdx + 1] > 0 || fullPixels[centerIdx + 2] > 0 || fullPixels[centerIdx + 3] > 0;
      if (!hasContent) {
        console.warn('Canvas appears empty after composer.render(). Trying fallback approach...');
        // Fallback: render directly to our render target, then apply post-processing manually
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        return renderTarget; // Return without post-processing
      }
      
      // Fix transparency: Post-processing might set background alpha to 255
      // We need to restore alpha for black/dark background pixels
      // Render scene directly to get alpha channel
      const alphaRT = new THREE.WebGLRenderTarget(
        cropInfo.fullRenderWidth,
        cropInfo.fullRenderHeight,
        {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          alpha: true,
          premultipliedAlpha: false,
        },
      );
      
      this.renderer.setRenderTarget(alphaRT);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      
      // Read alpha channel from direct render (from render target)
      const alphaPixels = new Uint8Array(cropInfo.fullRenderWidth * cropInfo.fullRenderHeight * 4);
      this.renderer.readRenderTargetPixels(
        alphaRT,
        0,
        0,
        cropInfo.fullRenderWidth,
        cropInfo.fullRenderHeight,
        alphaPixels,
      );
      
      // Composite: Use RGB from post-processed canvas, alpha ONLY from mesh (no bloom expansion)
      for (let i = 0; i < fullPixels.length; i += 4) {
        const directAlpha = alphaPixels[i + 3];
        
        // Use mesh alpha only - no expansion for bloom outside mesh borders
        // RGB already has post-processing (bloom, etc.) applied
        fullPixels[i + 3] = directAlpha;
      }
      
      alphaRT.dispose();
      
      // Write pixels to our render target
      const dataTexture = new THREE.DataTexture(
        fullPixels,
        cropInfo.fullRenderWidth,
        cropInfo.fullRenderHeight,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      dataTexture.needsUpdate = true;
      
      // Write pixels to render target with alpha preservation
      // Use a shader material that explicitly writes alpha from the texture
      const alphaShader = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: dataTexture },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          varying vec2 vUv;
          void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            gl_FragColor = texel; // Write alpha directly from texture
          }
        `,
        transparent: true,
      });
      
      const copyGeometry = new THREE.PlaneGeometry(2, 2);
      const copyMesh = new THREE.Mesh(copyGeometry, alphaShader);
      const copyScene = new THREE.Scene();
      copyScene.add(copyMesh);
      const copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      
      this.renderer.setRenderTarget(renderTarget);
      this.renderer.setClearColor(0x000000, 0); // Clear with transparent background
      this.renderer.setClearAlpha(0);
      this.renderer.clear();
      this.renderer.render(copyScene, copyCamera);
      this.renderer.setRenderTarget(null);
      
      // Clean up
      dataTexture.dispose();
      copyGeometry.dispose();
      alphaShader.dispose();
    } else {
      // Fallback: direct render if no composer
      this.renderer.setRenderTarget(renderTarget);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
    }
    
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

