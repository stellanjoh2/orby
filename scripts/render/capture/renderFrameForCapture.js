import { createCaptureContext } from './captureContext.js';
import { prepareCaptureFeatures } from './captureFeatureHooks.js';
import {
  pinLensDistortionForExportCapture,
  unpinLensDistortionForExportCapture,
} from './capturePostPipelinePins.js';

/**
 * Canonical offline GL render sequence — one front door for raster capture.
 * Consolidates buffer sync, viewport setup, gradient sync, and composer pass order
 * from `ComposerLifecycle._runComposerWithCreativeLookPrep` callers.
 *
 * @param {import('./captureContext.js').CaptureRenderDeps & {
 *   width: number,
 *   height: number,
 *   transparent?: boolean,
 *   captureFeatureSession?: import('./captureFeatureHooks.js').CaptureFeatureSession,
 *   environmentController?: import('../EnvironmentController.js').EnvironmentController,
 * }} deps
 */
export function renderFrameForCapture(deps) {
  const {
    width,
    height,
    transparent = false,
    imageExporter,
    composerLifecycle,
    renderComposerPassForExport,
    backgroundController,
    captureFeatureSession,
    environmentController,
    creativeLookCaptureDeps,
  } = deps;

  const ctx = createCaptureContext(
    { width, height },
    { transparent },
  );

  imageExporter?._ensureComposerMatchesDrawingBuffer?.({ strict: true });
  imageExporter?._setExportViewport?.(ctx.width, ctx.height);

  if (captureFeatureSession) {
    captureFeatureSession.prepareFrame(ctx);
  } else {
    prepareCaptureFeatures(
      { backgroundController, environmentController, creativeLookCaptureDeps },
      ctx,
    );
  }

  const renderExportPass =
    renderComposerPassForExport
    ?? composerLifecycle?.renderComposerPassForExport?.bind(composerLifecycle);

  if (typeof renderExportPass === 'function') {
    renderExportPass({ transparent: ctx.transparent });
    return ctx;
  }

  const composer = imageExporter?.composer;
  if (composer) {
    composer.render();
    return ctx;
  }

  deps.renderer?.render?.(deps.scene, deps.camera);
  return ctx;
}

/**
 * Lens distortion + composer RT pin, then canonical capture render.
 * @param {import('./captureContext.js').CaptureRenderDeps & {
 *   width: number,
 *   height: number,
 *   transparent?: boolean,
 *   scene?: import('three').Scene,
 *   camera?: import('three').Camera,
 * }} deps
 * @returns {import('./captureContext.js').CaptureSize & { transparent: boolean }}
 */
export function renderFrameForCaptureWithPins(deps) {
  const { imageExporter, composer, postPipeline } = deps;
  const pipeline = postPipeline ?? imageExporter?.postPipeline;
  const prevComposerRenderToScreen = composer?.renderToScreen;
  if (composer) {
    composer.renderToScreen = false;
  }
  const lensCapturePin = pinLensDistortionForExportCapture(pipeline);
  try {
    return renderFrameForCapture(deps);
  } finally {
    unpinLensDistortionForExportCapture(pipeline, lensCapturePin);
    if (composer && prevComposerRenderToScreen !== undefined) {
      composer.renderToScreen = prevComposerRenderToScreen;
    }
  }
}
