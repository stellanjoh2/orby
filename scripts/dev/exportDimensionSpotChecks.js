/**
 * Dev-only export dimension spot checks — runs offline capture probes (no download).
 * Console: `await orby.dev.runExportDimensionSpotChecks()`
 */
import { getDrawingBufferPixels } from '../render/drawingBufferSize.js';
import {
  buildCaptureDebugTuple,
  captureReadback,
} from '../render/capture/captureReadback.js';
import { runOfflineCaptureSession } from '../render/capture/OfflineCaptureSession.js';
import {
  resolvePngExportCaptureSize,
  resolveVideoExportCaptureSize,
} from '../render/capture/CaptureSizePolicy.js';
import * as THREE from 'three';

const DEFAULT_TIERS = ['max', 'medium', 'low'];
const DEFAULT_VIDEO_RESOLUTIONS = ['1080p', '1440p', '2160p'];
const DEFAULT_PNG_SCALES = [1, 2];

/**
 * @typedef {object} SpotCheckResult
 * @property {string} id
 * @property {boolean} ok
 * @property {string} [error]
 * @property {Record<string, unknown>} [debug]
 */

/**
 * @param {import('../SceneManager.js').SceneManager} sceneManager
 * @param {{
 *   tiers?: string[],
 *   videoResolutions?: string[],
 *   pngScales?: number[],
 *   gradient?: boolean,
 *   onProgress?: (result: SpotCheckResult) => void,
 * }} [options]
 */
export async function runExportDimensionSpotChecks(sceneManager, options = {}) {
  if (!sceneManager?.currentModel) {
    throw new Error('Load a mesh in the studio before running dimension spot checks.');
  }
  if (!sceneManager.imageExporter?.composer) {
    throw new Error('Composer not ready — wait for studio init.');
  }

  const tiers = options.tiers ?? DEFAULT_TIERS;
  const videoResolutions = options.videoResolutions ?? DEFAULT_VIDEO_RESOLUTIONS;
  const pngScales = options.pngScales ?? DEFAULT_PNG_SCALES;
  const onProgress = options.onProgress ?? (() => {});

  const stateStore = sceneManager.stateStore;
  const originalQuality = stateStore.getState().renderQuality;
  const originalGradientEnabled = stateStore.getState().backgroundGradient?.enabled;
  const viewportBefore = new THREE.Vector2();
  sceneManager.renderer.getSize(viewportBefore);
  const dprBefore = sceneManager.renderer.getPixelRatio();

  /** @type {SpotCheckResult[]} */
  const results = [];

  const setTier = (tier) => {
    stateStore.set('renderQuality', tier);
    sceneManager.applyRenderQualitySettings();
  };

  if (options.gradient === true && !originalGradientEnabled) {
    stateStore.set('backgroundGradient', {
      ...stateStore.getState().backgroundGradient,
      enabled: true,
    });
    sceneManager.backgroundGradientController?.applyIfActive?.();
  }

  try {
    for (const tier of tiers) {
      setTier(tier);

      for (const scale of pngScales) {
        const captureSize = resolvePngExportCaptureSize(
          sceneManager.renderer,
          scale,
          sceneManager.imageExporter._maxExportPixelArea ?? null,
        );
        const id = `png-${tier}-${scale}x`;
        const result = await probeCapture(sceneManager, captureSize, id);
        results.push(result);
        onProgress(result);
      }

      for (const resolution of videoResolutions) {
        const captureSize = resolveVideoExportCaptureSize(resolution);
        const id = `video-${tier}-${resolution}`;
        const result = await probeCapture(sceneManager, captureSize, id);
        results.push(result);
        onProgress(result);
      }
    }

    const viewportAfter = new THREE.Vector2();
    sceneManager.renderer.getSize(viewportAfter);
    const restoreOk =
      Math.abs(viewportAfter.x - viewportBefore.x) < 0.5
      && Math.abs(viewportAfter.y - viewportBefore.y) < 0.5
      && Math.abs(sceneManager.renderer.getPixelRatio() - dprBefore) < 0.01;
    const restoreResult = {
      id: 'viewport-restore',
      ok: restoreOk,
      debug: {
        before: { w: viewportBefore.x, h: viewportBefore.y, dpr: dprBefore },
        after: {
          w: viewportAfter.x,
          h: viewportAfter.y,
          dpr: sceneManager.renderer.getPixelRatio(),
        },
      },
    };
    results.push(restoreResult);
    onProgress(restoreResult);
  } finally {
    setTier(originalQuality);
    if (options.gradient === true && !originalGradientEnabled) {
      stateStore.set('backgroundGradient', {
        ...stateStore.getState().backgroundGradient,
        enabled: false,
      });
      sceneManager.backgroundGradientController?.applyIfActive?.();
    }
    sceneManager.handleResize?.();
  }

  const passed = results.every((r) => r.ok);
  const summary = {
    passed,
    total: results.length,
    failed: results.filter((r) => !r.ok).map((r) => r.id),
  };
  console.info('[Orby dev] export dimension spot checks', summary, results);
  return { ...summary, results };
}

/**
 * @param {import('../SceneManager.js').SceneManager} sceneManager
 * @param {import('../render/capture/captureContext.js').CaptureSize} captureSize
 * @param {string} id
 * @returns {Promise<SpotCheckResult>}
 */
async function probeCapture(sceneManager, captureSize, id) {
  const imageExporter = sceneManager.imageExporter;
  try {
    return await runOfflineCaptureSession(
      imageExporter._captureSessionDeps(),
      async (session) => {
        const synced = session.applyCaptureSize(captureSize);
        session.renderFrame({ transparent: false });

        const gl = imageExporter.renderer.getContext();
        if (gl && typeof gl.finish === 'function') {
          gl.finish();
        }

        const read = captureReadback(
          {
            renderer: imageExporter.renderer,
            composer: imageExporter.composer,
            ensureComposerMatchesDrawingBuffer: (o) =>
              imageExporter._ensureComposerMatchesDrawingBuffer(o),
          },
          {
            width: synced.width,
            height: synced.height,
            retryRender: () => session.renderFrame({ transparent: false }),
          },
        );

        const db = getDrawingBufferPixels(imageExporter.renderer);
        const debug = buildCaptureDebugTuple(
          { renderer: imageExporter.renderer, composer: imageExporter.composer },
          synced.width,
          synced.height,
          { readbackW: read.width, readbackH: read.height },
        );

        const ok =
          read.width === synced.width
          && read.height === synced.height
          && db.width === synced.width
          && db.height === synced.height
          && debug.composerRTW === synced.width
          && debug.composerRTH === synced.height;

        return { id, ok, debug };
      },
    );
  } catch (error) {
    return {
      id,
      ok: false,
      error: error?.message ?? String(error),
      debug: error?.debug ?? undefined,
    };
  }
}

/**
 * Size-policy only — no WebGL; safe before a model is loaded.
 */
export function summarizeCaptureSizeMatrix(renderer) {
  const tiers = DEFAULT_TIERS;
  const rows = [];
  for (const tier of tiers) {
    for (const scale of DEFAULT_PNG_SCALES) {
      rows.push({
        kind: 'png',
        tier,
        scale,
        ...resolvePngExportCaptureSize(
          renderer,
          scale,
          null,
        ),
      });
    }
    for (const resolution of DEFAULT_VIDEO_RESOLUTIONS) {
      rows.push({
        kind: 'video',
        tier,
        resolution,
        ...resolveVideoExportCaptureSize(resolution),
      });
    }
  }
  return rows;
}

/** @param {import('../SceneManager.js').SceneManager} sceneManager */
export function logCaptureSizeMatrix(sceneManager) {
  const renderer = sceneManager?.renderer;
  if (!renderer) {
    console.warn('[Orby dev] renderer not ready');
    return [];
  }
  const rows = summarizeCaptureSizeMatrix(renderer);
  console.table(rows);
  return rows;
}
