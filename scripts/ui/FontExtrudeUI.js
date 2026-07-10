import { ORBY_BLACK } from '../constants.js';
import { normalizeFontExtrudeDetail } from '../import/fontExtrudeSampling.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import { FontExtrudeController } from '../scene/FontExtrudeController.js';
import { FontFamilyPicker } from './FontFamilyPicker.js';
import {
  bindExtrudeBevelControls,
  bindSvgExtrudeControls,
  syncSvgExtrudeControls,
  FONT_EXTRUDE_POST_GEN_CONTROLS_HTML,
  FONT_EXTRUDE_SHAPE_CONTROLS_HTML,
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
  isFontRevealAnimationActive,
  normalizeFontRevealSlideDirection,
  normalizeFontRevealStaggerEasing,
  normalizeFontRevealType,
  normalizeFontRevealUnit,
} from '../scene/fontTextRevealTypes.js';
import {
  clampFontTrackingAnimatorAmountPercent,
  clampFontTrackingAnimatorTimeSec,
  clampFontTrackingValue,
  computeTrackingAnimatorAmountFromPercent,
  DEFAULT_FONT_TRACKING_ANIMATOR_AMOUNT_PERCENT,
  DEFAULT_FONT_TRACKING_ANIMATOR_TIME_SEC,
  isFontTrackingAnimatorModel,
  MAX_FONT_TRACKING_VALUE,
  MIN_FONT_TRACKING_VALUE,
  normalizeFontLineHeight,
  normalizeFontTrackingAnimatorEnabled,
  normalizeFontTrackingAnimatorEasing,
  resolveFontTrackingAnimatorAmountPercent,
} from '../scene/fontTextTrackingAnimation.js';
import {
  composeExportMovementEasing,
  parseExportMovementEasing,
} from '../render/exportMovementEasing.js';
import {
  clampFontConstantIntensityForType,
  clampFontConstantSpeedSec,
  clampFontConstantSpread,
  DEFAULT_FONT_CONSTANT_INTENSITY,
  DEFAULT_FONT_CONSTANT_SPEED_SEC,
  DEFAULT_FONT_CONSTANT_SPREAD,
  DEFAULT_FONT_CONSTANT_TYPE,
  fontConstantTypeUsesSpread,
  formatFontConstantIntensityLabel,
  isFontConstantAnimationActive,
  isFontConstantSpinType,
  isFontConstantVerticalType,
  MAX_FONT_CONSTANT_VERTICAL_INTENSITY,
  MAX_FONT_CONSTANT_INTENSITY,
  normalizeFontConstantType,
} from '../scene/fontTextConstantTypes.js';
import {
  DEFAULT_FONT_KERNING_MODE,
  normalizeFontKerningMode,
} from '../scene/fontKerning.js';
import {
  clampFontCircularWrapArcDeg,
  DEFAULT_FONT_CIRCULAR_WRAP_ARC_DEG,
  DEFAULT_FONT_CIRCULAR_WRAP_ENABLED,
  DEFAULT_FONT_CIRCULAR_WRAP_MODE,
  drawCircularArcSpanPreviewIndicator,
  normalizeFontCircularWrapEnabled,
  normalizeFontCircularWrapMode,
} from '../scene/fontCircularLayout.js';
import { arrayBufferToBase64, fileFromEmbeddedAsset } from '../utils/binaryAsset.js';

/**
 * Object panel — Type Creator (2D preview + extrude).
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
    /** Skip controller sync on first constant UI hydrate; set after first pass. */
    this._lastConstantSettingsSignature = null;
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
          <span>Type Creator</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label class="effect-toggle" data-tooltip="Show or hide Type Creator controls">
              <input type="checkbox" id="fontExtrudePanelOpen" />
              <span class="effect-indicator" aria-hidden="true"></span>
              <span class="sr-only">Show Type Creator</span>
            </label>
          </div>
        </div>
        <div
          class="effect-foldout effect-foldout--collapsed effect-foldout--xl"
          data-effect-foldout="font-extrude"
          aria-hidden="true"
        >
          <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-typography">
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
          <div class="panel-block-divider" aria-hidden="true"></div>
          <div class="block-title font-extrude-section-title has-reset">
            <span>Typography</span>
            <button
              type="button"
              class="block-reset-btn"
              data-reset="font-extrude-typography"
              aria-label="Reset Typography"
              data-tooltip="Reset Typography settings"
            >
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              <span class="sr-only">Reset Typography</span>
            </button>
          </div>
          <div id="fontExtrudeSystemFontsPrompt" class="font-extrude-system-fonts-prompt" hidden>
            <button
              type="button"
              id="fontExtrudeAllowSystemFonts"
              class="accent-action-btn font-extrude-allow-system-fonts-btn"
              data-tooltip="Your browser will ask to access fonts installed on this device"
              data-tooltip-safari="Choose your Fonts folder (Library → Fonts) to browse installed typefaces"
            >
              <i class="fa-solid fa-font" aria-hidden="true"></i>
              <span>Allow system fonts…</span>
            </button>
            <input
              type="file"
              id="fontExtrudeDirectoryFonts"
              class="sr-only"
              webkitdirectory
              multiple
              accept=".ttf,.otf,.ttc,font/*"
            />
          </div>
          <label class="select-line font-extrude-family-line font-extrude-typo-family-line">
            <span data-tooltip="Click Allow system fonts, or open this list after permission is granted">Typeface</span>
            <div id="fontExtrudeFamilyPicker" class="font-extrude-family-picker" aria-label="Font family"></div>
          </label>
          <label class="select-line font-extrude-style-line">
            <span data-tooltip="Choose weight available for the selected typeface">Weight</span>
            <select id="fontExtrudeVariant" aria-label="Typeface weight">
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
          <label class="select-line font-extrude-align-line" id="fontExtrudeAlignLine">
            <span data-tooltip="Horizontal alignment of each line">Align</span>
            <select id="fontExtrudeAlign" aria-label="Text alignment">
              <option value="left" selected>Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label class="slider-line">
            <span data-tooltip="Letter-spacing in thousandths of an em">Letter Spacing</span>
            <input id="fontExtrudeTracking" type="range" min="${MIN_FONT_TRACKING_VALUE}" max="${MAX_FONT_TRACKING_VALUE}" step="1" value="0" />
            <span class="value" data-output="fontExtrudeTracking">0</span>
          </label>
          <label class="slider-line">
            <span data-tooltip="Vertical gap between lines (use Enter in the text box for new lines)">Line Height</span>
            <input id="fontExtrudeLineHeight" type="range" min="0.1" max="2.5" step="0.05" value="1" />
            <span class="value" data-output="fontExtrudeLineHeight">1.00×</span>
          </label>
          <div class="export-controls font-extrude-action-row">
            <div id="fontExtrudeFileFallback" class="font-extrude-file-fallback">
              <input type="file" id="fontExtrudeFile" class="sr-only" accept=".ttf,.otf,.woff,.woff2,font/*" />
              <button
                type="button"
                id="fontExtrudeFileBtn"
                class="accent-action-btn font-extrude-file-btn"
                data-tooltip="Load a font file directly. Use this for fonts that don't show up in the list above — e.g. several styles that share one family name."
              >
                <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                <span>Load .ttf / .otf…</span>
              </button>
            </div>
            <button type="button" id="fontExtrudeGenerate" class="accent-action-btn font-extrude-generate" disabled data-tooltip="Extrude preview text into a 3D mesh">
              <i class="fa-solid fa-cube" aria-hidden="true"></i>
              <span>Generate 3D Text</span>
            </button>
          </div>
          </div>
          <div class="panel-block-divider" aria-hidden="true"></div>
          <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-appearance">
          <div class="block-title font-extrude-section-title has-reset">
            <span>Appearance</span>
            <button
              type="button"
              class="block-reset-btn"
              data-reset="font-extrude-appearance"
              aria-label="Reset Appearance"
              data-tooltip="Reset Appearance settings"
            >
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              <span class="sr-only">Reset Appearance</span>
            </button>
          </div>
          <label class="color-line font-extrude-fill-color">
            <span data-tooltip="Front faces and bevels on generated 3D text">Face color</span>
            <input type="color" id="fontExtrudeFillColor" class="color-chip" value="#808080" />
          </label>
          <label class="color-line font-extrude-extrude-color">
            <span data-tooltip="Extruded side walls and depth — pick a contrasting color for two-tone type">Extrude color</span>
            <input type="color" id="fontExtrudeExtrudeColor" class="color-chip" value="#808080" />
          </label>
          </div>
          ${FONT_EXTRUDE_SHAPE_CONTROLS_HTML}
          <div class="panel-block-divider font-extrude-circular-divider" aria-hidden="true"></div>
          <div class="font-extrude-reset-scope" data-reset-scope="font-extrude-circular-wrap">
          <div class="block-title font-extrude-section-title font-extrude-circular-title has-reset">
            <span>Circular wrap</span>
            <button
              type="button"
              class="block-reset-btn"
              data-reset="font-extrude-circular-wrap"
              aria-label="Reset Circular wrap"
              data-tooltip="Reset Circular wrap settings"
            >
              <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
              <span class="sr-only">Reset Circular wrap</span>
            </button>
          </div>
          <label class="slider-line slider-line--toggle-only font-extrude-circular-wrap-line">
            <span class="block-title-name">
              <span data-tooltip="Arrange letters on a circular arc (uses the first line only). Auto mode fits the full string into a 360° ring.">Wrap on circle</span>
              <span
                class="dev-badge"
                data-tooltip="Heads up, some fonts can become weird — Working on it"
                tabindex="0"
                role="img"
                aria-label="Heads up, some fonts can become weird — Working on it"
              ><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i></span>
            </span>
            <label class="effect-toggle">
              <input type="checkbox" id="fontExtrudeCircularWrapEnabled" />
              <span class="effect-indicator" aria-hidden="true"></span>
              <span class="sr-only">Wrap text on a circle</span>
            </label>
          </label>
          <div id="fontExtrudeCircularWrapControls" class="font-extrude-circular-wrap-controls" hidden>
            <label class="select-line font-extrude-circular-mode-line">
              <span data-tooltip="Auto sizes the ring so your text spans a full circle. Manual sets how much of the circle to use.">Wrap mode</span>
              <select id="fontExtrudeCircularWrapMode" aria-label="Circular wrap mode">
                <option value="auto" selected>Full circle (auto)</option>
                <option value="manual">Manual arc</option>
              </select>
            </label>
            <label class="slider-line font-extrude-circular-arc-line" id="fontExtrudeCircularArcLine" hidden>
              <span data-tooltip="How much of the circle the text spans — smaller values tighten the bend">Arc span</span>
              <input id="fontExtrudeCircularWrapArc" type="range" min="30" max="360" step="1" value="360" />
              <span class="value" data-output="fontExtrudeCircularWrapArc">360°</span>
            </label>
          </div>
          </div>
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
      directoryFontsInput: block.querySelector('#fontExtrudeDirectoryFonts'),
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
      alignLine: block.querySelector('#fontExtrudeAlignLine'),
      lineHeightLine: block.querySelector('#fontExtrudeLineHeight')?.closest('.slider-line'),
      circularWrapEnabled: block.querySelector('#fontExtrudeCircularWrapEnabled'),
      circularWrapControls: block.querySelector('#fontExtrudeCircularWrapControls'),
      circularWrapMode: block.querySelector('#fontExtrudeCircularWrapMode'),
      circularWrapArc: block.querySelector('#fontExtrudeCircularWrapArc'),
      circularArcLine: block.querySelector('#fontExtrudeCircularArcLine'),
      postGen: block.querySelector('#fontExtrudePostGen'),
      meshDepth: block.querySelector('#fontExtrudeMeshDepth'),
      meshAngle: block.querySelector('#fontExtrudeMeshAngle'),
      hardEdgeAngle: block.querySelector('#fontExtrudeHardEdgeAngle'),
      bevelAmount: block.querySelector('#fontExtrudeBevelAmount'),
      fillColor: block.querySelector('#fontExtrudeFillColor'),
      extrudeColor: block.querySelector('#fontExtrudeExtrudeColor'),
      revealDuration: block.querySelector('#fontExtrudeRevealDuration'),
      revealStaggerEasingFamily: block.querySelector('#fontExtrudeRevealStaggerEasingFamily'),
      revealStaggerEasingType: block.querySelector('#fontExtrudeRevealStaggerEasingType'),
      revealStaggerEasingTypeLine: block.querySelector('#fontExtrudeRevealStaggerEasingTypeLine'),
      revealSlideDepth: block.querySelector('#fontExtrudeRevealSlideDepth'),
      revealSlideTime: block.querySelector('#fontExtrudeRevealSlideTime'),
      revealSlideDirection: block.querySelector('#fontExtrudeRevealSlideDirection'),
      revealEmissiveSlam: block.querySelector('#fontExtrudeRevealEmissiveSlam'),
      revealEmissiveStrength: block.querySelector('#fontExtrudeRevealEmissiveStrength'),
      revealEmissiveDecay: block.querySelector('#fontExtrudeRevealEmissiveDecay'),
      revealEmissiveColor: block.querySelector('#fontExtrudeRevealEmissiveColor'),
      revealType: block.querySelector('#fontExtrudeRevealType'),
      revealUnit: block.querySelector('#fontExtrudeRevealUnit'),
      trackingAnimatorEnabled: block.querySelector('#fontExtrudeTrackingAnimatorEnabled'),
      trackingAnimatorAmountStart: block.querySelector('#fontExtrudeTrackingAnimatorAmountStart'),
      trackingAnimatorTime: block.querySelector('#fontExtrudeTrackingAnimatorTime'),
      trackingAnimatorEasingFamily: block.querySelector('#fontExtrudeTrackingAnimatorEasingFamily'),
      trackingAnimatorEasingType: block.querySelector('#fontExtrudeTrackingAnimatorEasingType'),
      trackingAnimatorEasingTypeLine: block.querySelector('#fontExtrudeTrackingAnimatorEasingTypeLine'),
      revealPlay: document.querySelector('#fontExtrudeRevealPlay'),
      revealLoop: document.querySelector('#fontExtrudeRevealLoop'),
      revealScrub: document.querySelector('#fontExtrudeRevealScrub'),
      revealTime: document.querySelector('#fontExtrudeRevealTime'),
      pauseAllAnimations: document.querySelector('#fontExtrudePauseAllAnimations'),
      resetAnimations: document.querySelector('#fontExtrudeResetAnimations'),
      constantType: block.querySelector('#fontExtrudeConstantType'),
      constantIntensity: block.querySelector('#fontExtrudeConstantIntensity'),
      constantSpeed: block.querySelector('#fontExtrudeConstantSpeed'),
      constantSpread: block.querySelector('#fontExtrudeConstantSpread'),
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
      this.ui.syncFontExtrudeAnimationPreviewDock?.();
      if (open) {
        if (this.controller.supportsLocalFonts) {
          this._primeLocalFontAccess();
          void this.ensureFontsReady({ fromUserGesture: true }).then(() => {
            this._syncPreviewCanvasSize();
            this.schedulePreview();
            this._syncLiveEditorPreviewMode();
          });
        } else {
          this._syncSystemFontsPromptVisibility();
        }
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
      if (this.controller.usesSafariDirectoryFonts) {
        els.directoryFontsInput?.click();
        return;
      }
      this.controller.resetLocalFontAccessQuery();
      this._fontsInitialized = false;
      this._fontsLoadPromise = null;
      this._primeLocalFontAccess();
      void this.ensureFontsReady({ fromUserGesture: true });
    });
    els.directoryFontsInput?.addEventListener('change', () => {
      void this.onDirectoryFontsSelected();
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
      const value = clampFontTrackingValue(Number(els.tracking.value));
      els.tracking.value = String(value);
      this.stateStore.set('fontExtrude.tracking', value);
      this.ui.updateValueLabel('fontExtrudeTracking', value, 'integer');
      this.ui.updateSliderFill?.(els.tracking);
      this.schedulePreview();
      if (this._hasFontMesh() && !this._isCircularFontModel()) {
        this._withRevealController((controller, model) => {
          if (controller.ensureBoundToModel(model)) {
            controller.onTypographyTrackingChange?.(model);
          }
        });
        this._syncTrackingAnimatorControls();
      }
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
      if (this._hasFontMesh() && !this._isCircularFontModel()) {
        this._withRevealController((controller, model) => {
          if (controller.ensureBoundToModel(model)) {
            controller.onTypographyLineHeightChange?.(model);
          }
        });
      }
    });
    els.detail?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontExtrudeDetail(els.detail.value);
      this.stateStore.set('fontExtrude.detail', value);
      this.stateStore.set('svgExtrude.detail', value);
      this.eventBus.emit('mesh:svg-extrude-detail', value);
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
      if (this._hasFontMesh() && !this._isCircularFontModel()) {
        this._withRevealController((controller, model) => {
          if (controller.ensureBoundToModel(model)) {
            controller.onTypographyAlignChange?.(model);
          }
        });
      }
    });
    els.circularWrapEnabled?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const enabled = !!els.circularWrapEnabled.checked;
      if (enabled && normalizeFontTrackingAnimatorEnabled(
        this.stateStore.getState()?.fontExtrude?.trackingAnimatorEnabled,
      )) {
        els.circularWrapEnabled.checked = false;
        this.ui.showToast('Turn off tracking animator before using circular wrap');
        return;
      }
      this.stateStore.set('fontExtrude.circularWrapEnabled', enabled);
      this._syncCircularWrapControlsVisibility();
      this._syncTrackingAnimatorControls();
      this.schedulePreview();
    });
    els.circularWrapMode?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const mode = normalizeFontCircularWrapMode(els.circularWrapMode.value);
      this.stateStore.set('fontExtrude.circularWrapMode', mode);
      this._syncCircularWrapControlsVisibility();
      this.schedulePreview();
    });
    els.circularWrapArc?.addEventListener('input', () => {
      const value = clampFontCircularWrapArcDeg(els.circularWrapArc.value);
      this.stateStore.set('fontExtrude.circularWrapArcDeg', value);
      this.ui.updateValueLabel('fontExtrudeCircularWrapArc', `${value}°`);
      this.schedulePreview();
    });
    els.generate?.addEventListener('click', () => {
      void this.onGenerate();
    });

    bindSvgExtrudeControls(this._fontExtrudeCtx());
    bindExtrudeBevelControls(this._fontExtrudeCtx());

    const onFillColorChange = () => {
      const fillColor = normalizeGlyphFillHex(els.fillColor?.value);
      const extrudeColor = normalizeGlyphFillHex(
        els.extrudeColor?.value ?? this.stateStore.getState()?.fontExtrude?.extrudeColor,
      );
      this.stateStore.set('fontExtrude.fillColor', fillColor);
      this.stateStore.set('svgExtrude.availableColors', [fillColor]);
      this.getScene()?.applyFontExtrudeColors?.(fillColor, extrudeColor);
      this.schedulePreview();
    };
    const onExtrudeColorChange = () => {
      const extrudeColor = normalizeGlyphFillHex(els.extrudeColor?.value);
      const fillColor = normalizeGlyphFillHex(
        els.fillColor?.value ?? this.stateStore.getState()?.fontExtrude?.fillColor,
      );
      this.stateStore.set('fontExtrude.extrudeColor', extrudeColor);
      this.getScene()?.applyFontExtrudeColors?.(fillColor, extrudeColor);
      this.schedulePreview();
    };
    els.fillColor?.addEventListener('input', onFillColorChange);
    els.fillColor?.addEventListener('change', onFillColorChange);
    els.extrudeColor?.addEventListener('input', onExtrudeColorChange);
    els.extrudeColor?.addEventListener('change', onExtrudeColorChange);

    els.revealDuration?.addEventListener('input', () => {
      const value = clampFontRevealDurationSec(els.revealDuration.value);
      this.stateStore.set('fontExtrude.revealDurationSec', value);
      this.ui.updateValueLabel('fontExtrudeRevealDuration', `${value.toFixed(1)}s`);
      this._withRevealController((controller, model) => {
        controller.onDurationChange?.(model);
      });
    });

    const applyRevealStaggerEasingFromUi = () => {
      const familySelect = els.revealStaggerEasingFamily;
      const typeSelect = els.revealStaggerEasingType;
      if (!familySelect || !typeSelect) return;
      this.stateStore.set(
        'fontExtrude.revealStaggerEasing',
        composeExportMovementEasing(familySelect.value, typeSelect.value),
      );
      this._syncRevealStaggerEasingControls();
      this._withRevealController((controller, model) => {
        controller.onRevealTimingChange?.(model);
      });
    };

    els.revealStaggerEasingFamily?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      applyRevealStaggerEasingFromUi();
    });

    els.revealStaggerEasingType?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      applyRevealStaggerEasingFromUi();
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

    const onTrackingAnimatorChange = (options = {}) => {
      this._withRevealController((controller, model) => {
        if (!controller.ensureBoundToModel(model)) {
          this.ui.showToast('Generate 3D text first to preview tracking');
          return;
        }
        const trackingEnabled = normalizeFontTrackingAnimatorEnabled(
          this.stateStore.getState()?.fontExtrude?.trackingAnimatorEnabled,
        );
        if (trackingEnabled) {
          if (!isFontTrackingAnimatorModel(model)) {
            this.ui.showToast('Tracking animator needs straight 3D text — not circular wrap');
            return;
          }
          if (controller.getGlyphCount() <= 1) {
            this.ui.showToast('Amount Start needs at least two letters');
            return;
          }
        }
        const inPreview =
          controller.isPreviewPlaying?.() || controller.isPreviewPaused?.();
        const resolved = { ...options };
        if (inPreview) {
          delete resolved.pinTrackingAmountPreview;
        }
        controller.onTrackingAnimatorChange?.(model, resolved);
      });
      this._syncAnimationTransportButtons(this.stateStore.getState());
    };

    els.trackingAnimatorEnabled?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const enabled = !!els.trackingAnimatorEnabled.checked;
      if (enabled && normalizeFontCircularWrapEnabled(
        this.els.circularWrapEnabled?.checked ?? this.stateStore.getState()?.fontExtrude?.circularWrapEnabled,
      )) {
        els.trackingAnimatorEnabled.checked = false;
        this.ui.showToast('Turn off circular wrap before using tracking animator');
        return;
      }
      if (enabled && !isFontTrackingAnimatorModel(this.getScene()?.currentModel)) {
        if (this._isCircularFontModel()) {
          els.trackingAnimatorEnabled.checked = false;
          this.ui.showToast('Tracking animator is not available for circular wrap');
          return;
        }
      }
      this.stateStore.set('fontExtrude.trackingAnimatorEnabled', enabled);
      this._syncTrackingAnimatorControls();
      this._withRevealController((controller, model) => {
        const inPreview = controller.isPreviewPlaying?.() || controller.isPreviewPaused?.();
        onTrackingAnimatorChange(enabled && inPreview ? { resetPreview: true } : {});
      });
    });

    els.trackingAnimatorAmountStart?.addEventListener('input', () => {
      const value = clampFontTrackingAnimatorAmountPercent(els.trackingAnimatorAmountStart.value);
      els.trackingAnimatorAmountStart.value = String(value);
      this.stateStore.set('fontExtrude.trackingAnimatorAmountPercent', value);
      this.ui.updateValueLabel('fontExtrudeTrackingAnimatorAmountStart', `${value}%`);
      this.ui.updateSliderFill?.(els.trackingAnimatorAmountStart);
      onTrackingAnimatorChange({ pinTrackingAmountPreview: true });
    });

    /** First input after pointerdown restarts tracking; later inputs only retime during play. */
    let trackingTimePlayDragArmed = false;
    els.trackingAnimatorTime?.addEventListener('pointerdown', () => {
      this._withRevealController((controller) => {
        trackingTimePlayDragArmed = !!controller.isPreviewPlaying?.();
      });
    });
    const clearTrackingTimePlayDragArm = () => {
      trackingTimePlayDragArmed = false;
    };
    els.trackingAnimatorTime?.addEventListener('pointerup', clearTrackingTimePlayDragArm);
    els.trackingAnimatorTime?.addEventListener('pointercancel', clearTrackingTimePlayDragArm);
    els.trackingAnimatorTime?.addEventListener('blur', clearTrackingTimePlayDragArm);

    els.trackingAnimatorTime?.addEventListener('input', () => {
      const value = clampFontTrackingAnimatorTimeSec(els.trackingAnimatorTime.value);
      this.stateStore.set('fontExtrude.trackingAnimatorTimeSec', value);
      this.ui.updateValueLabel('fontExtrudeTrackingAnimatorTime', `${value.toFixed(1)}s`);
      this._withRevealController((controller) => {
        const inPreview =
          controller.isPreviewPlaying?.() || controller.isPreviewPaused?.();
        if (inPreview) {
          if (controller.isPreviewPlaying?.() && trackingTimePlayDragArmed) {
            trackingTimePlayDragArmed = false;
            onTrackingAnimatorChange({ resetTrackingClock: true });
          } else {
            onTrackingAnimatorChange({});
          }
          return;
        }
        onTrackingAnimatorChange({ resetTrackingClock: true, pinTrackingAmountPreview: true });
      });
    });

    const applyTrackingAnimatorEasingFromUi = () => {
      const familySelect = els.trackingAnimatorEasingFamily;
      const typeSelect = els.trackingAnimatorEasingType;
      if (!familySelect || !typeSelect) return;
      this.stateStore.set(
        'fontExtrude.trackingAnimatorEasing',
        composeExportMovementEasing(familySelect.value, typeSelect.value),
      );
      this._syncTrackingAnimatorEasingControls();
      onTrackingAnimatorChange({ resetTrackingClock: true, pinTrackingAmountPreview: true });
    };

    els.trackingAnimatorEasingFamily?.addEventListener('change', () => {
      applyTrackingAnimatorEasingFromUi();
    });

    els.trackingAnimatorEasingType?.addEventListener('change', () => {
      applyTrackingAnimatorEasingFromUi();
    });

    els.revealPlay?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      if (this.stateStore.getState()?.fontExtrude?.pauseAllAnimations) {
        this.ui.showToast('Resume all to continue animation playback');
        return;
      }
      this._withRevealController((controller, model) => {
        if (!controller.ensureBoundToModel(model)) {
          this.ui.showToast('Reveal needs 3D text — click Generate 3D Text first');
          return;
        }
        if (!controller.isPreviewAnimationActive?.()) {
          const fontState = this.stateStore.getState()?.fontExtrude || {};
          if (
            normalizeFontTrackingAnimatorEnabled(fontState.trackingAnimatorEnabled)
            && !isFontTrackingAnimatorModel(model)
          ) {
            this.ui.showToast('Tracking animator needs straight 3D text — not circular wrap');
          } else if (
            normalizeFontTrackingAnimatorEnabled(fontState.trackingAnimatorEnabled)
            && computeTrackingAnimatorAmountFromPercent(
              fontState.tracking,
              fontState.trackingAnimatorAmountPercent,
            ) <= 1e-6
          ) {
            this.ui.showToast('Set Amount Start above 0 to preview tracking');
          } else if (!isFontRevealAnimationActive(controller.getRevealType?.())) {
            this.ui.showToast('Pick a reveal type, enable tracking animator, or add looping motion');
          } else if (controller.getDurationSec() <= 0) {
            this.ui.showToast('Set reveal duration above 0 to preview');
          }
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

    els.pauseAllAnimations?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      const next = !this.stateStore.getState()?.fontExtrude?.pauseAllAnimations;
      this.stateStore.set('fontExtrude.pauseAllAnimations', next);
      this._applyPauseAll(next);
      this._syncAnimationTransportButtons(this.stateStore.getState());
    });

    els.resetAnimations?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect();
      this._withRevealController((controller, model) => {
        if (!controller.ensureBoundToModel(model)) {
          this.ui.showToast('Reset needs 3D text — click Generate 3D Text first');
          return;
        }
        controller.resetAllAnimations?.();
      });
      this._syncAnimationTransportButtons(this.stateStore.getState());
    });

    els.constantType?.addEventListener('change', () => {
      this.ui.uiSounds?.playSelect();
      const value = normalizeFontConstantType(els.constantType.value);
      this.stateStore.set('fontExtrude.constantType', value);
      this._syncConstantControlsVisibility();
      this._withConstantController((controller, model) => {
        controller.onSettingsChange?.(model);
      });
    });

    els.constantIntensity?.addEventListener('input', () => {
      const type = normalizeFontConstantType(els.constantType?.value);
      const value = clampFontConstantIntensityForType(type, els.constantIntensity.value);
      this.stateStore.set('fontExtrude.constantIntensity', value);
      this.ui.updateValueLabel(
        'fontExtrudeConstantIntensity',
        formatFontConstantIntensityLabel(type, value),
      );
      this._withConstantController((controller, model) => {
        controller.onSettingsChange?.(model);
      });
    });

    els.constantSpeed?.addEventListener('input', () => {
      const value = clampFontConstantSpeedSec(els.constantSpeed.value);
      this.stateStore.set('fontExtrude.constantSpeedSec', value);
      this.ui.updateValueLabel('fontExtrudeConstantSpeed', `${value.toFixed(1)}s`);
      this._withConstantController((controller, model) => {
        controller.onSettingsChange?.(model);
      });
    });

    els.constantSpread?.addEventListener('input', () => {
      const value = clampFontConstantSpread(els.constantSpread.value);
      this.stateStore.set('fontExtrude.constantSpread', value);
      this.ui.updateValueLabel('fontExtrudeConstantSpread', `${Math.round(value * 100)}%`);
      this._withConstantController((controller, model) => {
        controller.onSettingsChange?.(model);
      });
    });

    this._onRevealPreviewTime = (payload) => this.syncRevealPreviewControls(payload);
    this._attachRevealPreviewCallback();

    this._stateUnsub = this.stateStore.subscribe((state) => this.syncFromState(state));

    this._onFontGenerated = () => {
      if (this.stateStore.getState()?.fontExtrude?.pauseAllAnimations) {
        this.stateStore.set('fontExtrude.pauseAllAnimations', false);
        this._applyPauseAll(false);
      }
      this.syncPostGenControlsVisibility();
    };
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

  /** Used by shelf preview dock visibility (separate from Object → Animation GLB transport). */
  hasFontMeshForPreviewDock() {
    return this._hasFontMesh();
  }

  syncPostGenControlsVisibility() {
    const show = this._hasFontMesh();
    if (this.els.postGen) {
      this.els.postGen.hidden = !show;
    }
    if (show) {
      this._attachRevealPreviewCallback();
      this.syncRevealPreviewControlsFromController();
      this._syncTrackingAnimatorControls();
    }
    this._syncAnimationTransportButtons(this.stateStore.getState());
    this.ui.syncFontExtrudeAnimationPreviewDock?.();
    this.ui.meshControls?.sync?.(this.stateStore.getState());
  }

  _fontAnimationPauseAllAvailable() {
    const reveal = this._revealController();
    const constant = this._constantController();
    return (
      this._hasFontMesh()
      && (
        reveal?.isEnabled?.()
        || reveal?.isTrackingAnimatorActive?.()
        || constant?.isEnabled?.()
      )
    );
  }

  _isCircularFontModel() {
    const model = this.getScene()?.currentModel;
    return !!(model?.userData?.orbyFontCircularWrap);
  }

  _getMasterTrackingForUi() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const fromState = Number(fontState.tracking);
    if (Number.isFinite(fromState)) return fromState;
    const model = this.getScene()?.currentModel;
    const fromModel = Number(model?.userData?.orbyFontGeneratedTracking);
    return Number.isFinite(fromModel) ? fromModel : 0;
  }

  _syncRevealStaggerEasingControls() {
    const { els } = this;
    const familySelect = els.revealStaggerEasingFamily;
    const typeSelect = els.revealStaggerEasingType;
    const typeLine = els.revealStaggerEasingTypeLine;
    if (!familySelect || !typeSelect) return;

    const parsed = parseExportMovementEasing(
      normalizeFontRevealStaggerEasing(
        this.stateStore.getState()?.fontExtrude?.revealStaggerEasing,
      ),
    );
    const easing = composeExportMovementEasing(parsed.family, parsed.type);
    if (this.stateStore.getState()?.fontExtrude?.revealStaggerEasing !== easing) {
      this.stateStore.set('fontExtrude.revealStaggerEasing', easing);
    }
    if (document.activeElement !== familySelect) {
      familySelect.value = parsed.family;
    }
    if (document.activeElement !== typeSelect) {
      typeSelect.value = parsed.type;
    }

    const typeActive = parsed.family !== 'linear';
    typeLine?.classList.toggle('is-muted', !typeActive);
    typeSelect.disabled = !typeActive;
    typeSelect.classList.toggle('is-disabled', !typeActive);
  }

  _syncTrackingAnimatorEasingControls() {
    const { els } = this;
    const familySelect = els.trackingAnimatorEasingFamily;
    const typeSelect = els.trackingAnimatorEasingType;
    const typeLine = els.trackingAnimatorEasingTypeLine;
    if (!familySelect || !typeSelect) return;

    const parsed = parseExportMovementEasing(
      normalizeFontTrackingAnimatorEasing(
        this.stateStore.getState()?.fontExtrude?.trackingAnimatorEasing,
      ),
    );
    const easing = composeExportMovementEasing(parsed.family, parsed.type);
    if (this.stateStore.getState()?.fontExtrude?.trackingAnimatorEasing !== easing) {
      this.stateStore.set('fontExtrude.trackingAnimatorEasing', easing);
    }
    if (document.activeElement !== familySelect) {
      familySelect.value = parsed.family;
    }
    if (document.activeElement !== typeSelect) {
      typeSelect.value = parsed.type;
    }

    const typeActive = parsed.family !== 'linear';
    typeLine?.classList.toggle('is-muted', !typeActive);
    typeSelect.disabled = !typeActive;
    typeSelect.classList.toggle('is-disabled', !typeActive);
  }

  _syncTrackingAnimatorControls() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const circularModel = this._isCircularFontModel();
    const circularUiEnabled = normalizeFontCircularWrapEnabled(
      this.els.circularWrapEnabled?.checked ?? fontState.circularWrapEnabled,
    );
    const trackingUiEnabled = normalizeFontTrackingAnimatorEnabled(fontState.trackingAnimatorEnabled);
    const trackingAvailable = this._hasFontMesh() && !circularModel;
    const masterTracking = this._getMasterTrackingForUi();
    const amountPercent = resolveFontTrackingAnimatorAmountPercent(fontState, masterTracking);
    const timeValue = clampFontTrackingAnimatorTimeSec(
      fontState.trackingAnimatorTimeSec ?? DEFAULT_FONT_TRACKING_ANIMATOR_TIME_SEC,
    );

    if (this.els.trackingAnimatorEnabled) {
      this.els.trackingAnimatorEnabled.checked = trackingUiEnabled && trackingAvailable;
      this.els.trackingAnimatorEnabled.disabled = !trackingAvailable || circularUiEnabled;
    }

    if (this.els.trackingAnimatorAmountStart) {
      if (document.activeElement !== this.els.trackingAnimatorAmountStart) {
        this.els.trackingAnimatorAmountStart.value = String(amountPercent);
      }
      this.els.trackingAnimatorAmountStart.disabled = !trackingAvailable || !trackingUiEnabled;
      if (document.activeElement !== this.els.trackingAnimatorAmountStart) {
        this.ui.updateValueLabel('fontExtrudeTrackingAnimatorAmountStart', `${amountPercent}%`);
      }
      this.ui.updateSliderFill?.(this.els.trackingAnimatorAmountStart);
    }

    if (this.els.trackingAnimatorTime) {
      if (document.activeElement !== this.els.trackingAnimatorTime) {
        this.els.trackingAnimatorTime.value = String(timeValue);
      }
      this.els.trackingAnimatorTime.disabled = !trackingAvailable || !trackingUiEnabled;
      if (document.activeElement !== this.els.trackingAnimatorTime) {
        this.ui.updateValueLabel('fontExtrudeTrackingAnimatorTime', `${timeValue.toFixed(1)}s`);
      }
    }

    for (const el of [
      this.els.trackingAnimatorAmountStart,
      this.els.trackingAnimatorTime,
      this.els.trackingAnimatorEasingFamily,
      this.els.trackingAnimatorEasingType,
    ]) {
      el?.closest('.font-extrude-tracking-animator-detail')
        ?.toggleAttribute('hidden', !trackingAvailable || !trackingUiEnabled);
    }

    if (this.els.circularWrapEnabled) {
      this.els.circularWrapEnabled.disabled = trackingUiEnabled;
    }

    if (
      trackingUiEnabled
      && !trackingAvailable
      && this.stateStore.getState()?.fontExtrude?.trackingAnimatorEnabled
    ) {
      this.stateStore.set('fontExtrude.trackingAnimatorEnabled', false);
    }

    this._syncTrackingAnimatorEasingControls();
  }

  _applyPauseAll(active) {
    this._withRevealController((controller, model) => {
      controller.applyPauseAll?.(active, model);
    });
  }

  _fontAnimationControlsAvailable() {
    return this._fontAnimationPauseAllAvailable();
  }

  _syncAnimationTransportButtons(state) {
    this._syncPauseAllButton(state);
    const { els } = this;
    if (!els.resetAnimations) return;
    const available = this._fontAnimationControlsAvailable();
    els.resetAnimations.disabled = !available;
  }

  _syncPauseAllButton(state) {
    const { els } = this;
    if (!els.pauseAllAnimations) return;
    const paused = !!state?.fontExtrude?.pauseAllAnimations;
    const available = this._fontAnimationPauseAllAvailable();
    els.pauseAllAnimations.disabled = !available;
    els.pauseAllAnimations.classList.toggle('active', paused);
    els.pauseAllAnimations.textContent = paused ? 'Resume all' : 'Pause all';
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
      duration: controller.getPreviewDurationSec?.() ?? controller.getDurationSec?.() ?? 0,
      playing: controller.isPreviewPlaying?.() ?? false,
    });
  }

  /**
   * @param {{ elapsed: number, duration: number, playing: boolean }} payload
   */
  syncRevealPreviewControls({ elapsed, duration, playing }) {
    const controller = this._revealController();
    const enabled =
      controller?.isPreviewAnimationActive?.()
      ?? (duration > 0 && this._hasFontMesh());
    const { els } = this;

    if (els.revealPlay) {
      els.revealPlay.disabled = !enabled;
      els.revealPlay.setAttribute('aria-pressed', playing ? 'true' : 'false');
      els.revealPlay.setAttribute(
        'aria-label',
        playing ? 'Pause text animation preview' : 'Play text animation preview',
      );
      els.revealPlay.dataset.tooltip = playing
        ? 'Pause text animation preview'
        : 'Play text animation preview';
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
        this.ui.updateSliderFill?.(els.revealScrub);
      }
    }

    if (els.revealTime) {
      const displayElapsed =
        duration > 0 ? Math.min(Math.max(0, elapsed), duration) : Math.max(0, elapsed);
      els.revealTime.textContent = `${displayElapsed.toFixed(1)}s`;
    }

    this._syncPauseAllButton(this.stateStore.getState());
  }

  _revealController() {
    return this.getScene()?.fontTextRevealController ?? null;
  }

  _constantController() {
    return this.getScene()?.fontTextConstantController ?? null;
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

  _withConstantController(run) {
    const scene = this.getScene();
    const controller = scene?.fontTextConstantController;
    const reveal = scene?.fontTextRevealController;
    const model = scene?.currentModel;
    if (!controller || !reveal || !model) return;
    reveal.ensureBoundToModel?.(model);
    run(controller, model, scene);
  }

  /** Post-reset side effects for Type Creator subsection reset icons. */
  onSubsectionReset(resetType) {
    this.schedulePreview();
    switch (resetType) {
      case 'font-extrude-circular-wrap':
        this._syncCircularWrapControlsVisibility();
        this._syncTrackingAnimatorControls();
        break;
      case 'font-extrude-reveal':
        this._withRevealController((controller, model) => {
          controller.onRevealTypeChange?.(model);
          controller.onRevealTimingChange?.(model);
          controller.onRevealEmissiveChange?.(model);
          controller.onTrackingAnimatorChange?.(model, { resetPreview: true });
        });
        this._syncRevealEmissiveControlsDisabled();
        this._syncTrackingAnimatorControls();
        break;
      case 'font-extrude-looping-motion':
        this._syncConstantControlsVisibility();
        this._withConstantController((controller, model) => {
          controller.onSettingsChange?.(model);
        });
        break;
      case 'font-extrude-preview':
        this._applyPauseAll(
          this.stateStore.getState()?.fontExtrude?.pauseAllAnimations ?? false,
        );
        break;
      case 'font-extrude-typography':
        if (this._hasFontMesh() && !this._isCircularFontModel()) {
          this._withRevealController((controller, model) => {
            if (controller.ensureBoundToModel(model)) {
              controller.onTypographyAlignChange?.(model);
              controller.onTypographyTrackingChange?.(model);
              controller.onTypographyLineHeightChange?.(model);
            }
          });
        }
        break;
      default:
        break;
    }
    this._syncAnimationTransportButtons(this.stateStore.getState());
  }

  _fontExtrudeCtx() {
    const { els } = this;
    return {
      inputs: {
        depth: els.meshDepth,
        depthOutputKey: 'fontExtrudeMeshDepth',
        normalAngle: els.meshAngle,
        normalAngleOutputKey: 'fontExtrudeMeshAngle',
        hardEdgeAngle: els.hardEdgeAngle,
        hardEdgeAngleOutputKey: 'fontExtrudeHardEdgeAngle',
        bevelAmount: els.bevelAmount,
        bevelAmountOutputKey: 'fontExtrudeBevelAmount',
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
    const extrude = normalizeGlyphFillHex(state?.fontExtrude?.extrudeColor);
    if (this.els.extrudeColor && document.activeElement !== this.els.extrudeColor) {
      this.els.extrudeColor.value = extrude;
    }
    const revealDuration = clampFontRevealDurationSec(
      state?.fontExtrude?.revealDurationSec ?? DEFAULT_FONT_REVEAL_DURATION_SEC,
    );
    if (this.els.revealDuration && document.activeElement !== this.els.revealDuration) {
      this.els.revealDuration.value = String(revealDuration);
      this.ui.updateValueLabel('fontExtrudeRevealDuration', `${revealDuration.toFixed(1)}s`);
    }
    this._syncRevealStaggerEasingControls();
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
    this._syncConstantControlsFromState(state);
    this._syncTrackingAnimatorControls();
    this._syncPauseAllButton(state);
  }

  _syncConstantControlsFromState(state) {
    const constantType = normalizeFontConstantType(
      state?.fontExtrude?.constantType ?? DEFAULT_FONT_CONSTANT_TYPE,
    );
    const constantTypeForIntensity = constantType;
    const constantIntensity = clampFontConstantIntensityForType(
      constantTypeForIntensity,
      state?.fontExtrude?.constantIntensity ?? DEFAULT_FONT_CONSTANT_INTENSITY,
    );
    const constantSpeedSec = clampFontConstantSpeedSec(
      state?.fontExtrude?.constantSpeedSec ?? DEFAULT_FONT_CONSTANT_SPEED_SEC,
    );
    const constantSpread = clampFontConstantSpread(
      state?.fontExtrude?.constantSpread ?? DEFAULT_FONT_CONSTANT_SPREAD,
    );
    const signature = [
      constantType,
      constantIntensity,
      constantSpeedSec,
      constantSpread,
    ].join('|');
    const signatureChanged =
      this._lastConstantSettingsSignature !== null
      && this._lastConstantSettingsSignature !== signature;
    const userEditingConstant =
      document.activeElement === this.els.constantType
      || document.activeElement === this.els.constantIntensity
      || document.activeElement === this.els.constantSpeed
      || document.activeElement === this.els.constantSpread;

    if (this.els.constantType && document.activeElement !== this.els.constantType) {
      this.els.constantType.value = constantType;
    }
    if (this.els.constantIntensity && document.activeElement !== this.els.constantIntensity) {
      this.els.constantIntensity.value = String(constantIntensity);
      this.ui.updateValueLabel(
        'fontExtrudeConstantIntensity',
        formatFontConstantIntensityLabel(constantTypeForIntensity, constantIntensity),
      );
    }
    if (this.els.constantSpeed && document.activeElement !== this.els.constantSpeed) {
      this.els.constantSpeed.value = String(constantSpeedSec);
      this.ui.updateValueLabel('fontExtrudeConstantSpeed', `${constantSpeedSec.toFixed(1)}s`);
    }
    if (this.els.constantSpread && document.activeElement !== this.els.constantSpread) {
      this.els.constantSpread.value = String(constantSpread);
      this.ui.updateValueLabel(
        'fontExtrudeConstantSpread',
        `${Math.round(constantSpread * 100)}%`,
      );
    }
    this._syncConstantControlsVisibility();

    if (signatureChanged && !userEditingConstant) {
      this._withConstantController((controller, model) => {
        controller.onSettingsChange?.(model);
      });
    }
    this._lastConstantSettingsSignature = signature;
  }

  _syncConstantControlsVisibility() {
    const constantType = normalizeFontConstantType(this.stateStore.getState()?.fontExtrude?.constantType);
    const active = isFontConstantAnimationActive(constantType);
    const usesSpread = fontConstantTypeUsesSpread(constantType);
    const vertical = isFontConstantVerticalType(constantType);
    const spin = isFontConstantSpinType(constantType);
    const intensityLabel = this.els.constantIntensity
      ?.closest('.slider-line')
      ?.querySelector('span[data-tooltip]');
    if (intensityLabel) {
      intensityLabel.textContent = spin ? 'Stagger' : 'Intensity';
      intensityLabel.dataset.tooltip = spin
        ? 'Delay before each letter starts its spin — 100% triggers all together; lower values ripple through the whole string across lines'
        : 'Motion strength — Wave allows up to 3× vertical peak height (± from rest); Float uses a gentler bob range; Breathe and Sway use a subtler 0–100% range';
    }
    if (this.els.constantIntensity) {
      const slider = this.els.constantIntensity;
      slider.max = String(vertical ? MAX_FONT_CONSTANT_VERTICAL_INTENSITY : MAX_FONT_CONSTANT_INTENSITY);
      slider.step = vertical ? '0.05' : '0.01';
      const clamped = clampFontConstantIntensityForType(constantType, slider.value);
      if (Number(slider.value) !== clamped) {
        slider.value = String(clamped);
        this.stateStore.set('fontExtrude.constantIntensity', clamped);
      }
      this.ui.updateValueLabel(
        'fontExtrudeConstantIntensity',
        formatFontConstantIntensityLabel(constantType, clamped),
      );
    }
    for (const el of [this.els.constantIntensity, this.els.constantSpeed]) {
      if (!el) continue;
      el.disabled = !active;
      el.closest('.font-extrude-constant-detail')?.toggleAttribute('hidden', !active);
    }
    if (this.els.constantSpread) {
      const showSpread = active && usesSpread;
      this.els.constantSpread.disabled = !showSpread;
      this.els.constantSpread
        .closest('.font-extrude-constant-spread-detail')
        ?.toggleAttribute('hidden', !showSpread);
    }
  }

  _syncRevealEmissiveControlsDisabled() {
    const revealType = normalizeFontRevealType(this.stateStore.getState()?.fontExtrude?.revealType);
    const revealActive = isFontRevealAnimationActive(revealType);
    if (this.els.revealEmissiveSlam) {
      this.els.revealEmissiveSlam.disabled = !revealActive;
    }
    const enabled = revealActive && !!this.els.revealEmissiveSlam?.checked;
    const disable = !enabled;
    for (const el of [
      this.els.revealEmissiveStrength,
      this.els.revealEmissiveDecay,
      this.els.revealEmissiveColor,
    ]) {
      if (!el) continue;
      el.disabled = disable;
      el.closest('.font-extrude-reveal-emissive-detail')?.toggleAttribute('hidden', disable);
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
    this.ui.syncFontExtrudeAnimationPreviewDock?.();

    if (
      this.els.text &&
      typeof fontState.sourceText === 'string' &&
      document.activeElement !== this.els.text
    ) {
      this.els.text.value = fontState.sourceText;
    }

    const align =
      fontState.align === 'center' || fontState.align === 'right' ? fontState.align : 'left';
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

    const circularEnabled = normalizeFontCircularWrapEnabled(
      fontState.circularWrapEnabled ?? DEFAULT_FONT_CIRCULAR_WRAP_ENABLED,
    );
    if (this.els.circularWrapEnabled) {
      this.els.circularWrapEnabled.checked = circularEnabled;
    }
    const circularMode = normalizeFontCircularWrapMode(
      fontState.circularWrapMode ?? DEFAULT_FONT_CIRCULAR_WRAP_MODE,
    );
    if (this.els.circularWrapMode && document.activeElement !== this.els.circularWrapMode) {
      this.els.circularWrapMode.value = circularMode;
    }
    const circularArc = clampFontCircularWrapArcDeg(
      fontState.circularWrapArcDeg ?? DEFAULT_FONT_CIRCULAR_WRAP_ARC_DEG,
    );
    if (this.els.circularWrapArc) {
      this.els.circularWrapArc.value = String(circularArc);
      this.ui.updateValueLabel('fontExtrudeCircularWrapArc', `${circularArc}°`);
    }
    this._syncCircularWrapControlsVisibility();

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
      this.controller.supportsSystemFonts &&
      !this._fontsInitialized &&
      !this.controller.font;
    prompt.hidden = !show;
    const allowBtn = this.els.allowSystemFonts;
    if (allowBtn) {
      const safariTip = allowBtn.getAttribute('data-tooltip-safari');
      if (this.controller.usesSafariDirectoryFonts && safariTip) {
        allowBtn.setAttribute('data-tooltip', safariTip);
      }
    }
  }

  /**
   * Load system font catalog after user gesture (see `_primeLocalFontAccess`).
   * @param {{ fromUserGesture?: boolean }} [options]
   */
  async ensureFontsReady({ fromUserGesture = false } = {}) {
    if (this._fontsInitialized) return;
    if (
      !fromUserGesture &&
      (this.controller.supportsLocalFonts || this.controller.usesSafariDirectoryFonts)
    ) {
      this._syncSystemFontsPromptVisibility();
      return;
    }
    if (this.controller.usesSafariDirectoryFonts && !this.controller.hasDirectoryFontCatalog()) {
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
    if (this.controller.usesSafariDirectoryFonts && !this.controller.hasDirectoryFontCatalog()) {
      this._syncSystemFontsPromptVisibility();
      return false;
    }

    this._fontFamilies = await this.controller.getAvailableFonts();
    this._fontFamilyByPostscript.clear();

    if (!this._fontFamilies.length) {
      this._fonts = [];
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
      } else if (this.controller.usesSafariDirectoryFonts) {
        this.ui.showToast(
          'No fonts found in that folder — choose Library → Fonts, or load a .ttf / .otf file.',
          5200,
          { notification: false },
        );
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

  async onDirectoryFontsSelected() {
    const files = this.els.directoryFontsInput?.files;
    if (!files?.length) return;

    this.ui.beginLoadSpinner?.();
    try {
      await this.controller.buildFontCatalogFromDirectoryFiles(files);
      this._fontsInitialized = false;
      this._fontsLoadPromise = null;
      await this.ensureFontsReady({ fromUserGesture: true });
    } finally {
      this.ui.endLoadSpinner?.();
      if (this.els.directoryFontsInput) this.els.directoryFontsInput.value = '';
    }
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

  _syncCircularWrapControlsVisibility() {
    const enabled = normalizeFontCircularWrapEnabled(this.els.circularWrapEnabled?.checked);
    if (this.els.circularWrapControls) {
      this.els.circularWrapControls.hidden = !enabled;
    }
    if (this.els.alignLine) {
      this.els.alignLine.hidden = enabled;
    }
    if (this.els.lineHeightLine) {
      this.els.lineHeightLine.hidden = enabled;
    }
    const manual =
      enabled && normalizeFontCircularWrapMode(this.els.circularWrapMode?.value) === 'manual';
    if (this.els.circularArcLine) {
      this.els.circularArcLine.hidden = !manual;
    }
  }

  /** @param {Awaited<ReturnType<import('../scene/FontExtrudeController.js').FontExtrudeController['layoutTextAsync']>> | null | undefined} [layout] */
  _layoutHasPreviewInk(layout) {
    return (layout?.lines || []).some((line) => (line.paths || []).length > 0);
  }

  /**
   * Canvas preview drives glyph color; show plain textarea text until a font is loaded
   * and the layout has drawable ink (empty/whitespace-only keeps shelf padding for placeholder).
   * @param {boolean} [hasPreviewInk]
   */
  _syncLiveEditorPreviewMode(hasPreviewInk) {
    const wrap = this.els.liveEditor;
    if (!wrap) return;
    const hasInk =
      hasPreviewInk ??
      Boolean((this.els.text?.value ?? '').trim().length && this.controller.font);
    const active = !!this.controller.font && hasInk;
    wrap.classList.toggle('font-extrude-live-editor--preview-active', active);
    wrap.classList.remove('font-extrude-live-editor--circular-active');
    if (!active) this._resetTextareaEditorStyles();
  }

  /**
   * CSS baseline offset from the top of the first line box (px), accounting for
   * the half-leading that `line-height` adds above the glyphs. Without the
   * half-leading term the caret sat ~9% of the font size too high.
   * @param {string} fontFamily
   * @param {number} fontSizePx
   * @param {number} [lineHeightPx]
   */
  _measureTextareaBaselineOffset(fontFamily, fontSizePx, lineHeightPx = fontSizePx) {
    const font = this.controller.font;
    let ascent;
    let descent;
    if (fontFamily && fontFamily !== 'inherit' && typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.font = `${fontSizePx}px ${fontFamily}`;
        const metrics = ctx.measureText('Hg');
        ascent = Number.isFinite(metrics.fontBoundingBoxAscent)
          ? metrics.fontBoundingBoxAscent
          : Number.isFinite(metrics.actualBoundingBoxAscent)
            ? metrics.actualBoundingBoxAscent
            : undefined;
        descent = Number.isFinite(metrics.fontBoundingBoxDescent)
          ? metrics.fontBoundingBoxDescent
          : Number.isFinite(metrics.actualBoundingBoxDescent)
            ? metrics.actualBoundingBoxDescent
            : undefined;
      }
    }
    if ((ascent === undefined || descent === undefined) && font) {
      const upm = font.unitsPerEm || 1000;
      ascent = ascent ?? (font.ascender / upm) * fontSizePx;
      descent = descent ?? (Math.abs(font.descender) / upm) * fontSizePx;
    }
    if (ascent === undefined) ascent = fontSizePx * 0.8;
    if (descent === undefined) descent = fontSizePx * 0.2;
    const halfLeading = (lineHeightPx - (ascent + descent)) / 2;
    return halfLeading + ascent;
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
    const { slotLeft, slotTop, scale, bounds, pad } = viewport;
    const fontSizePx = layout.fontSize * scale;
    const lineHeightPx = layout.fontSize * options.lineHeight * scale;
    const letterSpacingPx = (options.tracking / 1000) * fontSizePx;
    // Render the textarea in the EXACT bytes of the active font so its caret
    // tracks the glyphs drawn on the canvas. (The old per-postscript lookup
    // silently fell back to the UI font, putting the caret in a fictional spot.)
    const fontFamily = await this.controller.getActiveCssFontFamily();

    const firstLineY = layout.lines?.[0]?.y ?? layout.fontSize * 0.85;
    const baselineScreenY = slotTop + (firstLineY - bounds.minY) * scale;
    const baselineOffset = this._measureTextareaBaselineOffset(
      fontFamily,
      fontSizePx,
      lineHeightPx,
    );
    const paddingTop = baselineScreenY - baselineOffset;

    const blockLeft = slotLeft - bounds.minX * scale;

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
      // The canvas centers each line within the padded box, so a symmetric box
      // (center at cssW/2) matches it. Building large/negative paddings here only
      // got clamped by the browser and shifted centered text sideways.
      ta.style.paddingLeft = `${pad}px`;
      ta.style.paddingRight = `${pad}px`;
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
      fontState.align === 'center' || fontState.align === 'right'
        ? fontState.align
        : this.els.align?.value === 'center' || this.els.align?.value === 'right'
          ? this.els.align.value
          : 'left';
    const previewWidth = this._previewCssWidth || this.els.preview?.clientWidth || 520;
    const pad = this._previewLayoutPad();
    return {
      align,
      tracking: clampFontTrackingValue(
        Number.isFinite(Number(fontState.tracking))
          ? Number(fontState.tracking)
          : Number(this.els.tracking?.value ?? 0),
      ),
      kerning: normalizeFontKerningMode(this.els.kerning?.value ?? fontState.kerning),
      lineHeight: normalizeFontLineHeight(
        Number.isFinite(Number(fontState.lineHeight))
          ? Number(fontState.lineHeight)
          : Number(this.els.lineHeight?.value ?? 1),
      ),
      detail: normalizeFontExtrudeDetail(this.els.detail?.value ?? fontState.detail ?? 'high'),
      bevelType: normalizeFontBevelType(this.els.bevelType?.value ?? fontState.bevelType),
      fillColor: normalizeGlyphFillHex(
        this.els.fillColor?.value ?? fontState.fillColor ?? '#808080',
      ),
      extrudeColor: normalizeGlyphFillHex(
        this.els.extrudeColor?.value ?? fontState.extrudeColor ?? '#808080',
      ),
      maxWidth: Math.max(120, previewWidth - pad * 2),
      circularWrap: {
        enabled: normalizeFontCircularWrapEnabled(
          this.els.circularWrapEnabled?.checked ?? fontState.circularWrapEnabled,
        ),
        mode: normalizeFontCircularWrapMode(
          this.els.circularWrapMode?.value ?? fontState.circularWrapMode,
        ),
        arcDeg: clampFontCircularWrapArcDeg(
          this.els.circularWrapArc?.value ?? fontState.circularWrapArcDeg,
        ),
      },
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
    const options = this.getOptions();
    try {
      layout = await this.controller.layoutTextAsync(text, {
        ...options,
        circularWrap: { ...options.circularWrap, enabled: false },
      });
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
    this.controller.drawPreview(ctx, layout, {
      fillColor: options.fillColor,
      extrudeColor: options.extrudeColor,
    });
    if (normalizeFontCircularWrapEnabled(options.circularWrap?.enabled)) {
      drawCircularArcSpanPreviewIndicator(ctx, layout, options.circularWrap);
    }
    ctx.restore();
    const hasInk = this._layoutHasPreviewInk(layout);
    this._syncLiveEditorPreviewMode(hasInk);
    if (hasInk) {
      await this._syncTextareaToPreview(layout, viewport);
    }
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

  _migrateTrackingAnimatorAmount() {
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const master = this._getMasterTrackingForUi();
    const percent = resolveFontTrackingAnimatorAmountPercent(fontState, master);
    if (fontState.trackingAnimatorAmountPercent !== percent) {
      this.stateStore.set('fontExtrude.trackingAnimatorAmountPercent', percent);
    }
    this._syncTrackingAnimatorControls();
  }

  async onGenerate() {
    if (this._generating) return;
    const text = this.els.text?.value ?? '';
    if (!text.trim()) return;
    if (!this.controller.font) {
      this.ui.showToast(
        this.controller.supportsSystemFonts
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
      const options = this.getOptions();
      const group = await this.controller.generateMesh(text, options);
      const added = await this.controller.addToScene(group);
      if (!added) return;
      scene.fontTextRevealController?.reconcileTypographyToMaster?.(added);
      if (normalizeFontCircularWrapEnabled(options.circularWrap?.enabled)) {
        this.stateStore.set('fontExtrude.trackingAnimatorEnabled', false);
      }
      this.stateStore.set('fontExtrude.panelOpen', true);
      if (this.els.panelOpen) this.els.panelOpen.checked = true;
      this.ui.setEffectFoldoutOpen('font-extrude', true);
      this.syncExtrudeControls(this.stateStore.getState());
      this.syncPostGenControlsVisibility();
      this._migrateTrackingAnimatorAmount();
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
