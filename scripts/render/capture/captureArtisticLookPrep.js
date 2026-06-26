import {
  isCreativeLookWatercolourPostActive,
  isCreativeLookGouachePostActive,
  isCreativeLookSketchPostActive,
} from '../../constants.js';
import {
  isSketchColourCreativeLookPreset,
  isSketchCreativeLookPreset,
  normalizeCreativeLookPreset,
  normalizeCreativeLookPatternScale,
  normalizeCreativeLookIntensity,
} from '../CreativeLookMaterials.js';
import { creativeLookWatercolourRadius } from '../creativeLookWatercolourArt.js';
import { resolveCreativeLookSketchParams } from '../creativeLookSketchArt.js';
import { resolveCreativeLookInkParams } from '../creativeLookInkArt.js';

/**
 * @typedef {import('./captureContext.js').CaptureSize & {
 *   transparent?: boolean,
 *   exportTimeSec?: number,
 * }} ArtisticLookCaptureContext
 */

/**
 * @typedef {object} ArtisticLookCaptureDeps
 * @property {import('../PostProcessingPipeline.js').PostProcessingPipeline} [postPipeline]
 * @property {() => object} [getState]
 * @property {() => number} [getCreativeLookAnimationTime]
 */

/**
 * Resolve animated look time — export clock when present, else live viewport clock.
 *
 * @param {ArtisticLookCaptureContext} ctx
 * @param {ArtisticLookCaptureDeps} deps
 */
function resolveCreativeLookTime(ctx, deps) {
  if (Number.isFinite(ctx.exportTimeSec)) {
    return ctx.exportTimeSec;
  }
  return deps.getCreativeLookAnimationTime?.() ?? 0;
}

/**
 * Per-frame Gouache / Watercolour / Sketch post uniforms for offline capture.
 * Shared by live `beforeComposerRender` and `CaptureFeatureSession.prepareFrame`.
 *
 * @param {ArtisticLookCaptureContext} ctx
 * @param {ArtisticLookCaptureDeps} deps
 */
export function prepareArtisticCreativeLookForCapture(ctx, deps) {
  const { postPipeline, getState } = deps;
  if (!postPipeline || typeof getState !== 'function') return;

  const state = getState();
  const time = resolveCreativeLookTime(ctx, deps);
  const cl = state.creativeLook ?? {};
  const presetId = normalizeCreativeLookPreset(cl.preset);
  const patternScale = normalizeCreativeLookPatternScale(
    presetId,
    Number(cl.patternScale),
  );
  const intensity = normalizeCreativeLookIntensity(cl.intensity);

  if (isCreativeLookWatercolourPostActive(state)) {
    const watercolourInk = resolveCreativeLookInkParams(cl.presetParams, 'watercolour');
    postPipeline.updateCreativeLookWatercolour?.({
      patternScale,
      radius: creativeLookWatercolourRadius(patternScale),
      intensity,
      strokeColor: watercolourInk.strokeColor,
      preset: 'watercolour',
    });
  }

  if (isCreativeLookGouachePostActive(state)) {
    const gouacheInk = resolveCreativeLookInkParams(cl.presetParams, 'gouache');
    postPipeline.updateCreativeLookGouache?.({
      time,
      patternScale,
      intensity,
      strokeColor: gouacheInk.strokeColor,
      preset: presetId,
    });
  }

  if (isCreativeLookSketchPostActive(state)) {
    const sketchParams = resolveCreativeLookSketchParams(cl.presetParams, patternScale);
    const sketchInk = resolveCreativeLookInkParams(
      cl.presetParams,
      isSketchColourCreativeLookPreset(presetId) ? 'sketch-colour' : 'sketch',
    );
    const frameSettings = {
      time,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity,
      strokeColor: sketchInk.strokeColor,
      preset: presetId,
    };
    if (isSketchCreativeLookPreset(presetId)) {
      postPipeline.updateCreativeLookSketch?.(frameSettings);
    }
    if (isSketchColourCreativeLookPreset(presetId)) {
      postPipeline.updateCreativeLookSketchColour?.(frameSettings);
    }
  }
}
