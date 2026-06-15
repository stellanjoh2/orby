import * as THREE from 'three';
import { CREATIVE_LOOK_PRESETS } from '../render/CreativeLookMaterials.js';
import { encodeCanvasToBlob } from '../render/encodeImageBlob.js';

const DEV_ENDPOINT = '/__dev__/creative-look-thumbnail';

/** @param {string[]} presets @param {number} [cacheKey] */
function refreshCreativeLookThumbnailImages(presets, cacheKey = Date.now()) {
  for (const preset of presets) {
    const pngUrl = `./assets/images/creative-look-${preset}.png?v=${cacheKey}`;
    document.querySelectorAll(`[data-creative-look="${preset}"] img`).forEach((img) => {
      img.src = pngUrl;
    });
  }
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

  const prevComposerRenderToScreen = scene.composer?.renderToScreen;
  if (scene.composer) {
    scene.composer.renderToScreen = false;
  }

  try {
    imageExporter._ensureComposerMatchesDrawingBuffer?.({ strict: true });
    imageExporter._setExportViewport?.(width, height);
    if (typeof scene.composerLifecycle?.renderComposerPassForExport === 'function') {
      scene.composerLifecycle.renderComposerPassForExport();
    } else if (scene.composer) {
      scene.composer.render();
    } else {
      renderer.render(scene.scene, scene.camera);
    }
  } finally {
    if (scene.composer && prevComposerRenderToScreen !== undefined) {
      scene.composer.renderToScreen = prevComposerRenderToScreen;
    }
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
 * Bake Shader Lab thumbnails from the current mesh, camera, and scene setup.
 *
 * Requires `npm run dev` (writes via POST to the local dev server).
 *
 * @param {{
 *   size?: number,
 *   presets?: string[],
 *   animationSeconds?: number,
 *   settleFrames?: number,
 *   dryRun?: boolean,
 *   serverUrl?: string,
 * }} [options]
 */
export async function bakeCreativeLookThumbnails(options = {}) {
  const orby = window.orby;
  if (!orby?.scene || !orby?.stateStore) {
    throw new Error('Orby is not ready.');
  }

  const { scene, stateStore, ui } = orby;
  await ui?.ensureStudioUiReady?.();

  if (!scene.currentModel) {
    throw new Error('Load a mesh first, frame the shot, then run the bake.');
  }
  if (!scene.isStudioReady || !scene.imageExporter) {
    throw new Error('WebGL studio is still booting — wait a moment and try again.');
  }

  const size = Math.max(32, Math.min(512, Number(options.size) || 192));
  const animationSeconds = Math.max(0, Number(options.animationSeconds) || 1.25);
  const settleFrames = Math.max(1, Math.round(Number(options.settleFrames) || 4));
  const dryRun = options.dryRun === true;
  const serverUrl = (options.serverUrl || window.location.origin).replace(/\/$/, '');
  const presets = Array.isArray(options.presets) && options.presets.length
    ? options.presets.filter((id) => CREATIVE_LOOK_PRESETS.includes(id))
    : [...CREATIVE_LOOK_PRESETS];

  if (!presets.length) {
    throw new Error('No valid presets to bake.');
  }

  const originalCreativeLook = structuredClone(stateStore.getState().creativeLook ?? {});
  const results = [];
  let failed = 0;

  console.info(
    `[Orby dev] Baking ${presets.length} creative look thumbnail(s) at ${size}px…`,
  );
  ui?.showToast?.(`Baking ${presets.length} shader thumbnails…`, 2400, {
    notification: false,
  });

  try {
    for (let i = 0; i < presets.length; i += 1) {
      const preset = presets[i];
      const label = `${i + 1}/${presets.length} ${preset}`;
      console.info(`[Orby dev] ${label}`);

      const nextCreativeLook = {
        ...stateStore.getState().creativeLook,
        enabled: true,
        preset,
        pauseShaderAnimations: false,
      };

      stateStore.batch(() => {
        stateStore.set('creativeLook.enabled', true);
        stateStore.set('creativeLook.preset', preset);
        stateStore.set('creativeLook.pauseShaderAnimations', false);
      });

      await scene.applyCreativeLookFromState(nextCreativeLook, { skipStateStore: true });
      scene.materialController?.updateCreativeLookTime?.(animationSeconds);

      await waitFrames(settleFrames);
      scene.render();
      await waitFrames(2);

      stateStore.set('creativeLook.pauseShaderAnimations', true);
      scene.materialController?.updateCreativeLookTime?.(animationSeconds);
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
        results.push({ preset, ok: false, error: detail || response.statusText });
        console.error(`[Orby dev] ${preset} failed:`, detail || response.statusText);
        continue;
      }

      const saved = await response.json();
      results.push({ preset, ok: true, ...saved });
      console.info(`[Orby dev] saved ${saved.filename} (${saved.bytes} B)`);
    }
  } finally {
    stateStore.set('creativeLook', originalCreativeLook);
    await scene.applyCreativeLookFromState(originalCreativeLook, { skipStateStore: true });
    ui?.setCreativeLookActive?.(originalCreativeLook.preset);
  }

  const savedCount = results.filter((r) => r.ok && !r.dryRun).length;
  const savedPresets = results.filter((r) => r.ok).map((r) => r.preset);
  if (savedPresets.length) {
    refreshCreativeLookThumbnailImages(savedPresets);
  }
  const summary = dryRun
    ? `Dry run: captured ${results.length} frame(s).`
    : `Saved ${savedCount}/${presets.length} thumbnails to assets/images/.`;

  console.info(`[Orby dev] Done. ${summary}`);
  ui?.showToast?.(summary, 4200, {
    notification: false,
    icon: failed ? 'warning' : 'success',
  });

  return { size, presets, results, failed, savedCount, dryRun };
}
