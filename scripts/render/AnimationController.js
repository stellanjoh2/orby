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
  }

  setModel(model, animations = []) {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentAction = null;
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
    this.animations = [];
  }
}

