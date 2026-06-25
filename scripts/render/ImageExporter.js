import * as THREE from 'three';
import { ORBY_BLACK } from '../constants.js';
import { encodeCanvasToBlob } from './encodeImageBlob.js';
import {
  getImageExportFormat,
  imageExportDownloadSuffix,
  normalizeImageExportFormat,
} from './imageExportFormats.js';
import { isArtisticCreativeLookPreset } from './creativeLookPresetSliders.js';
import { SKETCH_PAPER_RGB } from './creativeLookSketchArt.js';
import { fullViewportLogicalSize } from './fullViewportLogicalSize.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import { getComposerOutputRenderTarget } from './composerOutputBuffer.js';
import {
  buildScreenPixelSvg,
  buildScreenPixelSvgFromGlPixels,
  resolveScreenPixelGridLayout,
  sampleScreenPixelGridFromCanvasData,
} from './screenPixelSvgExport.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';

/**
 * ImageExporter
 * 
 * Handles exporting the 3D scene as raster images (PNG, JPEG, WebP, etc.)
 * Manages render targets, cropping, pixel manipulation, and file downloads
 */
export class ImageExporter {
  constructor({
    renderer,
    scene,
    camera,
    composer,
    postPipeline,
    isLensDistortionActive,
    backgroundController,
    /** Align composer pixel ratio + bloom/FXAA/N8AO-dependent passes (see SceneManager). */
    syncPostProcessingForLogicalSize,
    /**
     * After export/resize changes `camera.aspect`, keep vertical FOV + lens distortion/fisheye
     * uniforms in sync (same as interactive resize). Required or exports show black borders.
     */
    syncPerspectiveProjection,
    /**
     * Same EffectComposer + viewport sequence as interactive `SceneManager.render()` (minus
     * per-frame clay/exposure). Using this for PNG export fixes partial-frame readback on Ultra
     * when `composer.render()` alone leaves a sub-viewport.
     */
    renderComposerPassForExport,
    /** @type {() => object | undefined} */
    getRenderState,
  } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = composer;
    this.postPipeline = postPipeline;
    this.isLensDistortionActive = isLensDistortionActive ?? (() => false);
    this.backgroundController = backgroundController;
    this.syncPostProcessingForLogicalSize = syncPostProcessingForLogicalSize;
    this.syncPerspectiveProjection = syncPerspectiveProjection;
    this.renderComposerPassForExport = renderComposerPassForExport;
    this.getRenderState = getRenderState;
    this._imageTracerLoaded = false;
  }

  /**
   * Artistic Shader Lab presets (gouache, watercolour, sketch) store ndv in mesh alpha
   * (always < 1). Transparent export must keep composer RGB — replacing edge pixels from
   * the direct render drops the post pass (ink, poster blocks, chalk).
   */
  _preserveComposerRgbForTransparentExport() {
    const state = this.getRenderState?.();
    const cl = state?.creativeLook;
    if (!cl?.enabled) return false;
    return isArtisticCreativeLookPreset(cl.preset);
  }

  /**
   * Artistic Shader Lab presets render on warm paper in the viewport. Transparent export
   * reuses that same composer path, then keys the paper backdrop to alpha 0.
   * @param {Uint8Array} pixels — RGBA, top-left origin (post-readback layout)
   * @param {number} width
   * @param {number} height
   */
  _keyArtisticPaperBackdropToAlpha(pixels, width, height) {
    const pr = SKETCH_PAPER_RGB.map((v) => Math.round(v * 255));
    const hardTol = 16;
    const softTol = 44;

    for (let p = 0; p < width * height; p += 1) {
      const i = p * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const dr = r - pr[0];
      const dg = g - pr[1];
      const db = b - pr[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      let alpha = 255;
      if (dist <= hardTol) {
        alpha = 0;
      } else if (dist < softTol) {
        alpha = Math.round(((dist - hardTol) / (softTol - hardTol)) * 255);
      }

      pixels[i + 3] = alpha;
      if (alpha === 0) {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
      }
    }
  }

  /**
   * Full-viewport transparent export for gouache / watercolour / sketch — identical composer
   * stack to the live viewport (paper backdrop, post pass, grading), then paper → alpha.
   */
  async _exportArtisticTransparentImage(
    currentFile,
    originalSize,
    originalPixelRatio,
    size = 2,
    formatId = 'png',
  ) {
    const scale = Math.max(0.25, Number(size) || 1);
    const { width: targetWidth, height: targetHeight } =
      this._resolveExportPixelSize(scale);

    this._pinAsciiExportReference(originalSize);
    try {
      const { width: exportW, height: exportH } = this._setExportFramebufferSize(
        targetWidth,
        targetHeight,
      );
      const exportFovScale = this.isLensDistortionActive?.() ? 1.06 : 1;
      if (this.syncPerspectiveProjection) {
        this.syncPerspectiveProjection({ fovScale: exportFovScale });
      }

      const prevComposerRenderToScreen = this.composer?.renderToScreen;
      if (this.composer) {
        this.composer.renderToScreen = false;
      }
      try {
        this._ensureComposerMatchesDrawingBuffer({ strict: true });
        this._setExportViewport(exportW, exportH);
        if (typeof this.renderComposerPassForExport === 'function') {
          // Opaque clear + paper backdrop — same as the interactive viewport loop.
          this.renderComposerPassForExport({ transparent: false });
        } else if (this.composer) {
          this.composer.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
      } finally {
        if (this.composer && prevComposerRenderToScreen !== undefined) {
          this.composer.renderToScreen = prevComposerRenderToScreen;
        }
      }

      const gl = this.renderer.getContext();
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
      }

      const capture = this._readComposerOutputPixels(exportW, exportH);
      if (!capture?.pixels) {
        throw new Error('Artistic transparent export capture failed');
      }

      let { pixels, width, height } = capture;
      const fw = Math.max(1, exportW);
      const fh = Math.max(1, exportH);
      if (width !== fw || height !== fh) {
        pixels = this._resampleRgba(pixels, width, height, fw, fh);
        width = fw;
        height = fh;
      }

      this._keyArtisticPaperBackdropToAlpha(pixels, width, height);
      const canvas = this._pixelsToFlippedCanvas(pixels, width, height);
      const blob = await encodeCanvasToBlob(canvas, formatId);
      this._downloadBlob(blob, currentFile, imageExportDownloadSuffix(true, formatId));

      this.renderer.setPixelRatio(originalPixelRatio);
      this.renderer.setSize(originalSize.x, originalSize.y, false);
      this.camera.aspect = originalSize.x / Math.max(1e-6, originalSize.y);
      if (this.syncPostProcessingForLogicalSize) {
        this.syncPostProcessingForLogicalSize(originalSize.x, originalSize.y);
      } else if (this.composer) {
        this.composer.setPixelRatio(originalPixelRatio);
        this.composer.setSize(originalSize.x, originalSize.y);
      }
      if (this.syncPerspectiveProjection) {
        this.syncPerspectiveProjection();
      }
      this._ensureFullDrawingBufferViewport();
    } finally {
      this._unpinAsciiExportReference();
    }
  }

  /**
   * Bind the default framebuffer and set viewport/scissor to cover the full drawing buffer.
   * Uses drawing-buffer size / pixelRatio so GL viewport matches canvas backing store even when
   * logical getSize() and pass chains drift (fixes L-shaped black bars on PNG export).
   */
  _ensureFullDrawingBufferViewport() {
    const r = this.renderer;
    r.setRenderTarget(null);
    resetRendererFullViewport(r);
    this.backgroundController?.gradientController?.syncToDrawingBuffer?.();
  }

  /**
   * EffectComposer RTs must match renderer.getDrawingBufferSize(); export resize can leave them stale.
   */
  _ensureComposerMatchesDrawingBuffer({ strict = false } = {}) {
    const composer = this.composer;
    if (!composer?.renderTarget1) return;
    const gl = this.renderer.getContext();
    let bw;
    let bh;
    if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
      bw = gl.drawingBufferWidth;
      bh = gl.drawingBufferHeight;
    } else {
      const db = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(db);
      bw = db.x;
      bh = db.y;
    }
    const rt = composer.renderTarget1;
    if (
      !strict
      && Math.abs(rt.width - bw) <= 2
      && Math.abs(rt.height - bh) <= 2
    ) {
      return;
    }
    if (strict && rt.width === bw && rt.height === bh) {
      return;
    }
    const pr = Math.max(1e-6, this.renderer.getPixelRatio());
    const logicalW = bw / pr;
    const logicalH = bh / pr;
    if (logicalW <= 0 || logicalH <= 0) return;
    if (this.syncPostProcessingForLogicalSize) {
      this.syncPostProcessingForLogicalSize(logicalW, logicalH);
    } else {
      composer.setPixelRatio(pr);
      composer.setSize(logicalW, logicalH);
    }
  }

  /**
   * After `setSize`, the backing store may be smaller than requested (browser/GPU canvas caps).
   * Three.js can keep stale `_width`/`_height`, so `getDrawingBufferSize()` lies and the GL viewport
   * no longer covers the real framebuffer — common symptom: a clean horizontal black band on 2× PNG export.
   */
  _syncRendererInternalSizeToCanvasBackingStore() {
    const canvas = this.renderer.domElement;
    const cw = Math.max(1, canvas.width | 0);
    const ch = Math.max(1, canvas.height | 0);
    const logical = new THREE.Vector2();
    this.renderer.getSize(logical);
    const pr = Math.max(1e-6, this.renderer.getPixelRatio());
    const lx = Math.round(logical.x);
    const ly = Math.round(logical.y);
    if (lx !== cw || ly !== ch) {
      if (typeof this.renderer.setDrawingBufferSize === 'function') {
        this.renderer.setDrawingBufferSize(cw, ch, pr);
      } else {
        this.renderer.setSize(cw, ch, false);
      }
    }
    return { width: cw, height: ch };
  }

  /**
   * Read the composer's final ping-pong buffer (after `renderToScreen: false` render) into a PNG
   * data URL. Avoids `canvas.toDataURL`, which can capture a wrong viewport on the default FBO
   * (Ultra / 2× exports showed a quarter-frame in the top-left).
   * Uses `readBuffer.{width,height}` so copy/readback matches the half-float RT exactly.
   */
  /**
   * Black mattes for the largest 21∶9 picture area inside the viewport — matches
   * `.viewport-letterbox` (container-query) geometry in styles.css.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w
   * @param {number} h
   */
  _fillCinematicLetterbox219Mattes(ctx, w, h) {
    if (w <= 0 || h <= 0) return;
    const r219 = 21 / 9;
    const ar = w / h;
    ctx.fillStyle = ORBY_BLACK;
    if (ar >= r219) {
      const innerW = h * r219;
      const gap = w - innerW;
      const left = Math.floor(gap / 2);
      const right = gap - left;
      ctx.fillRect(0, 0, left, h);
      ctx.fillRect(w - right, 0, right, h);
    } else {
      const innerH = (w * 9) / 21;
      const gap = h - innerH;
      const top = Math.floor(gap / 2);
      const bottom = gap - top;
      ctx.fillRect(0, 0, w, top);
      ctx.fillRect(0, h - bottom, w, bottom);
    }
  }

  _applyCinematicLetterbox219ToCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    this._fillCinematicLetterbox219Mattes(ctx, canvas.width, canvas.height);
    return canvas;
  }

  _pixelsToFlippedCanvas(pixels, targetWidth, targetHeight, { cinematicLetterbox219 = false } = {}) {
    const flipped = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    const rowStride = targetWidth * 4;
    for (let y = 0; y < targetHeight; y += 1) {
      const srcRow = (targetHeight - 1 - y) * rowStride;
      const dstRow = y * rowStride;
      flipped.set(pixels.subarray(srcRow, srcRow + rowStride), dstRow);
    }
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const ctx = exportCanvas.getContext('2d');
    const imageData = ctx.createImageData(targetWidth, targetHeight);
    imageData.data.set(flipped);
    ctx.putImageData(imageData, 0, 0);
    if (cinematicLetterbox219) {
      this._fillCinematicLetterbox219Mattes(ctx, targetWidth, targetHeight);
    }
    return exportCanvas;
  }

  /**
   * Largest square texture / renderbuffer the current GL context can allocate.
   * Browsers may also clamp `canvas.width` below this.
   */
  _getMaxExportPixelDimension() {
    const gl = this.renderer.getContext();
    if (!gl) return 8192;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 8192;
    const maxRb = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || maxTex;
    return Math.max(1, Math.min(maxTex, maxRb, 16384));
  }

  /**
   * Scale down export dimensions when they exceed GPU / canvas limits (avoids clamped
   * backing stores with crop/readback still sized for the requested resolution).
   */
  _clampExportPixelSize(width, height) {
    const cap = this._getMaxExportPixelDimension();
    let w = Math.max(1, Math.round(width));
    let h = Math.max(1, Math.round(height));
    if (w <= cap && h <= cap) {
      return { width: w, height: h };
    }
    const fit = Math.min(cap / w, cap / h);
    return {
      width: Math.max(1, Math.floor(w * fit)),
      height: Math.max(1, Math.floor(h * fit)),
    };
  }

  /**
   * PNG 1×/2× output size — multiples of the current preview backing store
   * (logical viewport × preview pixel ratio), not a separate Ultra density tier.
   * @param {number} scale — 1 or 2 from the export UI
   */
  _resolveExportPixelSize(scale) {
    const logical = fullViewportLogicalSize(this.renderer);
    const previewDensity = Math.max(1e-6, this.renderer.getPixelRatio());
    const s = Math.max(0.25, Number(scale) || 1);
    const { width, height } = this._clampExportPixelSize(
      logical.x * previewDensity * s,
      logical.y * previewDensity * s,
    );
    return { width, height, density: previewDensity };
  }

  /**
   * Keep ASCII grid density tied to the interactive viewport during export resize.
   * @param {{ x: number, y: number }} logicalSize
   */
  _pinAsciiExportReference(logicalSize) {
    this.postPipeline?.creativeLookAscii?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookEga?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookC64?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookGameBoy?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookNes?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookMegaDrive?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookIntellivision?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookGba?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookApple2?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
    this.postPipeline?.creativeLookDither?.pinReferenceLogicalSize?.(
      logicalSize.x,
      logicalSize.y,
    );
  }

  _unpinAsciiExportReference() {
    this.postPipeline?.creativeLookAscii?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookEga?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookC64?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookGameBoy?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookNes?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookMegaDrive?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookIntellivision?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookGba?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookApple2?.unpinReferenceLogicalSize?.();
    this.postPipeline?.creativeLookDither?.unpinReferenceLogicalSize?.();
  }

  /**
   * Interactive fisheye renders to screen; PNG readback uses composer RTs — keep lens in RT chain.
   * @returns {{ lensRenderToScreen: boolean } | null}
   */
  pinLensDistortionForExportCapture() {
    const pass = this.postPipeline?.lensDistortionPass;
    if (!pass?.enabled) return null;
    const snapshot = { lensRenderToScreen: pass.renderToScreen };
    pass.renderToScreen = false;
    return snapshot;
  }

  /** @param {{ lensRenderToScreen: boolean } | null} snapshot */
  unpinLensDistortionForExportCapture(snapshot) {
    if (!snapshot) return;
    const pass = this.postPipeline?.lensDistortionPass;
    if (pass) pass.renderToScreen = snapshot.lensRenderToScreen;
  }

  /**
   * Actual WebGL drawing buffer pixels (authoritative over canvas.width when CSS caps the element).
   * @param {number} [fallbackW]
   * @param {number} [fallbackH]
   * @returns {{ width: number, height: number }}
   */
  _getActualDrawingBufferPixelSize(fallbackW = 1, fallbackH = 1) {
    const gl = this.renderer.getContext();
    if (gl?.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
      return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
    }
    const db = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(db);
    return {
      width: Math.max(1, Math.round(db.x) || fallbackW),
      height: Math.max(1, Math.round(db.y) || fallbackH),
    };
  }

  /**
   * Resize renderer + post stack for export; returns true backing-store pixels after clamp.
   * @returns {{ width: number, height: number }}
   */
  _setExportFramebufferSize(targetWidth, targetHeight) {
    const { width, height } = this._clampExportPixelSize(targetWidth, targetHeight);
    this.renderer.setPixelRatio(1);
    if (typeof this.renderer.setDrawingBufferSize === 'function') {
      // Offline 1080p/1440p/4K — do not shrink to on-screen canvas.width (CSS caps ≠ export res).
      this.renderer.setDrawingBufferSize(width, height, 1);
    } else {
      this.renderer.setSize(width, height, false);
      this._syncRendererInternalSizeToCanvasBackingStore();
    }
    const synced = this._getActualDrawingBufferPixelSize(width, height);
    if (synced.width < width - 2 || synced.height < height - 2) {
      console.warn(
        `Export framebuffer clamped to ${synced.width}×${synced.height} (requested ${width}×${height}).`,
      );
    }
    this.camera.aspect = synced.width / Math.max(1e-6, synced.height);
    if (this.syncPostProcessingForLogicalSize) {
      this.syncPostProcessingForLogicalSize(synced.width, synced.height);
    } else if (this.composer) {
      this.composer.setPixelRatio(1);
      this.composer.setSize(synced.width, synced.height);
    }
    this._ensureComposerMatchesDrawingBuffer({ strict: true });
    this.backgroundController?.gradientController?.syncToDrawingBuffer?.(
      synced.width,
      synced.height,
      { forceRedraw: true },
    );
    return synced;
  }

  /** Full backing-store viewport in logical units (pixelRatio should be 1 during export). */
  _setExportViewport(width, height) {
    const r = this.renderer;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    r.setRenderTarget(null);
    r.setViewport(0, 0, w, h);
    if (typeof r.setScissor === 'function') {
      r.setScissor(0, 0, w, h);
    }
    if (typeof r.setScissorTest === 'function') {
      r.setScissorTest(false);
    }
  }

  /**
   * Read the composer's final ping-pong buffer into RGBA bytes (GL bottom-left origin).
   * @returns {{ pixels: Uint8Array, width: number, height: number } | null}
   */
  _readComposerOutputPixels(fallbackWidth, fallbackHeight) {
    const r = this.renderer;
    const composer = this.composer;
    if (!composer) return null;
    this._ensureComposerMatchesDrawingBuffer({ strict: true });
    const outputRT = getComposerOutputRenderTarget(composer);
    const targetWidth = Math.max(1, outputRT?.width ?? fallbackWidth ?? 1);
    const targetHeight = Math.max(1, outputRT?.height ?? fallbackHeight ?? 1);
    const fw = Math.max(1, fallbackWidth ?? 1);
    const fh = Math.max(1, fallbackHeight ?? 1);
    if (
      outputRT
      && (targetWidth !== fw || targetHeight !== fh)
    ) {
      console.warn(
        `PNG export: composer buffer ${targetWidth}×${targetHeight} ≠ framebuffer ${fw}×${fh}.`,
      );
    }
    const byteRT = new THREE.WebGLRenderTarget(targetWidth, targetHeight, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    try {
      composer.copyPass.render(r, byteRT, outputRT, 0, false);
      const pixels = new Uint8Array(targetWidth * targetHeight * 4);
      r.readRenderTargetPixels(byteRT, 0, 0, targetWidth, targetHeight, pixels);
      return { pixels, width: targetWidth, height: targetHeight };
    } finally {
      byteRT.dispose();
    }
  }

  _captureComposerOutputAsCanvas(
    fallbackWidth,
    fallbackHeight,
    { cinematicLetterbox219 = false } = {},
  ) {
    const capture = this._readComposerOutputPixels(fallbackWidth, fallbackHeight);
    if (!capture) return null;
    const fw = Math.max(1, fallbackWidth ?? 1);
    const fh = Math.max(1, fallbackHeight ?? 1);
    let { pixels, width, height } = capture;
    if (width !== fw || height !== fh) {
      pixels = this._resampleRgba(pixels, width, height, fw, fh);
      width = fw;
      height = fh;
    }
    return this._pixelsToFlippedCanvas(pixels, width, height, {
      cinematicLetterbox219,
    });
  }

  _captureComposerOutputAsPngDataUrl(
    fallbackWidth,
    fallbackHeight,
    { cinematicLetterbox219 = false } = {},
  ) {
    const canvas = this._captureComposerOutputAsCanvas(fallbackWidth, fallbackHeight, {
      cinematicLetterbox219,
    });
    return canvas ? canvas.toDataURL('image/png') : '';
  }

  /** Nearest-neighbor resize when composer RT and canvas backing store diverge. */
  _resampleRgba(src, srcW, srcH, dstW, dstH) {
    const dst = new Uint8Array(dstW * dstH * 4);
    for (let y = 0; y < dstH; y += 1) {
      const sy = Math.min(srcH - 1, Math.floor((y / dstH) * srcH));
      for (let x = 0; x < dstW; x += 1) {
        const sx = Math.min(srcW - 1, Math.floor((x / dstW) * srcW));
        const si = (sy * srcW + sx) * 4;
        const di = (y * dstW + x) * 4;
        dst[di] = src[si];
        dst[di + 1] = src[si + 1];
        dst[di + 2] = src[si + 2];
        dst[di + 3] = src[si + 3];
      }
    }
    return dst;
  }

  /**
   * Export scene as a raster still (with background).
   * Captures the full viewport at the current aspect ratio.
   * @param {boolean} [cinematicLetterbox219] — when true, paint 21∶9 mattes like the viewport overlay.
   */
  async exportImage(
    currentFile,
    originalSize,
    originalPixelRatio,
    size = 1,
    cinematicLetterbox219 = false,
    format = 'png',
  ) {
    const formatId = normalizeImageExportFormat(format);
    const scale = Math.max(0.25, Number(size) || 1);
    const { width: targetWidth, height: targetHeight } =
      this._resolveExportPixelSize(scale);

    this._pinAsciiExportReference(originalSize);
    try {
    const { width: exportW, height: exportH } = this._setExportFramebufferSize(
      targetWidth,
      targetHeight,
    );
    this.backgroundController?.gradientController?.syncToDrawingBuffer?.(
      exportW,
      exportH,
      { forceRedraw: true },
    );
    const exportFovScale = this.isLensDistortionActive?.() ? 1.06 : 1;
    if (this.syncPerspectiveProjection) {
      this.syncPerspectiveProjection({ fovScale: exportFovScale });
    }

    const prevComposerRenderToScreen = this.composer?.renderToScreen;
    if (this.composer) {
      // Read final ping-pong RT — lens pass must also target RTs (see pinLensDistortionForExportCapture).
      this.composer.renderToScreen = false;
    }
    const lensCapturePin = this.pinLensDistortionForExportCapture();
    try {
      this._ensureComposerMatchesDrawingBuffer({ strict: true });
      this._setExportViewport(exportW, exportH);
      if (typeof this.renderComposerPassForExport === 'function') {
        this.renderComposerPassForExport();
      } else if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } finally {
      this.unpinLensDistortionForExportCapture(lensCapturePin);
      if (this.composer && prevComposerRenderToScreen !== undefined) {
        this.composer.renderToScreen = prevComposerRenderToScreen;
      }
    }

    const gl = this.renderer.getContext();
    if (gl && typeof gl.finish === 'function') {
      gl.finish();
    }

    const tw = exportW;
    const th = exportH;
    /** @type {HTMLCanvasElement} */
    let canvas;
    if (this.composer) {
      canvas = this._captureComposerOutputAsCanvas(tw, th, { cinematicLetterbox219 });
    } else {
      canvas = this.renderer.domElement;
      if (cinematicLetterbox219) {
        const copy = document.createElement('canvas');
        copy.width = tw;
        copy.height = th;
        const ctx = copy.getContext('2d');
        ctx.drawImage(canvas, 0, 0, tw, th);
        this._applyCinematicLetterbox219ToCanvas(copy);
        canvas = copy;
      }
    }
    if (!canvas) {
      throw new Error('Image capture failed');
    }

    const blob = await encodeCanvasToBlob(canvas, formatId);
    this._downloadBlob(blob, currentFile, imageExportDownloadSuffix(false, formatId));

    // Restore original settings
    this.renderer.setPixelRatio(originalPixelRatio);
    this.renderer.setSize(originalSize.x, originalSize.y, false);
    this.camera.aspect = originalSize.x / Math.max(1e-6, originalSize.y);
    if (this.syncPostProcessingForLogicalSize) {
      this.syncPostProcessingForLogicalSize(originalSize.x, originalSize.y);
    } else if (this.composer) {
      this.composer.setPixelRatio(originalPixelRatio);
      this.composer.setSize(originalSize.x, originalSize.y);
    }
    if (this.syncPerspectiveProjection) {
      this.syncPerspectiveProjection();
    }

    this._ensureFullDrawingBufferViewport();
    } finally {
      this._unpinAsciiExportReference();
    }
  }

  /** @deprecated Use {@link exportImage} — kept for video frame capture. */
  async exportPng(
    currentFile,
    originalSize,
    originalPixelRatio,
    size = 1,
    cinematicLetterbox219 = false,
  ) {
    return this.exportImage(
      currentFile,
      originalSize,
      originalPixelRatio,
      size,
      cinematicLetterbox219,
      'png',
    );
  }

  /**
   * Export scene with transparent background.
   * Uses a coarse screen-space AABB for the render/read region, then tightens the
   * export to the actual non-transparent pixels so irregular silhouettes avoid empty margins.
   */
  async exportTransparentImage(
    currentModel,
    currentFile,
    cameraController,
    size = 2,
    format = 'png',
  ) {
    const formatId = normalizeImageExportFormat(format);
    const formatMeta = getImageExportFormat(formatId);
    if (!formatMeta.supportsAlpha) {
      console.warn(`${formatMeta.label} does not support transparency`);
      return false;
    }
    if (!currentModel) {
      console.warn('No model loaded to export');
      return false;
    }

    if (this._preserveComposerRgbForTransparentExport()) {
      const state = this._saveState();
      try {
        await this._exportArtisticTransparentImage(
          currentFile,
          state.originalSize,
          state.originalPixelRatio,
          size,
          formatId,
        );
        return true;
      } catch (error) {
        console.error('Artistic transparent image export failed', error);
        return false;
      } finally {
        this._restoreState(state);
      }
    }

    // Save current state
    const state = this._saveState();

    // Set up for transparent export
    this._setupTransparentRender();

    const { density: exportDensity } = this._resolveExportPixelSize(size);
    const cropInfo = this._calculateCropRegion(
      currentModel,
      cameraController,
      state.originalSize,
      size,
      exportDensity,
    );
    if (!cropInfo) {
      console.warn('Could not calculate mesh bounds');
      this._restoreState(state);
      return false;
    }

    // Render to render target with transparency
    const renderTarget = this._renderToTarget(cropInfo, state);

    // Extract and export cropped region
    const canvas = this._extractCroppedCanvas(renderTarget, cropInfo, state);
    const blob = await encodeCanvasToBlob(canvas, formatId);
    this._downloadBlob(blob, currentFile, imageExportDownloadSuffix(true, formatId));

    // Clean up and restore state
    renderTarget.dispose();
    this._restoreState(state);
    return true;
  }

  /** @deprecated Use {@link exportTransparentImage}. */
  async exportTransparentPng(currentModel, currentFile, cameraController, size = 2) {
    return this.exportTransparentImage(currentModel, currentFile, cameraController, size, 'png');
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
   * Map UI detail level to ImageTracer options (colors, path coarsening, small-path culling).
   * @param {'low'|'medium'|'high'} detail
   */
  _getSvgColorVectorizeOptions(detail) {
    const level = detail === 'low' || detail === 'medium' ? detail : 'high';
    if (level === 'low') {
      // Very few colors alone creates jagged “busy” banding; blur before quantize
      // and aggressive pathomit / ltres keep Low visibly simpler than Medium.
      return {
        options: {
          colorsampling: 1,
          numberofcolors: 10,
          colorquantcycles: 1,
          mincolorratio: 0.008,
          pathomit: 22,
          ltres: 5,
          qtres: 5,
          blurradius: 3,
          blurdelta: 64,
          linefilter: false,
          roundcoords: 2,
          // Fill-only paths: ImageTracer's default stroke-width 1 reads as bold outlines at edges.
          strokewidth: 0,
        },
        preserveHighlights: false,
      };
    }
    if (level === 'medium') {
      return {
        options: {
          colorsampling: 1,
          numberofcolors: 32,
          colorquantcycles: 3,
          mincolorratio: 0.0005,
          pathomit: 4,
          ltres: 1.9,
          qtres: 1.9,
          blurradius: 0,
          blurdelta: 20,
          linefilter: false,
          // -1: full float path coords; fewer integer-rounding steps → fewer vector microgaps
          roundcoords: -1,
          strokewidth: 0,
        },
        preserveHighlights: true,
      };
    }
    // high — maximum palette and trace fidelity (previous default)
    return {
      options: {
        colorsampling: 1,
        numberofcolors: 64,
        colorquantcycles: 5,
        mincolorratio: 0,
        pathomit: 0,
        ltres: 1,
        qtres: 1,
        blurradius: 0,
        blurdelta: 20,
        linefilter: false,
        roundcoords: -1,
        strokewidth: 0,
      },
      preserveHighlights: true,
    };
  }

  /**
   * Turn off post passes that poison SVG vectorization (glow, antialias fringe, film/noise).
   * @returns {{ bloom?: boolean, fxaa?: boolean, renderPassClearAlpha: number, grain: object | null }}
   */
  _beginSvgVectorCaptureTweaks() {
    const pp = this.postPipeline;
    const tweaks = {
      bloom: pp?.bloomPass?.enabled,
      fxaa: pp?.fxaaPass?.enabled,
      renderPassClearAlpha: pp?.renderPass?.clearAlpha ?? 1,
      grain: pp?.beginSvgExportGrainSuppression?.() ?? null,
    };
    // Disable bloom for vector capture to avoid large glow fields in traced SVG
    if (pp?.bloomPass) pp.bloomPass.enabled = false;
    // FXAA softens edges into semi-transparent fringe pixels that trace as light halos / jagged slivers.
    if (pp?.fxaaPass) pp.fxaaPass.enabled = false;
    if (pp?.renderPass) pp.renderPass.clearAlpha = 0;
    return tweaks;
  }

  /** @param {ReturnType<ImageExporter['_beginSvgVectorCaptureTweaks']> | null | undefined} tweaks */
  _restoreSvgVectorCaptureTweaks(tweaks) {
    if (!tweaks) return;
    const pp = this.postPipeline;
    if (pp?.bloomPass && tweaks.bloom !== undefined) pp.bloomPass.enabled = tweaks.bloom;
    if (pp?.fxaaPass && tweaks.fxaa !== undefined) pp.fxaaPass.enabled = tweaks.fxaa;
    if (pp?.renderPass) pp.renderPass.clearAlpha = tweaks.renderPassClearAlpha;
    pp?.endSvgExportGrainSuppression?.(tweaks.grain);
  }

  /**
   * Export a flat-color SVG by rendering the current view to PNG and tracing with limited colors
   * @param {'low'|'medium'|'high'} [detail='high'] — trace density and color complexity
   */
  async exportSvgColor(currentModel, currentFile, detail = 'high') {
    if (!currentModel) {
      console.warn('No model loaded to export SVG');
      return;
    }

    const { options, preserveHighlights } = this._getSvgColorVectorizeOptions(detail);

    const state = this._saveState();
    const captureTweaks = this._beginSvgVectorCaptureTweaks();
    try {
      this._setupTransparentRender();

      const canvas = this.renderer.domElement;
      const width = Math.max(1, canvas.width || 1);
      const height = Math.max(1, canvas.height || 1);

      // Match PNG / pixel-SVG export: full Shader Lab stack (optics, sketch, …) via
      // renderComposerPassForExport, then read the composer ping-pong buffer — not the default
      // FBO (canvas.toDataURL misses post passes and can read a stale partial viewport).
      const prevComposerRenderToScreen = this.composer?.renderToScreen;
      if (this.composer) {
        this.composer.renderToScreen = false;
      }
      try {
        this._ensureComposerMatchesDrawingBuffer({ strict: true });
        this._ensureFullDrawingBufferViewport();
        if (typeof this.renderComposerPassForExport === 'function') {
          this.renderComposerPassForExport({ transparent: true });
        } else if (this.composer) {
          this.composer.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
        this._ensureFullDrawingBufferViewport();
      } finally {
        if (this.composer && prevComposerRenderToScreen !== undefined) {
          this.composer.renderToScreen = prevComposerRenderToScreen;
        }
      }

      const gl = this.renderer.getContext();
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
      }

      const dataUrl = this.composer
        ? this._captureComposerOutputAsPngDataUrl(width, height)
        : canvas.toDataURL('image/png');

      // Vectorize: options + optional highlight pre-pass for speculars (high / medium)
      const svg = await this._vectorizeWithOptions(dataUrl, options, {
        preserveHighlights,
        alphaMask: true,
        rasterSeamHealIterations: 1,
        stripPathStrokes: true,
        singleSeamFringePass: true,
        colorSafetyNet: true,
        colorSafetyNetDetail: detail,
      });
      if (!svg) {
        throw new Error('Vectorization failed (ImageTracer unavailable or mask load error)');
      }
      this._downloadText(svg, currentFile, 'color.svg', 'image/svg+xml');
    } finally {
      this._restoreSvgVectorCaptureTweaks(captureTweaks);
      this._restoreState(state);
    }
  }

  /**
   * Export the current Screen pixels look as a hard-edged rect-grid SVG (WYSIWYG viewport grid).
   * @param {string} presetId — active screen-pixel creative look preset
   * @param {{ transparent?: boolean }} [opts]
   */
  async exportSvgScreenPixel(currentFile, presetId, opts = {}) {
    const transparent = opts.transparent === true;
    const state = this._saveState();
    const captureTweaks = this._beginSvgVectorCaptureTweaks();
    try {
      // Transparent prepass so flat-post shaders fill empty cells with uBgColor
      // instead of 15-bit-quantizing an opaque HDRI/studio background (GBA grid artifact).
      this._setupTransparentRender();

      const canvas = this.renderer.domElement;
      const width = Math.max(1, canvas.width || 1);
      const height = Math.max(1, canvas.height || 1);

      if (typeof this.renderComposerPassForExport === 'function') {
        this.renderComposerPassForExport({ transparent: true });
        this._ensureFullDrawingBufferViewport();
      } else if (this.composer) {
        this._ensureFullDrawingBufferViewport();
        this.composer.render();
        this._ensureFullDrawingBufferViewport();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      const gl = this.renderer.getContext();
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
      }

      let svg = '';
      const capture = this.composer
        ? this._readComposerOutputPixels(width, height)
        : null;

      if (capture?.pixels) {
        svg = buildScreenPixelSvgFromGlPixels(
          capture.pixels,
          capture.width,
          capture.height,
          presetId,
          { transparent },
        );
      } else {
        svg = await this._buildScreenPixelSvgFromCanvasDataUrl(
          canvas.toDataURL('image/png'),
          width,
          height,
          presetId,
          { transparent },
        );
      }

      if (!svg) {
        throw new Error('Pixel SVG export failed');
      }
      this._downloadText(svg, currentFile, 'pixel.svg', 'image/svg+xml');
    } finally {
      this._restoreSvgVectorCaptureTweaks(captureTweaks);
      this._restoreState(state);
    }
  }

  _buildScreenPixelSvgFromCanvasDataUrl(dataUrl, width, height, presetId, opts = {}) {
    const transparent = opts.transparent === true;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = width;
          offscreen.height = height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const layout = resolveScreenPixelGridLayout(presetId, width, height);
          const cells = sampleScreenPixelGridFromCanvasData(
            imageData.data,
            width,
            height,
            layout,
          );
          resolve(buildScreenPixelSvg(cells, layout.cols, layout.rows, {
            pixelWidth: width,
            pixelHeight: height,
            cellPxW: layout.cellPxW,
            cellPxH: layout.cellPxH,
            transparent,
          }));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Pixel capture failed'));
      img.src = dataUrl;
    });
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
  _calculateCropRegion(currentModel, cameraController, originalSize, size = 2, exportDensity) {
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

    // Convert from normalized device coordinates (-1 to 1) to pixel coordinates.
    // Use export density (Ultra-equivalent), not the Medium/Low preview DPR cap.
    const density =
      Number.isFinite(exportDensity) && exportDensity > 0
        ? exportDensity
        : this.renderer.getPixelRatio();
    const actualWidth = originalSize.x * density;
    const actualHeight = originalSize.y * density;
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
    const clamped = this._clampExportPixelSize(fullRenderWidth, fullRenderHeight);

    return {
      pixelMinX,
      pixelMinY,
      pixelMaxX,
      pixelMaxY,
      cropWidth,
      cropHeight,
      renderWidth,
      renderHeight,
      fullRenderWidth: clamped.width,
      fullRenderHeight: clamped.height,
      scale,
      exportDensity: density,
    };
  }

  /**
   * Bounding box of pixels with alpha above threshold.
   * Buffer layout matches WebGL readPixels: row 0 is the bottom scanline of the region.
   * @returns {{ minCol: number, minRow: number, maxCol: number, maxRow: number } | null}
   */
  _computeTightAlphaBounds(pixels, width, height, minAlpha = 1) {
    let minCol = width;
    let minRow = height;
    let maxCol = -1;
    let maxRow = -1;
    for (let row = 0; row < height; row++) {
      const rowOffset = row * width * 4;
      for (let col = 0; col < width; col++) {
        const idx = rowOffset + col * 4;
        if (pixels[idx + 3] > minAlpha) {
          if (col < minCol) minCol = col;
          if (col > maxCol) maxCol = col;
          if (row < minRow) minRow = row;
          if (row > maxRow) maxRow = row;
        }
      }
    }
    if (maxCol < minCol || maxRow < minRow) {
      return null;
    }
    return { minCol, minRow, maxCol, maxRow };
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
   * Fade alpha near the mesh silhouette (neighbors with alpha 0). Does not treat the image
   * border as transparency — that incorrectly zeroed pixels when the mesh filled the frame.
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
                continue;
              }
              const checkIdx = (checkY * width + checkX) * 4;
              const checkAlpha = alphaPixels[checkIdx + 3];
              
              // If this pixel is transparent, we found a silhouette edge
              if (checkAlpha === 0) {
                distanceToEdge = Math.min(distanceToEdge, dist);
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

    const gl = this.renderer.getContext();

    // Set transparent clear color
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setClearAlpha(0);
    
    // Set render pass to clear with transparent alpha
    if (this.postPipeline?.renderPass) {
      this.postPipeline.renderPass.clearAlpha = 0;
    }

    this._pinAsciiExportReference(originalSize);
    try {
    const { width: exportW, height: exportH } = this._setExportFramebufferSize(
      cropInfo.fullRenderWidth,
      cropInfo.fullRenderHeight,
    );
    cropInfo.actualFullRenderWidth = exportW;
    cropInfo.actualFullRenderHeight = exportH;
    if (this.syncPerspectiveProjection) {
      this.syncPerspectiveProjection();
    }

    // Create our render target with alpha
    const renderTarget = new THREE.WebGLRenderTarget(
      exportW,
      exportH,
      {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        alpha: true,
        premultipliedAlpha: false,
      },
    );
    
    // Read post-processed RGB from the composer ping-pong buffer (not the default FBO — partial
    // viewports after bloom/N8AO/podium passes leave dead pixels on canvas readback).
    if (this.composer) {
      // Set render pass to clear with transparent alpha
      if (this.postPipeline?.renderPass) {
        this.postPipeline.renderPass.clearAlpha = 0; // Transparent clear
      }

      this._ensureComposerMatchesDrawingBuffer({ strict: true });
      this._ensureFullDrawingBufferViewport();

      gl.clearColor(0, 0, 0, 0); // Clear with transparent black
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const prevComposerRenderToScreen = this.composer.renderToScreen;
      this.composer.renderToScreen = false;
      try {
        if (typeof this.renderComposerPassForExport === 'function') {
          this.renderComposerPassForExport({ transparent: true });
        } else {
          this.composer.render();
          this._ensureFullDrawingBufferViewport();
        }
      } finally {
        this.composer.renderToScreen = prevComposerRenderToScreen;
      }

      if (gl && typeof gl.finish === 'function') {
        gl.finish();
      }

      const capture = this._readComposerOutputPixels(exportW, exportH);
      let fullPixels = capture?.pixels ?? null;
      const captureW = capture?.width ?? exportW;
      const captureH = capture?.height ?? exportH;
      if (
        fullPixels
        && (captureW !== exportW || captureH !== exportH)
      ) {
        fullPixels = this._resampleRgba(
          fullPixels,
          captureW,
          captureH,
          exportW,
          exportH,
        );
      }

      // Debug: Check if we got any content
      // Sample multiple points to check for content
      let hasContent = false;
      if (fullPixels) {
        const samplePoints = [
          Math.floor((captureH / 2) * captureW + captureW / 2) * 4, // Center
          Math.floor((captureH / 4) * captureW + captureW / 4) * 4, // Top-left quadrant
          Math.floor((captureH * 3 / 4) * captureW + captureW * 3 / 4) * 4, // Bottom-right quadrant
        ];

        for (const idx of samplePoints) {
          if (idx >= 0 && idx < fullPixels.length - 3) {
            if (fullPixels[idx] > 0 || fullPixels[idx + 1] > 0 || fullPixels[idx + 2] > 0 || fullPixels[idx + 3] > 0) {
              hasContent = true;
              break;
            }
          }
        }
      }

      if (!hasContent) {
        console.warn(`Composer output appears empty at ${exportW}x${exportH}. Renderer canvas: ${this.renderer.domElement.width}x${this.renderer.domElement.height}. Trying fallback approach...`);
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
        exportW,
        exportH,
        {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          alpha: true,
          premultipliedAlpha: false,
          samples: this.renderer.capabilities.isWebGL2 ? 8 : 0, // Enable 8x MSAA if available for better edge quality
        },
      );
      
      this.renderer.setRenderTarget(alphaRT);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setClearAlpha(0);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null);
      
      // Read alpha channel from direct render (from render target)
      const alphaPixels = new Uint8Array(exportW * exportH * 4);
      this.renderer.readRenderTargetPixels(
        alphaRT,
        0,
        0,
        exportW,
        exportH,
        alphaPixels,
      );

      const preserveComposerRgb = this._preserveComposerRgbForTransparentExport();
      
      // Smooth alpha edges to reduce harsh artifacts and green pixel bleed
      if (!preserveComposerRgb) {
        this._smoothAlphaEdges(alphaPixels, exportW, exportH);
        // Fade silhouette fringe (not the image border — see _fadeOuterEdge)
        this._fadeOuterEdge(alphaPixels, exportW, exportH);
      }

      // Composite: Use RGB from post-processed buffer for opaque pixels, direct render RGB for edge pixels
      // This prevents dark outlines by using clean mesh colors at edges instead of darkened post-processed values
      const pixelCount = exportW * exportH;
      for (let p = 0; p < pixelCount; p += 1) {
        const i = p * 4;
        const directAlpha = alphaPixels[i + 3];
        const directR = alphaPixels[i];
        const directG = alphaPixels[i + 1];
        const directB = alphaPixels[i + 2];

        if (preserveComposerRgb) {
          fullPixels[i + 3] = directAlpha === 0 ? 0 : 255;
        } else {
          fullPixels[i + 3] = directAlpha;
        }

        if (directAlpha === 0) {
          fullPixels[i] = 0;
          fullPixels[i + 1] = 0;
          fullPixels[i + 2] = 0;
        } else if (directAlpha < 255 && !preserveComposerRgb) {
          fullPixels[i] = directR;
          fullPixels[i + 1] = directG;
          fullPixels[i + 2] = directB;
        }
      }
      
      alphaRT.dispose();
      
      // Write pixels to our render target
      const dataTexture = new THREE.DataTexture(
        fullPixels,
        exportW,
        exportH,
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
    this.camera.aspect =
      originalSize.x / Math.max(1e-6, originalSize.y);
    this.camera.updateProjectionMatrix();
    if (this.syncPostProcessingForLogicalSize) {
      this.syncPostProcessingForLogicalSize(originalSize.x, originalSize.y);
    } else if (this.composer) {
      this.composer.setPixelRatio(originalPixelRatio);
      this.composer.setSize(originalSize.x, originalSize.y);
    }
    if (this.syncPerspectiveProjection) {
      this.syncPerspectiveProjection();
    }
    this.renderer.setClearColor(originalClearColor, originalClearAlpha);
    if (this.postPipeline?.renderPass) {
      this.postPipeline.renderPass.clearAlpha = originalRenderPassClearAlpha;
    }
    
    this._ensureFullDrawingBufferViewport();

    return renderTarget;
    } finally {
      this._unpinAsciiExportReference();
    }
  }

  /**
   * Extract cropped region from render target and convert to image.
   * Tightens the crop using the rendered alpha so the PNG matches the silhouette, not the 3D AABB.
   */
  _extractCroppedCanvas(renderTarget, cropInfo, state) {
    const tightPadding = 3; // px around opaque content (edge soften may use partial alpha)

    const exportDensity =
      Number.isFinite(cropInfo.exportDensity) && cropInfo.exportDensity > 0
        ? cropInfo.exportDensity
        : state.originalPixelRatio;
    const coordHeight = state.originalSize.y * exportDensity;
    const plannedW = cropInfo.fullRenderWidth;
    const plannedH = cropInfo.fullRenderHeight;
    const actualW = cropInfo.actualFullRenderWidth ?? renderTarget.width;
    const actualH = cropInfo.actualFullRenderHeight ?? renderTarget.height;
    const scaleX = plannedW > 0 ? actualW / plannedW : 1;
    const scaleY = plannedH > 0 ? actualH / plannedH : 1;

    // Calculate crop coordinates in render target space (coarse AABB region)
    const cropX = Math.floor(cropInfo.pixelMinX * cropInfo.scale * scaleX);
    const cropY = Math.floor((coordHeight - cropInfo.pixelMaxY) * cropInfo.scale * scaleY);
    const cropW = Math.max(
      1,
      Math.min(actualW - cropX, Math.ceil(cropInfo.renderWidth * scaleX)),
    );
    const cropH = Math.max(
      1,
      Math.min(actualH - cropY, Math.ceil(cropInfo.renderHeight * scaleY)),
    );

    const regionPixels = new Uint8Array(cropW * cropH * 4);
    this.renderer.readRenderTargetPixels(
      renderTarget,
      cropX,
      cropY,
      cropW,
      cropH,
      regionPixels,
    );

    const tight = this._computeTightAlphaBounds(regionPixels, cropW, cropH);
    let minCol = 0;
    let minRow = 0;
    let maxCol = cropW - 1;
    let maxRow = cropH - 1;
    if (tight) {
      minCol = Math.max(0, tight.minCol - tightPadding);
      minRow = Math.max(0, tight.minRow - tightPadding);
      maxCol = Math.min(cropW - 1, tight.maxCol + tightPadding);
      maxRow = Math.min(cropH - 1, tight.maxRow + tightPadding);
    }

    const outW = maxCol - minCol + 1;
    const outH = maxRow - minRow + 1;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = outW;
    exportCanvas.height = outH;
    const exportContext = exportCanvas.getContext('2d', { alpha: true });
    exportContext.clearRect(0, 0, outW, outH);

    // Flip vertically: buffer row 0 = GL bottom; canvas row 0 = top
    const flippedPixels = new Uint8Array(outW * outH * 4);
    for (let cy = 0; cy < outH; cy++) {
      const srcRow = maxRow - cy;
      for (let cx = 0; cx < outW; cx++) {
        const srcCol = minCol + cx;
        const srcIdx = (srcRow * cropW + srcCol) * 4;
        const dstIdx = (cy * outW + cx) * 4;
        flippedPixels[dstIdx] = regionPixels[srcIdx];
        flippedPixels[dstIdx + 1] = regionPixels[srcIdx + 1];
        flippedPixels[dstIdx + 2] = regionPixels[srcIdx + 2];
        flippedPixels[dstIdx + 3] = regionPixels[srcIdx + 3];
      }
    }

    const imageData = exportContext.createImageData(outW, outH);
    imageData.data.set(flippedPixels);
    exportContext.putImageData(imageData, 0, 0);

    return exportCanvas;
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
              this._applyAlphaMaskForVector(imageData.data, bgKey);
              this._morphCloseMask(imageData, bgKey, 1);
            }
            this._fillTinyBackgroundHoles(imageData, bgKey, 24);
            if (!processing.silhouetteBinary) {
              this._healLuminanceSeamFringe(imageData, bgKey, {
                centerLumMin: 235,
                neighborLumMax: 215,
                minVotes: 2,
              });
              // Second pass: slightly looser (more mid tones as anchors) for stubborn microgaps.
              // Skipped for color SVG — it often paints a bright fringe band at silhouettes.
              if (!processing.singleSeamFringePass) {
                this._healLuminanceSeamFringe(imageData, bgKey, {
                  centerLumMin: 218,
                  neighborLumMax: 232,
                  minVotes: 3,
                });
              }
            }
            const seamIt = Number(processing.rasterSeamHealIterations) || 0;
            if (seamIt > 0 && !processing.silhouetteBinary) {
              this._majoritySqueezeImageData(imageData, bgKey, seamIt);
            }
            if (!processing.silhouetteBinary) {
              this._microSnapBrightOutliersToNeighborConsensus(imageData, bgKey, 2);
            }
          }

          if (processing.alphaMask || processing.silhouetteBinaryLuma) {
            imageData = this._cropImageDataByKeyColor(imageData, bgKey, 2);
          }

          let svgstr = window.ImageTracer?.imagedataToSVG
            ? window.ImageTracer.imagedataToSVG(imageData, options)
            : null;
          if (svgstr && (processing.alphaMask || processing.silhouetteBinaryLuma)) {
            svgstr = this._removeKeyColorPaths(svgstr, bgKey);
            if (processing.alphaMask) {
              svgstr = this._removeNearKeyColorPaths(svgstr, bgKey, 52);
            }
            if (processing.hairlineSeamStroke && processing.alphaMask && !processing.silhouetteBinary) {
              svgstr = this._addHairlineSeamStrokesToSvg(svgstr);
            }
            if (processing.stripPathStrokes) {
              svgstr = this._stripSvgPathStrokes(svgstr);
            }
            if (
              svgstr
              && processing.colorSafetyNet
              && processing.alphaMask
              && !processing.silhouetteBinary
              && !processing.silhouetteBinaryLuma
            ) {
              svgstr = this._prependColorSafetyNetLayer(svgstr, imageData, bgKey, {
                detail: processing.colorSafetyNetDetail,
              });
            }
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

  /**
   * Opaque Pixels: un-premultiply. Fully transparent: key (stripped from SVG after trace).
   * Do NOT key low-alpha **edge** pixels: those are mesh AA; keying and removing their paths
   * is what created hairline “see-through” holes between color fields.
   */
  _applyAlphaMaskForVector(data, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 1) {
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
        data[i + 3] = 255;
      } else {
        const inv = 255 / a;
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

  /**
   * Merge bright seam pixels into dominant darker 3×3 neighbor color (k-means + trace
   * otherwise leave 1px “third” colors or no fill → white microgaps). Params tune aggressiveness.
   * @param {{ centerLumMin: number, neighborLumMax: number, minVotes: number }} opts
   */
  _healLuminanceSeamFringe(imageData, keyRgb, opts) {
    const { centerLumMin, neighborLumMax, minVotes } = opts;
    const [kr, kg, kb] = keyRgb;
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;
    const isKey = (j) => src[j] === kr && src[j + 1] === kg && src[j + 2] === kb;
    const lumAt = (buf, j) => 0.2126 * buf[j] + 0.7152 * buf[j + 1] + 0.0722 * buf[j + 2];
    const buf = new Uint8ClampedArray(src);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        if (isKey(o)) continue;
        if (lumAt(src, o) < centerLumMin) continue;
        const counts = new Map();
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = (ny * w + nx) * 4;
            if (isKey(j)) continue;
            if (lumAt(src, j) > neighborLumMax) continue;
            const k = `${src[j]},${src[j + 1]},${src[j + 2]}`;
            counts.set(k, (counts.get(k) || 0) + 1);
          }
        }
        if (counts.size === 0) continue;
        let bestK = null;
        let bestN = 0;
        for (const [k, n] of counts) {
          if (n > bestN) {
            bestN = n;
            bestK = k;
          }
        }
        if (bestN < minVotes) continue;
        const [r, g, b] = bestK.split(',').map(Number);
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
        buf[o + 3] = 255;
      }
    }
    imageData.data.set(buf);
  }

  /**
   * 3×3 majority vote of opaque colors (skips key). Collapses 1px AA speckle so imagetracer
   * does not leave tiny "third color" slivers that pathomit can drop → holes.
   */
  _majoritySqueezeImageData(imageData, keyRgb, iterations = 1) {
    const [kr, kg, kb] = keyRgb;
    const w = imageData.width;
    const h = imageData.height;
    const isKey = (b, j) => b[j] === kr && b[j + 1] === kg && b[j + 2] === kb;
    const buf = new Uint8ClampedArray(imageData.data);
    const next = new Uint8ClampedArray(buf.length);

    for (let it = 0; it < iterations; it += 1) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const counts = new Map();
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const j = (ny * w + nx) * 4;
              if (isKey(buf, j)) continue;
              const k = `${buf[j]},${buf[j + 1]},${buf[j + 2]}`;
              counts.set(k, (counts.get(k) || 0) + 1);
            }
          }
          const o = (y * w + x) * 4;
          if (counts.size === 0) {
            next[o] = buf[o];
            next[o + 1] = buf[o + 1];
            next[o + 2] = buf[o + 2];
            next[o + 3] = buf[o + 3];
            continue;
          }
          let bestK = null;
          let bestN = -1;
          for (const [k, n] of counts) {
            if (n > bestN) {
              bestN = n;
              bestK = k;
            }
          }
          const [r, g, b] = bestK.split(',').map(Number);
          next[o] = r;
          next[o + 1] = g;
          next[o + 2] = b;
          next[o + 3] = 255;
        }
      }
      buf.set(next);
    }
    imageData.data.set(buf);
  }

  /**
   * Last raster pass: 1px “sparkle” holes are often L≈255 while 5–6 8-neighbors are the
   * same mid/dark k-means color. Real bright regions (e.g. large white shapes) do not
   * get 5+ identical neighbors, so we leave them alone.
   */
  _microSnapBrightOutliersToNeighborConsensus(imageData, keyRgb, iterations = 2) {
    const [kr, kg, kb] = keyRgb;
    const w = imageData.width;
    const h = imageData.height;
    const isKey = (b, o) => b[o] === kr && b[o + 1] === kg && b[o + 2] === kb;
    const lumAt = (b, o) => 0.2126 * b[o] + 0.7152 * b[o + 1] + 0.0722 * b[o + 2];
    const minNeighborAlign = 5;
    const centerLumMin = 241;

    for (let pass = 0; pass < iterations; pass += 1) {
      const src = imageData.data;
      const out = new Uint8ClampedArray(src.length);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const o = (y * w + x) * 4;
          if (isKey(src, o)) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          if (lumAt(src, o) < centerLumMin) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          const counts = new Map();
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const j = (ny * w + nx) * 4;
              if (isKey(src, j)) continue;
              const k = `${src[j]},${src[j + 1]},${src[j + 2]}`;
              counts.set(k, (counts.get(k) || 0) + 1);
            }
          }
          if (counts.size === 0) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          let bestK = null;
          let bestN = 0;
          for (const [k, n] of counts) {
            if (n > bestN) {
              bestN = n;
              bestK = k;
            }
          }
          if (bestN < minNeighborAlign) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          const [r, g, b] = bestK.split(',').map(Number);
          if (r === src[o] && g === src[o + 1] && b === src[o + 2]) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = 255;
            continue;
          }
          out[o] = r;
          out[o + 1] = g;
          out[o + 2] = b;
          out[o + 3] = 255;
        }
      }
      imageData.data.set(out);
    }
  }

  _foregroundBoundingBox(imageData, keyRgb) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i] === kr && data[i + 1] === kg && data[i + 2] === kb) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY };
  }

  /**
   * Grid resolution for the regional safety-net blocker: finer cells track local shading
   * so gap-fill reads closer to the traced artwork than one global average.
   */
  _getSafetyNetGridDimensions(detail, width, height, bbox) {
    const level = detail === 'low' || detail === 'medium' ? detail : 'high';
    const minGrid = level === 'low' ? 8 : level === 'medium' ? 12 : 16;
    const maxGrid = level === 'low' ? 14 : level === 'medium' ? 20 : 28;
    const targetCellPx = level === 'low' ? 44 : level === 'medium' ? 32 : 24;
    const fw = Math.max(1, bbox.maxX - bbox.minX + 1);
    const fh = Math.max(1, bbox.maxY - bbox.minY + 1);
    const cols = Math.min(maxGrid, Math.max(minGrid, Math.ceil(fw / targetCellPx)));
    const rows = Math.min(maxGrid, Math.max(minGrid, Math.ceil(fh / targetCellPx)));
    // Keep roughly square cells relative to image aspect.
    const aspect = width / Math.max(1, height);
    if (aspect > 1.35) {
      return { cols: Math.min(maxGrid, Math.round(cols * aspect ** 0.35)), rows };
    }
    if (aspect < 0.74) {
      return { cols, rows: Math.min(maxGrid, Math.round(rows / aspect ** 0.35)) };
    }
    return { cols, rows };
  }

  /**
   * Per-cell average RGB over the cropped art footprint. Empty cells inherit the nearest
   * filled neighbor so the blocker layer stays continuous under the traced vectors.
   */
  _computeRegionalForegroundMeans(imageData, keyRgb, gridCols, gridRows) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    const accum = Array.from({ length: gridCols * gridRows }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (data[i] === kr && data[i + 1] === kg && data[i + 2] === kb) continue;
        const cx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
        const cy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
        const cell = accum[cy * gridCols + cx];
        cell.r += data[i];
        cell.g += data[i + 1];
        cell.b += data[i + 2];
        cell.n += 1;
      }
    }

    const means = accum.map((cell) => {
      if (cell.n < 1) return null;
      return {
        r: Math.round(cell.r / cell.n),
        g: Math.round(cell.g / cell.n),
        b: Math.round(cell.b / cell.n),
      };
    });

    let fallback = null;
    for (const mean of means) {
      if (!mean) continue;
      if (!fallback) {
        fallback = { ...mean };
        continue;
      }
      fallback = {
        r: Math.round((fallback.r + mean.r) / 2),
        g: Math.round((fallback.g + mean.g) / 2),
        b: Math.round((fallback.b + mean.b) / 2),
      };
    }
    if (!fallback) return null;

    const filled = means.slice();
    let changed = true;
    while (changed) {
      changed = false;
      for (let cy = 0; cy < gridRows; cy += 1) {
        for (let cx = 0; cx < gridCols; cx += 1) {
          const idx = cy * gridCols + cx;
          if (filled[idx]) continue;
          const neighbors = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ];
          for (const [nx, ny] of neighbors) {
            if (nx < 0 || ny < 0 || nx >= gridCols || ny >= gridRows) continue;
            const neighbor = filled[ny * gridCols + nx];
            if (!neighbor) continue;
            filled[idx] = { ...neighbor };
            changed = true;
            break;
          }
        }
      }
    }

    for (let i = 0; i < filled.length; i += 1) {
      if (!filled[i]) filled[i] = { ...fallback };
    }
    return filled;
  }

  _imageDataToRegionalFlatForegroundColor(imageData, keyRgb, cellMeans, gridCols, gridRows) {
    const [kr, kg, kb] = keyRgb;
    const d = imageData.data;
    const { width, height } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (d[i] === kr && d[i + 1] === kg && d[i + 2] === kb) {
          o[i] = kr;
          o[i + 1] = kg;
          o[i + 2] = kb;
          o[i + 3] = d[i + 3];
          continue;
        }
        const cx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
        const cy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
        const mean = cellMeans[cy * gridCols + cx];
        o[i] = mean.r;
        o[i + 1] = mean.g;
        o[i + 2] = mean.b;
        o[i + 3] = 255;
      }
    }
    return out;
  }

  /**
   * Regional flat-color trace under the art: gaps in the top layer show local mean colors
   * instead of white/empty (not pixel-perfect, but no “see-through”).
   * @param {{ detail?: 'low'|'medium'|'high' }} [opts]
   */
  _prependColorSafetyNetLayer(mainSvg, imageData, keyRgb, opts = {}) {
    if (typeof window === 'undefined' || !window.ImageTracer?.imagedataToSVG) return mainSvg;
    if (typeof window.DOMParser === 'undefined' || !window.XMLSerializer) return mainSvg;
    const [kr, kg, kb] = keyRgb;
    const bbox = this._foregroundBoundingBox(imageData, keyRgb);
    if (!bbox) return mainSvg;

    const { width, height } = imageData;
    const { cols: gridCols, rows: gridRows } = this._getSafetyNetGridDimensions(
      opts.detail,
      width,
      height,
      bbox,
    );
    const cellMeans = this._computeRegionalForegroundMeans(imageData, keyRgb, gridCols, gridRows);
    if (!cellMeans) return mainSvg;

    const flat = this._imageDataToRegionalFlatForegroundColor(
      imageData,
      keyRgb,
      cellMeans,
      gridCols,
      gridRows,
    );

    const paletteMap = new Map();
    paletteMap.set(`${kr},${kg},${kb}`, { r: kr, g: kg, b: kb, a: 255 });
    for (const mean of cellMeans) {
      paletteMap.set(`${mean.r},${mean.g},${mean.b}`, { r: mean.r, g: mean.g, b: mean.b, a: 255 });
    }
    const pal = Array.from(paletteMap.values());

    const safetyOptions = {
      colorsampling: 0,
      numberofcolors: pal.length,
      colorquantcycles: 1,
      mincolorratio: 0,
      pathomit: 0,
      ltres: 0.5,
      qtres: 0.5,
      blurradius: 0,
      blurdelta: 20,
      linefilter: false,
      roundcoords: -1,
      rightangleenhance: true,
      viewbox: false,
      desc: false,
      scale: 1,
      strokewidth: 0,
      pal,
    };
    let net;
    try {
      net = window.ImageTracer.imagedataToSVG(flat, safetyOptions);
    } catch (e) {
      console.warn('safety net trace failed', e);
      return mainSvg;
    }
    if (!net) return mainSvg;
    net = this._removeKeyColorPaths(net, keyRgb);
    try {
      const mainDoc = new window.DOMParser().parseFromString(mainSvg, 'image/svg+xml');
      const netDoc = new window.DOMParser().parseFromString(net, 'image/svg+xml');
      if (mainDoc.querySelector('parsererror') || netDoc.querySelector('parsererror')) {
        return mainSvg;
      }
      const mainRoot = mainDoc.documentElement;
      const netRoot = netDoc.documentElement;
      if (!mainRoot || !netRoot) return mainSvg;
      const NS = 'http://www.w3.org/2000/svg';
      const g = mainDoc.createElementNS(NS, 'g');
      g.setAttribute('id', 'orby-safety-net');
      g.setAttribute('data-orby', 'color-safety-net');
      g.setAttribute('data-orby-safety-grid', `${gridCols}x${gridRows}`);
      g.setAttribute('aria-hidden', 'true');
      g.setAttribute('style', 'pointer-events: none;');
      const fromNet = netRoot.querySelectorAll('path, rect, polygon, polyline, circle, ellipse');
      if (fromNet.length === 0) return mainSvg;
      fromNet.forEach((node) => {
        const imported = mainDoc.importNode(node, true);
        imported.setAttribute('stroke', 'none');
        imported.removeAttribute('stroke-width');
        imported.setAttribute('opacity', '1');
        g.appendChild(imported);
      });
      if (g.childNodes.length === 0) return mainSvg;
      if (mainRoot.firstChild) {
        mainRoot.insertBefore(g, mainRoot.firstChild);
      } else {
        mainRoot.appendChild(g);
      }
      return new window.XMLSerializer().serializeToString(mainRoot);
    } catch (e) {
      console.warn('safety net merge failed', e);
    }
    return mainSvg;
  }

  /**
   * Remove same-color outline strokes ImageTracer emits (and any leftover seam-stroke attrs).
   * Fill-only paths avoid the bold “double edge” look at color boundaries and silhouettes.
   */
  _stripSvgPathStrokes(svgString) {
    if (typeof window === 'undefined' || !window.DOMParser) return svgString;
    try {
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      const parseErr = doc.querySelector('parsererror');
      if (parseErr) return svgString;
      const root = doc.documentElement;
      if (!root || root.localName.toLowerCase() !== 'svg') return svgString;

      const strip = (el) => {
        el.setAttribute('stroke', 'none');
        el.removeAttribute('stroke-width');
        el.removeAttribute('stroke-linejoin');
        el.removeAttribute('stroke-linecap');
        el.removeAttribute('stroke-miterlimit');
        el.removeAttribute('paint-order');
        el.removeAttribute('vector-effect');
        const st = el.getAttribute('style');
        if (st) {
          const next = st
            .replace(/stroke[^;]*/gi, '')
            .replace(/stroke-width[^;]*/gi, '')
            .replace(/paint-order[^;]*/gi, '')
            .replace(/;+/g, ';')
            .replace(/^;|;$/g, '')
            .trim();
          if (next) {
            el.setAttribute('style', next);
          } else {
            el.removeAttribute('style');
          }
        }
      };

      root.querySelectorAll('path, rect, polygon, polyline, circle, ellipse').forEach(strip);
      if (window.XMLSerializer) {
        return new window.XMLSerializer().serializeToString(root);
      }
    } catch (e) {
      console.warn('strip path strokes failed', e);
    }
    return svgString;
  }

  /**
   * Slight same-color under-stroke to bridge hairline gaps. ImageTracer already uses
   * stroke-width 1; we nudge a little by view size but stay near 1 so dense traces do
   * not look like pebbles (thick stroke + round caps on tiny paths reads as "dots").
   */
  _addHairlineSeamStrokesToSvg(svgString) {
    if (typeof window === 'undefined' || !window.DOMParser) return svgString;
    try {
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      const parseErr = doc.querySelector('parsererror');
      if (parseErr) return svgString;
      const root = doc.documentElement;
      if (!root || root.localName.toLowerCase() !== 'svg') return svgString;

      let w = 800;
      let h = 600;
      const vb = root.getAttribute('viewBox');
      if (vb) {
        const p = vb.trim().split(/[\s,]+/).map(parseFloat);
        if (p.length >= 4) {
          w = Math.max(1, p[2] || w);
          h = Math.max(1, p[3] || h);
        }
      } else {
        const wAttr = root.getAttribute('width');
        const hAttr = root.getAttribute('height');
        if (wAttr) w = Math.max(1, parseFloat(wAttr) || w);
        if (hAttr) h = Math.max(1, parseFloat(hAttr) || h);
      }
      const m = Math.min(w, h);
      // Slight nudge over 1.0: seal remaining vector gaps without the old “pebble” width.
      const sw = Math.max(0.85, Math.min(1.52, 0.92 + m * 0.00035));

      const getFill = (el) => {
        let f = el.getAttribute('fill');
        if (f && f !== 'none') return f;
        const st = el.getAttribute('style');
        if (!st) return null;
        const mFill = st.match(/fill:\s*([^;]+)/i);
        return mFill ? mFill[1].trim() : null;
      };

      const apply = (el) => {
        const fill = getFill(el);
        if (!fill || fill === 'none' || /^\s*url\(/i.test(fill)) return;
        el.setAttribute('fill', fill);
        el.setAttribute('stroke', fill);
        el.setAttribute('stroke-width', String(sw));
        el.setAttribute('stroke-linejoin', 'miter');
        el.setAttribute('stroke-miterlimit', '2');
        el.setAttribute('stroke-linecap', 'butt');
        el.setAttribute('paint-order', 'stroke fill');
        if (el.hasAttribute('vector-effect')) {
          el.removeAttribute('vector-effect');
        }
        const st = el.getAttribute('style');
        if (st) {
          const next = st
            .replace(/stroke[^;]*/gi, '')
            .replace(/stroke-width[^;]*/gi, '')
            .replace(/fill[^;]*/gi, '')
            .replace(/;+/g, ';')
            .replace(/^;|;$/g, '')
            .trim();
          if (next) {
            el.setAttribute('style', next);
          } else {
            el.removeAttribute('style');
          }
        }
      };
      root.querySelectorAll('path, rect, polygon, polyline, circle, ellipse').forEach(apply);
      if (window.XMLSerializer) {
        return new window.XMLSerializer().serializeToString(root);
      }
    } catch (e) {
      console.warn('hairline seam stroke pass failed', e);
    }
    return svgString;
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

  _morphCloseMask(imageData, keyRgb, iterations = 1) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    const isBgAt = (arr, x, y) => {
      const i = (y * width + x) * 4;
      return arr[i] === kr && arr[i + 1] === kg && arr[i + 2] === kb;
    };

    // Convert to binary mask: 1 = foreground, 0 = background
    const base = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        base[y * width + x] = isBgAt(data, x, y) ? 0 : 1;
      }
    }

    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],  [0, 0],  [1, 0],
      [-1, 1],  [0, 1],  [1, 1],
    ];

    let mask = base;
    for (let it = 0; it < iterations; it += 1) {
      // Dilation
      const dilated = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let on = 0;
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (mask[ny * width + nx]) {
              on = 1;
              break;
            }
          }
          dilated[y * width + x] = on;
        }
      }

      // Erosion
      const eroded = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let on = 1;
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              on = 0;
              break;
            }
            if (!dilated[ny * width + nx]) {
              on = 0;
              break;
            }
          }
          eroded[y * width + x] = on;
        }
      }
      mask = eroded;
    }

    // Apply closed mask back to imageData (keep original FG color, key BG color)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (!mask[y * width + x]) {
          data[i] = kr;
          data[i + 1] = kg;
          data[i + 2] = kb;
          data[i + 3] = 255;
        } else {
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

  _removeNearKeyColorPaths(svg, keyRgb, tolerance = 52) {
    const toRgb = (fill) => {
      const lower = fill.toLowerCase().trim();
      if (lower.startsWith('#')) {
        let hex = lower.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map((c) => c + c).join('');
        }
        if (hex.length !== 6) return null;
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
      const m = lower.match(/^rgb\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };

    const colorDist = (a, b) => {
      const dr = a[0] - b[0];
      const dg = a[1] - b[1];
      const db = a[2] - b[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const [kr, kg, kb] = keyRgb;
    const key = [kr, kg, kb];

    return svg.replace(/<(path|rect)\b([^>]*?)\/?>/gi, (tag, el, attrs) => {
      const fillMatch = attrs.match(/\bfill=["']([^"']+)["']/i);
      if (!fillMatch) return tag;
      const rgb = toRgb(fillMatch[1]);
      if (!rgb) return tag;
      if (colorDist(rgb, key) <= tolerance) {
        return '';
      }
      return tag;
    });
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

  _downloadBlob(blob, currentFile, suffix) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const name = currentFile?.name ?? 'orby';
    link.href = url;
    link.download = `${name.replace(/\.[a-z0-9]+$/i, '')}-${suffix}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
    this.camera.aspect =
      state.originalSize.x / Math.max(1e-6, state.originalSize.y);
    this.camera.updateProjectionMatrix();
    if (this.syncPostProcessingForLogicalSize) {
      this.syncPostProcessingForLogicalSize(state.originalSize.x, state.originalSize.y);
    } else if (this.composer) {
      this.composer.setPixelRatio(state.originalPixelRatio);
      this.composer.setSize(state.originalSize.x, state.originalSize.y);
    }
    if (this.syncPerspectiveProjection) {
      this.syncPerspectiveProjection();
    }
    this.renderer.autoClear = state.originalAutoClear;

    // Re-apply background if HDRI was enabled
    if (state.originalHdriBackgroundEnabled) {
      this.backgroundController?.setHdriBackgroundEnabled(true);
    }
  }
}

