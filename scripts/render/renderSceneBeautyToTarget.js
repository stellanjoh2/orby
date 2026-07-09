import * as THREE from 'three';
import { APP_BACKGROUND } from '../constants.js';
import { getDrawingBufferPixels } from './drawingBufferSize.js';
import { ensureExportCapturePixelRatio } from './capture/forceExportCaptureFramebuffer.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from './resetRendererFullViewport.js';

/**
 * @param {import('./backgroundGradient/BackgroundGradientController.js').BackgroundGradientController | null | undefined} gradientCtrl
 * @returns {{ usesFallbackBackdrop: boolean, useGpuGradientBlit: boolean, clearColor: string | null }}
 */
function resolveStudioBackdropForBeauty(gradientCtrl) {
  const bgCtrl = gradientCtrl?.backgroundController ?? null;
  if (bgCtrl?.usesFallbackBackdrop?.() !== true) {
    return { usesFallbackBackdrop: false, useGpuGradientBlit: false, clearColor: null };
  }
  if (gradientCtrl?.isActive?.() === true) {
    return {
      usesFallbackBackdrop: true,
      useGpuGradientBlit: gradientCtrl.shouldGpuBlitGradient?.() === true,
      clearColor: gradientCtrl.getFallbackColor?.() ?? APP_BACKGROUND,
    };
  }
  if (bgCtrl.solidEnabled === false) {
    return { usesFallbackBackdrop: true, useGpuGradientBlit: false, clearColor: null };
  }
  return {
    usesFallbackBackdrop: true,
    useGpuGradientBlit: false,
    clearColor: bgCtrl.getColor?.() ?? APP_BACKGROUND,
  };
}

/**
 * Scene beauty draw with Meshgl background handling (opaque clear alpha, gradient blit).
 * N8AOPass calls `renderer.render` directly and skips MeshglRenderPass — sky pixels stay black
 * unless we clear/blit the same way before AO samples the beauty buffer.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {import('three').WebGLRenderTarget | null} renderTarget
 * @param {{
 *   resolveBackgroundGradientController?: (() => unknown) | null,
 *   clearAlpha?: number,
 *   clear?: boolean,
 * }} [opts]
 */
export function renderSceneBeautyToTarget(renderer, scene, camera, renderTarget, opts = {}) {
  const {
    resolveBackgroundGradientController = null,
    clearAlpha = 1,
    clear = true,
  } = opts;

  const savedCameraViewport = camera?.viewport;
  if (camera && savedCameraViewport !== undefined) {
    camera.viewport = undefined;
  }

  const oldAutoClear = renderer.autoClear;
  renderer.autoClear = false;

  const oldClearColor = renderer.getClearColor(new THREE.Color());
  const oldClearAlpha = renderer.getClearAlpha();
  renderer.setClearAlpha(clearAlpha);

  const gradientCtrl =
    typeof resolveBackgroundGradientController === 'function'
      ? resolveBackgroundGradientController()
      : null;
  const backdrop = resolveStudioBackdropForBeauty(gradientCtrl);
  const captureBlit = gradientCtrl?.shouldBlitForCapture?.() === true;

  let savedSceneBackground = null;
  try {
    if (captureBlit) {
      ensureExportCapturePixelRatio({ renderer, composer: null });
    }

    const resetViewport = () => {
      if (captureBlit) {
        ensureExportCapturePixelRatio({ renderer, composer: null });
        const rt = renderer.getRenderTarget();
        if (rt?.width > 0 && rt?.height > 0) {
          pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
        } else {
          const { width, height } = getDrawingBufferPixels(renderer);
          pinRenderTargetPhysicalViewport(renderer, width, height);
        }
      } else {
        resetRendererFullViewport(renderer);
      }
    };

    if (backdrop.usesFallbackBackdrop) {
      savedSceneBackground = scene.background;
      scene.background = null;
    }

    resetViewport();
    renderer.setRenderTarget(renderTarget);
    resetViewport();

    const blitGradient = () => {
      if (!backdrop.useGpuGradientBlit || !gradientCtrl) return;
      gradientCtrl.syncToDrawingBuffer(undefined, undefined, { forceRedraw: true });
      gradientCtrl.blitFullViewport(renderer);
    };

    if (clear) {
      if (backdrop.useGpuGradientBlit) {
        renderer.clear(false, true, true);
        blitGradient();
      } else if (backdrop.clearColor) {
        renderer.setClearColor(new THREE.Color(backdrop.clearColor), clearAlpha);
        renderer.clear(true, true, true);
      } else {
        renderer.clear(true, true, true);
      }
    } else if (backdrop.useGpuGradientBlit) {
      blitGradient();
    } else if (backdrop.clearColor) {
      renderer.setClearColor(new THREE.Color(backdrop.clearColor), clearAlpha);
    }

    resetViewport();
    renderer.render(scene, camera);
  } finally {
    if (savedSceneBackground !== null) {
      scene.background = savedSceneBackground;
    }
    renderer.setClearColor(oldClearColor, oldClearAlpha);
    renderer.setClearAlpha(clearAlpha);
    renderer.autoClear = oldAutoClear;
    if (camera && savedCameraViewport !== undefined) {
      camera.viewport = savedCameraViewport;
    }
    if (captureBlit) {
      const rt = renderer.getRenderTarget();
      if (rt?.width > 0 && rt?.height > 0) {
        pinRenderTargetPhysicalViewport(renderer, rt.width, rt.height);
      } else {
        const { width, height } = getDrawingBufferPixels(renderer);
        pinRenderTargetPhysicalViewport(renderer, width, height);
      }
    } else {
      resetRendererFullViewport(renderer);
    }
  }
}
