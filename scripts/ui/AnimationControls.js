/**
 * AnimationControls - Handles animation-related UI controls
 * Manages animation playback, scrubbing, and clip selection
 */
export class AnimationControls {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
  }

  bind() {
    this.ui.dom.animationBlock.hidden = true;
    this.ui.dom.playPause.addEventListener('click', () => {
      this.eventBus.emit('animation:toggle');
    });
    this.ui.dom.animationScrub.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.eventBus.emit('animation:scrub', value);
    });
    this.ui.dom.animationSelect.addEventListener('change', (event) => {
      const index = parseInt(event.target.value, 10);
      this.eventBus.emit('animation:select', index);
    });
  }

  extractAnimationName(fullName) {
    if (!fullName) return 'Animation';
    
    const parts = fullName.split('|');
    let namePart = fullName;
    if (parts.length > 1) {
      const meaningfulParts = parts.filter(part => {
        const lower = part.toLowerCase();
        return !['armature', 'baselayer', 'mixamo', 'root'].includes(lower);
      });
      namePart = meaningfulParts.length > 0 ? meaningfulParts[meaningfulParts.length - 1] : parts[parts.length - 1];
    }
    
    return namePart
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  setAnimationClips(clips) {
    this.ui.dom.animationSelect.innerHTML = '';
    if (!clips?.length) {
      this.ui.dom.animationBlock.hidden = true;
      this.ui.animationPlaying = false;
      this.ui.dom.playPause.disabled = true;
      this.ui.dom.animationScrub.disabled = true;
      return;
    }
    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = index;
      const displayName = this.extractAnimationName(clip.name);
      option.textContent = displayName;
      this.ui.dom.animationSelect.appendChild(option);
    });
    this.ui.dom.animationBlock.hidden = false;
    this.ui.dom.playPause.disabled = false;
    this.ui.dom.animationScrub.disabled = false;
    this.ui.currentAnimationDuration = clips[0].seconds ?? 0;
  }

  setAnimationPlaying(playing) {
    this.ui.animationPlaying = playing;
    this.ui.dom.playPause.textContent = playing ? 'Pause' : 'Play';
  }

  updateAnimationTime(current, duration) {
    if (!duration) return;
    const clamp = Math.max(0, Math.min(current, duration));
    const minutes = Math.floor(clamp / 60).toString().padStart(1, '0');
    const seconds = Math.floor(clamp % 60).toString().padStart(2, '0');
    this.ui.dom.animationTime.textContent = `${minutes}:${seconds}`;
    const progress = duration === 0 ? 0 : clamp / duration;
    this.ui.dom.animationScrub.value = progress;
  }
}

