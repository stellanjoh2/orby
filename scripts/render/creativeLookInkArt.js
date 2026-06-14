import * as THREE from 'three';
import { ORBY_BLACK } from '../constants.js';

/** Default comic / pencil ink — Orby black. */
export const CREATIVE_LOOK_STROKE_COLOR_DEFAULT = ORBY_BLACK;

/** Artistic presets that expose stroke colour in Shader Lab. */
export const CREATIVE_LOOK_ARTISTIC_INK_PRESETS = /** @type {const} */ ([
  'watercolour',
  'sketch',
  'sketch-colour',
]);

export const CREATIVE_LOOK_INK_STROKE_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uStrokeColor;
`;

export const CREATIVE_LOOK_RESOLVE_STROKE_INK_GLSL = /* glsl */ `
vec3 resolveStrokeInk(vec3 localRgb) {
  return uStrokeColor;
}
`;

/** @param {string | undefined} value */
export function normalizeCreativeLookStrokeColor(value) {
  const raw = String(value ?? CREATIVE_LOOK_STROKE_COLOR_DEFAULT).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return CREATIVE_LOOK_STROKE_COLOR_DEFAULT;
}

/** @param {string | undefined} hex */
export function creativeLookStrokeColorRgb(hex) {
  const c = new THREE.Color(normalizeCreativeLookStrokeColor(hex));
  return [c.r, c.g, c.b];
}

/**
 * @param {object} [presetParams]
 * @param {string} [preset]
 */
export function resolveCreativeLookInkParams(presetParams = {}, preset = '') {
  void preset;
  const ink = presetParams?.ink ?? {};
  const strokeColor = normalizeCreativeLookStrokeColor(ink.strokeColor);
  return {
    strokeColor,
    strokeColorRgb: creativeLookStrokeColorRgb(strokeColor),
  };
}

/** @param {Record<string, { value?: unknown }>} uniforms @param {ReturnType<typeof resolveCreativeLookInkParams>} inkParams */
export function applyCreativeLookStrokeUniforms(uniforms, inkParams) {
  if (!uniforms?.uStrokeColor?.value) return;
  const [r, g, b] = inkParams.strokeColorRgb;
  uniforms.uStrokeColor.value.set(r, g, b);
}

/** @param {string | undefined} preset @param {boolean} [shaderLabEnabled] */
export function creativeLookInkControlsVisible(preset, shaderLabEnabled = true) {
  if (!shaderLabEnabled) return false;
  const id = typeof preset === 'string' ? preset : '';
  return CREATIVE_LOOK_ARTISTIC_INK_PRESETS.includes(id);
}
