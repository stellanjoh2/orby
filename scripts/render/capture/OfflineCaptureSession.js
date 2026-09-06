import * as THREE from 'three';
import { renderFrameForCaptureWithPins } from './renderFrameForCapture.js';
import { createCaptureContext } from './captureContext.js';
import { CaptureFeatureSession } from './captureFeatureHooks.js';
import { logCaptureDebug } from './captureReadback.js';
import { repairInteractiveViewportAfterCapture } from './repairInteractiveViewportAfterCapture.js';
import { setStudioBackdropExportBypass } from '../../ui/orbyPageTransition.js';

/**
 * @typedef {import('./captureContext.js').CaptureSize} CaptureSize
 * @typedef {import('./captureContext.js').CaptureFrameOptions} CaptureFrameOptions
 */

/**
 * @typedef {object} OfflineCaptureSessionDeps
 * @property {import('three').WebGLRenderer} renderer
 * @property {import('three').Scene} scene
 * @property {import('three').PerspectiveCamera} camera
 * @property {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} [composer]
 * @property {import('../ImageExporter.js').ImageExporter} imageExporter
 * @property {{ renderComposerPassForExport?: (opts?: { transparent?: boolean }) => void }} [composerLifecycle]
 * @property {import('../BackgroundController.js').BackgroundController} [backgroundController]
 * @property {import('../EnvironmentController.js').EnvironmentController} [environmentController]
 * @property {import('../PostProcessingPipeline.js').PostProcessingPipeline} [postPipeline]
 * @property {import('./captureArtisticLookPrep.js').ArtisticLookCaptureDeps} [creativeLookCaptureDeps]
 * @property {(w: number, h: number) => void} [syncPostProcessingForLogicalSize]
 * @property {(opts?: { fovScale?: number }) => void} [syncPerspectiveProjection]
 * @property {() => boolean} [isLensDistortionActive]
 * @property {(value: boolean) => void} [setSuppressResizeForExport]
 * @property {() => number} [getHdriRotationDegrees]
 * @property {() => void} [onAfterRestore]
 * @property {() => void} [pinStudioBackgroundForCapture] — re-apply Studio Color; ignore transition Orby black
 */

/**
 * Transactional offline capture — snapshot GL/scene state, resize for capture, restore in `finally`.
 */
export class OfflineCaptureSession {
  /** @param {OfflineCaptureSessionDeps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {ReturnType<OfflineCaptureSession['_snapshotState']> | null} */
    this._snapshot = null;
    /** @type {CaptureSize | null} */
    this._captureSize = null;
    this._suppressResizeWasSet = false;
    this._captureFeatures = new CaptureFeatureSession({
      backgroundController: deps.backgroundController,
      environmentController: deps.environmentController,
      postPipeline: deps.postPipeline,
      creativeLookCaptureDeps: deps.creativeLookCaptureDeps,
    });
  }

  /** @returns {{ width: number, height: number }} */
  get capturePixels() {
    const size = this._captureSize;
    return {
      width: size?.width ?? 1,
      height: size?.height ?? 1,
    };
  }

  begin() {
    if (this._snapshot) return;
    const { setSuppressResizeForExport, pinStudioBackgroundForCapture, postPipeline } =
      this.deps;
    // Still PNG export starts a load spinner; never let transition lock paint Orby black
    // into the capture clear while Studio Color is `#000000` (or any user pick).
    setStudioBackdropExportBypass(true);
    if (postPipeline?.renderPass && postPipeline.renderPass.clearAlpha === 0) {
      postPipeline.renderPass.clearAlpha = 1;
    }
    pinStudioBackgroundForCapture?.();
    if (typeof setSuppressResizeForExport === 'function') {
      setSuppressResizeForExport(true);
      this._suppressResizeWasSet = true;
    }
    this._snapshot = this._snapshotState();
    this._captureFeatures.startCapture({
      getHdriRotationDegrees: this.deps.getHdriRotationDegrees,
      referenceLogicalSize: this._snapshot.originalSize,
    });
  }

  /**
   * Resize renderer + post stack for capture dimensions.
   * @param {CaptureSize} captureSize
   * @returns {{ width: number, height: number }}
   */
  applyCaptureSize(captureSize) {
    if (!this._snapshot) {
      this.begin();
    }
    const { imageExporter, syncPerspectiveProjection, isLensDistortionActive } = this.deps;
    this._captureSize = createCaptureContext(captureSize);
    const synced = imageExporter._setExportFramebufferSize(
      this._captureSize.width,
      this._captureSize.height,
    );
    this._captureSize.width = synced.width;
    this._captureSize.height = synced.height;
    this._captureSize.cameraAspect =
      synced.width / Math.max(1e-6, synced.height);

    const exportFovScale = isLensDistortionActive?.() ? 1.06 : 1;
    syncPerspectiveProjection?.({ fovScale: exportFovScale });

    logCaptureDebug(
      {
        renderer: this.deps.renderer,
        composer: this.deps.composer ?? imageExporter?.composer,
      },
      synced.width,
      synced.height,
      { phase: 'applyCaptureSize' },
    );
    return synced;
  }

  /**
   * @param {CaptureFrameOptions} [opts]
   */
  renderFrame(opts = {}) {
    const size = this._captureSize;
    if (!size) {
      throw new Error('OfflineCaptureSession.renderFrame: call applyCaptureSize first');
    }
    const {
      renderer,
      scene,
      camera,
      composer,
      imageExporter,
      composerLifecycle,
      backgroundController,
    } = this.deps;

    const ctx = renderFrameForCaptureWithPins({
      renderer,
      scene,
      camera,
      composer: composer ?? imageExporter?.composer,
      imageExporter,
      postPipeline: this.deps.postPipeline ?? imageExporter?.postPipeline,
      composerLifecycle,
      backgroundController,
      environmentController: this.deps.environmentController,
      captureFeatureSession: this._captureFeatures,
      width: size.width,
      height: size.height,
      transparent: opts.transparent === true,
    });

    logCaptureDebug(
      {
        renderer,
        composer: composer ?? imageExporter?.composer,
      },
      size.width,
      size.height,
      {
        phase: opts.transparent ? 'renderFrame:transparent' : 'renderFrame',
      },
    );
    return ctx;
  }

  restore() {
    const snapshot = this._snapshot;
    if (!snapshot) return;

    const {
      renderer,
      camera,
      composer,
      backgroundController,
      syncPostProcessingForLogicalSize,
      syncPerspectiveProjection,
      setSuppressResizeForExport,
      onAfterRestore,
    } = this.deps;

    renderer.setClearColor(snapshot.originalClearColor, snapshot.originalClearAlpha);

    const backgroundSphere = backgroundController?.getBackgroundSphere?.();
    if (backgroundSphere) {
      backgroundSphere.visible = snapshot.originalBackgroundSphereVisible;
    }

    renderer.setPixelRatio(snapshot.originalPixelRatio);
    renderer.setSize(snapshot.originalSize.x, snapshot.originalSize.y, false);
    camera.aspect = snapshot.originalSize.x / Math.max(1e-6, snapshot.originalSize.y);

    if (syncPostProcessingForLogicalSize) {
      syncPostProcessingForLogicalSize(snapshot.originalSize.x, snapshot.originalSize.y);
    } else if (composer) {
      composer.setPixelRatio(snapshot.originalPixelRatio);
      composer.setSize(snapshot.originalSize.x, snapshot.originalSize.y);
    }

    syncPerspectiveProjection?.();

    renderer.autoClear = snapshot.originalAutoClear;

    if (composer && snapshot.originalComposerRenderToScreen !== undefined) {
      composer.renderToScreen = snapshot.originalComposerRenderToScreen;
    }

    if (snapshot.originalHdriBackgroundEnabled) {
      backgroundController?.setHdriBackgroundEnabled?.(true);
    }

    renderer.setRenderTarget(null);

    // After size/composer restore — re-apply gradient + HDRI (do not assign stale scene.environment).
    this._captureFeatures.restore();

    repairInteractiveViewportAfterCapture({
      renderer,
      composer,
      logicalWidth: snapshot.originalSize.x,
      logicalHeight: snapshot.originalSize.y,
      pixelRatio: snapshot.originalPixelRatio,
      syncPostProcessingForLogicalSize,
      backgroundController,
    });

    if (this._suppressResizeWasSet && typeof setSuppressResizeForExport === 'function') {
      setSuppressResizeForExport(false);
      this._suppressResizeWasSet = false;
    }

    setStudioBackdropExportBypass(false);

    this._snapshot = null;
    this._captureSize = null;
    onAfterRestore?.();
  }

  _snapshotState() {
    const { renderer, scene, composer, backgroundController } = this.deps;
    const originalSize = new THREE.Vector2();
    renderer.getSize(originalSize);

    return {
      originalSize: originalSize.clone(),
      originalPixelRatio: renderer.getPixelRatio(),
      originalClearColor: renderer.getClearColor(new THREE.Color()).clone(),
      originalClearAlpha: renderer.getClearAlpha(),
      originalBackgroundSphereVisible:
        backgroundController?.getBackgroundSphere?.()?.visible ?? false,
      originalHdriBackgroundEnabled:
        backgroundController?.getHdriBackgroundEnabled?.() ?? false,
      originalAutoClear: renderer.autoClear,
      originalComposerRenderToScreen: composer?.renderToScreen,
    };
  }
}

/**
 * @template T
 * @param {OfflineCaptureSessionDeps} deps
 * @param {(session: OfflineCaptureSession) => T | Promise<T>} work
 * @returns {Promise<T>}
 */
export async function runOfflineCaptureSession(deps, work) {
  const session = new OfflineCaptureSession(deps);
  session.begin();
  try {
    return await work(session);
  } finally {
    try {
      session.restore();
    } finally {
      // Always release — even if restore threw mid-way.
      setStudioBackdropExportBypass(false);
    }
  }
}
