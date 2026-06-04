/**
 * Viewport backdrop vs HDRI lighting — Render Backdrop off still leaves HDRI lighting on.
 */

/** @param {{ hdriEnabled?: boolean, hdriBackground?: boolean } | null | undefined} state */
export function isHdriBackdropActive(state) {
  return !!state?.hdriEnabled && !!state?.hdriBackground;
}

/** @param {{ hdriEnabled?: boolean, hdriBackground?: boolean } | null | undefined} state */
export function isBackgroundFallbackActive(state) {
  return !isHdriBackdropActive(state);
}
