import * as THREE from 'three';
import { getComposerOutputRenderTarget } from '../composerOutputBuffer.js';
import { pinRendererViewportLogical } from '../resetRendererFullViewport.js';

/** @param {import('three').WebGLRenderer} renderer @param {number} width @param {number} height */
export function pinRenderTargetViewport(renderer, width, height) {
  pinRendererViewportLogical(renderer, width, height);
}

/**
 * Opaque export — gradient canvas (2D, exact export size) under post-processed RGB using scene alpha.
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
  const merged = new Uint8ClampedArray(width * height * 4);
  const rowStride = width * 4;

  for (let y = 0; y < height; y += 1) {
    const glRow = (height - 1 - y) * rowStride;
    const dstRow = y * rowStride;
    for (let x = 0; x < width; x += 1) {
      const i = x * 4;
      const gi = dstRow + i;
      const ai = glRow + i;
      const a = alphaPixels[ai + 3] / 255;
      const gr = gradientRgba[gi];
      const gg = gradientRgba[gi + 1];
      const gb = gradientRgba[gi + 2];

      if (a <= 0) {
        merged[gi] = gr;
        merged[gi + 1] = gg;
        merged[gi + 2] = gb;
        merged[gi + 3] = 255;
      } else if (a >= 1) {
        merged[gi] = postPixels[ai];
        merged[gi + 1] = postPixels[ai + 1];
        merged[gi + 2] = postPixels[ai + 2];
        merged[gi + 3] = 255;
      } else {
        const pr = postPixels[ai];
        const pg = postPixels[ai + 1];
        const pb = postPixels[ai + 2];
        merged[gi] = Math.round(pr * a + gr * (1 - a));
        merged[gi + 1] = Math.round(pg * a + gg * (1 - a));
        merged[gi + 2] = Math.round(pb * a + gb * (1 - a));
        merged[gi + 3] = 255;
      }
    }
  }

  return merged;
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
  const {
    renderer,
    scene,
    camera,
    composer,
    width,
    height,
    getGradientRgba,
    renderFrame,
    finishGpu,
  } = deps;

  const gradientRgba = getGradientRgba();
  if (!gradientRgba || gradientRgba.length < width * height * 4) {
    throw new Error('Gradient capture buffer missing or wrong size');
  }

  if (!composer) {
    renderFrame();
    finishGpu?.();
    const canvas = renderer.domElement;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    return new Uint8ClampedArray(imageData.data);
  }

  const previousRenderToScreen = composer.renderToScreen;
  composer.renderToScreen = false;
  let postPixels = null;
  try {
    renderFrame();
    finishGpu?.();

    const byteRT = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    try {
      postPixels = new Uint8Array(width * height * 4);
      composer.copyPass.render(
        renderer,
        byteRT,
        getComposerOutputRenderTarget(composer),
        0,
        false,
      );
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
  try {
    renderer.setRenderTarget(alphaRT);
    pinRenderTargetViewport(renderer, width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    alphaPixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(alphaRT, 0, 0, width, height, alphaPixels);
  } finally {
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
