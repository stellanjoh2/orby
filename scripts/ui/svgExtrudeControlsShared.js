import {
  clampSurfaceStrength,
  getSvgExtrudeSurfacePresetConfig,
  SVG_EXTRUDE_SURFACE_PRESETS,
} from '../render/SvgExtrudeSurfaceShader.js';

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
            <label class="slider-line">
              <span data-tooltip="Pattern size in mesh-local units (uniform tiling; rotates with the model). Procedural surfaces use world space.">Scale</span>
              <input id="${scaleId}" type="range" min="0.2" max="10" step="0.05" value="1" />
              <span class="value" data-output="${scaleOutput}">1.00</span>
            </label>
            <label class="slider-line svg-extrude-surface-strength-line">
              <span data-tooltip="Normal-map bump intensity (map presets only)">Strength</span>
              <input id="${strengthId}" type="range" min="0" max="2" step="0.01" value="1" />
              <span class="value" data-output="${strengthOutput}">1.00</span>
            </label>`;
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
    const clampedValue = Number.isFinite(value) ? Math.max(0.01, Math.min(2.0, value)) : 0.2;
    helpers.updateValueLabel(inputs.depthOutputKey, clampedValue, 'decimal');
    stateStore.set('svgExtrude.depth', clampedValue);
    if (timers.depth) clearTimeout(timers.depth);
    timers.depth = setTimeout(() => {
      eventBus.emit('mesh:svg-extrude-depth', clampedValue);
    }, 45);
  });
  if (inputs.depth) helpers.enableSliderKeyboardStepping(inputs.depth);

  inputs.normalAngle?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const clampedValue = Number.isFinite(value) ? Math.max(0, Math.min(180, value)) : 45;
    helpers.updateValueLabel(inputs.normalAngleOutputKey, clampedValue, 'angle');
    stateStore.set('svgExtrude.normalAngle', clampedValue);
    if (timers.normal) clearTimeout(timers.normal);
    timers.normal = setTimeout(() => {
      eventBus.emit('mesh:svg-extrude-normal-angle', clampedValue);
    }, 45);
  });
  if (inputs.normalAngle) helpers.enableSliderKeyboardStepping(inputs.normalAngle);

  inputs.surfacePreset?.addEventListener('change', (event) => {
    const preset = event?.target?.value || 'none';
    stateStore.set('svgExtrude.surfacePreset', preset);
    syncSurfaceStrengthControl(ctx, stateStore.getState().svgExtrude || {}, true);
    emitSvgExtrudeSurface(eventBus, stateStore);
  });

  inputs.surfaceScale?.addEventListener('input', (event) => {
    const value = parseFloat(event.target.value);
    const scale = Number.isFinite(value) ? Math.max(0.2, Math.min(10, value)) : 1.0;
    helpers.updateValueLabel(inputs.surfaceScaleOutputKey, scale, 'decimal');
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
    const color = inputs.overrideColor?.value || '#7ed321';
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
          ? Math.max(0.01, Math.min(2.0, value))
          : 0.2;
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
          ? Math.max(0.01, Math.min(2.0, value))
          : 0.2;
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
    const depth = svg.depth ?? 0.2;
    if (document.activeElement !== inputs.depth) {
      inputs.depth.value = depth;
      helpers.updateValueLabel(inputs.depthOutputKey, depth, 'decimal');
    }
    ui.setControlDisabled(inputs.depth, !canEdit);
  }
  if (inputs.normalAngle) {
    const normalAngle = svg.normalAngle ?? 45;
    if (document.activeElement !== inputs.normalAngle) {
      inputs.normalAngle.value = normalAngle;
      helpers.updateValueLabel(inputs.normalAngleOutputKey, normalAngle, 'angle');
    }
    ui.setControlDisabled(inputs.normalAngle, !canEdit);
  }
  if (inputs.surfacePreset) {
    inputs.surfacePreset.value = svg.surfacePreset ?? 'none';
    ui.setControlDisabled(inputs.surfacePreset, !canEdit);
  }
  if (inputs.surfaceScale) {
    const raw = Number(svg.surfaceScale ?? 1) || 1.0;
    const scale = Math.max(0.2, Math.min(10, raw));
    if (document.activeElement !== inputs.surfaceScale) {
      inputs.surfaceScale.value = scale;
      helpers.updateValueLabel(inputs.surfaceScaleOutputKey, scale, 'decimal');
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
    const color = svg.overrideColor ?? '#7ed321';
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
  const globalDepth = Number(state.svgExtrude?.depth ?? 0.2);

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

/** Depth + smoothing — shown after the first 3D text generate (rebuilds existing mesh). */
export const FONT_EXTRUDE_POST_GEN_CONTROLS_HTML = `
          <div id="fontExtrudePostGen" class="font-extrude-post-gen" hidden>
            <label class="slider-line">
              <span data-tooltip="Overall extrusion depth for generated text">Depth</span>
              <input id="fontExtrudeMeshDepth" type="range" min="0.01" max="2" step="0.01" value="0.2" />
              <span class="value" data-output="fontExtrudeMeshDepth">0.20</span>
            </label>
            <label class="slider-line">
              <span data-tooltip="Controls surface smoothing on letter edges (0 = faceted, higher = smoother)">Smoothing Angle</span>
              <input id="fontExtrudeMeshAngle" type="range" min="0" max="180" step="1" value="45" aria-label="Smoothing angle" />
              <span class="value" data-output="fontExtrudeMeshAngle">45°</span>
            </label>
            ${buildSvgExtrudeSurfaceControlsHtml({
              presetId: 'fontExtrudeSurfacePreset',
              scaleId: 'fontExtrudeSurfaceScale',
              scaleOutput: 'fontExtrudeSurfaceScale',
              strengthId: 'fontExtrudeSurfaceStrength',
              strengthOutput: 'fontExtrudeSurfaceStrength',
              presetAriaLabel: 'Font extrude surface material',
            })}
          </div>
`;
