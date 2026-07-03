import { deepEqual } from '../utils/deepEqual.js';
import {
  buildFontExtrudeSvgExtrudeBaseline,
} from '../import/extrudeDefaults.js';
import { createImportDefaults } from '../state/defaults/importDefaults.js';

const FONT_DEFAULTS = createImportDefaults().fontExtrude;
const FONT_SVG_BASELINE = buildFontExtrudeSvgExtrudeBaseline();

/** State paths per font-extrude subsection reset button (`data-reset`). */
export const FONT_EXTRUDE_RESET_DIRTY_PATHS = {
  'font-extrude-typography': [
    'fontExtrude.previewScale',
    'fontExtrude.align',
    'fontExtrude.tracking',
    'fontExtrude.kerning',
    'fontExtrude.lineHeight',
  ],
  'font-extrude-appearance': [
    'fontExtrude.fillColor',
  ],
  'font-extrude-3d-shape': [
    'svgExtrude.depth',
    'svgExtrude.normalAngle',
    'svgExtrude.hardEdgeAngle',
    'svgExtrude.bevelAmount',
    'svgExtrude.detail',
    'fontExtrude.detail',
    'fontExtrude.bevelType',
  ],
  'font-extrude-circular-wrap': [
    'fontExtrude.circularWrapEnabled',
    'fontExtrude.circularWrapMode',
    'fontExtrude.circularWrapArcDeg',
  ],
  'font-extrude-reveal': [
    'fontExtrude.revealType',
    'fontExtrude.revealUnit',
    'fontExtrude.revealDurationSec',
    'fontExtrude.revealSlideDepth',
    'fontExtrude.revealSlideTime',
    'fontExtrude.revealSlideDirection',
    'fontExtrude.trackingAnimatorEnabled',
    'fontExtrude.trackingAnimatorAmountPercent',
    'fontExtrude.trackingAnimatorTimeSec',
    'fontExtrude.trackingAnimatorEasing',
    'fontExtrude.revealStaggerEasing',
    'fontExtrude.revealEmissiveSlam',
    'fontExtrude.revealEmissiveStrength',
    'fontExtrude.revealEmissiveDecaySec',
    'fontExtrude.revealEmissiveColor',
  ],
  'font-extrude-looping-motion': [
    'fontExtrude.constantType',
    'fontExtrude.constantIntensity',
    'fontExtrude.constantSpeedSec',
    'fontExtrude.constantSpread',
  ],
  'font-extrude-preview': [
    'fontExtrude.revealLoop',
    'fontExtrude.pauseAllAnimations',
  ],
};

/** Target values restored by each subsection reset (font-session baselines). */
const FONT_EXTRUDE_SUBSECTION_DEFAULTS = {
  'font-extrude-typography': {
    'fontExtrude.previewScale': FONT_DEFAULTS.previewScale,
    'fontExtrude.align': FONT_DEFAULTS.align,
    'fontExtrude.tracking': FONT_DEFAULTS.tracking,
    'fontExtrude.kerning': FONT_DEFAULTS.kerning,
    'fontExtrude.lineHeight': FONT_DEFAULTS.lineHeight,
  },
  'font-extrude-appearance': {
    'fontExtrude.fillColor': FONT_DEFAULTS.fillColor,
  },
  'font-extrude-3d-shape': {
    'svgExtrude.depth': FONT_SVG_BASELINE.depth,
    'svgExtrude.normalAngle': FONT_SVG_BASELINE.normalAngle,
    'svgExtrude.hardEdgeAngle': FONT_SVG_BASELINE.hardEdgeAngle,
    'svgExtrude.bevelAmount': FONT_SVG_BASELINE.bevelAmount,
    'svgExtrude.detail': FONT_SVG_BASELINE.detail,
    'fontExtrude.detail': FONT_DEFAULTS.detail,
    'fontExtrude.bevelType': FONT_DEFAULTS.bevelType,
  },
  'font-extrude-circular-wrap': {
    'fontExtrude.circularWrapEnabled': FONT_DEFAULTS.circularWrapEnabled,
    'fontExtrude.circularWrapMode': FONT_DEFAULTS.circularWrapMode,
    'fontExtrude.circularWrapArcDeg': FONT_DEFAULTS.circularWrapArcDeg,
  },
  'font-extrude-reveal': {
    'fontExtrude.revealType': FONT_DEFAULTS.revealType,
    'fontExtrude.revealUnit': FONT_DEFAULTS.revealUnit,
    'fontExtrude.revealDurationSec': FONT_DEFAULTS.revealDurationSec,
    'fontExtrude.revealSlideDepth': FONT_DEFAULTS.revealSlideDepth,
    'fontExtrude.revealSlideTime': FONT_DEFAULTS.revealSlideTime,
    'fontExtrude.revealSlideDirection': FONT_DEFAULTS.revealSlideDirection,
    'fontExtrude.trackingAnimatorEnabled': FONT_DEFAULTS.trackingAnimatorEnabled,
    'fontExtrude.trackingAnimatorAmountPercent': FONT_DEFAULTS.trackingAnimatorAmountPercent,
    'fontExtrude.trackingAnimatorTimeSec': FONT_DEFAULTS.trackingAnimatorTimeSec,
    'fontExtrude.trackingAnimatorEasing': FONT_DEFAULTS.trackingAnimatorEasing,
    'fontExtrude.revealStaggerEasing': FONT_DEFAULTS.revealStaggerEasing,
    'fontExtrude.revealEmissiveSlam': FONT_DEFAULTS.revealEmissiveSlam,
    'fontExtrude.revealEmissiveStrength': FONT_DEFAULTS.revealEmissiveStrength,
    'fontExtrude.revealEmissiveDecaySec': FONT_DEFAULTS.revealEmissiveDecaySec,
    'fontExtrude.revealEmissiveColor': FONT_DEFAULTS.revealEmissiveColor,
  },
  'font-extrude-looping-motion': {
    'fontExtrude.constantType': FONT_DEFAULTS.constantType,
    'fontExtrude.constantIntensity': FONT_DEFAULTS.constantIntensity,
    'fontExtrude.constantSpeedSec': FONT_DEFAULTS.constantSpeedSec,
    'fontExtrude.constantSpread': FONT_DEFAULTS.constantSpread,
  },
  'font-extrude-preview': {
    'fontExtrude.revealLoop': FONT_DEFAULTS.revealLoop,
    'fontExtrude.pauseAllAnimations': FONT_DEFAULTS.pauseAllAnimations,
  },
};

export const FONT_EXTRUDE_RESET_TOASTS = {
  'font-extrude-typography': 'Typography reset',
  'font-extrude-appearance': 'Appearance reset',
  'font-extrude-3d-shape': '3D Shape reset',
  'font-extrude-circular-wrap': 'Circular wrap reset',
  'font-extrude-reveal': 'Reveal reset',
  'font-extrude-looping-motion': 'Looping motion reset',
  'font-extrude-preview': 'Preview reset',
};

function getAtPath(obj, path) {
  if (!path) return obj;
  const segments = path.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    current = current[seg];
  }
  return current;
}

export function isFontExtrudeSubsectionDirty(resetType, state) {
  const paths = FONT_EXTRUDE_RESET_DIRTY_PATHS[resetType];
  const targets = FONT_EXTRUDE_SUBSECTION_DEFAULTS[resetType];
  if (!paths || !targets) return false;
  for (const path of paths) {
    if (!deepEqual(getAtPath(state, path), targets[path])) return true;
  }
  return false;
}

/**
 * Restore one font-extrude subsection to factory defaults and emit mesh/animation events.
 *
 * @param {string} resetType
 * @param {import('../StateStore.js').StateStore} stateStore
 * @param {import('../EventBus.js').EventBus} eventBus
 * @param {{ getScene?: () => object | null }} [options]
 * @returns {boolean}
 */
export function applyFontExtrudeSubsectionReset(resetType, stateStore, eventBus, options = {}) {
  const targets = FONT_EXTRUDE_SUBSECTION_DEFAULTS[resetType];
  if (!targets) return false;

  stateStore.batch(() => {
    for (const [path, value] of Object.entries(targets)) {
      stateStore.set(path, value);
    }
  });

  switch (resetType) {
    case 'font-extrude-appearance': {
      const fill = targets['fontExtrude.fillColor'];
      stateStore.set('svgExtrude.availableColors', [fill]);
      options.getScene?.()?.applyFontExtrudeFillColor?.(fill);
      break;
    }
    case 'font-extrude-3d-shape': {
      eventBus.emit('mesh:svg-extrude-depth', targets['svgExtrude.depth']);
      eventBus.emit('mesh:svg-extrude-normal-angle', targets['svgExtrude.normalAngle']);
      eventBus.emit('mesh:svg-extrude-hard-edge-angle', targets['svgExtrude.hardEdgeAngle']);
      eventBus.emit('mesh:svg-extrude-bevel', { amount: targets['svgExtrude.bevelAmount'] });
      eventBus.emit('mesh:svg-extrude-detail', targets['svgExtrude.detail']);
      eventBus.emit('mesh:font-extrude-bevel-type', { type: targets['fontExtrude.bevelType'] });
      break;
    }
    default:
      break;
  }

  return true;
}
