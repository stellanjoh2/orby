/**
 * UI-side control manifest — mesh transform + material sliders.
 * Each entry links DOM input → StateStore path → EventBus event (see sceneControlManifest).
 */
import { DEFAULT_MATERIAL_BRIGHTNESS, MATERIAL_EMISSIVE_SLIDER_MAX } from '../constants.js';

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
export const MESH_UI_CONTROL_MANIFEST = [
  {
    inputId: 'scale',
    statePath: 'scale',
    event: 'mesh:scale',
    labelKey: 'scale',
    labelType: 'multiplier',
  },
  {
    inputId: 'xOffset',
    statePath: 'xOffset',
    event: 'mesh:xOffset',
    labelKey: 'xOffset',
    labelType: 'distance',
  },
  {
    inputId: 'yOffset',
    statePath: 'yOffset',
    event: 'mesh:yOffset',
    labelKey: 'yOffset',
    labelType: 'distance',
  },
  {
    inputId: 'zOffset',
    statePath: 'zOffset',
    event: 'mesh:zOffset',
    labelKey: 'zOffset',
    labelType: 'distance',
  },
  {
    inputId: 'rotationX',
    statePath: 'rotationX',
    event: 'mesh:rotationX',
    labelKey: 'rotationX',
    labelType: 'angle',
  },
  {
    inputId: 'rotationY',
    statePath: 'rotationY',
    event: 'mesh:rotationY',
    labelKey: 'rotationY',
    labelType: 'angle',
  },
  {
    inputId: 'rotationZ',
    statePath: 'rotationZ',
    event: 'mesh:rotationZ',
    labelKey: 'rotationZ',
    labelType: 'angle',
  },
  {
    inputId: 'materialBrightness',
    statePath: 'material.brightness',
    event: 'mesh:material-brightness',
    labelKey: 'materialBrightness',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 5,
    fallback: DEFAULT_MATERIAL_BRIGHTNESS,
  },
  {
    inputId: 'materialMetalness',
    statePath: 'material.metalness',
    event: 'mesh:material-metalness',
    labelKey: 'materialMetalness',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 1,
    fallback: 0,
  },
  {
    inputId: 'materialRoughness',
    statePath: 'material.roughness',
    event: 'mesh:material-roughness',
    labelKey: 'materialRoughness',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: 1,
    fallback: 0.5,
  },
  {
    inputId: 'materialEmissive',
    statePath: 'material.emissive',
    event: 'mesh:material-emissive',
    labelKey: 'materialEmissive',
    labelType: 'decimal',
    clampMin: 0,
    clampMax: MATERIAL_EMISSIVE_SLIDER_MAX,
    fallback: 0,
  },
  {
    inputId: 'materialOverrideColor',
    statePath: 'material.overrideColor',
    event: 'mesh:material-override-color',
    inputType: 'color',
  },
  {
    inputId: 'clayColor',
    statePath: 'clay.color',
    event: 'mesh:clay-color',
    inputType: 'color',
  },
  {
    inputId: 'clayNormalMap',
    statePath: 'clay.normalMap',
    event: 'mesh:clay-normal-map',
    inputType: 'checkbox',
  },
  {
    inputId: 'materialColorOverride',
    statePath: 'material.colorOverride',
    event: 'mesh:material-color-override',
    inputType: 'checkbox',
  },
];

/** @type {UiControlManifestEntry[]} */
export const MESH_CHECKBOX_UI_MANIFEST = [
  {
    inputId: 'reverseNormals',
    statePath: 'advanced.reverseNormals',
    event: 'mesh:reverse-normals',
    inputType: 'checkbox',
  },
  {
    inputId: 'physicalGlassTransmission',
    statePath: 'advanced.physicalGlassTransmission',
    event: 'mesh:transparency-fix',
    inputType: 'checkbox',
  },
];
