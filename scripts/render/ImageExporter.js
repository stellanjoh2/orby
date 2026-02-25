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
    this._imageTracerLoaded = false;
  }

  /**
   * Export scene as PNG (with background)
   * Captures the full viewport at the current aspect ratio
   */
  async exportPng(currentFile, originalSize, originalPixelRatio, size = 1) {
    // Get actual canvas resolution (CSS size * pixel ratio)
    const actualWidth = originalSize.x * originalPixelRatio;
    const actualHeight = originalSize.y * originalPixelRatio;
    
    // Calculate target resolution (actual resolution * size multiplier)
    const targetWidth = Math.round(actualWidth * size);
    const targetHeight = Math.round(actualHeight * size);

    // Save current canvas size
    const canvas = this.renderer.domElement;
    const originalCanvasWidth = canvas.width;
    const originalCanvasHeight = canvas.height;

    // Set renderer size and pixel ratio
    // Use pixel ratio of 1 for exact resolution control
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.composer.setSize(targetWidth, targetHeight);
    
    // Explicitly set canvas element size to match renderer size
    // This is critical - toDataURL reads from canvas.width/height, not renderer size
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    // Render through composer to get all effects
    this.composer.render();
    
    // Now toDataURL will capture the full canvas at the correct size
    const dataUrl = canvas.toDataURL('image/png');
    this._downloadImage(dataUrl, currentFile, 'orby.png');

    // Restore original settings
    this.renderer.setPixelRatio(originalPixelRatio);
    this.renderer.setSize(originalSize.x, originalSize.y, false);
    this.composer.setSize(originalSize.x, originalSize.y);
    
    // Restore canvas size
    canvas.width = originalCanvasWidth;
    canvas.height = originalCanvasHeight;
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
    // Pass pixel ratio so we can calculate actual canvas resolution
    const cropInfo = this._calculateCropRegion(currentModel, cameraController, state.originalSize, state.originalPixelRatio, size);
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
   * Export a silhouette as SVG by rendering a black-on-white mask and tracing it
   */
  async exportSvgSilhouette(currentModel, currentFile) {
    if (!currentModel) {
      console.warn('No model loaded to export SVG');
      return;
    }

    // Save state and prepare scene
    const state = this._saveState();
    const originalRenderPassClearAlpha = this.postPipeline?.renderPass?.clearAlpha ?? 1;
    const originalMaterials = [];
    this._setupSilhouetteRender(originalMaterials);
    // Use a white background for robust silhouette segmentation
    this.scene.background = null;
    if (this.postPipeline?.renderPass) {
      this.postPipeline.renderPass.clearAlpha = 0;
    }

    // Clear and render mask on white background
    const gl = this.renderer.getContext();
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.setClearAlpha(1);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);

    // Capture mask
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    // Restore scene/materials
    this._restoreSilhouetteMaterials(originalMaterials);
    if (this.postPipeline?.renderPass) {
      this.postPipeline.renderPass.clearAlpha = originalRenderPassClearAlpha;
    }
    this._restoreState(state);

    // Vectorize and download (dedicated silhouette pipeline)
    const svg = await this._vectorizeSilhouette(dataUrl);
    if (!svg) {
      throw new Error('Vectorization failed (ImageTracer unavailable or mask load error)');
    }
    this._downloadText(svg, currentFile, 'silhouette.svg', 'image/svg+xml');
  }

  /**
   * Export a flat-color SVG by rendering the current view to PNG and tracing with limited colors
   */
  async exportSvgColor(currentModel, currentFile) {
    if (!currentModel) {
      console.warn('No model loaded to export SVG');
      return;
    }

    const state = this._saveState();
    const originalBloomEnabled = this.postPipeline?.bloomPass?.enabled;
    const originalRenderPassClearAlpha = this.postPipeline?.renderPass?.clearAlpha ?? 1;
    try {
      // Disable bloom for vector capture to avoid large glow fields in traced SVG
      if (this.postPipeline?.bloomPass) {
        this.postPipeline.bloomPass.enabled = false;
      }
      if (this.postPipeline?.renderPass) {
        this.postPipeline.renderPass.clearAlpha = 0;
      }
      this._setupTransparentRender();

      // Render current view using composer if available (to match on-screen colors)
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      const dataUrl = this.renderer.domElement.toDataURL('image/png');

      // Vectorize with a higher color budget and stronger color quantization passes
      // to better preserve bright highlights/details (e.g. glossy eyes/speculars).
      const options = {
        colorsampling: 1,      // auto-pick palette from image
        numberofcolors: 64,    // higher palette to keep highlight separation
        colorquantcycles: 5,   // refine palette selection
        mincolorratio: 0,      // keep rare highlight colors
        pathomit: 0,
        ltres: 1,
        qtres: 1,
        blur: 0,
        linefilter: false,
      };
      const svg = await this._vectorizeWithOptions(dataUrl, options, {
        preserveHighlights: true,
        alphaMask: true,
      });
      if (!svg) {
        throw new Error('Vectorization failed (ImageTracer unavailable or mask load error)');
      }
      this._downloadText(svg, currentFile, 'color.svg', 'image/svg+xml');
    } finally {
      if (this.postPipeline?.bloomPass && originalBloomEnabled !== undefined) {
        this.postPipeline.bloomPass.enabled = originalBloomEnabled;
      }
      if (this.postPipeline?.renderPass) {
        this.postPipeline.renderPass.clearAlpha = originalRenderPassClearAlpha;
      }
      this._restoreState(state);
    }
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
      originalEnvironment: this.scene.environment,
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
  _calculateCropRegion(currentModel, cameraController, originalSize, originalPixelRatio, size = 2) {
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
    // Use actual canvas resolution (CSS size * pixel ratio) for accurate calculations
    const actualWidth = originalSize.x * originalPixelRatio;
    const actualHeight = originalSize.y * originalPixelRatio;
    const width = actualWidth;
    const height = actualHeight;
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
    // Since we're already using actual resolution, just multiply by size
    const scale = size;
    const renderWidth = Math.ceil(cropWidth * scale);
    const renderHeight = Math.ceil(cropHeight * scale);
    const fullRenderWidth = Math.round(width * scale);
    const fullRenderHeight = Math.round(height * scale);

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
    
    // Save original viewport
    const gl = this.renderer.getContext();
    const originalViewport = new Int32Array(4);
    gl.getParameter(gl.VIEWPORT, originalViewport);
    
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
      // IMPORTANT: Set canvas size BEFORE renderer size to ensure they're in sync
      const canvas = this.renderer.domElement;
      const originalCanvasWidth = canvas.width;
      const originalCanvasHeight = canvas.height;
      
      // Set viewport first (before resizing)
      const gl = this.renderer.getContext();
      gl.viewport(0, 0, cropInfo.fullRenderWidth, cropInfo.fullRenderHeight);
      
      // Now set canvas and renderer sizes
      canvas.width = cropInfo.fullRenderWidth;
      canvas.height = cropInfo.fullRenderHeight;
      
      // Explicitly clear the canvas to remove any stale pixels/HDRI background
      gl.clearColor(0, 0, 0, 0); // Clear with transparent black
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      // Force a frame to ensure canvas is ready
      // Render composer normally to canvas (this is what works in viewport!)
      this.composer.render();
      
      // Read pixels from canvas using WebGL readPixels
      // We need to bind the default framebuffer and read from it
      const fullPixels = new Uint8Array(cropInfo.fullRenderWidth * cropInfo.fullRenderHeight * 4);
      
      // Bind default framebuffer (canvas)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      
      // Ensure viewport is still set correctly before reading
      gl.viewport(0, 0, cropInfo.fullRenderWidth, cropInfo.fullRenderHeight);
      
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
      
      // Restore canvas size immediately after reading
      canvas.width = originalCanvasWidth;
      canvas.height = originalCanvasHeight;
      
      // Debug: Check if we got any content
      // Sample multiple points to check for content
      let hasContent = false;
      const samplePoints = [
        Math.floor((cropInfo.fullRenderHeight / 2) * cropInfo.fullRenderWidth + cropInfo.fullRenderWidth / 2) * 4, // Center
        Math.floor((cropInfo.fullRenderHeight / 4) * cropInfo.fullRenderWidth + cropInfo.fullRenderWidth / 4) * 4, // Top-left quadrant
        Math.floor((cropInfo.fullRenderHeight * 3 / 4) * cropInfo.fullRenderWidth + cropInfo.fullRenderWidth * 3 / 4) * 4, // Bottom-right quadrant
      ];
      
      for (const idx of samplePoints) {
        if (idx >= 0 && idx < fullPixels.length - 3) {
          if (fullPixels[idx] > 0 || fullPixels[idx + 1] > 0 || fullPixels[idx + 2] > 0 || fullPixels[idx + 3] > 0) {
            hasContent = true;
            break;
          }
        }
      }
      
      if (!hasContent) {
        console.warn(`Canvas appears empty after composer.render() at ${cropInfo.fullRenderWidth}x${cropInfo.fullRenderHeight}. Canvas size: ${canvas.width}x${canvas.height}, Renderer size: ${cropInfo.fullRenderWidth}x${cropInfo.fullRenderHeight}. Trying fallback approach...`);
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
    
    // Restore viewport
    gl.viewport(originalViewport[0], originalViewport[1], originalViewport[2], originalViewport[3]);
    
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
    // pixelMinX/pixelMinY are in actual resolution space (already includes pixelRatio)
    // We need to scale them by the size multiplier to match the render target size
    const cropX = Math.floor(cropInfo.pixelMinX * cropInfo.scale);
    // Flip Y: render target uses bottom-left origin, we need top-left
    // state.originalSize.y is CSS size, but we need actual resolution for Y calculation
    const actualHeight = state.originalSize.y * state.originalPixelRatio;
    const cropY = Math.floor((actualHeight - cropInfo.pixelMaxY) * cropInfo.scale);
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
   * Prepare scene for silhouette render (black model on white)
   */
  _setupSilhouetteRender(originalMaterials) {
    if (this.backgroundController?.hdriBackgroundEnabled) {
      this.scene.environment = null;
    }
    const backgroundSphere = this.backgroundController?.getBackgroundSphere();
    if (backgroundSphere) {
      backgroundSphere.visible = false;
    }

    const silhouetteMaterialCache = new Map();
    this.scene.traverse((child) => {
      if (!child.isMesh) return;
      const mat = child.material;
      originalMaterials.push({ child, material: mat });
      const key = child.isSkinnedMesh ? 'skinned' : 'static';
      let silMat = silhouetteMaterialCache.get(key);
      if (!silMat) {
        silMat = new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide,
          skinning: !!child.isSkinnedMesh,
          depthWrite: true,
        });
        silhouetteMaterialCache.set(key, silMat);
      }
      child.material = silMat;
    });
  }

  _restoreSilhouetteMaterials(originalMaterials) {
    originalMaterials.forEach(({ child, material }) => {
      if (child) {
        child.material = material;
      }
    });
  }

  async _vectorizeMask(dataUrl) {
    const options = {
      colorsampling: 0,
      numberofcolors: 2,
      pal: [
        { r: 0, g: 0, b: 0, a: 255 },       // silhouette
        { r: 255, g: 255, b: 255, a: 255 }, // background
      ],
      pathomit: 0,
      ltres: 1,
      qtres: 1,
      blur: 0,
      linefilter: false,
    };
    return this._vectorizeWithOptions(dataUrl, options, {
      silhouetteBinaryLuma: true,
      removeWhiteBackground: true,
    });
  }

  async _vectorizeSilhouette(dataUrl) {
    await this._ensureImageTracer();
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

          // Hard black/white threshold from the rendered silhouette image.
          // Keep this isolated from color export processing.
          const threshold = 240;
          for (let i = 0; i < imageData.data.length; i += 4) {
            const lum =
              0.2126 * imageData.data[i] +
              0.7152 * imageData.data[i + 1] +
              0.0722 * imageData.data[i + 2];
            const isBg = lum >= threshold;
            imageData.data[i] = isBg ? 255 : 0;
            imageData.data[i + 1] = isBg ? 255 : 0;
            imageData.data[i + 2] = isBg ? 255 : 0;
            imageData.data[i + 3] = 255;
          }

          const options = {
            colorsampling: 0,
            numberofcolors: 2,
            pathomit: 0,
            ltres: 1,
            qtres: 1,
            blur: 0,
            linefilter: false,
          };

          const svgstr = window.ImageTracer?.imagedataToSVG
            ? window.ImageTracer.imagedataToSVG(imageData, options)
            : null;
          resolve(svgstr);
        } catch (err) {
          console.error('ImageTracer silhouette vectorization error', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  async _vectorizeWithOptions(dataUrl, options, processing = {}) {
    await this._ensureImageTracer();
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          ctx.drawImage(img, 0, 0);
          let imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

          if (processing.preserveHighlights) {
            this._boostHighlights(imageData.data);
          }

          // Use alpha as ground truth for mesh/background separation.
          // Transparent pixels are replaced with a key color, then stripped from SVG.
          const bgKey = [1, 255, 1];
          if (processing.silhouetteBinaryLuma) {
            this._applyLuminanceBinaryMask(imageData.data, 245, bgKey);
            this._fillTinyBackgroundHoles(imageData, bgKey, 6);
          } else if (processing.alphaMask) {
            if (processing.silhouetteBinary) {
              this._applySilhouetteBinaryMask(imageData.data, 1, bgKey);
            } else {
              this._applyAlphaMaskForVector(imageData.data, 220, bgKey);
            }
            this._fillTinyBackgroundHoles(imageData, bgKey, 6);
          }

          if (processing.alphaMask || processing.silhouetteBinaryLuma) {
            imageData = this._cropImageDataByKeyColor(imageData, bgKey, 2);
          }

          let svgstr = window.ImageTracer?.imagedataToSVG
            ? window.ImageTracer.imagedataToSVG(imageData, options)
            : null;
          if (svgstr && (processing.alphaMask || processing.silhouetteBinaryLuma)) {
            svgstr = this._removeKeyColorPaths(svgstr, bgKey);
          }
          if (svgstr && processing.removeWhiteBackground) {
            svgstr = this._removeWhitePaths(svgstr);
          }
          resolve(svgstr);
        } catch (err) {
          console.error('ImageTracer vectorization error', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  _boostHighlights(data) {
    // Targeted tonal lift before quantization:
    // stronger on already bright pixels to preserve specular details.
    const gamma = 0.86;
    const lift = 6;
    const highlightStart = 0.72;
    const extraHighlightGain = 0.35;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const highlightT = Math.max(0, (luminance - highlightStart) / (1 - highlightStart));
      for (let c = 0; c < 3; c += 1) {
        const normalized = data[i + c] / 255;
        let corrected = Math.pow(normalized, gamma) * 255 + lift;
        if (highlightT > 0) {
          corrected *= 1 + extraHighlightGain * highlightT;
        }
        data[i + c] = Math.min(255, Math.max(0, Math.round(corrected)));
      }
    }
  }

  _applyAlphaMaskForVector(data, alphaCutoff = 220, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < alphaCutoff) {
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
        data[i + 3] = 255;
      } else {
        // Remove edge blending against background by un-premultiplying.
        const inv = 255 / Math.max(1, a);
        data[i] = Math.min(255, Math.round(data[i] * inv));
        data[i + 1] = Math.min(255, Math.round(data[i + 1] * inv));
        data[i + 2] = Math.min(255, Math.round(data[i + 2] * inv));
        data[i + 3] = 255;
      }
    }
  }

  _applySilhouetteBinaryMask(data, alphaCutoff = 1, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < alphaCutoff) {
        // Background key
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
      } else {
        // Force solid silhouette foreground
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
      data[i + 3] = 255;
    }
  }

  _applyLuminanceBinaryMask(data, whiteThreshold = 245, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum >= whiteThreshold) {
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
      data[i + 3] = 255;
    }
  }

  _fillTinyBackgroundHoles(imageData, keyRgb, maxHoleArea = 6) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    const visited = new Uint8Array(width * height);
    const neighbors4 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const neighbors8 = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    const isBg = (x, y) => {
      const i = (y * width + x) * 4;
      return data[i] === kr && data[i + 1] === kg && data[i + 2] === kb;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (visited[idx] || !isBg(x, y)) continue;

        // BFS background component
        const queue = [[x, y]];
        const pixels = [];
        visited[idx] = 1;
        let touchesBorder = false;

        for (let q = 0; q < queue.length; q += 1) {
          const [cx, cy] = queue[q];
          pixels.push([cx, cy]);
          if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) {
            touchesBorder = true;
          }
          for (const [dx, dy] of neighbors4) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nIdx = ny * width + nx;
            if (visited[nIdx] || !isBg(nx, ny)) continue;
            visited[nIdx] = 1;
            queue.push([nx, ny]);
          }
        }

        // Fill only tiny enclosed holes
        if (touchesBorder || pixels.length > maxHoleArea) continue;

        // Pick a representative neighboring foreground color
        let fillR = null;
        let fillG = null;
        let fillB = null;
        outer: for (const [px, py] of pixels) {
          for (const [dx, dy] of neighbors8) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (isBg(nx, ny)) continue;
            const i = (ny * width + nx) * 4;
            fillR = data[i];
            fillG = data[i + 1];
            fillB = data[i + 2];
            break outer;
          }
        }
        if (fillR === null) continue;

        for (const [px, py] of pixels) {
          const i = (py * width + px) * 4;
          data[i] = fillR;
          data[i + 1] = fillG;
          data[i + 2] = fillB;
          data[i + 3] = 255;
        }
      }
    }
  }

  _removeKeyColorPaths(svg, keyRgb) {
    const [r, g, b] = keyRgb;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const rgb = `rgb(${r},${g},${b})`;
    const escapedHex = hex.replace('#', '\\#');
    const escapedRgb = rgb.replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    let output = svg.replace(
      new RegExp(`<path[^>]*fill=["'](?:${escapedHex}|${escapedRgb})["'][^>]*/?>`, 'gi'),
      '',
    );
    output = output.replace(
      new RegExp(`<rect[^>]*fill=["'](?:${escapedHex}|${escapedRgb})["'][^>]*/?>`, 'gi'),
      '',
    );
    // Remove any full-canvas background rectangles ImageTracer may emit.
    output = output.replace(/<rect[^>]*>/gi, (tag) => {
      const hasOrigin = /x=["']0(?:\.0+)?["']/.test(tag) || !/x=/.test(tag);
      const hasYOrigin = /y=["']0(?:\.0+)?["']/.test(tag) || !/y=/.test(tag);
      const fullW = /width=["'](?:100%|[0-9.]+)["']/.test(tag);
      const fullH = /height=["'](?:100%|[0-9.]+)["']/.test(tag);
      return hasOrigin && hasYOrigin && fullW && fullH ? '' : tag;
    });
    return output;
  }

  _removeWhitePaths(svg) {
    // Remove white background geometry from strict silhouette traces.
    // Includes common white encodings emitted by imagetracer.
    let output = svg.replace(
      /<path[^>]*fill=["'](?:#fff(?:fff)?|rgb\(255,\s*255,\s*255\)|white)["'][^>]*\/?>/gi,
      '',
    );
    output = output.replace(
      /<rect[^>]*fill=["'](?:#fff(?:fff)?|rgb\(255,\s*255,\s*255\)|white)["'][^>]*\/?>/gi,
      '',
    );
    return output;
  }

  _cropImageDataByKeyColor(imageData, keyRgb, padding = 2) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const isBg = r === kr && g === kg && b === kb;
        if (!isBg) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // If nothing found, return original
    if (maxX < minX || maxY < minY) {
      return imageData;
    }

    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const cropped = new ImageData(cropW, cropH);

    for (let y = 0; y < cropH; y += 1) {
      for (let x = 0; x < cropW; x += 1) {
        const srcI = ((minY + y) * width + (minX + x)) * 4;
        const dstI = (y * cropW + x) * 4;
        cropped.data[dstI] = data[srcI];
        cropped.data[dstI + 1] = data[srcI + 1];
        cropped.data[dstI + 2] = data[srcI + 2];
        cropped.data[dstI + 3] = data[srcI + 3];
      }
    }

    return cropped;
  }

  async _ensureImageTracer() {
    if (this._imageTracerLoaded) return;
    if (typeof window !== 'undefined' && window.ImageTracer) {
      this._imageTracerLoaded = true;
      return;
    }
    // Prefer local copy, fall back to CDN
    await new Promise((resolve, reject) => {
      const tryLoad = (src, onfail) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
          this._imageTracerLoaded = true;
          resolve();
        };
        script.onerror = () => {
          script.remove();
          onfail?.();
        };
        document.head.appendChild(script);
      };
      tryLoad('./scripts/vendor/imagetracer_v1.2.6.js', () => {
        tryLoad('https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js', () => reject(new Error('ImageTracer load failed')));
      });
    });
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

  _downloadText(text, currentFile, suffix, mime = 'text/plain') {
    if (!text) return;
    const name = currentFile?.name ?? 'orby';
    const filename = `${name.replace(/\.[a-z0-9]+$/i, '')}-${suffix}`;
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Restore original renderer/scene state
   */
  _restoreState(state) {
    this.renderer.setClearColor(state.originalClearColor, state.originalClearAlpha);
    this.scene.background = state.originalBackground;
    this.scene.environment = state.originalEnvironment;
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

