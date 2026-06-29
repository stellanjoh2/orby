import { coerceRendererLogicalSize } from '../drawingBufferSize.js';
import { resetRendererFullViewport } from '../resetRendererFullViewport.js';

/**
 * After offline export / capture preview, the GL viewport can stay pinned to export
 * resolution (e.g. 1920×1080) while Ultra restores a larger drawing buffer — the
 * gradient blit only fills that sub-rect. Resync size, clear capture pins, viewport,
 * and gradient canvas to the interactive studio dimensions.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer?: { clearExportCaptureViewportPin?: () => void },
 *   logicalWidth: number,
 *   logicalHeight: number,
 *   pixelRatio: number,
 *   syncPostProcessingForLogicalSize?: (w: number, h: number) => void,
 *   ensureComposerBuffersMatchRenderer?: () => void,
 *   backgroundController?: import('../BackgroundController.js').BackgroundController,
 * }} deps
 */
export function repairInteractiveViewportAfterCapture(deps) {
  const {
    renderer,
    composer,
    logicalWidth,
    logicalHeight,
    pixelRatio,
    syncPostProcessingForLogicalSize,
    ensureComposerBuffersMatchRenderer,
    backgroundController,
  } = deps;

  composer?.clearExportCaptureViewportPin?.();

  backgroundController?.gradientController?.clearCaptureMode?.();

  coerceRendererLogicalSize(renderer, logicalWidth, logicalHeight, pixelRatio);

  syncPostProcessingForLogicalSize?.(
    Math.max(1, Math.round(logicalWidth)),
    Math.max(1, Math.round(logicalHeight)),
  );
  ensureComposerBuffersMatchRenderer?.();

  renderer.setRenderTarget(null);
  resetRendererFullViewport(renderer);

  backgroundController?.gradientController?.restoreAfterCapture?.();

  resetRendererFullViewport(renderer);
}
