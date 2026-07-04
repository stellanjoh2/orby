import {
  clampExtrudeBevelAmount,
  maxExtrudeBevelAmount,
  FONT_BEVEL_CONVEX_ENABLED,
  normalizeFontBevelType,
} from '../import/extrudeBevel.js';
import { normalizeExtrudeDetail } from '../import/extrudeDetail.js';
import {
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG,
  DEFAULT_SVG_EXTRUDE_HARD_EDGE_ANGLE_DEG,
  DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
  MAX_EXTRUDE_DEPTH,
  MIN_EXTRUDE_DEPTH,
  MIN_EXTRUDE_NORMAL_ANGLE_DEG,
  MAX_EXTRUDE_NORMAL_ANGLE_DEG,
  normalizeSvgOverrideHex,
} from '../import/extrudeDefaults.js';
import {
  clampExtrudeHardEdgeAngleDeg,
  MAX_EXTRUDE_HARD_EDGE_ANGLE_DEG,
  MIN_EXTRUDE_HARD_EDGE_ANGLE_DEG,
} from '../import/extrudeImporterShared.js';
import {
  FONT_REVEAL_TYPE_OPTIONS,
  FONT_REVEAL_UNIT_OPTIONS,
  DEFAULT_FONT_REVEAL_TYPE,
  DEFAULT_FONT_REVEAL_UNIT,
} from '../scene/fontTextRevealTypes.js';
import {
  FONT_CONSTANT_TYPE_OPTIONS,
  DEFAULT_FONT_CONSTANT_TYPE,
} from '../scene/fontTextConstantTypes.js';
import { MAX_FONT_TRACKING_ANIMATOR_START } from '../scene/fontTextTrackingAnimation.js';
import {
  clampSurfaceStrength,
  clampSurfaceUiScale,
  creativeLookPresetSupportsSurfaceDetail,
  getSvgExtrudeSurfacePresetConfig,
  isMaterialObjectSurfaceEnabled,
  surfaceUiScaleToShaderScale,
  SVG_EXTRUDE_SURFACE_PRESETS,
  DEFAULT_SURFACE_NORMAL_MAP_PRESET,
  normalizeSurfaceLastPresetId,
  normalizeSurfacePresetId,
} from '../render/SvgExtrudeSurfaceShader.js';

function surfaceControlsBlockedByCreativeLook(state) {
  const cl = state?.creativeLook;
  return !!(cl?.enabled && !creativeLookPresetSupportsSurfaceDetail(cl.preset));
}

function surfaceControlsCreativeLookActive(state) {
  const cl = state?.creativeLook;
  return !!(cl?.enabled && creativeLookPresetSupportsSurfaceDetail(cl.preset));
}

/** Readout: higher = finer detail (matches shader frequency). */
function formatSurfaceDetailLabel(storedScale) {
  return surfaceUiScaleToShaderScale(storedScale);
}

/**
 * Shared SVG / font extrude controls (same state.svgExtrude + mesh:* events).
 */

const BEVEL_UNDER_DEVELOPMENT_TOOLTIP =
  'Under development — bevels are very difficult to get right';

/** Pink exclamation — matches .dev-badge elsewhere in the shelf. */
function buildBevelDevBadgeHtml() {
  return `<span class="dev-badge" data-tooltip="${BEVEL_UNDER_DEVELOPMENT_TOOLTIP}" tabindex="0" role="img" aria-label="${BEVEL_UNDER_DEVELOPMENT_TOOLTIP}"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i></span>`;
}

function buildControlLabelWithDevBadge(label, tooltip) {
  return `<span class="block-title-name"><span data-tooltip="${tooltip}">${label}</span>${buildBevelDevBadgeHtml()}</span>`;
}

/**
 * Normal-map surface library markup (single source for preset list + labels).
 * @param {{
 *   presetId?: string,
 *   scaleId?: string,
 *   scaleOutput?: string,
 *   strengthId?: string,
 *   strengthOutput?: string,
 *   presetAriaLabel?: string,
 *   presetLabel?: string,
 *   strengthLabel?: string,
 * }} [ids]
 */
export function buildSvgExtrudeSurfaceControlsHtml(ids = {}) {
  const presetId = ids.presetId ?? 'svgExtrudeSurfacePreset';
  const scaleId = ids.scaleId ?? 'svgExtrudeSurfaceScale';
  const scaleOutput = ids.scaleOutput ?? 'svgExtrudeSurfaceScale';
  const strengthId = ids.strengthId ?? 'svgExtrudeSurfaceStrength';
  const strengthOutput = ids.strengthOutput ?? 'svgExtrudeSurfaceStrength';
  const presetAriaLabel = ids.presetAriaLabel ?? 'Extrude surface material';
  const presetLabel = ids.presetLabel ?? 'Surface';
  const strengthLabel = ids.strengthLabel ?? 'Strength';
  const includeNoneOption = ids.includeNoneOption !== false;
  const options = SVG_EXTRUDE_SURFACE_PRESETS.filter(
    (p) => includeNoneOption || p.id !== 'none',
  ).map(
    (p) => `<option value="${p.id}">${p.label}</option>`,
  ).join('');
  return `
            <label class="select-line">
              <span data-tooltip="Triplanar normal-map surface detail — also modulates compatible Shader Lab presets (Holographic, Scanline, Plasma, Chrome, Glass)">${presetLabel}</span>
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
              <span data-tooltip="Normal-map bump intensity (map presets only)">${strengthLabel}</span>
              <input id="${strengthId}" type="range" min="0" max="2" step="0.01" value="1" />
              <span class="value" data-output="${strengthOutput}">1.00</span>
            </label>`;
}

/**
 * Font extrude outline tessellation — separate from svgExtrude.detail state.
 *
 * @param {{
 *   id?: string,
 *   label?: string,
 *   tooltip?: string,
 *   value?: 'low' | 'medium' | 'high' | 'ultra' | string,
 * }} [options]
 */
export function buildFontExtrudeOutlineQualitySelectHtml(options = {}) {
  const id = options.id ?? 'fontExtrudeDetail';
  const label = options.label ?? 'Polygon Count';
  const tooltip =
    options.tooltip ??
    'Curve smoothness along letter outlines — higher is smoother but denser';
  const value = normalizeExtrudeDetail(options.value ?? 'high');
  return `
            <label class="select-line font-extrude-outline-quality-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <select id="${id}" aria-label="Polygon count">
                <option value="low"${value === 'low' ? ' selected' : ''}>Low</option>
                <option value="medium"${value === 'medium' ? ' selected' : ''}>Medium</option>
                <option value="high"${value === 'high' ? ' selected' : ''}>High</option>
                <option value="ultra"${value === 'ultra' ? ' selected' : ''}>Ultra</option>
              </select>
            </label>`;
}

/**
 * @param {string} title
 * @param {string} [resetKey] — `data-reset` value; adds a subsection reset icon when set.
 */
function buildFontExtrudeSectionTitleHtml(title, resetKey) {
  if (!resetKey) {
    return `<div class="block-title font-extrude-section-title">${title}</div>`;
  }
  return `<div class="block-title font-extrude-section-title has-reset">
    <span>${title}</span>
    <button
      type="button"
      class="block-reset-btn"
      data-reset="${resetKey}"
      aria-label="Reset ${title}"
      data-tooltip="Reset ${title} settings"
    >
      <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
      <span class="sr-only">Reset ${title}</span>
    </button>
  </div>`;
}

const PANEL_BLOCK_DIVIDER_HTML = '<div class="panel-block-divider" aria-hidden="true"></div>';

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
    Number(options.value ?? DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG) ||
    DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG;
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
 *   ariaLabel?: string,
 *   value?: number,
 * }} [options]
 */
export function buildExtrudeHardEdgeAngleSliderHtml(options = {}) {
  const id = options.id ?? 'svgExtrudeHardEdgeAngle';
  const outputKey = options.outputKey ?? 'svgExtrudeHardEdgeAngle';
  const label = options.label ?? 'Hard Edge Angle';
  const tooltip =
    options.tooltip ??
    'Minimum crease for cap/side edge splits — fixes bright shading leaks on side faces (direct light, not cast shadows). Higher = sharper terminators.';
  const ariaLabel = options.ariaLabel ? ` aria-label="${options.ariaLabel}"` : '';
  const value =
    Number(options.value ?? DEFAULT_SVG_EXTRUDE_HARD_EDGE_ANGLE_DEG) ||
    DEFAULT_SVG_EXTRUDE_HARD_EDGE_ANGLE_DEG;
  return `
            <label class="slider-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <input
                id="${id}"
                type="range"
                min="${MIN_EXTRUDE_HARD_EDGE_ANGLE_DEG}"
                max="${MAX_EXTRUDE_HARD_EDGE_ANGLE_DEG}"
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
              ${buildControlLabelWithDevBadge(label, tooltip)}
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
 * Font extrude bevel profile — convex (TextGeometry) vs straight (flat chamfer).
 *
 * @param {{
 *   id?: string,
 *   label?: string,
 *   tooltip?: string,
 *   value?: 'convex' | 'straight' | string,
 * }} [options]
 */
export function buildFontBevelTypeSelectHtml(options = {}) {
  const id = options.id ?? 'fontExtrudeBevelType';
  const label = options.label ?? 'Bevel Type';
  const tooltip =
    options.tooltip ??
    'Convex = rounded outward bevel. Straight = flat chamfer cut.';
  const value = normalizeFontBevelType(options.value);
  const convexDisabled = !FONT_BEVEL_CONVEX_ENABLED;
  return `
            <label class="select-line font-extrude-bevel-type-line">
              ${buildControlLabelWithDevBadge(label, tooltip)}
              <select id="${id}" aria-label="Bevel type">
                <option value="convex"${value === 'convex' ? ' selected' : ''}${convexDisabled ? ' disabled' : ''}>Convex</option>
                <option value="straight"${value === 'straight' ? ' selected' : ''}>Straight</option>
              </select>
            </label>`;
}

/**
 * Bevel type + amount grouped together (font + SVG extrude).
 *
 * @param {{
 *   depth?: number,
 *   bevel?: { id?: string, outputKey?: string, label?: string, tooltip?: string, value?: number } | false,
 *   bevelType?: { id?: string, label?: string, tooltip?: string, value?: 'convex' | 'straight' | string } | false,
 * }} [options]
 */
export function buildExtrudeBevelGroupHtml(options = {}) {
  const depth = Number(options.depth ?? DEFAULT_EXTRUDE_DEPTH) || DEFAULT_EXTRUDE_DEPTH;
  const parts = [];
  if (options.bevel !== false) {
    parts.push(buildExtrudeBevelSliderHtml({
      depth,
      ...(options.bevel ?? {}),
    }));
  }
  if (options.bevelType !== false) {
    parts.push(buildFontBevelTypeSelectHtml(options.bevelType ?? {}));
  }
  if (!parts.length) return '';
  return `<div class="extrude-bevel-group" role="group" aria-label="Bevel">${parts.join('')}</div>`;
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
  const label = options.label ?? 'Polygon Count';
  const tooltip =
    options.tooltip ??
    'Cap and side tessellation — Ultra is very dense; best for hero exports or simple shapes';
  const value = normalizeExtrudeDetail(options.value ?? 'high');
  return `
            <label class="select-line">
              <span data-tooltip="${tooltip}">${label}</span>
              <select id="${id}" aria-label="Polygon count">
                <option value="low"${value === 'low' ? ' selected' : ''}>Low</option>
                <option value="medium"${value === 'medium' ? ' selected' : ''}>Medium</option>
                <option value="high"${value === 'high' ? ' selected' : ''}>High</option>
                <option value="ultra"${value === 'ultra' ? ' selected' : ''}>Ultra</option>
              </select>
            </label>`;
}

/**
 * Depth, detail, smoothing, and bevel controls for SVG / font extrude panels.
 *
 * @param {{
 *   depth?: { id?: string, outputKey?: string, label?: string, tooltip?: string, value?: number } | false,
 *   bevel?: { id?: string, outputKey?: string, label?: string, tooltip?: string, depth?: number, value?: number } | false,
 *   bevelType?: { id?: string, label?: string, tooltip?: string, value?: 'convex' | 'straight' | string } | false,
 *   angle?: { id?: string, outputKey?: string, label?: string, tooltip?: string, ariaLabel?: string, value?: number } | false,
 *   hardEdgeAngle?: { id?: string, outputKey?: string, label?: string, tooltip?: string, ariaLabel?: string, value?: number } | false,
 *   detail?: { id?: string, label?: string, tooltip?: string, value?: 'low' | 'medium' | 'high' | 'ultra' | string } | false,
 * }} [sections]
 */
export function buildExtrudeCoreControlsHtml(sections = {}) {
  const depthOpts = sections.depth === false ? null : (sections.depth ?? {});
  const depthValue = Number(depthOpts?.value ?? DEFAULT_EXTRUDE_DEPTH) || DEFAULT_EXTRUDE_DEPTH;
  const parts = [];

  if (depthOpts) {
    parts.push(buildExtrudeDepthSliderHtml(depthOpts));
  }
  if (sections.angle !== false) {
    parts.push(buildExtrudeAngleSliderHtml(sections.angle ?? {}));
  }
  if (sections.hardEdgeAngle !== false) {
    parts.push(buildExtrudeHardEdgeAngleSliderHtml(sections.hardEdgeAngle ?? {}));
  }
  if (sections.bevel !== false || sections.bevelType) {
    parts.push(buildExtrudeBevelGroupHtml({
      depth: depthValue,
      bevel: sections.bevel,
      bevelType: sections.bevelType ?? false,
    }));
  }
  if (sections.detail !== false) {
    parts.push(buildExtrudeDetailSelectHtml(sections.detail ?? {}));
  }
  return parts.join('');
}

/** Mount depth / bevel / angle controls into the SVG Extrude panel. */
export function ensureSvgExtrudeCoreControlsMounted() {
  const mount = document.getElementById('svgExtrudeCoreControlsMount');
  if (!mount) return;
  if (
    mount.dataset.mounted === '1' &&
    mount.querySelector('#svgExtrudeDepth') &&
    mount.querySelector('#svgExtrudeHardEdgeAngle') &&
    mount.querySelector('#svgExtrudeDetail option[value="ultra"]') &&
    mount.querySelector('.extrude-bevel-group')
  ) {
    return;
  }
  mount.innerHTML = buildExtrudeCoreControlsHtml();
  mount.dataset.mounted = '1';
}

/** Mount shared surface controls into the Studio Base Glass panel (same state as base). */
export function ensureBaseGlassSurfaceControlsMounted() {
  const mount = document.getElementById('baseGlassSurfaceControlsMount');
  if (!mount) return;
  if (mount.dataset.mounted === '1' && mount.querySelector('#baseGlassSurfStrength')) {
    return;
  }
  mount.innerHTML = buildSvgExtrudeSurfaceControlsHtml({
    presetId: 'baseGlassSurfPreset',
    scaleId: 'baseGlassSurfScale',
    scaleOutput: 'baseGlassSurfScale',
    strengthId: 'baseGlassSurfStrength',
    strengthOutput: 'baseGlassSurfStrength',
    presetAriaLabel: 'Base glass surface material',
  });
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
export function bindBaseSurfaceControls(ctx, { mirrorCtx = null, mirrorCanEdit = () => true } = {}) {
  const { inputs, stateStore, eventBus, helpers } = ctx;

  const syncMirror = () => {
    if (!mirrorCtx) return;
    syncBaseSurfaceControls(mirrorCtx, stateStore.getState(), mirrorCanEdit(stateStore.getState()));
  };

  inputs.surfacePreset?.addEventListener('change', (event) => {
    const preset = event?.target?.value || 'none';
    stateStore.set('baseSurfacePreset', preset);
    syncBaseSurfaceStrengthControl(ctx, stateStore.getState(), true);
    emitBaseSurface(eventBus, stateStore);
    syncMirror();
  });

  inputs.surfaceScale?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const scale = clampSurfaceUiScale(Number.isFinite(value) ? value : 1.0);
    helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    stateStore.set('baseSurfaceScale', scale);
    emitBaseSurface(eventBus, stateStore);
    syncMirror();
  });
  if (inputs.surfaceScale) helpers.enableSliderKeyboardStepping(inputs.surfaceScale);

  inputs.surfaceStrength?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const strength = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1.0;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
    stateStore.set('baseSurfaceStrength', strength);
    emitBaseSurface(eventBus, stateStore);
    syncMirror();
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
  if (mount) mount.remove();
}

/** Default preset when enabling surface from off. */
export const DEFAULT_OBJECT_SURFACE_LAST_PRESET = DEFAULT_SURFACE_NORMAL_MAP_PRESET;

/** Mount Object → Material surface controls (import / shape library). */
export function ensureObjectSurfaceControlsMounted() {
  const mount = document.getElementById('objectSurfaceControlsMount');
  if (!mount) return;
  if (mount.dataset.mounted === '1' && mount.querySelector('#objectSurfaceStrength')) {
    return;
  }
  mount.innerHTML = buildSvgExtrudeSurfaceControlsHtml({
    presetId: 'objectSurfacePreset',
    scaleId: 'objectSurfaceScale',
    scaleOutput: 'objectSurfaceScale',
    strengthId: 'objectSurfaceStrength',
    strengthOutput: 'objectSurfaceStrength',
    presetAriaLabel: 'Object surface preset',
    presetLabel: 'Preset',
    includeNoneOption: false,
  });
  mount.dataset.mounted = '1';
}

function syncObjectSurfaceStrengthControl(ctx, material, canEdit, state = null) {
  const { inputs, helpers, ui } = ctx;
  if (!inputs.surfaceStrength) return;
  const fullState = state ?? ctx.stateStore?.getState?.() ?? {};
  const blocked = surfaceControlsBlockedByCreativeLook(fullState);
  const clActive = surfaceControlsCreativeLookActive(fullState);
  const config = getSvgExtrudeSurfacePresetConfig(material.surfacePreset ?? 'none');
  const isNormalMap = config.kind === 'normalMap';
  const strengthRelevant = isNormalMap || clActive;
  const strength = clampSurfaceStrength(material.surfaceStrength ?? 1);
  if (document.activeElement !== inputs.surfaceStrength) {
    inputs.surfaceStrength.value = strength;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
  }
  ui.setControlDisabled(inputs.surfaceStrength, !canEdit || blocked || !strengthRelevant);
}

/**
 * @param {Object} ctx
 * @param {Record<string, HTMLElement | null>} ctx.inputs
 * @param {import('../StateStore.js').StateStore} ctx.stateStore
 * @param {import('../EventBus.js').EventBus} ctx.eventBus
 * @param {import('../UIManager.js').UIManager} ctx.ui
 * @param {import('./UIHelpers.js').UIHelpers} ctx.helpers
 */
export function bindObjectSurfaceControls(ctx) {
  const { inputs, stateStore, eventBus, ui, helpers } = ctx;

  inputs.surfaceEnabled?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    const mat = stateStore.getState().material || {};
    let preset = mat.surfacePreset ?? 'none';
    let lastPreset = mat.surfaceLastPreset;
    if (enabled) {
      if (preset === 'none') {
        preset = normalizeSurfaceLastPresetId(mat.surfaceLastPreset);
      }
    } else if (preset !== 'none') {
      lastPreset = preset;
    }
    eventBus.emit('mesh:object-surface', {
      enabled,
      preset: enabled ? preset : (mat.surfacePreset ?? 'none'),
      scale: Number(mat.surfaceScale ?? 1) || 1.0,
      strength: clampSurfaceStrength(mat.surfaceStrength ?? 1),
      lastPreset,
    });
  });

  inputs.surfacePreset?.addEventListener('change', (event) => {
    ui.uiSounds?.playSelect?.();
    const preset = event?.target?.value || DEFAULT_OBJECT_SURFACE_LAST_PRESET;
    const mat = stateStore.getState().material || {};
    eventBus.emit('mesh:object-surface', {
      enabled: true,
      preset,
      scale: Number(mat.surfaceScale ?? 1) || 1.0,
      strength: clampSurfaceStrength(mat.surfaceStrength ?? 1),
      lastPreset: preset,
    });
    syncObjectSurfaceStrengthControl(
      ctx,
      { ...mat, surfacePreset: preset, surfaceEnabled: true },
      true,
    );
  });

  inputs.surfaceScale?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const scale = clampSurfaceUiScale(Number.isFinite(value) ? value : 1.0);
    helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    const mat = stateStore.getState().material || {};
    eventBus.emit('mesh:object-surface', {
      enabled: isMaterialObjectSurfaceEnabled(mat),
      preset: mat.surfacePreset ?? 'none',
      scale,
      strength: clampSurfaceStrength(mat.surfaceStrength ?? 1),
    });
  });
  if (inputs.surfaceScale) helpers.enableSliderKeyboardStepping(inputs.surfaceScale);

  inputs.surfaceStrength?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const strength = Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1.0;
    helpers.updateValueLabel(inputs.surfaceStrengthOutputKey, strength, 'decimal');
    const mat = stateStore.getState().material || {};
    eventBus.emit('mesh:object-surface', {
      enabled: isMaterialObjectSurfaceEnabled(mat),
      preset: mat.surfacePreset ?? 'none',
      scale: Number(mat.surfaceScale ?? 1) || 1.0,
      strength,
    });
  });
  if (inputs.surfaceStrength) helpers.enableSliderKeyboardStepping(inputs.surfaceStrength);
}

/** Whether Object → Material surface controls should show for the current model. */
export function resolveObjectSurfaceControlsVisible(state) {
  const scene = window.orby?.scene;
  if (!scene?.currentModel) return false;
  const model = scene.currentModel;
  const eligible =
    scene.materialController?._modelSurfaceEligible?.(model) ??
    !!state?.material?.surfaceEligible;
  return eligible;
}

/**
 * @param {Object} ctx
 * @param {Record<string, unknown>} state
 * @param {boolean} canEdit
 */
export function syncObjectSurfaceControls(ctx, state, canEdit) {
  const { inputs, helpers, ui } = ctx;
  const material = state.material || {};
  const visible = resolveObjectSurfaceControlsVisible(state);
  const section = document.getElementById('objectSurfaceSection');
  const divider = document.getElementById('objectSurfaceDivider');
  if (section) section.hidden = !visible;
  if (divider) divider.hidden = !visible;
  if (!visible) return;

  const blocked = surfaceControlsBlockedByCreativeLook(state);
  const surfaceOn = isMaterialObjectSurfaceEnabled(material);
  const editable = canEdit && !blocked;
  const foldoutEditable = editable && surfaceOn;

  if (inputs.surfaceEnabled) {
    inputs.surfaceEnabled.checked = surfaceOn;
    ui.setControlDisabled(inputs.surfaceEnabled, !editable);
  }

  const preset = normalizeSurfacePresetId(material.surfacePreset ?? 'none');
  const activePreset = preset !== 'none'
    ? preset
    : normalizeSurfaceLastPresetId(material.surfaceLastPreset);

  if (inputs.surfacePreset && document.activeElement !== inputs.surfacePreset) {
    inputs.surfacePreset.value = activePreset;
    ui.setControlDisabled(inputs.surfacePreset, !foldoutEditable);
  }
  if (inputs.surfaceScale) {
    const scale = clampSurfaceUiScale(Number(material.surfaceScale ?? 1) || 1.0);
    if (document.activeElement !== inputs.surfaceScale) {
      inputs.surfaceScale.value = scale;
      helpers.updateValueLabel(inputs.surfaceScaleOutputKey, formatSurfaceDetailLabel(scale), 'decimal');
    }
    ui.setControlDisabled(inputs.surfaceScale, !foldoutEditable);
  }
  syncObjectSurfaceStrengthControl(ctx, material, foldoutEditable, state);
}

function readClampedExtrudeDepth(input) {
  const value = parseFloat(input?.value);
  return Number.isFinite(value)
    ? Math.max(MIN_EXTRUDE_DEPTH, Math.min(MAX_EXTRUDE_DEPTH, value))
    : DEFAULT_EXTRUDE_DEPTH;
}

function readClampedExtrudeNormalAngle(input) {
  const value = parseFloat(input?.value);
  return Number.isFinite(value)
    ? Math.max(MIN_EXTRUDE_NORMAL_ANGLE_DEG, Math.min(MAX_EXTRUDE_NORMAL_ANGLE_DEG, value))
    : DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG;
}

function readClampedExtrudeHardEdgeAngle(input) {
  const value = parseFloat(input?.value);
  return Number.isFinite(value)
    ? clampExtrudeHardEdgeAngleDeg(value)
    : DEFAULT_SVG_EXTRUDE_HARD_EDGE_ANGLE_DEG;
}

function writeRangeValue(input, value) {
  if (!(input instanceof HTMLInputElement)) return;
  const next = String(value);
  if (input.value !== next) input.value = next;
}

/** @type {Set<Object>} */
const extrudeMeshFlushContexts = new Set();
let extrudeScrubEndListenerBound = false;

function bindExtrudeScrubEndListener(eventBus) {
  if (extrudeScrubEndListenerBound) return;
  extrudeScrubEndListenerBound = true;
  eventBus.on('ui:range-scrub-end', (slider) => {
    for (const ctx of extrudeMeshFlushContexts) {
      flushPendingExtrudeMesh(ctx, slider);
    }
  });
}

/**
 * Defer heavy mesh rebuilds while the user is scrubbing; flush on release.
 * @param {Object} ctx
 * @param {'depth' | 'normal' | 'bevel'} kind
 * @param {() => void} flushNow
 */
function scheduleExtrudeMeshFlush(ctx, kind, flushNow) {
  const { timers, stateStore } = ctx;
  timers.meshPending ??= {};
  timers.meshPending[kind] = flushNow;

  if (stateStore.isNotifyDeferred?.()) return;

  if (timers[kind]) clearTimeout(timers[kind]);
  timers[kind] = setTimeout(() => {
    timers[kind] = null;
    if (stateStore.isNotifyDeferred?.()) return;
    timers.meshPending[kind] = null;
    flushNow();
  }, 45);
}

/** @param {Object} ctx @param {HTMLInputElement | null | undefined} slider */
export function flushPendingExtrudeMesh(ctx, slider) {
  if (!ctx?.inputs || !ctx?.timers) return;
  const { inputs, timers } = ctx;
  if (!(slider instanceof HTMLInputElement)) return;

  const kinds = [];
  if (slider === inputs.depth) kinds.push('depth');
  if (slider === inputs.normalAngle) kinds.push('normal');
  if (slider === inputs.hardEdgeAngle) kinds.push('hardEdge');
  if (slider === inputs.bevelAmount) kinds.push('bevel');

  for (const kind of kinds) {
    if (timers[kind]) {
      clearTimeout(timers[kind]);
      timers[kind] = null;
    }
    const pending = timers.meshPending?.[kind];
    if (typeof pending === 'function') {
      timers.meshPending[kind] = null;
      pending();
    }
  }

  // Per-color sliders are re-rendered on every sync, so by the time the
  // scrub-end fires the dragged node has been detached from the container.
  // Match on dataset.color (which the detached node still carries) instead of
  // DOM containment so the deferred mesh rebuild still flushes on release.
  const color = slider.dataset.color;
  if (color) {
    const kind = slider.dataset.kind || 'depth';
    const timerKey = `${kind}:${color}`;
    const existingTimer = timers.colorDebounce.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timers.colorDebounce.delete(timerKey);
    }
    const pending = timers.meshPending?.[timerKey];
    if (typeof pending === 'function') {
      timers.meshPending[timerKey] = null;
      pending();
    }
  }
}

/**
 * @param {Object} ctx
 * @param {Record<string, HTMLElement | null>} ctx.inputs
 * @param {import('../StateStore.js').StateStore} ctx.stateStore
 * @param {import('../EventBus.js').EventBus} ctx.eventBus
 * @param {import('../UIManager.js').UIManager} ctx.ui
 * @param {import('./UIHelpers.js').UIHelpers} ctx.helpers
 * @param {{ depth: ReturnType<typeof setTimeout> | null, normal: ReturnType<typeof setTimeout> | null, colorDebounce: Map<string, ReturnType<typeof setTimeout>>, meshPending?: Record<string, (() => void) | null>, _scrubEndBound?: boolean }} ctx.timers
 */
export function bindSvgExtrudeControls(ctx) {
  const { inputs, stateStore, eventBus, ui, helpers, timers } = ctx;

  extrudeMeshFlushContexts.add(ctx);
  bindExtrudeScrubEndListener(eventBus);

  inputs.depth?.addEventListener('input', (event) => {
    const clampedValue = readClampedExtrudeDepth(event.target);
    writeRangeValue(event.target, clampedValue);
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
    if (clampedBevel !== prevBevel) {
      timers._depthFlushBevel = clampedBevel;
    }
    scheduleExtrudeMeshFlush(ctx, 'depth', () => {
      const latest = readClampedExtrudeDepth(inputs.depth);
      eventBus.emit('mesh:svg-extrude-depth', latest);
      if (inputs.bevelAmount && timers._depthFlushBevel != null) {
        eventBus.emit('mesh:svg-extrude-bevel', { amount: timers._depthFlushBevel });
        timers._depthFlushBevel = null;
      }
    });
  });
  if (inputs.depth) helpers.enableSliderKeyboardStepping(inputs.depth);

  inputs.normalAngle?.addEventListener('input', (event) => {
    const clampedValue = readClampedExtrudeNormalAngle(event.target);
    writeRangeValue(event.target, clampedValue);
    helpers.updateValueLabel(inputs.normalAngleOutputKey, clampedValue, 'angle');
    stateStore.set('svgExtrude.normalAngle', clampedValue);
    scheduleExtrudeMeshFlush(ctx, 'normal', () => {
      eventBus.emit('mesh:svg-extrude-normal-angle', readClampedExtrudeNormalAngle(inputs.normalAngle));
    });
  });
  if (inputs.normalAngle) helpers.enableSliderKeyboardStepping(inputs.normalAngle);

  inputs.hardEdgeAngle?.addEventListener('input', (event) => {
    const clampedValue = readClampedExtrudeHardEdgeAngle(event.target);
    writeRangeValue(event.target, clampedValue);
    helpers.updateValueLabel(inputs.hardEdgeAngleOutputKey, clampedValue, 'angle');
    stateStore.set('svgExtrude.hardEdgeAngle', clampedValue);
    scheduleExtrudeMeshFlush(ctx, 'hardEdge', () => {
      eventBus.emit(
        'mesh:svg-extrude-hard-edge-angle',
        readClampedExtrudeHardEdgeAngle(inputs.hardEdgeAngle),
      );
    });
  });
  if (inputs.hardEdgeAngle) helpers.enableSliderKeyboardStepping(inputs.hardEdgeAngle);

  inputs.detail?.addEventListener('change', (event) => {
    ui.uiSounds?.playSelect?.();
    const value = normalizeExtrudeDetail(event?.target?.value);
    stateStore.set('svgExtrude.detail', value);
    eventBus.emit('mesh:svg-extrude-detail', value);
  });

  inputs.flipDirection?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    stateStore.set('svgExtrude.flipDirection', enabled);
    eventBus.emit('mesh:svg-extrude-flip-direction', enabled);
  });

  inputs.colorOverride?.addEventListener('change', (event) => {
    const enabled = !!event.target.checked;
    const color = normalizeSvgOverrideHex(inputs.overrideColor?.value);
    const extrudeColor = normalizeSvgOverrideHex(
      inputs.overrideExtrudeColor?.value,
      color,
    );
    stateStore.set('svgExtrude.colorOverride', enabled);
    eventBus.emit('mesh:svg-extrude-color-override', { enabled, color, extrudeColor });
  });

  const emitSvgOverrideColors = () => {
    const enabled = !!stateStore.getState().svgExtrude?.colorOverride;
    const color = normalizeSvgOverrideHex(inputs.overrideColor?.value);
    const extrudeColor = normalizeSvgOverrideHex(
      inputs.overrideExtrudeColor?.value,
      color,
    );
    stateStore.set('svgExtrude.overrideColor', color);
    stateStore.set('svgExtrude.overrideExtrudeColor', extrudeColor);
    eventBus.emit('mesh:svg-extrude-color-override', { enabled, color, extrudeColor });
  };

  inputs.overrideColor?.addEventListener('input', emitSvgOverrideColors);
  inputs.overrideExtrudeColor?.addEventListener('input', emitSvgOverrideColors);

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
    writeRangeValue(input, clampedValue);
    const sliderLine = input.closest('.slider-line');
    const valueLabel = sliderLine?.querySelector('.value');
    if (valueLabel && !valueLabel.classList.contains('is-editing')) {
      valueLabel.textContent = clampedValue.toFixed(2);
    }
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
    timers.meshPending ??= {};
    timers.meshPending[timerKey] = () => {
      const rangeInput = sliderLine?.querySelector('input[type="range"]');
      const liveValue = parseFloat(rangeInput?.value ?? String(clampedValue));
      const latest =
        kind === 'offset'
          ? Number.isFinite(liveValue)
            ? Math.max(-1.0, Math.min(1.0, liveValue))
            : 0
          : readClampedExtrudeDepth(rangeInput ?? input);
      if (kind === 'offset') {
        eventBus.emit('mesh:svg-extrude-color-offset', { color, offset: latest });
      } else {
        eventBus.emit('mesh:svg-extrude-color-depth', { color, depth: latest });
      }
    };
    if (stateStore.isNotifyDeferred?.()) return;
    const existingTimer = timers.colorDebounce.get(timerKey);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      timers.colorDebounce.delete(timerKey);
      if (stateStore.isNotifyDeferred?.()) return;
      const pending = timers.meshPending?.[timerKey];
      if (typeof pending === 'function') {
        timers.meshPending[timerKey] = null;
        pending();
      }
    }, 50);
    timers.colorDebounce.set(timerKey, timer);
  };

  inputs.colorDepths?.addEventListener('input', onColorDepthInput);

  const onColorReplacementEvent = (event, commit) => {
    const input = event.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'color') return;
    if (input.dataset.kind !== 'replacement') return;
    const color = input.dataset.color;
    if (!color) return;
    const replacement = input.value;
    // Keep the sibling chip (other row, same fill) visually in sync without a re-render.
    inputs.colorDepths
      ?.querySelectorAll(`input[type="color"][data-color="${color}"]`)
      .forEach((chip) => {
        if (chip !== input) chip.value = replacement;
      });
    eventBus.emit('mesh:svg-extrude-color-replacement', { color, replacement, commit });
  };

  // `input` = live recolor while the picker is open (no state write → no shelf rebuild);
  // `change` = commit to state once the picker closes.
  inputs.colorDepths?.addEventListener('input', (event) => onColorReplacementEvent(event, false));
  inputs.colorDepths?.addEventListener('change', (event) => onColorReplacementEvent(event, true));

  inputs.colorDepths?.addEventListener('click', (event) => {
    const btn = event.target.closest?.('button[data-kind="reset"]');
    if (!btn) return;
    const color = btn.dataset.color;
    if (!color) return;
    // Drop focus so the post-reset re-render of this container isn't blocked.
    btn.blur();
    eventBus.emit('mesh:svg-extrude-color-reset', { color });
  });
}

function syncExtrudeBevelControlInputs(ctx, svg, canEdit) {
  const { inputs, helpers, ui } = ctx;
  const depth = Number(svg.depth ?? DEFAULT_EXTRUDE_DEPTH);
  const maxBevel = maxExtrudeBevelAmount(depth);
  const amount = clampExtrudeBevelAmount(svg.bevelAmount ?? 0, depth);

  if (inputs.bevelAmount) {
    inputs.bevelAmount.max = String(maxBevel);
    inputs.bevelAmount.step = String(Math.max(0.001, maxBevel / 50));
    if (helpers.syncRangeFromState(inputs.bevelAmount, amount)) {
      helpers.updateValueLabel(inputs.bevelAmountOutputKey, amount, 'decimal');
    } else if (!helpers.shouldSkipRangeSyncWrite(inputs.bevelAmount)) {
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
    writeRangeValue(event.target, clampedValue);
    helpers.updateValueLabel(inputs.bevelAmountOutputKey, clampedValue, 'decimal');
    stateStore.set('svgExtrude.bevelAmount', clampedValue);
    syncExtrudeBevelControlInputs(ctx, stateStore.getState().svgExtrude || {}, true);
    scheduleExtrudeMeshFlush(ctx, 'bevel', () => {
      const latestDepth = Number(stateStore.getState().svgExtrude?.depth ?? DEFAULT_EXTRUDE_DEPTH);
      const latestMax = maxExtrudeBevelAmount(latestDepth);
      const latestValue = parseFloat(inputs.bevelAmount?.value);
      const latest = Number.isFinite(latestValue)
        ? Math.max(0, Math.min(latestMax, latestValue))
        : 0;
      eventBus.emit('mesh:svg-extrude-bevel', { amount: latest });
    });
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
    if (helpers.syncRangeFromState(inputs.depth, depth)) {
      helpers.updateValueLabel(inputs.depthOutputKey, depth, 'decimal');
    } else if (!helpers.shouldSkipRangeSyncWrite(inputs.depth)) {
      helpers.updateValueLabel(inputs.depthOutputKey, depth, 'decimal');
    }
    ui.setControlDisabled(inputs.depth, !canEdit);
    if (inputs.bevelAmount) {
      syncExtrudeBevelControlInputs(ctx, svg, canEdit);
    }
  }
  if (inputs.normalAngle) {
    const normalAngle = svg.normalAngle ?? DEFAULT_SVG_EXTRUDE_NORMAL_ANGLE_DEG;
    if (helpers.syncRangeFromState(inputs.normalAngle, normalAngle)) {
      helpers.updateValueLabel(inputs.normalAngleOutputKey, normalAngle, 'angle');
    } else if (!helpers.shouldSkipRangeSyncWrite(inputs.normalAngle)) {
      helpers.updateValueLabel(inputs.normalAngleOutputKey, normalAngle, 'angle');
    }
    ui.setControlDisabled(inputs.normalAngle, !canEdit);
  }
  if (inputs.hardEdgeAngle) {
    const hardEdgeAngle = svg.hardEdgeAngle ?? DEFAULT_SVG_EXTRUDE_HARD_EDGE_ANGLE_DEG;
    if (helpers.syncRangeFromState(inputs.hardEdgeAngle, hardEdgeAngle)) {
      helpers.updateValueLabel(inputs.hardEdgeAngleOutputKey, hardEdgeAngle, 'angle');
    } else if (!helpers.shouldSkipRangeSyncWrite(inputs.hardEdgeAngle)) {
      helpers.updateValueLabel(inputs.hardEdgeAngleOutputKey, hardEdgeAngle, 'angle');
    }
    ui.setControlDisabled(inputs.hardEdgeAngle, !canEdit);
  }
  if (inputs.detail) {
    const detail = normalizeExtrudeDetail(svg.detail ?? 'high');
    if (document.activeElement !== inputs.detail) {
      inputs.detail.value = detail;
    }
    ui.setControlDisabled(inputs.detail, !canEdit);
  }
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
  if (inputs.overrideExtrudeColor) {
    const overrideEnabled = !!svg.colorOverride;
    const face = svg.overrideColor ?? DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR;
    const extrudeColor = svg.overrideExtrudeColor ?? face;
    if (document.activeElement !== inputs.overrideExtrudeColor) {
      inputs.overrideExtrudeColor.value = extrudeColor;
    }
    ui.setControlDisabled(inputs.overrideExtrudeColor, !(canEdit && overrideEnabled));
  }
}

/**
 * @param {HTMLElement | null} container
 * @param {Object} state
 * @param {import('../UIManager.js').UIManager} ui
 */
export function renderSvgColorDepthControls(container, state, ui) {
  if (!container) return;
  // Don't rebuild while a per-color picker/slider inside is being used — a native
  // color dialog stays bound to its <input>, and replacing innerHTML would detach it.
  // Only block for inputs; a focused reset button should not stop the refresh.
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT' && container.contains(active)) return;
  const enabled = !!state.svgExtrude?.enabled;
  const palette = Array.isArray(state.svgExtrude?.availableColors)
    ? state.svgExtrude.availableColors
    : [];
  const overrides = state.svgExtrude?.colorDepths || {};
  const offsets = state.svgExtrude?.colorOffsets || {};
  const replacements = state.svgExtrude?.colorReplacements || {};
  const overrideEnabled = !!state.svgExtrude?.colorOverride;
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

  const buildChip = (color, index) => {
    const swatch = normalizeColorForPicker(replacements[color]) || normalizeColorForPicker(color) || '#000000';
    const disabled = !enabled || overrideEnabled;
    const titleHex = (replacements[color] || color).toUpperCase();
    return `<input type="color" class="color-chip${disabled ? ' is-disabled-handle' : ''}" value="${swatch}" data-color="${color}" data-kind="replacement"${
      disabled ? ' disabled' : ''
    } aria-label="Recolor fill ${index + 1} (${color.toUpperCase()})" title="Recolor fill ${index + 1} (${titleHex})" />`;
  };

  const buildFillReset = (color, index, isDirty) =>
    isDirty
      ? `<button type="button" class="svg-fill-reset" data-kind="reset" data-color="${color}" aria-label="Reset fill ${index + 1}" title="Reset depth, position & color for fill ${index + 1}"><i class="fa-solid fa-rotate-left"></i></button>`
      : '';

  const rows = palette
    .map((color, index) => {
      const depth = Number.isFinite(Number(overrides[color]))
        ? Number(overrides[color])
        : globalDepth;
      const safeDepth = Math.max(0.01, Math.min(2.0, depth));
      const offset = Number.isFinite(Number(offsets[color])) ? Number(offsets[color]) : 0;
      const safeOffset = Math.max(-1.0, Math.min(1.0, offset));
      const isDirty =
        overrides[color] !== undefined ||
        offsets[color] !== undefined ||
        replacements[color] !== undefined;
      // Rows use <div> (not <label>) so the embedded color picker doesn't become the
      // row's implicit labeled control and hijack clicks on the depth/position text.
      return `
<div class="slider-line">
  <span>
    ${buildChip(color, index)}
    Depth ${index + 1}
    ${buildFillReset(color, index, isDirty)}
  </span>
  <input type="range" min="0.01" max="2" step="0.005" value="${safeDepth.toFixed(2)}" data-color="${color}" data-kind="depth" aria-label="Per-color depth ${index + 1} (${color.toUpperCase()})" title="Depth for ${color.toUpperCase()}" />
  <span class="value">${safeDepth.toFixed(2)}</span>
</div>
<div class="slider-line">
  <span>
    ${buildChip(color, index)}
    Position ${index + 1}
  </span>
  <input type="range" min="-1" max="1" step="0.005" value="${safeOffset.toFixed(2)}" data-color="${color}" data-kind="offset" aria-label="Per-color position ${index + 1} (${color.toUpperCase()})" title="Position for ${color.toUpperCase()}" />
  <span class="value">${safeOffset.toFixed(2)}</span>
</div>`;
    })
    .join('');

  container.innerHTML = rows;
  container.querySelectorAll('input[type="range"]').forEach((input) => {
    input.disabled = !enabled;
    input.classList.toggle('is-disabled-handle', !enabled);
  });
}

/** Coerce a palette/replacement color to a `#rrggbb` value an `<input type="color">` accepts. */
function normalizeColorForPicker(value) {
  if (typeof value !== 'string') return null;
  let hex = value.trim().toLowerCase();
  if (!hex) return null;
  if (hex[0] !== '#') hex = `#${hex}`;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
}

function buildFontRevealTypeOptionsHtml() {
  return FONT_REVEAL_TYPE_OPTIONS.map(
    (opt) =>
      `<option value="${opt.id}"${
        opt.id === DEFAULT_FONT_REVEAL_TYPE ? ' selected' : ''
      }>${opt.label}</option>`,
  ).join('');
}

function buildFontRevealUnitOptionsHtml() {
  return FONT_REVEAL_UNIT_OPTIONS.map(
    (opt) =>
      `<option value="${opt.id}"${
        opt.id === DEFAULT_FONT_REVEAL_UNIT ? ' selected' : ''
      }>${opt.label}</option>`,
  ).join('');
}

function buildFontConstantTypeOptionsHtml() {
  return FONT_CONSTANT_TYPE_OPTIONS.map(
    (opt) =>
      `<option value="${opt.id}"${
        opt.id === DEFAULT_FONT_CONSTANT_TYPE ? ' selected' : ''
      }>${opt.label}</option>`,
  ).join('');
}

/** All 3D shape controls — visible before first generate (depth applies on generate). */
export const FONT_EXTRUDE_SHAPE_CONTROLS_HTML = `
          ${PANEL_BLOCK_DIVIDER_HTML}
          <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-3d-shape">
          ${buildFontExtrudeSectionTitleHtml('3D Shape', 'font-extrude-3d-shape')}
          ${buildExtrudeDepthSliderHtml({
            id: 'fontExtrudeMeshDepth',
            outputKey: 'fontExtrudeMeshDepth',
            label: 'Extrude Depth',
            tooltip: 'Overall extrusion depth for generated text',
          })}
          ${buildExtrudeAngleSliderHtml({
            id: 'fontExtrudeMeshAngle',
            outputKey: 'fontExtrudeMeshAngle',
            label: 'Smoothing Angle',
            tooltip:
              'Bevel/curve smoothness (0 = faceted). Does not control side-face shading terminators — use Hard Edge Angle.',
            ariaLabel: 'Smoothing angle',
          })}
          ${buildExtrudeHardEdgeAngleSliderHtml({
            id: 'fontExtrudeHardEdgeAngle',
            outputKey: 'fontExtrudeHardEdgeAngle',
            label: 'Hard Edge Angle',
            ariaLabel: 'Hard edge angle',
          })}
          ${buildExtrudeBevelGroupHtml({
            bevelType: { id: 'fontExtrudeBevelType' },
            bevel: {
              id: 'fontExtrudeBevelAmount',
              outputKey: 'fontExtrudeBevelAmount',
              tooltip: 'Edge bevel size — max 10% of extrusion depth',
            },
          })}
          ${buildFontExtrudeOutlineQualitySelectHtml()}
          </div>`;

/** Reveal animation — only visible once 3D text exists. */
export const FONT_EXTRUDE_ANIMATION_CONTROLS_HTML = `
            <div class="font-extrude-animation" id="fontExtrudeAnimation">
              <label class="select-line font-extrude-reveal-type">
                <span data-tooltip="Per-letter reveal style (GSAP-inspired eases)">Reveal Type</span>
                <select id="fontExtrudeRevealType" aria-label="Reveal animation type">
                  ${buildFontRevealTypeOptionsHtml()}
                </select>
              </label>
              <label class="select-line font-extrude-reveal-unit">
                <span data-tooltip="Character staggers each letter; Word staggers whole words (better for long text)">Reveal By</span>
                <select id="fontExtrudeRevealUnit" aria-label="Reveal stagger unit">
                  ${buildFontRevealUnitOptionsHtml()}
                </select>
              </label>
              <label class="slider-line font-extrude-reveal-duration">
                <span data-tooltip="Staggered reveal length — last character or word fully lands (including depth slide) at this time. 0 = off.">Reveal Duration</span>
                <input id="fontExtrudeRevealDuration" type="range" min="0" max="5" step="0.1" value="2" />
                <span class="value" data-output="fontExtrudeRevealDuration">2.0s</span>
              </label>
              <label id="fontExtrudeRevealStaggerEasingFamilyLine" class="select-line font-extrude-reveal-stagger-easing-family">
                <span data-tooltip="Curve for stagger timing across the full reveal — ease out widens gaps between later letters or words (decelerating arrival)">Easing</span>
                <select id="fontExtrudeRevealStaggerEasingFamily" aria-label="Reveal stagger easing curve">
                  <option value="linear" selected>Linear</option>
                  <option value="sine">Sine</option>
                  <option value="quad">Quad</option>
                  <option value="cubic">Cubic</option>
                  <option value="quart">Quart</option>
                  <option value="quint">Quint</option>
                  <option value="expo">Expo</option>
                  <option value="circ">Circ</option>
                </select>
              </label>
              <label id="fontExtrudeRevealStaggerEasingTypeLine" class="select-line is-muted font-extrude-reveal-stagger-easing-type">
                <span data-tooltip="Ease in packs more arrivals at the start; ease out spreads them toward the end; in-out blends both">Type</span>
                <select id="fontExtrudeRevealStaggerEasingType" aria-label="Reveal stagger easing type" disabled>
                  <option value="in">In</option>
                  <option value="out" selected>Out</option>
                  <option value="inOut">In-out</option>
                </select>
              </label>
              <label class="slider-line font-extrude-reveal-slide-depth">
                <span data-tooltip="How far each letter starts in depth before sliding into place">Slide Depth</span>
                <input id="fontExtrudeRevealSlideDepth" type="range" min="0" max="2.5" step="0.01" value="0.18" />
                <span class="value" data-output="fontExtrudeRevealSlideDepth">0.18</span>
              </label>
              <label class="slider-line font-extrude-reveal-slide-time">
                <span data-tooltip="Each letter's animation length vs stagger slot — all reveal types. Under 100% = next letter waits; over 100% = overlap while earlier letters are still settling (bounce, depth slide, etc.).">Slide Time</span>
                <input id="fontExtrudeRevealSlideTime" type="range" min="0.1" max="3" step="0.01" value="1.3" />
                <span class="value" data-output="fontExtrudeRevealSlideTime">130%</span>
              </label>
              <label class="select-line font-extrude-reveal-slide-direction">
                <span data-tooltip="Choose whether depth travel starts from behind or from camera side">Slide Direction</span>
                <select id="fontExtrudeRevealSlideDirection" aria-label="Reveal slide direction">
                  <option value="back" selected>From back</option>
                  <option value="front">From front</option>
                </select>
              </label>
              ${PANEL_BLOCK_DIVIDER_HTML}
              <div class="font-extrude-tracking-animator" id="fontExtrudeTrackingAnimator" role="group" aria-label="Tracking animation">
                <label class="slider-line slider-line--toggle-only font-extrude-tracking-animator-enabled">
                  <span data-tooltip="Letters widen at the start of the clip, then settle to your generated spacing — not available with circular wrap">Tracking Animator</span>
                  <label class="effect-toggle">
                    <input type="checkbox" id="fontExtrudeTrackingAnimatorEnabled" />
                    <span class="effect-indicator" aria-hidden="true"></span>
                    <span class="sr-only">Tracking animator</span>
                  </label>
                </label>
                <label class="slider-line font-extrude-tracking-animator-amount-start font-extrude-tracking-animator-detail" hidden>
                  <span data-tooltip="Extra letter-spacing at the start of the animation (100% = +${MAX_FONT_TRACKING_ANIMATOR_START}) — independent of Letter Spacing; settles to your master value when tracking time ends">Amount Start</span>
                  <input id="fontExtrudeTrackingAnimatorAmountStart" type="range" min="0" max="100" step="1" value="0" />
                  <span class="value" data-output="fontExtrudeTrackingAnimatorAmountStart">0%</span>
                </label>
                <label class="slider-line font-extrude-tracking-animator-time font-extrude-tracking-animator-detail" hidden>
                  <span data-tooltip="Seconds to settle from Amount Start back to Letter Spacing — always starts at full Amount Start; shorter = faster settle, not less travel">Tracking Time</span>
                  <input id="fontExtrudeTrackingAnimatorTime" type="range" min="0.1" max="5" step="0.1" value="1.5" />
                  <span class="value" data-output="fontExtrudeTrackingAnimatorTime">1.5s</span>
                </label>
                <label id="fontExtrudeTrackingAnimatorEasingFamilyLine" class="select-line font-extrude-tracking-animator-easing-family font-extrude-tracking-animator-detail" hidden>
                  <span data-tooltip="Curve for the tracking settle — ease out decelerates into your generated spacing.">Easing</span>
                  <select id="fontExtrudeTrackingAnimatorEasingFamily" aria-label="Tracking animation easing curve">
                    <option value="linear" selected>Linear</option>
                    <option value="sine">Sine</option>
                    <option value="quad">Quad</option>
                    <option value="cubic">Cubic</option>
                    <option value="quart">Quart</option>
                    <option value="quint">Quint</option>
                    <option value="expo">Expo</option>
                    <option value="circ">Circ</option>
                  </select>
                </label>
                <label id="fontExtrudeTrackingAnimatorEasingTypeLine" class="select-line is-muted font-extrude-tracking-animator-easing-type font-extrude-tracking-animator-detail" hidden>
                  <span data-tooltip="Ease in accelerates from the wide start; ease out decelerates into generated spacing; in-out blends both.">Type</span>
                  <select id="fontExtrudeTrackingAnimatorEasingType" aria-label="Tracking animation easing type" disabled>
                    <option value="in">In</option>
                    <option value="out" selected>Out</option>
                    <option value="inOut">In-out</option>
                  </select>
                </label>
              </div>
            </div>
`;

/** Optional emissive flash on reveal — after primary motion drivers in the shelf. */
export const FONT_EXTRUDE_REVEAL_EMISSIVE_HTML = `
              <div class="font-extrude-reveal-emissive" role="group" aria-label="Emissive reveal">
                <label class="slider-line slider-line--toggle-only font-extrude-reveal-emissive-slam">
                  <span data-tooltip="Each letter reveals with emissive glow, then fades to rest after it lands">Emissive Slam</span>
                  <label class="effect-toggle font-extrude-reveal-emissive-toggle">
                    <input type="checkbox" id="fontExtrudeRevealEmissiveSlam" />
                    <span class="effect-indicator" aria-hidden="true"></span>
                    <span class="sr-only">Emissive slam on reveal</span>
                  </label>
                </label>
                <label class="slider-line font-extrude-reveal-emissive-strength font-extrude-reveal-emissive-detail" hidden>
                  <span data-tooltip="Emissive intensity while each letter is revealing and during fade-out">Emissive Strength</span>
                  <input id="fontExtrudeRevealEmissiveStrength" type="range" min="0" max="2" step="0.05" value="1" />
                  <span class="value" data-output="fontExtrudeRevealEmissiveStrength">1.00</span>
                </label>
                <label class="slider-line font-extrude-reveal-emissive-decay font-extrude-reveal-emissive-detail" hidden>
                  <span data-tooltip="How long emissive fades to rest after each letter lands">Emissive Time</span>
                  <input id="fontExtrudeRevealEmissiveDecay" type="range" min="0.05" max="0.8" step="0.01" value="0.35" />
                  <span class="value" data-output="fontExtrudeRevealEmissiveDecay">0.35s</span>
                </label>
                <label class="color-line font-extrude-reveal-emissive-color font-extrude-reveal-emissive-detail" hidden>
                  <span data-tooltip="Emissive color mixed in at peak flash">Emissive Color</span>
                  <input type="color" id="fontExtrudeRevealEmissiveColor" class="color-chip" value="#c4ff00" />
                </label>
              </div>
`;

/** Looping motion — composes with reveal; only visible once 3D text exists. */
export const FONT_EXTRUDE_CONSTANT_CONTROLS_HTML = `
            <div class="font-extrude-constant" id="fontExtrudeConstant">
              <label class="select-line font-extrude-constant-type">
                <span data-tooltip="Continuous looping motion layered on reveal — runs live in viewport and export">Motion type</span>
                <select id="fontExtrudeConstantType" aria-label="Looping motion type">
                  ${buildFontConstantTypeOptionsHtml()}
                </select>
              </label>
              <label class="slider-line font-extrude-constant-intensity font-extrude-constant-detail" hidden>
                <span data-tooltip="Motion strength — Wave allows up to 3× vertical peak height (± from rest); Float uses a gentler bob range; Spin uses Stagger for letter delay; Breathe and Sway use a subtler 0–100% range">Intensity</span>
                <input id="fontExtrudeConstantIntensity" type="range" min="0" max="1" step="0.01" value="0.5" />
                <span class="value" data-output="fontExtrudeConstantIntensity">50%</span>
              </label>
              <label class="slider-line font-extrude-constant-speed font-extrude-constant-detail" hidden>
                <span data-tooltip="Seconds per full loop cycle">Speed</span>
                <input id="fontExtrudeConstantSpeed" type="range" min="0.4" max="5" step="0.05" value="2" />
                <span class="value" data-output="fontExtrudeConstantSpeed">2.0s</span>
              </label>
              <label class="slider-line font-extrude-constant-spread font-extrude-constant-spread-detail" hidden>
                <span data-tooltip="Phase offset between adjacent letters — tighter spread = slower ripple along the string">Spread</span>
                <input id="fontExtrudeConstantSpread" type="range" min="0" max="1" step="0.01" value="1" />
                <span class="value" data-output="fontExtrudeConstantSpread">100%</span>
              </label>
            </div>
`;

/** Floating shelf dock — 3D type reveal + looping motion preview (Object tab, separate from GLB Animation block). */
export const FONT_EXTRUDE_ANIMATION_PREVIEW_DOCK_HTML = `
          <div
            id="fontExtrudeAnimationPreviewDock"
            class="font-extrude-animation-preview-dock"
            hidden
            aria-hidden="true"
          >
            <div class="font-extrude-animation-preview-dock__inner">
              <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-preview">
              ${buildFontExtrudeSectionTitleHtml('Preview', 'font-extrude-preview')}
              <div class="animation-timeline">
                <div class="animation-controls">
                  <div class="animation-transport-btns">
                    <button
                      type="button"
                      id="fontExtrudeRevealPlay"
                      class="animation-play-btn"
                      disabled
                      aria-label="Play text animation preview"
                      data-tooltip="Play text animation preview"
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
                  </div>
                  <input
                    type="range"
                    id="fontExtrudeRevealScrub"
                    min="0"
                    max="1"
                    step="0.001"
                    value="1"
                    disabled
                    aria-label="Text animation preview progress"
                  />
                  <span class="font-extrude-reveal-time" id="fontExtrudeRevealTime">0.0s</span>
                </div>
              </div>
              <div class="font-extrude-preview-transport-btns">
                <button
                  type="button"
                  id="fontExtrudePauseAllAnimations"
                  class="ghost-btn small font-extrude-pause-all-btn"
                  disabled
                  data-tooltip="Freeze reveal preview and constant loop at the current pose. Resume continues from the same position."
                >
                  Pause all
                </button>
                <button
                  type="button"
                  id="fontExtrudeResetAnimations"
                  class="ghost-btn small font-extrude-reset-animations-btn"
                  disabled
                  data-tooltip="Snap all letters back to their rest pose and restart constant loops from the beginning"
                >
                  Reset animations
                </button>
              </div>
              </div>
            </div>
          </div>`;

/** Mount 3D type animation preview dock beside the export video preview dock. */
export function ensureFontExtrudeAnimationPreviewDockMounted() {
  if (document.getElementById('fontExtrudeAnimationPreviewDock')) return;
  const anchor = document.getElementById('exportVideoPreviewDock');
  if (!anchor?.parentElement) return;
  anchor.insertAdjacentHTML('afterend', FONT_EXTRUDE_ANIMATION_PREVIEW_DOCK_HTML);
}

/** Reveal animation — shown after the first 3D text generate. */
export const FONT_EXTRUDE_POST_GEN_CONTROLS_HTML = `
          <div id="fontExtrudePostGen" class="font-extrude-post-gen" hidden>
            ${PANEL_BLOCK_DIVIDER_HTML}
            <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-reveal">
            ${buildFontExtrudeSectionTitleHtml('Reveal', 'font-extrude-reveal')}
            ${FONT_EXTRUDE_ANIMATION_CONTROLS_HTML}
            </div>
            ${PANEL_BLOCK_DIVIDER_HTML}
            <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-looping-motion">
            ${buildFontExtrudeSectionTitleHtml('Looping Motion', 'font-extrude-looping-motion')}
            ${FONT_EXTRUDE_CONSTANT_CONTROLS_HTML}
            </div>
            ${PANEL_BLOCK_DIVIDER_HTML}
            ${FONT_EXTRUDE_REVEAL_EMISSIVE_HTML}
          </div>
`;
