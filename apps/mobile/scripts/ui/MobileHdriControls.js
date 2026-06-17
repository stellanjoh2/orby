import { MOBILE_HDRI } from '../mobileCatalog.js';
import {
  MOBILE_HDRI_STRENGTH_DEFAULT,
  MOBILE_HDRI_STRENGTH_MAX,
} from '../MobileScene.js';
import { normalizeBackgroundGradient } from '../../../../scripts/render/backgroundGradient/backgroundGradientDefaults.js';
import { updateMobileSliderFill } from '../mobileSliderHelpers.js';

/** @import { MobileUiContext } from '../mobileUiContext.js' */
/** @import { MobileColorPicker } from './MobileColorPicker.js' */

/**
 * @typedef {{
 *   colorPicker: MobileColorPicker,
 * }} MobileHdriControlsDeps
 */

export class MobileHdriControls {
  /**
   * @param {MobileUiContext} ctx
   * @param {MobileHdriControlsDeps} deps
   */
  constructor(ctx, deps) {
    this.ctx = ctx;
    this.colorPicker = deps.colorPicker;

    const { root } = ctx;
    this._brightnessInput = root.querySelector('[data-hdri-brightness-input]');
    this._brightnessValue = root.querySelector('[data-hdri-brightness-value]');
    this._blurInput = root.querySelector('[data-hdri-blur-input]');
    this._blurValue = root.querySelector('[data-hdri-blur-value]');
    this._backgroundInput = root.querySelector('[data-hdri-background-input]');
    this._controlsEl = root.querySelector('.orby-mobile-hdri-controls');
    this._bgControls = root.querySelector('[data-bg-controls]');
    this._bgSolidColorRow = root.querySelector('[data-bg-solid-color-row]');
    this._bgColorSwatch = root.querySelector('[data-bg-color-open]');
    this._bgGradientEnabled = root.querySelector('[data-bg-gradient-enabled]');
    this._bgGradientPanel = root.querySelector('[data-bg-gradient-panel]');
    this._bgGradientTypeButtons = Array.from(root.querySelectorAll('[data-bg-gradient-type]'));
    this._bgGradientSwatches = Array.from(root.querySelectorAll('[data-bg-gradient-color]'));
    this._bgGradientAngle = root.querySelector('[data-bg-gradient-angle]');
    this._bgGradientAngleValue = root.querySelector('[data-bg-gradient-angle-value]');
    this._bgGradientAngleRow = root.querySelector('[data-bg-gradient-angle-row]');
    this._bgGradientCenterRows = root.querySelector('[data-bg-gradient-center-rows]');
    this._bgGradientCenterX = root.querySelector('[data-bg-gradient-center-x]');
    this._bgGradientCenterXValue = root.querySelector('[data-bg-gradient-center-x-value]');
    this._bgGradientCenterY = root.querySelector('[data-bg-gradient-center-y]');
    this._bgGradientCenterYValue = root.querySelector('[data-bg-gradient-center-y-value]');
  }

  bind() {
    this._bindHdriControls();
    this._bindHdriBackgroundControls();
  }

  syncForLightTab() {
    this.syncSelectionFromScene();
    this.syncControls();
    this.syncBackground();
    this.syncPanel();
  }

  syncSelectionFromScene() {
    const { scene, selection } = this.ctx;
    const presetId = scene.getHdriPresetId();
    const item = MOBILE_HDRI.find((h) => h.id === presetId) ?? MOBILE_HDRI[0];
    selection.light = item;
  }

  syncPanel() {
    const { root, engagedPresetTabs, syncPresetSheetState } = this.ctx;
    const engaged = engagedPresetTabs.has('light');
    root.dataset.hdriPanel = engaged ? 'controls' : 'presets-only';
    if (this._controlsEl instanceof HTMLElement) {
      this._controlsEl.hidden = !engaged;
      this._controlsEl.classList.toggle('is-visible', engaged);
    }
    syncPresetSheetState();
  }

  syncControls() {
    const { scene } = this.ctx;
    const strength = scene.getHdriStrength();
    const blur = scene.getHdriBlurriness();

    if (this._brightnessInput instanceof HTMLInputElement) {
      this._brightnessInput.min = '0';
      this._brightnessInput.max = String(MOBILE_HDRI_STRENGTH_MAX);
      this._brightnessInput.value = String(strength);
      updateMobileSliderFill(this._brightnessInput);
    }
    if (this._brightnessValue instanceof HTMLElement) {
      this._brightnessValue.textContent = strength.toFixed(1);
    }

    if (this._blurInput instanceof HTMLInputElement) {
      this._blurInput.value = String(blur);
      updateMobileSliderFill(this._blurInput);
    }
    if (this._blurValue instanceof HTMLElement) {
      this._blurValue.textContent = blur.toFixed(2);
    }
  }

  syncBackground() {
    const { root, scene } = this.ctx;
    const backdropOn = scene.getHdriBackgroundEnabled();
    root.dataset.hdriBackdrop = backdropOn ? 'on' : 'off';
    const gradient = normalizeBackgroundGradient(scene.getBackgroundGradient());
    const bgColor = scene.getBackgroundColor();

    if (this._backgroundInput instanceof HTMLInputElement) {
      this._backgroundInput.checked = backdropOn;
    }
    if (this._bgControls instanceof HTMLElement) {
      this._bgControls.hidden = backdropOn;
    }
    if (this._bgSolidColorRow instanceof HTMLElement) {
      this._bgSolidColorRow.hidden = gradient.enabled;
    }
    this.colorPicker.syncSwatch(this._bgColorSwatch, bgColor);

    if (this._bgGradientEnabled instanceof HTMLInputElement) {
      this._bgGradientEnabled.checked = gradient.enabled;
    }
    if (this._bgGradientPanel instanceof HTMLElement) {
      this._bgGradientPanel.hidden = !gradient.enabled;
    }

    this._bgGradientTypeButtons.forEach((button) => {
      const type = button.getAttribute('data-bg-gradient-type');
      button.classList.toggle('is-active', type === gradient.type);
    });

    const stops = gradient.stops;
    this._bgGradientSwatches.forEach((button) => {
      const index = Number(button.getAttribute('data-bg-gradient-color'));
      this.colorPicker.syncSwatch(button, stops[index]?.color);
    });

    if (this._bgGradientAngle instanceof HTMLInputElement) {
      this._bgGradientAngle.value = String(gradient.angle);
      updateMobileSliderFill(this._bgGradientAngle);
    }
    if (this._bgGradientAngleValue instanceof HTMLElement) {
      this._bgGradientAngleValue.textContent = `${Math.round(gradient.angle)}°`;
    }
    if (this._bgGradientAngleRow instanceof HTMLElement) {
      this._bgGradientAngleRow.hidden = gradient.type !== 'linear';
    }
    if (this._bgGradientCenterRows instanceof HTMLElement) {
      this._bgGradientCenterRows.hidden = gradient.type !== 'radial';
    }
    if (this._bgGradientCenterX instanceof HTMLInputElement) {
      this._bgGradientCenterX.value = String(gradient.centerX);
      updateMobileSliderFill(this._bgGradientCenterX);
    }
    if (this._bgGradientCenterXValue instanceof HTMLElement) {
      this._bgGradientCenterXValue.textContent = `${Math.round(gradient.centerX)}%`;
    }
    if (this._bgGradientCenterY instanceof HTMLInputElement) {
      this._bgGradientCenterY.value = String(gradient.centerY);
      updateMobileSliderFill(this._bgGradientCenterY);
    }
    if (this._bgGradientCenterYValue instanceof HTMLElement) {
      this._bgGradientCenterYValue.textContent = `${Math.round(gradient.centerY)}%`;
    }
  }

  _bindHdriControls() {
    const { scene } = this.ctx;

    this._brightnessInput?.addEventListener('input', () => {
      const value = Number(this._brightnessInput?.value ?? MOBILE_HDRI_STRENGTH_DEFAULT);
      if (this._brightnessInput instanceof HTMLInputElement) {
        updateMobileSliderFill(this._brightnessInput);
      }
      if (this._brightnessValue instanceof HTMLElement) {
        this._brightnessValue.textContent = value.toFixed(1);
      }
      scene.setHdriStrength(value);
    });

    this._blurInput?.addEventListener('input', () => {
      const value = Number(this._blurInput?.value ?? 0);
      if (this._blurInput instanceof HTMLInputElement) {
        updateMobileSliderFill(this._blurInput);
      }
      if (this._blurValue instanceof HTMLElement) {
        this._blurValue.textContent = value.toFixed(2);
      }
      scene.setHdriBlurriness(value);
    });
  }

  _bindHdriBackgroundControls() {
    const { scene } = this.ctx;

    this._backgroundInput?.addEventListener('change', () => {
      const enabled = !!this._backgroundInput?.checked;
      scene.setHdriBackground(enabled);
      this.syncBackground();
    });

    this._bgGradientEnabled?.addEventListener('change', () => {
      const enabled = !!this._bgGradientEnabled?.checked;
      scene.setBackgroundGradient({ enabled });
      this.syncBackground();
    });

    this._bgGradientTypeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const type = button.getAttribute('data-bg-gradient-type');
        if (type !== 'linear' && type !== 'radial') return;
        scene.setBackgroundGradient({ type });
        this.syncBackground();
      });
    });

    this._bgGradientAngle?.addEventListener('input', () => {
      const angle = Number(this._bgGradientAngle?.value ?? 180);
      if (this._bgGradientAngle instanceof HTMLInputElement) {
        updateMobileSliderFill(this._bgGradientAngle);
      }
      if (this._bgGradientAngleValue instanceof HTMLElement) {
        this._bgGradientAngleValue.textContent = `${Math.round(angle)}°`;
      }
      scene.setBackgroundGradient({ angle });
    });

    this._bgGradientCenterX?.addEventListener('input', () => {
      const centerX = Number(this._bgGradientCenterX?.value ?? 50);
      if (this._bgGradientCenterX instanceof HTMLInputElement) {
        updateMobileSliderFill(this._bgGradientCenterX);
      }
      if (this._bgGradientCenterXValue instanceof HTMLElement) {
        this._bgGradientCenterXValue.textContent = `${Math.round(centerX)}%`;
      }
      scene.setBackgroundGradient({ centerX });
    });

    this._bgGradientCenterY?.addEventListener('input', () => {
      const centerY = Number(this._bgGradientCenterY?.value ?? 50);
      if (this._bgGradientCenterY instanceof HTMLInputElement) {
        updateMobileSliderFill(this._bgGradientCenterY);
      }
      if (this._bgGradientCenterYValue instanceof HTMLElement) {
        this._bgGradientCenterYValue.textContent = `${Math.round(centerY)}%`;
      }
      scene.setBackgroundGradient({ centerY });
    });
  }
}
