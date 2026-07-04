import {
  isAnamorphicBloomPipelineActive,
  isBloomPipelineActive,
  isBloomTuningActive,
  isCreativeLookViewportPostActive,
} from '../constants.js';
import {
  isFlatPostCreativeLookPreset,
  isVectrexCreativeLookPreset,
  isWatercolourCreativeLookPreset,
  isGouacheCreativeLookPreset,
  isSketchFamilyCreativeLookPreset,
  normalizeCreativeLookPreset,
  creativeLookPresetAllowsAmbientOcclusion,
} from '../render/CreativeLookMaterials.js';

/** @typedef {'default' | 'viewport-bloom' | 'flat-post' | 'watercolour' | 'gouache' | 'sketch' | 'vectrex'} CreativeLookPostFxMode */

/** Camera & FX + grading controls that map to `data-subsection` keys. */
export const CREATIVE_LOOK_POST_FX_SUBSECTIONS = /** @type {const} */ ([
  'ambient-occlusion',
  'dof',
  'volumetric-scattering',
  'bloom',
  'anamorphic-lens-flare',
  'lens-dirt',
  'grain',
  'vignette',
  'aberration',
  'fisheye',
  'color-tone',
  'tone-curve',
  'look-filters',
]);

const AO_INPUTS = [
  'toggleAmbientOcclusion',
  'ambientOcclusionIntensity',
  'ambientOcclusionRadius',
  'ambientOcclusionColor',
  'ambientOcclusionQuality',
];

const DOF_INPUTS = ['toggleDof', 'dofFocus', 'dofAperture', 'dofQuality'];

const BLOOM_INPUTS = [
  'toggleBloom',
  'bloomThreshold',
  'bloomStrength',
  'bloomRadius',
  'bloomColor',
  'bloomQuality',
];

const ANAMORPHIC_INPUTS = [
  'anamorphicBloomEnabled',
  'anamorphicBloomStrength',
  'anamorphicBloomSpread',
  'anamorphicBloomStreakAngle',
  'anamorphicBloomThreshold',
  'anamorphicBloomSoften',
  'anamorphicBloomStreakTint',
  'anamorphicBloomQuality',
];

const GRAIN_INPUTS = ['toggleGrain', 'grainIntensity', 'grainScale'];

const LENS_DIRT_INPUTS = ['lensDirtEnabled', 'lensDirtStrength', 'lensDirtTintColor'];

const ABERRATION_INPUTS = [
  'toggleAberration',
  'aberrationAmount',
  'aberrationBlur',
  'aberrationFalloff',
  'aberrationQuality',
];

const VIGNETTE_INPUTS = ['toggleVignette', 'vignetteIntensity', 'vignetteColor'];

const FISHEYE_INPUTS = [
  'fisheyeEnabled',
  'fisheyeHorizontalFOV',
  'fisheyeStrength',
  'fisheyeCylindricalRatio',
];

const GOD_RAYS_INPUTS = [
  'godRaysEnabled',
  'godRaysColor',
  'godRaysLightScale',
  'godRaysOpacity',
  'godRaysDensity',
  'godRaysDecay',
  'godRaysWeight',
  'godRaysExposure',
  'godRaysClampMax',
  'godRaysBlur',
  'godRaysQuality',
];

const COLOR_TONE_INPUTS = [
  'cameraTemperature',
  'cameraTint',
  'cameraContrast',
  'cameraHighlights',
  'cameraShadows',
  'cameraSaturation',
  'cameraClarity',
  'cameraFade',
  'cameraSharpness',
];

const GRADING_INPUTS = [
  ...COLOR_TONE_INPUTS,
  'exposure',
  'autoExposure',
  'toneMapping',
  'antiAliasing',
  'toneCurveOpen',
  'lookFilterPresetsOpen',
];

/** Camera tab exposure — kept live in Shader Lab (grading pass applies it). */
const EXPOSURE_INPUTS = ['exposure', 'autoExposure'];

const SUBSECTION_INPUTS = /** @type {Record<string, string[]>} */ ({
  'ambient-occlusion': AO_INPUTS,
  dof: DOF_INPUTS,
  bloom: BLOOM_INPUTS,
  'anamorphic-lens-flare': ANAMORPHIC_INPUTS,
  'lens-dirt': LENS_DIRT_INPUTS,
  grain: GRAIN_INPUTS,
  aberration: ABERRATION_INPUTS,
  vignette: VIGNETTE_INPUTS,
  fisheye: FISHEYE_INPUTS,
  'volumetric-scattering': GOD_RAYS_INPUTS,
  'color-tone': COLOR_TONE_INPUTS,
  'tone-curve': ['toneCurveOpen'],
  'look-filters': ['lookFilterPresetsOpen'],
});

/** Shown when the user clicks a Cam/FX control blocked by Shader Lab. */
export const SHADER_LAB_BLOCKED_TOOLTIP =
  'Currently not available while in Shader Lab';

/** Section master toggles Shader Lab may disable — restored when Shader Lab turns off. */
const SHADER_LAB_MASTER_TOGGLES = /** @type {const} */ ([
  'toggleAmbientOcclusion',
  'toggleDof',
  'godRaysEnabled',
  'toggleBloom',
  'lensDirtEnabled',
  'toggleGrain',
  'toggleAberration',
  'toggleVignette',
  'fisheyeEnabled',
  'anamorphicBloomEnabled',
  'lensFlareEnabled',
  'histogramEnabled',
  'toneCurveOpen',
  'lookFilterPresetsOpen',
]);

/** @type {Set<Element>} */
let _shaderLabBlockedMarked = new Set();

/** @param {Element | null | undefined} el */
function markShaderLabBlocked(el) {
  if (!el || !(el instanceof Element)) return;
  el.setAttribute('data-shader-lab-blocked', 'true');
  _shaderLabBlockedMarked.add(el);
  const row = el.closest?.('.slider-line, .select-line, .color-line, .effect-toggle');
  if (row && row !== el) {
    row.setAttribute('data-shader-lab-blocked', 'true');
    _shaderLabBlockedMarked.add(row);
  }
}

export function clearShaderLabBlockedMarks() {
  for (const el of _shaderLabBlockedMarked) {
    el.removeAttribute('data-shader-lab-blocked');
  }
  _shaderLabBlockedMarked.clear();
}

/**
 * @param {object} state
 * @returns {{
 *   mode: CreativeLookPostFxMode,
 *   mutedSubsections: Set<string>,
 *   clickBlockedSubsections: Set<string>,
 *   disabledInputs: Set<string>,
 * } | null}
 */
export function getCreativeLookPostFxUiBlocks(state) {
  const cl = state?.creativeLook ?? {};
  if (cl.enabled !== true) return null;

  const viewportBloom = isCreativeLookViewportPostActive(state);
  const bloomTuningActive = isBloomTuningActive(state);
  const flatPost = isFlatPostCreativeLookPreset(normalizeCreativeLookPreset(cl.preset));
  const watercolour = isWatercolourCreativeLookPreset(cl.preset);
  const gouache = isGouacheCreativeLookPreset(cl.preset);
  const sketch = isSketchFamilyCreativeLookPreset(cl.preset);
  const vectrex = isVectrexCreativeLookPreset(cl.preset);
  const bloomCamFxOn = isBloomPipelineActive(state);

  /** @type {Set<string>} */
  const mutedSubsections = new Set();
  /** @type {Set<string>} */
  const clickBlockedSubsections = new Set();
  /** @type {Set<string>} */
  const disabledInputs = new Set();

  const mute = (key, { clickBlocked = true } = {}) => {
    mutedSubsections.add(key);
    if (clickBlocked) clickBlockedSubsections.add(key);
    for (const id of SUBSECTION_INPUTS[key] ?? []) {
      disabledInputs.add(id);
    }
  };

  const disable = (...ids) => {
    for (const id of ids) disabledInputs.add(id);
  };

  /** @type {CreativeLookPostFxMode} */
  let mode = 'default';

  if (watercolour) {
    mode = 'watercolour';
    mute('ambient-occlusion');
    mute('dof');
    mute('volumetric-scattering');
    mute('lens-dirt');
    mute('aberration');
    mute('fisheye');
    mute('vignette');
    mute('color-tone');
    mute('tone-curve');
    mute('look-filters');
    mute('anamorphic-lens-flare');
    disable('toneMapping', 'antiAliasing', 'toggleBloom');
    if (!viewportBloom) {
      mute('bloom');
    }
  } else if (gouache) {
    mode = 'gouache';
    mute('ambient-occlusion');
    mute('dof');
    mute('volumetric-scattering');
    mute('lens-dirt');
    mute('aberration');
    mute('fisheye');
    mute('vignette');
    mute('color-tone');
    mute('tone-curve');
    mute('look-filters');
    mute('anamorphic-lens-flare');
    disable('toneMapping', 'antiAliasing', 'toggleBloom');
    if (!viewportBloom) {
      mute('bloom');
    }
  } else if (sketch) {
    mode = 'sketch';
    mute('ambient-occlusion');
    mute('dof');
    mute('volumetric-scattering');
    mute('lens-dirt');
    mute('aberration');
    mute('fisheye');
    mute('vignette');
    mute('color-tone');
    mute('tone-curve');
    mute('look-filters');
    mute('anamorphic-lens-flare');
    disable('toneMapping', 'antiAliasing', 'toggleBloom');
    if (!viewportBloom) {
      mute('bloom');
    }
  } else if (vectrex) {
    mode = 'vectrex';
    mute('ambient-occlusion');
    mute('dof');
    mute('volumetric-scattering');
    mute('lens-dirt');
    mute('aberration');
    mute('fisheye');
    mute('vignette');
    mute('color-tone');
    mute('tone-curve');
    mute('look-filters');
    mute('anamorphic-lens-flare');
    disable('toneMapping', 'antiAliasing', 'toggleBloom');
    if (!viewportBloom) {
      mute('bloom');
    }
  } else if (flatPost) {
    mode = 'flat-post';
    mute('ambient-occlusion');
    mute('dof');
    mute('volumetric-scattering');
    mute('lens-dirt');
    mute('fisheye');
    mute('vignette');
    mute('color-tone');
    mute('tone-curve');
    mute('look-filters');
    disable('toneMapping', 'antiAliasing');
    if (!bloomCamFxOn && !viewportBloom) {
      mute('bloom');
    }
    if (!isAnamorphicBloomPipelineActive(state)) {
      mute('anamorphic-lens-flare');
    }
  } else if (viewportBloom) {
    mode = 'viewport-bloom';
    mute('ambient-occlusion');
    mute('dof');
    mute('volumetric-scattering');
    mute('lens-dirt');
    mute('color-tone');
    mute('tone-curve');
    mute('look-filters');
    disable('toneMapping', 'antiAliasing');
    disable('toggleBloom');
  } else {
    // Default Shader Lab — Cam/FX bloom toggle off; use Shader Lab Bloom toggle instead.
    disable('toggleBloom');
  }

  // Shader Lab bloom uses Cam/FX threshold/strength/radius sliders — keep subsection live.
  if (bloomTuningActive) {
    mutedSubsections.delete('bloom');
    clickBlockedSubsections.delete('bloom');
    for (const id of BLOOM_INPUTS) {
      if (id !== 'toggleBloom') disabledInputs.delete(id);
    }
  }

  if (cl.enabled) {
    disabledInputs.add('toggleBloom');
  }

  if (creativeLookPresetAllowsAmbientOcclusion(cl.preset)) {
    mutedSubsections.delete('ambient-occlusion');
    clickBlockedSubsections.delete('ambient-occlusion');
    for (const id of AO_INPUTS) disabledInputs.delete(id);
  }

  return {
    mode,
    mutedSubsections,
    clickBlockedSubsections,
    disabledInputs,
  };
}

/**
 * Apply Shader Lab post-FX UI blocks after normal toggle muting.
 * @param {object} state
 * @param {{
 *   setMuted: (key: string, muted: boolean) => void,
 *   setControlsDisabled: (ids: string[], disabled: boolean) => void,
 *   getSubsection?: (key: string) => Element | null | undefined,
 *   getInput?: (id: string) => Element | null | undefined,
 * }} api
 */
export function applyCreativeLookPostFxUiBlocks(state, api) {
  clearShaderLabBlockedMarks();
  const blocks = getCreativeLookPostFxUiBlocks(state);
  if (!blocks) {
    // Shader Lab previously set disabled on master toggles; re-enable when it is off.
    api.setControlsDisabled([...SHADER_LAB_MASTER_TOGGLES], false);
    return;
  }

  for (const key of blocks.mutedSubsections) {
    api.setMuted(key, true);
  }
  for (const key of blocks.clickBlockedSubsections) {
    markShaderLabBlocked(api.getSubsection?.(key));
  }

  const blocked = blocks.disabledInputs;
  api.setControlsDisabled([...blocked], true);
  for (const id of blocked) {
    markShaderLabBlocked(api.getInput?.(id));
  }

  // Shader Lab only disables inputs — re-enable master toggles when the stack allows them
  // again (e.g. flat-post → neon-edge). Slider disabled state comes from renderControls.sync.
  for (const id of SHADER_LAB_MASTER_TOGGLES) {
    if (!blocked.has(id)) {
      api.setControlsDisabled([id], false);
    }
  }

  const bloomTuningActive = isBloomTuningActive(state);
  api.setMuted('bloom', !bloomTuningActive);
  const bloomSliders = BLOOM_INPUTS.filter((id) => id !== 'toggleBloom');
  api.setControlsDisabled(bloomSliders, !bloomTuningActive);
  api.setControlsDisabled(EXPOSURE_INPUTS, false);
  api.setControlsDisabled(['toggleGrain'], false);
  api.setControlsDisabled(['grainIntensity', 'grainScale'], !state?.grain?.enabled);
  if (!blocked.has('toggleAberration')) {
    api.setControlsDisabled(['toggleAberration'], false);
    api.setControlsDisabled(
      ['aberrationAmount', 'aberrationBlur', 'aberrationFalloff', 'aberrationQuality'],
      !state?.aberration?.enabled,
    );
  }

  if (creativeLookPresetAllowsAmbientOcclusion(state.creativeLook?.preset)) {
    const aoOn = !!state?.ambientOcclusion?.enabled;
    api.setMuted('ambient-occlusion', !aoOn);
    api.setControlsDisabled(['toggleAmbientOcclusion'], false);
    if (!blocked.has('toggleAmbientOcclusion')) {
      for (const id of AO_INPUTS) {
        if (id === 'toggleAmbientOcclusion') continue;
        api.setControlsDisabled([id], !aoOn);
      }
    }
  }
}

let _shaderLabBlockedClickBound = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let _shaderLabBlockedHintTimer = null;

/**
 * Clicking a Shader Lab–blocked control shows a small cursor popup (tooltip).
 * @param {{
 *   root?: Element | null,
 *   isShaderLabActive?: () => boolean,
 *   getTooltips?: () => { showAtPoint?: (x: number, y: number, text: string) => void, hideTooltip?: () => void } | null | undefined,
 * }} [options]
 */
export function bindShaderLabBlockedClickHints(options = {}) {
  if (_shaderLabBlockedClickBound) return;
  const root = options.root ?? document.querySelector('.panels');
  if (!root) return;
  _shaderLabBlockedClickBound = true;

  root.addEventListener(
    'click',
    (event) => {
      const isActive = options.isShaderLabActive?.() === true;
      if (!isActive) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const blocked = target.closest('[data-shader-lab-blocked]');
      if (!blocked) return;

      const tooltips = options.getTooltips?.();
      if (!tooltips?.showAtPoint) return;

      tooltips.showAtPoint(event.clientX, event.clientY, SHADER_LAB_BLOCKED_TOOLTIP);
      if (_shaderLabBlockedHintTimer) clearTimeout(_shaderLabBlockedHintTimer);
      _shaderLabBlockedHintTimer = setTimeout(() => {
        _shaderLabBlockedHintTimer = null;
        tooltips.hideTooltip?.();
      }, 2400);

      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}
