import { HDRI_CUSTOM_ID, HDRI_STRENGTH_UNIT } from './config/hdri.js';
import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  DOF_FOCUS_MIN_M,
  getAntiAliasingUiState,
  isBloomPipelineActive,
  sanitizeDof,
  sanitizeAmbientOcclusion,
  effectiveVignetteIntensity,
  isVignetteUiEnabled,
  cameraShadowsUiToShader,
  clampCameraShadowsUi,
} from './constants.js';
import { SceneSettingsManager } from './settings/SceneSettingsManager.js';
import { UIHelpers } from './ui/UIHelpers.js';
import { MeshControls } from './ui/MeshControls.js';
import { StudioControls } from './ui/StudioControls.js';
import { RenderControls } from './ui/RenderControls.js';
import { LensControls } from './ui/LensControls.js';
import { IsometricControls } from './ui/IsometricControls.js';
import { GlobalControls } from './ui/GlobalControls.js';
import { AnimationControls } from './ui/AnimationControls.js';
import { ResetControls } from './ui/ResetControls.js';
import { StartMenuController } from './ui/StartMenuController.js';
import { DemoLogotypeController } from './ui/DemoLogotypeController.js';
import { BugReportController } from './ui/BugReportController.js';
import { ShelfOverlaySuppression } from './ui/ShelfOverlaySuppression.js';
import { UISounds } from './ui/UISounds.js';
import { UIManagerModalOverlays } from './ui/UIManagerModalOverlays.js';
import { mergeAberrationSettings } from './render/chromaticAberration.js';

/** Toasts longer than this use a dismissible dialog (OK) so they stay readable. */
export const LONG_TOAST_CHAR_THRESHOLD = 110;

/** Match user-facing warnings/errors for automatic caution SFX (override with `caution: false` on showToast). */
function inferToastCaution(text) {
  const s = String(text).toLowerCase();
  return (
    /\bunsupported\b|\bunrecognized\b|\binvalid\b|\bcouldn't\b|\bcould not\b|\bfailed\b|\bnot supported\b|\bno supported\b|\berror\b|\bwarning\b/.test(s)
    || /not available yet/.test(s)
    || /\bunable\b/.test(s)
    || /\bload a mesh\b/.test(s)
    || /\bno model\b/.test(s)
  );
}

/** Match success / neutral-positive feedback for notification SFX (does not override caution when both match). */
function inferToastPositive(text) {
  if (inferToastCaution(text)) return false;
  const s = String(text).toLowerCase();
  return (
    /\bloaded\b|\bcopied\b|\bexported\b|\bexport complete\b|\bsaved\b|\bsuccess\b|\bcomplete\b|\bconnected\b|\bthanks\b|\brestored\b|\bapplied\b|\bsnapped\b/.test(s)
    || /\bcopied to clipboard\b/.test(s)
    || /\bsettings reset\b/.test(s)
    || /^model loaded\b/.test(s.trim())
    || /^folder loaded\b/.test(s.trim())
  );
}

/** Long modals and alerts without explicit tone — caution for errors, notification otherwise. */
function inferModalTone(text) {
  if (inferToastCaution(text)) return 'caution';
  return 'notification';
}

export class UIManager {
  constructor(eventBus, stateStore) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.dom = {};
    this.activeTab = 'mesh';
    this.uiHidden = false;
    this.currentAnimationDuration = 0;
    this.animationPlaying = false;
    this.shelfRevealed = false;
    /** @type {import('./ui/ShelfOverlaySuppression.js').ShelfOverlaySuppression | null} */
    this.shelfOverlay = null;
    /** @type {import('./ui/UIManagerModalOverlays.js').UIManagerModalOverlays | null} */
    this.modalOverlays = null;
    /** @type {UISounds | null} */
    this.uiSounds = null;
    /** Set while a coalesced post-sync slider-fill rAF is pending (see scheduleAllRangeSliderFills). */
    this._rangeSliderFillRafId = null;
    /** Nested loads (model + HDRI) toggle #viewportLoadSpinner while depth > 0 */
    this._loadSpinnerDepth = 0;
    /** @type {Array<{ text: string, durationMs: number, toastOptions: object }>} */
    this._toastQueue = [];
    this._toastQueueActive = false;
    /** @type {HTMLElement | null} */
    this._activeToastEl = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._activeToastTimer = null;
  }

  init() {
    this.cacheDom();
    this.uiSounds = new UISounds();
    if (this.dom.uiSoundsEnabled) {
      this.dom.uiSoundsEnabled.checked = this.uiSounds.enabled;
    }
    this.shelfOverlay = new ShelfOverlaySuppression(this);
    this.modalOverlays = new UIManagerModalOverlays(this);

    // Initialize helpers
    this.helpers = new UIHelpers(this.eventBus, this.stateStore, this);
    
    // Initialize control modules
    this.startMenuController = new StartMenuController(this.eventBus, this);
    this.meshControls = new MeshControls(this.eventBus, this.stateStore, this, this.helpers);
    this.studioControls = new StudioControls(this.eventBus, this.stateStore, this, this.helpers);
    this.renderControls = new RenderControls(this.eventBus, this.stateStore, this, this.helpers);
    this.lensControls = new LensControls(this.eventBus, this.stateStore, this, this.helpers);
    this.isometricControls = new IsometricControls(
      this.eventBus,
      this.stateStore,
      this,
      this.helpers,
    );
    this.globalControls = new GlobalControls(this.eventBus, this.stateStore, this, this.helpers);
    this.animationControls = new AnimationControls(this.eventBus, this.stateStore, this);
    this.resetControls = new ResetControls(this.eventBus, this.stateStore, this, this.helpers);
    this.demoLogotype = new DemoLogotypeController();
    this.bugReport = new BugReportController(this);

    // Initialize start menu
    this.startMenuController.init();

    // Initialize demo logotype
    this.demoLogotype.init();
    this.bugReport.init();
    
    // Initialize SceneSettingsManager
    this.sceneSettingsManager = new SceneSettingsManager(
      this.eventBus,
      this.stateStore,
      {
        setHdriActive: (hdri) => this.setHdriActive(hdri),
        setCreativeLookActive: (preset) => this.setCreativeLookActive(preset),
        toggleCreativeLookGrid: (enabled) => this.toggleCreativeLookGrid(enabled),
        toggleHdriControls: (enabled) => this.toggleHdriControls(enabled),
        setLightColorControlsDisabled: (disabled) => this.setLightColorControlsDisabled(disabled),
        setLightsRotationDisabled: (disabled) => this.setLightsRotationDisabled(disabled),
        setEffectControlsDisabled: (controls, disabled) => this.setEffectControlsDisabled(controls, disabled),
      }
    );
    
    this.bindEvents();
    this.stateStore.subscribe((state) => this.syncControls(state));
    this.syncControls(this.stateStore.getState());
    // Initialize panel header visibility
    const initialTab = this.activeTab || 'mesh';
    document.querySelectorAll('.panel-header-title').forEach((header) => {
      header.classList.toggle('visible', header.dataset.header === initialTab);
    });

    this.bindFullscreenToggle();
  }

  /**
   * True when the document is in browser fullscreen (any vendor prefix).
   */
  isDocumentFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  /**
   * Sync fullscreen toggle button icon/state with document fullscreen API.
   * Called from SceneManager after layout updates on fullscreen transitions.
   */
  syncFullscreenToggle() {
    const btn = this.dom.fullscreenToggle;
    if (!btn) return;
    const active = this.isDocumentFullscreen();
    btn.classList.toggle('is-active', active);
    const icon = btn.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-expand', !active);
      icon.classList.toggle('fa-compress', active);
    }
  }

  bindFullscreenToggle() {
    const btn = this.dom.fullscreenToggle;
    if (!btn) return;

    const requestFullscreen = (element) => {
      if (element.requestFullscreen) element.requestFullscreen();
      else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen();
      else if (element.mozRequestFullScreen) element.mozRequestFullScreen();
      else if (element.msRequestFullscreen) element.msRequestFullscreen();
    };

    const exitFullscreen = () => {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    };

    btn.addEventListener('click', () => {
      if (!this.isDocumentFullscreen()) {
        requestFullscreen(document.documentElement);
      } else {
        exitFullscreen();
      }
    });
  }

  cacheDom() {
    const q = (sel) => document.querySelector(sel);
    this.dom.canvas = q('#webgl');
    this.dom.fullscreenToggle = q('#fullscreenToggle');
    this.dom.loadSpinner = q('#viewportLoadSpinner');
    this.dom.topBarTitle = q('#topBarTitle');
    this.dom.topBarAnimation = q('#topBarAnimation');
    this.dom.resetAll = q('#resetAll');
    this.dom.helpButton = q('#helpButton');
    this.dom.helpOverlay = q('#helpOverlay');
    this.dom.closeHelp = q('#closeHelp');
    this.dom.toggleUi = q('#toggleUi');
    this.dom.uiSoundsEnabled = q('#uiSoundsEnabled');
    this.dom.uiSoundsVolume = q('#uiSoundsVolume');
    this.dom.shelf = q('#shelf');
    this.dom.shelf?.classList.add('is-shelf-hidden');
    this.dom.topBar = document.querySelector('.top-bar');
    this.dom.tabs = document.querySelectorAll('.tab');
    this.dom.panels = document.querySelectorAll('.panel');
    this.dom.panelsContainer = q('.panels');
    this.dom.shelfScrollbar = q('.shelf-scrollbar');
    this.dom.shelfScrollbarThumb = q('.shelf-scrollbar-thumb');
    this.dom.toastTemplate = document.querySelector('#toastTemplate');
    this.dom.messageAlertModal = q('#messageAlertModal');
    this.dom.messageAlertTitle = q('#messageAlertTitle');
    this.dom.messageAlertBody = q('#messageAlertBody');
    this.dom.messageAlertOk = q('#messageAlertOk');
    this.dom.messageAlertCancel = q('#messageAlertCancel');
    this.dom.messageAlertActions = q('#messageAlertActions');
    this.dom.messageAlertClose = q('#messageAlertClose');
    this.dom.fullscreenPrompt = q('#orbyFullscreenPrompt');
    this.dom.fullscreenPromptMessage = q('#orbyFullscreenPromptMessage');
    this.dom.fullscreenPromptStack = q('#orbyFullscreenPromptStack');
    this.dom.fullscreenPromptNo = q('#orbyFullscreenPromptNo');
    this.dom.fullscreenPromptYes = q('#orbyFullscreenPromptYes');
    this.dom.stats = q('#meshStats');
    this.dom.fbxMapSlotsDivider = q('#fbxMapSlotsDivider');
    this.dom.svgExtrudePanelBlock = q('#svgExtrudePanelBlock');
    this.dom.studioBaseGlassPanel = q('#studioBaseGlassPanel');
    this.dom.animationBlock = q('#animationBlock');
    this.dom.animationSelect = q('#animationSelect');
    this.dom.playPause = q('#playPause');
    this.dom.animationScrub = q('#animationScrub');
    this.dom.animationTime = q('#animationTime');

    this.inputs = {
      shading: document.querySelectorAll('input[name="shading"]'),
      scale: q('#scaleControl'),
      xOffset: q('#xOffsetControl'),
      yOffset: q('#yOffsetControl'),
      zOffset: q('#zOffsetControl'),
      rotationX: q('#rotationXControl'),
      rotationY: q('#rotationYControl'),
      rotationZ: q('#rotationZControl'),
      autoRotate: document.querySelectorAll('input[name="autorotate"]'),
      cameraAutoOrbit: document.querySelectorAll('input[name="cameraAutoOrbit"]'),
      cameraHandheld: document.querySelectorAll('input[name="cameraHandheld"]'),
      hdriEnabled: q('#hdriEnabled'),
      hdriStrength: q('#hdriStrength'),
      hdriBlurriness: q('#hdriBlurriness'),
      hdriRotation: q('#hdriRotation'),
      hdriBackground: q('#hdriBackground'),
      hdriReceiveShadowsAo: q('#hdriReceiveShadowsAo'),
      lensFlareEnabled: q('#lensFlareEnabled'),
      lensFlareRotation: q('#lensFlareRotation'),
      lensFlareHeight: q('#lensFlareHeight'),
      lensFlareHalo: q('#lensFlareHalo'),
      lensFlareColor: q('#lensFlareColor'),
      lensFlareQuality: q('#lensFlareQuality'),
      anamorphicBloomEnabled: q('#anamorphicBloomEnabled'),
      anamorphicBloomStrength: q('#anamorphicBloomStrength'),
      anamorphicBloomSpread: q('#anamorphicBloomSpread'),
      anamorphicBloomStreakAngle: q('#anamorphicBloomStreakAngle'),
      anamorphicBloomThreshold: q('#anamorphicBloomThreshold'),
      anamorphicBloomSoften: q('#anamorphicBloomSoften'),
      anamorphicBloomStreakTint: q('#anamorphicBloomStreakTint'),
      anamorphicBloomQuality: q('#anamorphicBloomQuality'),
      materialBrightness: q('#materialBrightness'),
      materialMetalness: q('#materialMetalness'),
      materialRoughness: q('#materialRoughness'),
      materialEmissive: q('#materialEmissive'),
      svgExtrudeDepth: q('#svgExtrudeDepth'),
      svgExtrudeNormalAngle: q('#svgExtrudeNormalAngle'),
      svgExtrudeFlipDirection: q('#svgExtrudeFlipDirection'),
      svgExtrudeColorOverride: q('#svgExtrudeColorOverride'),
      svgExtrudeColor: q('#svgExtrudeColor'),
      svgExtrudeColorDepths: q('#svgExtrudeColorDepths'),
      svgExtrudeSurfacePreset: q('#svgExtrudeSurfacePreset'),
      svgExtrudeSurfaceScale: q('#svgExtrudeSurfaceScale'),
      reverseNormals: q('#reverseNormals'),
      centerPivot: q('#centerPivot'),
      stlSmoothingControls: q('#stlSmoothingControls'),
      stlSmoothShading: q('#stlSmoothShading'),
      stlSmoothingAngle: q('#stlSmoothingAngle'),
      uvChecker: q('#uvChecker'),
      uvCheckerStyle: q('#uvCheckerStyle'),
      uvCheckerScale: q('#uvCheckerScale'),
      advancedAlphaControls: q('#advancedAlphaControls'),
      transparencyFix: q('#transparencyFix'),
      blendSortingMitigation: q('#blendSortingMitigation'),
      flipGlassNormalMapY: q('#flipGlassNormalMapY'),
      glassFrontFacesOnly: q('#glassFrontFacesOnly'),
      glassOpacity: q('#glassOpacity'),
      glassReflection: q('#glassReflection'),
      glassTint: q('#glassTint'),
      glassBody: q('#glassBody'),
      advancedGlassControls: q('#advancedGlassControls'),
      clayColor: q('#clayColor'),
      clayNormalMap: q('#clayNormalMap'),
      toggleSubsurface: q('#toggleSubsurface'),
      subsurfaceTranslucency: q('#subsurfaceTranslucency'),
      subsurfaceScatterTint: q('#subsurfaceScatterTint'),
      wireframeAlwaysOn: q('#wireframeAlwaysOn'),
      wireframeColor: q('#wireframeColor'),
      wireframeOnlyVisibleFaces: q('#wireframeOnlyVisibleFaces'),
      wireframeHideMesh: q('#wireframeHideMesh'),
      creativeLookEnabled: q('#creativeLookEnabled'),
      creativeLookPauseAnimations: q('#creativeLookPauseAnimations'),
      creativeLookShaderAnimationSpeed: q('#creativeLookShaderAnimationSpeed'),
      creativeLookPatternScale: q('#creativeLookPatternScale'),
      creativeLookButtons: document.querySelectorAll('[data-creative-look]'),
      groundSolid: q('#groundSolid'),
      groundWire: q('#groundWire'),
      groundSolidColor: q('#groundSolidColor'),
      groundWireColor: q('#groundWireColor'),
      groundWireOpacity: q('#groundWireOpacity'),
      groundY: q('#groundY'),
      gridY: q('#gridY'),
      baseSnap: q('#baseSnap'),
      gridSnap: q('#gridSnap'),
      gridScale: q('#gridScale'),
      gridLineWidth: q('#gridLineWidth'),
      baseScale: q('#baseScale'),
      baseMetalness: q('#baseMetalness'),
      baseRoughness: q('#baseRoughness'),
      baseGlassSurface: q('#baseGlassSurface'),
      baseGlassBrightness: q('#baseGlassBrightness'),
      baseGlassBlur: q('#baseGlassBlur'),
      baseGlassAmount: q('#baseGlassAmount'),
      backdropEnabled: q('#backdropEnabled'),
      backdropColor: q('#backdropColor'),
      backdropTextureEnabled: q('#backdropTextureEnabled'),
      backdropTextureScale: q('#backdropTextureScale'),
      backdropScale: q('#backdropScale'),
      backdropWidth: q('#backdropWidth'),
      backdropRotation: q('#backdropRotation'),
      backdropY: q('#backdropY'),
      backdropSnap: q('#backdropSnap'),
      hdriButtons: document.querySelectorAll('[data-hdri]'),
      hdriUploadBtn: q('#hdriUploadBtn'),
      hdriFileInput: q('#hdriFileInput'),
      lightControls: document.querySelectorAll('.light-color-row'),
      lightsEnabled: q('#lightsEnabled'),
      lightsMaster: q('#lightsMaster'),
      lightsRotation: q('#lightsRotation'),
      lightsHeight: q('#lightsHeight'),
      lightsAutoRotate: q('#lightsAutoRotate'),
      showLightIndicators: q('#showLightIndicators'),
      lightsCastShadows: q('#lightsCastShadows'),
      lightsShadowQuality: q('#lightsShadowQuality'),
      lightsShadowSoftness: q('#lightsShadowSoftness'),
      lightsShadowColor: q('#lightsShadowColor'),
      lightsShadowOpacity: q('#lightsShadowOpacity'),
      lightsShadowContactOffset: q('#lightsShadowContactOffset'),
      lightsShadowTwoSided: q('#lightsShadowTwoSided'),
      keyLightStrength: q('#keyLightStrength'),
      keyLightHeight: q('#keyLightHeight'),
      keyLightRotate: q('#keyLightRotate'),
      fillLightStrength: q('#fillLightStrength'),
      fillLightHeight: q('#fillLightHeight'),
      fillLightRotate: q('#fillLightRotate'),
      rimLightStrength: q('#rimLightStrength'),
      rimLightHeight: q('#rimLightHeight'),
      rimLightRotate: q('#rimLightRotate'),
      ambientLightStrength: q('#ambientLightStrength'),
      keyLightEnabled: q('#keyLightEnabled'),
      fillLightEnabled: q('#fillLightEnabled'),
      rimLightEnabled: q('#rimLightEnabled'),
      ambientLightEnabled: q('#ambientLightEnabled'),
      keyLightCastShadows: q('#keyLightCastShadows'),
      fillLightCastShadows: q('#fillLightCastShadows'),
      rimLightCastShadows: q('#rimLightCastShadows'),
      dofFocus: q('#dofFocus'),
      dofAperture: q('#dofAperture'),
      dofQuality: q('#dofQuality'),
      toggleDof: q('#toggleDof'),
      bloomThreshold: q('#bloomThreshold'),
      bloomStrength: q('#bloomStrength'),
      bloomRadius: q('#bloomRadius'),
      bloomColor: q('#bloomColor'),
      bloomQuality: q('#bloomQuality'),
      toggleBloom: q('#toggleBloom'),
      lensDirtEnabled: q('#lensDirtEnabled'),
      lensDirtStrength: q('#lensDirtStrength'),
      lensDirtTintColor: q('#lensDirtTintColor'),
      grainIntensity: q('#grainIntensity'),
      toggleGrain: q('#toggleGrain'),
      aberrationAmount: q('#aberrationAmount'),
      toggleAberration: q('#toggleAberration'),
      toggleAmbientOcclusion: q('#toggleAmbientOcclusion'),
      ambientOcclusionIntensity: q('#ambientOcclusionIntensity'),
      ambientOcclusionRadius: q('#ambientOcclusionRadius'),
      ambientOcclusionColor: q('#ambientOcclusionColor'),
      ambientOcclusionQuality: q('#ambientOcclusionQuality'),
      toggleFresnel: q('#toggleFresnel'),
      fresnelColor: q('#fresnelColor'),
      fresnelRadius: q('#fresnelRadius'),
      fresnelStrength: q('#fresnelStrength'),
      backgroundColor: q('#backgroundColor'),
      cameraFov: q('#cameraFov'),
      lensSensor: q('#lensSensor'),
      isometricEnabled: q('#isometricEnabled'),
      isoOrbitStep: q('#isoOrbitStep'),
      isoPanUnlock: q('#isoPanUnlock'),
      fisheyeEnabled: q('#fisheyeEnabled'),
      fisheyeHorizontalFOV: q('#fisheyeHorizontalFOV'),
      fisheyeStrength: q('#fisheyeStrength'),
      fisheyeCylindricalRatio: q('#fisheyeCylindricalRatio'),
      cameraTilt: q('#cameraTilt'),
      exposure: q('#exposure'),
      autoExposure: q('#autoExposure'),
      cameraContrast: q('#cameraContrast'),
      cameraTemperature: q('#cameraTemperature'),
      cameraTint: q('#cameraTint'),
      cameraHighlights: q('#cameraHighlights'),
      cameraShadows: q('#cameraShadows'),
      cameraSaturation: q('#cameraSaturation'),
      cameraClarity: q('#cameraClarity'),
      cameraFade: q('#cameraFade'),
      cameraSharpness: q('#cameraSharpness'),
      vignetteIntensity: q('#vignetteIntensity'),
      vignetteColor: q('#vignetteColor'),
      toggleVignette: q('#toggleVignette'),
      compositionGridEnabled: q('#compositionGridEnabled'),
      compositionGuidesColor: q('#compositionGuidesColor'),
      cinematicLetterbox219: q('#cinematicLetterbox219'),
      histogramEnabled: q('#histogramEnabled'),
      toneCurveOpen: q('#toneCurveOpen'),
      lookFilterPresetsOpen: q('#lookFilterPresetsOpen'),
      antiAliasing: q('#antiAliasing'),
      renderQuality: q('#renderQuality'),
      toneMapping: q('#toneMapping'),
      colorCheckerEnabled: q('#colorCheckerEnabled'),
      colorCheckerDistance: q('#colorCheckerDistance'),
      colorCheckerRotate: q('#colorCheckerRotate'),
      colorCheckerHeight: q('#colorCheckerHeight'),
      colorCheckerScale: q('#colorCheckerScale'),
      colorCheckerRawToggle: q('#colorCheckerRawToggle'),
      exportSvgColorDetail: q('#exportSvgColorDetail'),
      exportPngTransparentSettings: q('#exportPngTransparentSettings'),
      exportMp4Settings: q('#exportMp4Settings'),
      fbxMapFileInput: q('#fbxMapFileInput'),
      fbxMapInvertNormalY: q('#fbxMapInvertNormalY'),
      fbxMapPbrUvChannel: q('#fbxMapPbrUvChannel'),
    };

    this.buttons = {
      transformReset: q('#transformReset'),
      exportPng: q('#exportPngButton'),
      exportSvg: q('#exportSvgButton'),
      exportSvgColor: q('#exportSvgColorButton'),
      exportSvgGlb: q('#exportSvgGlbButton'),
      exportVideo: q('#exportVideoButton'),
      copySceneButtons: document.querySelectorAll('.copy-scene-settings'),
      loadSceneButtons: document.querySelectorAll('.load-scene-settings'),
      saveOrbyButtons: document.querySelectorAll('.save-orby-scene'),
      loadOrbyButtons: document.querySelectorAll('.load-orby-scene'),
      fileInput: q('#fileInput'),
      loadSceneModal: q('#loadSceneSettingsModal'),
      loadSceneText: q('#loadSceneSettingsText'),
      applySceneSettings: q('#applySceneSettings'),
      closeLoadSceneSettings: q('#closeLoadSceneSettings'),
      cancelLoadSceneSettings: q('#cancelLoadSceneSettings'),
      resetStudio: q('#resetStudioSettings'),
      resetMesh: q('#resetMeshSettings'),
      resetRender: q('#resetRenderSettings'),
      loadMesh: q('#loadMeshButton'),
    };

    // Export settings state
    this.exportSettings = {
      transparent: true,
      size: 2,
      video: {
        mode: 'turntable',
        format: 'mp4',
        durationSec: 5,
        spins: 1,
        fps: 24,
        resolution: '1080p',
        mp4Quality: 'medium',
        movTransparent: false,
      },
    };

    this.dom.blocks = {};
    this.dom.subsections = {};
    document.querySelectorAll('.panel-block[data-block]').forEach((block) => {
      const key = block.dataset.block;
      if (key) {
        this.dom.blocks[key] = block;
      }
    });
    // Cache subsections for individual muting within merged blocks
    document.querySelectorAll('.subsection[data-subsection]').forEach((subsection) => {
      const key = subsection.dataset.subsection;
      if (key) {
        this.dom.subsections[key] = subsection;
      }
    });
    // Start menu visibility is managed by StartMenuController
  }

  bindEvents() {
    // Bind all control modules
    this.globalControls.bind();
    this.meshControls.bind();
    this.studioControls.bind();
    this.renderControls.bind();
    this.lensControls.bind();
    this.isometricControls.bind();
    this.animationControls.bind();
    this.resetControls.bind();
    
    // Setup slider utilities
    this.helpers.setupSliderKeyboardSupport();
    this.helpers.setupSliderFillUpdates();
    this.helpers.setupValueLabelInlineEdit();

    // Quick Navigation (Information tab) smooth scrolling
    const infoQuicknavLinks = document.querySelectorAll('.info-quicknav a[href^="#"]');
    infoQuicknavLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        const href = link.getAttribute('href');
        if (!href) return;
        const target = document.querySelector(href);
        if (!target) return;
    event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    document.querySelectorAll('[data-open-info-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = btn.getAttribute('data-open-info-section');
        const tabButton = document.querySelector('[data-tab="info"]');
        tabButton?.click();
        const scrollToTarget = () => {
          const el = sel ? document.querySelector(sel) : null;
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        requestAnimationFrame(() => {
          requestAnimationFrame(scrollToTarget);
        });
      });
    });

    this.setupPanelsScrollbarReveal();
    this.modalOverlays.bind();
    this.bindUiSoundsPreference();
  }

  bindUiSoundsPreference() {
    const toggle = this.dom.uiSoundsEnabled;
    const volumeSlider = this.dom.uiSoundsVolume;
    if (toggle) {
      toggle.addEventListener('change', () => {
        this.uiSounds?.setEnabled(!!toggle.checked);
      });
    }
    const syncVolumeUi = () => {
      if (!volumeSlider || !this.uiSounds) return;
      this.uiSounds.setMasterVolume(Number(volumeSlider.value) / 100);
      const label = document.querySelector('[data-output="uiSoundsVolume"]');
      if (label) label.textContent = `${volumeSlider.value}%`;
      this.updateSliderFill(volumeSlider);
    };
    if (volumeSlider && this.uiSounds) {
      volumeSlider.value = String(Math.round(this.uiSounds.getMasterVolume() * 100));
      volumeSlider.addEventListener('input', syncVolumeUi);
      syncVolumeUi();
    }
  }

  /** @see ShelfOverlaySuppression */
  beginShelfOverlaySuppression() {
    this.shelfOverlay?.begin();
  }

  /** @see ShelfOverlaySuppression */
  endShelfOverlaySuppression() {
    this.shelfOverlay?.end();
  }

  getMessageAlertPanel() {
    return this.modalOverlays?.getMessageAlertPanel() ?? null;
  }

  /**
   * Modal with OK — for long errors/warnings that need time to read. Short messages use showToast().
   * @param {{ okLabel?: string, confirm?: boolean, cancelLabel?: string, onConfirm?: () => void, onCancel?: () => void, noCautionSound?: boolean, modalTone?: 'caution' | 'notification' | 'none' }} [options]
   */
  showMessageAlert(message, title = 'Message', options = {}) {
    const { noCautionSound, modalTone, ...alertOptions } = options;
    const text = typeof message === 'string' ? message : String(message ?? '');
    const tone = modalTone ?? inferModalTone(text);
    if (!noCautionSound && tone === 'caution') {
      this.uiSounds?.playCaution();
    }
    this.modalOverlays?.showMessageAlert(message, title, alertOptions);
  }

  /**
   * Full-screen confirm — same visual language as bug-report thank-you.
   * Audio: shelf show/hide via overlay only (podium-style up/down), no notification/caution stack.
   * @param {{ messageHtml: string, cancelLabel?: string, confirmLabel?: string, onConfirm?: () => void, onCancel?: () => void }} opts
   */
  showFullscreenPrompt(opts = {}) {
    const rest = { ...opts };
    delete rest.modalTone;
    delete rest.noModalToneSound;
    this.modalOverlays?.showFullscreenPrompt(rest);
  }

  /**
   * Show the shelf .panels scrollbar only while actively scrolling. Scroll is coalesced
   * to one rAF per frame (trackpads emit many events/sec); do not add CSS transitions
   * on ::-webkit-scrollbar-thumb — that plus scroll repaints hammers the compositor.
   */
  setupPanelsScrollbarReveal() {
    const el = this.dom.panelsContainer;
    const rail = this.dom.shelfScrollbar;
    const thumb = this.dom.shelfScrollbarThumb;
    if (!el || !rail || !thumb) return;
    const revealClass = 'is-revealed';
    let hideTimer = null;
    let rafId = 0;
    let shelfScrollActive = false;
    const emitPanelsScrolling = (active) => {
      if (!!active === shelfScrollActive) return;
      shelfScrollActive = !!active;
      this.eventBus.emit('ui:panels-scrolling', { active: shelfScrollActive });
    };

    const syncThumb = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 1) {
        thumb.style.height = '0px';
        thumb.style.transform = 'translateY(0px)';
        return;
      }
      const travel = scrollHeight - clientHeight;
      const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
      const maxOffset = Math.max(0, clientHeight - thumbHeight);
      const offset = travel > 0 ? (scrollTop / travel) * maxOffset : 0;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${offset}px)`;
    };

    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        syncThumb();
        rail.classList.add(revealClass);
        emitPanelsScrolling(true);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          rail.classList.remove(revealClass);
          hideTimer = null;
          emitPanelsScrolling(false);
        }, 500);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', syncThumb);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => syncThumb());
      observer.observe(el);
    }
    syncThumb();
  }


  // bindMeshControls() - Moved to MeshControls.js

  // bindStudioControls() - Moved to StudioControls.js

  // bindRenderControls() - Moved to RenderControls.js

  // bindGlobalControls() - Moved to GlobalControls.js

  // bindKeyboardShortcuts() - Moved to GlobalControls.js

  // bindAnimationControls() - Moved to AnimationControls.js

  // applyStudioPresetX() - Moved to GlobalControls.js

  // bindCopyButtons() - Moved to ResetControls.js

  // bindLocalResetButtons() - Moved to ResetControls.js

  toggleUi(forceState) {
    const nextState =
      typeof forceState === 'boolean' ? forceState : !this.uiHidden;
    this.uiHidden = nextState;
    document.body.classList.toggle('ui-hidden', this.uiHidden);
    if (this.shelfRevealed && this.dom.shelf) {
      if (this.uiHidden) {
        this.dom.shelf.classList.add('is-shelf-hidden');
        this.uiSounds?.playShelfHide();
      } else {
        requestAnimationFrame(() => {
          if (!this.dom.shelf || this.uiHidden) return;
          this.dom.shelf.classList.remove('is-shelf-hidden');
          this.uiSounds?.playShelfShow();
        });
      }
    }
    // Update start menu visibility when UI is toggled (refresh with current intended state)
    if (this.startMenuController) {
      this.startMenuController.updateVisibility();
    }
    if (this.uiHidden) {
      document.activeElement?.blur?.();
    }
    if (this.dom.toggleUi) {
      this.dom.toggleUi.textContent = this.uiHidden ? 'V Show UI' : 'V Hide UI';
      this.dom.toggleUi.blur?.();
    }
  }

  // ============================================
  // Unified Utility Methods
  // ============================================

  /**
   * Format slider value with appropriate unit and decimals
   * @param {number} value - The numeric value
   * @param {string} type - Format type: 'angle', 'distance', 'multiplier', 'decimal', 'integer'
   * @param {number} decimals - Optional override for decimal places
   * @returns {string} Formatted string
   */
  formatSliderValue(value, type = 'decimal', decimals = null) {
    if (!Number.isFinite(value)) return '—';
    
    if (type === 'kelvin') {
      const rounded = Math.round(value);
      return `${rounded}K`;
    }

    const formatMap = {
      angle: { decimals: 0, unit: '°' },
      distance: { decimals: 2, unit: 'm' },
      multiplier: { decimals: 2, unit: '×' },
      decimal: { decimals: 2, unit: '' },
      integer: { decimals: 0, unit: '' },
    };
    
    const config = formatMap[type] || formatMap.decimal;
    const dec = decimals !== null ? decimals : config.decimals;
    const formatted = dec === 0 ? Math.round(value).toString() : value.toFixed(dec);
    return config.unit ? `${formatted}${config.unit}` : formatted;
  }

  /**
   * Update value label for a slider
   * @param {string} key - The data-output key
   * @param {string|number} value - The value to display (or formatted string)
   * @param {string} type - Format type if value is number
   * @param {number} decimals - Optional override for decimal places
   */
  updateValueLabel(key, value, type = null, decimals = null) {
    this.helpers?.updateValueLabel(key, value, type, decimals);
  }

  /**
   * Setup global slider fill updates for all range inputs
   * This ensures all sliders get the fill effect automatically
   */
  setupSliderFillUpdates() {
    // Add global listener for all slider inputs
    document.addEventListener('input', (event) => {
      if (event.target.type === 'range') {
        this.updateSliderFill(event.target);
      }
    }, true); // Use capture phase to catch all events
    
    // Initialize fill for all existing sliders
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      this.updateSliderFill(slider);
    });
  }

  /**
   * Update slider fill effect using CSS variable
   * Calculates fill percentage based on slider value, min, and max
   * Supports both left-to-right fill and center-outward fill for centered sliders
   * @param {HTMLInputElement} slider - The slider input element
   */
  updateSliderFill(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Skip temperature and tint sliders (they have custom gradients)
    const sliderLine = slider.closest('.slider-line');
    if (sliderLine?.classList.contains('slider-line--temperature') || 
        sliderLine?.classList.contains('slider-line--tint')) {
      return;
    }
    
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    
    // Detect if this is a centered slider (min < 0 and max > 0)
    const isCentered = min < 0 && max > 0;
    
    if (isCentered) {
      // Center-outward fill: fill from center point outward
      const center = 0;
      const range = max - min;
      const centerPercent = ((center - min) / range) * 100; // Position of center on track
      
      if (value === center) {
        // At center: no fill
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      } else if (value > center) {
        // Positive value: fill from center to value (right side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${valuePercent}%`);
      } else {
        // Negative value: fill from value to center (left side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${valuePercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      }
    } else {
      // Left-to-right fill: fill from 0% to value percentage
      const range = max - min;
      const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
      slider.style.setProperty('--slider-fill-start', '0%');
      slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
    }
  }

  /**
   * Apply snap-to-center for sliders with center default values
   * @param {HTMLInputElement} slider - The slider input element
   * @param {number} min - Minimum slider value
   * @param {number} max - Maximum slider value
   * @param {number} centerValue - The center/default value to snap to
   * @param {Event|null} [inputEvent] - Original input event; when non-trusted (e.g. synthetic `input` from keyboard stepping), snap is skipped.
   * @param {number} thresholdPercent - Threshold as percentage of range (default: 3%)
   * @returns {number} - The value (snapped if within threshold, otherwise original)
   */
  applySnapToCenter(slider, min, max, centerValue, inputEvent = null, thresholdPercent = 3) {
    if (!slider) return parseFloat(slider.value);

    const currentValue = parseFloat(slider.value);

    if (inputEvent != null && inputEvent.isTrusted === false) {
      return Number.isFinite(currentValue) ? currentValue : centerValue;
    }

    const range = max - min;
    const threshold = (range * thresholdPercent) / 100;
    const distanceFromCenter = Math.abs(currentValue - centerValue);

    // If within threshold, snap to center
    if (distanceFromCenter <= threshold) {
      slider.value = centerValue;
      return centerValue;
    }

    return currentValue;
  }

  /**
   * Setup keyboard support for all range inputs
   */
  setupSliderKeyboardSupport() {
    // Find all range inputs and ensure they're focusable
    const allSliders = document.querySelectorAll('input[type="range"]');
    allSliders.forEach((slider) => {
      // Ensure focusable
      if (!slider.hasAttribute('tabindex')) {
        slider.setAttribute('tabindex', '0');
      }
      
      // Ensure focus on click
      slider.addEventListener('click', () => {
        slider.focus();
      }, { passive: true });
    });
  }

  /**
   * Enable keyboard arrow key stepping for a slider
   * @param {HTMLInputElement} slider - The slider input element
   * @deprecated - Keyboard stepping is now handled at document level for all sliders
   */
  enableSliderKeyboardStepping(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Just ensure slider is focusable - keyboard handling is done at document level
    slider.setAttribute('tabindex', '0');
    
    // Ensure slider gets focus on click
    slider.addEventListener('click', (event) => {
      if (event.target === slider) {
        slider.focus();
      }
    });
  }

  /**
   * Unified method to set control disabled state
   * @param {string|string[]} inputIds - Single ID or array of IDs
   * @param {boolean} disabled - Whether to disable
   * @param {object} options - Additional options
   */
  setControlDisabled(inputIds, disabled, options = {}) {
    const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
    const { applyBlockMute = false, blockKey = null } = options;
    
    ids.forEach((id) => {
      const input = this.inputs[id];
      if (!input) return;
      
      input.disabled = disabled;
      // Use consistent class name
      input.classList.toggle('is-disabled-handle', disabled);
    });
    
    // Optionally apply block muting
    if (applyBlockMute && blockKey) {
      this.setBlockMuted(blockKey, disabled);
    }
  }

  /** @param {NodeListOf<HTMLInputElement> | HTMLInputElement[] | undefined} radios */
  setRadioGroupDisabled(radios, disabled) {
    if (!radios?.forEach) return;
    radios.forEach((radio) => {
      radio.disabled = disabled;
      radio.classList.toggle('is-disabled-handle', disabled);
    });
  }

  /**
   * Unified color input handler
   * @param {string} inputId - The color input ID
   * @param {string} statePath - StateStore path (e.g., 'clay.color', 'lensFlare.color')
   * @param {string} eventName - Event bus event name
   */
  bindColorInput(inputId, statePath, eventName) {
    const input = this.inputs[inputId];
    if (!input) return;
    
    input.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set(statePath, value);
      this.eventBus.emit(eventName, value);
    });
  }

  /**
   * Sync UI from current state (alias for syncControls)
   */
  syncUIFromState() {
    const state = this.stateStore.getState();
    this.syncControls(state);
  }

  setHdriActive(preset) {
    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === preset);
    });
    if (this.inputs.hdriUploadBtn) {
      this.inputs.hdriUploadBtn.classList.toggle('active', preset === HDRI_CUSTOM_ID);
    }
  }

  static HDRI_UPLOAD_TOOLTIP_EMPTY =
    'Upload custom HDRI (.hdr, .jpg, .png) — 2:1 equirectangular';

  setHdriUploadLoaded(filename = '') {
    const btn = this.inputs.hdriUploadBtn;
    if (!btn) return;
    const name = String(filename || '').trim();
    if (!name) {
      this.clearHdriUploadLoaded();
      return;
    }
    btn.classList.add('is-loaded');
    btn.dataset.tooltip = `Custom HDRI: ${name}`;
  }

  clearHdriUploadLoaded() {
    const btn = this.inputs.hdriUploadBtn;
    if (!btn) return;
    btn.classList.remove('is-loaded');
    btn.dataset.tooltip = UIManager.HDRI_UPLOAD_TOOLTIP_EMPTY;
  }

  syncHdriUploadButton(state) {
    if (state?.hdriCustomName) {
      this.setHdriUploadLoaded(state.hdriCustomName);
    } else {
      this.clearHdriUploadLoaded();
    }
  }

  setCreativeLookActive(preset) {
    if (!this.inputs.creativeLookButtons?.forEach) return;
    this.inputs.creativeLookButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.creativeLook === preset);
    });
  }

  toggleCreativeLookGrid(enabled) {
    if (!this.inputs.creativeLookButtons?.forEach) return;
    this.inputs.creativeLookButtons.forEach((button) => {
      button.disabled = !enabled;
      button.classList.toggle('is-disabled', !enabled);
    });
  }


  toggleHdriControls(enabled) {
    this.inputs.hdriButtons.forEach((button) => {
      button.disabled = !enabled;
      button.classList.toggle('is-disabled', !enabled);
    });
    if (this.inputs.hdriUploadBtn) {
      this.inputs.hdriUploadBtn.disabled = !enabled;
      this.inputs.hdriUploadBtn.classList.toggle('is-disabled', !enabled);
    }
    // Block muting handled by applyBlockStates via syncControls
    this.inputs.hdriBackground.disabled = !enabled;
    this.updateHdriReceiveShadowsAoDisabled();
      this.inputs.hdriStrength.disabled = !enabled;
      this.inputs.hdriBlurriness.disabled = !enabled;
      if (this.inputs.hdriRotation) {
        this.inputs.hdriRotation.disabled = !enabled;
      }
    if (!enabled) {
      this.inputs.backgroundColor.disabled = false;
    }
    this.updateHdriReceiveShadowsAoDisabled();
    this.updateLensFlareControlsDisabled();
  }

  updateHdriReceiveShadowsAoDisabled() {
    if (!this.inputs.hdriReceiveShadowsAo) return;
    const hdriOn = !!this.inputs.hdriEnabled?.checked;
    const backdropOn = hdriOn && !!this.inputs.hdriBackground?.checked;
    this.inputs.hdriReceiveShadowsAo.disabled = !backdropOn;
  }

  updateLensFlareControlsDisabled() {
    if (!this.inputs.lensFlareEnabled) return;
    const hdriActive = !!this.inputs.hdriEnabled?.checked;
    const enabled = hdriActive && !!this.inputs.lensFlareEnabled.checked;
    
    // Disable lens flare toggle if HDRI is off
    this.setControlDisabled('lensFlareEnabled', !hdriActive);
    
    // Disable lens flare controls if not enabled
    this.setControlDisabled(
      ['lensFlareRotation', 'lensFlareHeight', 'lensFlareHalo', 'lensFlareColor', 'lensFlareQuality'],
      !enabled,
    );
    
    // Block muting handled by applyBlockStates via syncControls
  }

  setDropzoneVisible(visible) {
    if (!visible) {
      document.documentElement.classList.remove('orby-home-scroll');
    }
    if (this.startMenuController) {
      this.startMenuController.setVisible(visible);
    }
  }

  /**
   * Full session reset: tear down WebGL, restore defaults, return to the marketing home.
   */
  async returnToHome() {
    const scene = window.orby?.scene;
    if (scene?.isStudioReady) {
      await scene.shutdownStudio();
    }
    const snapshot = this.stateStore.reset();
    this.syncControls(snapshot);
    this.eventBus.emit('app:reset');
    this.activeTab = 'mesh';
    this.shelfRevealed = false;
    if (this.dom.shelf) {
      this.dom.shelf.classList.add('is-shelf-hidden');
    }
    this.setDropzoneVisible(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * @param {{ skipSound?: boolean }} [opts] Skip shelf-open SFX (e.g. first studio entrance so it does not stack on scene open).
   */
  revealShelf(opts = {}) {
    if (!this.dom.shelf) return;
    this.shelfRevealed = true;
    const wasHidden = this.dom.shelf.classList.contains('is-shelf-hidden');
    const skipSound = opts.skipSound === true;
    const apply = () => {
      if (!this.dom.shelf || this.uiHidden) return;
      this.dom.shelf.classList.remove('is-shelf-hidden');
      if (wasHidden && !skipSound) this.uiSounds?.playShelfShow();
    };
    // Dropzone hide uses rAF — double rAF lands after that layout so the shelf reveal always applies.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        apply();
        window.orby?.scene?.handleResize?.();
      });
    });
  }

  /**
   * @param {{ caution?: boolean, notification?: boolean, modalTone?: 'caution' | 'notification' | 'none' }} [toastOptions] `caution` / `notification` override inference when set to true; `false` disables that cue.
   */
  showToast(message, durationMs = 3200, toastOptions = {}) {
    const text = typeof message === 'string' ? message : String(message ?? '');
    if (text.length > LONG_TOAST_CHAR_THRESHOLD) {
      const tone =
        toastOptions?.modalTone ?? (inferToastCaution(text) ? 'caution' : 'notification');
      this.showMessageAlert(text, 'Message', { modalTone: tone });
      return;
    }
    this._toastQueue.push({ text, durationMs, toastOptions });
    void this._drainToastQueue();
  }

  _clearActiveToast() {
    if (this._activeToastTimer) {
      clearTimeout(this._activeToastTimer);
      this._activeToastTimer = null;
    }
    if (this._activeToastEl?.isConnected) {
      this._activeToastEl.remove();
    }
    this._activeToastEl = null;
  }

  /**
   * Show one toast and resolve when its display duration ends.
   * @param {{ text: string, durationMs: number, toastOptions: object }} item
   * @returns {Promise<void>}
   */
  _presentToast(item) {
    const { text, durationMs, toastOptions } = item;
    const wantCaution =
      toastOptions?.caution === true
      || (toastOptions?.caution !== false && inferToastCaution(text));
    if (wantCaution) this.uiSounds?.playCaution();

    const template = this.dom.toastTemplate?.content?.firstElementChild;
    if (!template) return Promise.resolve();

    this._clearActiveToast();

    const toast = template.cloneNode(true);
    toast.querySelector('.toast-message').textContent = text;
    document.body.appendChild(toast);
    this._activeToastEl = toast;

    return new Promise((resolve) => {
      this._activeToastTimer = setTimeout(() => {
        toast.remove();
        if (this._activeToastEl === toast) {
          this._activeToastEl = null;
        }
        this._activeToastTimer = null;
        resolve();
      }, durationMs);
    });
  }

  async _drainToastQueue() {
    if (this._toastQueueActive) return;
    this._toastQueueActive = true;
    try {
      while (this._toastQueue.length > 0) {
        const item = this._toastQueue.shift();
        await this._presentToast(item);
      }
    } finally {
      this._toastQueueActive = false;
      if (this._toastQueue.length > 0) {
        void this._drainToastQueue();
      }
    }
  }

  copySettingsToClipboard(message, payload) {
    const text = JSON.stringify(payload, null, 2);
    const write = async () => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    };
    write()
      .then(() => this.showToast(message, 3200, { notification: false }))
      .catch(() => this.showToast('Copy failed', 3200, { caution: true }));
  }

  loadRenderSettingsFromText(text) {
    try {
      const payload = JSON.parse(text);
      
      // Validate that it looks like FX settings
      const expectedKeys = [
        'dof',
        'bloom',
        'grain',
        'aberration',
        'ambientOcclusion',
        'fresnel',
        'exposure',
        'background',
        'camera',
      ];
      const hasExpectedKeys = expectedKeys.some(key => key in payload);
      
      if (!hasExpectedKeys) {
        this.showToast('Invalid FX settings - missing required fields');
        return;
      }

      // Apply DOF settings
      if (payload.dof) {
        const dof = sanitizeDof(payload.dof);
        this.stateStore.set('dof', dof);
        this.eventBus.emit('render:dof', dof);
        this.setEffectControlsDisabled(
          ['dofFocus', 'dofAperture', 'dofQuality'],
          !payload.dof.enabled,
        );
      }

      // Apply Bloom settings
      if (payload.bloom) {
        this.stateStore.set('bloom', payload.bloom);
        this.eventBus.emit('render:bloom', payload.bloom);
        this.setEffectControlsDisabled(
          ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor', 'bloomQuality'],
          !payload.bloom.enabled,
        );
      }

      // Apply Grain settings
      if (payload.grain) {
        this.stateStore.set('grain', payload.grain);
        this.eventBus.emit('render:grain', payload.grain);
        this.setEffectControlsDisabled(['grainIntensity'], !payload.grain.enabled);
      }

      // Apply Aberration settings
      if (payload.aberration) {
        const ab = mergeAberrationSettings(payload.aberration);
        this.stateStore.set('aberration', ab);
        this.eventBus.emit('render:aberration', ab);
        this.setEffectControlsDisabled(
          ['aberrationAmount'],
          !payload.aberration.enabled,
        );
      }

      if (payload.ambientOcclusion) {
        const ao = sanitizeAmbientOcclusion(payload.ambientOcclusion);
        this.stateStore.set('ambientOcclusion', ao);
        this.eventBus.emit('render:ambient-occlusion', ao);
        const muted = !ao.enabled;
        this.setEffectControlsDisabled(
          [
            'ambientOcclusionIntensity',
            'ambientOcclusionRadius',
            'ambientOcclusionColor',
            'ambientOcclusionQuality',
          ],
          muted,
        );
      }

      // Apply Fresnel settings
      if (payload.fresnel) {
        this.stateStore.set('fresnel', payload.fresnel);
        this.eventBus.emit('render:fresnel', payload.fresnel);
        this.setEffectControlsDisabled(
          ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
          !payload.fresnel.enabled,
        );
      }

      // Apply Camera settings
      if (payload.camera) {
        if (payload.camera.fov !== undefined) {
          this.stateStore.set('camera.fov', payload.camera.fov);
          this.eventBus.emit('camera:fov', payload.camera.fov);
        }
        if (payload.camera.lensFocalMm !== undefined) {
          this.stateStore.set('camera.lensFocalMm', payload.camera.lensFocalMm);
        }
        if (payload.camera.lensSensorId !== undefined) {
          this.stateStore.set('camera.lensSensorId', payload.camera.lensSensorId);
        }
        if (payload.camera.tilt !== undefined) {
          this.stateStore.set('camera.tilt', payload.camera.tilt);
          this.eventBus.emit('camera:tilt', payload.camera.tilt);
        }
        if (payload.camera.contrast !== undefined) {
          this.stateStore.set('camera.contrast', payload.camera.contrast);
          this.eventBus.emit('render:contrast', payload.camera.contrast);
        }
        if (payload.camera.temperature !== undefined) {
          this.stateStore.set('camera.temperature', payload.camera.temperature);
          this.eventBus.emit('render:temperature', payload.camera.temperature);
        }
        if (payload.camera.tint !== undefined) {
          this.stateStore.set('camera.tint', payload.camera.tint);
          this.eventBus.emit('render:tint', payload.camera.tint / 100);
        }
        if (payload.camera.highlights !== undefined) {
          this.stateStore.set('camera.highlights', payload.camera.highlights);
          this.eventBus.emit('render:highlights', payload.camera.highlights / 100);
        }
        if (payload.camera.shadows !== undefined) {
          this.stateStore.set('camera.shadows', payload.camera.shadows);
          this.eventBus.emit(
            'render:shadows',
            cameraShadowsUiToShader(payload.camera.shadows),
          );
        }
        if (payload.camera.saturation !== undefined) {
          this.stateStore.set('camera.saturation', payload.camera.saturation);
          this.eventBus.emit('render:saturation', payload.camera.saturation);
        }
        const defaultCam = this.stateStore.getDefaults().camera ?? {};
        if (payload.camera.vignetteEnabled !== undefined) {
          this.stateStore.set('camera.vignetteEnabled', !!payload.camera.vignetteEnabled);
        }
        if (payload.camera.vignette !== undefined) {
          this.stateStore.set('camera.vignette', payload.camera.vignette);
        }
        if (payload.camera.vignetteColor !== undefined) {
          this.stateStore.set('camera.vignetteColor', payload.camera.vignetteColor);
          this.eventBus.emit('render:vignette-color', payload.camera.vignetteColor);
        }
        if (
          payload.camera.vignetteEnabled !== undefined
          || payload.camera.vignette !== undefined
        ) {
          const cam = this.stateStore.getState().camera ?? {};
          this.eventBus.emit(
            'render:vignette',
            effectiveVignetteIntensity(cam, defaultCam),
          );
        }
        if (payload.camera.handheld !== undefined) {
          let h = payload.camera.handheld;
          if (h === 'medium') h = 'high';
          this.stateStore.set('camera.handheld', h);
          this.eventBus.emit('camera:handheld', h);
        }
        if (payload.camera.compositionGridEnabled !== undefined) {
          this.stateStore.set(
            'camera.compositionGridEnabled',
            !!payload.camera.compositionGridEnabled,
          );
          this.eventBus.emit(
            'camera:composition-grid',
            !!payload.camera.compositionGridEnabled,
          );
        }
        if (payload.camera.compositionGuidesInverted !== undefined) {
          this.stateStore.set(
            'camera.compositionGuidesInverted',
            !!payload.camera.compositionGuidesInverted,
          );
          this.eventBus.emit(
            'camera:composition-guides-inverted',
            !!payload.camera.compositionGuidesInverted,
          );
        }
        if (payload.camera.cinematicLetterbox219 !== undefined) {
          this.stateStore.set(
            'camera.cinematicLetterbox219',
            !!payload.camera.cinematicLetterbox219,
          );
          this.eventBus.emit(
            'camera:cinematic-letterbox-219',
            !!payload.camera.cinematicLetterbox219,
          );
        }
      }

      // Apply Exposure
      if (payload.exposure !== undefined) {
        this.stateStore.set('exposure', payload.exposure);
        this.eventBus.emit('scene:exposure', payload.exposure);
      }

      // Apply Auto Exposure
      if (payload.autoExposure !== undefined) {
        this.stateStore.set('autoExposure', payload.autoExposure);
        this.eventBus.emit('camera:auto-exposure', payload.autoExposure);
      }

      if (payload.toneCurve) {
        this.stateStore.set('toneCurve', payload.toneCurve);
        this.eventBus.emit('render:tone-curve', this.stateStore.getState().toneCurve);
      }

      // Apply Lens Dirt
      if (payload.lensDirt) {
        this.stateStore.set('lensDirt', payload.lensDirt);
        this.eventBus.emit('render:lens-dirt', payload.lensDirt);
        this.setEffectControlsDisabled(
          ['lensDirtStrength', 'lensDirtTintColor'],
          !payload.lensDirt.enabled,
        );
      }

      if (payload.fisheye) {
        this.stateStore.set('fisheye', payload.fisheye);
        this.eventBus.emit('camera:fisheye');
        this.setEffectControlsDisabled(
          [
            'fisheyeHorizontalFOV',
            'fisheyeStrength',
            'fisheyeCylindricalRatio',
          ],
          !payload.fisheye.enabled,
        );
      }

      if (payload.colorChecker !== undefined) {
        const base = this.stateStore.getDefaults().colorChecker;
        this.stateStore.set('colorChecker', {
          ...base,
          ...(payload.colorChecker && typeof payload.colorChecker === 'object'
            ? payload.colorChecker
            : {}),
        });
        this.eventBus.emit('scene:color-checker');
      }

      if (payload.renderQuality !== undefined) {
        const q = payload.renderQuality;
        this.stateStore.set(
          'renderQuality',
          q === 'medium' || q === 'low' ? q : 'max',
        );
      } else if (payload.performanceMode !== undefined) {
        this.stateStore.set(
          'renderQuality',
          payload.performanceMode ? 'low' : 'medium',
        );
      }

      // Apply Anti-aliasing
      if (payload.antiAliasing !== undefined) {
        this.stateStore.set('antiAliasing', payload.antiAliasing);
        this.eventBus.emit('render:anti-aliasing', payload.antiAliasing);
      }

      // Apply Tone Mapping
      if (payload.toneMapping !== undefined) {
        this.stateStore.set('toneMapping', payload.toneMapping);
        this.eventBus.emit('render:tone-mapping', payload.toneMapping);
      }

      // Apply Background
      if (payload.background !== undefined) {
        this.stateStore.set('background', payload.background);
        this.eventBus.emit('scene:background', payload.background);
      }

      this.eventBus.emit('render:apply-performance');

      // Sync UI to reflect loaded values
      this.syncControls(this.stateStore.getState());
      this.showToast('FX settings loaded', 3200, { notification: false });
    } catch (error) {
      console.error('Error loading FX settings:', error);
      this.showToast('Failed to load FX settings - invalid JSON');
    }
  }


  updateStats(stats) {
    if (!stats) return;
    const mapping = {
      assetname: stats.assetName ?? '—',
      generator: stats.generator ?? '—',
      version: stats.version ?? '—',
      copyright: stats.copyright ?? '—',
      triangles: stats.triangles?.toLocaleString() ?? '—',
      vertices: stats.vertices?.toLocaleString() ?? '—',
      materials: stats.materials?.toString() ?? '—',
      textures: stats.textures?.toString() ?? '—',
      filesize: stats.fileSize ?? '—',
      bounds: stats.bounds ?? '—',
    };
    Array.from(this.dom.stats.querySelectorAll('div')).forEach((row) => {
      const label = row.querySelector('dt')?.textContent?.toLowerCase();
      const key = label?.replace(/\s/g, '');
      const targetKey =
        {
          assetname: 'assetname',
          generator: 'generator',
          version: 'version',
          copyright: 'copyright',
          triangles: 'triangles',
          vertices: 'vertices',
          materials: 'materials',
          textures: 'textures',
          filesize: 'filesize',
          bounds: 'bounds',
        }[key] ?? key;
      const dd = row.querySelector('dd');
      if (dd && mapping[targetKey] !== undefined) {
        dd.textContent = mapping[targetKey];
      }
    });
  }

  updateTitle(filename) {
    document.title = `Orby — ${filename}`;
    if (this.dom.topBarTitle) {
      this.dom.topBarTitle.textContent = filename;
    }
  }

  updateTopBarDetail(detail) {
    if (this.dom.topBarAnimation) {
      this.dom.topBarAnimation.textContent = detail;
    }
  }

  beginLoadSpinner() {
    this._loadSpinnerDepth += 1;
    this._syncLoadSpinner();
  }

  endLoadSpinner() {
    this._loadSpinnerDepth = Math.max(0, this._loadSpinnerDepth - 1);
    this._syncLoadSpinner();
  }

  _syncLoadSpinner() {
    const el = this.dom.loadSpinner;
    if (!el) return;
    const on = this._loadSpinnerDepth > 0;
    el.classList.toggle('is-visible', on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  extractAnimationName(fullName) {
    if (!fullName) return 'Animation';
    
    // Split by pipe if present
    const parts = fullName.split('|');
    
    // Find the most meaningful part (usually the last or middle part that's not common prefixes)
    let namePart = fullName;
    if (parts.length > 1) {
      // Skip common prefixes like "Armature", "baselayer", etc.
      const meaningfulParts = parts.filter(part => {
        const lower = part.toLowerCase();
        return !['armature', 'baselayer', 'mixamo', 'root'].includes(lower);
      });
      namePart = meaningfulParts.length > 0 ? meaningfulParts[meaningfulParts.length - 1] : parts[parts.length - 1];
    }
    
    // Convert underscores to spaces and title case
    return namePart
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  setAnimationClips(clips) {
    this.dom.animationSelect.innerHTML = '';
    if (!clips?.length) {
      this.dom.animationBlock.hidden = true;
      this.animationPlaying = false;
      this.dom.playPause.disabled = true;
      this.dom.animationScrub.disabled = true;
      this.dom.animationSelect.disabled = true; // Disable dropdown when no clips
      return;
    }
    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = index;
      const displayName = this.extractAnimationName(clip.name);
      option.textContent = displayName;
      this.dom.animationSelect.appendChild(option);
    });
    this.dom.animationBlock.hidden = false;
    this.dom.playPause.disabled = false;
    this.dom.animationScrub.disabled = false;
    this.dom.animationSelect.disabled = false; // Enable dropdown when clips are available
    this.currentAnimationDuration = clips[0].seconds ?? 0;
  }

  setAnimationPlaying(playing) {
    this.animationPlaying = playing;
    const button = this.dom.playPause;
    const icon = button?.querySelector('i');
    const srLabel = button?.querySelector('.sr-only');

    if (icon) {
      icon.classList.toggle('fa-play', !playing);
      icon.classList.toggle('fa-pause', playing);
    }

    if (srLabel) {
      srLabel.textContent = playing ? 'Pause' : 'Play';
    }

    button?.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
  }

  updateAnimationTime(current, duration) {
    if (!duration) return;
    const clamp = Math.max(0, Math.min(current, duration));
    const minutes = Math.floor(clamp / 60)
      .toString()
      .padStart(1, '0');
    const seconds = Math.floor(clamp % 60)
      .toString()
      .padStart(2, '0');
    this.dom.animationTime.textContent = `${minutes}:${seconds}`;
    const progress = duration === 0 ? 0 : clamp / duration;
    this.dom.animationScrub.value = progress;
  }

  syncMeshControls(state) {
    this.inputs.scale.value = state.scale;
    this.updateValueLabel('scale', state.scale, 'multiplier');
    this.inputs.yOffset.value = state.yOffset;
    this.updateValueLabel('yOffset', state.yOffset, 'distance');
    if (this.inputs.rotationX) {
      this.inputs.rotationX.value = state.rotationX ?? 0;
      this.updateValueLabel('rotationX', state.rotationX ?? 0, 'angle');
    }
    if (this.inputs.rotationY) {
      this.inputs.rotationY.value = state.rotationY ?? 0;
      this.updateValueLabel('rotationY', state.rotationY ?? 0, 'angle');
    }
    if (this.inputs.rotationZ) {
      this.inputs.rotationZ.value = state.rotationZ ?? 0;
      this.updateValueLabel('rotationZ', state.rotationZ ?? 0, 'angle');
    }
    // Widget states are managed via keyboard shortcuts (Q/W/E/R), no UI sync needed
    if (this.inputs.materialBrightness) {
      const brightness = state.material?.brightness ?? DEFAULT_MATERIAL_BRIGHTNESS;
      this.inputs.materialBrightness.value = brightness;
      this.updateValueLabel('materialBrightness', brightness, 'decimal');
    }
    if (this.inputs.materialMetalness) {
      const metalness = state.material?.metalness ?? 0.0;
      this.inputs.materialMetalness.value = metalness;
      this.updateValueLabel('materialMetalness', metalness, 'decimal');
    }
    if (this.inputs.materialRoughness) {
      const roughness = state.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS;
      this.inputs.materialRoughness.value = roughness;
      this.updateValueLabel('materialRoughness', roughness, 'decimal');
    }
    if (this.inputs.materialEmissive) {
      const emissive = state.material?.emissive ?? 0.0;
      this.inputs.materialEmissive.value = emissive;
      this.updateValueLabel('materialEmissive', emissive, 'decimal');
    }
    this.inputs.clayColor.value = state.clay.color;
    if (this.inputs.clayNormalMap) {
      this.inputs.clayNormalMap.checked = state.clay.normalMap !== false;
    }
    /* Subsurface UI sync — enable with SUBSURFACE_FEATURE_ENABLED + index.html subsection.
    if (this.inputs.toggleSubsurface) {
      this.inputs.toggleSubsurface.checked = !!state.subsurface?.enabled;
    }
    if (this.inputs.subsurfaceTranslucency) {
      const tr = Math.min(1, Math.max(0, Number(state.subsurface?.translucency ?? 0)));
      const trSafe = Number.isFinite(tr) ? tr : 0;
      if (document.activeElement !== this.inputs.subsurfaceTranslucency) {
        this.inputs.subsurfaceTranslucency.value = trSafe;
        this.updateValueLabel('subsurfaceTranslucency', trSafe, 'decimal');
      }
    }
    if (this.inputs.subsurfaceScatterTint) {
      const st = state.subsurface?.scatterTint ?? '#ffd4b8';
      const valid =
        typeof st === 'string' && /^#[0-9A-Fa-f]{6}$/.test(st) ? st : '#ffd4b8';
      if (document.activeElement !== this.inputs.subsurfaceScatterTint) {
        this.inputs.subsurfaceScatterTint.value = valid;
      }
    }
    this.setEffectControlsDisabled(
      ['subsurfaceTranslucency', 'subsurfaceScatterTint'],
      !state.subsurface?.enabled,
    );
    */
    if (state.wireframe) {
      if (this.inputs.wireframeColor) {
        this.inputs.wireframeColor.value = state.wireframe.color;
      }
      if (this.inputs.wireframeAlwaysOn) {
        this.inputs.wireframeAlwaysOn.checked = !!state.wireframe.alwaysOn;
      }
      if (this.inputs.wireframeOnlyVisibleFaces) {
        this.inputs.wireframeOnlyVisibleFaces.checked = !!state.wireframe.onlyVisibleFaces;
      }
    }
    
    // Radio buttons
    this.inputs.autoRotate.forEach((input) => {
      input.checked = parseFloat(input.value) === state.autoRotate;
    });
    // Sync camera auto-orbit
    if (this.inputs.cameraAutoOrbit) {
      const autoOrbitValue = state.camera?.autoOrbit ?? 'off';
      this.inputs.cameraAutoOrbit.forEach((radio) => {
        radio.checked = radio.value === autoOrbitValue;
      });
    }
    if (this.inputs.cameraHandheld) {
      let handheldValue = state.camera?.handheld ?? 'off';
      if (handheldValue === 'medium') handheldValue = 'high';
      this.inputs.cameraHandheld.forEach((radio) => {
        radio.checked = radio.value === handheldValue;
      });
    }
    this.inputs.shading.forEach((input) => {
      input.checked = input.value === state.shading;
    });
  }

  syncStudioControls(state) {
    this.setHdriActive(state.hdri);
    this.syncHdriUploadButton(state);
    this.inputs.hdriEnabled.checked = !!state.hdriEnabled;
    this.toggleHdriControls(state.hdriEnabled);
    const normalizedStrength = Math.min(
      3,
      Math.max(0, state.hdriStrength / HDRI_STRENGTH_UNIT),
    );
    this.inputs.hdriStrength.value = normalizedStrength;
    this.updateValueLabel('hdriStrength', normalizedStrength, 'decimal');
    if (this.inputs.hdriBlurriness) {
      const blurriness = state.hdriBlurriness ?? 0;
      this.inputs.hdriBlurriness.value = blurriness;
      this.updateValueLabel('hdriBlurriness', blurriness, 'decimal');
    }
    if (this.inputs.hdriRotation) {
      const rotation = state.hdriRotation ?? 0;
      this.inputs.hdriRotation.value = rotation;
      this.updateValueLabel('hdriRotation', rotation, 'angle');
    }
    this.inputs.hdriBackground.checked = state.hdriBackground;
    if (this.inputs.hdriReceiveShadowsAo) {
      this.inputs.hdriReceiveShadowsAo.checked = !!state.hdriReceiveShadowsAo;
    }
    this.updateHdriReceiveShadowsAoDisabled();
    // Background color input is always enabled - color shows when render backdrop is off
    this.inputs.backgroundColor.value = state.background;
    
    // Lens Flare
    if (this.inputs.lensFlareEnabled) {
      this.inputs.lensFlareEnabled.checked = !!state.lensFlare?.enabled;
    }
    if (this.inputs.lensFlareRotation) {
      const rotation = state.lensFlare?.rotation ?? 0;
      this.inputs.lensFlareRotation.value = rotation;
      this.updateValueLabel('lensFlareRotation', rotation, 'angle');
    }
    if (this.inputs.lensFlareHeight) {
      const height = Math.min(
        90,
        Math.max(0, state.lensFlare?.height ?? 0),
      );
      this.inputs.lensFlareHeight.value = height;
      this.updateValueLabel('lensFlareHeight', height, 'angle');
    }
    if (this.inputs.lensFlareHalo) {
      const halo = Math.min(5, Math.max(0, state.lensFlare?.haloIntensity ?? 1));
      this.inputs.lensFlareHalo.value = halo;
      this.updateValueLabel('lensFlareHalo', halo, 'multiplier');
    }
    if (this.inputs.lensFlareColor && state.lensFlare?.color) {
      this.inputs.lensFlareColor.value = state.lensFlare.color;
    }
    if (this.inputs.lensFlareQuality) {
      this.inputs.lensFlareQuality.value = state.lensFlare?.quality ?? 'maximum';
    }
    this.updateLensFlareControlsDisabled();

    // Ground/Podium
    this.inputs.groundSolid.checked = state.groundSolid;
    this.inputs.groundWire.checked = state.groundWire;
    this.inputs.groundSolidColor.value = state.groundSolidColor;
    this.inputs.groundWireColor.value = state.groundWireColor;
    this.inputs.groundWireOpacity.value = state.groundWireOpacity;
    this.updateValueLabel('groundWireOpacity', state.groundWireOpacity, 'decimal');
    this.inputs.groundY.value = state.groundY;
    this.updateValueLabel('groundY', state.groundY, 'distance');
    if (this.inputs.gridY) {
      this.inputs.gridY.value = state.gridY ?? 0;
      this.updateValueLabel('gridY', state.gridY ?? 0, 'distance');
    }
    if (this.inputs.baseScale) {
      this.inputs.baseScale.value = state.baseScale ?? 1;
      this.updateValueLabel('baseScale', state.baseScale ?? 1, 'decimal');
    }
    if (this.inputs.baseMetalness) {
      const vm = state.baseMetalness ?? DEFAULT_MATERIAL_METALNESS;
      this.inputs.baseMetalness.value = vm;
      this.updateValueLabel('baseMetalness', vm, 'decimal');
    }
    if (this.inputs.baseRoughness) {
      const vr = state.baseRoughness ?? DEFAULT_MATERIAL_ROUGHNESS;
      this.inputs.baseRoughness.value = vr;
      this.updateValueLabel('baseRoughness', vr, 'decimal');
    }
    if (this.inputs.baseGlassSurface) {
      this.inputs.baseGlassSurface.checked = !!(
        state.baseGlassSurface ??
        state.podiumReflectMesh ??
        false
      );
    }
    if (this.inputs.baseGlassBrightness) {
      const br = state.baseGlassBrightness ?? DEFAULT_BASE_GLASS_BRIGHTNESS;
      this.inputs.baseGlassBrightness.value = br;
      this.updateValueLabel('baseGlassBrightness', br, 'decimal');
    }
    if (this.inputs.baseGlassBlur) {
      const vb = state.baseGlassBlur ?? DEFAULT_BASE_GLASS_BLUR;
      this.inputs.baseGlassBlur.value = vb;
      this.updateValueLabel('baseGlassBlur', vb, 'decimal');
    }
    if (this.inputs.baseGlassAmount) {
      const va = state.baseGlassAmount ?? DEFAULT_BASE_GLASS_AMOUNT;
      this.inputs.baseGlassAmount.value = va;
      this.updateValueLabel('baseGlassAmount', va, 'decimal');
    }
    if (this.inputs.gridScale) {
      this.inputs.gridScale.value = state.gridScale ?? 1;
      this.updateValueLabel('gridScale', state.gridScale ?? 1, 'decimal');
    }
    if (this.inputs.gridLineWidth) {
      this.inputs.gridLineWidth.value = state.gridLineWidth ?? 1;
      this.updateValueLabel('gridLineWidth', state.gridLineWidth ?? 1, 'decimal');
    }
    
    // Lights
    if (this.inputs.lightsRotation) {
      this.inputs.lightsRotation.value = state.lightsRotation ?? 0;
      this.updateValueLabel('lightsRotation', state.lightsRotation ?? 0, 'angle');
    }
    if (this.inputs.lightsHeight) {
      const heightValue = state.lightsHeight ?? 5;
      this.inputs.lightsHeight.value = heightValue;
      this.updateValueLabel('lightsHeight', heightValue, 'decimal');
    }
    if (this.inputs.lightsMaster) {
      const masterValue = state.lightsMaster ?? 1;
      this.inputs.lightsMaster.value = masterValue;
      this.updateValueLabel('lightsMaster', masterValue, 'decimal');
    }
    if (this.inputs.showLightIndicators) {
      this.inputs.showLightIndicators.checked = !!state.showLightIndicators;
    }
    if (this.inputs.lightsAutoRotate) {
      this.inputs.lightsAutoRotate.checked = !!state.lightsAutoRotate;
      this.setLightsRotationDisabled(!!state.lightsAutoRotate);
    }
    if (this.inputs.lightsCastShadows) {
      this.inputs.lightsCastShadows.checked =
        !!state.lightsEnabled && !!state.lightsCastShadows;
    }
    if (this.inputs.lightsEnabled) {
      this.inputs.lightsEnabled.checked = !!state.lightsEnabled;
    }
    // Update slider states based on master and individual light enabled states
    this.updateLightSliderStates();
    this.inputs.lightControls.forEach((control) => {
      const lightId = control.dataset.light;
      const colorInput = control.querySelector('input[type="color"]');
      if (colorInput && state.lights[lightId]) {
        colorInput.value = state.lights[lightId].color;
      }
    });
    // Sync individual light controls - show BASE values (0-5), global is a multiplier
    if (this.inputs.keyLightStrength && state.lights?.key) {
      const baseIntensity = state.lights.key.intensity ?? 1.28;
      this.inputs.keyLightStrength.value = baseIntensity;
      this.updateValueLabel('keyLightStrength', baseIntensity, 'decimal');
    }
    if (this.inputs.keyLightHeight && state.lights?.key) {
      this.inputs.keyLightHeight.value = state.lights.key.height ?? 5;
      this.updateValueLabel('keyLightHeight', state.lights.key.height ?? 5, 'decimal');
    }
    if (this.inputs.keyLightRotate && state.lights?.key) {
      this.inputs.keyLightRotate.value = state.lights.key.rotate ?? 0;
      this.updateValueLabel('keyLightRotate', state.lights.key.rotate ?? 0, 'angle');
    }
    if (this.inputs.fillLightStrength && state.lights?.fill) {
      const baseIntensity = state.lights.fill.intensity ?? 0.8;
      this.inputs.fillLightStrength.value = baseIntensity;
      this.updateValueLabel('fillLightStrength', baseIntensity, 'decimal');
    }
    if (this.inputs.fillLightHeight && state.lights?.fill) {
      this.inputs.fillLightHeight.value = state.lights.fill.height ?? 3;
      this.updateValueLabel('fillLightHeight', state.lights.fill.height ?? 3, 'decimal');
    }
    if (this.inputs.fillLightRotate && state.lights?.fill) {
      this.inputs.fillLightRotate.value = state.lights.fill.rotate ?? 0;
      this.updateValueLabel('fillLightRotate', state.lights.fill.rotate ?? 0, 'angle');
    }
    if (this.inputs.rimLightStrength && state.lights?.rim) {
      const baseIntensity = state.lights.rim.intensity ?? 0.96;
      this.inputs.rimLightStrength.value = baseIntensity;
      this.updateValueLabel('rimLightStrength', baseIntensity, 'decimal');
    }
    if (this.inputs.rimLightHeight && state.lights?.rim) {
      this.inputs.rimLightHeight.value = state.lights.rim.height ?? 4;
      this.updateValueLabel('rimLightHeight', state.lights.rim.height ?? 4, 'decimal');
    }
    if (this.inputs.rimLightRotate && state.lights?.rim) {
      this.inputs.rimLightRotate.value = state.lights.rim.rotate ?? 0;
      this.updateValueLabel('rimLightRotate', state.lights.rim.rotate ?? 0, 'angle');
    }
    if (this.inputs.ambientLightStrength && state.lights?.ambient) {
      const baseIntensity = state.lights.ambient.intensity ?? 0.48;
      this.inputs.ambientLightStrength.value = baseIntensity;
      this.updateValueLabel('ambientLightStrength', baseIntensity, 'decimal');
    }
    // Sync individual light enabled states
    if (this.inputs.keyLightEnabled && state.lights?.key) {
      this.inputs.keyLightEnabled.checked = state.lights.key.enabled === true;
    }
    if (this.inputs.fillLightEnabled && state.lights?.fill) {
      this.inputs.fillLightEnabled.checked = state.lights.fill.enabled === true;
    }
    if (this.inputs.rimLightEnabled && state.lights?.rim) {
      this.inputs.rimLightEnabled.checked = state.lights.rim.enabled === true;
    }
    if (this.inputs.ambientLightEnabled && state.lights?.ambient) {
      this.inputs.ambientLightEnabled.checked = state.lights.ambient.enabled === true;
    }
    // Sync cast shadows
    if (this.inputs.keyLightCastShadows && state.lights?.key) {
      this.inputs.keyLightCastShadows.checked = state.lights.key.castShadows === true;
    }
    if (this.inputs.fillLightCastShadows && state.lights?.fill) {
      this.inputs.fillLightCastShadows.checked = state.lights.fill.castShadows === true;
    }
    if (this.inputs.rimLightCastShadows && state.lights?.rim) {
      this.inputs.rimLightCastShadows.checked = state.lights.rim.castShadows === true;
    }
    
    // HDRI buttons
    this.inputs.hdriButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.hdri === state.hdri);
    });
  }

  syncRenderControls(state) {
    // DOF
    const dofFocus = Math.max(DOF_FOCUS_MIN_M, state.dof.focus ?? DOF_FOCUS_MIN_M);
    if (dofFocus !== state.dof.focus) {
      this.stateStore.set('dof.focus', dofFocus);
    }
    this.inputs.dofFocus.value = dofFocus;
    this.updateValueLabel('dofFocus', dofFocus, 'distance');
    this.inputs.dofAperture.value = state.dof.aperture;
    this.updateValueLabel('dofAperture', state.dof.aperture, 'decimal', 3);
    this.inputs.toggleDof.checked = !!state.dof.enabled;
    if (this.inputs.dofQuality) {
      const dq = state.dof?.quality;
      this.inputs.dofQuality.value =
        dq === 'low' || dq === 'medium' || dq === 'ultra' ? dq : 'high';
    }
    this.setEffectControlsDisabled(
      ['dofFocus', 'dofAperture', 'dofQuality'],
      !state.dof.enabled,
    );
    
    // Bloom
    this.inputs.bloomThreshold.value = state.bloom.threshold;
    this.updateValueLabel('bloomThreshold', state.bloom.threshold, 'decimal');
    this.inputs.bloomStrength.value = state.bloom.strength;
    this.updateValueLabel('bloomStrength', state.bloom.strength, 'decimal');
    this.inputs.bloomRadius.value = state.bloom.radius;
    this.updateValueLabel('bloomRadius', state.bloom.radius, 'decimal');
    if (this.inputs.bloomColor && state.bloom.color) {
      this.inputs.bloomColor.value = state.bloom.color;
    }
    if (this.inputs.bloomQuality) {
      const quality = state.bloom?.quality;
      this.inputs.bloomQuality.value =
        quality === 'low' || quality === 'high' || quality === 'ultra'
          ? quality
          : 'medium';
    }
    this.inputs.toggleBloom.checked = !!state.bloom.enabled;
    this.setEffectControlsDisabled(
      ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor', 'bloomQuality'],
      !state.bloom.enabled,
    );

    if (this.inputs.lensDirtStrength && state.lensDirt) {
      this.inputs.lensDirtStrength.value = state.lensDirt.strength;
      this.updateValueLabel('lensDirtStrength', state.lensDirt.strength, 'decimal');
    }
    if (this.inputs.lensDirtTintColor && state.lensDirt) {
      this.inputs.lensDirtTintColor.value =
        state.lensDirt.tintColor ?? this.stateStore.getDefaults().lensDirt.tintColor;
    }
    if (this.inputs.lensDirtEnabled) {
      const enabled = !!state.lensDirt?.enabled;
      this.inputs.lensDirtEnabled.checked = enabled;
      this.setEffectControlsDisabled(['lensDirtStrength', 'lensDirtTintColor'], !enabled);
    }
    if (this.inputs.autoExposure) {
      const enabled = !!state.autoExposure;
      this.inputs.autoExposure.checked = enabled;
      this.setEffectControlsDisabled(['exposure'], enabled);
    }
    
    // Grain
    this.inputs.grainIntensity.value = (state.grain.intensity / 0.15).toFixed(2);
    this.updateValueLabel('grainIntensity', state.grain.intensity / 0.15, 'decimal');
    this.inputs.toggleGrain.checked = !!state.grain.enabled;
    this.setEffectControlsDisabled(['grainIntensity'], !state.grain.enabled);
    
    // Aberration
    this.inputs.aberrationAmount.value = state.aberration.amount;
    this.updateValueLabel('aberrationAmount', state.aberration.amount, 'decimal', 4);
    this.inputs.toggleAberration.checked = !!state.aberration.enabled;
    this.setEffectControlsDisabled(
      ['aberrationAmount'],
      !state.aberration.enabled,
    );

    const aoRaw = state.ambientOcclusion ?? {
      enabled: false,
      intensity: 3,
      radius: 1,
      quality: 'medium',
      color: '#080808',
    };
    const ao = sanitizeAmbientOcclusion(aoRaw) ?? aoRaw;
    if (this.inputs.toggleAmbientOcclusion) {
      this.inputs.toggleAmbientOcclusion.checked = !!ao.enabled;
    }
    if (this.inputs.ambientOcclusionIntensity) {
      this.inputs.ambientOcclusionIntensity.value = ao.intensity;
      this.updateValueLabel('ambientOcclusionIntensity', ao.intensity, 'decimal');
    }
    if (this.inputs.ambientOcclusionRadius) {
      this.inputs.ambientOcclusionRadius.value = ao.radius;
      this.updateValueLabel('ambientOcclusionRadius', ao.radius, 'decimal');
    }
    if (this.inputs.ambientOcclusionColor && ao.color) {
      this.inputs.ambientOcclusionColor.value = ao.color;
    }
    if (this.inputs.ambientOcclusionQuality) {
      const qVal = ao.quality === 'low' || ao.quality === 'medium' ? ao.quality : 'max';
      this.inputs.ambientOcclusionQuality.value = qVal;
    }
    const aoMuted = !ao.enabled;
    this.setEffectControlsDisabled(
      [
        'ambientOcclusionIntensity',
        'ambientOcclusionRadius',
        'ambientOcclusionColor',
        'ambientOcclusionQuality',
      ],
      aoMuted,
    );

    // Fresnel
    if (this.inputs.toggleFresnel) {
      this.inputs.toggleFresnel.checked = !!state.fresnel.enabled;
    }
    if (this.inputs.fresnelColor) {
      // Only update if user is not actively interacting
      const isInteracting = this.meshControls?.fresnelInteracting?.color || 
                           document.activeElement === this.inputs.fresnelColor;
      if (!isInteracting) {
        this.inputs.fresnelColor.value = state.fresnel.color;
      }
    }
    if (this.inputs.fresnelRadius) {
      // Only update if user is not actively interacting
      const isInteracting = this.meshControls?.fresnelInteracting?.radius || 
                           document.activeElement === this.inputs.fresnelRadius;
      if (!isInteracting) {
        this.inputs.fresnelRadius.value = state.fresnel.radius;
        this.updateValueLabel('fresnelRadius', state.fresnel.radius, 'decimal');
      }
    }
    if (this.inputs.fresnelStrength) {
      // Only update if user is not actively interacting
      const isInteracting = this.meshControls?.fresnelInteracting?.strength || 
                           document.activeElement === this.inputs.fresnelStrength;
      if (!isInteracting) {
        this.inputs.fresnelStrength.value = state.fresnel.strength;
        this.updateValueLabel('fresnelStrength', state.fresnel.strength, 'decimal');
      }
    }
    this.setEffectControlsDisabled(
      ['fresnelColor', 'fresnelRadius', 'fresnelStrength'],
      !state.fresnel.enabled,
    );
    
    // Camera & Exposure
    const cam = state.camera ?? {};
    const fe = state.fisheye ?? {};
    const feOn = !!fe.enabled;
    if (this.inputs.fisheyeEnabled) {
      this.inputs.fisheyeEnabled.checked = feOn;
    }
    if (this.inputs.fisheyeHorizontalFOV) {
      const h = fe.horizontalFOVDeg ?? 131;
      this.inputs.fisheyeHorizontalFOV.value = h;
      this.updateValueLabel('fisheyeHorizontalFOV', h, 'angle');
    }
    if (this.inputs.fisheyeStrength) {
      const s = fe.strength ?? 0.37;
      this.inputs.fisheyeStrength.value = s;
      this.updateValueLabel('fisheyeStrength', s, 'decimal');
    }
    if (this.inputs.fisheyeCylindricalRatio) {
      const c = fe.cylindricalRatio ?? 4;
      this.inputs.fisheyeCylindricalRatio.value = c;
      this.updateValueLabel('fisheyeCylindricalRatio', c, 'decimal');
    }
    this.setEffectControlsDisabled(
      ['fisheyeHorizontalFOV', 'fisheyeStrength', 'fisheyeCylindricalRatio'],
      !feOn,
    );
    if (this.inputs.cameraTilt) {
      const tilt = cam.tilt ?? 0;
      this.inputs.cameraTilt.value = tilt;
      this.updateValueLabel('cameraTilt', tilt, 'angle');
    }
    this.inputs.exposure.value = state.exposure;
    this.updateValueLabel('exposure', state.exposure, 'decimal');
    if (this.inputs.cameraContrast) {
      const contrast = state.camera?.contrast ?? 1.0;
      this.inputs.cameraContrast.value = contrast;
      this.updateValueLabel('cameraContrast', contrast, 'decimal');
    }
    if (this.inputs.cameraTemperature) {
      const temp = state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K;
      this.inputs.cameraTemperature.value = temp;
      this.updateValueLabel('cameraTemperature', temp, 'kelvin');
    }
    if (this.inputs.cameraTint) {
      const tint = state.camera?.tint ?? 0;
      this.inputs.cameraTint.value = tint;
      this.updateValueLabel('cameraTint', tint, 'integer');
    }
    if (this.inputs.cameraHighlights) {
      const highlights = state.camera?.highlights ?? 0;
      this.inputs.cameraHighlights.value = highlights;
      this.updateValueLabel('cameraHighlights', highlights, 'integer');
    }
    if (this.inputs.cameraShadows) {
      const shadows = clampCameraShadowsUi(state.camera?.shadows ?? 0);
      this.inputs.cameraShadows.value = shadows;
      this.updateValueLabel('cameraShadows', shadows, 'integer');
    }
    if (this.inputs.cameraSaturation) {
      const saturation = state.camera?.saturation ?? 1.0;
      this.inputs.cameraSaturation.value = saturation;
      this.updateValueLabel('cameraSaturation', saturation, 'decimal');
    }
    if (this.inputs.cameraClarity) {
      const clarity = state.camera?.clarity ?? 0;
      this.inputs.cameraClarity.value = clarity;
      this.updateValueLabel('cameraClarity', clarity, 'integer');
    }
    if (this.inputs.cameraFade) {
      const fade = state.camera?.fade ?? 0;
      this.inputs.cameraFade.value = fade;
      this.updateValueLabel('cameraFade', fade, 'integer');
    }
    if (this.inputs.cameraSharpness) {
      const sharpness = state.camera?.sharpness ?? 0;
      this.inputs.cameraSharpness.value = sharpness;
      this.updateValueLabel('cameraSharpness', sharpness, 'integer');
    }
    const vignetteCam = state.camera ?? {};
    const vignetteDefaults = this.stateStore.getDefaults().camera ?? {};
    if (this.inputs.toggleVignette) {
      this.inputs.toggleVignette.checked = isVignetteUiEnabled(vignetteCam);
    }
    if (this.inputs.vignetteIntensity) {
      const vignette = vignetteCam.vignette ?? vignetteDefaults.vignette ?? 0.5;
      this.inputs.vignetteIntensity.value = vignette;
      this.updateValueLabel('vignetteIntensity', vignette, 'decimal');
    }
    if (this.inputs.vignetteColor) {
      const vignetteColor = vignetteCam.vignetteColor ?? '#080808';
      this.inputs.vignetteColor.value = vignetteColor;
    }
    this.setEffectControlsDisabled(
      ['vignetteIntensity', 'vignetteColor'],
      !isVignetteUiEnabled(vignetteCam),
    );
    if (this.inputs.antiAliasing) {
      const aa = getAntiAliasingUiState(
        state.renderQuality,
        state.antiAliasing,
      );
      this.inputs.antiAliasing.value = aa.value;
      this.setControlDisabled('antiAliasing', aa.disabled);
    }
    if (this.inputs.renderQuality) {
      this.inputs.renderQuality.value = state.renderQuality ?? 'medium';
    }
    if (this.inputs.toneMapping) {
      const toneMapping = state.toneMapping ?? 'aces-filmic';
      this.inputs.toneMapping.value =
        toneMapping === 'linear' ? 'none' : toneMapping;
    }
    if (this.inputs.exportSvgColorDetail) {
      this.inputs.exportSvgColorDetail.value =
        state.svgColorDetail === 'low' || state.svgColorDetail === 'medium' || state.svgColorDetail === 'high'
          ? state.svgColorDetail
          : 'high';
    }
  }

  syncControls(state) {
    this.meshControls.sync(state);
    this.studioControls.sync(state);
    this.renderControls.sync(state);
    this.lensControls.sync(state);
    this.isometricControls.sync(state);
    this.applyBlockStates(state);
    this.scheduleAllRangeSliderFills();
  }

  /**
   * After control values change, refresh range slider CSS fill variables once per frame.
   * Coalesces multiple syncControls / notify() bursts into a single DOM pass.
   */
  scheduleAllRangeSliderFills() {
    if (this._rangeSliderFillRafId != null) return;
    this._rangeSliderFillRafId = requestAnimationFrame(() => {
      this._rangeSliderFillRafId = null;
      document.querySelectorAll('input[type="range"]').forEach((slider) => {
        this.helpers.updateSliderFill(slider);
      });
    });
  }

  setEffectControlsDisabled(ids, disabled) {
    this.setControlDisabled(ids, disabled);
  }

  setLightsRotationDisabled(disabled) {
    this.setControlDisabled('lightsRotation', disabled);
  }

  resetIndividualLight(lightId, defaults) {
    if (!defaults) return;
    this.stateStore.set(`lights.${lightId}`, defaults);
    Object.keys(defaults).forEach((property) => {
      this.eventBus.emit('lights:update', {
        lightId,
        property,
        value: defaults[property],
      });
    });
    this.syncUIFromState();
  }

  setLightsRotation(value) {
    if (!this.inputs.lightsRotation) return;
    const normalized = ((value % 360) + 360) % 360;
    this.inputs.lightsRotation.value = normalized;
    this.updateValueLabel('lightsRotation', normalized, 'angle');
  }

  setBlockMuted(blockKey, muted) {
    // First try to find a subsection (for merged blocks)
    const subsection = this.dom?.subsections?.[blockKey];
    if (subsection) {
      subsection.classList.toggle('is-muted', muted);
      return;
    }
    // Fall back to regular block
    const block = this.dom?.blocks?.[blockKey];
    if (!block) {
      // Silently fail - block might not exist yet or key might be wrong
      return;
    }
    // Only toggle the class - don't affect other blocks
    block.classList.toggle('is-muted', muted);
  }

  applyBlockStates(state) {
    // Use the latest state to ensure accuracy
    const currentState = state || this.stateStore.getState();
    
    // Apply muting based on current state - each block is independent
    // Each block is evaluated independently based on its own state property
    // This ensures only the correct block is muted when its toggle is changed
    
    // HDRI block - only muted if hdriEnabled is false
    this.setBlockMuted('hdri', !currentState.hdriEnabled);

    this.setBlockMuted('creative-look', !currentState.creativeLook?.enabled);

    const creativeLookLocksMaterial = !!currentState.creativeLook?.enabled;
    this.setBlockMuted('material', creativeLookLocksMaterial);
    this.setControlDisabled(
      [
        'materialBrightness',
        'materialMetalness',
        'materialRoughness',
        'materialEmissive',
      ],
      creativeLookLocksMaterial,
    );

    const isoOn = !!currentState.camera?.isometric?.enabled;
    const fisheyeOn = !!currentState.fisheye?.enabled;

    this.lensControls?.setFovDisabled?.(fisheyeOn);
    this.setControlDisabled('cameraTilt', isoOn);
    this.setControlDisabled('fisheyeEnabled', isoOn);
    this.setBlockMuted('isometric', !isoOn);
    this.setBlockMuted('auto-orbit', isoOn);
    this.setBlockMuted('handheld', isoOn);
    this.setRadioGroupDisabled(this.inputs.cameraAutoOrbit, isoOn);
    this.setRadioGroupDisabled(this.inputs.cameraHandheld, isoOn);
    if (isoOn) {
      this.inputs.cameraAutoOrbit?.forEach((radio) => {
        radio.checked = radio.value === 'off';
      });
      this.inputs.cameraHandheld?.forEach((radio) => {
        radio.checked = radio.value === 'off';
      });
    }

    // Lens flare block - requires both HDRI and lens flare to be enabled
    const lensEnabled = !!currentState.hdriEnabled && !!currentState.lensFlare?.enabled;
    this.setBlockMuted('lens-flare', !lensEnabled || isoOn);
    
    // Lights block - only muted if lightsEnabled is false
    this.setBlockMuted('lights', !currentState.lightsEnabled);
    
    // Base platform — muted when disabled; Base Glass panel only exists once base is enabled
    const podiumOn = !!currentState.groundSolid;
    const glassOn = !!(
      currentState.baseGlassSurface ??
      currentState.podiumReflectMesh ??
      false
    );
    if (this.dom.studioBaseGlassPanel) {
      this.dom.studioBaseGlassPanel.hidden = !podiumOn;
    }
    this.setBlockMuted('base', !podiumOn);
    this.setBlockMuted('base-glass', !glassOn);
    this.setControlDisabled(
      [
        'groundSolidColor',
        'groundY',
        'baseScale',
        'baseMetalness',
        'baseRoughness',
        'baseSnap',
      ],
      !podiumOn,
    );
    this.setControlDisabled('baseGlassBrightness', !glassOn);
    this.setControlDisabled('baseGlassBlur', !glassOn);
    this.setControlDisabled('baseGlassAmount', !glassOn);

    const backdropOn = !!currentState.backdropEnabled;
    this.setBlockMuted('backdrop', !backdropOn);
    this.setControlDisabled(
      [
        'backdropColor',
        'backdropTextureEnabled',
        'backdropTextureScale',
        'backdropScale',
        'backdropWidth',
        'backdropRotation',
        'backdropY',
        'backdropSnap',
      ],
      !backdropOn,
    );
    this.setControlDisabled(
      'backdropTextureScale',
      !(backdropOn && !!currentState.backdropTextureEnabled),
    );

    // Grid block - only muted if groundWire is false
    const gridOn = !!currentState.groundWire;
    this.setBlockMuted('grid', !gridOn);
    this.setControlDisabled(
      ['groundWireColor', 'groundWireOpacity', 'gridLineWidth', 'gridY', 'gridScale', 'gridSnap'],
      !gridOn,
    );
    
    // DOF block - only muted if dof.enabled is false
    this.setBlockMuted('dof', !currentState.dof?.enabled);

    this.setBlockMuted(
      'vignette',
      !isVignetteUiEnabled(currentState.camera ?? {}),
    );

    this.setBlockMuted('fisheye', !fisheyeOn || isoOn);
    
    // Bloom block - only muted if bloom.enabled is false
    this.setBlockMuted('bloom', !currentState.bloom?.enabled);

    const abOn = !!currentState.lensFlare?.anamorphicBloom?.enabled;
    this.setBlockMuted(
      'anamorphic-lens-flare',
      !(isBloomPipelineActive(currentState) && abOn),
    );

    // Lens dirt block - only muted if lens dirt disabled
    this.setBlockMuted('lens-dirt', !currentState.lensDirt?.enabled);
    
    // Grain block - only muted if grain.enabled is false
    this.setBlockMuted('grain', !currentState.grain?.enabled);
    
    // Aberration block - only muted if aberration.enabled is false
    this.setBlockMuted('aberration', !currentState.aberration?.enabled);

    this.setBlockMuted('color-checker', !currentState.colorChecker?.enabled);

    this.setBlockMuted(
      'composition-guides',
      !currentState.camera?.compositionGridEnabled,
    );

    this.setBlockMuted(
      'cinematic-letterbox',
      !currentState.camera?.compositionGridEnabled ||
        !currentState.camera?.cinematicLetterbox219,
    );

    this.setBlockMuted(
      'ambient-occlusion',
      !currentState.ambientOcclusion?.enabled,
    );

    // Fresnel block - only muted if fresnel.enabled is false
    this.setBlockMuted('fresnel', !currentState.fresnel?.enabled);

    const svgExtrudeOn = !!currentState.svgExtrude?.enabled;
    if (this.dom.svgExtrudePanelBlock) {
      this.dom.svgExtrudePanelBlock.hidden = !svgExtrudeOn;
    }

    const fbxSlots = this.dom.subsections?.fbxMapSlots;
    if (fbxSlots) {
      const on = !!currentState.fbxMapSlots?.enabled;
      fbxSlots.hidden = !on;
    }
    if (this.dom.fbxMapSlotsDivider) {
      this.dom.fbxMapSlotsDivider.hidden = !currentState.fbxMapSlots?.enabled;
    }
  }

  setLightColorControlsDisabled(disabled) {
    this.inputs.lightControls.forEach((control) => {
      const input = control.querySelector('input[type="color"]');
      if (!input) return;
      input.disabled = disabled;
      input.classList.toggle('is-disabled-handle', disabled);
    });
    // Disable all light sliders (global, master, and individual)
    this.setControlDisabled([
      'lightsRotation', // Global Rotate
      'lightsHeight',   // Global Height
      'lightsMaster',   // Global Strength
      // Individual light sliders (strength, height, rotate)
      'keyLightStrength',
      'keyLightHeight',
      'keyLightRotate',
      'fillLightStrength',
      'fillLightHeight',
      'fillLightRotate',
      'rimLightStrength',
      'rimLightHeight',
      'rimLightRotate',
      'ambientLightStrength',
    ], disabled);
  }

  updateLightSliderStates() {
    // Update slider states based on master switch and individual light enabled states
    const state = this.stateStore.getState();
    const masterEnabled = state.lightsEnabled;
    
    // Global sliders are enabled if master is on
    this.setControlDisabled('lightsRotation', !masterEnabled);
    this.setControlDisabled('lightsHeight', !masterEnabled);
    this.setControlDisabled('lightsMaster', !masterEnabled);
    
    // Individual light sliders are enabled only if master is on AND that specific light is enabled
    const lightIds = ['key', 'fill', 'rim', 'ambient'];
    lightIds.forEach((lightId) => {
      const lightEnabled = state.lights?.[lightId]?.enabled === true;
      const slidersEnabled = masterEnabled && lightEnabled;
      
      // Apply muted state to subsection (for gray thumbs)
      const subsectionKey = lightId === 'ambient' ? 'ambientLight' : `${lightId}Light`;
      this.setBlockMuted(subsectionKey, !slidersEnabled);
      
      if (lightId === 'ambient') {
        // Ambient only has strength
        this.setControlDisabled('ambientLightStrength', !slidersEnabled);
      } else {
        // Directional lights have strength, height, rotate, and distance
        this.setControlDisabled(`${lightId}LightStrength`, !slidersEnabled);
        this.setControlDisabled(`${lightId}LightHeight`, !slidersEnabled);
        this.setControlDisabled(`${lightId}LightRotate`, !slidersEnabled);
      }
    });
    
    // Color controls are enabled if master is on
    this.inputs.lightControls.forEach((control) => {
      const input = control.querySelector('input[type="color"]');
      if (!input) return;
      input.disabled = !masterEnabled;
      input.classList.toggle('is-disabled-handle', !masterEnabled);
    });
  }

  updateExposureDisplay(value) {
    if (!this.inputs.exposure) return;
    // Update slider value (as number) and label, even when slider is disabled
    this.inputs.exposure.value = value;
    this.updateValueLabel('exposure', parseFloat(value), 'decimal');
  }
}

