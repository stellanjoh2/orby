import * as THREE from 'three';
import { formatTime } from '../utils/timeFormatter.js';

export class AnimationController {
  constructor({
    onClipsChanged = () => {},
    onPlayStateChanged = () => {},
    onTimeUpdate = () => {},
    onTopBarUpdate = () => {},
    getFileName = () => 'model.glb',
  } = {}) {
    this.mixer = null;
    this.currentAction = null;
    this.currentClipIndex = 0;
    this.animations = [];
    this.onClipsChanged = onClipsChanged;
    this.onPlayStateChanged = onPlayStateChanged;
    this.onTimeUpdate = onTimeUpdate;
    this.onTopBarUpdate = onTopBarUpdate;
    this.getFileName = getFileName;
    this._exportDriveActive = false;
    this._exportPoseHoldActive = false;
    this._exportDriveSnapshot = null;
    this._exportAction = null;
    this._exportClipIndex = 0;
  }

  isExportDriving() {
    return !!this._exportDriveActive;
  }

  /** Live GLB playback is frozen for export or movement preview. */
  isExportSessionActive() {
    return this._exportDriveActive || this._exportPoseHoldActive;
  }

  /**
   * Pause live playback; optionally drive a selected clip per export frame.
   * @param {{ include?: boolean, clipIndex?: number }} [options]
   */
  beginExportDrive({ include = false, clipIndex = 0 } = {}) {
    if (!this.mixer || !this.animations.length) return;

    this._exportDriveSnapshot = {
      time: this.currentAction?.time ?? 0,
      paused: this.currentAction?.paused ?? true,
    };
    if (this.currentAction) {
      this.currentAction.paused = true;
    }

    if (!include) {
      this._exportDriveActive = false;
      this._exportPoseHoldActive = true;
      return;
    }

    const idx = Math.min(
      this.animations.length - 1,
      Math.max(0, Number(clipIndex) || 0),
    );
    const clip = this.animations[idx];
    if (!clip) {
      this._exportPoseHoldActive = true;
      return;
    }

    this._exportDriveActive = true;
    this._exportPoseHoldActive = false;
    this._exportClipIndex = idx;

    this._exportAction = this.mixer.clipAction(clip);
    this._exportAction.reset();
    this._exportAction.play();
    this._exportAction.paused = true;
  }

  /**
   * Set GLB pose for one export frame (wall-clock seconds = frameIndex / fps).
   * @param {number} frameIndex — 0-based export frame
   * @param {number} fps
   */
  applyExportDriveFrame(frameIndex, fps) {
    if (!this._exportDriveActive || !this.mixer || !this._exportAction) return;
    const clip = this.animations[this._exportClipIndex];
    if (!clip || !(clip.duration > 0)) return;

    const exportTimeSec = Math.max(0, frameIndex) / Math.max(1, fps);
    const duration = clip.duration;
    const loop = this._exportAction.loop;
    let time;
    if (loop === THREE.LoopOnce) {
      time = Math.min(exportTimeSec, duration);
    } else if (loop === THREE.LoopPingPong) {
      const cycle = duration * 2;
      const m = exportTimeSec % cycle;
      time = m <= duration ? m : cycle - m;
    } else {
      time = exportTimeSec % duration;
    }

    this._exportAction.time = time;
    this.mixer.update(0);
  }

  endExportDrive() {
    if (!this._exportDriveActive && !this._exportPoseHoldActive) return;
    const snap = this._exportDriveSnapshot;
    this._exportDriveActive = false;
    this._exportPoseHoldActive = false;
    this._exportDriveSnapshot = null;
    this._exportClipIndex = 0;

    if (this._exportAction) {
      this._exportAction.stop();
      this._exportAction = null;
    }

    if (!this.mixer || !this.currentAction || !snap) return;

    this.currentAction.time = snap.time;
    this.currentAction.paused = snap.paused;
    this.mixer.update(0);
    const clip = this.animations[this.currentClipIndex];
    if (clip) {
      this.onTimeUpdate(this.currentAction.time, clip.duration);
    }
  }

  setModel(model, animations = []) {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentAction = null;
    this._exportAction = null;
    this._exportDriveActive = false;
    this._exportPoseHoldActive = false;
    this._exportDriveSnapshot = null;
    this.animations = [];
    if (!animations.length || !model) {
      this.onClipsChanged([]);
      return;
    }
    this.mixer = new THREE.AnimationMixer(model);
    this.animations = animations;
    this.currentClipIndex = 0;
    const formattedClips = animations.map((clip, index) => ({
      name: clip.name || `Clip ${index + 1}`,
      duration: formatTime(clip.duration),
      seconds: clip.duration,
    }));
    this.onClipsChanged(formattedClips);
    this.playClip(0);
  }

  playClip(index) {
    if (!this.animations.length || !this.mixer) return;

    const clip = this.animations[index];
    if (!clip) return;
    this.currentClipIndex = index;
    if (this.currentAction) {
      this.currentAction.stop();
    }
    this.currentAction = this.mixer.clipAction(clip);
    this.currentAction.reset();
    this.currentAction.play();
    this.onPlayStateChanged(true);
    const fileName = this.getFileName();
    this.onTopBarUpdate(
      `${fileName} — ${clip.name || 'Clip'} (${formatTime(
        clip.duration,
      )})`,
    );
  }

  togglePlayback() {
    if (!this.currentAction) return;
    this.currentAction.paused = !this.currentAction.paused;
    this.onPlayStateChanged(!this.currentAction.paused);
  }

  scrub(value) {
    if (!this.currentAction || !this.animations[this.currentClipIndex]) return;
    const clip = this.animations[this.currentClipIndex];
    this.currentAction.time = clip.duration * value;
    this.mixer.update(0);
    this.onTimeUpdate(this.currentAction.time, clip.duration);
  }

  selectAnimation(index) {
    this.playClip(index);
  }

  update(delta) {
    if (!this.mixer || !this.currentAction) return;
    this.mixer.update(delta);
    const clip = this.animations[this.currentClipIndex];
    if (clip) {
      this.onTimeUpdate(this.currentAction.time, clip.duration);
    }
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentAction = null;
    this._exportAction = null;
    this.animations = [];
  }
}
