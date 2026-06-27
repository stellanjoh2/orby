import {
  cameraShadowsUiToShader,
  effectiveVignetteIntensity,
  isBloomTuningActive,
  isVignetteUiEnabled,
  sanitizeDof,
  DOF_UI_CONTROL_IDS,
} from '../constants.js';
import { LOOK_FILTER_CATALOG, mergeLookFilterState } from '../render/lookFilterPresets.js';

/**
 * Applies a look filter preset: updates state, syncs UI, drives the post stack via the same
 * events as manual controls and reset.
 */
export function applyLookFilterPreset({ eventBus, stateStore, ui, presetId }) {
  const defaults = stateStore.getDefaults();
  const current = stateStore.getState();
  const merged = mergeLookFilterState(presetId, defaults, current);
  const dof = merged.dof ? sanitizeDof(merged.dof) : merged.dof;
  const b =
    merged.dof && dof !== merged.dof ? { ...merged, dof } : merged;

  stateStore.setTopLevelBundle({
    lookFilterPreset: b.lookFilterPreset,
    camera: b.camera,
    bloom: b.bloom,
    grain: b.grain,
    aberration: b.aberration,
    dof: b.dof,
    exposure: b.exposure,
    autoExposure: b.autoExposure,
    toneCurve: b.toneCurve,
    toneMapping: b.toneMapping,
    lensDirt: b.lensDirt,
  });

  const cam = b.camera;

  eventBus.emit('render:contrast', cam.contrast);
  eventBus.emit('render:temperature', cam.temperature);
  eventBus.emit('render:tint', (cam.tint ?? 0) / 100);
  eventBus.emit('render:highlights', (cam.highlights ?? 0) / 100);
  eventBus.emit('render:shadows', cameraShadowsUiToShader(cam.shadows ?? 0));
  eventBus.emit('render:saturation', cam.saturation);
  eventBus.emit('render:clarity', cam.clarity ?? 0);
  eventBus.emit('render:fade', cam.fade ?? 0);
  eventBus.emit('render:sharpness', cam.sharpness ?? 0);
  const defaultCam = defaults.camera ?? {};
  eventBus.emit(
    'render:vignette',
    effectiveVignetteIntensity(cam, defaultCam),
  );
  eventBus.emit('render:vignette-color', cam.vignetteColor ?? '#080808');

  eventBus.emit('scene:exposure', b.exposure);
  eventBus.emit('camera:auto-exposure', b.autoExposure);

  eventBus.emit('render:tone-curve', stateStore.getState().toneCurve);
  eventBus.emit('render:tone-mapping', b.toneMapping);

  eventBus.emit('render:dof', b.dof);
  eventBus.emit('render:bloom', b.bloom);
  eventBus.emit('render:grain', b.grain);
  eventBus.emit('render:aberration', b.aberration);
  eventBus.emit('render:lens-dirt', b.lensDirt);

  if (ui?.renderControls?.syncDofUiState) {
    ui.renderControls.syncDofUiState(b.dof);
  } else if (ui?.setEffectControlsDisabled) {
    ui.setEffectControlsDisabled(DOF_UI_CONTROL_IDS, !b.dof.enabled);
  }

  if (ui?.setEffectControlsDisabled) {
    ui.setEffectControlsDisabled(
      [
        'bloomThreshold',
        'bloomStrength',
        'bloomRadius',
        'bloomColor',
        'bloomQuality',
      ],
      !isBloomTuningActive(b),
    );
    ui.setEffectControlsDisabled(['grainIntensity', 'grainScale'], !b.grain.enabled);
    ui.setEffectControlsDisabled(
      ['aberrationAmount'],
      !b.aberration.enabled,
    );
    ui.setEffectControlsDisabled(
      ['lensDirtStrength', 'lensDirtTintColor'],
      !b.lensDirt?.enabled,
    );
    ui.setEffectControlsDisabled(['exposure'], b.autoExposure);
    ui.setEffectControlsDisabled(
      ['vignetteIntensity', 'vignetteColor'],
      !isVignetteUiEnabled(b.camera ?? {}),
    );
  }

  eventBus.emit('render:apply-performance');
  // State already updated via one notify(); subscribers ran syncControls — no second full sync

  const label = LOOK_FILTER_CATALOG.find((entry) => entry.id === presetId)?.label ?? presetId;
  ui?.showToast?.(
    presetId === 'none' ? 'Look cleared' : `Look applied — ${label}`,
    3200,
    { notification: false },
  );
}
