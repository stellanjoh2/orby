/**
 * UI-side control manifest — Studio sliders/colors with pure 1:1 bindings only.
 * Controls with side effects (look-filter touch, god-rays touch, disable toggles,
 * sounds, UI sync) stay inline in StudioControls.js.
 */

/** @typedef {'range' | 'color' | 'checkbox'} UiControlInputType */

/**
 * @typedef {object} UiControlManifestEntry
 * @property {string} inputId
 * @property {string} statePath
 * @property {string} event
 * @property {UiControlInputType} [inputType='range']
 * @property {string} [labelKey]
 * @property {string} [labelType]
 * @property {number} [clampMin]
 * @property {number} [clampMax]
 * @property {number} [fallback]
 */

/** @type {UiControlManifestEntry[]} */
export const STUDIO_UI_CONTROL_MANIFEST = [
  // HDRI — clamped sliders only (hdriStrength has unit transform; toggles have UI side effects)
  {
    inputId: 'hdriBlurriness',
    statePath: 'hdriBlurriness',
    event: 'studio:hdri-blurriness',
    labelKey: 'hdriBlurriness',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 1,
  },
  {
    inputId: 'hdriRotation',
    statePath: 'hdriRotation',
    event: 'studio:hdri-rotation',
    labelKey: 'hdriRotation',
    labelType: 'angle',
    clampMin: 0,
    clampMax: 360,
  },
  // Lens flare — clamped sliders + colors (toggles / quality / key-light connect stay inline)
  {
    inputId: 'lensFlareRotation',
    statePath: 'lensFlare.rotation',
    event: 'studio:lens-flare-rotation',
    labelKey: 'lensFlareRotation',
    labelType: 'angle',
    clampMin: 0,
    clampMax: 360,
  },
  {
    inputId: 'lensFlareHeight',
    statePath: 'lensFlare.height',
    event: 'studio:lens-flare-height',
    labelKey: 'lensFlareHeight',
    labelType: 'angle',
    clampMin: 0,
    clampMax: 90,
    fallback: 0,
  },
  {
    inputId: 'lensFlareHalo',
    statePath: 'lensFlare.haloIntensity',
    event: 'studio:lens-flare-halo',
    labelKey: 'lensFlareHalo',
    labelType: 'multiplier',
    clampMin: 0,
    clampMax: 5,
    fallback: 0,
  },
  {
    inputId: 'lensFlareStreakLength',
    statePath: 'lensFlare.streakLength',
    event: 'studio:lens-flare-streak-length',
    labelKey: 'lensFlareStreakLength',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 10,
    fallback: 0,
  },
  {
    inputId: 'lensFlareSunDiscScale',
    statePath: 'lensFlare.sunDiscScale',
    event: 'studio:lens-flare-sun-disc-scale',
    labelKey: 'lensFlareSunDiscScale',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 10,
    fallback: 0,
  },
  {
    inputId: 'lensFlareSunDiscBlur',
    statePath: 'lensFlare.sunDiscBlur',
    event: 'studio:lens-flare-sun-disc-blur',
    labelKey: 'lensFlareSunDiscBlur',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 5,
    fallback: 0,
  },
  {
    inputId: 'lensFlareDiscGlowIntensity',
    statePath: 'lensFlare.discGlowIntensity',
    event: 'studio:lens-flare-disc-glow-intensity',
    labelKey: 'lensFlareDiscGlowIntensity',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 10,
    fallback: 0,
  },
  {
    inputId: 'lensFlareDiscGlowSize',
    statePath: 'lensFlare.discGlowSize',
    event: 'studio:lens-flare-disc-glow-size',
    labelKey: 'lensFlareDiscGlowSize',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 10,
    fallback: 0,
  },
  {
    inputId: 'lensFlareSunDiscColor',
    statePath: 'lensFlare.sunDiscColor',
    event: 'studio:lens-flare-sun-disc-color',
    inputType: 'color',
  },
  {
    inputId: 'lensFlareDiscGlowColor',
    statePath: 'lensFlare.discGlowColor',
    event: 'studio:lens-flare-disc-glow-color',
    inputType: 'color',
  },
  {
    inputId: 'lensFlareColor',
    statePath: 'lensFlare.color',
    event: 'studio:lens-flare-color',
    inputType: 'color',
  },
  // Ground / grid / base / backdrop — pure sliders + colors
  {
    inputId: 'groundSolidColor',
    statePath: 'groundSolidColor',
    event: 'studio:ground-solid-color',
    inputType: 'color',
  },
  {
    inputId: 'groundWireColor',
    statePath: 'groundWireColor',
    event: 'studio:ground-wire-color',
    inputType: 'color',
  },
  {
    inputId: 'groundWireOpacity',
    statePath: 'groundWireOpacity',
    event: 'studio:ground-wire-opacity',
    labelKey: 'groundWireOpacity',
    labelType: 'decimal',
  },
  {
    inputId: 'gridLineWidth',
    statePath: 'gridLineWidth',
    event: 'studio:grid-line-width',
    labelKey: 'gridLineWidth',
    labelType: 'decimal',
  },
  {
    inputId: 'groundY',
    statePath: 'groundY',
    event: 'studio:ground-y',
    labelKey: 'groundY',
    labelType: 'distance',
  },
  {
    inputId: 'gridY',
    statePath: 'gridY',
    event: 'studio:grid-y',
    labelKey: 'gridY',
    labelType: 'distance',
  },
  {
    inputId: 'baseScale',
    statePath: 'baseScale',
    event: 'studio:base-scale',
    labelKey: 'baseScale',
    labelType: 'decimal',
  },
  {
    inputId: 'baseMetalness',
    statePath: 'baseMetalness',
    event: 'studio:base-metalness',
    labelKey: 'baseMetalness',
    labelType: 'decimal',
  },
  {
    inputId: 'baseRoughness',
    statePath: 'baseRoughness',
    event: 'studio:base-roughness',
    labelKey: 'baseRoughness',
    labelType: 'decimal',
  },
  {
    inputId: 'baseGlassBrightness',
    statePath: 'baseGlassBrightness',
    event: 'studio:base-glass-brightness',
    labelKey: 'baseGlassBrightness',
    labelType: 'decimal',
  },
  {
    inputId: 'baseGlassBlur',
    statePath: 'baseGlassBlur',
    event: 'studio:base-glass-blur',
    labelKey: 'baseGlassBlur',
    labelType: 'decimal',
  },
  {
    inputId: 'baseGlassAmount',
    statePath: 'baseGlassAmount',
    event: 'studio:base-glass-amount',
    labelKey: 'baseGlassAmount',
    labelType: 'decimal',
  },
  {
    inputId: 'gridScale',
    statePath: 'gridScale',
    event: 'studio:grid-scale',
    labelKey: 'gridScale',
    labelType: 'decimal',
  },
  {
    inputId: 'backdropColor',
    statePath: 'backdropColor',
    event: 'studio:backdrop-color',
    inputType: 'color',
  },
  {
    inputId: 'backdropMetalness',
    statePath: 'backdropMetalness',
    event: 'studio:backdrop-metalness',
    labelKey: 'backdropMetalness',
    labelType: 'decimal',
  },
  {
    inputId: 'backdropRoughness',
    statePath: 'backdropRoughness',
    event: 'studio:backdrop-roughness',
    labelKey: 'backdropRoughness',
    labelType: 'decimal',
  },
  {
    inputId: 'backdropScale',
    statePath: 'backdropScale',
    event: 'studio:backdrop-scale',
    labelKey: 'backdropScale',
    labelType: 'decimal',
  },
  {
    inputId: 'backdropWidth',
    statePath: 'backdropWidth',
    event: 'studio:backdrop-width',
    labelKey: 'backdropWidth',
    labelType: 'decimal',
  },
  {
    inputId: 'backdropRotation',
    statePath: 'backdropRotation',
    event: 'studio:backdrop-rotation',
    labelKey: 'backdropRotation',
    labelType: 'angle',
  },
  {
    inputId: 'backdropY',
    statePath: 'backdropY',
    event: 'studio:backdrop-y',
    labelKey: 'backdropY',
    labelType: 'distance',
  },
];

/** @type {UiControlManifestEntry[]} */
export const STUDIO_CHECKBOX_UI_MANIFEST = [
  {
    inputId: 'hdriReceiveShadowsAo',
    statePath: 'hdriReceiveShadowsAo',
    event: 'studio:hdri-receive-shadows-ao',
    inputType: 'checkbox',
  },
  {
    inputId: 'groundWire',
    statePath: 'groundWire',
    event: 'studio:ground-wire',
    inputType: 'checkbox',
  },
];
