import * as THREE from 'three';
import { encodeCanvasToBlob } from '../render/encodeImageBlob.js';
import { renderFrameForCaptureWithPins } from '../render/capture/renderFrameForCapture.js';
import { CaptureFeatureSession } from '../render/capture/captureFeatureHooks.js';
import { LOOK_FILTER_BAKE_PRESET_IDS } from '../render/lookFilterPresets.js';
import {
  applyLookFilterPreset,
  captureLookFilterSnapshot,
  restoreLookFilterSnapshot,
} from '../ui/lookFilterApply.js';

const DEV_ENDPOINT = '/__dev__/look-filter-thumbnail';

/** @type {WeakMap<HTMLImageElement, string>} */
const bakedThumbObjectUrls = new WeakMap();

/** @param {string[]} presets @param {{ cacheKey?: number, bytesByPreset?: Record<string, Uint8Array | Blob> }} [options] */
function refreshLookFilterThumbnailImages(presets, options = {}) {
  const cacheKey = options.cacheKey ?? Date.now();
  const bytesByPreset = options.bytesByPreset ?? {};

  for (const preset of presets) {
    const bakedBytes = bytesByPreset[preset];
    let url = `./assets/images/look-filters/${preset}.png?v=${cacheKey}`;
    let objectUrl = null;

    if (bakedBytes) {
      const blob = bakedBytes instanceof Blob
        ? bakedBytes
        : new Blob([bakedBytes], { type: 'image/png' });
      objectUrl = URL.createObjectURL(blob);
      url = objectUrl;
    }

    document.querySelectorAll(`[data-look-filter="${preset}"] img.look-filter-tile__thumb`).forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      const prevObjectUrl = bakedThumbObjectUrls.get(img);
      if (prevObjectUrl) {
        URL.revokeObjectURL(prevObjectUrl);
        bakedThumbObjectUrls.delete(img);
      }

      img.dataset.src = `./assets/images/look-filters/${preset}.png`;
      img.removeAttribute('loading');
      img.src = '';
      img.src = url;

      if (objectUrl) {
        bakedThumbObjectUrls.set(img, objectUrl);
      }
    });
  }
}

/** @param {string} detail @param {number} status */
function formatLookFilterBakeHttpError(detail, status) {
  const trimmed = (detail || '').trim();
  if (status === 405) {
    return 'Look filter thumbnail endpoint is missing — restart `npm run dev` (the running server is probably stale).';
  }
  return trimmed || `HTTP ${status}`;
}

/** @param {number} [count] */
function waitFrames(count = 1) {
  return new Promise((resolve) => {
    const step = (remaining) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(Math.max(1, count));
  });
}

/** @param {import('../SceneManager.js').SceneManager} scene */
async function captureViewportPngBlob(scene) {
  const imageExporter = scene.imageExporter;
  const renderer = scene.renderer;
  if (!imageExporter || !renderer) {
    throw new Error('Renderer not ready — load a mesh and wait for the studio to finish booting.');
  }

  const db = new THREE.Vector2();
  renderer.getDrawingBufferSize(db);
  const width = Math.max(1, Math.round(db.x));
  const height = Math.max(1, Math.round(db.y));

  scene.controls?.update?.();

  const captureFeatures = new CaptureFeatureSession({
    backgroundController: scene.backgroundController,
    environmentController: scene.environmentController,
  });
  captureFeatures.startCapture(() => scene.hdriRotation ?? 0);
  try {
    renderFrameForCaptureWithPins({
      renderer,
      scene: scene.scene,
      camera: scene.camera,
      composer: scene.composer,
      imageExporter,
      composerLifecycle: scene.composerLifecycle,
      backgroundController: scene.backgroundController,
      environmentController: scene.environmentController,
      captureFeatureSession: captureFeatures,
      width,
      height,
      transparent: false,
    });
  } finally {
    captureFeatures.restore();
  }

  const gl = renderer.getContext();
  gl?.finish?.();

  const canvas = imageExporter._captureComposerOutputAsCanvas(width, height);
  if (!canvas) {
    throw new Error('Viewport capture failed (composer readback returned empty).');
  }
  return encodeCanvasToBlob(canvas, 'png');
}

/**
 * Bake Look Filter thumbnails from the current mesh, camera, and scene setup.
 *
 * Requires `npm run dev` (writes via POST to the local dev server).
 *
 * @param {{
 *   size?: number,
 *   presets?: string[],
 *   settleFrames?: number,
 *   dryRun?: boolean,
 *   serverUrl?: string,
 * }} [options]
 */
export async function bakeLookFilterThumbnails(options = {}) {
  const orby = window.orby;
  if (!orby?.scene || !orby?.stateStore) {
    throw new Error('Orby is not ready.');
  }

  const { scene, stateStore, ui, eventBus } = orby;
  await ui?.ensureStudioUiReady?.();

  if (!scene.currentModel) {
    throw new Error('Load a mesh first, frame the shot, then run the bake.');
  }
  if (!scene.isStudioReady || !scene.imageExporter) {
    throw new Error('WebGL studio is still booting — wait a moment and try again.');
  }

  const size = Math.max(32, Math.min(512, Number(options.size) || 192));
  const settleFrames = Math.max(1, Math.round(Number(options.settleFrames) || 4));
  const dryRun = options.dryRun === true;
  const serverUrl = (options.serverUrl || window.location.origin).replace(/\/$/, '');
  const presets = Array.isArray(options.presets) && options.presets.length
    ? options.presets.filter((id) => LOOK_FILTER_BAKE_PRESET_IDS.includes(id))
    : [...LOOK_FILTER_BAKE_PRESET_IDS];

  if (!presets.length) {
    throw new Error('No valid presets to bake.');
  }

  const originalSnapshot = captureLookFilterSnapshot(stateStore);
  const results = [];
  let failed = 0;

  console.info(
    `[Orby dev] Baking ${presets.length} look filter thumbnail(s) at ${size}px…`,
  );
  ui?.showToast?.(`Baking ${presets.length} look filter thumbnails…`, 2400, {
    notification: false,
  });

  try {
    for (let i = 0; i < presets.length; i += 1) {
      const preset = presets[i];
      const label = `${i + 1}/${presets.length} ${preset}`;
      console.info(`[Orby dev] ${label}`);

      applyLookFilterPreset({
        eventBus,
        stateStore,
        ui,
        presetId: preset,
        silent: true,
      });

      await waitFrames(settleFrames);
      scene.render();
      await waitFrames(2);
      scene.render();

      const blob = await captureViewportPngBlob(scene);

      if (dryRun) {
        results.push({ preset, ok: true, dryRun: true, bytes: blob.size });
        continue;
      }

      const url = `${serverUrl}${DEV_ENDPOINT}?preset=${encodeURIComponent(preset)}&size=${size}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: blob,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        failed += 1;
        const error = formatLookFilterBakeHttpError(detail, response.status);
        results.push({ preset, ok: false, error });
        console.error(`[Orby dev] ${preset} failed:`, error);
        continue;
      }

      const saved = await response.json();
      results.push({ preset, ok: true, ...saved });
      console.info(`[Orby dev] saved ${saved.filename} (${saved.bytes} B)`);

      if (saved.thumbBase64) {
        const binary = Uint8Array.from(atob(saved.thumbBase64), (char) => char.charCodeAt(0));
        refreshLookFilterThumbnailImages([preset], { bytesByPreset: { [preset]: binary } });
      } else {
        refreshLookFilterThumbnailImages([preset], { cacheKey: Date.now() });
      }
    }
  } finally {
    restoreLookFilterSnapshot({
      eventBus,
      stateStore,
      ui,
      snapshot: originalSnapshot,
      silent: true,
    });
  }

  const savedCount = results.filter((r) => r.ok && !r.dryRun).length;
  const savedPresets = results.filter((r) => r.ok && !r.dryRun).map((r) => r.preset);
  if (savedPresets.length) {
    refreshLookFilterThumbnailImages(savedPresets, { cacheKey: Date.now() });
    ui?.renderControls?.refreshLookFilterThumbs?.(savedPresets, Date.now());
  }

  if (!dryRun && failed === presets.length) {
    const firstError = results.find((entry) => entry.error)?.error;
    throw new Error(firstError || 'All look filter thumbnail saves failed.');
  }
  const summary = dryRun
    ? `Dry run: captured ${results.length} frame(s).`
    : `Saved ${savedCount}/${presets.length} look filter thumbnails to assets/images/look-filters/.`;

  console.info(`[Orby dev] Done. ${summary}`);
  ui?.showToast?.(summary, 4200, {
    notification: false,
    icon: failed ? 'warning' : 'success',
  });

  return { size, presets, results, failed, savedCount, dryRun };
}
