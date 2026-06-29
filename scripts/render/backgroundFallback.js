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
 * Glass / Chrome use MeshPhysicalMaterial.transmission — Three.js refracts `scene.background`,
 * not the renderer clear color. When HDRI lighting is on, force Render Backdrop on.
 *
 * @param {{ getState: () => object, set?: (path: string, value: unknown) => void }} stateStore
 * @returns {boolean} true when state was updated from off → on
 */
export function syncTransmissionBackdropForCreativeLook(stateStore) {
  return syncTransmissionBackdrop(stateStore);
}

/**
 * @param {{ getState: () => object, set?: (path: string, value: unknown) => void }} stateStore
 * @returns {boolean} true when state was updated from off → on
 */
export function syncTransmissionBackdrop(stateStore) {
  if (!stateStore || typeof stateStore.getState !== 'function') return false;
  if (!needsTransmissionBackdrop(stateStore.getState())) return false;
  if (stateStore.getState().hdriBackground) return false;
  stateStore.set?.('hdriBackground', true);
  return true;
}
