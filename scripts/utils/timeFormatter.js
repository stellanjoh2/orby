// Time formatting utility

import { ANIMATION_DISPLAY_FPS } from '../constants.js';

export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(1, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
};

/** 1-based frame index at `currentSec`, clamped to [1, totalFrames]. */
export function animationFrameAtTime(currentSec, durationSec, fps = ANIMATION_DISPLAY_FPS) {
  const rate = Math.max(1, fps);
  const totalFrames = Math.max(1, Math.round(durationSec * rate));
  const frame = Math.floor(Math.max(0, currentSec) * rate) + 1;
  return Math.min(totalFrames, Math.max(1, frame));
}

export function animationTotalFrames(durationSec, fps = ANIMATION_DISPLAY_FPS) {
  return Math.max(1, Math.round(Math.max(0, durationSec) * Math.max(1, fps)));
}

/** Zero-padded frame label — min 3 digits so the counter doesn’t shift while playing. */
function formatAnimationFrameLabel(frame) {
  return String(Math.max(0, Math.floor(frame))).padStart(3, '0');
}

/** e.g. `005 / 111` */
export function formatAnimationFrameNumbers(
  currentSec,
  durationSec,
  fps = ANIMATION_DISPLAY_FPS,
) {
  const totalFrames = animationTotalFrames(durationSec, fps);
  const currentFrame = animationFrameAtTime(currentSec, durationSec, fps);
  return `${formatAnimationFrameLabel(currentFrame)} / ${formatAnimationFrameLabel(totalFrames)}`;
}

