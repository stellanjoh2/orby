import * as THREE from 'three';
import { getComposerOutputRenderTarget } from '../composerOutputBuffer.js';
import { ensureExportCapturePixelRatio } from './forceExportCaptureFramebuffer.js';
import { pinRenderTargetPhysicalViewport } from '../resetRendererFullViewport.js';
import { blitComposerOutputToByteTarget } from './capturePostStackOverlays.js';

/** @param {import('three').WebGLRenderer} renderer @param {number} width @param {number} height */
export function pinRenderTargetViewport(renderer, width, height) {
  ensureExportCapturePixelRatio({ renderer, composer: null });
  pinRenderTargetPhysicalViewport(renderer, width, height);
}

/**
 * Opaque export — gradient base layer; post RGB only where scene alpha > 0.
 * Post background (stale partial GL gradient) is never used.
 *
 * @param {Uint8Array | Uint8ClampedArray} postPixels — bottom-up GL read order
 * @param {Uint8Array | Uint8ClampedArray} alphaPixels — bottom-up scene alpha pass
 * @param {Uint8ClampedArray} gradientRgba — top-down canvas row order
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} top-down RGBA, opaque
 */
export function mergeGradientUnderPostRgba(
  postPixels,
  alphaPixels,
  gradientRgba,
  width,
  height,
) {
  const merged = new Uint8ClampedArray(gradientRgba);
  const rowStride = width * 4;

  for (let y = 0; y < height; y += 1) {
    const glRow = (height - 1 - y) * rowStride;
    const dstRow = y * rowStride;
    for (let x = 0; x < width; x += 1) {
      const i = x * 4;
      const gi = dstRow + i;
      const ai = glRow + i;
      const a = alphaPixels[ai + 3] / 255;
      if (a <= 0) continue;

      const pr = postPixels[ai];
      const pg = postPixels[ai + 1];
      const pb = postPixels[ai + 2];

      if (a >= 1) {
        merged[gi] = pr;
        merged[gi + 1] = pg;
        merged[gi + 2] = pb;
      } else {
        merged[gi] = Math.round(pr * a + merged[gi] * (1 - a));
        merged[gi + 1] = Math.round(pg * a + merged[gi + 1] * (1 - a));
        merged[gi + 2] = Math.round(pb * a + merged[gi + 2] * (1 - a));
      }
      merged[gi + 3] = 255;
    }
  }

  return merged;
}

/**
 * Post stack RGB + scene alpha + 2D gradient canvas → opaque top-down RGBA.
 * Caller must have already rendered the composer frame (no GPU gradient blit during capture).
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene,
 *   camera: import('three').Camera,
 *   composer: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   width: number,
 *   height: number,
 *   getGradientRgba: () => Uint8ClampedArray | null,
 *   finishGpu?: () => void,
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 *   getWireframeThickness?: () => number,
 *   getExportViewportReference?: () => object | null,
 *   getStudioPixelRatio?: () => number,
 *   getPreviewPixelRatio?: () => number,
 *   getDisplayPixelRatio?: () => number,
 *   exportScale?: number,
 * }} deps
 * @returns {Uint8ClampedArray}
 */
export function readGradientMergedFromComposerOutput(deps) {
  const {
    renderer,
    scene,
    camera,
    composer,
    width,
    height,
    getGradientRgba,
    finishGpu,
  } = deps;

  const gradientRgba = getGradientRgba();
  if (!gradientRgba || gradientRgba.length < width * height * 4) {
    throw new Error('Gradient capture buffer missing or wrong size');
  }

  finishGpu?.();

  const previousRenderToScreen = composer.renderToScreen;
  composer.renderToScreen = false;
  let postPixels = null;
  try {
    const byteRT = blitComposerOutputToByteTarget(
      deps,
      getComposerOutputRenderTarget(composer),
      width,
      height,
    );
    try {
      postPixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(byteRT, 0, 0, width, height, postPixels);
    } finally {
      byteRT.dispose();
    }
  } finally {
    composer.renderToScreen = previousRenderToScreen;
  }

  const alphaRT = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    samples: renderer.capabilities?.isWebGL2 ? 4 : 0,
  });

  let alphaPixels = null;
  const savedSceneBackground = scene.background;
  try {
    scene.background = null;
    renderer.setRenderTarget(alphaRT);
    pinRenderTargetPhysicalViewport(renderer, alphaRT.width, alphaRT.height);
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    alphaPixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(alphaRT, 0, 0, width, height, alphaPixels);
  } finally {
    scene.background = savedSceneBackground;
    alphaRT.dispose();
  }

  return mergeGradientUnderPostRgba(
    postPixels,
    alphaPixels,
    gradientRgba,
    width,
    height,
  );
}

/**
 * Post stack RGB + scene alpha + 2D gradient canvas → opaque top-down RGBA.
 * Same split read as transparent export; gradient is composited in CPU (WYSIWYG at export size).
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   scene: import('three').Scene,
 *   camera: import('three').Camera,
 *   composer?: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   width: number,
 *   height: number,
 *   getGradientRgba: () => Uint8ClampedArray,
 *   renderFrame: () => void,
 *   finishGpu?: () => void,
 * }} deps
 * @returns {Uint8ClampedArray}
 */
export function readGradientMergedTopDownRgba(deps) {
  const { renderFrame, finishGpu, ...rest } = deps;
  renderFrame();
  finishGpu?.();
  return readGradientMergedFromComposerOutput({ ...rest, finishGpu });
}
