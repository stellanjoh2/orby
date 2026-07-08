import { DEFAULT_GOBO_SOFTNESS } from '../../config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from '../../config/shadowQuality.js';
import { GOBO_UI_DEFAULT } from '../../render/GoboProjection.js';

/** 3-point lights rig, shadows, and gobo projection. */
export function createLightsDefaults() {
  return {
    lights: {
      key: { color: '#ffdfc9', intensity: 1.28, height: 5, rotate: 0, enabled: false, castShadows: false },
      fill: { color: '#b0c7ff', intensity: 0.8, height: 3, rotate: 0, enabled: false, castShadows: false },
      rim: { color: '#a0eaf9', intensity: 0.96, height: 4, rotate: 0, enabled: false, castShadows: false },
      ambient: { color: '#7c8ca6', intensity: 0.48, enabled: false },
    },
    /** Off by default: HDRI already lights the scene; turn on for 3-point rig + directional shadows. */
    lightsEnabled: false,
    lightsMaster: 0.30,
    lightsRotation: 0,
    lightsHeight: 5,
    /** Uniform scale for the 3-point rig — 1 = default spread, 4 = 4× farther from subject. */
    lightsRigScale: 1,
    lightsAutoRotate: false,
    showLightIndicators: false,
    showLightFalloffIndicators: false,
    lightsCastShadows: false,
    /** 3-point light shadow map quality preset. */
    lightsShadowQuality: 'medium',
    /** Directional shadow softness radius (0 = harder edges, 4 = max penumbra). */
    lightsShadowSoftness: DEFAULT_LIGHTS_SHADOW_SOFTNESS,
    /** Tint color for shadowed areas (black = darkest shadows). */
    lightsShadowColor: '#080808',
    /** How strongly the shadow tint is applied (0 = none, 1 = full). */
    lightsShadowOpacity: 0.25,
    /** Directional-light shadow bias; lower (more negative) tightens cast-shadow contact. */
    lightsShadowContactOffset: -0.0005,
    /** Shadow-map normal offset — cast shadows only (not direct side shading). */
    lightsShadowNormalBias: 0.01,
    /** Cast shadows from both sides (useful for thin single-surface meshes). */
    lightsShadowTwoSided: false,
    /** Key-light gobo projection — patterned shadow/light mask from the directional key. */
    gobo: {
      enabled: false,
      panelOpen: false,
      texture: 'palm',
      /** Gobo mask blur — independent from cast-shadow softness. */
      softness: DEFAULT_GOBO_SOFTNESS,
      /** Gobo penumbra sample tier — independent from shadow-map quality. */
      softnessQuality: 'medium',
      /** Pattern size — UI 0–10 (higher = smaller pattern; 5 ≈ former 0.50). */
      scale: GOBO_UI_DEFAULT,
      scaleSpace: 'ui',
      /** Rotate projected pattern around its center, degrees. */
      rotation: 0,
    },
  };
}
