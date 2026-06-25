import { CAMERA_TEMPERATURE_NEUTRAL_K } from '../../constants.js';
import {
  DEFAULT_CAMERA_POSITION,
  defaultCameraDistance,
} from '../../camera/cameraDefaults.js';

/** Camera pose, lens, grading, isometric, and clip planes. */
export function createCameraDefaults() {
  return {
    camera: {
      fov: 45,
      /** Active focal-length preset (mm), or null when FOV was adjusted manually. */
      lensFocalMm: null,
      lensSensorId: 'aps-c',
      tilt: 0,
      /** World-space camera position (OrbitControls). Distance is camera ↔ target length. */
      worldPosition: { ...DEFAULT_CAMERA_POSITION },
      distance: defaultCameraDistance(),
      /** Active view preset button, or null after manual orbit. */
      viewPreset: null,
      /** Rule-of-thirds / crosshair / diagonal overlay in viewport (16×9 letterbox). */
      compositionGridEnabled: false,
      /** Dark strokes instead of light — for bright scenes. */
      compositionGuidesInverted: false,
      /** 9∶16 center-crop preview inside composition guides (portrait video export). */
      compositionPortraitCropGuide: false,
      /** Viewport-only 21∶9 mattes (letterbox / pillarbox) for framing. */
      cinematicLetterbox219: false,
      autoOrbit: 'off',
      handheld: 'off',
      contrast: 1.0,
      temperature: CAMERA_TEMPERATURE_NEUTRAL_K,
      tint: 0,
      highlights: 0,
      shadows: 0,
      saturation: 1.0,
      clarity: 0,
      fade: 0,
      sharpness: 0,
      vignetteEnabled: false,
      vignette: 0.5,
      vignetteColor: '#080808',
      /** RTS / isometric framing — optional; does not override lens FOV until used. */
      isometric: {
        enabled: false,
        presetId: 'true-isometric',
        horizontalDeg: 45,
        verticalDeg: (Math.atan(1 / Math.sqrt(2)) * 180) / Math.PI,
        panUnlocked: false,
      },
      /** Optional manual near/far override (telephoto / isometric). Off = DEFAULT_CAMERA_* . */
      clipPlanes: {
        manual: false,
        near: 0.1,
        far: 100,
      },
    },
  };
}
