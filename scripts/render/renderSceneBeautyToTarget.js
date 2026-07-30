import * as THREE from 'three';
import { APP_BACKGROUND } from '../constants.js';
import { getDrawingBufferPixels } from './drawingBufferSize.js';
import { ensureExportCapturePixelRatio } from './capture/forceExportCaptureFramebuffer.js';
import {
  pinRenderTargetPhysicalViewport,
  resetRendererFullViewport,
} from './resetRendererFullViewport.js';

/**
 * @param {{
 *   backgroundController?: import('./BackgroundController.js').BackgroundController | null,
 *   backgroundGradientController?: import('./backgroundGradient/BackgroundGradientController.js').BackgroundGradientController | null,
 * }} sources
 * @returns {{
 *   usesFallbackBackdrop: boolean,
 *   useGpuGradientBlit: boolean,
 *   keepSceneBackgroundTexture: boolean,
 *   clearColor: string | number | null,
 * }}
 */
export function resolveStudioBackdropForBeauty(sources = {}) {
  const gradientCtrl = sources.backgroundGradientController ?? null;
  const bgCtrl = sources.backgroundController ?? gradientCtrl?.backgroundController ?? null;
  if (bgCtrl?.usesFallbackBackdrop?.() !== true) {
    return {
      usesFallbackBackdrop: false,
      useGpuGradientBlit: false,
      keepSceneBackgroundTexture: false,
      clearColor: null,
    };
  }
  // Match BackgroundController.refreshAppearance: image → gradient → solid.
  // Image uses scene.background = Texture; MeshglRenderPass must not strip it.
  if (bgCtrl.imageController?.isActive?.() === true) {
    return {
      usesFallbackBackdrop: true,
      useGpuGradientBlit: false,
      keepSceneBackgroundTexture: true,
      clearColor: bgCtrl.imageController.getFallbackColor?.() ?? APP_BACKGROUND,
    };
  }
  if (gradientCtrl?.isActive?.() === true) {
    return {
      usesFallbackBackdrop: true,
      useGpuGradientBlit: gradientCtrl.shouldGpuBlitGradient?.() === true,
      keepSceneBackgroundTexture: false,
      clearColor: gradientCtrl.getFallbackColor?.() ?? APP_BACKGROUND,
    };
  }
  if (bgCtrl.solidEnabled === false) {
    return {
      usesFallbackBackdrop: true,
      useGpuGradientBlit: false,
      keepSceneBackgroundTexture: false,
      clearColor: null,
    };
  }
  return {
    usesFallbackBackdrop: true,
    useGpuGradientBlit: false,
    keepSceneBackgroundTexture: false,
    clearColor: bgCtrl.getColor?.() ?? APP_BACKGROUND,
  };
}

/**
 * Geometry-only scene draw for N8AO's beauty depth buffer (MeshglN8AOPass).
 * Always strips `scene.background` so HDRI / clear plates do not write depth — AO must not
 * run on the backdrop. Backdrop colour is copied from MeshglRenderPass after this pass.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {import('three').WebGLRenderTarget | null} renderTarget
 * @param {{
 *   resolveBackgroundGradientController?: (() => unknown) | null,
 *   resolveBackgroundController?: (() => unknown) | null,
 *   clearAlpha?: number,
 *   clear?: boolean,
 * }} [opts]
 */
export function renderSceneBeautyToTarget(renderer, scene, camera, renderTarget, opts = {}) {
  const {
    resolveBackgroundGradientController = null,
    resolveBackgroundController = null,
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
  const backgroundController =
    typeof resolveBackgroundController === 'function'
      ? resolveBackgroundController()
      : null;
  const backdrop = resolveStudioBackdropForBeauty({
    backgroundGradientController: gradientCtrl,
    backgroundController,
  });
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

    // Geometry-only — HDRI / gradient / clear must not write depth into N8AO's beauty plate.
    savedSceneBackground = scene.background;
    scene.background = null;

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
        // Match MeshglRenderPass — always clear colour (autoClearColor can be false after bloom).
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
