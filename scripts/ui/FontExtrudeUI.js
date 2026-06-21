import { ORBY_BLACK } from '../constants.js';
import { normalizeFontExtrudeDetail } from '../import/fontExtrudeSampling.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import { FontExtrudeController } from '../scene/FontExtrudeController.js';
import { FontFamilyPicker } from './FontFamilyPicker.js';
import {
  bindExtrudeBevelControls,
  bindSvgExtrudeControls,
  buildExtrudeBevelGroupHtml,
  syncSvgExtrudeControls,
  FONT_EXTRUDE_POST_GEN_CONTROLS_HTML,
} from './svgExtrudeControlsShared.js';
import { normalizeFontBevelType } from '../import/extrudeBevel.js';
import {
  clampFontRevealDurationSec,
  clampFontRevealEmissiveDecaySec,
  clampFontRevealEmissiveStrength,
  clampFontRevealSlideDepth,
  clampFontRevealSlideTime,
  DEFAULT_FONT_REVEAL_DURATION_SEC,
  DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
  DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
  DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
  DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH,
  DEFAULT_FONT_REVEAL_SLIDE_DIRECTION,
  DEFAULT_FONT_REVEAL_SLIDE_DEPTH,
  DEFAULT_FONT_REVEAL_SLIDE_TIME,
  normalizeFontRevealEmissiveColor,
  normalizeFontRevealEmissiveSlamEnabled,
} from '../scene/FontTextRevealController.js';
import {
  DEFAULT_FONT_REVEAL_TYPE,
  DEFAULT_FONT_REVEAL_UNIT,
  normalizeFontRevealSlideDirection,
  normalizeFontRevealType,
  normalizeFontRevealUnit,
} from '../scene/fontTextRevealTypes.js';
import {
  DEFAULT_FONT_KERNING_MODE,
  normalizeFontKerningMode,
} from '../scene/fontKerning.js';
import { arrayBufferToBase64, fileFromEmbeddedAsset } from '../utils/binaryAsset.js';

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
    this._fontFamilies = [];
    this._fontFamilyByPostscript = new Map();
    this._bound = false;
    this._stateUnsub = null;
    /** @type {FontFamilyPicker | null} */
    this.familyPicker = null;
    this._fontExtrudeTimers = { depth: null, normal: null, bevel: null, colorDebounce: new Map() };
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
  static PREVIEW_SCALE_DEFAULT = 0.65;
  /** Default copy shown in the live editor on first open (~66% of preview width at default scale). */
  static DEFAULT_PREVIEW_TEXT = 'Type your text';

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
          class="effect-foldout effect-foldout--collapsed effect-foldout--xl"
          data-effect-foldout="font-extrude"
          aria-hidden="true"
        >
          <div class="font-extrude-live-editor" id="fontExtrudeLiveEditor">
            <canvas id="fontExtrudePreview" class="font-extrude-preview" aria-hidden="true"></canvas>
            <textarea
              id="fontExtrudeText"
              rows="3"
              placeholder="Enter text…"
              spellcheck="false"
              aria-label="Text"
            >Type your text</textarea>
          </div>
          <label class="slider-line">
            <span data-tooltip="1× fills the preview box; higher zooms in (may crop). Lower shows more margin around the type.">Preview scale</span>
            <input id="fontExtrudePreviewScale" type="range" min="0.15" max="3" step="0.05" value="0.65" />
            <span class="value" data-output="fontExtrudePreviewScale">0.65×</span>
          </label>
          <div id="fontExtrudeSystemFontsPrompt" class="font-extrude-system-fonts-prompt" hidden>
            <button
              type="button"
              id="fontExtrudeAllowSystemFonts"
              class="ghost-btn small"
              data-tooltip="Your browser will ask to access fonts installed on this device"
            >
              Allow system fonts…
            </button>
          </div>
          <label class="select-line font-extrude-family-line font-extrude-typo-family-line">
            <span data-tooltip="Click Allow system fonts, or open this list after permission is granted">Typeface</span>
            <div id="fontExtrudeFamilyPicker" class="font-extrude-family-picker" aria-label="Font family"></div>
          </label>
          <label class="select-line font-extrude-style-line">
            <span data-tooltip="Choose weight/style available for the selected typeface">Style</span>
            <select id="fontExtrudeVariant" aria-label="Typeface style">
              <option value="">Regular</option>
            </select>
          </label>
          <label class="select-line font-extrude-kerning-line">
            <span data-tooltip="Auto uses the font's built-in kerning pairs. Optical tightens spacing by glyph shape (approximate).">Kerning</span>
            <select id="fontExtrudeKerning" aria-label="Kerning mode">
              <option value="metrics" selected>Auto</option>
              <option value="optical">Optical</option>
              <option value="none">None</option>
            </select>
          </label>
          <label class="slider-line">
            <span data-tooltip="Letter-spacing in thousandths of an em">Letter Spacing</span>
            <input id="fontExtrudeTracking" type="range" min="-100" max="200" step="1" value="0" />
            <span class="value" data-output="fontExtrudeTracking">0</span>
          </label>
          <label class="slider-line">
            <span data-tooltip="Vertical gap between lines (use Enter in the text box for new lines)">Line Height</span>
            <input id="fontExtrudeLineHeight" type="range" min="0.1" max="2.5" step="0.05" value="1" />
            <span class="value" data-output="fontExtrudeLineHeight">1.00×</span>
          </label>
          <label class="select-line font-extrude-align-line">
            <span data-tooltip="Horizontal alignment of each line">Align</span>
            <select id="fontExtrudeAlign" aria-label="Text alignment">
              <option value="left">Left</option>
              <option value="center" selected>Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <div id="fontExtrudeFileFallback" class="font-extrude-file-fallback" hidden>
            <input type="file" id="fontExtrudeFile" class="sr-only" accept=".ttf,.otf,.woff,.woff2,font/*" />
            <button type="button" id="fontExtrudeFileBtn" class="ghost-btn small">Load .ttf / .otf…</button>
          </div>
          <label class="color-line font-extrude-fill-color">
            <span data-tooltip="Fill color for 2D preview and generated 3D text">Color</span>
            <input type="color" id="fontExtrudeFillColor" class="color-chip" value="#808080" />
          </label>
          <label class="select-line">
            <span data-tooltip="Curve smoothness (curveSegments) — native Bézier outlines like Three.js TextGeometry; High is the default">Mesh Detail</span>
            <select id="fontExtrudeDetail" aria-label="Mesh detail">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high" selected>High</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>
          ${buildExtrudeBevelGroupHtml({
            bevelType: { id: 'fontExtrudeBevelType' },
            bevel: {
              id: 'fontExtrudeBevelAmount',
              outputKey: 'fontExtrudeBevelAmount',
              tooltip: 'Edge bevel size — max 10% of extrusion depth',
            },
          })}
          <button type="button" id="fontExtrudeGenerate" class="accent-action-btn font-extrude-generate" disabled data-tooltip="Extrude preview text into a 3D mesh">
            <i class="fa-solid fa-cube" aria-hidden="true"></i>
            <span>Generate 3D Text</span>
          </button>
          ${FONT_EXTRUDE_POST_GEN_CONTROLS_HTML}
        </div>
      </div>
    `;

    anchor.parentElement.insertBefore(block, anchor);
    this.root = block;

    this.els = {
      panelOpen: block.querySelector('#fontExtrudePanelOpen'),
      foldout: block.querySelector('[data-effect-foldout="font-extrude"]'),
      text: block.querySelector('#fontExtrudeText'),
      systemFontsPrompt: block.querySelector('#fontExtrudeSystemFontsPrompt'),
      allowSystemFonts: block.querySelector('#fontExtrudeAllowSystemFonts'),
      familyPicker: block.querySelector('#fontExtrudeFamilyPicker'),
      variant: block.querySelector('#fontExtrudeVariant'),
      fileFallback: block.querySelector('#fontExtrudeFileFallback'),
      fileInput: block.querySelector('#fontExtrudeFile'),
      fileBtn: block.querySelector('#fontExtrudeFileBtn'),
      liveEditor: block.querySelector('#fontExtrudeLiveEditor'),
      preview: block.querySelector('#fontExtrudePreview'),
      tracking: block.querySelector('#fontExtrudeTracking'),
      kerning: block.querySelector('#fontExtrudeKerning'),
      lineHeight: block.querySelector('#fontExtrudeLineHeight'),
      detail: block.querySelector('#fontExtrudeDetail'),
      bevelType: block.querySelector('#fontExtrudeBevelType'),
      previewScale: block.querySelector('#fontExtrudePreviewScale'),
      align: block.querySelector('#fontExtrudeAlign'),
      postGen: block.querySelector('#fontExtrudePostGen'),
      meshDepth: block.querySelector('#fontExtrudeMeshDepth'),
      meshAngle: block.querySelector('#fontExtrudeMeshAngle'),
      bevelAmount: block.querySelector('#fontExtrudeBevelAmount'),
      surfacePreset: block.querySelector('#fontExtrudeSurfacePreset'),
      surfaceScale: block.querySelector('#fontExtrudeSurfaceScale'),
      surfaceStrength: block.querySelector('#fontExtrudeSurfaceStrength'),
      fillColor: block.querySelector('#fontExtrudeFillColor'),
      revealDuration: block.querySelector('#fontExtrudeRevealDuration'),
      revealSlideDepth: block.querySelector('#fontExtrudeRevealSlideDepth'),
      revealSlideTime: block.querySelector('#fontExtrudeRevealSlideTime'),
      revealSlideDirection: block.querySelector('#fontExtrudeRevealSlideDirection'),
      revealEmissiveSlam: block.querySelector('#fontExtrudeRevealEmissiveSlam'),
      revealEmissiveStrength: block.querySelector('#fontExtrudeRevealEmissiveStrength'),
      revealEmissiveDecay: block.querySelector('#fontExtrudeRevealEmissiveDecay'),
      revealEmissiveColor: block.querySelector('#fontExtrudeRevealEmissiveColor'),
      revealType: block.querySelector('#fontExtrudeRevealType'),
      revealUnit: block.querySelector('#fontExtrudeRevealUnit'),
      revealPlay: block.querySelector('#fontExtrudeRevealPlay'),
      revealLoop: block.querySelector('#fontExtrudeRevealLoop'),
      revealScrub: block.querySelector('#fontExtrudeRevealScrub'),
      revealTime: block.querySelector('#fontExtrudeRevealTime'),
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
        onPrepare: () => {
          this._primeLocalFontAccess();
          return this.ensureFontsReady({ fromUserGesture: true });
        },
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
      if (open) {
        this._primeLocalFontAccess();
        void this.ensureFontsReady({ fromUserGesture: true }).then(() => {
          this._syncPreviewCanvasSize();
          this.schedulePreview();
          this._syncLiveEditorPreviewMode();
        });
      } else {
        this._syncSystemFontsPromptVisibility();
      }
    });

    els.text?.addEventListener('input', () => {
      this.stateStore.set('fontExtrude.sourceText', els.text?.value ?? '');
      this.schedulePreview();
      this.updateGenerateState();
    });
    els.text?.addEventListener('focus', () => {
      this._primeLocalFontAccess();
      void this.ensureFontsReady({ fromUserGesture: true });
    });
    els.allowSystemFonts?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this.controller.resetLocalFontAccessQuery();
      this._fontsInitialized = false;
      this._fontsLoadPromise = null;
      this._primeLocalFontAccess();
      void this.ensureFontsReady({ fromUserGesture: true });
    });
    els.text?.addEventListener('scroll', () => {
      this.schedulePreview();
    });
    els.fileBtn?.addEventListener('click', () => els.fileInput?.click());
    els.fileInput?.addEventListener('change', () => {
      void this.onFontFileSelected();
    });
    els.variant?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      void this.onFontVariantChange();
    });
    els.tracking?.addEventListener('input', () => {
      const value = Number(els.tracking.value);
      this.stateStore.set('fontExtrude.tracking', value);
      this.ui.updateValueLabel('fontExtrudeTracking', value, 'integer');
      this.schedulePreview();
    });
    els.kerning?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontKerningMode(els.kerning.value);
      this.stateStore.set('fontExtrude.kerning', value);
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
      if (this._hasFontMesh()) {
        this.getScene()?.setSvgExtrudeDetail?.(value);
      }
    });
    els.bevelType?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontBevelType(els.bevelType.value);
      this.stateStore.set('fontExtrude.bevelType', value);
      if (this._hasFontMesh()) {
        this.eventBus.emit('mesh:font-extrude-bevel-type', { type: value });
      }
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
    bindExtrudeBevelControls(this._fontExtrudeCtx());

    const onFillColorChange = () => {
      const color = normalizeGlyphFillHex(els.fillColor?.value);
      this.stateStore.set('fontExtrude.fillColor', color);
      this.stateStore.set('svgExtrude.availableColors', [color]);
      this.getScene()?.applyFontExtrudeFillColor?.(color);
      this.schedulePreview();
    };
    els.fillColor?.addEventListener('input', onFillColorChange);
    els.fillColor?.addEventListener('change', onFillColorChange);

    els.revealDuration?.addEventListener('input', () => {
      const value = clampFontRevealDurationSec(els.revealDuration.value);
      this.stateStore.set('fontExtrude.revealDurationSec', value);
      this.ui.updateValueLabel('fontExtrudeRevealDuration', `${value.toFixed(1)}s`);
      this._withRevealController((controller, model) => {
        controller.onDurationChange?.(model);
      });
    });

    els.revealSlideDepth?.addEventListener('input', () => {
      const value = clampFontRevealSlideDepth(els.revealSlideDepth.value);
      this.stateStore.set('fontExtrude.revealSlideDepth', value);
      this.ui.updateValueLabel('fontExtrudeRevealSlideDepth', value, 'decimal');
      this._withRevealController((controller, model) => {
        controller.onRevealTimingChange?.(model);
      });
    });

    els.revealSlideTime?.addEventListener('input', () => {
      const value = clampFontRevealSlideTime(els.revealSlideTime.value);
      this.stateStore.set('fontExtrude.revealSlideTime', value);
      this.ui.updateValueLabel('fontExtrudeRevealSlideTime', `${Math.round(value * 100)}%`);
      this._withRevealController((controller, model) => {
        controller.onRevealTimingChange?.(model);
      });
    });

    els.revealSlideDirection?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontRevealSlideDirection(els.revealSlideDirection.value);
      this.stateStore.set('fontExtrude.revealSlideDirection', value);
      this._withRevealController((controller, model) => {
        controller.onRevealTimingChange?.(model);
      });
    });

    els.revealType?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontRevealType(els.revealType.value);
      this.stateStore.set('fontExtrude.revealType', value);
      this._withRevealController((controller, model) => {
        controller.onRevealTypeChange?.(model);
      });
    });

    els.revealUnit?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontRevealUnit(els.revealUnit.value);
      this.stateStore.set('fontExtrude.revealUnit', value);
      this._withRevealController((controller, model) => {
        controller.onRevealTimingChange?.(model);
      });
    });

    const onRevealEmissiveChange = () => {
      this._withRevealController((controller, model) => {
        controller.onRevealEmissiveChange?.(model);
      });
      this._syncRevealEmissiveControlsDisabled();
    };

    els.revealEmissiveSlam?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      this.stateStore.set('fontExtrude.revealEmissiveSlam', !!els.revealEmissiveSlam.checked);
      onRevealEmissiveChange();
    });

    els.revealEmissiveStrength?.addEventListener('input', () => {
      const value = clampFontRevealEmissiveStrength(els.revealEmissiveStrength.value);
      this.stateStore.set('fontExtrude.revealEmissiveStrength', value);
      this.ui.updateValueLabel('fontExtrudeRevealEmissiveStrength', value, 'decimal');
      onRevealEmissiveChange();
    });

    els.revealEmissiveDecay?.addEventListener('input', () => {
      const value = clampFontRevealEmissiveDecaySec(els.revealEmissiveDecay.value);
      this.stateStore.set('fontExtrude.revealEmissiveDecaySec', value);
      this.ui.updateValueLabel('fontExtrudeRevealEmissiveDecay', `${value.toFixed(2)}s`);
      onRevealEmissiveChange();
    });

    const onRevealEmissiveColorChange = () => {
      const color = normalizeFontRevealEmissiveColor(els.revealEmissiveColor?.value);
      this.stateStore.set('fontExtrude.revealEmissiveColor', color);
      onRevealEmissiveChange();
    };
    els.revealEmissiveColor?.addEventListener('input', onRevealEmissiveColorChange);
    els.revealEmissiveColor?.addEventListener('change', onRevealEmissiveColorChange);

    els.revealLoop?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const enabled = !!els.revealLoop.checked;
      this.stateStore.set('fontExtrude.revealLoop', enabled);
    });

    els.revealPlay?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this._withRevealController((controller, model) => {
        if (!controller.ensureBoundToModel(model)) {
          this.ui.showToast('Reveal needs 3D text — click Generate 3D Text first');
          return;
        }
        if (controller.getDurationSec() <= 0) {
          this.ui.showToast('Set reveal duration above 0 to preview');
          return;
        }
        if (controller.getGlyphCount() <= 0) {
          this.ui.showToast('No letters to animate — regenerate 3D text');
          return;
        }
        if (controller.isPreviewPlaying()) {
          controller.pausePreview(model);
          return;
        }
        controller.startPreview(model);
      });
    });

    els.revealScrub?.addEventListener('input', (event) => {
      const value = parseFloat(event.target.value);
      this._withRevealController((controller, model) => {
        controller.scrubPreview?.(value, model);
      });
    });

    this._onRevealPreviewTime = (payload) => this.syncRevealPreviewControls(payload);
    this._attachRevealPreviewCallback();

    this._stateUnsub = this.stateStore.subscribe((state) => this.syncFromState(state));

    this._onFontGenerated = () => this.syncPostGenControlsVisibility();
    this._onModelLoadComplete = (payload) => {
      if (payload?.source === 'font' || this._hasFontMesh()) {
        this.syncPostGenControlsVisibility();
      }
    };
    this.eventBus.on('font:generated', this._onFontGenerated);
    this.eventBus.on('scene:model-load-complete', this._onModelLoadComplete);

    if (this.els.liveEditor && typeof ResizeObserver !== 'undefined') {
      this._previewResizeObs = new ResizeObserver(() => {
        if (this._syncPreviewCanvasSize()) this.schedulePreview();
      });
      this._previewResizeObs.observe(this.els.liveEditor);
    }
    this._syncPreviewCanvasSize();
    this._syncLiveEditorPreviewMode();

    this.updateGenerateState();
    this.syncExtrudeControls(this.stateStore.getState());
    this.syncPostGenControlsVisibility();
    this._syncSystemFontsPromptVisibility();
    if (this.stateStore.getState()?.fontExtrude?.panelOpen) {
      this._syncSystemFontsPromptVisibility();
    }
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
    if (show) {
      this._attachRevealPreviewCallback();
      this.syncRevealPreviewControlsFromController();
    }
  }

  _attachRevealPreviewCallback() {
    this._withRevealController((controller) => {
      if (controller.onPreviewTimeUpdate === this._onRevealPreviewTime) return;
      controller.onPreviewTimeUpdate = this._onRevealPreviewTime;
      this.syncRevealPreviewControlsFromController();
    });
  }

  syncRevealPreviewControlsFromController() {
    const controller = this._revealController();
    if (!controller) {
      this.syncRevealPreviewControls({ elapsed: 0, duration: 0, playing: false });
      return;
    }
    this.syncRevealPreviewControls({
      elapsed: controller.getPreviewElapsed?.() ?? 0,
      duration: controller.getDurationSec?.() ?? 0,
      playing: controller.isPreviewPlaying?.() ?? false,
    });
  }

  /**
   * @param {{ elapsed: number, duration: number, playing: boolean }} payload
   */
  syncRevealPreviewControls({ elapsed, duration, playing }) {
    const enabled = duration > 0 && this._hasFontMesh();
    const { els } = this;

    if (els.revealPlay) {
      els.revealPlay.disabled = !enabled;
      els.revealPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
      els.revealPlay.setAttribute('aria-label', playing ? 'Pause reveal animation' : 'Play reveal animation');
      els.revealPlay.dataset.tooltip = playing ? 'Pause reveal preview' : 'Play reveal preview';
      const icon = els.revealPlay.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-play', !playing);
        icon.classList.toggle('fa-pause', playing);
      }
    }

    if (els.revealScrub) {
      els.revealScrub.disabled = !enabled;
      if (document.activeElement !== els.revealScrub) {
        const progress = duration > 0 ? elapsed / duration : 1;
        els.revealScrub.value = String(Math.max(0, Math.min(1, progress)));
      }
    }

    if (els.revealTime) {
      els.revealTime.textContent = `${Math.max(0, elapsed).toFixed(1)}s`;
    }
  }

  _revealController() {
    return this.getScene()?.fontTextRevealController ?? null;
  }

  _revealModel() {
    return this.getScene()?.currentModel ?? null;
  }

  _withRevealController(run) {
    const scene = this.getScene();
    const controller = scene?.fontTextRevealController;
    const model = scene?.currentModel;
    if (!controller || !model) return;
    controller.ensureBoundToModel?.(model);
    run(controller, model, scene);
  }

  _fontExtrudeCtx() {
    const { els } = this;
    return {
      inputs: {
        depth: els.meshDepth,
        depthOutputKey: 'fontExtrudeMeshDepth',
        normalAngle: els.meshAngle,
        normalAngleOutputKey: 'fontExtrudeMeshAngle',
        bevelAmount: els.bevelAmount,
        bevelAmountOutputKey: 'fontExtrudeBevelAmount',
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
    const revealDuration = clampFontRevealDurationSec(
      state?.fontExtrude?.revealDurationSec ?? DEFAULT_FONT_REVEAL_DURATION_SEC,
    );
    if (this.els.revealDuration && document.activeElement !== this.els.revealDuration) {
      this.els.revealDuration.value = String(revealDuration);
      this.ui.updateValueLabel('fontExtrudeRevealDuration', `${revealDuration.toFixed(1)}s`);
    }
    const revealSlideDepth = clampFontRevealSlideDepth(
      state?.fontExtrude?.revealSlideDepth ?? DEFAULT_FONT_REVEAL_SLIDE_DEPTH,
    );
    if (this.els.revealSlideDepth && document.activeElement !== this.els.revealSlideDepth) {
      this.els.revealSlideDepth.value = String(revealSlideDepth);
      this.ui.updateValueLabel('fontExtrudeRevealSlideDepth', revealSlideDepth, 'decimal');
    }
    const revealSlideTime = clampFontRevealSlideTime(
      state?.fontExtrude?.revealSlideTime ?? DEFAULT_FONT_REVEAL_SLIDE_TIME,
    );
    if (this.els.revealSlideTime && document.activeElement !== this.els.revealSlideTime) {
      this.els.revealSlideTime.value = String(revealSlideTime);
      this.ui.updateValueLabel('fontExtrudeRevealSlideTime', `${Math.round(revealSlideTime * 100)}%`);
    }
    const revealSlideDirection = normalizeFontRevealSlideDirection(
      state?.fontExtrude?.revealSlideDirection ?? DEFAULT_FONT_REVEAL_SLIDE_DIRECTION,
    );
    if (this.els.revealSlideDirection && document.activeElement !== this.els.revealSlideDirection) {
      this.els.revealSlideDirection.value = revealSlideDirection;
    }
    const revealType = normalizeFontRevealType(
      state?.fontExtrude?.revealType ?? DEFAULT_FONT_REVEAL_TYPE,
    );
    if (this.els.revealType && document.activeElement !== this.els.revealType) {
      this.els.revealType.value = revealType;
    }
    const revealUnit = normalizeFontRevealUnit(
      state?.fontExtrude?.revealUnit ?? DEFAULT_FONT_REVEAL_UNIT,
    );
    if (this.els.revealUnit && document.activeElement !== this.els.revealUnit) {
      this.els.revealUnit.value = revealUnit;
    }
    const revealLoop = state?.fontExtrude?.revealLoop !== false;
    if (this.els.revealLoop && document.activeElement !== this.els.revealLoop) {
      this.els.revealLoop.checked = revealLoop;
    }
    const revealEmissiveSlam = normalizeFontRevealEmissiveSlamEnabled(
      state?.fontExtrude?.revealEmissiveSlam ?? DEFAULT_FONT_REVEAL_EMISSIVE_SLAM,
    );
    if (this.els.revealEmissiveSlam && document.activeElement !== this.els.revealEmissiveSlam) {
      this.els.revealEmissiveSlam.checked = revealEmissiveSlam;
    }
    const revealEmissiveStrength = clampFontRevealEmissiveStrength(
      state?.fontExtrude?.revealEmissiveStrength ?? DEFAULT_FONT_REVEAL_EMISSIVE_STRENGTH,
    );
    if (
      this.els.revealEmissiveStrength &&
      document.activeElement !== this.els.revealEmissiveStrength
    ) {
      this.els.revealEmissiveStrength.value = String(revealEmissiveStrength);
      this.ui.updateValueLabel(
        'fontExtrudeRevealEmissiveStrength',
        revealEmissiveStrength,
        'decimal',
      );
    }
    const revealEmissiveDecaySec = clampFontRevealEmissiveDecaySec(
      state?.fontExtrude?.revealEmissiveDecaySec ?? DEFAULT_FONT_REVEAL_EMISSIVE_DECAY_SEC,
    );
    if (this.els.revealEmissiveDecay && document.activeElement !== this.els.revealEmissiveDecay) {
      this.els.revealEmissiveDecay.value = String(revealEmissiveDecaySec);
      this.ui.updateValueLabel(
        'fontExtrudeRevealEmissiveDecay',
        `${revealEmissiveDecaySec.toFixed(2)}s`,
      );
    }
    const revealEmissiveColor = normalizeFontRevealEmissiveColor(
      state?.fontExtrude?.revealEmissiveColor ?? DEFAULT_FONT_REVEAL_EMISSIVE_COLOR,
    );
    if (
      this.els.revealEmissiveColor &&
      document.activeElement !== this.els.revealEmissiveColor
    ) {
      this.els.revealEmissiveColor.value = revealEmissiveColor;
    }
    this._syncRevealEmissiveControlsDisabled();
  }

  _syncRevealEmissiveControlsDisabled() {
    const enabled = !!this.els.revealEmissiveSlam?.checked;
    const disable = !enabled;
    for (const el of [
      this.els.revealEmissiveStrength,
      this.els.revealEmissiveDecay,
      this.els.revealEmissiveColor,
    ]) {
      if (!el) continue;
      el.disabled = disable;
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
    const controller = this.getScene()?.fontTextRevealController;
    if (controller?.onPreviewTimeUpdate === this._onRevealPreviewTime) {
      controller.onPreviewTimeUpdate = null;
    }
    this._onRevealPreviewTime = null;
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

    if (
      this.els.text &&
      typeof fontState.sourceText === 'string' &&
      document.activeElement !== this.els.text
    ) {
      this.els.text.value = fontState.sourceText;
    }

    const align =
      fontState.align === 'left' || fontState.align === 'right' ? fontState.align : 'center';
    if (this.els.align) this.els.align.value = align;

    if (this.els.tracking && Number.isFinite(fontState.tracking)) {
      this.els.tracking.value = String(fontState.tracking);
      this.ui.updateValueLabel('fontExtrudeTracking', fontState.tracking, 'integer');
    }
    const kerning = normalizeFontKerningMode(fontState.kerning ?? DEFAULT_FONT_KERNING_MODE);
    if (this.els.kerning && document.activeElement !== this.els.kerning) {
      this.els.kerning.value = kerning;
    }
    if (this.els.lineHeight && Number.isFinite(fontState.lineHeight)) {
      this.els.lineHeight.value = String(fontState.lineHeight);
      this.ui.updateValueLabel('fontExtrudeLineHeight', fontState.lineHeight, 'multiplier');
    }
    if (this.els.detail) {
      this.els.detail.value = normalizeFontExtrudeDetail(fontState.detail);
    }
    if (this.els.bevelType && document.activeElement !== this.els.bevelType) {
      this.els.bevelType.value = normalizeFontBevelType(fontState.bevelType);
    }
    if (this.els.previewScale && Number.isFinite(fontState.previewScale)) {
      this.els.previewScale.value = String(fontState.previewScale);
      this.ui.updateValueLabel('fontExtrudePreviewScale', fontState.previewScale, 'multiplier');
    }

    this.syncExtrudeControls(state);
    this.syncPostGenControlsVisibility();
    this._syncSystemFontsPromptVisibility();
  }

  /**
   * Restore font picker / preview after copy-paste or .orby load.
   * @param {import('../StateStore.js').StateStore['defaults']['fontExtrude']} [fontExtrude]
   */
  async restoreFromSettings(fontExtrude = {}) {
    if (!fontExtrude || typeof fontExtrude !== 'object') return;

    if (this.els.text && typeof fontExtrude.sourceText === 'string') {
      this.els.text.value = fontExtrude.sourceText;
    }

    const customFile = fileFromEmbeddedAsset(fontExtrude.customFontAsset, 'font.ttf');
    if (customFile) {
      try {
        await this.controller.loadFont(customFile);
        this._fontsInitialized = true;
        if (this.els.systemFontsPrompt) this.els.systemFontsPrompt.hidden = true;
        const previewCss = await this.controller.registerFilePreview('__file__', customFile);
        this.familyPicker?.setCustomEntry('__file__', customFile.name, previewCss);
        this._setVariantOptions(
          [{ postscriptName: '__file__', styleLabel: 'Regular', fullName: customFile.name }],
          '__file__',
        );
      } catch (err) {
        console.warn('[Orby] Could not restore custom font from scene settings', err);
      }
    } else if (fontExtrude.postscriptName) {
      await this.ensureFontsReady({ fromUserGesture: false });
      const psName = fontExtrude.postscriptName;
      const familyGroup = this._fontFamilyByPostscript.get(psName) ?? null;
      const label = this._familyLabelForPostscript(psName);
      this.familyPicker?.setValue(psName, label);
      this._setVariantOptions(familyGroup?.variants || [], psName);
      try {
        await this.controller.loadFont(psName);
      } catch (err) {
        console.warn('[Orby] Could not restore system font from scene settings', psName, err);
      }
    }

    this.updateGenerateState();
    this.schedulePreview();
    this._syncLiveEditorPreviewMode();
  }

  /**
   * Start `queryLocalFonts()` in the same turn as a click/focus so the browser can show its prompt.
   */
  _primeLocalFontAccess() {
    this.controller.beginLocalFontAccessQuery();
  }

  _syncSystemFontsPromptVisibility() {
    const prompt = this.els.systemFontsPrompt;
    if (!prompt) return;
    const show =
      this.controller.supportsLocalFonts &&
      !this._fontsInitialized &&
      !this.controller.font;
    prompt.hidden = !show;
  }

  /**
   * Load system font catalog after user gesture (see `_primeLocalFontAccess`).
   * @param {{ fromUserGesture?: boolean }} [options]
   */
  async ensureFontsReady({ fromUserGesture = false } = {}) {
    if (this._fontsInitialized) return;
    if (!fromUserGesture && this.controller.supportsLocalFonts) {
      this._syncSystemFontsPromptVisibility();
      return;
    }
    if (!this._fontsLoadPromise) {
      this._fontsLoadPromise = this.initFonts()
        .then((ok) => {
          if (ok) this._fontsInitialized = true;
        })
        .finally(() => {
          this._fontsLoadPromise = null;
          this.updateGenerateState();
          this._syncSystemFontsPromptVisibility();
        });
    }
    await this._fontsLoadPromise;
  }

  /**
   * @returns {Promise<boolean>} true when system fonts are ready (or file-only mode is set up)
   */
  async initFonts() {
    if (this.controller.supportsLocalFonts && !this.controller.hasLocalFontAccessQueryStarted()) {
      this._syncSystemFontsPromptVisibility();
      return false;
    }

    this._fontFamilies = await this.controller.getAvailableFonts();
    this._fontFamilyByPostscript.clear();

    if (!this._fontFamilies.length) {
      this._fonts = [];
      this.els.fileFallback.hidden = false;
      this.familyPicker?.populate([]);
      this.familyPicker?.setDisabled(true);
      this._setVariantOptions([]);
      this._syncLiveEditorPreviewMode();
      this._syncSystemFontsPromptVisibility();
      if (this.controller.supportsLocalFonts) {
        const perm = await this.controller.getLocalFontsPermissionState();
        const msg =
          perm === 'denied'
            ? 'System font access was blocked — reset the site permission in browser settings, or load a .ttf / .otf file.'
            : 'Could not load system fonts — click Allow system fonts, or load a .ttf / .otf file.';
        this.ui.showToast(msg, 5600, { notification: false });
      } else {
        this.ui.showToast(
          'Load a .ttf or .otf file to preview and generate text (system fonts unavailable in this browser).',
          5200,
          { notification: false },
        );
      }
      return false;
    }

    this._fonts = this._fontFamilies.map((familyGroup) => ({
      family: familyGroup.family,
      postscriptName: familyGroup.defaultPostscriptName,
    }));
    for (const familyGroup of this._fontFamilies) {
      for (const variant of familyGroup.variants || []) {
        this._fontFamilyByPostscript.set(variant.postscriptName, familyGroup);
      }
    }

    this.els.fileFallback.hidden = true;
    if (this.els.systemFontsPrompt) this.els.systemFontsPrompt.hidden = true;
    this.familyPicker?.populate(this._fonts);
    this.familyPicker?.setDisabled(false);
    this._setVariantOptions([]);
    await this._loadDefaultFontIfNeeded();
    return true;
  }

  /** Auto-select Arial (or closest sans) so the live editor is ready to type. */
  async _loadDefaultFontIfNeeded() {
    if (this.controller.font) {
      this.schedulePreview();
      return;
    }
    const postscriptName = await this.controller.resolveDefaultPostscriptName();
    if (!postscriptName) return;

    const familyGroup = this._fontFamilyByPostscript.get(postscriptName) ?? null;
    const label = this._familyLabelForPostscript(postscriptName);
    this.familyPicker?.setValue(postscriptName, label);
    this._setVariantOptions(familyGroup?.variants || [], postscriptName);

    try {
      await this.controller.loadFont(postscriptName);
      this.schedulePreview();
      this.updateGenerateState();
      this._syncLiveEditorPreviewMode();
    } catch (err) {
      console.warn('[Orby] Could not load default font', postscriptName, err);
      this._syncLiveEditorPreviewMode();
    }
  }

  /**
   * Size canvas buffer to the preview wrap (full 7.5rem box — no letterboxing).
   * @returns {boolean} true when width/height changed
   */
  _syncPreviewCanvasSize() {
    const canvas = this.els.preview;
    const wrap = this.els.liveEditor;
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
    const familyGroup = this._fontFamilyByPostscript.get(psName) ?? null;
    this._setVariantOptions(familyGroup?.variants || [], psName);
    this._previewGeneration += 1;
    this.clearPreviewCanvas();
    if (!psName) {
      this.controller.font = null;
      this.updateGenerateState();
      this._syncLiveEditorPreviewMode();
      return;
    }
    try {
      await this.controller.loadFont(psName);
      this.stateStore.set('fontExtrude.postscriptName', psName);
      this.stateStore.set('fontExtrude.customFontAsset', null);
      this.ui.showToast(`Font: ${this.controller.fontLabel}`, 2400, { notification: false });
    } catch (err) {
      console.warn(err);
      this.ui.showToast('Could not load font');
    }
    this.updateGenerateState();
    this.schedulePreview();
    this._syncLiveEditorPreviewMode();
  }

  async onFontVariantChange() {
    const psName = this.els.variant?.value || this.familyPicker?.getValue();
    if (!psName) return;
    this.familyPicker?.setValue(psName, this._familyLabelForPostscript(psName));
    this._previewGeneration += 1;
    this.clearPreviewCanvas();
    try {
      await this.controller.loadFont(psName);
      this.stateStore.set('fontExtrude.postscriptName', psName);
      this.stateStore.set('fontExtrude.customFontAsset', null);
      this.ui.showToast(`Font: ${this.controller.fontLabel}`, 2400, { notification: false });
    } catch (err) {
      console.warn(err);
      this.ui.showToast('Could not load font');
    }
    this.updateGenerateState();
    this.schedulePreview();
    this._syncLiveEditorPreviewMode();
  }

  async onFontFileSelected() {
    const file = this.els.fileInput?.files?.[0];
    if (!file) return;
    this._previewGeneration += 1;
    this.clearPreviewCanvas();
    try {
      await this.controller.loadFont(file);
      const fileBuffer = await file.arrayBuffer();
      this.stateStore.set('fontExtrude.customFontAsset', {
        name: file.name,
        type: file.type || '',
        dataBase64: arrayBufferToBase64(fileBuffer),
      });
      this.stateStore.set('fontExtrude.postscriptName', '__file__');
      this._fontsInitialized = true;
      if (this.els.systemFontsPrompt) this.els.systemFontsPrompt.hidden = true;
      const previewCss = await this.controller.registerFilePreview('__file__', file);
      this.familyPicker?.setCustomEntry('__file__', file.name, previewCss);
      this._setVariantOptions(
        [{ postscriptName: '__file__', styleLabel: 'Regular', fullName: file.name }],
        '__file__',
      );
      this.ui.showToast(`Font: ${this.controller.fontLabel}`, 2400, { notification: false });
    } catch (err) {
      console.warn(err);
      this.ui.showToast('Could not parse font file');
    }
    this.updateGenerateState();
    this.schedulePreview();
    this._syncLiveEditorPreviewMode();
  }

  /** Canvas preview drives glyph color; show plain textarea text until a font is loaded. */
  _syncLiveEditorPreviewMode() {
    const wrap = this.els.liveEditor;
    if (!wrap) return;
    const active = !!this.controller.font;
    wrap.classList.toggle('font-extrude-live-editor--preview-active', active);
    if (!active) this._resetTextareaEditorStyles();
  }

  /** @returns {string} */
  _activeFontPostscriptName() {
    return this.els.variant?.value || this.familyPicker?.getValue() || '';
  }

  /** Measure CSS baseline offset from the top of a line box (px). */
  _measureTextareaBaselineOffset(fontFamily, fontSizePx) {
    const font = this.controller.font;
    if (font && (!fontFamily || fontFamily === 'inherit')) {
      const upm = font.unitsPerEm || 1000;
      return (font.ascender / upm) * fontSizePx;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return fontSizePx * 0.75;
    ctx.font = `${fontSizePx}px ${fontFamily}`;
    const metrics = ctx.measureText('Hg');
    if (Number.isFinite(metrics.fontBoundingBoxAscent)) return metrics.fontBoundingBoxAscent;
    if (Number.isFinite(metrics.actualBoundingBoxAscent)) return metrics.actualBoundingBoxAscent;
    return fontSizePx * 0.75;
  }

  /** Drop inline layout overrides so shelf CSS applies before a font loads. */
  _resetTextareaEditorStyles() {
    const ta = this.els.text;
    if (!ta) return;
    for (const prop of [
      'font-family',
      'font-size',
      'line-height',
      'letter-spacing',
      'font-kerning',
      'text-align',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'white-space',
      'overflow-wrap',
    ]) {
      ta.style.removeProperty(prop);
    }
  }

  /**
   * Match textarea metrics to the canvas preview so the caret tracks glyph positions.
   * @param {Awaited<ReturnType<import('../scene/FontExtrudeController.js').FontExtrudeController['layoutTextAsync']>>} layout
   * @param {{ slotLeft: number, slotTop: number, scale: number, bounds: { minX: number, minY: number, maxX: number, maxY: number }, cssW: number, pad: number }} viewport
   */
  async _syncTextareaToPreview(layout, viewport) {
    const ta = this.els.text;
    if (!ta || !this.controller.font) return;

    const options = this.getOptions();
    const { slotLeft, slotTop, scale, bounds, cssW, pad } = viewport;
    const fontSizePx = layout.fontSize * scale;
    const lineHeightPx = layout.fontSize * options.lineHeight * scale;
    const letterSpacingPx = (options.tracking / 1000) * fontSizePx;
    const postscriptName = this._activeFontPostscriptName();
    const fontFamily = postscriptName
      ? await this.controller.getPreviewFontFamily(postscriptName)
      : 'inherit';

    const firstLineY = layout.lines?.[0]?.y ?? layout.fontSize * 0.85;
    const baselineScreenY = slotTop + (firstLineY - bounds.minY) * scale;
    const baselineOffset = this._measureTextareaBaselineOffset(fontFamily, fontSizePx);
    const paddingTop = baselineScreenY - baselineOffset;

    const layoutOriginLeft = slotLeft - bounds.minX * scale;
    const blockWidth = Math.max(layout.maxWidth ?? layout.width ?? 1, 1) * scale;
    const blockLeft = layoutOriginLeft;

    ta.style.fontFamily = fontFamily;
    ta.style.fontSize = `${fontSizePx}px`;
    ta.style.lineHeight = `${lineHeightPx}px`;
    ta.style.letterSpacing = `${letterSpacingPx}px`;
    ta.style.fontKerning = options.kerning === 'none' ? 'none' : 'auto';
    ta.style.textAlign = layout.align;
    ta.style.whiteSpace = 'pre';
    ta.style.overflowWrap = 'normal';
    ta.style.paddingTop = `${paddingTop}px`;
    if (layout.align === 'center') {
      ta.style.paddingLeft = `${blockLeft}px`;
      ta.style.paddingRight = `${Math.max(pad, cssW - blockLeft - blockWidth)}px`;
    } else if (layout.align === 'right') {
      ta.style.paddingLeft = `${Math.max(pad, blockLeft)}px`;
      ta.style.paddingRight = `${pad}px`;
    } else {
      ta.style.paddingLeft = `${blockLeft}px`;
      ta.style.paddingRight = `${pad}px`;
    }
    ta.style.paddingBottom = `${pad}px`;
  }

  /**
   * Shared fit/center transform for canvas preview and textarea caret sync.
   * @param {Awaited<ReturnType<import('../scene/FontExtrudeController.js').FontExtrudeController['layoutTextAsync']>>} layout
   */
  _computePreviewViewport(layout) {
    const cssW = Math.max(1, this._previewCssWidth);
    const cssH = Math.max(1, this._previewCssHeight);
    const userZoom = this.getPreviewScale();
    const pad = this._previewLayoutPad();
    const availW = Math.max(1, cssW - pad * 2);
    const availH = Math.max(1, cssH - pad * 2);
    const bounds = this.controller.getLayoutPreviewBounds(layout);
    const contentW = Math.max(bounds.maxX - bounds.minX, 1);
    const contentH = Math.max(bounds.maxY - bounds.minY, 1);
    const fitScale = Math.min(availW / contentW, availH / contentH);
    const scale = fitScale * userZoom;
    const inkCenterX = (bounds.minX + bounds.maxX) * 0.5;
    const inkCenterY = (bounds.minY + bounds.maxY) * 0.5;
    const slotLeft = pad + availW * 0.5 - (inkCenterX - bounds.minX) * scale;
    let slotTop = pad + availH * 0.5 - (inkCenterY - bounds.minY) * scale;
    const textarea = this.els.text;
    if (textarea) {
      slotTop -= textarea.scrollTop;
    }
    return { slotLeft, slotTop, scale, bounds, cssW, cssH, pad };
  }

  /** Padding used for layout width and preview fit (keep in sync). */
  _previewLayoutPad() {
    return this.getPreviewScale() >= 1 ? 2 : 8;
  }

  getOptions() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const align =
      this.els.align?.value === 'left' || this.els.align?.value === 'right'
        ? this.els.align.value
        : fontState.align === 'left' || fontState.align === 'right'
          ? fontState.align
          : 'center';
    const previewWidth = this._previewCssWidth || this.els.preview?.clientWidth || 520;
    const pad = this._previewLayoutPad();
    return {
      align,
      tracking: Number(this.els.tracking?.value ?? fontState.tracking ?? 0),
      kerning: normalizeFontKerningMode(this.els.kerning?.value ?? fontState.kerning),
      lineHeight: Number(this.els.lineHeight?.value ?? fontState.lineHeight ?? 1),
      detail: normalizeFontExtrudeDetail(this.els.detail?.value ?? fontState.detail ?? 'high'),
      bevelType: normalizeFontBevelType(this.els.bevelType?.value ?? fontState.bevelType),
      fillColor: normalizeGlyphFillHex(
        this.els.fillColor?.value ?? fontState.fillColor ?? '#808080',
      ),
      maxWidth: Math.max(120, previewWidth - pad * 2),
    };
  }

  getPreviewScale() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const value = Number(
      this.els.previewScale?.value ?? fontState.previewScale ?? FontExtrudeUI.PREVIEW_SCALE_DEFAULT,
    );
    const fallback =
      Number.isFinite(value) && value > 0 ? value : FontExtrudeUI.PREVIEW_SCALE_DEFAULT;
    return Math.max(
      FontExtrudeUI.PREVIEW_SCALE_MIN,
      Math.min(FontExtrudeUI.PREVIEW_SCALE_MAX, fallback),
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
      this._syncLiveEditorPreviewMode();
      return;
    }

    this._syncPreviewCanvasSize();

    const text = this.els.text?.value ?? '';
    let layout;
    try {
      layout = await this.controller.layoutTextAsync(text, this.getOptions());
    } catch (err) {
      console.warn('[Orby] Font preview layout failed', err);
      this.clearPreviewCanvas();
      this._syncLiveEditorPreviewMode();
      return;
    }
    if (generation !== this._previewGeneration) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ORBY_BLACK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const viewport = this._computePreviewViewport(layout);
    const { slotLeft, slotTop, scale, bounds, cssW } = viewport;
    const dpr = canvas.width / cssW;
    ctx.save();
    // Paths from opentype.js are already canvas Y-down (glyph Y is negated in getPath).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(slotLeft, slotTop);
    ctx.scale(scale, scale);
    ctx.translate(-bounds.minX, -bounds.minY);
    this.controller.drawPreview(ctx, layout);
    ctx.restore();
    this._syncLiveEditorPreviewMode();
    await this._syncTextareaToPreview(layout, viewport);
    if (generation !== this._previewGeneration) return;

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

  _familyLabelForPostscript(postscriptName) {
    const familyGroup = this._fontFamilyByPostscript.get(postscriptName);
    return familyGroup?.family || postscriptName || '— Select font —';
  }

  _setVariantOptions(variants, selectedPostscript = '') {
    const variantSelect = this.els.variant;
    if (!variantSelect) return;
    const active = selectedPostscript || variantSelect.value || '';
    variantSelect.innerHTML = '';
    for (const variant of variants || []) {
      const option = document.createElement('option');
      option.value = variant.postscriptName;
      option.textContent = variant.styleLabel || variant.fullName || variant.postscriptName;
      if (option.value === active) option.selected = true;
      variantSelect.appendChild(option);
    }
    if (!variantSelect.options.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Regular';
      variantSelect.appendChild(option);
    }
    variantSelect.disabled = variantSelect.options.length <= 1;
  }

  async onGenerate() {
    if (this._generating) return;
    const text = this.els.text?.value ?? '';
    if (!text.trim()) return;
    if (!this.controller.font) {
      this.ui.showToast(
        this.controller.supportsLocalFonts
          ? 'Select a typeface or load a .ttf / .otf file first'
          : 'Load a .ttf or .otf file first — system fonts are unavailable in this browser',
        4200,
        { notification: false },
      );
      return;
    }

    this._generating = true;
    this.updateGenerateState();
    this.els.generate?.classList.add('is-loading');
    this.ui.beginLoadSpinner();

    try {
      const scene = this.getScene();
      if (!scene) {
        throw new Error('Studio is not ready — refresh the page and try again');
      }
      await scene.ensureStudioReady();
      const group = await this.controller.generateMesh(text, this.getOptions());
      const added = await this.controller.addToScene(group);
      if (!added) return;
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
