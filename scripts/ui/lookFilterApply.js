import {
  cameraShadowsUiToShader,
  effectiveVignetteIntensity,
  isBloomTuningActive,
  isVignetteUiEnabled,
  sanitizeDof,
  DOF_UI_CONTROL_IDS,
} from '../constants.js';
import { LOOK_FILTER_CATALOG, mergeLookFilterState } from '../render/lookFilterPresets.js';

const LOOK_FILTER_BUNDLE_KEYS = [
  'lookFilterPreset',
  'camera',
  'bloom',
  'grain',
  'aberration',
  'dof',
  'exposure',
  'autoExposure',
  'toneCurve',
  'toneMapping',
  'lensDirt',
];

/** @param {import('../state/StateStore.js').StateStore} stateStore */
export function captureLookFilterSnapshot(stateStore) {
  const state = stateStore.getState();
  return Object.fromEntries(
    LOOK_FILTER_BUNDLE_KEYS.map((key) => [key, structuredClone(state[key])]),
  );
}

/**
 * @param {{
 *   eventBus: import('../EventBus.js').EventBus,
 *   stateStore: import('../state/StateStore.js').StateStore,
 *   ui?: object,
 *   bundle: object,
 *   silent?: boolean,
 * }} opts
 */
function applyLookFilterBundle({ eventBus, stateStore, ui, bundle, silent = false }) {
  const defaults = stateStore.getDefaults();
  const dof = bundle.dof ? sanitizeDof(bundle.dof) : bundle.dof;
  const b = bundle.dof && dof !== bundle.dof ? { ...bundle, dof } : bundle;

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
      ['aberrationAmount', 'aberrationBlur', 'aberrationFalloff', 'aberrationQuality'],
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

  if (silent) return;

  const presetId = b.lookFilterPreset;
  const label = LOOK_FILTER_CATALOG.find((entry) => entry.id === presetId)?.label ?? presetId;
  ui?.showToast?.(
    presetId === 'none' ? 'Look cleared' : `Look applied — ${label}`,
    3200,
    { notification: false },
  );
}

/**
 * @param {{
 *   eventBus: import('../EventBus.js').EventBus,
 *   stateStore: import('../state/StateStore.js').StateStore,
 *   ui?: object,
 *   snapshot: object,
 *   silent?: boolean,
 * }} opts
 */
export function restoreLookFilterSnapshot({ eventBus, stateStore, ui, snapshot, silent = true }) {
  applyLookFilterBundle({
    eventBus,
    stateStore,
    ui,
    bundle: snapshot,
    silent,
  });
}

/**
 * Applies a look filter preset: updates state, syncs UI, drives the post stack via the same
 * events as manual controls and reset.
 */
export function applyLookFilterPreset({ eventBus, stateStore, ui, presetId, silent = false }) {
  const defaults = stateStore.getDefaults();
  const current = stateStore.getState();
  const merged = mergeLookFilterState(presetId, defaults, current);
  applyLookFilterBundle({
    eventBus,
    stateStore,
    ui,
    bundle: merged,
    silent,
  });
}
