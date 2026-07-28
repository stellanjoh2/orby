import { COLOR_CHECKER_DEFAULT_SCALE } from '../../constants.js';

/** Rig animation and color-checker reference chart. */
export function createAnimationDefaults() {
  return {
    animation: {
      showBones: false,
      showJointNames: false,
      showWireframe: false,
      hideMesh: false,
      jointScale: 0.5,
      boneStrokeWidth: 2,
      clipPlaybackMode: 'loop',
      displayFps: 60,
      timeReferenceEnabled: false,
    },
    /**
     * ColorChecker Classic (24 swatches) — reference sRGB from Wikipedia / manufacturer data.
     * Default placement (distance / rotate / height / scale) is a tuned “spawn” preset; `enabled` stays
     * false until the user shows the chart. Scale matches ~356 mm card on import-normalized (~2 m) assets.
     */
    colorChecker: {
      enabled: false,
      distance: 2,
      /** Orbit azimuth in degrees (added to global Lights → Rotate). */
      rotate: 333,
      /** Lift above ground/grid once the chart base rests on the floor (scene units). */
      height: 0.05,
      /** Uniform scale of the chart group (1× ≈ built-in mesh width; default ≈ physical card on normalized imports). */
      scale: COLOR_CHECKER_DEFAULT_SCALE,
      /** Shortcut to Object → Display → Unlit (textures); restores prior display mode when turned off. */
      rawColors: false,
    },
  };
}
