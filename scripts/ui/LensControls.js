/**
 * LensControls — focal-length presets, sensor format, and FOV (Camera tab).
 */
import {
  DEFAULT_LENS_SENSOR_ID,
  LENS_FOCAL_PRESETS,
  LENS_SENSORS,
  clampFovDeg,
  focalLengthToVerticalFovDeg,
  fovMatchesLensPreset,
  inferPresetFocalFromFov,
} from '../camera/lensPresets.js';

const FOV_MIN = 10;
const FOV_MAX = 120;

export class LensControls {
  constructor(eventBus, stateStore, uiManager, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
    this._presetButtons = [];
    this._syncing = false;
  }

  bind() {
    const grid = document.querySelector('.lens-preset-grid');
    if (grid) {
      this._presetButtons = [...grid.querySelectorAll('[data-lens-focal]')];
      this._presetButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const focalMm = Number(btn.dataset.lensFocal);
          if (!Number.isFinite(focalMm)) return;
          this.applyPreset(focalMm);
        });
      });
    }

    if (this.ui.inputs.lensSensor) {
      this.ui.inputs.lensSensor.addEventListener('change', (event) => {
        const sensorId = event.target.value;
        const state = this.stateStore.getState();
        const cam = state.camera ?? {};
        const focalMm = cam.lensFocalMm;
        this.stateStore.batch(() => {
          this.stateStore.set('camera.lensSensorId', sensorId);
          if (focalMm != null && Number.isFinite(focalMm)) {
            const fov = clampFovDeg(
              focalLengthToVerticalFovDeg(focalMm, sensorId),
              FOV_MIN,
              FOV_MAX,
            );
            this.stateStore.set('camera.fov', fov);
          }
        });
        const next = this.stateStore.getState();
        if (next.camera?.lensFocalMm != null) {
          this.eventBus.emit('camera:fov', next.camera.fov);
        }
        this.sync(next);
      });
    }

    if (this.ui.inputs.cameraFov) {
      this.ui.inputs.cameraFov.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        if (!Number.isFinite(value)) return;
        this.helpers.updateValueLabel('cameraFov', value, 'angle');
        const cam = this.stateStore.getState().camera ?? {};
        const sensorId = cam.lensSensorId ?? DEFAULT_LENS_SENSOR_ID;
        const stillMatches =
          cam.lensFocalMm != null &&
          fovMatchesLensPreset(value, cam.lensFocalMm, sensorId);
        this.stateStore.batch(() => {
          this.stateStore.set('camera.fov', value);
          if (!stillMatches) {
            this.stateStore.set('camera.lensFocalMm', null);
          }
        });
        this.eventBus.emit('camera:fov', value);
        this._updatePresetSelection(
          stillMatches ? cam.lensFocalMm : null,
        );
      });
      this.helpers.enableSliderKeyboardStepping?.(this.ui.inputs.cameraFov);
    }
  }

  applyPreset(focalMm) {
    const state = this.stateStore.getState();
    const sensorId = state.camera?.lensSensorId ?? DEFAULT_LENS_SENSOR_ID;
    const fov = clampFovDeg(
      focalLengthToVerticalFovDeg(focalMm, sensorId),
      FOV_MIN,
      FOV_MAX,
    );
    this.stateStore.batch(() => {
      this.stateStore.set('camera.lensFocalMm', focalMm);
      this.stateStore.set('camera.lensSensorId', sensorId);
      this.stateStore.set('camera.fov', fov);
    });
    this.helpers.updateValueLabel('cameraFov', fov, 'angle');
    if (this.ui.inputs.cameraFov) {
      this.ui.inputs.cameraFov.value = fov;
    }
    this.eventBus.emit('camera:fov', fov);
    this._updatePresetSelection(focalMm);
  }

  setFovDisabled(disabled) {
    if (this.ui.inputs.cameraFov) {
      this.ui.inputs.cameraFov.disabled = disabled;
    }
    if (this._presetButtons.length) {
      for (const btn of this._presetButtons) {
        btn.disabled = disabled;
      }
    }
    if (this.ui.inputs.lensSensor) {
      this.ui.inputs.lensSensor.disabled = disabled;
    }
  }

  _updatePresetSelection(activeFocalMm) {
    for (const btn of this._presetButtons) {
      const focal = Number(btn.dataset.lensFocal);
      const on =
        activeFocalMm != null &&
        Number.isFinite(focal) &&
        focal === activeFocalMm;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  sync(state) {
    if (this._syncing) return;
    this._syncing = true;
    try {
      const cam = state.camera ?? {};
      const feOn = !!state.fisheye?.enabled;
      this.setFovDisabled(feOn);

      const sensorId = cam.lensSensorId ?? DEFAULT_LENS_SENSOR_ID;
      if (this.ui.inputs.lensSensor) {
        this.ui.inputs.lensSensor.value = LENS_SENSORS[sensorId]
          ? sensorId
          : DEFAULT_LENS_SENSOR_ID;
      }

      const fov = cam.fov ?? 45;
      if (this.ui.inputs.cameraFov) {
        this.ui.inputs.cameraFov.value = fov;
        this.helpers.updateValueLabel('cameraFov', fov, 'angle');
      }

      let activeFocal = cam.lensFocalMm;
      if (activeFocal != null && !fovMatchesLensPreset(fov, activeFocal, sensorId)) {
        activeFocal = null;
      }
      if (activeFocal == null) {
        activeFocal = inferPresetFocalFromFov(fov, sensorId);
      }
      this._updatePresetSelection(activeFocal);
    } finally {
      this._syncing = false;
    }
  }
}
