import * as THREE from 'three';
import { encodeCanvasToBlob } from './encodeImageBlob.js';
import {
  getImageExportFormat,
  imageExportDownloadSuffix,
  normalizeImageExportFormat,
} from './imageExportFormats.js';
import { isArtisticCreativeLookPreset } from './creativeLookPresetSliders.js';
import { resetRendererFullViewport } from './resetRendererFullViewport.js';
import { buildScreenPixelSvgFromGlPixels } from './screenPixelSvgExport.js';
import { SvgVectorizer } from './SvgVectorizer.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/EffectComposer.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import { USE_CAPTURE_SESSION, ALLOW_CAPTURE_RESAMPLE, LOG_CAPTURE_DEBUG } from '../constants.js';
import { fillCinematicLetterbox219Mattes } from './capture/cinematicLetterbox219.js';
import { keyArtisticPaperBackdropToAlpha } from './capture/keyArtisticPaperBackdrop.js';
import {
  clampCapturePixelSize,
  resolvePngExportCaptureSize,
} from './capture/CaptureSizePolicy.js';
import { runOfflineCaptureSession } from './capture/OfflineCaptureSession.js';
import { captureReadback } from './capture/captureReadback.js';
import { readGradientMergedFromComposerOutput } from './capture/captureGradientComposite.js';
import {
  ensureExportCapturePixelRatio,
  forceExportCaptureFramebuffer,
} from './capture/forceExportCaptureFramebuffer.js';
import { prepareCaptureFeatures, restoreCaptureFeatures } from './capture/captureFeatureHooks.js';
import { downloadExportCanvas } from './capture/encodeExportBlob.js';
import {
  applyTransparentCaptureSetup,
  extractCroppedTransparentCanvas,
  readTransparentMergedTopDownRgba,
  restoreTransparentCaptureSetup,
  cropTransparentTopDownRgbaToCanvas as cropTransparentTopDownRgbaToCanvasFn,
} from './capture/TransparentCapture.js';
import {
  pinAsciiReferenceForCapture,
  unpinAsciiReferenceForCapture,
  pinLensDistortionForExportCapture,
  unpinLensDistortionForExportCapture,
} from './capture/capturePostPipelinePins.js';

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
    /** Same instance wired to `renderComposerPassForExport` — capture session entry. */
    composerLifecycle,
    /**
     * GPU / canvas clamp reduced export dimensions — show toast in studio UI.
     * @type {(info: {
     *   requestedWidth: number,
     *   requestedHeight: number,
     *   actualWidth: number,
     *   actualHeight: number,
     *   reason: 'gpu-max' | 'drawing-buffer',
     * }) => void}
     */
    notifyExportSizeClamped,
    environmentController,
    /** @type {() => object | undefined} */
    getRenderState,
    /** @type {import('./capture/captureArtisticLookPrep.js').ArtisticLookCaptureDeps | undefined} */
    creativeLookCaptureDeps,
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
    this.composerLifecycle = composerLifecycle;
    this.notifyExportSizeClamped = notifyExportSizeClamped;
    this.environmentController = environmentController;
    this.getRenderState = getRenderState;
    this.creativeLookCaptureDeps = creativeLookCaptureDeps;
    /** Pure image-data → SVG pipeline (silhouette / color / pixel-grid tracing). */
    this.svgVectorizer = new SvgVectorizer();
    /** @type {number | null} — learned max w×h the browser actually allocates for export. */
    this._maxExportPixelArea = null;
    /** @type {(() => void) | null} — SceneManager re-applies HDRI + backdrop after capture. */
    this.reapplyStudioAfterCapture = null;
    /** @type {(() => number) | null} */
    this.getHdriRotationDegrees = null;
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
    keyArtisticPaperBackdropToAlpha(pixels, width, height);
  }

  /**
   * Full-viewport transparent export for gouache / watercolour / sketch — identical composer
   * stack to the live viewport (paper backdrop, post pass, grading), then paper → alpha.
   */
  async _exportArtisticTransparentImage(
    currentFile,
    _originalSize,
    _originalPixelRatio,
    size = 2,
    formatId = 'png',
  ) {
    const captureSize = resolvePngExportCaptureSize(
      this.renderer,
      size,
      this._maxExportPixelArea,
    );

    await runOfflineCaptureSession(this._captureSessionDeps(), async (session) => {
      const { width: exportW, height: exportH } = session.applyCaptureSize(captureSize);
      session.renderFrame({ transparent: false });

      const gl = this.renderer.getContext();
      if (gl && typeof gl.finish === 'function') {
        gl.finish();
      }

      const capture = this._readComposerOutputPixels(exportW, exportH, {
        exportScale: size,
        retryRender: () => session.renderFrame({ transparent: false }),
      });
      if (!capture?.pixels) {
        throw new Error('Artistic transparent export capture failed');
      }

      const { pixels, width, height } = capture;
      keyArtisticPaperBackdropToAlpha(pixels, width, height);
      const canvas = this._pixelsToFlippedCanvas(pixels, width, height);
      await downloadExportCanvas(canvas, currentFile, formatId, {
        transparent: true,
        downloadBlob: (blob, file, suffix) => this._downloadBlob(blob, file, suffix),
      });
    });
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
    const gradientCtrl = this.backgroundController?.gradientController;
    if (gradientCtrl?.shouldCompositeGradientOnReadback?.() !== true) {
      gradientCtrl?.applyIfActive?.();
    }
  }

  /**
   * EffectComposer RTs must match renderer.getDrawingBufferSize(); export resize can leave them stale.
   */
  _ensureComposerMatchesDrawingBuffer({ strict = false } = {}) {
    const composer = this.composer;
    if (!composer?.renderTarget1) return;
    ensureExportCapturePixelRatio({
      renderer: this.renderer,
      composer,
    });
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
    if (Math.abs(rt.width - bw) > 2 || Math.abs(rt.height - bh) > 2) {
      composer.renderTarget1.setSize(bw, bh);
      composer.renderTarget2?.setSize(bw, bh);
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
    fillCinematicLetterbox219Mattes(ctx, w, h);
  }

  _applyCinematicLetterbox219ToCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    this._fillCinematicLetterbox219Mattes(ctx, canvas.width, canvas.height);
    return canvas;
  }

  _pixelsToFlippedCanvas(
    pixels,
    targetWidth,
    targetHeight,
    { cinematicLetterbox219 = false, forceOpaqueAlpha = false } = {},
  ) {
    const flipped = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    const rowStride = targetWidth * 4;
    for (let y = 0; y < targetHeight; y += 1) {
      const srcRow = (targetHeight - 1 - y) * rowStride;
      const dstRow = y * rowStride;
      flipped.set(pixels.subarray(srcRow, srcRow + rowStride), dstRow);
    }
    return this._pixelsTopDownToCanvas(flipped, targetWidth, targetHeight, {
      cinematicLetterbox219,
      forceOpaqueAlpha,
    });
  }

  _pixelsTopDownToCanvas(
    pixels,
    targetWidth,
    targetHeight,
    { cinematicLetterbox219 = false, forceOpaqueAlpha = false } = {},
  ) {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const ctx = exportCanvas.getContext('2d');
    const imageData = ctx.createImageData(targetWidth, targetHeight);
    imageData.data.set(pixels);
    // Opaque export must never be transparent. Additive/depthWrite-off looks (e.g. Dust Field)
    // hide the meshes, so the background is just the composer clear whose alpha can land < 255;
    // the RGB already holds the chosen background color, so flattening alpha yields the solid bg.
    if (forceOpaqueAlpha) {
      const data = imageData.data;
      for (let i = 3; i < data.length; i += 4) {
        data[i] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    if (cinematicLetterbox219) {
      this._fillCinematicLetterbox219Mattes(ctx, targetWidth, targetHeight);
    }
    return exportCanvas;
  }

  /**
   * Scale down export dimensions when they exceed GPU / canvas limits (avoids clamped
   * backing stores with crop/readback still sized for the requested resolution).
   */
  _clampExportPixelSize(width, height) {
    return clampCapturePixelSize(
      width,
      height,
      this.renderer,
      this._maxExportPixelArea,
    );
  }

  /** Remember the largest w×h export the browser actually gave us (area budget). */
  _rememberExportPixelAreaBudget(width, height) {
    const area = Math.max(1, Math.round(width) * Math.round(height));
    if (this._maxExportPixelArea == null || area < this._maxExportPixelArea) {
      this._maxExportPixelArea = area;
    }
  }

  /**
   * Align canvas + Three.js internal size with the real GL backing store after browser clamp.
   * @param {{ width: number, height: number }} size
   */
  _coerceRendererToBackingStorePixels({ width, height }) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const canvas = this.renderer.domElement;
    if (canvas) {
      canvas.width = w;
      canvas.height = h;
    }
    this.renderer.setPixelRatio(1);
    if (typeof this.renderer.setDrawingBufferSize === 'function') {
      this.renderer.setDrawingBufferSize(w, h, 1);
    } else {
      this.renderer.setSize(w, h, false);
    }
    this._syncRendererInternalSizeToCanvasBackingStore();
  }

  /**
   * Resize the drawing buffer and return the size GL actually allocated.
   * @returns {{ width: number, height: number }}
   */
  _applyExportDrawingBufferSize(width, height) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.renderer.setPixelRatio(1);
    if (typeof this.renderer.setDrawingBufferSize === 'function') {
      this.renderer.setDrawingBufferSize(w, h, 1);
    } else {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, h, false);
      this._syncRendererInternalSizeToCanvasBackingStore();
    }

    let synced = this._getActualDrawingBufferPixelSize(w, h);
    if (synced.width !== w || synced.height !== h) {
      this._coerceRendererToBackingStorePixels(synced);
      synced = this._getActualDrawingBufferPixelSize(synced.width, synced.height);
    }
    return synced;
  }

  /**
   * PNG 1×/2× output size — multiples of the current preview backing store
   * (logical viewport × preview pixel ratio), not a separate Ultra density tier.
   * @param {number} scale — 1 or 2 from the export UI
   */
  _resolveExportPixelSize(scale) {
    const captureSize = resolvePngExportCaptureSize(
      this.renderer,
      scale,
      this._maxExportPixelArea,
    );
    return {
      width: captureSize.width,
      height: captureSize.height,
      density: captureSize.previewDensity,
    };
  }

  /**
   * Keep ASCII grid density tied to the interactive viewport during export resize.
   * @param {{ x: number, y: number }} logicalSize
   */
  _pinAsciiExportReference(logicalSize) {
    pinAsciiReferenceForCapture(this.postPipeline, logicalSize);
  }

  _unpinAsciiExportReference() {
    unpinAsciiReferenceForCapture(this.postPipeline);
  }

  /**
   * Interactive fisheye renders to screen; PNG readback uses composer RTs — keep lens in RT chain.
   * @returns {{ lensRenderToScreen: boolean } | null}
   */
  pinLensDistortionForExportCapture() {
    return pinLensDistortionForExportCapture(this.postPipeline);
  }

  /** @param {{ lensRenderToScreen: boolean } | null} snapshot */
  unpinLensDistortionForExportCapture(snapshot) {
    unpinLensDistortionForExportCapture(this.postPipeline, snapshot);
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

  _notifyExportSizeClamped(requested, actual, reason) {
    if (
      requested.width === actual.width
      && requested.height === actual.height
    ) {
      return;
    }
    this.notifyExportSizeClamped?.({
      requestedWidth: requested.width,
      requestedHeight: requested.height,
      actualWidth: actual.width,
      actualHeight: actual.height,
      reason,
    });
  }

  /**
   * Resize renderer + post stack for export; returns true backing-store pixels after clamp.
   * @returns {{ width: number, height: number }}
   */
  _setExportFramebufferSize(targetWidth, targetHeight) {
    const requested = {
      width: Math.max(1, Math.round(targetWidth)),
      height: Math.max(1, Math.round(targetHeight)),
    };
    const { width, height } = this._clampExportPixelSize(
      requested.width,
      requested.height,
    );
    if (width !== requested.width || height !== requested.height) {
      this._notifyExportSizeClamped(requested, { width, height }, 'gpu-max');
    }

    let synced = this._applyExportDrawingBufferSize(width, height);
    if (synced.width !== width || synced.height !== height) {
      console.warn(
        `Export framebuffer is ${synced.width}×${synced.height} (requested ${width}×${height}).`,
      );
      this._notifyExportSizeClamped(
        { width, height },
        synced,
        'drawing-buffer',
      );
      this._rememberExportPixelAreaBudget(synced.width, synced.height);
    }
    this.camera.aspect = synced.width / Math.max(1e-6, synced.height);
    if (this.syncPostProcessingForLogicalSize) {
      this.syncPostProcessingForLogicalSize(synced.width, synced.height);
    } else if (this.composer) {
      this.composer.setPixelRatio(1);
      this.composer.setSize(synced.width, synced.height);
    }
    forceExportCaptureFramebuffer(
      {
        renderer: this.renderer,
        composer: this.composer,
        syncPostProcessingForLogicalSize: this.syncPostProcessingForLogicalSize?.bind(this),
      },
      synced.width,
      synced.height,
    );
    this._ensureComposerMatchesDrawingBuffer({ strict: true });
    return synced;
  }

  /** Reset GL viewport to the full drawing buffer (export uses DPR 1). */
  _setExportViewport(width, height) {
    void width;
    void height;
    const r = this.renderer;
    r.setRenderTarget(null);
    resetRendererFullViewport(r);
    if (typeof r.setScissorTest === 'function') {
      r.setScissorTest(false);
    }
  }

  /**
   * Read composer output at exact capture size (strict by default).
   * @returns {{ pixels: Uint8Array, width: number, height: number } | null}
   */
  _readComposerOutputPixels(fallbackWidth, fallbackHeight, opts = {}) {
    const composer = this.composer;
    if (!composer) return null;

    const allowResample = opts.allowResample ?? ALLOW_CAPTURE_RESAMPLE;
    const logDebug = opts.logDebug ?? LOG_CAPTURE_DEBUG;
    const gradientCtrl = this.backgroundController?.gradientController;
    const useGradientComposite =
      gradientCtrl?.shouldCompositeGradientOnReadback?.() === true
      && opts.transparent !== true;

    if (useGradientComposite) {
      const width = Math.max(1, Math.round(fallbackWidth));
      const height = Math.max(1, Math.round(fallbackHeight));
      const merged = readGradientMergedFromComposerOutput({
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        composer,
        width,
        height,
        getGradientRgba: () => gradientCtrl.getCaptureGradientRgba(),
        finishGpu: () => {
          const gl = this.renderer.getContext();
          if (gl && typeof gl.finish === 'function') {
            gl.finish();
          }
        },
      });
      if (logDebug) {
        console.debug('[Orby capture] gradient CPU composite', { width, height });
      }
      return { pixels: merged, width, height, topDown: true };
    }

    return captureReadback(
      {
        renderer: this.renderer,
        composer,
        camera: this.camera,
        getGroundGrid: () => this.composerLifecycle?.getGroundGrid?.(),
        getCreativeLookAsciiActive: () =>
          this.composerLifecycle?.getCreativeLookAsciiActive?.(),
        getGridLineWidth: () => {
          const w = this.getRenderState?.()?.gridLineWidth;
          return Number.isFinite(w) ? w : 1;
        },
        exportScale: opts.exportScale ?? 1,
        ensureComposerMatchesDrawingBuffer: (o) =>
          this._ensureComposerMatchesDrawingBuffer(o),
      },
      {
        width: fallbackWidth,
        height: fallbackHeight,
        allowResample,
        retryRender: opts.retryRender,
        logDebug,
      },
    );
  }

  _captureComposerOutputAsCanvas(
    fallbackWidth,
    fallbackHeight,
    {
      cinematicLetterbox219 = false,
      allowResample = ALLOW_CAPTURE_RESAMPLE,
      exportScale = 1,
      retryRender,
      logDebug = LOG_CAPTURE_DEBUG,
    } = {},
  ) {
    const capture = this._readComposerOutputPixels(fallbackWidth, fallbackHeight, {
      allowResample,
      exportScale,
      retryRender,
      logDebug,
    });
    if (!capture) return null;
    const { pixels, width, height } = capture;
    if (capture.topDown) {
      return this._pixelsTopDownToCanvas(pixels, width, height, {
        cinematicLetterbox219,
        forceOpaqueAlpha: true,
      });
    }
    return this._pixelsToFlippedCanvas(pixels, width, height, {
      cinematicLetterbox219,
      forceOpaqueAlpha: true,
    });
  }

  _captureComposerOutputAsPngDataUrl(
    fallbackWidth,
    fallbackHeight,
    { cinematicLetterbox219 = false, retryRender } = {},
  ) {
    const canvas = this._captureComposerOutputAsCanvas(fallbackWidth, fallbackHeight, {
      cinematicLetterbox219,
      retryRender,
    });
    return canvas ? canvas.toDataURL('image/png') : '';
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
    if (USE_CAPTURE_SESSION) {
      return this._exportImageViaCaptureSession(
        currentFile,
        originalSize,
        size,
        cinematicLetterbox219,
        format,
      );
    }
    return this._exportImageLegacy(
      currentFile,
      originalSize,
      originalPixelRatio,
      size,
      cinematicLetterbox219,
      format,
    );
  }

  async _exportImageViaCaptureSession(
    currentFile,
    originalSize,
    size = 1,
    cinematicLetterbox219 = false,
    format = 'png',
  ) {
    const formatId = normalizeImageExportFormat(format);
    const captureSize = resolvePngExportCaptureSize(
      this.renderer,
      size,
      this._maxExportPixelArea,
    );

    await runOfflineCaptureSession(
      this._captureSessionDeps(),
      async (session) => {
          const { width: exportW, height: exportH } = session.applyCaptureSize(captureSize);
          session.renderFrame({ transparent: false });

          const gl = this.renderer.getContext();
          if (gl && typeof gl.finish === 'function') {
            gl.finish();
          }

          /** @type {HTMLCanvasElement} */
          let canvas;
          if (this.composer) {
            canvas = this._captureComposerOutputAsCanvas(exportW, exportH, {
              cinematicLetterbox219,
              exportScale: size,
              retryRender: () => session.renderFrame({ transparent: false }),
            });
          } else {
            canvas = this.renderer.domElement;
            if (cinematicLetterbox219) {
              const copy = document.createElement('canvas');
              copy.width = exportW;
              copy.height = exportH;
              const ctx = copy.getContext('2d');
              ctx.drawImage(canvas, 0, 0, exportW, exportH);
              this._applyCinematicLetterbox219ToCanvas(copy);
              canvas = copy;
            }
          }
          if (!canvas) {
            throw new Error('Image capture failed');
          }

          await downloadExportCanvas(canvas, currentFile, formatId, {
            transparent: false,
            downloadBlob: (blob, file, suffix) => this._downloadBlob(blob, file, suffix),
          });
        },
    );
  }

  _captureSessionDeps() {
    return {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      composer: this.composer,
      imageExporter: this,
      postPipeline: this.postPipeline,
      composerLifecycle: this.composerLifecycle,
      backgroundController: this.backgroundController,
      environmentController: this.environmentController,
      creativeLookCaptureDeps: this.creativeLookCaptureDeps,
      syncPostProcessingForLogicalSize: this.syncPostProcessingForLogicalSize,
      syncPerspectiveProjection: this.syncPerspectiveProjection,
      isLensDistortionActive: this.isLensDistortionActive,
      getHdriRotationDegrees: this.getHdriRotationDegrees,
      onAfterRestore: this.reapplyStudioAfterCapture,
    };
  }

  async _exportTransparentImageViaCaptureSession(
    currentModel,
    currentFile,
    cameraController,
    size = 2,
    formatId = 'png',
  ) {
    const originalSize = new THREE.Vector2();
    this.renderer.getSize(originalSize);
    const { density: exportDensity } = this._resolveExportPixelSize(size);
    const cropInfo = this._calculateCropRegion(
      currentModel,
      cameraController,
      originalSize,
      size,
      exportDensity,
    );
    if (!cropInfo) {
      console.warn('Could not calculate mesh bounds');
      return false;
    }

    await runOfflineCaptureSession(this._captureSessionDeps(), async (session) => {
        const synced = session.applyCaptureSize({
          width: cropInfo.fullRenderWidth,
          height: cropInfo.fullRenderHeight,
          pixelRatio: 1,
          cameraAspect:
            cropInfo.fullRenderWidth / Math.max(1e-6, cropInfo.fullRenderHeight),
        });
        cropInfo.actualFullRenderWidth = synced.width;
        cropInfo.actualFullRenderHeight = synced.height;

        const transparentDeps = {
          renderer: this.renderer,
          scene: this.scene,
          composer: this.composer,
          backgroundController: this.backgroundController,
          postPipeline: this.postPipeline,
        };
        const transparentSnap = applyTransparentCaptureSetup(transparentDeps);
        try {
          const gl = this.renderer.getContext();
          const topDown = readTransparentMergedTopDownRgba({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera,
            composer: this.composer,
            width: synced.width,
            height: synced.height,
            renderFrame: () => session.renderFrame({ transparent: true }),
            finishGpu: () => {
              if (gl && typeof gl.finish === 'function') {
                gl.finish();
              }
            },
          });

          const canvas = extractCroppedTransparentCanvas(
            topDown,
            synced.width,
            synced.height,
            cropInfo,
          );
          await downloadExportCanvas(canvas, currentFile, formatId, {
            transparent: true,
            downloadBlob: (blob, file, suffix) => this._downloadBlob(blob, file, suffix),
          });
        } finally {
          restoreTransparentCaptureSetup(transparentDeps, transparentSnap);
        }
      });
    return true;
  }

  async _exportImageLegacy(
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
    this.environmentController?.beginCaptureRotationSnapshot?.(
      this.getHdriRotationDegrees?.() ?? this.environmentController?.rotation,
    );
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
      // Read final ping-pong RT — lens pass must also target RTs (see pinLensDistortionForExportCapture).
      this.composer.renderToScreen = false;
    }
    const lensCapturePin = this.pinLensDistortionForExportCapture();
    try {
      this._ensureComposerMatchesDrawingBuffer({ strict: true });
      this._setExportViewport(exportW, exportH);
      prepareCaptureFeatures(
        {
          backgroundController: this.backgroundController,
          environmentController: this.environmentController,
        },
        { width: exportW, height: exportH },
      );
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
      canvas = this._captureComposerOutputAsCanvas(tw, th, {
        cinematicLetterbox219,
        exportScale: scale,
      });
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

    restoreCaptureFeatures({
      backgroundController: this.backgroundController,
      environmentController: this.environmentController,
    });
    this.reapplyStudioAfterCapture?.();
    this._ensureFullDrawingBufferViewport();
    } finally {
      this._unpinAsciiExportReference();
    }
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
      try {
        await this._exportArtisticTransparentImage(
          currentFile,
          null,
          null,
          size,
          formatId,
        );
        return true;
      } catch (error) {
        console.error('Artistic transparent image export failed', error);
        return false;
      }
    }

    if (USE_CAPTURE_SESSION) {
      return this._exportTransparentImageViaCaptureSession(
        currentModel,
        currentFile,
        cameraController,
        size,
        formatId,
      );
    }

    // Legacy transparent export (rollback when USE_CAPTURE_SESSION = false)
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
    const svg = await this.svgVectorizer.vectorizeSilhouette(dataUrl);
    if (!svg) {
      throw new Error('Vectorization failed (ImageTracer unavailable or mask load error)');
    }
    this._downloadText(svg, currentFile, 'silhouette.svg', 'image/svg+xml');
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

    const { options, preserveHighlights } = this.svgVectorizer.getSvgColorVectorizeOptions(detail);

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
      const svg = await this.svgVectorizer.vectorizeWithOptions(dataUrl, options, {
        preserveHighlights,
        alphaMask: true,
        rasterSeamHealIterations: 1,
        stripPathStrokes: true,
        singleSeamFringePass: true,
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
        svg = await this.svgVectorizer.buildScreenPixelSvgFromCanvasDataUrl(
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

      const capture = this._readComposerOutputPixels(exportW, exportH, {
        retryRender: () => {
          if (typeof this.renderComposerPassForExport === 'function') {
            this.renderComposerPassForExport({ transparent: true });
          } else {
            this.composer.render();
            this._ensureFullDrawingBufferViewport();
          }
        },
      });
      const fullPixels = capture?.pixels ?? null;
      const captureW = capture?.width ?? exportW;
      const captureH = capture?.height ?? exportH;

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

  cropTransparentTopDownRgbaToCanvas(rgba, width, height, opts = {}) {
    return cropTransparentTopDownRgbaToCanvasFn(rgba, width, height, opts);
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

