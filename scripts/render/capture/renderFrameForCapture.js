import { createCaptureContext } from './captureContext.js';
import { prepareCaptureFeatures } from './captureFeatureHooks.js';
import {
  composerRenderTargetsMatchPixels,
  clearComposerRenderTargets,
  ensureExportCapturePixelRatio,
  forceExportCaptureFramebuffer,
} from './forceExportCaptureFramebuffer.js';
import {
  pinLensDistortionForExportCapture,
  unpinLensDistortionForExportCapture,
} from './capturePostPipelinePins.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from '../resetRendererFullViewport.js';

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
    pinRenderTargetPhysicalViewport(renderer, captureW, captureH);
  }

  if (captureFeatureSession) {
    captureFeatureSession.prepareFrame(ctx);
  } else {
    prepareCaptureFeatures(
      {
        backgroundController,
        environmentController,
        creativeLookCaptureDeps,
        postPipeline: deps.postPipeline ?? imageExporter?.postPipeline,
      },
      ctx,
    );
  }

  ensureExportCapturePixelRatio({ renderer, composer });

  const renderExportPass =
    renderComposerPassForExport
    ?? composerLifecycle?.renderComposerPassForExport?.bind(composerLifecycle);

  // Always pin — bloom/N8AO can leave a partial GL viewport on any offline capture, not only
  // gradient sessions. Unpinned passes draw a center strip; fisheye then leaves black L-margins.
  composer?.setExportCapturePhysicalViewport?.(true);

  if (composer) {
    clearComposerRenderTargets(renderer, composer);
  }

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
  const lensDistortionActive = pipeline?.lensDistortionPass?.enabled === true;
  const prevComposerRenderToScreen = composer?.renderToScreen;
  if (composer) {
    // Fisheye must render to the export drawing buffer (same as live viewport) — RT readback
    // leaves stale gradient margins in ping-pong buffers ("duplicated bg" artifact).
    composer.renderToScreen = lensDistortionActive ? true : false;
  }
  const lensCapturePin = lensDistortionActive
    ? null
    : pinLensDistortionForExportCapture(pipeline);
  try {
    return renderFrameForCapture(deps);
  } finally {
    unpinLensDistortionForExportCapture(pipeline, lensCapturePin);
    if (composer && prevComposerRenderToScreen !== undefined) {
      composer.renderToScreen = prevComposerRenderToScreen;
    }
  }
}
