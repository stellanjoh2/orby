import * as THREE from 'three';

/**
 * Trim morph / skeletal clips whose keyframes do not start at t=0.
 *
 * Some exporters (Sketchfab flipbook morphs, Maya ABC caches) keep the original
 * timeline offset. Three.js uses the maximum key time as `clip.duration`, so
 * LoopRepeat spends most of each cycle at the rest pose before the keys play.
 */
export function normalizeAnimationClip(clip) {
  if (!clip?.tracks?.length) return clip;

  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const track of clip.tracks) {
    const times = track.times;
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      if (t < minTime) minTime = t;
      if (t > maxTime) maxTime = t;
    }
  }

  if (!Number.isFinite(minTime) || !Number.isFinite(maxTime) || maxTime <= 0) {
    return clip;
  }

  const span = maxTime - minTime;
  const needsShift = minTime > 1e-5;
  const needsDurationFix = Math.abs(clip.duration - span) > 1e-4;

  if (!needsShift && !needsDurationFix) return clip;

  const tracks = clip.tracks.map((track) => {
    const times = track.times.slice();
    if (needsShift) {
      for (let i = 0; i < times.length; i++) times[i] -= minTime;
    }
    return new track.constructor(track.name, times, track.values.slice());
  });

  return new THREE.AnimationClip(clip.name, span, tracks);
}

/**
 * @param {THREE.AnimationClip[]} animations
 * @returns {THREE.AnimationClip[]}
 */
export function normalizeAnimationClips(animations) {
  if (!Array.isArray(animations) || !animations.length) return animations ?? [];
  return animations.map(normalizeAnimationClip);
}
