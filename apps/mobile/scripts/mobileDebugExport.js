import { MOBILE_BLOOM_RESOLUTION_SCALE } from './mobileParityDefaults.js';
import { MOBILE_FX_DEFAULTS } from './mobileFxDefaults.js';
import { mobileAssetUrl } from './mobileCatalog.js';

/** Stitched Memories bear — same sample as desktop “Load test object”. */
const MOBILE_DEBUG_SAMPLE_PATH = '3D-assets/Stitched_Memories_1122161936_texture.glb';
const MOBILE_DEBUG_SAMPLE_NAME = 'Stitched_Memories_1122161936_texture.glb';

/**
 * Build a desktop-shaped settings blob for mobile ↔ studio debugging.
 * @param {import('./MobileScene.js').MobileScene} scene
 * @param {{ light: { id: string }, style: { id: string }, filters: { id: string } }} selection
 */
export function buildMobileDebugSettings(scene, selection) {
  const fx = scene.getFxSnapshot();
  const state = fx.state ?? {};
  const studioState = scene.creativeLooks?.stateStore?.getState?.() ?? {};
  const cam = scene.camera;
  const target = scene.controls?.target;

  return {
    _orbyMobile: true,
    _exportedAt: new Date().toISOString(),
    _modelFileName: scene.getCurrentFileName?.() ?? null,

    hdri: fx.hdriPresetId ?? 'beach',
    hdriStrength: fx.hdriStrength ?? 2,
    hdriBlurriness: fx.hdriBlurriness ?? 0,
    hdriEnabled: true,
    effectiveHdriIntensity: scene.getEffectiveHdriIntensity?.() ?? null,

    creativeLook: selection.style?.id ?? 'none',
    lookFilterPreset: fx.lookFilterPreset ?? selection.filters?.id ?? 'none',

    exposure: fx.exposure ?? MOBILE_FX_DEFAULTS.exposure,
    toneMapping: state.toneMapping ?? MOBILE_FX_DEFAULTS.toneMapping,

    material: {
      brightness: studioState.material?.brightness ?? null,
      metalness: studioState.material?.metalness ?? null,
      roughness: studioState.material?.roughness ?? null,
      emissive: studioState.material?.emissive ?? null,
      importHasMrMaps: studioState.material?.importHasMrMaps ?? false,
    },

    camera: {
      fov: fx.fov ?? cam?.fov ?? 45,
      contrast: fx.contrast ?? state.camera?.contrast ?? 1,
      saturation: fx.saturation ?? state.camera?.saturation ?? 1,
      temperature: fx.temperature ?? state.camera?.temperature ?? 6500,
      tint: fx.tint ?? state.camera?.tint ?? 0,
      highlights: fx.highlights ?? state.camera?.highlights ?? 0,
      shadows: fx.shadows ?? state.camera?.shadows ?? 0,
      clarity: fx.clarity ?? state.camera?.clarity ?? 0,
      fade: fx.fade ?? state.camera?.fade ?? 0,
      sharpness: fx.sharpness ?? state.camera?.sharpness ?? 0,
      vignetteEnabled: fx.vignetteEnabled ?? state.camera?.vignetteEnabled ?? false,
      vignette: fx.vignette ?? state.camera?.vignette ?? 0,
      position: cam
        ? { x: cam.position.x, y: cam.position.y, z: cam.position.z }
        : null,
      target: target
        ? { x: target.x, y: target.y, z: target.z }
        : null,
    },

    bloom: state.bloom ?? {
      enabled: fx.bloomEnabled ?? MOBILE_FX_DEFAULTS.bloom.enabled,
      strength: fx.bloomStrength ?? MOBILE_FX_DEFAULTS.bloom.strength,
      threshold: MOBILE_FX_DEFAULTS.bloom.threshold,
    },

    grain: state.grain ?? MOBILE_FX_DEFAULTS.grain,
    aberration: state.aberration ?? MOBILE_FX_DEFAULTS.aberration,
    toneCurve: state.toneCurve ?? MOBILE_FX_DEFAULTS.toneCurve,

    /** Full mobile post state (includes lens rows). */
    mobilePostState: state,

    /** Mobile pipeline constants (not UI offsets). */
    mobilePipeline: {
      bloomResolutionScale: MOBILE_BLOOM_RESOLUTION_SCALE,
    },
  };
}

/**
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through */
    }
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.append(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/**
 * @param {import('./MobileScene.js').MobileScene} scene
 * @param {{ light: { id: string }, style: { id: string }, filters: { id: string } }} selection
 * @returns {Promise<'copied' | 'failed'>}
 */
export async function copyMobileDebugSettings(scene, selection) {
  const payload = buildMobileDebugSettings(scene, selection);
  const text = JSON.stringify(payload, null, 2);
  const ok = await copyTextToClipboard(text);
  return ok ? 'copied' : 'failed';
}

/**
 * @param {import('./MobileScene.js').MobileScene} scene
 * @returns {Promise<'loaded' | 'failed'>}
 */
export async function loadMobileDebugSample(scene) {
  try {
    const response = await fetch(mobileAssetUrl(MOBILE_DEBUG_SAMPLE_PATH));
    if (!response.ok) {
      throw new Error(`Failed to fetch sample: ${response.statusText}`);
    }
    const blob = await response.blob();
    const file = new File([blob], MOBILE_DEBUG_SAMPLE_NAME, { type: 'model/gltf-binary' });
    await scene.loadFile(file);
    return 'loaded';
  } catch (err) {
    console.error('[Orby Mobile] Debug sample load failed', err);
    return 'failed';
  }
}
