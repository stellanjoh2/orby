import { creativeLookPresetNeedsHdriBackdrop } from './CreativeLookMaterials.js';

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

/**
 * Glass / Chrome use MeshPhysicalMaterial.transmission — Three.js refracts `scene.background`,
 * not the renderer clear color. When HDRI lighting is on, force Render Backdrop on.
 *
 * @param {{ getState: () => object, set?: (path: string, value: unknown) => void }} stateStore
 * @returns {boolean} true when state was updated from off → on
 */
export function syncTransmissionBackdropForCreativeLook(stateStore) {
  if (!stateStore || typeof stateStore.getState !== 'function') return false;
  if (!needsTransmissionBackdropForCreativeLook(stateStore.getState())) return false;
  if (stateStore.getState().hdriBackground) return false;
  stateStore.set?.('hdriBackground', true);
  return true;
}
