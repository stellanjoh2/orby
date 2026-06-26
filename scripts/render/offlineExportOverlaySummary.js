import { formatCreativeLookPresetLabel } from './CreativeLookMaterials.js';
import { getImageExportFormat, normalizeImageExportFormat } from './imageExportFormats.js';
import {
  exportSpinToastLabel,
  exportHdriRotationToastLabel,
  normalizeExportVideoMovements,
  normalizeExportSpinSettings,
  normalizeExportHdriRotationSettings,
  normalizeExportMeshAnimationSettings,
} from './exportVideoMovements.js';
import {
  getExportVideoResolutionSize,
  getExportVideoResolutionSummaryLabel,
  normalizeExportVideoAspectRatio,
  normalizeExportVideoResolution,
} from './exportVideoResolution.js';

/** Default export job for dropzone / URL overlay preview. */
export const OFFLINE_EXPORT_OVERLAY_PREVIEW_JOB = {
  format: 'png',
  turntable: true,
  orbit: false,
  zoomIn: false,
  zoomOut: false,
  tiltLeft: false,
  tiltRight: false,
  zoomDistance: 1.5,
  tiltAngle: 15,
  fovOffset: 0,
  pitchOffset: 0,
  durationSec: 5,
  fps: 24,
  resolution: '1080p',
  aspectRatio: '16:9',
  spins: 1,
  subtleSpinDegrees: 0,
  spinDirection: 'forward',
  hdriRotationDegrees: 0,
  movTransparent: false,
  meshAnimationsInclude: false,
  meshAnimationClipIndex: 0,
  clipCount: 0,
};

function fmt(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.round(value * 1000) / 1000);
  }
  return String(value);
}

/** @param {Array<{ label: string, value: string }>} rows */
function addRow(rows, label, value) {
  const text = fmt(value);
  if (text == null) return;
  rows.push({ label, value: text });
}

/** @param {ReturnType<typeof normalizeExportVideoMovements>} movements */
function describeCameraMovement(movements) {
  const parts = [];
  if (movements.turntable) parts.push('Mesh turntable');
  if (movements.orbit) parts.push('Camera orbit');
  if (movements.zoomIn) parts.push(`Dolly in (${movements.zoomDistance}m)`);
  if (movements.zoomOut) parts.push(`Dolly out (${movements.zoomDistance}m)`);
  if (movements.tiltLeft) parts.push(`Tilt left (${movements.tiltAngle}°)`);
  if (movements.tiltRight) parts.push(`Tilt right (${movements.tiltAngle}°)`);
  if (movements.fovOffset) {
    const sign = movements.fovOffset > 0 ? '+' : '';
    parts.push(`FOV ${sign}${movements.fovOffset}°`);
  }
  if (movements.pitchOffset) {
    const sign = movements.pitchOffset > 0 ? '+' : '';
    parts.push(`Pitch ${sign}${movements.pitchOffset}°`);
  }
  return parts.length ? parts.join(' · ') : 'Static';
}

/** @param {Record<string, unknown>} [state] */
function describePostFx(state = {}) {
  const parts = [];
  if (state.bloom?.enabled) parts.push('Bloom');
  if (state.grain?.enabled) parts.push('Film grain');
  if (state.dof?.enabled) parts.push('Depth of field');
  if (state.aberration?.enabled) parts.push('Chromatic aberration');
  if (state.ambientOcclusion?.enabled) parts.push('Ambient occlusion');
  if (state.lensDirt?.enabled) parts.push('Lens dirt');
  if (state.lensFlare?.enabled) parts.push('Lens flare');
  if (state.camera?.vignetteEnabled) parts.push('Vignette');
  if (state.creativeLook?.viewportBloom) parts.push('Look bloom');
  if (state.autoExposure) parts.push('Auto exposure');
  return parts.length ? parts.join(' · ') : 'Standard';
}

/**
 * @param {Record<string, unknown>} [state]
 * @param {{ fisheyeEnabled?: boolean, lensDistortionActive?: boolean }} [lens]
 */
function describeLens(state = {}, lens = {}) {
  if (lens.fisheyeEnabled || state.fisheye?.enabled) return 'Fisheye';
  if (lens.lensDistortionActive) return 'Lens distortion';
  return 'Standard';
}

/** @param {boolean | undefined} enabled @param {unknown} preset */
function describeLook(enabled, preset) {
  if (!enabled) return 'Off';
  return formatCreativeLookPresetLabel(preset);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {number} totalFrames
 */
function estimatePngSequenceSizeLabel(width, height, totalFrames) {
  const w = Math.max(1, Number(width) || 1920);
  const h = Math.max(1, Number(height) || 1080);
  const frames = Math.max(1, Number(totalFrames) || 1);
  const megapixels = (w * h) / 1_000_000;
  const mbPerFrame = Math.max(0.35, megapixels * 0.85);
  const totalMb = mbPerFrame * frames;
  if (totalMb >= 1024) {
    return `~${(totalMb / 1024).toFixed(1)} GB est. (${frames} PNG frames)`;
  }
  return `~${Math.round(totalMb)} MB est. (${frames} PNG frames)`;
}

/**
 * @param {Record<string, unknown>} exportJob
 * @param {string | null | undefined} animationClipLabel
 * @param {Record<string, unknown>} [renderContext]
 */
function buildExportRows(exportJob, animationClipLabel, renderContext = {}) {
  const movements = normalizeExportVideoMovements(exportJob);
  const spinSettings = normalizeExportSpinSettings(exportJob);
  const hdriRotationSettings = normalizeExportHdriRotationSettings(exportJob);
  const meshAnimation = normalizeExportMeshAnimationSettings(
    exportJob,
    exportJob.clipCount ?? 0,
  );
  const resolution = normalizeExportVideoResolution(exportJob.resolution);
  const aspectRatio = normalizeExportVideoAspectRatio(exportJob.aspectRatio);
  const durationSec = exportJob.durationSec ?? 5;
  const fps = exportJob.fps ?? 24;
  const totalFrames = Math.max(2, Math.round(Number(durationSec) * Number(fps)));
  const defaultSize = getExportVideoResolutionSize(resolution, aspectRatio);
  const sequenceFolderName =
    typeof renderContext.sequenceFolderName === 'string'
      ? renderContext.sequenceFolderName.trim()
      : '';
  const outputDirectoryName =
    typeof renderContext.outputDirectoryName === 'string'
      ? renderContext.outputDirectoryName.trim()
      : '';
  const useFolderExport = renderContext.useFolderExport === true && !!outputDirectoryName;
  const zipFileName =
    typeof renderContext.zipFileName === 'string' ? renderContext.zipFileName.trim() : '';
  const exportWidth =
    Number(renderContext.exportWidth)
    || defaultSize.width
    || 1920;
  const exportHeight =
    Number(renderContext.exportHeight)
    || defaultSize.height
    || 1080;
  const postFxState =
    renderContext.postFxState && typeof renderContext.postFxState === 'object'
      ? renderContext.postFxState
      : {};

  const rows = [];
  addRow(
    rows,
    'Output',
    useFolderExport
      ? `Folder → ${outputDirectoryName}`
      : 'ZIP download',
  );
  if (sequenceFolderName) {
    addRow(rows, 'Sequence folder', sequenceFolderName);
  }
  if (!useFolderExport && zipFileName) {
    addRow(rows, 'ZIP file', zipFileName);
  }
  addRow(
    rows,
    'Est. size',
    estimatePngSequenceSizeLabel(exportWidth, exportHeight, totalFrames),
  );
  addRow(
    rows,
    'Resolution',
    getExportVideoResolutionSummaryLabel(resolution, aspectRatio),
  );
  addRow(rows, 'Aspect', aspectRatio);
  addRow(rows, 'Duration', `${durationSec}s`);
  addRow(rows, 'Frame rate', `${fps} fps`);
  addRow(rows, 'Frame count', totalFrames);
  addRow(rows, 'Transparent', exportJob.movTransparent);
  addRow(
    rows,
    'Look',
    describeLook(renderContext.creativeLookEnabled, renderContext.creativeLookPreset),
  );
  addRow(
    rows,
    'Lens',
    describeLens(postFxState, {
      fisheyeEnabled: renderContext.fisheyeEnabled,
      lensDistortionActive: renderContext.lensDistortionActive,
    }),
  );
  addRow(rows, 'Post FX', describePostFx(postFxState));
  addRow(
    rows,
    'Lights',
    renderContext.lightsAutoRotate ? 'Auto-rotate' : 'Static',
  );
  addRow(rows, 'Movement', describeCameraMovement(movements));
  if (spinSettings?.rotationDegrees) {
    addRow(rows, 'Spins', exportSpinToastLabel(spinSettings));
  }
  const hdriLabel = exportHdriRotationToastLabel(hdriRotationSettings);
  if (hdriLabel) {
    addRow(rows, 'HDRI rotation', hdriLabel);
  }
  if (meshAnimation.include) {
    addRow(rows, 'GLB animation', animationClipLabel || `Clip ${meshAnimation.clipIndex + 1}`);
  }
  const fontTextRevealLabel =
    typeof renderContext.fontTextRevealLabel === 'string'
      ? renderContext.fontTextRevealLabel.trim()
      : '';
  if (fontTextRevealLabel) {
    addRow(rows, 'Text reveal', fontTextRevealLabel);
  }
  return rows;
}

function renderQualitySummaryLabel(id) {
  if (id === 'low') return 'Low';
  if (id === 'medium') return 'Medium';
  return 'Ultra';
}

/** @param {Record<string, unknown>} renderContext */
function describeStillExportOnlyTransforms(renderContext = {}) {
  const parts = [];
  const scale = Number(renderContext.scale) || 1;
  if (scale !== 1) {
    parts.push(`${scale}× viewport backing store`);
  }
  if (renderContext.cinematicLetterbox219) {
    parts.push('21∶9 letterbox mattes');
  }
  if (renderContext.lensDistortionActive) {
    parts.push('Lens distortion export pin');
  }
  if (renderContext.transparent) {
    parts.push('Mesh AABB + tight alpha crop');
  }
  return parts.length ? parts.join(' · ') : 'Matches viewport framing';
}

/**
 * Pre-export summary for still PNG / JPEG / WebP (Chunk 6).
 *
 * @param {{
 *   formatId?: string,
 *   scale?: number,
 *   transparent?: boolean,
 *   assetName?: string,
 *   renderContext?: Record<string, unknown>,
 * }} params
 * @returns {{ title: string, rows: Array<{ label: string, value: string }> }[]}
 */
export function buildStillImageExportOverlaySummary({
  formatId = 'png',
  scale = 1,
  transparent = false,
  assetName = '',
  renderContext = {},
} = {}) {
  void assetName;
  const format = getImageExportFormat(normalizeImageExportFormat(formatId));
  const rows = [];
  addRow(rows, 'Output', 'Download');
  addRow(rows, 'Format', format.label);
  addRow(rows, 'Scale', `${scale}×`);
  addRow(
    rows,
    'Render quality',
    renderQualitySummaryLabel(
      typeof renderContext.renderQuality === 'string' ? renderContext.renderQuality : 'medium',
    ),
  );
  addRow(rows, 'Background', transparent ? 'Transparent' : 'Scene background');
  if (transparent) {
    addRow(rows, 'Output crop', 'Mesh bounds + alpha padding');
  } else if (renderContext.exportWidth && renderContext.exportHeight) {
    addRow(
      rows,
      'Pixel size',
      `${renderContext.exportWidth}×${renderContext.exportHeight}px`,
    );
  }
  if (typeof renderContext.gpuClampNote === 'string' && renderContext.gpuClampNote) {
    addRow(rows, 'GPU limit', renderContext.gpuClampNote);
  }
  addRow(
    rows,
    'Look',
    describeLook(renderContext.creativeLookEnabled, renderContext.creativeLookPreset),
  );
  addRow(
    rows,
    'Lens',
    describeLens(renderContext.postFxState ?? {}, {
      fisheyeEnabled: renderContext.fisheyeEnabled,
      lensDistortionActive: renderContext.lensDistortionActive,
    }),
  );
  addRow(
    rows,
    'Post FX',
    describePostFx(
      renderContext.postFxState && typeof renderContext.postFxState === 'object'
        ? renderContext.postFxState
        : {},
    ),
  );
  addRow(
    rows,
    'Export-only',
    describeStillExportOnlyTransforms({ ...renderContext, transparent, scale }),
  );
  if (!rows.length) return [];
  return [{ title: 'Still export', rows }];
}

/**
 * @param {{
 *   exportJob?: Record<string, unknown>,
 *   assetName?: string,
 *   animationClipLabel?: string | null,
 *   renderContext?: Record<string, unknown>,
 * }} params
 * @returns {{ title: string, rows: Array<{ label: string, value: string }> }[]}
 */
export function buildOfflineExportOverlaySummary({
  exportJob = {},
  assetName = '',
  animationClipLabel = null,
  renderContext = {},
} = {}) {
  void assetName;
  const rows = buildExportRows(exportJob, animationClipLabel, renderContext);
  if (!rows.length) return [];
  return [{ title: 'Render settings', rows }];
}
