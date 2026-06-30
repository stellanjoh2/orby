import { createCaptureContext } from './captureContext.js';
import { prepareCaptureFeatures } from './captureFeatureHooks.js';
import {
  composerRenderTargetsMatchPixels,
  ensureExportCapturePixelRatio,
  forceExportCaptureFramebuffer,
} from './forceExportCaptureFramebuffer.js';
import {
  pinLensDistortionForExportCapture,
  unpinLensDistortionForExportCapture,
} from './capturePostPipelinePins.js';
import { resetRendererFullViewport } from '../resetRendererFullViewport.js';

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

  let captureW = width;
  let captureH = height;
  if (imageExporter?._setExportFramebufferSize) {
    const synced = imageExporter._setExportFramebufferSize(width, height);
    captureW = synced.width;
    captureH = synced.height;
  }

  const renderer = deps.renderer ?? imageExporter?.renderer;
  const composer = imageExporter?.composer;
  const actual = forceExportCaptureFramebuffer(
    {
      renderer,
      composer,
      syncPostProcessingForLogicalSize: imageExporter?.syncPostProcessingForLogicalSize?.bind(
        imageExporter,
      ),
    },
    captureW,
    captureH,
  );
  captureW = actual.width;
  captureH = actual.height;

  if (!composerRenderTargetsMatchPixels(composer, captureW, captureH)) {
    const retry = forceExportCaptureFramebuffer(
      {
        renderer,
        composer,
        syncPostProcessingForLogicalSize: imageExporter?.syncPostProcessingForLogicalSize?.bind(
          imageExporter,
        ),
      },
      captureW,
      captureH,
    );
    captureW = retry.width;
    captureH = retry.height;
  }

  const ctx = createCaptureContext(
    { width: captureW, height: captureH },
    { transparent },
  );

  imageExporter?._ensureComposerMatchesDrawingBuffer?.({ strict: true });
  if (renderer) {
    renderer.setRenderTarget(null);
    resetRendererFullViewport(renderer);
  }

  if (captureFeatureSession) {
    captureFeatureSession.prepareFrame(ctx);
  } else {
    prepareCaptureFeatures(
      { backgroundController, environmentController, creativeLookCaptureDeps },
      ctx,
    );
  }

  ensureExportCapturePixelRatio({ renderer, composer });

  const renderExportPass =
    renderComposerPassForExport
    ?? composerLifecycle?.renderComposerPassForExport?.bind(composerLifecycle);

  const gradientCapture =
    backgroundController?.gradientController?.shouldCompositeGradientOnReadback?.() === true;
  composer?.setExportCapturePhysicalViewport?.(gradientCapture);

  if (typeof renderExportPass === 'function') {
    renderExportPass({ transparent: ctx.transparent });
  } else if (composer) {
    composer.render();
  } else {
    renderer?.render?.(deps.scene, deps.camera);
  }

  composer?.setExportCapturePhysicalViewport?.(false);

  if (renderer) {
    renderer.setRenderTarget(null);
    resetRendererFullViewport(renderer);
  }
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
