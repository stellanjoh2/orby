import { DEFAULT_EXTRUDE_BEVEL_AMOUNT } from './extrudeBevel.js';
import {
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
} from './extrudeImporterShared.js';

export { DEFAULT_EXTRUDE_DEPTH, DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG } from './extrudeImporterShared.js';
export { DEFAULT_EXTRUDE_BEVEL_AMOUNT } from './extrudeBevel.js';
export {
  MIN_EXTRUDE_DEPTH,
  MAX_EXTRUDE_DEPTH,
  MIN_EXTRUDE_NORMAL_ANGLE_DEG,
  MAX_EXTRUDE_NORMAL_ANGLE_DEG,
} from './extrudeImporterShared.js';

export const DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR = '#7ed321';
export const DEFAULT_SVG_EXTRUDE_SURFACE_PRESET = 'none';
export const DEFAULT_SVG_EXTRUDE_SURFACE_SCALE = 1.0;
export const DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH = 1.0;

/** Default `svgExtrude` slice — keep in sync with {@link StateStore} initial state. */
export const DEFAULT_SVG_EXTRUDE_STATE = {
  enabled: false,
  depth: DEFAULT_EXTRUDE_DEPTH,
  normalAngle: DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
  availableColors: [],
  colorDepths: {},
  colorOffsets: {},
  flipDirection: false,
  colorOverride: false,
  overrideColor: DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
  surfacePreset: DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
  surfaceScale: DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
  surfaceStrength: DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
  bevelAmount: DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  /** @type {'low' | 'medium' | 'high' | 'ultra'} */
  detail: 'medium',
};

/**
 * Merge partial svgExtrude (saved settings, store defaults) onto canonical defaults.
 *
 * @param {Record<string, unknown> | null | undefined} [source]
 * @returns {typeof DEFAULT_SVG_EXTRUDE_STATE}
 */
export function resolveSvgExtrudeDefaults(source = {}) {
  const svg = source && typeof source === 'object' ? source : {};
  return {
    ...DEFAULT_SVG_EXTRUDE_STATE,
    depth: svg.depth ?? DEFAULT_EXTRUDE_DEPTH,
    normalAngle: svg.normalAngle ?? DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
    availableColors: Array.isArray(svg.availableColors) ? [...svg.availableColors] : [],
    colorDepths: { ...(svg.colorDepths || {}) },
    colorOffsets: { ...(svg.colorOffsets || {}) },
    flipDirection: !!svg.flipDirection,
    colorOverride: !!svg.colorOverride,
    overrideColor: svg.overrideColor ?? DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
    surfacePreset: svg.surfacePreset ?? DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
    surfaceScale: Number(svg.surfaceScale ?? DEFAULT_SVG_EXTRUDE_SURFACE_SCALE) || DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
    surfaceStrength:
      Number(svg.surfaceStrength ?? DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH) ||
      DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
    bevelAmount: svg.bevelAmount ?? DEFAULT_EXTRUDE_BEVEL_AMOUNT,
    detail: svg.detail ?? 'medium',
    enabled: !!svg.enabled,
  };
}

/**
 * Write svgExtrude defaults to state and emit mesh rebuild events.
 *
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {import('../EventBus.js').EventBus} eventBus
 * @param {{ svgExtrude?: Record<string, unknown> } | Record<string, unknown>} [storeDefaults]
 */
export function resetSvgExtrudeState(stateStore, eventBus, storeDefaults = {}) {
  const svg = resolveSvgExtrudeDefaults(storeDefaults.svgExtrude ?? storeDefaults);

  stateStore.batch(() => {
    stateStore.set('svgExtrude.depth', svg.depth);
    stateStore.set('svgExtrude.normalAngle', svg.normalAngle);
    stateStore.set('svgExtrude.bevelAmount', svg.bevelAmount);
    stateStore.set('svgExtrude.detail', svg.detail);
    stateStore.set('svgExtrude.colorDepths', svg.colorDepths);
    stateStore.set('svgExtrude.colorOffsets', svg.colorOffsets);
    stateStore.set('svgExtrude.flipDirection', svg.flipDirection);
    stateStore.set('svgExtrude.colorOverride', svg.colorOverride);
    stateStore.set('svgExtrude.overrideColor', svg.overrideColor);
    stateStore.set('svgExtrude.surfacePreset', svg.surfacePreset);
    stateStore.set('svgExtrude.surfaceScale', svg.surfaceScale);
    stateStore.set('svgExtrude.surfaceStrength', svg.surfaceStrength);
  });

  eventBus.emit('mesh:svg-extrude-depth', svg.depth);
  eventBus.emit('mesh:svg-extrude-normal-angle', svg.normalAngle);
  eventBus.emit('mesh:svg-extrude-bevel', { amount: svg.bevelAmount });
  eventBus.emit('mesh:svg-extrude-detail', svg.detail);
  eventBus.emit('mesh:svg-extrude-color-depths', svg.colorDepths);
  eventBus.emit('mesh:svg-extrude-color-offsets', svg.colorOffsets);
  eventBus.emit('mesh:svg-extrude-flip-direction', svg.flipDirection);
  eventBus.emit('mesh:svg-extrude-color-override', {
    enabled: svg.colorOverride,
    color: svg.overrideColor,
  });
  eventBus.emit('mesh:svg-extrude-surface', {
    preset: svg.surfacePreset,
    scale: svg.surfaceScale,
    strength: svg.surfaceStrength,
  });
}
