import { DEFAULT_GOBO_TEXTURE_ID, DEFAULT_GOBO_SOFTNESS } from '../config/gobos.js';
import {
  GOBO_UI_DEFAULT,
  normalizeStoredGoboScale,
} from '../render/GoboProjection.js';

export class GoboControls {
  constructor(eventBus, stateStore, ui, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = ui;
    this.helpers = helpers;
  }

  bind() {
    const syncGoboChrome = () => {
      const gobo = this.stateStore.getState().gobo ?? {};
      const open = !!gobo.panelOpen;
      const container = document.querySelector('#keyLightGoboFoldout');
      if (container) {
        container.classList.toggle('creative-look-foldout--collapsed', !open);
        container.classList.toggle('creative-look-foldout--expanded', open);
      }
      this.ui.inputs.keyLightGoboBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
      this.ui.inputs.keyLightGoboBtn?.classList.toggle(
        'is-active',
        open || gobo.enabled === true,
      );
    };

    syncGoboChrome();

    this.ui.inputs.keyLightGoboBtn?.addEventListener('click', () => {
      const state = this.stateStore.getState();
      const open = !state.gobo?.panelOpen;
      this.ui.uiSounds?.playSelect?.();
      this.stateStore.set('gobo.panelOpen', open);
      if (open && !state.gobo?.enabled) {
        this.stateStore.set('gobo.enabled', true);
        if (this.ui.inputs.goboEnabled) {
          this.ui.inputs.goboEnabled.checked = true;
        }
        this.eventBus.emit('lights:gobo-enabled', true);
      }
      syncGoboChrome();
    });

    this.ui.inputs.goboButtons?.forEach((button) => {
      button.addEventListener('click', () => {
        const textureId = button.dataset.gobo;
        if (!textureId) return;
        const current = this.stateStore.getState().gobo?.texture ?? DEFAULT_GOBO_TEXTURE_ID;
        if (textureId !== current) this.ui.uiSounds?.playSelect?.();
        this.stateStore.batch(() => {
          this.stateStore.set('gobo.texture', textureId);
          this.stateStore.set('gobo.enabled', true);
        });
        this.setGoboActive(textureId);
        this.eventBus.emit('lights:gobo-texture', textureId);
        this.eventBus.emit('lights:gobo-enabled', true);
      });
    });

    document.querySelectorAll('#goboGrid .hdri-icon img').forEach((img) => {
      img.addEventListener('error', () => {
        img.style.display = 'none';
      }, { once: true });
    });

    this.ui.inputs.goboEnabled?.addEventListener('change', (event) => {
      const enabled = event.target.checked;
      this.stateStore.set('gobo.enabled', enabled);
      this.eventBus.emit('lights:gobo-enabled', enabled);
    });

    this.ui.inputs.goboSoftness?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('goboSoftness', value, 'decimal', 2);
      this.stateStore.set('gobo.softness', value);
      this.eventBus.emit('lights:gobo-softness', value);
    });

    this.ui.inputs.goboSoftnessQuality?.addEventListener('change', (event) => {
      const value = event.target.value || 'medium';
      this.stateStore.set('gobo.softnessQuality', value);
      this.eventBus.emit('lights:gobo-softness-quality', value);
    });

    this.ui.inputs.goboScale?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('goboScale', value, 'decimal', 2);
      this.stateStore.batch(() => {
        this.stateStore.set('gobo.scale', value);
        this.stateStore.set('gobo.scaleSpace', 'ui');
      });
      this.eventBus.emit('lights:gobo-scale', value);
    });

    this.ui.inputs.goboRotation?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this.helpers.updateValueLabel('goboRotation', value, 'angle');
      this.stateStore.set('gobo.rotation', value);
      this.eventBus.emit('lights:gobo-rotation', value);
    });

    if (this.ui.inputs.goboSoftness) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.goboSoftness);
    }
    if (this.ui.inputs.goboScale) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.goboScale);
    }
    if (this.ui.inputs.goboRotation) {
      this.helpers.enableSliderKeyboardStepping(this.ui.inputs.goboRotation);
    }
  }

  setGoboActive(textureId) {
    this.ui.inputs.goboButtons?.forEach((button) => {
      button.classList.toggle('active', button.dataset.gobo === textureId);
    });
  }

  sync(state) {
    const gobo = state.gobo ?? {};
    const textureId = gobo.texture ?? DEFAULT_GOBO_TEXTURE_ID;
    this.setGoboActive(textureId);

    const container = document.querySelector('#keyLightGoboFoldout');
    if (container) {
      const open = !!gobo.panelOpen;
      container.classList.toggle('creative-look-foldout--collapsed', !open);
      container.classList.toggle('creative-look-foldout--expanded', open);
    }
    if (this.ui.inputs.keyLightGoboBtn) {
      this.ui.inputs.keyLightGoboBtn.setAttribute('aria-expanded', gobo.panelOpen ? 'true' : 'false');
      this.ui.inputs.keyLightGoboBtn.classList.toggle('is-active', !!gobo.panelOpen || gobo.enabled === true);
    }
    if (this.ui.inputs.goboEnabled) {
      this.ui.inputs.goboEnabled.checked = gobo.enabled === true;
    }
    if (this.ui.inputs.goboSoftness) {
      const softness = Number.isFinite(gobo.softness) ? gobo.softness : DEFAULT_GOBO_SOFTNESS;
      this.ui.inputs.goboSoftness.value = softness;
      this.helpers.updateValueLabel('goboSoftness', softness, 'decimal', 2);
    }
    if (this.ui.inputs.goboSoftnessQuality) {
      this.ui.inputs.goboSoftnessQuality.value = gobo.softnessQuality ?? 'medium';
    }
    if (this.ui.inputs.goboScale) {
      const scale = normalizeStoredGoboScale(gobo.scale, gobo.scaleSpace) ?? GOBO_UI_DEFAULT;
      this.ui.inputs.goboScale.value = scale;
      this.helpers.updateValueLabel('goboScale', scale, 'decimal', 2);
    }
    if (this.ui.inputs.goboRotation) {
      const rotation = Number.isFinite(gobo.rotation) ? gobo.rotation : 0;
      this.ui.inputs.goboRotation.value = rotation;
      this.helpers.updateValueLabel('goboRotation', rotation, 'angle');
    }
  }
}
