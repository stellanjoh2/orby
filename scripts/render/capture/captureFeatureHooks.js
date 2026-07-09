/**
 * Feature-level capture hooks — gradient, HDRI, post-pipeline pins, etc.
 * Called from `renderFrameForCapture` after export viewport is set.
 */
import {
  pinAsciiReferenceForCapture,
  unpinAsciiReferenceForCapture,
} from './capturePostPipelinePins.js';
import { prepareArtisticCreativeLookForCapture } from './captureArtisticLookPrep.js';

/**
 * @typedef {import('./captureContext.js').CaptureSize & { transparent?: boolean }} CaptureFrameContext
 */

/**
 * Per-export session for feature hooks that snapshot once (HDRI) vs every frame (gradient).
 */
export class CaptureFeatureSession {
  /**
   * @param {{
   *   backgroundController?: import('../BackgroundController.js').BackgroundController,
   *   environmentController?: import('../EnvironmentController.js').EnvironmentController,
   *   postPipeline?: import('../PostProcessingPipeline.js').PostProcessingPipeline,
   *   creativeLookCaptureDeps?: import('./captureArtisticLookPrep.js').ArtisticLookCaptureDeps,
   * }} deps
   */
  constructor({
    backgroundController,
    environmentController,
    postPipeline,
    creativeLookCaptureDeps,
  } = {}) {
    this.backgroundController = backgroundController;
    this.environmentController = environmentController;
    this.postPipeline = postPipeline;
    this.creativeLookCaptureDeps = creativeLookCaptureDeps;
    this._active = false;
  }

  begin() {
    this._active = true;
  }

  /**
   * @param {(() => number) | {
   *   getHdriRotationDegrees?: () => number,
   *   referenceLogicalSize?: { x: number, y: number },
   * }} [startOpts]
   */
  startCapture(startOpts) {
    this._active = true;
    let getHdriRotationDegrees;
    let referenceLogicalSize = null;
    if (typeof startOpts === 'function') {
      getHdriRotationDegrees = startOpts;
    } else if (startOpts && typeof startOpts === 'object') {
      getHdriRotationDegrees = startOpts.getHdriRotationDegrees;
      referenceLogicalSize = startOpts.referenceLogicalSize ?? null;
    }
    this.environmentController?.beginCaptureRotationSnapshot?.(
      typeof getHdriRotationDegrees === 'function'
        ? getHdriRotationDegrees()
        : undefined,
    );
    if (referenceLogicalSize) {
      pinAsciiReferenceForCapture(this.postPipeline, referenceLogicalSize);
    }
  }

  /** @param {import('./captureContext.js').CaptureSize & { transparent?: boolean, exportTimeSec?: number, lensDistortionActive?: boolean }} ctx */
  prepareFrame(ctx) {
    if (!this._active) return;
    const lensDistortionActive = this.postPipeline?.lensDistortionPass?.enabled === true;
    const captureCtx = { ...ctx, lensDistortionActive };
    this.environmentController?.prepareForCapture?.(captureCtx);
    this.backgroundController?.gradientController?.prepareForCapture?.(captureCtx);
    if (this.creativeLookCaptureDeps) {
      prepareArtisticCreativeLookForCapture(ctx, this.creativeLookCaptureDeps);
    }
  }

  restore() {
    this.backgroundController?.gradientController?.clearCaptureMode?.();
    if (!this._active) {
      unpinAsciiReferenceForCapture(this.postPipeline);
      return;
    }
    this.environmentController?.restoreAfterCapture?.();
    this.backgroundController?.gradientController?.restoreAfterCapture?.();
    unpinAsciiReferenceForCapture(this.postPipeline);
    this._active = false;
  }
}

/**
 * @param {{
 *   backgroundController?: import('../BackgroundController.js').BackgroundController,
 *   environmentController?: import('../EnvironmentController.js').EnvironmentController,
 *   postPipeline?: import('../PostProcessingPipeline.js').PostProcessingPipeline,
 *   creativeLookCaptureDeps?: import('./captureArtisticLookPrep.js').ArtisticLookCaptureDeps,
 * }} deps
 * @param {CaptureFrameContext} ctx
 */
export function prepareCaptureFeatures(deps, ctx) {
  const lensDistortionActive = deps.postPipeline?.lensDistortionPass?.enabled === true;
  const captureCtx = { ...ctx, lensDistortionActive };
  deps.environmentController?.prepareForCapture?.(captureCtx);
  deps.backgroundController?.gradientController?.prepareForCapture?.(captureCtx);
  if (deps.creativeLookCaptureDeps) {
    prepareArtisticCreativeLookForCapture(captureCtx, deps.creativeLookCaptureDeps);
  }
}

/**
 * @param {{
 *   backgroundController?: import('../BackgroundController.js').BackgroundController,
 *   environmentController?: import('../EnvironmentController.js').EnvironmentController,
 * }} deps
 */
export function restoreCaptureFeatures(deps) {
  deps.environmentController?.restoreAfterCapture?.();
  deps.backgroundController?.gradientController?.restoreAfterCapture?.();
}
