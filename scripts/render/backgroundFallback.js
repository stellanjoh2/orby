import { creativeLookPresetNeedsHdriBackdrop } from './CreativeLookMaterials.js';
import { APP_BACKGROUND } from '../constants.js';

/**
 * Viewport backdrop vs HDRI lighting — Render Backdrop off still leaves HDRI lighting on.
 * Shader Lab uses solid color / gradient instead of the HDRI image even when HDRI lights the mesh.
 */

/** @param {{ creativeLook?: { enabled?: boolean } } | null | undefined} state */
export function isCreativeLookBackdropActive(state) {
  return state?.creativeLook?.enabled === true;
}

/** @param {{ hdriEnabled?: boolean, hdriBackground?: boolean } | null | undefined} state */
export function isHdriBackdropActive(state) {
  return !!state?.hdriEnabled && !!state?.hdriBackground;
}

/** @param {{ hdriEnabled?: boolean, hdriBackground?: boolean, creativeLook?: { enabled?: boolean } } | null | undefined} state */
export function isBackgroundFallbackActive(state) {
  // Shader Lab defaults Render Backdrop off, but a manual toggle back on should show the HDRI.
  return !isHdriBackdropActive(state);
}

/**
 * Solid flat backdrop (no HDRI image, no gradient/image) — optics presets keep these pixels ungraded.
 * @param {object | null | undefined} state
 */
export function isSolidStudioBackdropActive(state) {
  if (!state || isHdriBackdropActive(state)) return false;
  if (state.backgroundSolidEnabled === false) return false;
  if (state.backgroundGradient?.enabled) return false;
  if (state.backgroundImage?.enabled && state.backgroundImage?.asset) return false;
  return true;
}

/** @param {object | null | undefined} state */
export function resolveSolidStudioBackdropColor(state) {
  return state?.background ?? APP_BACKGROUND;
}

/** Glass / Chrome Shader Lab presets need `scene.background` for transmission refraction. */
export function needsTransmissionBackdropForCreativeLook(state) {
  const cl = state?.creativeLook ?? {};
  const hdriOn = state?.hdriEnabled !== false;
  return (
    cl.enabled === true &&
    creativeLookPresetNeedsHdriBackdrop(cl.preset) &&
    hdriOn
  );
}

/** Import / heuristic glass with MeshPhysicalMaterial.transmission needs the HDRI backdrop. */
export function needsTransmissionBackdropForPhysicalGlass(state) {
  if (state?.advanced?.physicalGlassTransmission !== true) return false;
  return state?.hdriEnabled !== false;
}

/** Any transmission refraction path that samples `scene.background`. */
export function needsTransmissionBackdrop(state) {
  return (
    needsTransmissionBackdropForCreativeLook(state) ||
    needsTransmissionBackdropForPhysicalGlass(state)
  );
}

/**
 * MeshPhysicalMaterial transmission refracts `scene.background`, not the renderer clear color.
 * When Render Backdrop is off, bind the user's flat/image backdrop to `scene.background` for
 * refraction — without mutating `hdriBackground` (user controls that toggle).
 *
 * @param {import('../SceneManager.js').SceneManager | null | undefined} scene
 * @returns {boolean} true when a non-HDRI `scene.background` was applied
 */
export function applyTransmissionSceneBackground(scene) {
  if (!scene?.stateStore) return false;
  const state = scene.stateStore.getState();
  const needs = needsTransmissionBackdrop(state);
  const hdriBackdrop = isHdriBackdropActive(state);
  const bg = scene.backgroundController;

  bg?.setTransmissionSceneBackgroundNeeded?.(needs && !hdriBackdrop);

  if (!needs) return false;

  if (hdriBackdrop) {
    // State already on — push GPU without touching UI/state.
    scene.setHdriBackground?.(!!state.hdriBackground);
    return false;
  }

  bg?.refreshAppearance?.();
  return true;
}

/** @deprecated Use {@link applyTransmissionSceneBackground} — kept for import stability. */
export function syncTransmissionBackdropForCreativeLook(stateStore) {
  return applyTransmissionSceneBackground(stateStore?.scene ?? window.orby?.scene);
}

/** @deprecated Use {@link applyTransmissionSceneBackground} — kept for import stability. */
export function syncTransmissionBackdrop(stateStore) {
  return applyTransmissionSceneBackground(stateStore?.scene ?? window.orby?.scene);
}
