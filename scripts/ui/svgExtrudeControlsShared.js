import {
  clampExtrudeBevelAmount,
  maxExtrudeBevelAmount,
} from '../import/extrudeBevel.js';
import { normalizeExtrudeDetail } from '../import/extrudeDetail.js';
import {
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
  DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
  MAX_EXTRUDE_DEPTH,
  MIN_EXTRUDE_DEPTH,
  MIN_EXTRUDE_NORMAL_ANGLE_DEG,
  MAX_EXTRUDE_NORMAL_ANGLE_DEG,
} from '../import/extrudeDefaults.js';
import {
  FONT_REVEAL_TYPE_OPTIONS,
  DEFAULT_FONT_REVEAL_TYPE,
} from '../scene/fontTextRevealTypes.js';
import {
  clampSurfaceStrength,
  clampSurfaceUiScale,
  getSvgExtrudeSurfacePresetConfig,
  surfaceUiScaleToShaderScale,
  SVG_EXTRUDE_SURFACE_PRESETS,
} from '../render/SvgExtrudeSurfaceShader.js';

/** Readout: higher = finer detail (matches shader frequency). */
function formatSurfaceDetailLabel(storedScale) {
  return surfaceUiScaleToShaderScale(storedScale);
}

/**
 * Shared SVG / font extrude controls (same state.svgExtrude + mesh:* events).
 */

/**
 * Procedural surface library markup (single source for preset list + labels).
 * @param {{ presetId?: string, scaleId?: string, scaleOutput?: string, strengthId?: string, strengthOutput?: string, presetAriaLabel?: string }} [ids]
 */
export function buildSvgExtrudeSurfaceControlsHtml(ids = {}) {
  const presetId = ids.presetId ?? 'svgExtrudeSurfacePreset';
  const scaleId = ids.scaleId ?? 'svgExtrudeSurfaceScale';
  const scaleOutput = ids.scaleOutput ?? 'svgExtrudeSurfaceScale';
  const strengthId = ids.strengthId ?? 'svgExtrudeSurfaceStrength';
  const strengthOutput = ids.strengthOutput ?? 'svgExtrudeSurfaceStrength';
  const presetAriaLabel = ids.presetAriaLabel ?? 'Extrude surface material';
  const options = SVG_EXTRUDE_SURFACE_PRESETS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join('');
  return `
            <label class="select-line">
              <span data-tooltip="Procedural PBR surface detail (roughness and metalness variation)">Surface</span>
              <select id="${presetId}" aria-label="${presetAriaLabel}">
                ${options}
              </select>
            </label>
            <label class="slider-line slider-line--surface-detail">
              <span data-tooltip="Surface detail — finer pattern toward the right (mesh-local, rotates with the model)">Surface Detail</span>
              <input id="${scaleId}" type="range" min="0.2" max="10" step="0.05" value="1" />
              <span class="value" data-output="${scaleOutput}">1.00</span>
            </label>
            <label class="slider-line svg-extrude-surface-strength-line">
              <span data-tooltip="Normal-map bump intensity (map presets only)">Strength</span>
              <input id="${strengthId}" type="range" min="0" max="2" step="0.01" value="1" />
              <span class="value" data-output="${strengthOutput}">1.00</span>
            </label>`;
}

/**
 * @param {{
 *   id?: string,
 *   outputKey?: string,
 *   label?: string,
 *   tooltip?: string,
 *   value?: number,
 * }} [options]
 */
export function buildExtrudeDepthSliderHtml(options = {}) {
  const id = options.id ?? 'svgExtrudeDepth';
  const outputKey = options.outputKey ?? 'svgExtrudeDepth';
  const label = options.label ?? 'Depth';
  const tooltip =
    options.tooltip ??
    'Overall extrusion depth; scales every layer together (including per-color overrides)';
  const value = Number(options.value ?? DEFAULT_EXTRUDE_DEPTH) || DEFAULT_EXTRUDE_DEPTH;
  return `
            <label class="slider-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <input
                id="${id}"
                type="range"
                min="${MIN_EXTRUDE_DEPTH}"
                max="${MAX_EXTRUDE_DEPTH}"
                step="0.01"
                value="${value}"
              />
              <span class="value" data-output="${outputKey}">${value.toFixed(2)}</span>
            </label>`;
}

/**
 * @param {{
 *   id?: string,
 *   outputKey?: string,
 *   label?: string,
 *   tooltip?: string,
 *   ariaLabel?: string,
 *   value?: number,
 * }} [options]
 */
export function buildExtrudeAngleSliderHtml(options = {}) {
  const id = options.id ?? 'svgExtrudeNormalAngle';
  const outputKey = options.outputKey ?? 'svgExtrudeNormalAngle';
  const label = options.label ?? 'Angle';
  const tooltip =
    options.tooltip ??
    'Controls surface smoothing (0 = faceted edges, higher = smoother highlights)';
  const ariaLabel = options.ariaLabel ? ` aria-label="${options.ariaLabel}"` : '';
  const value =
    Number(options.value ?? DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG) ||
    DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
  return `
            <label class="slider-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <input
                id="${id}"
                type="range"
                min="${MIN_EXTRUDE_NORMAL_ANGLE_DEG}"
                max="${MAX_EXTRUDE_NORMAL_ANGLE_DEG}"
                step="1"
                value="${value}"${ariaLabel}
              />
              <span class="value" data-output="${outputKey}">${value}°</span>
            </label>`;
}

/**
 * @param {{
 *   id?: string,
 *   outputKey?: string,
 *   label?: string,
 *   tooltip?: string,
 *   depth?: number,
 *   value?: number,
 * }} [options]
 */
export function buildExtrudeBevelSliderHtml(options = {}) {
  const id = options.id ?? 'svgExtrudeBevelAmount';
  const outputKey = options.outputKey ?? 'svgExtrudeBevelAmount';
  const label = options.label ?? 'Bevel Amount';
  const tooltip =
    options.tooltip ??
    'Straight chamfer on cap edges (inward). Max 10% of depth — outline stays full size';
  const depth = Number(options.depth ?? DEFAULT_EXTRUDE_DEPTH) || DEFAULT_EXTRUDE_DEPTH;
  const maxBevel = maxExtrudeBevelAmount(depth);
  const amount = clampExtrudeBevelAmount(options.value ?? DEFAULT_EXTRUDE_BEVEL_AMOUNT, depth);
  const step = Math.max(0.001, maxBevel / 50);
  return `
            <label class="slider-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <input
                id="${id}"
                type="range"
                min="0"
                max="${maxBevel}"
                step="${step}"
                value="${amount}"
              />
              <span class="value" data-output="${outputKey}">${amount.toFixed(2)}</span>
            </label>`;
}

/**
 * @param {{
 *   id?: string,
 *   label?: string,
 *   tooltip?: string,
 *   value?: 'low' | 'medium' | 'high' | string,
 * }} [options]
 */
export function buildExtrudeDetailSelectHtml(options = {}) {
  const id = options.id ?? 'svgExtrudeDetail';
  const label = options.label ?? 'Detail';
  const tooltip =
    options.tooltip ??
    'Cap and side tessellation — Ultra is very dense; best for hero exports or simple shapes';
  const value = normalizeExtrudeDetail(options.value ?? 'medium');
  return `
            <label class="select-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <select id="${id}" aria-label="Extrusion detail">
                <option value="low"${value === 'low' ? ' selected' : ''}>Low</option>
                <option value="medium"${value === 'medium' ? ' selected' : ''}>Medium</option>
                <option value="high"${value === 'high' ? ' selected' : ''}>High</option>
                <option value="ultra"${value === 'ultra' ? ' selected' : ''}>Ultra</option>
              </select>
            </label>`;
}

/**
 * Depth, bevel, and smoothing angle sliders for SVG / font extrude panels.
 *
 * @param {{
 *   depth?: { id?: string, outputKey?: string, label?: string, tooltip?: string, value?: number },
 *   bevel?: { id?: string, outputKey?: string, label?: string, tooltip?: string, depth?: number, value?: number },
 *   angle?: { id?: string, outputKey?: string, label?: string, tooltip?: string, ariaLabel?: string, value?: number },
 *   detail?: { id?: string, label?: string, tooltip?: string, value?: 'low' | 'medium' | 'high' | 'ultra' | string } | false,
 * }} [sections]
 */
export function buildExtrudeCoreControlsHtml(sections = {}) {
  const depthOpts = sections.depth ?? {};
  const bevelOpts = {
    depth: depthOpts.value ?? DEFAULT_EXTRUDE_DEPTH,
    ...(sections.bevel ?? {}),
  };
  const parts = [
    buildExtrudeDepthSliderHtml(depthOpts),
    buildExtrudeBevelSliderHtml(bevelOpts),
  ];
  if (sections.detail !== false) {
    parts.push(buildExtrudeDetailSelectHtml(sections.detail ?? {}));
  }
  parts.push(buildExtrudeAngleSliderHtml(sections.angle ?? {}));
  return parts.join('');
}

/** Mount depth / bevel / angle controls into the SVG Extrude panel. */
export function ensureSvgExtrudeCoreControlsMounted() {
  const mount = document.getElementById('svgExtrudeCoreControlsMount');
  if (!mount) return;
  if (
    mount.dataset.mounted === '1' &&
    mount.querySelector('#svgExtrudeDepth') &&
    mount.querySelector('#svgExtrudeDetail option[value="ultra"]')
  ) {
    return;
  }
  mount.innerHTML = buildExtrudeCoreControlsHtml();
  mount.dataset.mounted = '1';
}

/** Mount shared surface controls into the Studio Base panel. */
export function ensureBaseSurfaceControlsMounted() {
  const mount = document.getElementById('baseSurfaceControlsMount');
  if (!mount) return;
  if (mount.dataset.mounted === '1' && mount.querySelector('#baseSurfaceStrength')) {
    return;
  }
  mount.innerHTML = buildSvgExtrudeSurfaceControlsHtml({
    presetId: 'baseSurfacePreset',
    scaleId: 'baseSurfaceScale',
    scaleOutput: 'baseSurfaceScale',
    strengthId: 'baseSurfaceStrength',
    strengthOutput: 'baseSurfaceStrength',
    presetAriaLabel: 'Base surface material',
  });
  mount.dataset.mounted = '1';
}

function emitBaseSurface(eventBus, stateStore) {
  eventBus.emit('studio:base-surface', {
    preset: stateStore.getState().baseSurfacePreset ?? 'none',
    scale: Number(stateStore.getState().baseSurfaceScale ?? 1) || 1.0,
    strength: clampSurfaceStrength(stateStore.getState().baseSurfaceStrength ?? 1),
  });
}

function syncBaseSurfaceStrengthControl(ctx, state, canEdit) {
  const { inputs, helpers, ui } = ctx;
  if (!inputs.surfaceStrength) return;
  const config = getSvgExtrudeSurfacePresetConfig(state.baseSurfacePreset ?? 'none');
  const isNormalMap = config.kind === 'normalMap';
  const strength = clampSurfaceStrength(state.baseSurfaceStrength ?? 1);
  if (document.activeElement !== inputs.surfaceStrength) {
    inputs.surfaceStrength.value = strength;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
  }
  ui.setControlDisabled(inputs.surfaceStrength, !canEdit || !isNormalMap);
}

/**
 * @param {Object} ctx
 * @param {Record<string, HTMLElement | null>} ctx.inputs
 * @param {import('../StateStore.js').StateStore} ctx.stateStore
 * @param {import('../EventBus.js').EventBus} ctx.eventBus
 * @param {import('../UIManager.js').UIManager} ctx.ui
 * @param {import('./UIHelpers.js').UIHelpers} ctx.helpers
 */
export function bindBaseSurfaceControls(ctx) {
  const { inputs, stateStore, eventBus, ui, helpers } = ctx;

  inputs.surfacePreset?.addEventListener('change', (event) => {
    const preset = event?.target?.value || 'none';
    stateStore.set('baseSurfacePreset', preset);
    syncBaseSurfaceStrengthControl(ctx, stateStore.getState(), true);
    emitBaseSurface(eventBus, stateStore);
  });

  inputs.surfaceScale?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const scale = clampSurfaceUiScale(Number.isFinite(value) ? value : 1.0);
    helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    stateStore.set('baseSurfaceScale', scale);
    emitBaseSurface(eventBus, stateStore);
  });
  if (inputs.surfaceScale) helpers.enableSliderKeyboardStepping(inputs.surfaceScale);

  inputs.surfaceStrength?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const strength = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1.0;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
    stateStore.set('baseSurfaceStrength', strength);
    emitBaseSurface(eventBus, stateStore);
  });
  if (inputs.surfaceStrength) helpers.enableSliderKeyboardStepping(inputs.surfaceStrength);
}

/**
 * @param {Object} ctx
 * @param {Record<string, unknown>} state
 * @param {boolean} canEdit
 */
export function syncBaseSurfaceControls(ctx, state, canEdit) {
  const { inputs, helpers, ui } = ctx;
  if (inputs.surfacePreset) {
    inputs.surfacePreset.value = state.baseSurfacePreset ?? 'none';
    ui.setControlDisabled(inputs.surfacePreset, !canEdit);
  }
  if (inputs.surfaceScale) {
    const scale = clampSurfaceUiScale(Number(state.baseSurfaceScale ?? 1) || 1.0);
    if (document.activeElement !== inputs.surfaceScale) {
      inputs.surfaceScale.value = scale;
      helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    }
    ui.setControlDisabled(inputs.surfaceScale, !canEdit);
  }
  syncBaseSurfaceStrengthControl(ctx, state, canEdit);
}

/** Mount shared surface controls into the Studio backdrop panel. */
export function ensureBackdropSurfaceControlsMounted() {
  const mount = document.getElementById('backdropSurfaceControlsMount');
  if (!mount) return;
  if (mount.dataset.mounted === '1' && mount.querySelector('#backdropSurfaceStrength')) {
    return;
  }
  mount.innerHTML = buildSvgExtrudeSurfaceControlsHtml({
    presetId: 'backdropSurfacePreset',
    scaleId: 'backdropSurfaceScale',
    scaleOutput: 'backdropSurfaceScale',
    strengthId: 'backdropSurfaceStrength',
    strengthOutput: 'backdropSurfaceStrength',
    presetAriaLabel: 'Studio backdrop surface material',
  });
  mount.dataset.mounted = '1';
}

function emitBackdropSurface(eventBus, stateStore) {
  eventBus.emit('studio:backdrop-surface', {
    preset: stateStore.getState().backdropSurfacePreset ?? 'none',
    scale: Number(stateStore.getState().backdropSurfaceScale ?? 1) || 1.0,
    strength: clampSurfaceStrength(stateStore.getState().backdropSurfaceStrength ?? 1),
  });
}

function syncBackdropSurfaceStrengthControl(ctx, state, canEdit) {
  const { inputs, helpers, ui } = ctx;
  if (!inputs.surfaceStrength) return;
  const config = getSvgExtrudeSurfacePresetConfig(state.backdropSurfacePreset ?? 'none');
  const isNormalMap = config.kind === 'normalMap';
  const strength = clampSurfaceStrength(state.backdropSurfaceStrength ?? 1);
  if (document.activeElement !== inputs.surfaceStrength) {
    inputs.surfaceStrength.value = strength;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
  }
  ui.setControlDisabled(inputs.surfaceStrength, !canEdit || !isNormalMap);
}

/**
 * @param {Object} ctx
 * @param {Record<string, HTMLElement | null>} ctx.inputs
 * @param {import('../StateStore.js').StateStore} ctx.stateStore
 * @param {import('../EventBus.js').EventBus} ctx.eventBus
 * @param {import('../UIManager.js').UIManager} ctx.ui
 * @param {import('./UIHelpers.js').UIHelpers} ctx.helpers
 */
export function bindBackdropSurfaceControls(ctx) {
  const { inputs, stateStore, eventBus, ui, helpers } = ctx;

  inputs.surfacePreset?.addEventListener('change', (event) => {
    const preset = event?.target?.value || 'none';
    stateStore.set('backdropSurfacePreset', preset);
    syncBackdropSurfaceStrengthControl(ctx, stateStore.getState(), true);
    emitBackdropSurface(eventBus, stateStore);
  });

  inputs.surfaceScale?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const scale = clampSurfaceUiScale(Number.isFinite(value) ? value : 1.0);
    helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    stateStore.set('backdropSurfaceScale', scale);
    emitBackdropSurface(eventBus, stateStore);
  });
  if (inputs.surfaceScale) helpers.enableSliderKeyboardStepping(inputs.surfaceScale);

  inputs.surfaceStrength?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const strength = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1.0;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
    stateStore.set('backdropSurfaceStrength', strength);
    emitBackdropSurface(eventBus, stateStore);
  });
  if (inputs.surfaceStrength) helpers.enableSliderKeyboardStepping(inputs.surfaceStrength);
}

/**
 * @param {Object} ctx
 * @param {Record<string, unknown>} state
 * @param {boolean} canEdit
 */
export function syncBackdropSurfaceControls(ctx, state, canEdit) {
  const { inputs, helpers, ui } = ctx;
  if (inputs.surfacePreset) {
    inputs.surfacePreset.value = state.backdropSurfacePreset ?? 'none';
    ui.setControlDisabled(inputs.surfacePreset, !canEdit);
  }
  if (inputs.surfaceScale) {
    const scale = clampSurfaceUiScale(Number(state.backdropSurfaceScale ?? 1) || 1.0);
    if (document.activeElement !== inputs.surfaceScale) {
      inputs.surfaceScale.value = scale;
      helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    }
    ui.setControlDisabled(inputs.surfaceScale, !canEdit);
  }
  syncBackdropSurfaceStrengthControl(ctx, state, canEdit);
}

/** Mount shared surface controls into the SVG Extrude panel (replaces static index.html copy). */
export function ensureSvgExtrudeSurfaceControlsMounted() {
  const mount = document.getElementById('svgExtrudeSurfaceControlsMount');
  if (!mount) return;
  if (mount.dataset.mounted === '1' && mount.querySelector('#svgExtrudeSurfaceStrength')) {
    return;
  }
  mount.innerHTML = buildSvgExtrudeSurfaceControlsHtml();
  mount.dataset.mounted = '1';
}

function emitSvgExtrudeSurface(eventBus, stateStore) {
  const svg = stateStore.getState().svgExtrude || {};
  eventBus.emit('mesh:svg-extrude-surface', {
    preset: svg.surfacePreset ?? 'none',
    scale: Number(svg.surfaceScale ?? 1) || 1.0,
    strength: clampSurfaceStrength(svg.surfaceStrength ?? 1),
  });
}

function syncSurfaceStrengthControl(ctx, svg, canEdit) {
  const { inputs, helpers, ui } = ctx;
  if (!inputs.surfaceStrength) return;
  const config = getSvgExtrudeSurfacePresetConfig(svg.surfacePreset ?? 'none');
  const isNormalMap = config.kind === 'normalMap';
  const strength = clampSurfaceStrength(svg.surfaceStrength ?? 1);
  if (document.activeElement !== inputs.surfaceStrength) {
    inputs.surfaceStrength.value = strength;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
  }
  ui.setControlDisabled(inputs.surfaceStrength, !canEdit || !isNormalMap);
}

/**
 * @param {Object} ctx
 * @param {Record<string, HTMLElement | null>} ctx.inputs
 * @param {import('../StateStore.js').StateStore} ctx.stateStore
 * @param {import('../EventBus.js').EventBus} ctx.eventBus
 * @param {import('../UIManager.js').UIManager} ctx.ui
 * @param {import('./UIHelpers.js').UIHelpers} ctx.helpers
 * @param {{ depth: ReturnType<typeof setTimeout> | null, normal: ReturnType<typeof setTimeout> | null, colorDebounce: Map<string, ReturnType<typeof setTimeout>> }} ctx.timers
 */
export function bindSvgExtrudeControls(ctx) {
  const { inputs, stateStore, eventBus, ui, helpers, timers } = ctx;

  inputs.depth?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const clampedValue = Number.isFinite(value)
      ? Math.max(MIN_EXTRUDE_DEPTH, Math.min(MAX_EXTRUDE_DEPTH, value))
      : DEFAULT_EXTRUDE_DEPTH;
    helpers.updateValueLabel(inputs.depthOutputKey, clampedValue, 'decimal');
    stateStore.set('svgExtrude.depth', clampedValue);
    const prevBevel = stateStore.getState().svgExtrude?.bevelAmount ?? 0;
    const clampedBevel = clampExtrudeBevelAmount(prevBevel, clampedValue);
    const svg = { ...(stateStore.getState().svgExtrude || {}), depth: clampedValue };
    if (clampedBevel !== prevBevel) {
      stateStore.set('svgExtrude.bevelAmount', clampedBevel);
      svg.bevelAmount = clampedBevel;
    }
    syncExtrudeBevelControlInputs(ctx, svg, true);
    if (timers.depth) clearTimeout(timers.depth);
    timers.depth = setTimeout(() => {
      eventBus.emit('mesh:svg-extrude-depth', clampedValue);
      if (inputs.bevelAmount && clampedBevel !== prevBevel) {
        eventBus.emit('mesh:svg-extrude-bevel', { amount: clampedBevel });
      }
    }, 45);
  });
  if (inputs.depth) helpers.enableSliderKeyboardStepping(inputs.depth);

  inputs.normalAngle?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const clampedValue = Number.isFinite(value)
      ? Math.max(MIN_EXTRUDE_NORMAL_ANGLE_DEG, Math.min(MAX_EXTRUDE_NORMAL_ANGLE_DEG, value))
      : DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
    helpers.updateValueLabel(inputs.normalAngleOutputKey, clampedValue, 'angle');
    stateStore.set('svgExtrude.normalAngle', clampedValue);
    if (timers.normal) clearTimeout(timers.normal);
    timers.normal = setTimeout(() => {
      eventBus.emit('mesh:svg-extrude-normal-angle', clampedValue);
    }, 45);
  });
  if (inputs.normalAngle) helpers.enableSliderKeyboardStepping(inputs.normalAngle);

  inputs.detail?.addEventListener('change', (event) => {
    ui.uiSounds?.playSelect?.();
    const value = normalizeExtrudeDetail(event?.target?.value);
    stateStore.set('svgExtrude.detail', value);
    eventBus.emit('mesh:svg-extrude-detail', value);
  });

  inputs.surfacePreset?.addEventListener('change', (event) => {
    const preset = event?.target?.value || 'none';
    stateStore.set('svgExtrude.surfacePreset', preset);
    syncSurfaceStrengthControl(ctx, stateStore.getState().svgExtrude || {}, true);
    emitSvgExtrudeSurface(eventBus, stateStore);
  });

  inputs.surfaceScale?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const scale = clampSurfaceUiScale(Number.isFinite(value) ? value : 1.0);
    helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    stateStore.set('svgExtrude.surfaceScale', scale);
    emitSvgExtrudeSurface(eventBus, stateStore);
  });
  if (inputs.surfaceScale) helpers.enableSliderKeyboardStepping(inputs.surfaceScale);

  inputs.surfaceStrength?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const strength = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1.0;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
    stateStore.set('svgExtrude.surfaceStrength', strength);
    emitSvgExtrudeSurface(eventBus, stateStore);
  });
  if (inputs.surfaceStrength) helpers.enableSliderKeyboardStepping(inputs.surfaceStrength);

  inputs.flipDirection?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    stateStore.set('svgExtrude.flipDirection', enabled);
    eventBus.emit('mesh:svg-extrude-flip-direction', enabled);
  });

  inputs.colorOverride?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    const color = inputs.overrideColor?.value || DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR;
    stateStore.set('svgExtrude.colorOverride', enabled);
    eventBus.emit('mesh:svg-extrude-color-override', { enabled, color });
  });

  inputs.overrideColor?.addEventListener('input', (event) => {
    const color = event.target.value;
    const enabled = !!stateStore.getState().svgExtrude?.colorOverride;
    stateStore.set('svgExtrude.overrideColor', color);
    eventBus.emit('mesh:svg-extrude-color-override', { enabled, color });
  });

  const onColorDepthInput = (event) => {
    const input = event.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'range') return;
    const color = input.dataset.color;
    const kind = input.dataset.kind || 'depth';
    if (!color) return;
    const value = parseFloat(input.value);
    const clampedValue =
      kind === 'offset'
        ? Number.isFinite(value)
          ? Math.max(-1.0, Math.min(1.0, value))
          : 0
        : Number.isFinite(value)
          ? Math.max(MIN_EXTRUDE_DEPTH, Math.min(MAX_EXTRUDE_DEPTH, value))
          : DEFAULT_EXTRUDE_DEPTH;
    const sliderLine = input.closest('.slider-line');
    const numberInput = sliderLine?.querySelector('input[type="number"]');
    if (numberInput) numberInput.value = clampedValue.toFixed(2);
    if (kind === 'offset') {
      const currentOffsets = {
        ...(stateStore.getState().svgExtrude?.colorOffsets || {}),
        [color]: clampedValue,
      };
      stateStore.set('svgExtrude.colorOffsets', currentOffsets);
    } else {
      const currentDepths = {
        ...(stateStore.getState().svgExtrude?.colorDepths || {}),
        [color]: clampedValue,
      };
      stateStore.set('svgExtrude.colorDepths', currentDepths);
    }
    const timerKey = `${kind}:${color}`;
    const existingTimer = timers.colorDebounce.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      if (kind === 'offset') {
        eventBus.emit('mesh:svg-extrude-color-offset', { color, offset: clampedValue });
      } else {
        eventBus.emit('mesh:svg-extrude-color-depth', { color, depth: clampedValue });
      }
      timers.colorDebounce.delete(timerKey);
    }, 50);
    timers.colorDebounce.set(timerKey, timer);
  };

  const onColorDepthChange = (event) => {
    const input = event.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'number') return;
    const color = input.dataset.color;
    const kind = input.dataset.kind || 'depth';
    if (!color) return;
    const value = parseFloat(input.value);
    const clampedValue =
      kind === 'offset'
        ? Number.isFinite(value)
          ? Math.max(-1.0, Math.min(1.0, value))
          : 0
        : Number.isFinite(value)
          ? Math.max(MIN_EXTRUDE_DEPTH, Math.min(MAX_EXTRUDE_DEPTH, value))
          : DEFAULT_EXTRUDE_DEPTH;
    input.value = clampedValue.toFixed(2);
    const sliderLine = input.closest('.slider-line');
    const rangeInput = sliderLine?.querySelector('input[type="range"]');
    if (rangeInput) rangeInput.value = String(clampedValue);
    if (kind === 'offset') {
      const currentOffsets = {
        ...(stateStore.getState().svgExtrude?.colorOffsets || {}),
        [color]: clampedValue,
      };
      stateStore.set('svgExtrude.colorOffsets', currentOffsets);
      eventBus.emit('mesh:svg-extrude-color-offset', { color, offset: clampedValue });
    } else {
      const currentDepths = {
        ...(stateStore.getState().svgExtrude?.colorDepths || {}),
        [color]: clampedValue,
      };
      stateStore.set('svgExtrude.colorDepths', currentDepths);
      eventBus.emit('mesh:svg-extrude-color-depth', { color, depth: clampedValue });
    }
  };

  inputs.colorDepths?.addEventListener('input', onColorDepthInput);
  inputs.colorDepths?.addEventListener('change', onColorDepthChange);
}

function syncExtrudeBevelControlInputs(ctx, svg, canEdit) {
  const { inputs, helpers, ui } = ctx;
  const depth = Number(svg.depth ?? DEFAULT_EXTRUDE_DEPTH);
  const maxBevel = maxExtrudeBevelAmount(depth);
  const amount = clampExtrudeBevelAmount(svg.bevelAmount ?? 0, depth);

  if (inputs.bevelAmount) {
    inputs.bevelAmount.max = String(maxBevel);
    inputs.bevelAmount.step = String(Math.max(0.001, maxBevel / 50));
    if (document.activeElement !== inputs.bevelAmount) {
      inputs.bevelAmount.value = amount;
      helpers.updateValueLabel(inputs.bevelAmountOutputKey, amount, 'decimal');
    }
    ui.setControlDisabled(inputs.bevelAmount, !canEdit);
  }
}

/**
 * Bevel controls for font and SVG extrude (stored in svgExtrude state).
 * @param {Object} ctx — same shape as bindSvgExtrudeControls
 */
export function bindExtrudeBevelControls(ctx) {
  const { inputs, stateStore, eventBus, ui, helpers, timers } = ctx;

  inputs.bevelAmount?.addEventListener('input', (event) => {
    const depth = Number(stateStore.getState().svgExtrude?.depth ?? DEFAULT_EXTRUDE_DEPTH);
    const maxBevel = maxExtrudeBevelAmount(depth);
    const value = parseFloat(event.target.value);
    const clampedValue = Number.isFinite(value)
      ? Math.max(0, Math.min(maxBevel, value))
      : 0;
    helpers.updateValueLabel(inputs.bevelAmountOutputKey, clampedValue, 'decimal');
    stateStore.set('svgExtrude.bevelAmount', clampedValue);
    syncExtrudeBevelControlInputs(ctx, stateStore.getState().svgExtrude || {}, true);
    if (timers.bevel) clearTimeout(timers.bevel);
    timers.bevel = setTimeout(() => {
      eventBus.emit('mesh:svg-extrude-bevel', { amount: clampedValue });
    }, 45);
  });
  if (inputs.bevelAmount) helpers.enableSliderKeyboardStepping(inputs.bevelAmount);
}

/**
 * @param {Object} ctx
 * @param {Record<string, HTMLElement | null>} ctx.inputs
 * @param {import('./UIHelpers.js').UIHelpers} ctx.helpers
 * @param {import('../UIManager.js').UIManager} ctx.ui
 * @param {import('../StateStore.js').StateStore} ctx.stateStore
 * @param {Object} state
 * @param {{ requireEnabled?: boolean }} [options]
 */
export function syncSvgExtrudeControls(ctx, state, options = {}) {
  const { inputs, helpers, ui } = ctx;
  const { requireEnabled = true } = options;
  const svg = state.svgExtrude || {};
  const enabled = requireEnabled ? !!svg.enabled : true;
  const canEdit = enabled;

  if (inputs.depth) {
    const depth = svg.depth ?? DEFAULT_EXTRUDE_DEPTH;
    if (document.activeElement !== inputs.depth) {
      inputs.depth.value = depth;
      helpers.updateValueLabel(inputs.depthOutputKey, depth, 'decimal');
    }
    ui.setControlDisabled(inputs.depth, !canEdit);
    if (inputs.bevelAmount) {
      syncExtrudeBevelControlInputs(ctx, svg, canEdit);
    }
  }
  if (inputs.normalAngle) {
    const normalAngle = svg.normalAngle ?? DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
    if (document.activeElement !== inputs.normalAngle) {
      inputs.normalAngle.value = normalAngle;
      helpers.updateValueLabel(inputs.normalAngleOutputKey, normalAngle, 'angle');
    }
    ui.setControlDisabled(inputs.normalAngle, !canEdit);
  }
  if (inputs.detail) {
    const detail = normalizeExtrudeDetail(svg.detail ?? 'medium');
    if (document.activeElement !== inputs.detail) {
      inputs.detail.value = detail;
    }
    ui.setControlDisabled(inputs.detail, !canEdit);
  }
  if (inputs.surfacePreset) {
    inputs.surfacePreset.value = svg.surfacePreset ?? 'none';
    ui.setControlDisabled(inputs.surfacePreset, !canEdit);
  }
  if (inputs.surfaceScale) {
    const scale = clampSurfaceUiScale(Number(svg.surfaceScale ?? 1) || 1.0);
    if (document.activeElement !== inputs.surfaceScale) {
      inputs.surfaceScale.value = scale;
      helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    }
    ui.setControlDisabled(inputs.surfaceScale, !canEdit);
  }
  syncSurfaceStrengthControl(ctx, svg, canEdit);
  if (inputs.flipDirection) {
    inputs.flipDirection.checked = !!svg.flipDirection;
    ui.setControlDisabled(inputs.flipDirection, !canEdit);
  }
  if (inputs.colorOverride) {
    inputs.colorOverride.checked = !!svg.colorOverride;
    ui.setControlDisabled(inputs.colorOverride, !canEdit);
  }
  if (inputs.overrideColor) {
    const overrideEnabled = !!svg.colorOverride;
    const color = svg.overrideColor ?? DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR;
    if (document.activeElement !== inputs.overrideColor) {
      inputs.overrideColor.value = color;
    }
    ui.setControlDisabled(inputs.overrideColor, !(canEdit && overrideEnabled));
  }
}

/**
 * @param {HTMLElement | null} container
 * @param {Object} state
 * @param {import('../UIManager.js').UIManager} ui
 */
export function renderSvgColorDepthControls(container, state, ui) {
  if (!container) return;
  const enabled = !!state.svgExtrude?.enabled;
  const palette = Array.isArray(state.svgExtrude?.availableColors)
    ? state.svgExtrude.availableColors
    : [];
  const overrides = state.svgExtrude?.colorDepths || {};
  const offsets = state.svgExtrude?.colorOffsets || {};
  const globalDepth = Number(state.svgExtrude?.depth ?? DEFAULT_EXTRUDE_DEPTH);

  if (!enabled) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  if (palette.length === 0) {
    container.innerHTML =
      '<div class="svg-extrude-note">Per-color controls appear after you generate text or import a multi-color SVG.</div>';
    container.style.display = '';
    return;
  }

  if (palette.length === 1) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = '';

  const rows = `<div class="svg-extrude-note">Fine-tune each fill. Depth above scales all layers together.</div>${palette
    .map((color, index) => {
      const depth = Number.isFinite(Number(overrides[color]))
        ? Number(overrides[color])
        : globalDepth;
      const safeDepth = Math.max(0.01, Math.min(2.0, depth));
      const offset = Number.isFinite(Number(offsets[color])) ? Number(offsets[color]) : 0;
      const safeOffset = Math.max(-1.0, Math.min(1.0, offset));
      return `
<label class="slider-line">
  <span>
    <span class="color-chip" style="background:${color}; pointer-events:none;" title="${color.toUpperCase()}"></span>
    Depth ${index + 1}
  </span>
  <input type="range" min="0.01" max="2" step="0.005" value="${safeDepth.toFixed(2)}" data-color="${color}" data-kind="depth" aria-label="Per-color depth ${index + 1} (${color.toUpperCase()})" title="Depth for ${color.toUpperCase()}" />
  <input type="number" min="0.01" max="2" step="0.01" class="svg-extrude-inline-number" value="${safeDepth.toFixed(2)}" data-color="${color}" data-kind="depth" aria-label="Per-color depth value ${index + 1} (${color.toUpperCase()})" />
</label>
<label class="slider-line">
  <span>
    <span class="color-chip" style="background:${color}; pointer-events:none;" title="${color.toUpperCase()}"></span>
    Position ${index + 1}
  </span>
  <input type="range" min="-1" max="1" step="0.005" value="${safeOffset.toFixed(2)}" data-color="${color}" data-kind="offset" aria-label="Per-color position ${index + 1} (${color.toUpperCase()})" title="Position for ${color.toUpperCase()}" />
  <input type="number" min="-1" max="1" step="0.01" class="svg-extrude-inline-number" value="${safeOffset.toFixed(2)}" data-color="${color}" data-kind="offset" aria-label="Per-color position value ${index + 1} (${color.toUpperCase()})" />
</label>`;
    })
    .join('')}`;

  container.innerHTML = rows;
  container.querySelectorAll('input[type="range"]').forEach((input) => {
    input.disabled = !enabled;
    input.classList.toggle('is-disabled-handle', !enabled);
  });
}

function buildFontRevealTypeOptionsHtml() {
  return FONT_REVEAL_TYPE_OPTIONS.map(
    (opt) =>
      `<option value="${opt.id}"${
        opt.id === DEFAULT_FONT_REVEAL_TYPE ? ' selected' : ''
      }>${opt.label}</option>`,
  ).join('');
}

/** Reveal animation — only visible once 3D text exists. */
export const FONT_EXTRUDE_ANIMATION_CONTROLS_HTML = `
            <div class="font-extrude-animation" id="fontExtrudeAnimation">
              <label class="select-line font-extrude-reveal-type">
                <span data-tooltip="Per-letter reveal style (GSAP-inspired eases)">Reveal Type</span>
                <select id="fontExtrudeRevealType" aria-label="Reveal animation type">
                  ${buildFontRevealTypeOptionsHtml()}
                </select>
              </label>
              <label class="slider-line font-extrude-reveal-duration">
                <span data-tooltip="Character-by-character reveal. Last letter finishes at this time. 0 = off.">Reveal Duration</span>
                <input id="fontExtrudeRevealDuration" type="range" min="0" max="5" step="0.1" value="2" />
                <span class="value" data-output="fontExtrudeRevealDuration">2.0s</span>
              </label>
              <label class="slider-line font-extrude-reveal-slide-depth">
                <span data-tooltip="How far each letter starts in depth before sliding into place">Slide Depth</span>
                <input id="fontExtrudeRevealSlideDepth" type="range" min="0" max="2.5" step="0.01" value="0.18" />
                <span class="value" data-output="fontExtrudeRevealSlideDepth">0.18</span>
              </label>
              <label class="slider-line font-extrude-reveal-slide-time">
                <span data-tooltip="Share of each letter's slot for depth travel. 100% uses the full slot and shows the soft ease-out landing best.">Slide Time</span>
                <input id="fontExtrudeRevealSlideTime" type="range" min="0.1" max="1" step="0.01" value="0.45" />
                <span class="value" data-output="fontExtrudeRevealSlideTime">45%</span>
              </label>
              <label class="select-line font-extrude-reveal-slide-direction">
                <span data-tooltip="Choose whether depth travel starts from behind or from camera side">Slide Direction</span>
                <select id="fontExtrudeRevealSlideDirection" aria-label="Reveal slide direction">
                  <option value="back" selected>From back</option>
                  <option value="front">From front</option>
                </select>
              </label>
              <div class="font-extrude-divider font-extrude-reveal-emissive-divider" aria-hidden="true"></div>
              <div class="font-extrude-reveal-emissive" role="group" aria-label="Emissive reveal">
                <label class="slider-line slider-line--toggle-only font-extrude-reveal-emissive-slam">
                  <span data-tooltip="Each letter reveals with emissive glow, then fades to rest after it lands">Emissive Slam</span>
                  <label class="effect-toggle font-extrude-reveal-emissive-toggle">
                    <input type="checkbox" id="fontExtrudeRevealEmissiveSlam" />
                    <span class="effect-indicator" aria-hidden="true"></span>
                    <span class="sr-only">Emissive slam on reveal</span>
                  </label>
                </label>
                <label class="slider-line font-extrude-reveal-emissive-strength">
                  <span data-tooltip="Emissive intensity while each letter is revealing and during fade-out">Emissive Strength</span>
                  <input id="fontExtrudeRevealEmissiveStrength" type="range" min="0" max="2" step="0.05" value="1" />
                  <span class="value" data-output="fontExtrudeRevealEmissiveStrength">1.00</span>
                </label>
                <label class="slider-line font-extrude-reveal-emissive-decay">
                  <span data-tooltip="How long emissive fades to rest after each letter lands">Emissive Time</span>
                  <input id="fontExtrudeRevealEmissiveDecay" type="range" min="0.05" max="0.8" step="0.01" value="0.35" />
                  <span class="value" data-output="fontExtrudeRevealEmissiveDecay">0.35s</span>
                </label>
                <label class="color-line font-extrude-reveal-emissive-color">
                  <span data-tooltip="Emissive color mixed in at peak flash">Emissive Color</span>
                  <input type="color" id="fontExtrudeRevealEmissiveColor" class="color-chip" value="#c4ff00" />
                </label>
              </div>
              <div class="font-extrude-divider font-extrude-reveal-preview-divider" aria-hidden="true"></div>
              <div class="font-extrude-reveal-preview animation-controls">
                <button
                  type="button"
                  id="fontExtrudeRevealPlay"
                  class="animation-play-btn"
                  disabled
                  aria-label="Play reveal animation"
                  data-tooltip="Play reveal preview"
                >
                  <i class="fa-solid fa-play" aria-hidden="true"></i>
                  <span class="sr-only">Play or pause</span>
                </button>
                <div class="font-extrude-reveal-loop-control" data-tooltip="When off, preview plays once and stops">
                  <span class="font-extrude-reveal-loop-label">Loop</span>
                  <label class="effect-toggle font-extrude-reveal-loop-toggle">
                    <input type="checkbox" id="fontExtrudeRevealLoop" checked />
                    <span class="effect-indicator" aria-hidden="true"></span>
                  </label>
                </div>
                <input
                  type="range"
                  id="fontExtrudeRevealScrub"
                  min="0"
                  max="1"
                  step="0.001"
                  value="1"
                  disabled
                  aria-label="Reveal animation progress"
                />
                <span class="font-extrude-reveal-time" id="fontExtrudeRevealTime">0.0s</span>
              </div>
            </div>
`;

/** Depth + smoothing — shown after the first 3D text generate (rebuilds existing mesh). */
export const FONT_EXTRUDE_POST_GEN_CONTROLS_HTML = `
          <div id="fontExtrudePostGen" class="font-extrude-post-gen" hidden>
            ${buildExtrudeCoreControlsHtml({
              depth: {
                id: 'fontExtrudeMeshDepth',
                outputKey: 'fontExtrudeMeshDepth',
                label: 'Extrude Depth',
                tooltip: 'Overall extrusion depth for generated text',
              },
              bevel: {
                id: 'fontExtrudeBevelAmount',
                outputKey: 'fontExtrudeBevelAmount',
                tooltip:
                  'Straight chamfer on cap edges (inward). Max 10% of depth — font outline stays full size',
              },
              detail: false,
              angle: {
                id: 'fontExtrudeMeshAngle',
                outputKey: 'fontExtrudeMeshAngle',
                label: 'Smoothing Angle',
                tooltip:
                  'Controls surface smoothing on letter edges (0 = faceted, higher = smoother)',
                ariaLabel: 'Smoothing angle',
              },
            })}
            <div class="font-extrude-surface-group">
              ${buildSvgExtrudeSurfaceControlsHtml({
                presetId: 'fontExtrudeSurfacePreset',
                scaleId: 'fontExtrudeSurfaceScale',
                scaleOutput: 'fontExtrudeSurfaceScale',
                strengthId: 'fontExtrudeSurfaceStrength',
                strengthOutput: 'fontExtrudeSurfaceStrength',
                presetAriaLabel: 'Font extrude surface material',
              })}
            </div>
            <div class="font-extrude-divider" aria-hidden="true"></div>
            ${FONT_EXTRUDE_ANIMATION_CONTROLS_HTML}
          </div>
`;
