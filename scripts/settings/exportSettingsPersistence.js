import { deepClone } from '../utils/deepClone.js';
import { normalizeImageExportFormat } from '../render/imageExportFormats.js';
import {
  normalizeExportFovOffset,
  normalizeExportPitchOffset,
  normalizeExportSpins,
  normalizeExportSubtleSpinDegrees,
  normalizeExportVideoMovements,
} from '../render/exportVideoMovements.js';
import {
  normalizeExportVideoAspectRatio,
  normalizeExportVideoFps,
  normalizeExportVideoResolution,
} from '../render/exportVideoResolution.js';

/**
 * Snapshot export-tab settings for scene copy / .orby save.
 * @param {Record<string, unknown> | null | undefined} exportSettings
 */
export function serializeExportSettings(exportSettings) {
  if (!exportSettings || typeof exportSettings !== 'object') return null;
  const cloned = deepClone(exportSettings);
  if (cloned.video && typeof cloned.video === 'object') {
    delete cloned.video.pngOutputDirectoryHandle;
  }
  return cloned;
}

/**
 * Merge saved export settings into the live UIManager.exportSettings object.
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} saved
 */
export function applySavedExportSettings(target, saved) {
  if (!target || typeof target !== 'object' || !saved || typeof saved !== 'object') return;

  if (saved.format !== undefined) {
    target.format = normalizeImageExportFormat(saved.format);
  }
  if (saved.transparent !== undefined) {
    target.transparent = !!saved.transparent;
  }
  if (saved.size !== undefined) {
    const size = Number(saved.size);
    if (size === 1 || size === 2) target.size = size;
  }
  if (saved.sections && typeof saved.sections === 'object') {
    target.sections = {
      ...(target.sections || {}),
      ...saved.sections,
    };
  }

  if (saved.watermark && typeof saved.watermark === 'object') {
    if (!target.watermark || typeof target.watermark !== 'object') {
      target.watermark = {};
    }
    if (saved.watermark.logo === 'orby' || saved.watermark.logo === 'custom') {
      // A custom SVG is a session-only upload; restore to Orby when reloading.
      target.watermark.logo = 'orby';
    }
    if (saved.watermark.placement === 'left' || saved.watermark.placement === 'right') {
      target.watermark.placement = saved.watermark.placement;
    }
    if (typeof saved.watermark.credit === 'string') {
      target.watermark.credit = saved.watermark.credit;
    }
    if (typeof saved.watermark.creditEnabled === 'boolean') {
      target.watermark.creditEnabled = saved.watermark.creditEnabled;
    }
    const logoScale = Number(saved.watermark.logoScale);
    if (Number.isFinite(logoScale) && logoScale >= 50 && logoScale <= 200) {
      target.watermark.logoScale = logoScale;
    }
    const creditScale = Number(saved.watermark.creditScale);
    if (Number.isFinite(creditScale) && creditScale >= 50 && creditScale <= 200) {
      target.watermark.creditScale = creditScale;
    }
    if (typeof saved.watermark.logoColorOverride === 'boolean') {
      target.watermark.logoColorOverride = saved.watermark.logoColorOverride;
    }
    const hex = /^#[0-9a-fA-F]{6}$/;
    if (hex.test(saved.watermark.logoColor)) {
      target.watermark.logoColor = saved.watermark.logoColor.toLowerCase();
    }
    if (hex.test(saved.watermark.creditColor)) {
      target.watermark.creditColor = saved.watermark.creditColor.toLowerCase();
    }
  }

  const video = saved.video;
  if (!video || typeof video !== 'object') return;

  if (!target.video || typeof target.video !== 'object') {
    target.video = {};
  }

  const movements = normalizeExportVideoMovements(video);
  target.video.turntable = movements.turntable;
  target.video.orbit = movements.orbit;
  target.video.zoomIn = movements.zoomIn;
  target.video.zoomOut = movements.zoomOut;
  target.video.tiltLeft = movements.tiltLeft;
  target.video.tiltRight = movements.tiltRight;
  target.video.zoomDistance = movements.zoomDistance;
  target.video.tiltAngle = movements.tiltAngle;
  target.video.fovOffset = movements.fovOffset;
  target.video.pitchOffset = movements.pitchOffset;

  if (video.format === 'mp4' || video.format === 'png') {
    target.video.format = video.format;
  }
  if (video.durationSec !== undefined) {
    const durationSec = Number(video.durationSec);
    if (Number.isFinite(durationSec) && durationSec > 0) {
      target.video.durationSec = durationSec;
    }
  }
  target.video.spins = normalizeExportSpins(video.spins);
  target.video.subtleSpinDegrees = normalizeExportSubtleSpinDegrees(video.subtleSpinDegrees);
  target.video.spinDirection = video.spinDirection === 'reverse' ? 'reverse' : 'forward';
  target.video.hdriRotationDegrees = 0;
  target.video.aspectRatio = normalizeExportVideoAspectRatio(video.aspectRatio);

  if (video.fps !== undefined) {
    target.video.fps = normalizeExportVideoFps(Number(video.fps));
  }
  target.video.resolution = normalizeExportVideoResolution(video.resolution);

  if (video.mp4Quality === 'low' || video.mp4Quality === 'medium' || video.mp4Quality === 'high') {
    target.video.mp4Quality = video.mp4Quality;
  }
  if (video.movTransparent !== undefined) {
    target.video.movTransparent = !!video.movTransparent;
  }
  if (video.meshAnimationsInclude !== undefined) {
    target.video.meshAnimationsInclude = !!video.meshAnimationsInclude;
  }
  if (video.meshAnimationClipIndex !== undefined) {
    const clipIndex = Number(video.meshAnimationClipIndex);
    if (Number.isFinite(clipIndex) && clipIndex >= 0) {
      target.video.meshAnimationClipIndex = clipIndex;
    }
  }
}
