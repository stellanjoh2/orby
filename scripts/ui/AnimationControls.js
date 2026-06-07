import {
  ANIMATION_DISPLAY_FPS,
  normalizeAnimationDisplayFps,
} from '../constants.js';
import { formatAnimationFrameNumbers } from '../utils/timeFormatter.js';

/**
 * AnimationControls - Handles animation-related UI controls
 * Manages animation playback, scrubbing, and clip selection
 */
export class AnimationControls {
  constructor(eventBus, uiManager) {
    this.eventBus = eventBus;
    this.ui = uiManager;
    this.animationPlaying = false;
    this.displayFps = ANIMATION_DISPLAY_FPS;
    this._lastCurrent = 0;
    this._lastDuration = 0;
  }

  bind() {
    this.ui.dom.animationBlock.hidden = true;
    this.syncAnimationDisplayFps(
      this.ui.stateStore?.getState?.().animation?.displayFps ?? ANIMATION_DISPLAY_FPS,
    );
    this.syncAnimationTimeReference(
      this.ui.stateStore?.getState?.().animation?.timeReferenceEnabled ?? false,
    );
    this._syncAnimationScrubFill();

    this.ui.dom.playPause.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('animation:toggle');
    });
    this.ui.dom.animationScrub.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.ui.updateSliderFill?.(event.target);
      this.eventBus.emit('animation:scrub', value);
    });
    this.ui.dom.animationSelect.addEventListener('change', (event) => {
      this.ui.uiSounds?.playSelect();
      const index = parseInt(event.target.value, 10);
      this.eventBus.emit('animation:select', index);
    });
    this.ui.inputs.animationDisplayFps?.addEventListener('change', (event) => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('animation:display-fps', parseInt(event.target.value, 10));
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
    this.ui.dom.animationReverseBtn?.addEventListener('click', () => {
      const button = this.ui.dom.animationReverseBtn;
      if (!button || button.disabled) return;
      this.ui.uiSounds?.playSelect();
      const next = !button.classList.contains('is-active');
      this.eventBus.emit('animation:reverse', next);
      this.syncAnimationReverse(next);
    });
    this.ui.inputs.animationTimeReference?.addEventListener('change', (event) => {
      this.ui.uiSounds?.playSelect();
      this.eventBus.emit('animation:time-reference', event.target.checked);
    });
    this.ui.inputs.animationShowBones?.addEventListener('change', (event) => {
      this.eventBus.emit('animation:show-bones', event.target.checked);
    });
    this.ui.inputs.animationShowJointNames?.addEventListener('change', (event) => {
      this.eventBus.emit('animation:show-joint-names', event.target.checked);
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
      this.setAnimationPlaying(false);
      this.ui.dom.playPause.disabled = true;
      this.ui.dom.animationReverseBtn.disabled = true;
      this.ui.dom.animationScrub.disabled = true;
      this.ui.dom.animationSelect.disabled = true;
      this.setAnimationSpeedEnabled(false);
      this.setAnimationClipModeEnabled(false);
      this.syncAnimationReverse(false, false);
      this.syncAnimationShowBones(false, false);
      this.syncAnimationShowJointNames({ visible: false, enabled: false, checked: false });
      this.syncAnimationHideMesh({ visible: false, enabled: false, checked: false });
      this.syncAnimationBoneStroke({ visible: false, enabled: false });
      this.syncAnimationJointScale({ visible: false, enabled: false });
      this.syncAnimationTimeReference(false, false);
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
    this.ui.dom.animationReverseBtn.disabled = false;
    this.ui.dom.animationScrub.disabled = false;
    this.ui.dom.animationSelect.disabled = false;
    this.setAnimationSpeedEnabled(true);
    this.setAnimationClipModeEnabled(true);
    const animation = this.ui.stateStore?.getState?.().animation ?? {};
    this.syncAnimationTimeReference(animation.timeReferenceEnabled ?? false, true);
    this._syncAnimationScrubFill();
  }

  syncAnimationTimeReference(checked, available) {
    const input = this.ui.inputs.animationTimeReference;
    if (input) {
      if (available !== undefined) {
        input.disabled = !available;
      }
      if (checked !== undefined) {
        input.checked = !!checked;
      }
    }
    const enabled = !!input?.checked && !(input?.disabled);
    this.setAnimationTimeReferencePanelVisible(enabled);
    this.setAnimationDisplayFpsEnabled(enabled);
    if (enabled) {
      this._refreshFrameNumbers();
    }
  }

  setAnimationTimeReferencePanelVisible(visible) {
    const section = this.ui.dom.animationTimeReferenceSection;
    if (!section) return;
    section.hidden = !visible;
    section.classList.toggle('effect-foldout--expanded', visible);
    section.classList.toggle('effect-foldout--collapsed', !visible);
    section.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  setAnimationDisplayFpsEnabled(enabled) {
    const select = this.ui.inputs.animationDisplayFps;
    if (select) {
      select.disabled = !enabled;
    }
  }

  syncAnimationDisplayFps(fps) {
    const next = normalizeAnimationDisplayFps(fps);
    this.displayFps = next;
    const select = this.ui.inputs.animationDisplayFps;
    if (select && document.activeElement !== select) {
      select.value = String(next);
    }
    this._refreshFrameNumbers();
    return next;
  }

  _refreshFrameNumbers() {
    const frameNumbers = this.ui.dom.animationFrameNumbers;
    if (!frameNumbers || !(this._lastDuration > 0)) return;
    frameNumbers.textContent = formatAnimationFrameNumbers(
      this._lastCurrent,
      this._lastDuration,
      this.displayFps,
    );
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

  syncAnimationShowJointNames({ visible, enabled, checked } = {}) {
    const row = this.ui.dom.animationShowJointNamesRow;
    const input = this.ui.inputs.animationShowJointNames;
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
  }

  syncAnimationReverse(checked, available) {
    const button = this.ui.dom.animationReverseBtn;
    if (!button) return;
    if (available !== undefined) {
      button.disabled = !available;
    }
    if (checked !== undefined) {
      const active = !!checked;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  setAnimationPlaying(playing) {
    this.animationPlaying = playing;
    const button = this.ui.dom.playPause;
    const scrub = this.ui.dom.animationScrub;
    const icon = button?.querySelector('i');
    const srLabel = button?.querySelector('.sr-only');

    button?.classList.toggle('is-active', !!playing);
    scrub?.classList.toggle('is-scrub-playing', !!playing);

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
    this._lastCurrent = clamp;
    this._lastDuration = duration;
    const minutes = Math.floor(clamp / 60)
      .toString()
      .padStart(1, '0');
    const seconds = Math.floor(clamp % 60)
      .toString()
      .padStart(2, '0');
    this.ui.dom.animationTime.textContent = `${minutes}:${seconds}`;
    this._refreshFrameNumbers();
    const progress = duration === 0 ? 0 : clamp / duration;
    this.ui.dom.animationScrub.value = progress;
    this._syncAnimationScrubFill();
  }

  _syncAnimationScrubFill() {
    const scrub = this.ui.dom.animationScrub;
    if (scrub) {
      this.ui.updateSliderFill?.(scrub);
    }
  }
}
