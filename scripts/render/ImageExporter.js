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
  async exportPng(currentFile, originalSize, originalPixelRatio, size = 2) {
    const targetWidth = originalSize.x * size;
    const targetHeight = originalSize.y * size;

    this.renderer.setPixelRatio(originalPixelRatio * size);
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
  async exportTransparentPng(currentModel, currentFile, cameraController, size = 2) {
    if (!currentModel) {
      console.warn('No model loaded to export');
      return;
    }

    // Save current state
    const state = this._saveState();

    // Set up for transparent export
    this._setupTransparentRender();

    // Calculate mesh bounds and crop region
    const cropInfo = this._calculateCropRegion(currentModel, cameraController, state.originalSize, size);
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

    // Note: We keep scene.environment for lighting, but clear scene.background
    // to prevent HDRI background from bleeding through at edges

    // Set transparent clear color
    this.renderer.setClearColor(0x000000, 0); // Black with 0 alpha = transparent
    this.renderer.setClearAlpha(0);
    this.scene.background = null;
  }

  /**
   * Calculate crop region based on mesh bounds in screen space
   */
  _calculateCropRegion(currentModel, cameraController, originalSize, size = 2) {
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

    // Render at specified resolution multiplier
    const scale = size;
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
   * Smooth alpha edges to reduce harsh artifacts and color bleed
   * Applies a Gaussian blur to the alpha channel for smoother, more natural edges
   */
  _smoothAlphaEdges(alphaPixels, width, height) {
    const smoothed = new Uint8Array(alphaPixels.length);
    smoothed.set(alphaPixels); // Copy original
    
    // Gaussian blur for alpha channel (more natural than box blur)
    const radius = 1;
    const sigma = 0.8; // Gaussian standard deviation
    const gaussianWeights = [
      0.25, 0.5, 0.25,  // Row weights (approximate Gaussian)
      0.5,  1.0, 0.5,   // Center row
      0.25, 0.5, 0.25,  // Bottom row
    ];
    
    for (let y = radius; y < height - radius; y++) {
      for (let x = radius; x < width - radius; x++) {
        const idx = (y * width + x) * 4;
        const currentAlpha = alphaPixels[idx + 3];
        
        // Only smooth edge pixels (partial alpha)
        if (currentAlpha > 0 && currentAlpha < 255) {
          let weightedSum = 0;
          let weightSum = 0;
          let weightIdx = 0;
          
          // Sample surrounding pixels with Gaussian weights
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const sampleIdx = ((y + dy) * width + (x + dx)) * 4;
              const weight = gaussianWeights[weightIdx++];
              weightedSum += alphaPixels[sampleIdx + 3] * weight;
              weightSum += weight;
            }
          }
          
          // Apply smoothed alpha (weighted towards center for edge preservation)
          const avgAlpha = weightedSum / weightSum;
          const smoothedAlpha = Math.round(currentAlpha * 0.6 + avgAlpha * 0.4);
          smoothed[idx + 3] = smoothedAlpha;
        } else {
          // Keep fully opaque/transparent pixels unchanged
          smoothed[idx + 3] = currentAlpha;
        }
      }
    }
    
    // Copy smoothed alpha back
    for (let i = 3; i < alphaPixels.length; i += 4) {
      alphaPixels[i] = smoothed[i];
    }
  }

  /**
   * Fade out the outer 3px edge of the alpha channel to soften harsh edges
   */
  _fadeOuterEdge(alphaPixels, width, height) {
    const faded = new Uint8Array(alphaPixels.length);
    faded.set(alphaPixels); // Copy original
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const currentAlpha = alphaPixels[idx + 3];
        
        // Only process edge pixels (pixels with alpha > 0)
        if (currentAlpha > 0) {
          // Check if this pixel is within 2 pixels of a transparent edge
          let distanceToEdge = Infinity;
          
          // Check pixels within 3-pixel radius
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const checkX = x + dx;
              const checkY = y + dy;
              const dist = Math.sqrt(dx * dx + dy * dy); // Euclidean distance for smoother falloff
              
              if (checkX < 0 || checkX >= width || checkY < 0 || checkY >= height) {
                // Out of bounds = edge of image
                distanceToEdge = Math.min(distanceToEdge, dist);
              } else {
                const checkIdx = (checkY * width + checkX) * 4;
                const checkAlpha = alphaPixels[checkIdx + 3];
                
                // If this pixel is transparent, we found an edge
                if (checkAlpha === 0) {
                  distanceToEdge = Math.min(distanceToEdge, dist);
                }
              }
            }
          }
          
          // Fade out pixels within 3 pixels of edge using smooth interpolation
          // Euclidean distance allows for smoother, more natural falloff
          if (distanceToEdge <= 3) {
            // Smooth interpolation: 8% at distance 1, 25% at distance 2, 55% at distance 3
            let fadeFactor;
            if (distanceToEdge <= 1) {
              // Linear interpolation from 0.08 at distance 1.0
              fadeFactor = 0.08;
            } else if (distanceToEdge <= 2) {
              // Linear interpolation between distance 1 and 2
              const t = (distanceToEdge - 1) / 1; // 0 to 1
              fadeFactor = 0.08 + (0.25 - 0.08) * t;
            } else {
              // Linear interpolation between distance 2 and 3
              const t = (distanceToEdge - 2) / 1; // 0 to 1
              fadeFactor = 0.25 + (0.55 - 0.25) * t;
            }
            faded[idx + 3] = Math.round(currentAlpha * fadeFactor);
          } else {
            // Beyond 3 pixels: no fade
            faded[idx + 3] = currentAlpha;
          }
        }
      }
    }
    
    // Copy faded alpha back
    for (let i = 3; i < alphaPixels.length; i += 4) {
      alphaPixels[i] = faded[i];
    }
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
    
    // Resize renderer and composer at the specified scale
    // fullRenderWidth/Height are already scaled, so pixel ratio stays at 1 for exact resolution
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
      
      // Explicitly clear the canvas to remove any stale pixels/HDRI background
      const gl = this.renderer.getContext();
      gl.clearColor(0, 0, 0, 0); // Clear with transparent black
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      // Render composer normally to canvas (this is what works in viewport!)
      this.composer.render();
      
      // Read pixels from canvas using WebGL readPixels
      // We need to bind the default framebuffer and read from it
      // (gl is already declared above)
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
      // Render scene directly to get alpha channel with anti-aliasing
      const alphaRT = new THREE.WebGLRenderTarget(
        cropInfo.fullRenderWidth,
        cropInfo.fullRenderHeight,
        {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          alpha: true,
          premultipliedAlpha: false,
          samples: this.renderer.capabilities.isWebGL2 ? 8 : 0, // Enable 8x MSAA if available for better edge quality
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
      
      // Smooth alpha edges to reduce harsh artifacts and green pixel bleed
      this._smoothAlphaEdges(alphaPixels, cropInfo.fullRenderWidth, cropInfo.fullRenderHeight);
      
      // Fade outer 1px edge to soften harsh edges
      this._fadeOuterEdge(alphaPixels, cropInfo.fullRenderWidth, cropInfo.fullRenderHeight);
      
      // Composite: Use RGB from post-processed canvas for opaque pixels, direct render RGB for edge pixels
      // This prevents dark outlines by using clean mesh colors at edges instead of darkened post-processed values
      for (let i = 0; i < fullPixels.length; i += 4) {
        const directAlpha = alphaPixels[i + 3];
        const postR = fullPixels[i];
        const postG = fullPixels[i + 1];
        const postB = fullPixels[i + 2];
        const directR = alphaPixels[i];
        const directG = alphaPixels[i + 1];
        const directB = alphaPixels[i + 2];
        
        // Use mesh alpha only - no expansion for bloom outside mesh borders
        fullPixels[i + 3] = directAlpha;
        
        if (directAlpha === 0) {
          // Fully transparent: zero RGB to prevent any background bleed
          fullPixels[i] = 0;     // R
          fullPixels[i + 1] = 0;  // G
          fullPixels[i + 2] = 0;  // B
        } else if (directAlpha < 255) {
          // Edge pixels (partial alpha): use direct render RGB for clean mesh colors
          // Direct render has proper lighting without post-processing darkening
          fullPixels[i] = directR;     // R
          fullPixels[i + 1] = directG;  // G
          fullPixels[i + 2] = directB;  // B
        } else {
          // Fully opaque pixels: use post-processed RGB (with all effects)
          // RGB already set from post-processed canvas
        }
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

