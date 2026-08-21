import { APP_BACKGROUND, ORBY_LIME, defaultDof } from '../../constants.js';
import { defaultAberration } from '../../render/chromaticAberration.js';

/** Post-processing, exposure, tone curve, backgrounds, and look-filter UI. */
export function createRenderDefaults() {
  return {
    dof: {
      ...defaultDof,
    },
    bloom: {
      enabled: true,
      threshold: 1.0,
      strength: 0.2,
      radius: 0.2,
      color: '#ffe9cc',
      quality: 'medium',
    },
    lensDirt: {
      enabled: false,
      strength: 0.8,
      minLuminance: 0.55,
      maxLuminance: 0.95,
      sensitivity: 0.55,
      /** Multiplies lens dirt texture; #ffffff keeps the texture’s original colour. */
      tintColor: '#ffffff',
    },
    grain: { enabled: false, intensity: 0.03, scale: 1, color: '#ffffff' },
    aberration: { ...defaultAberration },
    /** Screen-space AO (N8AO); off by default — GPU-heavy when enabled. */
    ambientOcclusion: {
      enabled: false,
      intensity: 3,
      radius: 1,
      quality: 'medium',
      color: '#080808',
    },
    /** Wide-angle lens distortion (de Carpentier); post-process after full grading stack. */
    fisheye: {
      enabled: false,
      horizontalFOVDeg: 131,
      strength: 0.37,
      cylindricalRatio: 4,
    },
    exposure: 1.0,
    /** Off by default; enable to adapt exposure to scene brightness automatically. */
    autoExposure: false,
    histogramEnabled: false,
    toneCurveOpen: false,
    toneCurve: {
      blackY: 0,
      whiteY: 1,
      p1: { x: 1 / 3, y: 1 / 3 },
      p2: { x: 2 / 3, y: 2 / 3 },
    },
    antiAliasing: 'fxaa',
    renderQuality: 'medium',
    toneMapping: 'aces-filmic',
    background: APP_BACKGROUND,
    /** Flat color backdrop when Render Backdrop is off (mutually exclusive with gradient / image). */
    backgroundSolidEnabled: true,
    backgroundGradient: {
      enabled: false,
      type: 'linear',
      angle: 180,
      centerX: 50,
      centerY: 50,
      stops: [
        { color: APP_BACKGROUND, position: 0 },
        { color: ORBY_LIME, position: 100 },
      ],
    },
    backgroundImage: {
      enabled: false,
      fit: 'cover',
      blur: 0,
      asset: null,
    },
    lookFilterPreset: 'none',
    lookFilterPresetsOpen: false,
    /** Object tab — fold-out for Shader Lab (stylized materials). */
    creativeLookSectionOpen: false,
    /** 'low' | 'medium' | 'high' — color SVG (ImageTracer) trace fidelity */
    svgColorDetail: 'high',
  };
}
