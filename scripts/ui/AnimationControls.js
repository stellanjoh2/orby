/**
 * AnimationControls - Handles animation-related UI controls
 * Manages animation playback, scrubbing, and clip selection
 */
export class AnimationControls {
  constructor(eventBus, uiManager) {
    this.eventBus = eventBus;
    this.ui = uiManager;
    this.animationPlaying = false;
  }

  bind() {
    this.ui.dom.animationBlock.hidden = true;
    this.ui.dom.playPause.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('animation:toggle');
    });
    this.ui.dom.animationScrub.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.eventBus.emit('animation:scrub', value);
    });
    this.ui.dom.animationSelect.addEventListener('change', (event) => {
      this.ui.uiSounds?.playSelect();
      const index = parseInt(event.target.value, 10);
      this.eventBus.emit('animation:select', index);
    });
    this.ui.dom.animationClipModeSegmented
      ?.querySelectorAll('input[type="radio"]')
      .forEach((input) => {
        input.addEventListener('change', () => {
          if (!input.checked) return;
          this.ui.uiSounds?.playSelect();
          this.eventBus.emit('animation:clip-mode', input.value);
        });
      });
    this.ui.dom.animationSpeedSegmented
      ?.querySelectorAll('input[type="radio"]')
      .forEach((input) => {
        input.addEventListener('change', () => {
          if (!input.checked) return;
          this.eventBus.emit('animation:speed', parseFloat(input.value));
        });
      });
    this.ui.inputs.animationReverse?.addEventListener('change', (event) => {
      this.eventBus.emit('animation:reverse', event.target.checked);
    });
    this.ui.inputs.animationShowBones?.addEventListener('change', (event) => {
      this.eventBus.emit('animation:show-bones', event.target.checked);
    });
    this.ui.inputs.animationHideMesh?.addEventListener('change', (event) => {
      this.eventBus.emit('animation:hide-mesh', event.target.checked);
    });
    this.ui.inputs.animationJointScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.ui.helpers?.updateValueLabel('animationJointScale', value, 'decimal');
      this.eventBus.emit('animation:joint-scale', value);
    });
    if (this.ui.inputs.animationJointScale) {
      this.ui.helpers?.enableSliderKeyboardStepping?.(this.ui.inputs.animationJointScale);
    }
    this.ui.inputs.animationBoneStrokeWidth?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.ui.helpers?.updateValueLabel('animationBoneStrokeWidth', value, 'decimal');
      this.eventBus.emit('animation:bone-stroke-width', value);
    });
    if (this.ui.inputs.animationBoneStrokeWidth) {
      this.ui.helpers?.enableSliderKeyboardStepping?.(this.ui.inputs.animationBoneStrokeWidth);
    }
  }

  extractAnimationName(fullName) {
    if (!fullName) return 'Animation';

    const parts = fullName.split('|');
    let namePart = fullName;
    if (parts.length > 1) {
      const meaningfulParts = parts.filter((part) => {
        const lower = part.toLowerCase();
        return !['armature', 'baselayer', 'mixamo', 'root'].includes(lower);
      });
      namePart =
        meaningfulParts.length > 0
          ? meaningfulParts[meaningfulParts.length - 1]
          : parts[parts.length - 1];
    }

    return namePart
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .trim();
  }

  setAnimationClips(clips) {
    this.ui.dom.animationSelect.innerHTML = '';
    if (!clips?.length) {
      this.ui.dom.animationBlock.hidden = true;
      this.animationPlaying = false;
      this.ui.dom.playPause.disabled = true;
      this.ui.dom.animationScrub.disabled = true;
      this.ui.dom.animationSelect.disabled = true;
      this.setAnimationSpeedEnabled(false);
      this.setAnimationClipModeEnabled(false);
      this.syncAnimationReverse(false, false);
      this.syncAnimationShowBones(false, false);
      this.syncAnimationHideMesh({ visible: false, enabled: false, checked: false });
      this.syncAnimationBoneStroke({ visible: false, enabled: false });
      this.syncAnimationJointScale({ visible: false, enabled: false });
      return;
    }

    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = this.extractAnimationName(clip.name);
      this.ui.dom.animationSelect.appendChild(option);
    });
    this.ui.dom.animationBlock.hidden = false;
    this.ui.dom.playPause.disabled = false;
    this.ui.dom.animationScrub.disabled = false;
    this.ui.dom.animationSelect.disabled = false;
    this.setAnimationSpeedEnabled(true);
    this.setAnimationClipModeEnabled(true);
  }

  syncAnimationClipSelect(index) {
    const select = this.ui.dom.animationSelect;
    if (!select || select.options.length === 0) return;
    const next = String(index);
    if (select.value !== next) {
      select.value = next;
    }
  }

  setAnimationClipModeEnabled(enabled) {
    this.ui.dom.animationClipModeSegmented
      ?.querySelectorAll('input[type="radio"]')
      .forEach((input) => {
        input.disabled = !enabled;
      });
  }

  syncAnimationClipMode(mode, available) {
    const next = mode === 'cycle' ? 'cycle' : 'loop';
    if (available !== undefined) {
      this.setAnimationClipModeEnabled(available);
    }
    const input = this.ui.dom.animationClipModeSegmented?.querySelector(
      `input[type="radio"][value="${next}"]`,
    );
    if (input) {
      input.checked = true;
    }
  }

  syncAnimationShowBones(checked, available) {
    const input = this.ui.inputs.animationShowBones;
    if (!input) return;
    input.checked = !!checked;
    if (available !== undefined) {
      input.disabled = !available;
    }
  }

  syncAnimationJointScale({ visible, enabled, value } = {}) {
    const row = this.ui.dom.animationJointScaleRow;
    const slider = this.ui.inputs.animationJointScale;
    if (row && visible !== undefined) {
      row.hidden = !visible;
    }
    if (slider) {
      if (enabled !== undefined) {
        slider.disabled = !enabled;
      }
      if (value !== undefined && document.activeElement !== slider) {
        slider.value = String(value);
        this.ui.helpers?.updateValueLabel('animationJointScale', value, 'decimal');
        this.ui.helpers?.updateSliderFill?.(slider);
      }
    }
  }

  syncAnimationBoneStroke({ visible, enabled, value } = {}) {
    const row = this.ui.dom.animationBoneStrokeRow;
    const slider = this.ui.inputs.animationBoneStrokeWidth;
    if (row && visible !== undefined) {
      row.hidden = !visible;
    }
    if (slider) {
      if (enabled !== undefined) {
        slider.disabled = !enabled;
      }
      if (value !== undefined && document.activeElement !== slider) {
        slider.value = String(value);
        this.ui.helpers?.updateValueLabel('animationBoneStrokeWidth', value, 'decimal');
        this.ui.helpers?.updateSliderFill?.(slider);
      }
    }
  }

  syncAnimationHideMesh({ visible, enabled, checked } = {}) {
    const row = this.ui.dom.animationHideMeshRow;
    const input = this.ui.inputs.animationHideMesh;
    if (row && visible !== undefined) {
      row.hidden = !visible;
    }
    if (input) {
      if (enabled !== undefined) {
        input.disabled = !enabled;
      }
      if (checked !== undefined) {
        input.checked = !!checked;
      }
    }
  }

  setAnimationSpeedEnabled(enabled) {
    this.ui.dom.animationSpeedSegmented
      ?.querySelectorAll('input[type="radio"]')
      .forEach((input) => {
        input.disabled = !enabled;
      });
    if (this.ui.inputs.animationReverse) {
      this.ui.inputs.animationReverse.disabled = !enabled;
    }
  }

  syncAnimationReverse(checked, available) {
    const input = this.ui.inputs.animationReverse;
    if (!input) return;
    if (available !== undefined) {
      input.disabled = !available;
    }
    if (checked !== undefined) {
      input.checked = !!checked;
    }
  }

  setAnimationPlaying(playing) {
    this.animationPlaying = playing;
    const button = this.ui.dom.playPause;
    const icon = button?.querySelector('i');
    const srLabel = button?.querySelector('.sr-only');

    if (icon) {
      icon.classList.toggle('fa-play', !playing);
      icon.classList.toggle('fa-pause', playing);
    }

    if (srLabel) {
      srLabel.textContent = playing ? 'Pause' : 'Play';
    }

    button?.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
  }

  updateAnimationTime(current, duration) {
    if (!duration) return;
    const clamp = Math.max(0, Math.min(current, duration));
    const minutes = Math.floor(clamp / 60)
      .toString()
      .padStart(1, '0');
    const seconds = Math.floor(clamp % 60)
      .toString()
      .padStart(2, '0');
    this.ui.dom.animationTime.textContent = `${minutes}:${seconds}`;
    const progress = duration === 0 ? 0 : clamp / duration;
    this.ui.dom.animationScrub.value = progress;
  }
}
