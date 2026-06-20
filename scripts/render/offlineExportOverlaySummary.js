import {
  exportSpinToastLabel,
  exportHdriRotationToastLabel,
  normalizeExportVideoMovements,
  normalizeExportSpinSettings,
  normalizeExportHdriRotationSettings,
  normalizeExportMeshAnimationSettings,
} from './exportVideoMovements.js';

const RESOLUTION_PIXELS = {
  '1080p': '1920 × 1080',
  '1440p': '2560 × 1440',
  '2160p': '3840 × 2160',
};

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
function describeMovements(movements, spinSettings, hdriRotationSettings) {
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
  if (spinSettings?.rotationDegrees) {
    parts.push(exportSpinToastLabel(spinSettings));
  }
  const hdriLabel = exportHdriRotationToastLabel(hdriRotationSettings);
  if (hdriLabel) parts.push(hdriLabel);
  return parts.length ? parts.join(' · ') : 'Static';
}

function displayAssetName(assetName) {
  if (!assetName || typeof assetName !== 'string') return '';
  const trimmed = assetName.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\.[a-z0-9]+$/i, '') || trimmed;
}

/**
 * @param {Record<string, unknown>} exportJob
 * @param {string} [assetName]
 * @param {string | null} [animationClipLabel]
 */
function buildExportRows(exportJob, assetName, animationClipLabel) {
  const movements = normalizeExportVideoMovements(exportJob);
  const spinSettings = normalizeExportSpinSettings(exportJob);
  const hdriRotationSettings = normalizeExportHdriRotationSettings(exportJob);
  const meshAnimation = normalizeExportMeshAnimationSettings(
    exportJob,
    exportJob.clipCount ?? 0,
  );
  const resolution =
    exportJob.resolution === '1440p' || exportJob.resolution === '2160p'
      ? exportJob.resolution
      : '1080p';
  const durationSec = exportJob.durationSec ?? 5;
  const fps = exportJob.fps ?? 24;
  const totalFrames = Math.max(2, Math.round(Number(durationSec) * Number(fps)));

  const rows = [];
  const asset = displayAssetName(assetName);
  if (asset) addRow(rows, 'Asset', asset);
  const folderName = exportJob.pngOutputDirectoryHandle?.name;
  addRow(
    rows,
    'Output',
    folderName ? `PNG sequence → ${folderName}` : 'PNG sequence (ZIP)',
  );
  addRow(
    rows,
    'Resolution',
    `${resolution} (${RESOLUTION_PIXELS[resolution]})`,
  );
  addRow(rows, 'Duration', `${durationSec}s`);
  addRow(rows, 'Frame rate', `${fps} fps`);
  addRow(rows, 'Frame count', totalFrames);
  addRow(rows, 'Transparent', exportJob.movTransparent);
  addRow(rows, 'Movement', describeMovements(movements, spinSettings, hdriRotationSettings));
  if (meshAnimation.include && animationClipLabel) {
    addRow(rows, 'GLB animation', animationClipLabel);
  }
  return rows;
}

/**
 * @param {{
 *   exportJob?: Record<string, unknown>,
 *   assetName?: string,
 *   animationClipLabel?: string | null,
 * }} params
 * @returns {{ title: string, rows: Array<{ label: string, value: string }> }[]}
 */
export function buildOfflineExportOverlaySummary({
  exportJob = {},
  assetName = '',
  animationClipLabel = null,
} = {}) {
  const rows = buildExportRows(exportJob, assetName, animationClipLabel);
  if (!rows.length) return [];
  return [{ title: 'Export', rows }];
}
