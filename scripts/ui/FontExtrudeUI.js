import { ORBY_BLACK } from '../constants.js';
import { normalizeFontExtrudeDetail } from '../import/fontExtrudeSampling.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import { FontExtrudeController } from '../scene/FontExtrudeController.js';
import { FontFamilyPicker } from './FontFamilyPicker.js';
import {
  bindSvgExtrudeControls,
  syncSvgExtrudeControls,
  FONT_EXTRUDE_POST_GEN_CONTROLS_HTML,
} from './svgExtrudeControlsShared.js';

/**
 * Object panel — Generate from Font (2D preview + extrude).
 */
export class FontExtrudeUI {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} uiManager
   * @param {() => import('../SceneManager.js').SceneManager} getScene
   */
  constructor(eventBus, stateStore, uiManager, getScene, helpers) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.helpers = helpers;
    this.getScene = getScene;
    this.controller = new FontExtrudeController({
      eventBus,
      stateStore,
      getScene,
    });
    this.root = null;
    this._previewCoalesceRaf = 0;
    /** Bumped once per coalesced paint — stale async layouts are discarded. */
    this._previewGeneration = 0;
    this._previewPending = false;
    this._fontsInitialized = false;
    /** @type {Promise<void> | null} */
    this._fontsLoadPromise = null;
    this._generating = false;
    this._fonts = [];
    this._bound = false;
    this._stateUnsub = null;
    /** @type {FontFamilyPicker | null} */
    this.familyPicker = null;
    this._fontExtrudeTimers = { depth: null, normal: null, colorDebounce: new Map() };
    /** @type {ResizeObserver | null} */
    this._previewResizeObs = null;
    /** @type {number} */
    this._previewCssWidth = 520;
    /** @type {number} */
    this._previewCssHeight = 120;
  }

  static PREVIEW_SCALE_MIN = 0.15;
  /** 1× = fill preview; higher zooms in (may crop at edges). */
  static PREVIEW_SCALE_MAX = 3;

  mount() {
    if (this.root) return;
    const meshStats = document.getElementById('meshStats');
    const anchor = meshStats?.closest('.panel-block');
    if (!anchor?.parentElement) return;

    const block = document.createElement('div');
    block.className = 'panel-block';
    block.id = 'fontExtrudePanel';
    block.innerHTML = `
      <div class="subsection" data-subsection="font-extrude">
        <div class="block-title has-toggle">
          <span>Generate from Font</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label class="effect-toggle" data-tooltip="Show or hide font generator controls">
              <input type="checkbox" id="fontExtrudePanelOpen" />
              <span class="effect-indicator" aria-hidden="true"></span>
              <span class="sr-only">Show Generate from Font</span>
            </label>
          </div>
        </div>
        <div
          class="effect-foldout effect-foldout--collapsed effect-foldout--md"
          data-effect-foldout="font-extrude"
          aria-hidden="true"
        >
          <label class="font-extrude-text-wrap">
            <textarea id="fontExtrudeText" rows="3" placeholder="Type your text…" spellcheck="false"></textarea>
          </label>
          <label class="select-line font-extrude-family-line">
            <span data-tooltip="System fonts load when you turn on this section or open the font list (browser permission)">Font</span>
            <div id="fontExtrudeFamilyPicker" class="font-extrude-family-picker" aria-label="Font family"></div>
          </label>
          <div id="fontExtrudeFileFallback" class="font-extrude-file-fallback" hidden>
            <input type="file" id="fontExtrudeFile" class="sr-only" accept=".ttf,.otf,.woff,.woff2,font/*" />
            <button type="button" id="fontExtrudeFileBtn" class="ghost-btn small">Load .ttf / .otf…</button>
          </div>
          <div class="font-extrude-preview-wrap">
            <canvas id="fontExtrudePreview" class="font-extrude-preview" aria-label="Text preview"></canvas>
          </div>
          <label class="slider-line">
            <span data-tooltip="1× fills the preview box; higher zooms in (may crop). Lower shows more margin around the type.">Preview scale</span>
            <input id="fontExtrudePreviewScale" type="range" min="0.15" max="3" step="0.05" value="1" />
            <span class="value" data-output="fontExtrudePreviewScale">1.00×</span>
          </label>
          <label class="slider-line">
            <span data-tooltip="Letter-spacing in thousandths of an em">Tracking</span>
            <input id="fontExtrudeTracking" type="range" min="-100" max="200" step="1" value="0" />
            <span class="value" data-output="fontExtrudeTracking">0</span>
          </label>
          <label class="slider-line">
            <span data-tooltip="Vertical gap between lines (use Enter in the text box for new lines)">Line height</span>
            <input id="fontExtrudeLineHeight" type="range" min="0.1" max="2.5" step="0.05" value="1" />
            <span class="value" data-output="fontExtrudeLineHeight">1.00×</span>
          </label>
          <label class="select-line">
            <span data-tooltip="Horizontal alignment of each line">Align</span>
            <select id="fontExtrudeAlign" aria-label="Text alignment">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label class="select-line">
            <span data-tooltip="Curve smoothness on letters — higher adds more geometry">Detail</span>
            <select id="fontExtrudeDetail" aria-label="Extrusion detail">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label class="color-line font-extrude-fill-color">
            <span data-tooltip="Fill color for 2D preview and generated 3D text">Color</span>
            <input type="color" id="fontExtrudeFillColor" class="color-chip" value="#ffffff" />
          </label>
          ${FONT_EXTRUDE_POST_GEN_CONTROLS_HTML}
          <button type="button" id="fontExtrudeGenerate" class="accent-action-btn font-extrude-generate" disabled data-tooltip="Extrude preview text into a 3D mesh">
            <i class="fa-solid fa-cube" aria-hidden="true"></i>
            <span>Generate 3D Text</span>
          </button>
        </div>
      </div>
    `;

    anchor.parentElement.insertBefore(block, anchor);
    this.root = block;

    this.els = {
      panelOpen: block.querySelector('#fontExtrudePanelOpen'),
      foldout: block.querySelector('[data-effect-foldout="font-extrude"]'),
      text: block.querySelector('#fontExtrudeText'),
      familyPicker: block.querySelector('#fontExtrudeFamilyPicker'),
      fileFallback: block.querySelector('#fontExtrudeFileFallback'),
      fileInput: block.querySelector('#fontExtrudeFile'),
      fileBtn: block.querySelector('#fontExtrudeFileBtn'),
      previewWrap: block.querySelector('.font-extrude-preview-wrap'),
      preview: block.querySelector('#fontExtrudePreview'),
      tracking: block.querySelector('#fontExtrudeTracking'),
      lineHeight: block.querySelector('#fontExtrudeLineHeight'),
      detail: block.querySelector('#fontExtrudeDetail'),
      previewScale: block.querySelector('#fontExtrudePreviewScale'),
      align: block.querySelector('#fontExtrudeAlign'),
      postGen: block.querySelector('#fontExtrudePostGen'),
      meshDepth: block.querySelector('#fontExtrudeMeshDepth'),
      meshAngle: block.querySelector('#fontExtrudeMeshAngle'),
      surfacePreset: block.querySelector('#fontExtrudeSurfacePreset'),
      surfaceScale: block.querySelector('#fontExtrudeSurfaceScale'),
      surfaceStrength: block.querySelector('#fontExtrudeSurfaceStrength'),
      fillColor: block.querySelector('#fontExtrudeFillColor'),
      generate: block.querySelector('#fontExtrudeGenerate'),
    };

    if (this.ui.dom?.subsections) {
      this.ui.dom.subsections['font-extrude'] = block.querySelector('[data-subsection="font-extrude"]');
    }
    if (this.ui.dom?.effectFoldouts) {
      this.ui.dom.effectFoldouts['font-extrude'] = this.els.foldout;
    }

    if (this.els.familyPicker) {
      this.familyPicker = new FontFamilyPicker(this.els.familyPicker, {
        getPreviewFontFamily: (ps) => this.controller.getPreviewFontFamily(ps),
        onPrepare: () => this.ensureFontsReady(),
        onChange: () => void this.onFontFamilyChange(),
        ui: this.ui,
      });
    }
  }

  bind() {
    if (this._bound || !this.root) return;
    this._bound = true;

    const { els } = this;
    this.syncFromState(this.stateStore.getState());

    els.panelOpen?.addEventListener('change', (event) => {
      this.ui.uiSounds?.playSelect();
      const open = !!event.target.checked;
      this.stateStore.set('fontExtrude.panelOpen', open);
      this.ui.setEffectFoldoutOpen('font-extrude', open);
      if (open) void this.ensureFontsReady();
    });

    els.text?.addEventListener('input', () => {
      this.schedulePreview();
      this.updateGenerateState();
    });
    els.fileBtn?.addEventListener('click', () => els.fileInput?.click());
    els.fileInput?.addEventListener('change', () => {
      void this.onFontFileSelected();
    });
    els.tracking?.addEventListener('input', () => {
      const value = Number(els.tracking.value);
      this.stateStore.set('fontExtrude.tracking', value);
      this.ui.updateValueLabel('fontExtrudeTracking', value, 'integer');
      this.schedulePreview();
    });
    els.lineHeight?.addEventListener('input', () => {
      const value = Number(els.lineHeight.value);
      this.stateStore.set('fontExtrude.lineHeight', value);
      this.ui.updateValueLabel('fontExtrudeLineHeight', value, 'multiplier');
      this.schedulePreview();
    });
    els.detail?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontExtrudeDetail(els.detail.value);
      this.stateStore.set('fontExtrude.detail', value);
    });
    els.previewScale?.addEventListener('input', () => {
      const value = Number(els.previewScale.value);
      this.stateStore.set('fontExtrude.previewScale', value);
      this.ui.updateValueLabel('fontExtrudePreviewScale', value, 'multiplier');
      this.schedulePreview();
    });
    els.align?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value =
        els.align.value === 'center' || els.align.value === 'right' ? els.align.value : 'left';
      this.stateStore.set('fontExtrude.align', value);
      this.schedulePreview();
    });
    els.generate?.addEventListener('click', () => {
      void this.onGenerate();
    });

    bindSvgExtrudeControls(this._fontExtrudeCtx());

    const onFillColorChange = () => {
      const color = normalizeGlyphFillHex(els.fillColor?.value);
      this.stateStore.set('fontExtrude.fillColor', color);
      this.stateStore.set('svgExtrude.availableColors', [color]);
      this.getScene()?.applyFontExtrudeFillColor?.(color);
      this.schedulePreview();
    };
    els.fillColor?.addEventListener('input', onFillColorChange);
    els.fillColor?.addEventListener('change', onFillColorChange);

    this._stateUnsub = this.stateStore.subscribe((state) => this.syncFromState(state));

    this._onFontGenerated = () => this.syncPostGenControlsVisibility();
    this._onModelLoadComplete = (payload) => {
      if (payload?.source === 'font' || this._hasFontMesh()) {
        this.syncPostGenControlsVisibility();
      }
    };
    this.eventBus.on('font:generated', this._onFontGenerated);
    this.eventBus.on('scene:model-load-complete', this._onModelLoadComplete);

    if (this.els.previewWrap && typeof ResizeObserver !== 'undefined') {
      this._previewResizeObs = new ResizeObserver(() => {
        if (this._syncPreviewCanvasSize()) this.schedulePreview();
      });
      this._previewResizeObs.observe(this.els.previewWrap);
    }
    this._syncPreviewCanvasSize();

    this.updateGenerateState();
    this.syncExtrudeControls(this.stateStore.getState());
    this.syncPostGenControlsVisibility();
  }

  _hasFontMesh() {
    const scene = this.getScene();
    const model = scene?.currentModel;
    return !!(
      model?.userData?.orbyFontGenerated ||
      scene?.materialController?._isFontExtrudeModel?.(model)
    );
  }

  syncPostGenControlsVisibility() {
    const show = this._hasFontMesh();
    if (this.els.postGen) {
      this.els.postGen.hidden = !show;
    }
  }

  _fontExtrudeCtx() {
    const { els } = this;
    return {
      inputs: {
        depth: els.meshDepth,
        depthOutputKey: 'fontExtrudeMeshDepth',
        normalAngle: els.meshAngle,
        normalAngleOutputKey: 'fontExtrudeMeshAngle',
        surfacePreset: els.surfacePreset,
        surfaceScale: els.surfaceScale,
        surfaceScaleOutputKey: 'fontExtrudeSurfaceScale',
        surfaceStrength: els.surfaceStrength,
        surfaceStrengthOutputKey: 'fontExtrudeSurfaceStrength',
      },
      stateStore: this.stateStore,
      eventBus: this.eventBus,
      ui: this.ui,
      helpers: this.helpers,
      timers: this._fontExtrudeTimers,
    };
  }

  syncExtrudeControls(state) {
    syncSvgExtrudeControls(this._fontExtrudeCtx(), state, { requireEnabled: false });
    const fill = normalizeGlyphFillHex(state?.fontExtrude?.fillColor);
    if (this.els.fillColor && document.activeElement !== this.els.fillColor) {
      this.els.fillColor.value = fill;
    }
  }

  destroy() {
    if (this._onFontGenerated) {
      this.eventBus.off('font:generated', this._onFontGenerated);
      this._onFontGenerated = null;
    }
    if (this._onModelLoadComplete) {
      this.eventBus.off('scene:model-load-complete', this._onModelLoadComplete);
      this._onModelLoadComplete = null;
    }
    this._stateUnsub?.();
    this._stateUnsub = null;
    if (this._previewCoalesceRaf) cancelAnimationFrame(this._previewCoalesceRaf);
    this._previewCoalesceRaf = 0;
    this._previewPending = false;
    this.familyPicker?.destroy();
    this.familyPicker = null;
    this.controller.previewCache?.dispose();
    this.root?.remove();
    this.root = null;
    this._bound = false;
  }

  syncFromState(state) {
    const fontState = state?.fontExtrude || {};
    if (this.els.panelOpen) {
      this.els.panelOpen.checked = !!fontState.panelOpen;
    }
    this.ui.setEffectFoldoutOpen('font-extrude', !!fontState.panelOpen);

    const align = fontState.align === 'center' || fontState.align === 'right' ? fontState.align : 'left';
    if (this.els.align) this.els.align.value = align;

    if (this.els.tracking && Number.isFinite(fontState.tracking)) {
      this.els.tracking.value = String(fontState.tracking);
      this.ui.updateValueLabel('fontExtrudeTracking', fontState.tracking, 'integer');
    }
    if (this.els.lineHeight && Number.isFinite(fontState.lineHeight)) {
      this.els.lineHeight.value = String(fontState.lineHeight);
      this.ui.updateValueLabel('fontExtrudeLineHeight', fontState.lineHeight, 'multiplier');
    }
    if (this.els.detail) {
      this.els.detail.value = normalizeFontExtrudeDetail(fontState.detail);
    }
    if (this.els.previewScale && Number.isFinite(fontState.previewScale)) {
      this.els.previewScale.value = String(fontState.previewScale);
      this.ui.updateValueLabel('fontExtrudePreviewScale', fontState.previewScale, 'multiplier');
    }

    this.syncExtrudeControls(state);
    this.syncPostGenControlsVisibility();
  }

  /**
   * Request system fonts only after the user enables this section or opens the font list
   * (Local Font Access permission — not on app startup).
   */
  async ensureFontsReady() {
    if (this._fontsInitialized) return;
    if (!this._fontsLoadPromise) {
      this._fontsLoadPromise = this.initFonts()
        .then(() => {
          this._fontsInitialized = true;
        })
        .finally(() => {
          this._fontsLoadPromise = null;
          this.updateGenerateState();
        });
    }
    await this._fontsLoadPromise;
  }

  async initFonts() {
    this._fonts = await this.controller.getAvailableFonts();
    if (!this._fonts.length) {
      this.els.fileFallback.hidden = false;
      this.familyPicker?.populate([]);
      this.familyPicker?.setDisabled(true);
      return;
    }

    this.els.fileFallback.hidden = true;
    this.familyPicker?.populate(this._fonts);
    this.familyPicker?.setDisabled(false);
  }

  /**
   * Size canvas buffer to the preview wrap (full 7.5rem box — no letterboxing).
   * @returns {boolean} true when width/height changed
   */
  _syncPreviewCanvasSize() {
    const canvas = this.els.preview;
    const wrap = this.els.previewWrap;
    if (!canvas || !wrap) return false;

    const cssW = Math.max(1, Math.round(wrap.clientWidth));
    const cssH = Math.max(1, Math.round(wrap.clientHeight));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bufW = Math.max(1, Math.round(cssW * dpr));
    const bufH = Math.max(1, Math.round(cssH * dpr));
    const changed = canvas.width !== bufW || canvas.height !== bufH;
    if (changed) {
      canvas.width = bufW;
      canvas.height = bufH;
    }
    const styleW = `${cssW}px`;
    const styleH = `${cssH}px`;
    if (canvas.style.width !== styleW) canvas.style.width = styleW;
    if (canvas.style.height !== styleH) canvas.style.height = styleH;

    this._previewCssWidth = cssW;
    this._previewCssHeight = cssH;
    return changed;
  }

  clearPreviewCanvas() {
    const canvas = this.els.preview;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    this._syncPreviewCanvasSize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ORBY_BLACK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  async onFontFamilyChange() {
    const psName = this.familyPicker?.getValue();
    this._previewGeneration += 1;
    this.clearPreviewCanvas();
    if (!psName) {
      this.controller.font = null;
      this.updateGenerateState();
      return;
    }
    try {
      await this.controller.loadFont(psName);
      this.ui.showToast(`Font: ${this.controller.fontLabel}`, 2400, { notification: false });
    } catch (err) {
      console.warn(err);
      this.ui.showToast('Could not load font');
    }
    this.updateGenerateState();
    this.schedulePreview();
  }

  async onFontFileSelected() {
    const file = this.els.fileInput?.files?.[0];
    if (!file) return;
    this._previewGeneration += 1;
    this.clearPreviewCanvas();
    try {
      await this.controller.loadFont(file);
      const previewCss = await this.controller.registerFilePreview('__file__', file);
      this.familyPicker?.setCustomEntry('__file__', file.name, previewCss);
      this.ui.showToast(`Font: ${this.controller.fontLabel}`, 2400, { notification: false });
    } catch (err) {
      console.warn(err);
      this.ui.showToast('Could not parse font file');
    }
    this.updateGenerateState();
    this.schedulePreview();
  }

  /** Padding used for layout width and preview fit (keep in sync). */
  _previewLayoutPad() {
    return this.getPreviewScale() >= 1 ? 2 : 8;
  }

  getOptions() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const align =
      this.els.align?.value === 'center' || this.els.align?.value === 'right'
        ? this.els.align.value
        : fontState.align === 'center' || fontState.align === 'right'
          ? fontState.align
          : 'left';
    const previewWidth = this._previewCssWidth || this.els.preview?.clientWidth || 520;
    const pad = this._previewLayoutPad();
    return {
      align,
      tracking: Number(this.els.tracking?.value ?? fontState.tracking ?? 0),
      lineHeight: Number(this.els.lineHeight?.value ?? fontState.lineHeight ?? 1),
      detail: normalizeFontExtrudeDetail(this.els.detail?.value ?? fontState.detail ?? 'medium'),
      fillColor: normalizeGlyphFillHex(
        this.els.fillColor?.value ?? fontState.fillColor ?? '#ffffff',
      ),
      maxWidth: Math.max(120, previewWidth - pad * 2),
    };
  }

  getPreviewScale() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const value = Number(this.els.previewScale?.value ?? fontState.previewScale ?? 1);
    return Math.max(
      FontExtrudeUI.PREVIEW_SCALE_MIN,
      Math.min(FontExtrudeUI.PREVIEW_SCALE_MAX, value),
    );
  }

  schedulePreview() {
    this._previewPending = true;
    if (this._previewCoalesceRaf) return;
    this._previewCoalesceRaf = requestAnimationFrame(() => {
      this._previewCoalesceRaf = 0;
      const generation = ++this._previewGeneration;
      this._previewPending = false;
      void this.renderPreview(generation);
    });
  }

  async renderPreview(generation) {
    const canvas = this.els.preview;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (!this.controller.font) {
      this.clearPreviewCanvas();
      return;
    }

    this._syncPreviewCanvasSize();

    const text = this.els.text?.value ?? '';
    const layout = await this.controller.layoutTextAsync(text, this.getOptions());
    if (generation !== this._previewGeneration) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ORBY_BLACK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cssW = Math.max(1, this._previewCssWidth);
    const cssH = Math.max(1, this._previewCssHeight);
    const dpr = canvas.width / cssW;
    const userZoom = this.getPreviewScale();
    const pad = this._previewLayoutPad();
    const availW = Math.max(1, cssW - pad * 2);
    const availH = Math.max(1, cssH - pad * 2);
    const bounds = this.controller.getLayoutPreviewBounds(layout);
    const contentW = Math.max(bounds.maxX - bounds.minX, 1);
    const contentH = Math.max(bounds.maxY - bounds.minY, 1);
    const fitScale = Math.min(availW / contentW, availH / contentH);
    const scale = fitScale * userZoom;
    const layoutMaxW = Math.max(layout.maxWidth ?? availW, contentW);
    const inkCenterX = (bounds.minX + bounds.maxX) * 0.5;
    const targetCenterX = layout.align === 'center' ? layoutMaxW * 0.5 : inkCenterX;
    const slotLeft = pad + availW * 0.5 - targetCenterX * scale;
    const slotTop = pad + availH * 0.5 - ((bounds.minY + bounds.maxY) * 0.5) * scale;
    ctx.save();
    // Paths from opentype.js are already canvas Y-down (glyph Y is negated in getPath).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(slotLeft, slotTop);
    ctx.scale(scale, scale);
    ctx.translate(-bounds.minX, -bounds.minY);
    this.controller.drawPreview(ctx, layout);
    ctx.restore();

    if (this._previewPending) {
      this.schedulePreview();
    }
  }

  updateGenerateState() {
    const text = (this.els.text?.value ?? '').trim();
    const hasFont = !!this.controller.font;
    const canGenerate = text.length > 0 && hasFont && !this._generating;
    if (this.els.generate) {
      this.els.generate.disabled = !canGenerate;
      this.els.generate.dataset.tooltip = !hasFont
        ? 'Select or load a font first'
        : !text.length
          ? 'Enter text to generate'
          : 'Extrude preview text into a 3D mesh';
    }
  }

  async onGenerate() {
    if (this._generating) return;
    const text = this.els.text?.value ?? '';
    if (!text.trim() || !this.controller.font) return;

    this._generating = true;
    this.updateGenerateState();
    this.els.generate?.classList.add('is-loading');
    this.ui.beginLoadSpinner();

    try {
      const scene = this.getScene();
      await scene?.ensureStudioReady();
      const group = await this.controller.generateMesh(text, this.getOptions());
      await this.controller.addToScene(group);
      this.stateStore.set('fontExtrude.panelOpen', true);
      if (this.els.panelOpen) this.els.panelOpen.checked = true;
      this.ui.setEffectFoldoutOpen('font-extrude', true);
      this.syncExtrudeControls(this.stateStore.getState());
      this.syncPostGenControlsVisibility();
    } catch (err) {
      console.error('[Orby] Font generate failed', err);
      const msg =
        err && typeof err.message === 'string' && err.message.trim()
          ? err.message.trim()
          : 'Could not generate text mesh';
      this.ui.showToast(msg);
    } finally {
      this._generating = false;
      this.els.generate?.classList.remove('is-loading');
      this.ui.endLoadSpinner();
      this.updateGenerateState();
    }
  }
}
