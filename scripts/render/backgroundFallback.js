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
