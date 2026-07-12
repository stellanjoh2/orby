import {
  MATERIAL_BRIGHTNESS_EFFECTIVE_MULTIPLIER,
  SCENE_SETTINGS_SCHEMA_VERSION,
} from '../constants.js';

/**
 * Pre-v3 scene JSON stored Object → Material brightness as the effective albedo multiplier
 * (default 1.75). v3+ stores UI values where 1.0 ≈ former 2.0.
 * @param {Record<string, unknown> | null | undefined} obj
 * @param {number | undefined | null} schemaVersion
 */
export function migrateLegacyMaterialBrightness(obj, schemaVersion) {
  if (!obj || typeof obj !== 'object') return;
  if (
    typeof schemaVersion === 'number'
    && schemaVersion >= SCENE_SETTINGS_SCHEMA_VERSION
  ) {
    return;
  }

  const toUi = (value) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return value;
    return v / MATERIAL_BRIGHTNESS_EFFECTIVE_MULTIPLIER;
  };

  if (obj.material && typeof obj.material === 'object') {
    const material = /** @type {Record<string, unknown>} */ (obj.material);
    if (material.brightness !== undefined) {
      material.brightness = toUi(material.brightness);
    }
  }
  if (obj.diffuseBrightness !== undefined) {
    obj.diffuseBrightness = toUi(obj.diffuseBrightness);
  }
}
