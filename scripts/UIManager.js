import {
  applyEffectFoldouts,
  applyMeshFoldouts,
  applyStudioFoldouts,
  applyToggleSectionMute,
} from './ui/effectFoldouts.js';
import { applyCreativeLookPostFxUiBlocks, bindShaderLabBlockedClickHints } from './ui/creativeLookPostFxBlocked.js';
import { getImageExportFormat, normalizeImageExportFormat } from './render/imageExportFormats.js';
import {
  applySavedExportSettings,
  serializeExportSettings,
} from './settings/exportSettingsPersistence.js';
import { isBackgroundFallbackActive } from './render/backgroundFallback.js';
import { HDRI_CUSTOM_ID } from './config/hdri.js';
import {
  MATERIAL_METALNESS_TOOLTIP,
  MATERIAL_METALNESS_MR_MAP_TOOLTIP,
  MATERIAL_METALNESS_AUTHORED_TOOLTIP,
  MATERIAL_ROUGHNESS_TOOLTIP,
  MATERIAL_ROUGHNESS_MR_MAP_TOOLTIP,
  MATERIAL_ROUGHNESS_AUTHORED_TOOLTIP,
  isBloomPipelineActive,
  isBloomTuningActive,
  sanitizeDof,
  sanitizeAmbientOcclusion,
  effectiveVignetteIntensity,
  cameraShadowsUiToShader,
} from './constants.js';
import { SceneSettingsManager } from './settings/SceneSettingsManager.js';
import {
  MODE_CHANGE_TOAST_DURATION_MS,
  formatModeChangeToastMessage,
  modeChangeToastGroupKey,
} from './ui/modeChangeToast.js';
import { UIHelpers } from './ui/UIHelpers.js';
import { MeshControls } from './ui/MeshControls.js';
import { FbxMapSlotsControls } from './ui/FbxMapSlotsControls.js';
import { MapInspectControls } from './ui/MapInspectControls.js';
import { TopologyWarningsControls } from './ui/TopologyWarningsControls.js';
import { StudioControls } from './ui/StudioControls.js';
import { GoboControls } from './ui/GoboControls.js';
import { RenderControls } from './ui/RenderControls.js';
import { LensControls } from './ui/LensControls.js';
import { ViewPresetsControls } from './ui/ViewPresetsControls.js';
import { IsometricControls } from './ui/IsometricControls.js';
import { GlobalControls } from './ui/GlobalControls.js';
import { openInfoSectionTarget } from './ui/infoSections.js';
import { ensureInfoPanelProseLoaded } from './ui/loadInfoPanelProse.js';
import { AnimationControls } from './ui/AnimationControls.js';
import { ExportPreviewControls } from './ui/ExportPreviewControls.js';
import { ExportSectionControls } from './ui/ExportSectionControls.js';
import { FontExtrudeUI } from './ui/FontExtrudeUI.js';
import { ensureSvgExtrudeCoreControlsMounted, ensureSvgExtrudeSurfaceControlsMounted, ensureBaseSurfaceControlsMounted, ensureBaseGlassSurfaceControlsMounted, ensureBackdropSurfaceControlsMounted } from './ui/svgExtrudeControlsShared.js';
import { ResetControls } from './ui/ResetControls.js';
import { BackgroundGradientControls } from './ui/BackgroundGradientControls.js';
import { BackgroundImageControls } from './ui/BackgroundImageControls.js';
import { BackgroundSolidControls } from './ui/BackgroundSolidControls.js';
import { StartMenuController } from './ui/StartMenuController.js';
import {
  buildOfflineExportOverlaySummary,
  OFFLINE_EXPORT_OVERLAY_PREVIEW_JOB,
} from './render/offlineExportOverlaySummary.js';
import { DemoLogotypeController } from './ui/DemoLogotypeController.js';
import { WatermarkController } from './ui/WatermarkController.js';
import { BugReportController } from './ui/BugReportController.js';
import { ShelfOverlaySuppression } from './ui/ShelfOverlaySuppression.js';
import { UISounds } from './ui/UISounds.js';
import { UIManagerModalOverlays } from './ui/UIManagerModalOverlays.js';
import { mergeAberrationSettings } from './render/chromaticAberration.js';
import { creativeLookPresetSupportsMaterialPbrSliders } from './render/CreativeLookMaterials.js';
import { inferToastCaution, resolveToastIconKind } from './ui/toastVariant.js';

/** Toasts longer than this use a dismissible dialog (OK) so they stay readable. */
export const LONG_TOAST_CHAR_THRESHOLD = 110;

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
    this._loadSpinnerElapsedActive = false;
    this._loadSpinnerElapsedStart = 0;
    this._loadSpinnerElapsedIntervalId = null;
    /** Status prefix beside elapsed seconds on #viewportLoadSpinnerElapsed (default `Rendering`). */
    this._loadSpinnerStatusPrefix = 'Rendering';
    this._offlineExportElapsedStart = 0;
    this._offlineExportElapsedIntervalId = null;
    /** @type {Array<{ text: string, durationMs: number, toastOptions: object }>} */
    this._toastQueue = [];
    this._toastQueueActive = false;
    /** Session-only video export camera bookmark (restore enabled when true). */
    this._exportVideoCameraBookmarkSaved = false;
    /** @type {HTMLElement | null} */
    this._activeToastEl = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this._activeToastTimer = null;
    /** Resolves the queued toast currently on screen (see _presentToast). */
    this._activeToastResolve = null;
    /** Dropzone shell only until first model / .orby load. */
    this._studioUiReady = false;
    /** @type {Promise<void> | null} */
    this._studioUiPromise = null;
    this._creativeLookGridEnabled = false;
    this._creativeLookVoxelHdBlocked = false;
  }

  /** Full init (dropzone + studio). Prefer initShell() on marketing home boot. */
  init() {
    this.initShell();
    this._initStudioUi();
  }

  /**
   * Dropzone, toasts, and start menu only — defer studio control modules until first load.
   */
  initShell() {
    this.cacheDom();
    this.animationControls = new AnimationControls(this.eventBus, this);
    this.exportPreviewControls = new ExportPreviewControls(this.eventBus, this);
    this.exportSectionControls = new ExportSectionControls(this);
    this.bindOfflineExportOverlayActions();
    this.uiSounds = new UISounds();
    if (this.dom.uiSoundsEnabled) {
      this.dom.uiSoundsEnabled.checked = this.uiSounds.enabled;
    }
    this.shelfOverlay = new ShelfOverlaySuppression(this);
    this.modalOverlays = new UIManagerModalOverlays(this);
    this.startMenuController = new StartMenuController(this.eventBus, this);
    this.demoLogotype = new DemoLogotypeController();
    this.watermark = new WatermarkController(this);
    this.bugReport = new BugReportController(this);
    this.startMenuController.init();
    this.demoLogotype.init();
    this.watermark.init();
    this.bugReport.init();
  }

  /**
   * Idempotent — studio shelves, control bindings, and scene settings restore.
   * @returns {Promise<void>}
   */
  ensureStudioUiReady() {
    if (this._studioUiReady) return Promise.resolve();
    if (this._studioUiPromise) return this._studioUiPromise;
    this._studioUiPromise = Promise.resolve()
      .then(() => {
        this._initStudioUi();
        this._studioUiReady = true;
        window.orby?.ensureGamepad?.();
      })
      .finally(() => {
        this._studioUiPromise = null;
      });
    return this._studioUiPromise;
  }

  _initStudioUi() {
    if (this._studioUiReady) return;

    this.helpers = new UIHelpers(this.eventBus, this.stateStore, this);
    this.meshControls = new MeshControls(this.eventBus, this.stateStore, this, this.helpers);
    this.fbxMapSlotsControls = new FbxMapSlotsControls(this.eventBus, this.stateStore, this);
    this.mapInspectControls = new MapInspectControls(this.eventBus, this.stateStore, this);
    this.mapInspectControls.setModelAccessors(
      () => window.orby?.scene?.currentModel ?? null,
      (mesh) => window.orby?.scene?.materialController?.isWindowMesh(mesh) ?? false,
      () => window.orby?.scene?.materialController?.originalMaterials ?? null,
    );
    this.topologyWarningsControls = new TopologyWarningsControls(
      this.eventBus,
      this.stateStore,
      this,
    );
    this.topologyWarningsControls.setModelAccessor(
      () => window.orby?.scene?.currentModel ?? null,
    );
    this.studioControls = new StudioControls(this.eventBus, this.stateStore, this, this.helpers);
    this.goboControls = new GoboControls(this.eventBus, this.stateStore, this, this.helpers);
    this.renderControls = new RenderControls(this.eventBus, this.stateStore, this, this.helpers);
    this.backgroundGradientControls = new BackgroundGradientControls(
      this.eventBus,
      this.stateStore,
      this,
      this.helpers,
    );
    this.backgroundSolidControls = new BackgroundSolidControls(
      this.eventBus,
      this.stateStore,
      this,
    );
    this.backgroundImageControls = new BackgroundImageControls(
      this.eventBus,
      this.stateStore,
      this,
    );
    this.lensControls = new LensControls(this.eventBus, this.stateStore, this, this.helpers);
    this.viewPresetsControls = new ViewPresetsControls(this.eventBus, this.stateStore, this);
    this.isometricControls = new IsometricControls(
      this.eventBus,
      this.stateStore,
      this,
      this.helpers,
    );
    this.globalControls = new GlobalControls(this.eventBus, this.stateStore, this, this.helpers);
    this.fontExtrudeUI = new FontExtrudeUI(
      this.eventBus,
      this.stateStore,
      this,
      () => window.orby?.scene,
      this.helpers,
    );
    this.fontExtrudeUI.mount();
    this.fontExtrudeUI.bind();
    this.resetControls = new ResetControls(this.eventBus, this.stateStore, this, this.helpers);
    bindShaderLabBlockedClickHints({
      root: document.querySelector('.panels'),
      isShaderLabActive: () => this.stateStore.getState().creativeLook?.enabled === true,
      getTooltips: () => window.orby?.tooltips,
    });

    this.sceneSettingsManager = new SceneSettingsManager(
      this.eventBus,
      this.stateStore,
      {
        setHdriActive: (hdri) => this.setHdriActive(hdri),
        setHdriUploadLoaded: (name) => this.setHdriUploadLoaded(name),
        setCreativeLookActive: (preset) => this.setCreativeLookActive(preset),
        toggleCreativeLookGrid: (enabled) => this.toggleCreativeLookGrid(enabled),
        toggleHdriControls: (enabled) => this.toggleHdriControls(enabled),
        setLightColorControlsDisabled: (disabled) => this.setLightColorControlsDisabled(disabled),
        setLightsRotationDisabled: (disabled) => this.setLightsRotationDisabled(disabled),
        setEffectControlsDisabled: (controls, disabled) =>
          this.setEffectControlsDisabled(controls, disabled),
        showToast: (message, duration, options) => this.showToast(message, duration, options),
        updateHdriReceiveShadowsAoDisabled: () => this.updateHdriReceiveShadowsAoDisabled?.(),
        syncLensFlareKeyLightConnectButton: () => this.syncLensFlareKeyLightConnectButton?.(),
        loadCustomHdriFile: (file) => window.orby?.scene?.loadCustomHdri?.(file),
        loadCustomBackgroundImageFile: (file) =>
          window.orby?.scene?.loadCustomBackgroundImage?.(file),
        restoreFontExtrudeSettings: (fontExtrude) =>
          this.fontExtrudeUI?.restoreFromSettings?.(fontExtrude),
        serializeExportSettings: () => serializeExportSettings(this.exportSettings),
        restoreExportSettings: (saved) => this.restoreExportSettings(saved),
      },
    );

    this.bindEvents();
    this.stateStore.subscribe((state) => this.syncControls(state));
    this.syncControls(this.stateStore.getState());
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
    ensureSvgExtrudeCoreControlsMounted();
    ensureSvgExtrudeSurfaceControlsMounted();
    ensureBaseSurfaceControlsMounted();
    ensureBaseGlassSurfaceControlsMounted();
    ensureBackdropSurfaceControlsMounted();
    this.dom.canvas = q('#webgl');
    this.dom.viewport = q('.viewport');
    this.dom.exportPreviewBanner = q('#viewportExportPreviewBanner');
    this.dom.exportPreviewExit = q('#viewportExportPreviewExit');
    this.dom.offlineExportOverlay = q('#viewportOfflineExportOverlay');
    this.dom.offlineExportCancel = q('#viewportOfflineExportCancel');
    this.dom.offlineExportGoBack = q('#viewportOfflineExportGoBack');
    this.dom.offlineExportFooter = q('#viewportOfflineExportFooter');
    this.dom.offlineExportSummary = q('#viewportOfflineExportSummary');
    this.dom.offlineExportFrame = q('#viewportOfflineExportFrame');
    this.dom.offlineExportElapsed = q('#viewportOfflineExportElapsed');
    this.dom.offlineExportElapsedValue = q('#viewportOfflineExportElapsedValue');
    this.dom.offlineExportFilename = q('#viewportOfflineExportFilename');
    this.dom.offlineExportFilenameValue = q('#viewportOfflineExportFilenameValue');
    this.dom.offlineExportPreview = q('#viewportOfflineExportPreview');
    this.dom.offlineExportPreviewCanvas = q('#viewportOfflineExportPreviewCanvas');
    this.dom.fullscreenToggle = q('#fullscreenToggle');
    this.dom.loadSpinner = q('#viewportLoadSpinner');
    this.dom.loadSpinnerElapsed = q('#viewportLoadSpinnerElapsed');
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
    this.dom.fbxMapSlotsBlock = q('#fbxMapSlotsBlock');
    this.dom.claySubsectionDivider = q('#claySubsectionDivider');
    this.dom.svgExtrudePanelBlock = q('#svgExtrudePanelBlock');
    this.dom.animationBlock = q('#animationBlock');
    this.dom.animationSelect = q('#animationSelect');
    this.dom.playPause = q('#playPause');
    this.dom.animationReverseBtn = q('#animationReverseBtn');
    this.dom.animationScrub = q('#animationScrub');
    this.dom.animationSpeedSegmented = q('#animationSpeedSegmented');
    this.dom.animationClipModeSegmented = q('#animationClipModeSegmented');
    this.dom.animationJointScaleRow = q('#animationJointScaleRow');
    this.dom.animationBoneStrokeRow = q('#animationBoneStrokeRow');
    this.dom.animationShowJointNamesRow = q('#animationShowJointNamesRow');
    this.dom.animationHideMeshRow = q('#animationHideMeshRow');
    this.dom.animationTime = q('#animationTime');
    this.dom.exportPreviewPlayPause = q('#exportPreviewPlayPause');
    this.dom.exportPreviewReset = q('#exportPreviewReset');
    this.dom.exportPreviewScrub = q('#exportPreviewScrub');
    this.dom.exportPreviewTime = q('#exportPreviewTime');
    this.dom.exportPreviewPauseAll = q('#exportPreviewPauseAll');
    this.dom.exportCapturePreviewThumbWrap = q('#exportCapturePreviewThumbWrap');
    this.dom.exportCapturePreviewThumb = q('#exportCapturePreviewThumb');
    this.dom.exportCapturePreviewThumbEmpty = q('#exportCapturePreviewThumbEmpty');
    this.dom.exportCapturePreviewThumbLabel = q('#exportCapturePreviewThumbLabel');
    this.dom.animationTimeReferenceSection = q('#animationTimeReferenceSection');
    this.dom.animationFrameNumbers = q('#animationFrameNumbers');
    this.dom.clipPlanesFoldout = q('#clipPlanesFoldout');

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
      autoRotateDirection: q('#autoRotateDirection'),
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
      lensFlareStreakLength: q('#lensFlareStreakLength'),
      lensFlareSunDiscScale: q('#lensFlareSunDiscScale'),
      lensFlareSunDiscBlur: q('#lensFlareSunDiscBlur'),
      lensFlareSunDiscColor: q('#lensFlareSunDiscColor'),
      lensFlareDiscGlowIntensity: q('#lensFlareDiscGlowIntensity'),
      lensFlareDiscGlowSize: q('#lensFlareDiscGlowSize'),
      lensFlareDiscGlowColor: q('#lensFlareDiscGlowColor'),
      lensFlareColor: q('#lensFlareColor'),
      lensFlareQuality: q('#lensFlareQuality'),
      godRaysEnabled: q('#godRaysEnabled'),
      godRaysColor: q('#godRaysColor'),
      godRaysLightScale: q('#godRaysLightScale'),
      godRaysOpacity: q('#godRaysOpacity'),
      godRaysDensity: q('#godRaysDensity'),
      godRaysDecay: q('#godRaysDecay'),
      godRaysWeight: q('#godRaysWeight'),
      godRaysExposure: q('#godRaysExposure'),
      godRaysClampMax: q('#godRaysClampMax'),
      godRaysBlur: q('#godRaysBlur'),
      lensFlareSpinDuringOrbit: q('#lensFlareSpinDuringOrbit'),
      lensFlareKeyLightConnect: q('#lensFlareKeyLightConnect'),
      godRaysQuality: q('#godRaysQuality'),
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
      svgExtrudeBevelAmount: q('#svgExtrudeBevelAmount'),
      svgExtrudeDetail: q('#svgExtrudeDetail'),
      svgExtrudeNormalAngle: q('#svgExtrudeNormalAngle'),
      svgExtrudeHardEdgeAngle: q('#svgExtrudeHardEdgeAngle'),
      svgExtrudeFlipDirection: q('#svgExtrudeFlipDirection'),
      svgExtrudeColorOverride: q('#svgExtrudeColorOverride'),
      svgExtrudeColor: q('#svgExtrudeColor'),
      svgExtrudeColorDepths: q('#svgExtrudeColorDepths'),
      svgExtrudeSurfacePreset: q('#svgExtrudeSurfacePreset'),
      svgExtrudeSurfaceScale: q('#svgExtrudeSurfaceScale'),
      svgExtrudeSurfaceStrength: q('#svgExtrudeSurfaceStrength'),
      reverseNormals: q('#reverseNormals'),
      normalView: q('#normalView'),
      normalViewMode: q('#normalViewMode'),
      centerPivotBtn: q('#centerPivotBtn'),
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
      physicalGlassTransmission: q('#physicalGlassTransmission'),
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
      wireframeThickness: q('#wireframeThickness'),
      wireframeOpacity: q('#wireframeOpacity'),
      animationShowBones: q('#animationShowBones'),
      animationShowJointNames: q('#animationShowJointNames'),
      animationTimeReference: q('#animationTimeReference'),
      animationDisplayFps: q('#animationDisplayFps'),
      animationHideMesh: q('#animationHideMesh'),
      animationJointScale: q('#animationJointScale'),
      animationBoneStrokeWidth: q('#animationBoneStrokeWidth'),
      creativeLookEnabled: q('#creativeLookEnabled'),
      creativeLookBloomEnabled: q('#creativeLookBloomEnabled'),
      creativeLookRenderBackdrop: q('#creativeLookRenderBackdrop'),
      creativeLookPauseAnimations: q('#creativeLookPauseAnimations'),
      creativeLookShaderAnimationSpeed: q('#creativeLookShaderAnimationSpeed'),
      creativeLookPatternScale: q('#creativeLookPatternScale'),
      creativeLookTransmissionSamples: q('#creativeLookTransmissionSamples'),
      creativeLookTransmissionDispersion: q('#creativeLookTransmissionDispersion'),
      creativeLookTransmissionSolidMeshGlass: q('#creativeLookTransmissionSolidMeshGlass'),
      creativeLookTransmissionDoubleSide: q('#creativeLookTransmissionDoubleSide'),
      creativeLookSketchStrokeWidth: q('#creativeLookSketchStrokeWidth'),
      creativeLookSketchRasterSize: q('#creativeLookSketchRasterSize'),
      creativeLookInkStrokeColor: q('#creativeLookInkStrokeColor'),
      creativeLookMasterHue: q('#creativeLookMasterHue'),
      creativeLookIntensity: q('#creativeLookIntensity'),
      creativeLookLiftCrush: q('#creativeLookLiftCrush'),
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
      baseSurfacePreset: q('#baseSurfacePreset'),
      baseSurfaceScale: q('#baseSurfaceScale'),
      baseSurfaceStrength: q('#baseSurfaceStrength'),
      baseGlassSurfPreset: q('#baseGlassSurfPreset'),
      baseGlassSurfScale: q('#baseGlassSurfScale'),
      baseGlassSurfStrength: q('#baseGlassSurfStrength'),
      baseGlassSurface: q('#baseGlassSurface'),
      baseGlassBrightness: q('#baseGlassBrightness'),
      baseGlassBlur: q('#baseGlassBlur'),
      baseGlassAmount: q('#baseGlassAmount'),
      backdropEnabled: q('#backdropEnabled'),
      backdropColor: q('#backdropColor'),
      backdropMetalness: q('#backdropMetalness'),
      backdropRoughness: q('#backdropRoughness'),
      backdropSurfacePreset: q('#backdropSurfacePreset'),
      backdropSurfaceScale: q('#backdropSurfaceScale'),
      backdropSurfaceStrength: q('#backdropSurfaceStrength'),
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
      lightsShadowNormalBias: q('#lightsShadowNormalBias'),
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
      keyLightGoboBtn: q('#keyLightGoboBtn'),
      goboButtons: document.querySelectorAll('[data-gobo]'),
      goboEnabled: q('#goboEnabled'),
      goboSoftness: q('#goboSoftness'),
      goboScale: q('#goboScale'),
      goboRotation: q('#goboRotation'),
      fillLightCastShadows: q('#fillLightCastShadows'),
      rimLightCastShadows: q('#rimLightCastShadows'),
      dofFocus: q('#dofFocus'),
      dofFocusMode: q('#dofFocusMode'),
      dofForegroundBlur: q('#dofForegroundBlur'),
      dofBackgroundBlur: q('#dofBackgroundBlur'),
      dofAperture: q('#dofAperture'),
      dofQuality: q('#dofQuality'),
      toggleDof: q('#toggleDof'),
      toggleDofFocusPlane: q('#toggleDofFocusPlane'),
      toggleDofZoomAttenuation: q('#toggleDofZoomAttenuation'),
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
      grainScale: q('#grainScale'),
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
      backgroundSolidEnabled: q('#backgroundSolidEnabled'),
      backgroundGradientEnabled: q('#backgroundGradientEnabled'),
      backgroundGradientStopColor: q('#backgroundGradientStopColor'),
      backgroundGradientAngle: q('#backgroundGradientAngle'),
      backgroundGradientCenterX: q('#backgroundGradientCenterX'),
      backgroundGradientCenterY: q('#backgroundGradientCenterY'),
      backgroundImageEnabled: q('#backgroundImageEnabled'),
      backgroundImageFileInput: q('#backgroundImageFileInput'),
      backgroundImageSelectBtn: q('#backgroundImageSelectBtn'),
      cameraFov: q('#cameraFov'),
      lensSensor: q('#lensSensor'),
      isometricEnabled: q('#isometricEnabled'),
      isoOrbitStep: q('#isoOrbitStep'),
      isoAssetRotateStep: q('#isoAssetRotateStep'),
      isoPanUnlock: q('#isoPanUnlock'),
      fisheyeEnabled: q('#fisheyeEnabled'),
      fisheyeHorizontalFOV: q('#fisheyeHorizontalFOV'),
      fisheyeStrength: q('#fisheyeStrength'),
      fisheyeCylindricalRatio: q('#fisheyeCylindricalRatio'),
      cameraTilt: q('#cameraTilt'),
      cameraPosX: q('#cameraPosX'),
      cameraPosY: q('#cameraPosY'),
      cameraPosZ: q('#cameraPosZ'),
      cameraDistance: q('#cameraDistance'),
      exposure: q('#exposure'),
      autoExposure: q('#autoExposure'),
      manualClipPlanes: q('#manualClipPlanes'),
      cameraClipNear: q('#cameraClipNear'),
      cameraClipFar: q('#cameraClipFar'),
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
      compositionAspectLandscape: q('#compositionAspectLandscape'),
      compositionAspectPortrait: q('#compositionAspectPortrait'),
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
      exportImageSectionOpen: q('#exportImageSectionOpen'),
      exportSvgSectionOpen: q('#exportSvgSectionOpen'),
      exportGlbSectionOpen: q('#exportGlbSectionOpen'),
      exportVideoSectionOpen: q('#exportVideoSectionOpen'),
      exportSvgColorDetail: q('#exportSvgColorDetail'),
      exportImageTransparentSettings: q('#exportImageTransparentSettings'),
      exportPngTransparentSettings: q('#exportPngTransparentSettings'),
      exportPngFolderSettings: q('#exportPngFolderSettings'),
      exportPngFolderLabel: q('#exportPngFolderLabel'),
      exportMp4Settings: q('#exportMp4Settings'),
      exportZoomDistance: q('#exportZoomDistance'),
      exportZoomDistanceSettings: q('#exportZoomDistanceSettings'),
      exportTiltAngle: q('#exportTiltAngle'),
      exportTiltAngleSettings: q('#exportTiltAngleSettings'),
      exportFovOffset: q('#exportFovOffset'),
      exportFovOffsetSettings: q('#exportFovOffsetSettings'),
      exportPitchOffset: q('#exportPitchOffset'),
      exportPitchOffsetSettings: q('#exportPitchOffsetSettings'),
      exportMovementSliders: q('#exportMovementSliders'),
      exportMeshAnimationSelect: q('#exportMeshAnimationSelect'),
      exportMeshAnimationClipWrap: q('#exportMeshAnimationClipWrap'),
      exportMeshAnimationsEmbed: q('#exportMeshAnimationsEmbed'),
      exportMeshAnimationsSettings: q('#exportMeshAnimationsSettings'),
      fbxMapFileInput: q('#fbxMapFileInput'),
      fbxMapMaterial: q('#fbxMapMaterial'),
      fbxMapMaterialLine: q('#fbxMapMaterialLine'),
      fbxMapNormalConvention: q('#fbxMapNormalConvention'),
      fbxMapPbrUvChannel: q('#fbxMapPbrUvChannel'),
      fbxMapOrmPacking: q('#fbxMapOrmPacking'),
      fbxMapRescanFolder: q('#fbxMapRescanFolder'),
      fbxMapApplyTuningAll: q('#fbxMapApplyTuningAll'),
    };

    this.buttons = {
      transformReset: q('#transformReset'),
      exportPng: q('#exportPngButton'),
      exportImage: q('#exportImageButton'),
      exportSvg: q('#exportSvgButton'),
      exportSvgColor: q('#exportSvgColorButton'),
      exportSvgGlb: q('#exportSvgGlbButton'),
      exportVideo: q('#exportVideoButton'),
      exportVideoCapturePreview: q('#exportVideoCapturePreviewButton'),
      exportPngFolderChoose: q('#exportPngFolderChoose'),
      exportVideoCameraSave: q('#exportVideoCameraSaveButton'),
      exportVideoCameraRestore: q('#exportVideoCameraRestoreButton'),
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
      format: 'png',
      transparent: true,
      size: 2,
      sections: {
        image: false,
        svg: false,
        glb: false,
        video: false,
        watermark: false,
      },
      watermark: {
        logo: 'orby',
        placement: 'left',
        credit: 'Lorem Ipsu',
        creditEnabled: false,
        logoScale: 100,
        creditScale: 100,
        logoColor: '#c4ff00',
        logoColorOverride: false,
        creditColor: '#ffffff',
      },
      video: {
        turntable: true,
        orbit: false,
        zoomIn: false,
        zoomOut: false,
        tiltLeft: false,
        tiltRight: false,
        zoomDistance: 1.5,
        tiltAngle: 15,
        fovOffset: 0,
        pitchOffset: 0,
        format: 'mp4',
        durationSec: 5,
        spins: 1,
        subtleSpinDegrees: 0,
        spinDirection: 'forward',
        hdriRotationDegrees: 0,
        fps: 24,
        resolution: '1080p',
        aspectRatio: '16:9',
        mp4Quality: 'medium',
        movTransparent: false,
        meshAnimationsInclude: false,
        meshAnimationClipIndex: 0,
      },
    };

    /** File System Access handle for PNG sequence folder export (session only). */
    this.pngExportDirectoryHandle = null;

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
    this.dom.effectFoldouts = {};
    document.querySelectorAll('[data-effect-foldout]').forEach((el) => {
      const key = el.dataset.effectFoldout;
      if (key) {
        this.dom.effectFoldouts[key] = el;
      }
    });
    // Start menu visibility is managed by StartMenuController
  }

  bindEvents() {
    // Bind all control modules
    this.globalControls.bind();
    this.meshControls.bind();
    this.fbxMapSlotsControls.bind();
    this.mapInspectControls.bind();
    this.topologyWarningsControls.bind();
    this.studioControls.bind();
    this.goboControls.bind();
    this.renderControls.bind();
    this.backgroundGradientControls.bind();
    this.backgroundSolidControls.bind();
    this.backgroundImageControls.bind();
    this.lensControls.bind();
    this.viewPresetsControls.bind();
    this.isometricControls.bind();
    this.animationControls.bind();
    this.exportPreviewControls.bind();
    this.exportSectionControls.bind();
    this.watermark.bind();
    this.resetControls.bind();
    
    // Setup slider utilities
    this.helpers.setupSliderKeyboardSupport();
    this.helpers.setupSliderFillUpdates();
    this.helpers.setupValueLabelInlineEdit();

    document.querySelectorAll('[data-open-info-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = btn.getAttribute('data-open-info-section');
        void ensureInfoPanelProseLoaded().then(() => {
          const tabButton = document.querySelector('[data-tab="info"]');
          tabButton?.click();
          const scrollToTarget = () => {
            const el = sel ? document.querySelector(sel) : null;
            if (!el) return;
            openInfoSectionTarget(el);
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          };
          requestAnimationFrame(() => {
            requestAnimationFrame(scrollToTarget);
          });
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
      // Reflect the actual (on-by-default) preference — the early initShell sync can run
      // before the Information-tab markup is ready, leaving the toggle visually off.
      if (this.uiSounds) toggle.checked = this.uiSounds.enabled;
      toggle.addEventListener('change', () => {
        this.uiSounds?.setEnabled(!!toggle.checked);
      });
    }
    const syncVolumeUi = () => {
      if (!volumeSlider || !this.uiSounds) return;
      this.uiSounds.setMasterVolume(Number(volumeSlider.value) / 100);
      const label = document.querySelector('[data-output="uiSoundsVolume"]');
      if (label) label.textContent = `${volumeSlider.value}%`;
      this.helpers.updateSliderFill(volumeSlider);
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
   * Confirm dialog — resolves true (OK/Yes) or false (Cancel / dismiss).
   * @param {string} message
   * @param {string} [title]
   * @param {{ okLabel?: string, cancelLabel?: string, modalTone?: 'caution' | 'notification' | 'none', noCautionSound?: boolean }} [options]
   * @returns {Promise<boolean>}
   */
  confirmMessageAlert(message, title = 'Message', options = {}) {
    if (!this.modalOverlays?.showMessageAlert || !this.dom.messageAlertModal) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      this.showMessageAlert(message, title, {
        ...options,
        confirm: true,
        onConfirm: () => finish(true),
        onCancel: () => finish(false),
      });
    });
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

  /** @see UIHelpers.updateValueLabel */
  updateValueLabel(key, value, type = null, decimals = null) {
    this.helpers?.updateValueLabel(key, value, type, decimals);
  }

  /** @see UIHelpers.updateSliderFill */
  updateSliderFill(slider) {
    this.helpers?.updateSliderFill(slider);
  }

  /** Preview armed state — export settings stay editable; re-arm handles live updates. */
  setExportVideoPreviewActive(_active) {
    // Intentionally no-op: preview no longer locks export movement controls.
  }

  setExportPreviewBannerVisible(visible) {
    const banner = this.dom.exportPreviewBanner;
    if (!banner) return;
    const on = !!visible;
    banner.hidden = !on;
    banner.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  /** Enable restore once a session camera bookmark exists. */
  setExportVideoCameraBookmarkAvailable(hasBookmark) {
    this._exportVideoCameraBookmarkSaved = !!hasBookmark;
    const save = this.buttons.exportVideoCameraSave;
    const restore = this.buttons.exportVideoCameraRestore;
    if (restore) {
      restore.disabled = !hasBookmark;
      restore.classList.toggle('is-disabled', !hasBookmark);
    }
    if (save) {
      save.disabled = false;
      save.classList.remove('is-disabled');
    }
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
    'Upload custom HDRI (.hdr, .exr, .jpg, .png) — 2:1 equirectangular';

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
      button.classList.toggle(
        'active',
        preset != null && button.dataset.creativeLook === preset,
      );
    });
  }

  /** Mute Voxel HD for generated text (voxelization is unsupported on font extrude). */
  setCreativeLookVoxelHdBlocked(blocked) {
    this._creativeLookVoxelHdBlocked = !!blocked;
    this._syncCreativeLookButtonDisabledState();
  }

  toggleCreativeLookGrid(enabled) {
    this._creativeLookGridEnabled = !!enabled;
    this._syncCreativeLookButtonDisabledState();
  }

  _syncCreativeLookButtonDisabledState() {
    if (!this.inputs.creativeLookButtons?.forEach) return;
    const gridEnabled = this._creativeLookGridEnabled === true;
    this.inputs.creativeLookButtons.forEach((button) => {
      const isVoxelHd = button.dataset.creativeLook === 'voxel-hd';
      const disabled = !gridEnabled || (isVoxelHd && !!this._creativeLookVoxelHdBlocked);
      button.disabled = disabled;
      button.classList.toggle('is-disabled', disabled);
      if (isVoxelHd) {
        if (!button.dataset.tooltipDefault) {
          button.dataset.tooltipDefault = button.getAttribute('data-tooltip') ?? '';
        }
        button.setAttribute(
          'data-tooltip',
          this._creativeLookVoxelHdBlocked
            ? 'Voxel HD is not available for generated text'
            : button.dataset.tooltipDefault,
        );
      }
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
    this.updateHdriBackgroundFallbackVisibility();
    // Block muting handled by applyBlockStates via syncControls
    this.inputs.hdriBackground.disabled = !enabled;
    if (this.inputs.creativeLookRenderBackdrop) {
      this.inputs.creativeLookRenderBackdrop.disabled = !enabled;
    }
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
    this.updateGodRaysControlsDisabled();
  }

  updateHdriBackgroundFallbackVisibility(state = this.stateStore.getState()) {
    const panel =
      this.dom.blocks?.background ??
      document.getElementById('studioBackgroundPanel');
    if (!panel) return;
    panel.hidden = !isBackgroundFallbackActive(state);
  }

  updateHdriReceiveShadowsAoDisabled() {
    if (!this.inputs.hdriReceiveShadowsAo) return;
    const hdriOn = !!this.inputs.hdriEnabled?.checked;
    const backdropOn = hdriOn && !!this.inputs.hdriBackground?.checked;
    this.inputs.hdriReceiveShadowsAo.disabled = !backdropOn;
  }

  /** Keep Studio HDRI and Shader Lab Render Backdrop shortcuts in sync. */
  syncHdriBackgroundCheckboxes(checked, { except = null } = {}) {
    const inputs = [
      this.inputs.hdriBackground,
      this.inputs.creativeLookRenderBackdrop,
    ].filter(Boolean);
    for (const input of inputs) {
      if (input !== except) {
        input.checked = !!checked;
      }
    }
  }

  updateLensFlareControlsDisabled() {
    if (!this.inputs.lensFlareEnabled) return;
    const hdriActive = !!this.inputs.hdriEnabled?.checked;
    const enabled = hdriActive && !!this.inputs.lensFlareEnabled.checked;
    
    // Disable lens flare toggle if HDRI is off
    this.setControlDisabled('lensFlareEnabled', !hdriActive);
    
    // Disable lens flare controls if not enabled
    this.setControlDisabled(
      [
        'lensFlareRotation',
        'lensFlareHeight',
        'lensFlareHalo',
        'lensFlareStreakLength',
        'lensFlareSunDiscScale',
        'lensFlareSunDiscBlur',
        'lensFlareSunDiscColor',
        'lensFlareDiscGlowIntensity',
        'lensFlareDiscGlowSize',
        'lensFlareDiscGlowColor',
        'lensFlareColor',
        'lensFlareQuality',
        'lensFlareSpinDuringOrbit',
        'lensFlareKeyLightConnect',
      ],
      !enabled,
    );

    // Block muting handled by applyBlockStates via syncControls
  }

  syncLensFlareKeyLightConnectButton() {
    const btn = this.inputs.lensFlareKeyLightConnect;
    if (!btn) return;
    const connected = !!this.stateStore.getState().lensFlare?.keyLightConnected;
    btn.textContent = connected
      ? 'Disconnect Key Light Position'
      : 'Connect Key Light Position';
    btn.setAttribute('aria-pressed', connected ? 'true' : 'false');
    btn.classList.toggle('active', connected);
  }

  updateGodRaysControlsDisabled() {
    if (!this.inputs.godRaysEnabled) return;
    const hdriActive = !!this.inputs.hdriEnabled?.checked;
    const enabled = hdriActive && !!this.inputs.godRaysEnabled.checked;

    this.setControlDisabled('godRaysEnabled', !hdriActive);
    this.setControlDisabled(
      [
        'godRaysColor',
        'godRaysLightScale',
        'godRaysOpacity',
        'godRaysDensity',
        'godRaysDecay',
        'godRaysWeight',
        'godRaysExposure',
        'godRaysClampMax',
        'godRaysBlur',
        'godRaysQuality',
      ],
      !enabled,
    );
  }

  setDropzoneVisible(visible) {
    if (
      !visible &&
      !document.documentElement.classList.contains('mobile-landing')
    ) {
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
   * @param {{ caution?: boolean, notification?: boolean, success?: boolean, icon?: false | 'success' | 'info', modalTone?: 'caution' | 'notification' | 'none' }} [toastOptions] `caution` / `notification` override inference when set to true; `false` disables that cue. `icon` forces or hides toast icons.
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

  /**
   * Transient toast when cycling mesh turntable, camera auto-orbit, handheld,
   * display mode, or map preview.
   * Reuses the active toast when the same mode group changes in quick succession.
   * Bypasses the toast queue so rapid keyboard cycling cannot block later toasts.
   * @param {import('./ui/modeChangeToast.js').ModeToastKind} kind
   * @param {number | string} value
   * @param {{ mapPreviewCleared?: boolean }} [options]
   */
  showModeChangeToast(kind, value, options = {}) {
    const message = formatModeChangeToastMessage(kind, value, options);
    if (!message) return;

    const groupKey = modeChangeToastGroupKey(kind);
    const durationMs = MODE_CHANGE_TOAST_DURATION_MS;

    if (this._activeToastEl?.dataset?.toastGroup === groupKey) {
      this._configureToastElement(this._activeToastEl, message, {
        notification: false,
        toastGroup: groupKey,
      });
      this._scheduleActiveToastDismiss(durationMs);
      return;
    }

    this._toastQueue = this._toastQueue.filter(
      (item) => item.toastOptions?.toastGroup !== groupKey,
    );
    this._presentImmediateToast(message, durationMs, {
      notification: false,
      toastGroup: groupKey,
    });
  }

  /**
   * Show a toast outside the queue (mode changes). Unblocks any queued toast first.
   * @param {string} message
   * @param {number} durationMs
   * @param {{ notification?: boolean, toastGroup?: string }} [toastOptions]
   */
  _presentImmediateToast(message, durationMs, toastOptions = {}) {
    const template = this.dom.toastTemplate?.content?.firstElementChild;
    if (!template) return;

    this._resolveActiveToastPresentation();
    this._clearActiveToastElement();

    const toast = template.cloneNode(true);
    this._configureToastElement(toast, message, toastOptions);
    document.body.appendChild(toast);
    this._activeToastEl = toast;
    this._scheduleActiveToastDismiss(durationMs);
  }

  /** @param {number} durationMs */
  _scheduleActiveToastDismiss(durationMs) {
    if (this._activeToastTimer) {
      clearTimeout(this._activeToastTimer);
      this._activeToastTimer = null;
    }
    const toast = this._activeToastEl;
    if (!toast) return;
    this._activeToastTimer = setTimeout(() => {
      toast.remove();
      if (this._activeToastEl === toast) {
        this._activeToastEl = null;
      }
      this._activeToastTimer = null;
      this._resolveActiveToastPresentation();
    }, durationMs);
  }

  _resolveActiveToastPresentation() {
    if (!this._activeToastResolve) return;
    const resolve = this._activeToastResolve;
    this._activeToastResolve = null;
    resolve();
  }

  _clearActiveToastElement() {
    if (this._activeToastTimer) {
      clearTimeout(this._activeToastTimer);
      this._activeToastTimer = null;
    }
    if (this._activeToastEl?.isConnected) {
      this._activeToastEl.remove();
    }
    this._activeToastEl = null;
  }

  _clearActiveToast() {
    this._resolveActiveToastPresentation();
    this._clearActiveToastElement();
  }

  /**
   * @param {HTMLElement} toast
   * @param {string} text
   * @param {{ caution?: boolean, success?: boolean, icon?: false | 'success' | 'info', toastGroup?: string }} [toastOptions]
   */
  _configureToastElement(toast, text, toastOptions = {}) {
    toast.querySelector('.toast-message').textContent = text;
    const iconKind = resolveToastIconKind(text, toastOptions);
    if (iconKind) {
      toast.dataset.toastIcon = iconKind;
    } else {
      delete toast.dataset.toastIcon;
    }
    if (toastOptions.toastGroup) {
      toast.dataset.toastGroup = toastOptions.toastGroup;
    } else {
      delete toast.dataset.toastGroup;
    }
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
    this._configureToastElement(toast, text, toastOptions);
    document.body.appendChild(toast);
    this._activeToastEl = toast;

    return new Promise((resolve) => {
      this._activeToastResolve = resolve;
      this._activeToastTimer = setTimeout(() => {
        toast.remove();
        if (this._activeToastEl === toast) {
          this._activeToastEl = null;
        }
        this._activeToastTimer = null;
        this._resolveActiveToastPresentation();
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
        this.renderControls?.syncDofUiState?.(dof);
      }

      // Apply Bloom settings
      if (payload.bloom) {
        this.stateStore.set('bloom', payload.bloom);
        this.eventBus.emit('render:bloom', payload.bloom);
        this.setEffectControlsDisabled(
          ['bloomThreshold', 'bloomStrength', 'bloomRadius', 'bloomColor', 'bloomQuality'],
          !isBloomTuningActive(this.stateStore.getState()),
        );
      }

      // Apply Grain settings
      if (payload.grain) {
        this.stateStore.set('grain', payload.grain);
        this.eventBus.emit('render:grain', payload.grain);
        this.setEffectControlsDisabled(['grainIntensity', 'grainScale'], !payload.grain.enabled);
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
        if (payload.camera.clipPlanes !== undefined) {
          this.stateStore.set('camera.clipPlanes', payload.camera.clipPlanes);
          this.eventBus.emit('camera:clip-planes');
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
        if (payload.camera.compositionPortraitCropGuide !== undefined) {
          this.stateStore.set(
            'camera.compositionPortraitCropGuide',
            !!payload.camera.compositionPortraitCropGuide,
          );
          this.eventBus.emit(
            'camera:composition-portrait-crop-guide',
            !!payload.camera.compositionPortraitCropGuide,
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
    if (this._loadSpinnerDepth === 0) {
      this.endLoadSpinnerElapsed();
      this._loadSpinnerStatusPrefix = 'Rendering';
    }
    this._syncLoadSpinner();
  }

  /** Recover when capture/export leaves the viewport spinner or deferred UI stuck. */
  forceClearLoadSpinner() {
    this._loadSpinnerDepth = 0;
    this.endLoadSpinnerElapsed();
    this._loadSpinnerStatusPrefix = 'Rendering';
    this._syncLoadSpinner();
  }

  /** @param {string} prefix — e.g. `Loading shader` → `Loading shader 2s` */
  setLoadSpinnerStatusPrefix(prefix) {
    this._loadSpinnerStatusPrefix =
      typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'Rendering';
    if (this._loadSpinnerElapsedActive) {
      this.setLoadSpinnerElapsedFromStart();
    }
  }

  beginLoadSpinnerElapsed() {
    this._loadSpinnerElapsedActive = true;
    this._loadSpinnerElapsedStart = performance.now();
    this._syncLoadSpinnerElapsed(0);
    this._startLoadSpinnerElapsedTick();
  }

  setLoadSpinnerElapsedFromStart() {
    if (!this._loadSpinnerElapsedActive) return;
    const elapsedSec = (performance.now() - this._loadSpinnerElapsedStart) / 1000;
    this._syncLoadSpinnerElapsed(elapsedSec);
  }

  _startLoadSpinnerElapsedTick() {
    this._stopLoadSpinnerElapsedTick();
    this._loadSpinnerElapsedIntervalId = setInterval(() => {
      this.setLoadSpinnerElapsedFromStart();
    }, 1000);
  }

  _stopLoadSpinnerElapsedTick() {
    if (this._loadSpinnerElapsedIntervalId == null) return;
    clearInterval(this._loadSpinnerElapsedIntervalId);
    this._loadSpinnerElapsedIntervalId = null;
  }

  endLoadSpinnerElapsed() {
    this._stopLoadSpinnerElapsedTick();
    this._loadSpinnerElapsedActive = false;
    this._loadSpinnerElapsedStart = 0;
    const el = this.dom.loadSpinnerElapsed;
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  _syncLoadSpinnerElapsed(seconds) {
    const el = this.dom.loadSpinnerElapsed;
    if (!el || !this._loadSpinnerElapsedActive) return;
    el.hidden = false;
    const wholeSec = Math.max(0, Math.floor(seconds));
    el.textContent = `${this._loadSpinnerStatusPrefix} ${wholeSec}s`;
  }

  _syncLoadSpinner() {
    const el = this.dom.loadSpinner;
    if (!el) return;
    const on = this._loadSpinnerDepth > 0;
    el.classList.toggle('is-visible', on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  bindOfflineExportOverlayActions() {
    if (this._offlineExportActionsBound) return;
    this._offlineExportActionsBound = true;
    this.dom.offlineExportCancel?.addEventListener('click', () => {
      this._onOfflineExportCancelClick();
    });
    this.dom.offlineExportGoBack?.addEventListener('click', () => {
      this._onOfflineExportGoBackClick();
    });
  }

  _onOfflineExportCancelClick() {
    if (this._offlineExportPreviewActive || !this._offlineExportCancellable) return;
    if (this._offlineExportCancelPending) return;
    this._offlineExportCancelPending = true;
    this.setOfflineExportOverlayCancelled();
    this._offlineExportOnCancel?.();
  }

  _onOfflineExportGoBackClick() {
    this.hideOfflineExportOverlay();
    if (this._offlineExportPreviewActive) {
      this.showToast?.('Export overlay preview closed', 2200, { notification: false });
    }
  }

  _resetOfflineExportFooter({ preview = false } = {}) {
    this._offlineExportCancelPending = false;
    const cancelBtn = this.dom.offlineExportCancel;
    const goBackBtn = this.dom.offlineExportGoBack;
    const footer = this.dom.offlineExportFooter;
    const progress = this.dom.offlineExportOverlay?.querySelector('.viewport-offline-export__progress');
    progress?.classList.remove('is-cancelled');
    this.dom.offlineExportFrame?.classList.remove('is-cancelled');
    this.dom.offlineExportElapsed?.classList.remove('is-cancelled');
    this._offlineExportFrameProgress = { frameIndex: 0, totalFrames: 0 };

    footer?.classList.remove('is-cancelled');
    footer?.classList.toggle('is-preview', preview);

    if (cancelBtn) {
      cancelBtn.hidden = preview;
      cancelBtn.disabled = false;
      cancelBtn.classList.remove('is-disabled');
      cancelBtn.textContent = 'Cancel render';
      cancelBtn.setAttribute('aria-hidden', preview ? 'true' : 'false');
    }
    if (goBackBtn) {
      goBackBtn.textContent = 'Go back';
      goBackBtn.hidden = true;
      goBackBtn.setAttribute('aria-hidden', 'true');
    }
  }

  setOfflineExportOverlayCancelled() {
    const cancelBtn = this.dom.offlineExportCancel;
    const goBackBtn = this.dom.offlineExportGoBack;
    const footer = this.dom.offlineExportFooter;
    const progress = this.dom.offlineExportOverlay?.querySelector('.viewport-offline-export__progress');
    progress?.classList.add('is-cancelled');
    footer?.classList.add('is-cancelled');
    this.dom.offlineExportElapsed?.classList.add('is-cancelled');
    this._stopOfflineExportElapsedTick();
    this._syncOfflineExportElapsed({ allowWhenCancelled: true });

    if (cancelBtn) {
      cancelBtn.textContent = 'Render cancelled';
      cancelBtn.disabled = true;
      cancelBtn.classList.add('is-disabled');
    }
    if (goBackBtn) {
      goBackBtn.hidden = false;
      goBackBtn.setAttribute('aria-hidden', 'false');
    }
    this._syncOfflineExportFrameDisplay();
  }

  _syncOfflineExportFrameDisplay() {
    const frameEl = this.dom.offlineExportFrame;
    if (!frameEl) return;
    const { frameIndex = 0, totalFrames = 0 } = this._offlineExportFrameProgress || {};
    const total = Math.max(0, totalFrames);
    const current = Math.max(0, Math.min(frameIndex, total || frameIndex));
    const cancelled = !!this._offlineExportCancelPending;

    if (total <= 0) {
      frameEl.textContent = cancelled ? 'Preparing… (Cancelled)' : 'Preparing…';
      frameEl.classList.toggle('is-cancelled', cancelled);
      return;
    }

    frameEl.textContent = cancelled
      ? `Frame ${current} / ${total} (Cancelled)`
      : `Frame ${current} / ${total}`;
    frameEl.classList.toggle('is-cancelled', cancelled);
  }

  /**
   * Full-viewport black overlay with export progress + look summary during offline PNG capture.
   * @param {Array<{ title: string, rows: Array<{ label: string, value: string }> }>} sections
   * @param {{ cancellable?: boolean, onCancelExport?: () => void, assetFilename?: string }} [options]
   */
  showOfflineExportOverlay(sections, options = {}) {
    this._offlineExportCancellable = !!options.cancellable;
    this._offlineExportOnCancel = options.onCancelExport ?? null;
    this._syncOfflineExportFilename(options.assetFilename);
    this._resetOfflineExportFooter({ preview: this._offlineExportPreviewActive });

    this.beginShelfOverlaySuppression();
    this.dom.viewport?.classList.add('is-offline-export-capture');
    this._resetOfflineExportPreview();
    const overlay = this.dom.offlineExportOverlay;
    if (overlay) {
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
    }
    this._offlineExportElapsedStart = performance.now();
    this._offlineExportFrameProgress = { frameIndex: 0, totalFrames: 0 };
    this._renderOfflineExportSummary(sections);
    this.updateOfflineExportOverlayProgress({ frameIndex: 0, totalFrames: 0 });
    this._startOfflineExportElapsedTick();
  }

  _syncOfflineExportFilename(filename) {
    const wrap = this.dom.offlineExportFilename;
    const valueEl = this.dom.offlineExportFilenameValue;
    if (!wrap || !valueEl) return;
    const text = typeof filename === 'string' ? filename.trim() : '';
    if (text) {
      valueEl.textContent = text;
      wrap.hidden = false;
      wrap.setAttribute('aria-hidden', 'false');
      return;
    }
    valueEl.textContent = '—';
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
  }

  setOfflineExportElapsedFromStart() {
    this._syncOfflineExportElapsed();
  }

  _syncOfflineExportElapsed({ allowWhenCancelled = false } = {}) {
    const valueEl = this.dom.offlineExportElapsedValue;
    if (!valueEl || !this._offlineExportElapsedStart) return;
    if (this._offlineExportCancelPending && !allowWhenCancelled) return;
    const wholeSec = Math.max(
      0,
      Math.floor((performance.now() - this._offlineExportElapsedStart) / 1000),
    );
    valueEl.textContent = `${wholeSec}s`;
  }

  _startOfflineExportElapsedTick() {
    this._stopOfflineExportElapsedTick();
    this._syncOfflineExportElapsed();
    this._offlineExportElapsedIntervalId = setInterval(() => {
      this._syncOfflineExportElapsed();
    }, 1000);
  }

  _stopOfflineExportElapsedTick() {
    if (this._offlineExportElapsedIntervalId == null) return;
    clearInterval(this._offlineExportElapsedIntervalId);
    this._offlineExportElapsedIntervalId = null;
  }

  /**
   * @param {{ frameIndex: number, totalFrames: number }} progress
   */
  updateOfflineExportOverlayProgress({ frameIndex = 0, totalFrames = 0 } = {}) {
    this._offlineExportFrameProgress = { frameIndex, totalFrames };
    this._syncOfflineExportFrameDisplay();
    this._syncOfflineExportElapsed();
  }

  /**
   * Paint the most-recently captured export frame into the side preview.
   * Throttled to one in-flight decode — extra frames are dropped, never queued,
   * so the encode loop is never blocked waiting on the preview.
   * @param {Blob | null | undefined} blob — PNG blob from the capture loop
   */
  setOfflineExportPreviewFrame(blob) {
    const canvas = this.dom.offlineExportPreviewCanvas;
    if (!canvas || !blob) return;
    if (this.dom.viewport?.classList.contains('is-offline-export-capture') !== true) return;
    if (this._offlineExportPreviewBusy) return;
    if (typeof createImageBitmap !== 'function') return;
    this._offlineExportPreviewBusy = true;
    this._offlineExportPreviewToken = (this._offlineExportPreviewToken || 0) + 1;
    const token = this._offlineExportPreviewToken;
    createImageBitmap(blob)
      .then((bitmap) => {
        this._offlineExportPreviewBusy = false;
        if (
          token !== this._offlineExportPreviewToken
          || this.dom.viewport?.classList.contains('is-offline-export-capture') !== true
        ) {
          bitmap.close?.();
          return;
        }
        this._drawOfflineExportPreviewBitmap(bitmap);
        bitmap.close?.();
      })
      .catch(() => {
        this._offlineExportPreviewBusy = false;
      });
  }

  /** Downscale the captured frame to a modest preview size, preserving aspect. */
  _drawOfflineExportPreviewBitmap(bitmap) {
    const canvas = this.dom.offlineExportPreviewCanvas;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const srcW = Math.max(1, bitmap.width);
    const srcH = Math.max(1, bitmap.height);
    const maxEdge = 960;
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));
    if (canvas.width !== dstW || canvas.height !== dstH) {
      canvas.width = dstW;
      canvas.height = dstH;
    }
    ctx.clearRect(0, 0, dstW, dstH);
    ctx.drawImage(bitmap, 0, 0, dstW, dstH);
    const preview = this.dom.offlineExportPreview;
    if (preview && preview.hidden) {
      preview.hidden = false;
      preview.setAttribute('aria-hidden', 'false');
    }
  }

  _resetOfflineExportPreview() {
    this._offlineExportPreviewBusy = false;
    this._offlineExportPreviewToken = (this._offlineExportPreviewToken || 0) + 1;
    const preview = this.dom.offlineExportPreview;
    if (preview) {
      preview.hidden = true;
      preview.setAttribute('aria-hidden', 'true');
    }
    const canvas = this.dom.offlineExportPreviewCanvas;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  hideOfflineExportOverlay() {
    this._stopOfflineExportElapsedTick();
    this.endShelfOverlaySuppression();
    this.dom.viewport?.classList.remove('is-offline-export-capture');
    this._resetOfflineExportPreview();
    const overlay = this.dom.offlineExportOverlay;
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (this.dom.offlineExportSummary) {
      this.dom.offlineExportSummary.replaceChildren();
    }
    this._offlineExportElapsedStart = 0;
    this._syncOfflineExportFilename('');
    this._offlineExportPreviewActive = false;
    this._offlineExportCancellable = false;
    this._offlineExportOnCancel = null;
    this._resetOfflineExportFooter();
    document.body.classList.remove('export-overlay-debug');
  }

  /**
   * Toggle full export overlay for layout QA from the dropzone (no render running).
   */
  toggleOfflineExportOverlayPreview() {
    if (this._offlineExportPreviewActive) {
      this.hideOfflineExportOverlay();
      this.showToast?.('Export overlay preview closed', 2200, { notification: false });
      return;
    }
    const video = {
      ...OFFLINE_EXPORT_OVERLAY_PREVIEW_JOB,
      ...(this.exportSettings?.video || {}),
      format: 'png',
    };
    const durationSec = video.durationSec ?? 5;
    const fps = video.fps ?? 24;
    const totalFrames = Math.max(2, Math.round(durationSec * fps));

    const sections = buildOfflineExportOverlaySummary({
      exportJob: { ...video, clipCount: 0 },
      assetName: '',
      animationClipLabel: null,
    });

    document.body.classList.add('export-overlay-debug');
    this._offlineExportPreviewActive = true;
    this.showOfflineExportOverlay(sections, { cancellable: false });
    this.updateOfflineExportOverlayProgress({
      frameIndex: Math.min(24, totalFrames),
      totalFrames,
    });
    this.showToast?.('Export overlay preview — Esc or link again to close', 3600, {
      notification: false,
    });
  }

  _renderOfflineExportSummary(sections) {
    const tbody = this.dom.offlineExportSummary;
    if (!tbody || !Array.isArray(sections)) return;
    tbody.replaceChildren();
    for (const section of sections) {
      const sectionRow = document.createElement('tr');
      sectionRow.className = 'viewport-offline-export__section-row';
      const sectionTh = document.createElement('th');
      sectionTh.colSpan = 2;
      sectionTh.textContent = section.title || '';
      sectionRow.appendChild(sectionTh);
      tbody.appendChild(sectionRow);

      for (const row of section.rows || []) {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.textContent = row.label || '';
        const td = document.createElement('td');
        td.textContent = row.value || '—';
        tr.append(th, td);
        tbody.appendChild(tr);
      }
    }
  }

  extractAnimationName(fullName) {
    return this.animationControls?.extractAnimationName(fullName) ?? 'Animation';
  }

  setAnimationClips(clips) {
    this.animationControls?.setAnimationClips(clips);
  }

  syncAnimationClipSelect(index) {
    this.animationControls?.syncAnimationClipSelect(index);
  }

  setAnimationClipModeEnabled(enabled) {
    this.animationControls?.setAnimationClipModeEnabled(enabled);
  }

  syncAnimationClipMode(mode, available) {
    this.animationControls?.syncAnimationClipMode(mode, available);
  }

  syncAnimationShowBones(checked, available) {
    this.animationControls?.syncAnimationShowBones(checked, available);
  }

  syncAnimationShowJointNames(options) {
    this.animationControls?.syncAnimationShowJointNames(options);
  }

  syncAnimationJointScale(options) {
    this.animationControls?.syncAnimationJointScale(options);
  }

  syncAnimationBoneStroke(options) {
    this.animationControls?.syncAnimationBoneStroke(options);
  }

  syncAnimationHideMesh(options) {
    this.animationControls?.syncAnimationHideMesh(options);
  }

  setExportVideoAnimationClips(clips) {
    const select = this.inputs.exportMeshAnimationSelect;
    const wrap = this.inputs.exportMeshAnimationsSettings;
    const clipWrap = this.inputs.exportMeshAnimationClipWrap;
    const embedToggle = this.inputs.exportMeshAnimationsEmbed;
    if (!select || !wrap) return;

    select.innerHTML = '';
    const hasClips = !!clips?.length;

    if (!hasClips) {
      wrap.hidden = true;
      this.exportSettings.video.meshAnimationsInclude = false;
      if (embedToggle) {
        embedToggle.checked = false;
        embedToggle.disabled = true;
      }
      if (clipWrap) clipWrap.hidden = true;
      select.disabled = true;
      return;
    }

    wrap.hidden = false;
    if (embedToggle) embedToggle.disabled = false;

    clips.forEach((clip, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = this.extractAnimationName(clip.name);
      select.appendChild(option);
    });

    const savedIndex = Number(this.exportSettings.video.meshAnimationClipIndex);
    const clipIndex = Number.isFinite(savedIndex)
      ? Math.min(clips.length - 1, Math.max(0, savedIndex))
      : 0;
    this.exportSettings.video.meshAnimationClipIndex = clipIndex;
    select.value = String(clipIndex);

    this.syncExportMeshAnimationsUi();
  }

  restoreExportSettings(saved) {
    applySavedExportSettings(this.exportSettings, saved);
    this.meshControls?.syncExportSettingsUi?.();
    this.exportSectionControls?.syncFromSettings?.();
    this.watermark?.syncFromSettings?.();
  }

  syncExportMeshAnimationsUi() {
    const video = this.exportSettings.video || {};
    const select = this.inputs.exportMeshAnimationSelect;
    const clipWrap = this.inputs.exportMeshAnimationClipWrap;
    const embedToggle = this.inputs.exportMeshAnimationsEmbed;
    const settingsWrap = this.inputs.exportMeshAnimationsSettings;
    const hasClips = !!(select && select.options.length);
    const embed = hasClips && !!video.meshAnimationsInclude;

    if (settingsWrap) {
      settingsWrap.hidden = !hasClips;
    }
    if (embedToggle) {
      embedToggle.checked = embed;
      embedToggle.disabled = !hasClips;
    }
    if (clipWrap) {
      clipWrap.hidden = !embed;
    }
    if (select) {
      select.disabled = !embed;
    }
  }

  static supportsPngFolderExport() {
    return typeof window !== 'undefined'
      && typeof window.showDirectoryPicker === 'function';
  }

  syncExportPngFolderUi() {
    const wrap = this.inputs.exportPngFolderSettings;
    const label = this.inputs.exportPngFolderLabel;
    const chooseBtn = this.buttons.exportPngFolderChoose;
    const pngFormat = this.exportSettings.video?.format === 'png';
    const supported = UIManager.supportsPngFolderExport();

    if (wrap) {
      wrap.hidden = !pngFormat;
      wrap.classList.toggle('is-muted', !supported);
    }
    if (chooseBtn) {
      chooseBtn.disabled = !pngFormat || !supported;
      chooseBtn.classList.toggle('is-disabled', !pngFormat || !supported);
    }
    if (label) {
      if (!supported) {
        label.textContent = 'Needs Chrome or Edge — Safari and Firefox use ZIP';
      } else if (this.pngExportDirectoryHandle?.name) {
        label.textContent = `${this.pngExportDirectoryHandle.name} — frames write as rendered`;
      } else {
        label.textContent = 'No folder — downloads as ZIP (large exports may fail)';
      }
    }
  }

  /** Image panel — format label, transparency mute (JPEG has no alpha). */
  syncImageExportUi() {
    const formatId = normalizeImageExportFormat(this.exportSettings.format);
    const format = getImageExportFormat(formatId);
    const supportsAlpha = format.supportsAlpha;
    const transparentWrap = this.inputs.exportImageTransparentSettings;
    const exportBtn = this.buttons.exportImage;

    if (transparentWrap) {
      transparentWrap.classList.toggle('is-muted', !supportsAlpha);
      transparentWrap.querySelectorAll('[data-export-transparent]').forEach((btn) => {
        if ('disabled' in btn) btn.disabled = !supportsAlpha;
        btn.classList.toggle('is-disabled', !supportsAlpha);
      });
    }
    if (!supportsAlpha) {
      this.exportSettings.transparent = false;
      document.querySelectorAll('[data-export-transparent]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.exportTransparent === 'false');
      });
    }
    if (exportBtn) {
      const label = exportBtn.querySelector('.export-image-btn-label');
      if (label) {
        label.textContent = `Export .${format.ext.toUpperCase()}`;
      }
    }
    document.querySelectorAll('[data-export-image-format]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.exportImageFormat === formatId);
    });
  }

  async pickPngExportDirectory() {
    if (!UIManager.supportsPngFolderExport()) {
      this.showToast?.('Folder export needs Chrome or Edge — Safari and Firefox use ZIP');
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      this.pngExportDirectoryHandle = handle;
      this.syncExportPngFolderUi();
      this.showToast?.(`Output folder: ${handle.name}`, 2800, { notification: false });
      return handle;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('PNG export folder picker failed', error);
        this.showToast?.('Couldn’t choose folder');
      }
      return null;
    }
  }

  setAnimationSpeedEnabled(enabled) {
    this.animationControls?.setAnimationSpeedEnabled(enabled);
  }

  syncAnimationReverse(checked, available) {
    this.animationControls?.syncAnimationReverse(checked, available);
  }

  setAnimationPlaying(playing) {
    this.animationControls?.setAnimationPlaying(playing);
  }

  updateAnimationTime(current, duration) {
    this.animationControls?.updateAnimationTime(current, duration);
  }

  setExportPreviewPlaying(playing) {
    this.exportPreviewControls?.setPlaying(playing);
  }

  updateExportPreviewTimeline(current, duration, options) {
    this.exportPreviewControls?.updateTimeline(current, duration, options);
  }

  syncExportPreviewAvailability(hasModel) {
    this.exportPreviewControls?.syncAvailability(hasModel);
  }

  /**
   * Show last offline capture preview tile (export resolution, not live viewport).
   * @param {string} objectUrl
   * @param {{ width?: number, height?: number, frameIndex?: number, totalFrames?: number }} [meta]
   */
  showExportCapturePreviewThumb(objectUrl, meta = {}) {
    const wrap = this.dom.exportCapturePreviewThumbWrap;
    const img = this.dom.exportCapturePreviewThumb;
    const empty = this.dom.exportCapturePreviewThumbEmpty;
    const label = this.dom.exportCapturePreviewThumbLabel;
    wrap?.classList.toggle('export-capture-preview-thumb--transparent', !!meta.transparent);
    if (img) {
      if (img.dataset.objectUrl) {
        URL.revokeObjectURL(img.dataset.objectUrl);
      }
      img.src = objectUrl;
      img.dataset.objectUrl = objectUrl;
      img.removeAttribute('hidden');
    }
    empty?.setAttribute('hidden', '');
    if (label && meta.width && meta.height) {
      const frame = Number.isFinite(meta.frameIndex) ? meta.frameIndex + 1 : 1;
      const total = meta.totalFrames ?? '?';
      const alphaNote = meta.transparent ? ' · transparent' : '';
      label.textContent = `Export capture ${meta.width}×${meta.height}${alphaNote} · frame ${frame}/${total}`;
    }
    wrap?.removeAttribute('hidden');
  }

  syncAnimationDisplayFps(fps) {
    return this.animationControls?.syncAnimationDisplayFps(fps) ?? fps;
  }

  syncAnimationTimeReference(checked, available) {
    this.animationControls?.syncAnimationTimeReference(checked, available);
  }

  /** Swap Metalness/Roughness tooltips for PBR imports (1.0 = pass-through multiplier). */
  syncMaterialMrMapTooltips(importUsesAuthoredPbr = false, importHasMrMaps = false) {
    const metalLabel = this.inputs.materialMetalness
      ?.closest('.slider-line')
      ?.querySelector('span[data-tooltip]');
    const roughLabel = this.inputs.materialRoughness
      ?.closest('.slider-line')
      ?.querySelector('span[data-tooltip]');
    const metalTooltip = importHasMrMaps
      ? MATERIAL_METALNESS_MR_MAP_TOOLTIP
      : importUsesAuthoredPbr
        ? MATERIAL_METALNESS_AUTHORED_TOOLTIP
        : MATERIAL_METALNESS_TOOLTIP;
    const roughTooltip = importHasMrMaps
      ? MATERIAL_ROUGHNESS_MR_MAP_TOOLTIP
      : importUsesAuthoredPbr
        ? MATERIAL_ROUGHNESS_AUTHORED_TOOLTIP
        : MATERIAL_ROUGHNESS_TOOLTIP;
    if (metalLabel) {
      metalLabel.setAttribute('data-tooltip', metalTooltip);
    }
    if (roughLabel) {
      roughLabel.setAttribute('data-tooltip', roughTooltip);
    }
  }

  syncControls(state) {
    if (!this._studioUiReady) return;
    this.meshControls.sync(state);
    this.fbxMapSlotsControls.syncFromState(state);
    this.studioControls.sync(state);
    this.goboControls.sync(state);
    this.renderControls.sync(state);
    this.backgroundGradientControls.sync(state);
    this.backgroundSolidControls.sync(state);
    this.backgroundImageControls.sync(state);
    this.lensControls.sync(state);
    this.viewPresetsControls.sync(state);
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

  setEffectFoldoutOpen(key, open) {
    const el = this.dom.effectFoldouts?.[key];
    if (!el) return;
    el.classList.toggle('effect-foldout--collapsed', !open);
    el.classList.toggle('effect-foldout--expanded', open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  setClipPlanesFoldoutOpen(open) {
    const el = this.dom.clipPlanesFoldout;
    if (!el) return;
    el.classList.toggle('clip-planes-foldout--collapsed', !open);
    el.classList.toggle('clip-planes-foldout--expanded', open);
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
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
    
    // HDRI foldout — open state handled in applyStudioFoldouts

    applyToggleSectionMute(currentState, (key, muted) => this.setBlockMuted(key, muted));

    applyCreativeLookPostFxUiBlocks(currentState, {
      setMuted: (key, muted) => this.setBlockMuted(key, muted),
      setControlsDisabled: (ids, disabled) => this.setControlDisabled(ids, disabled),
      getSubsection: (key) => this.dom.subsections?.[key] ?? null,
      getInput: (id) => this.inputs?.[id] ?? null,
    });

    const isoOn = !!currentState.camera?.isometric?.enabled;
    this.setBlockMuted(
      'auto-orbit',
      isoOn || currentState.camera?.autoOrbit === 'off',
    );
    this.setBlockMuted(
      'handheld',
      isoOn || currentState.camera?.handheld === 'off',
    );

    const creativeLookOn = !!currentState.creativeLook?.enabled;
    const materialPbrSlidersOn =
      creativeLookOn &&
      creativeLookPresetSupportsMaterialPbrSliders(currentState.creativeLook?.preset);
    this.setControlDisabled(
      ['materialMetalness', 'materialRoughness', 'materialEmissive'],
      creativeLookOn && !materialPbrSlidersOn,
    );

    const fisheyeOn = !!currentState.fisheye?.enabled;

    this.lensControls?.setFovDisabled?.(fisheyeOn);
    this.setControlDisabled('cameraTilt', isoOn);
    this.setControlDisabled('cameraPosX', isoOn);
    this.setControlDisabled('cameraPosY', isoOn);
    this.setControlDisabled('cameraPosZ', isoOn);
    this.setControlDisabled('cameraDistance', isoOn);
    this.viewPresetsControls?.setDisabled(isoOn);
    this.setControlDisabled('fisheyeEnabled', isoOn);
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

    // Lens flare / god rays foldouts — open state handled in applyEffectFoldouts
    
    // Lights / base / backdrop foldouts — applyStudioFoldouts
    
    const podiumOn = !!currentState.groundSolid;
    const glassOn = !!(
      currentState.baseGlassSurface ??
      currentState.podiumReflectMesh ??
      false
    );
    const basePlacementActive = podiumOn || glassOn;
    this.setControlDisabled(['groundY', 'baseScale', 'baseSnap'], !basePlacementActive);
    this.setControlDisabled(
      [
        'groundSolidColor',
        'baseMetalness',
        'baseRoughness',
        'baseSurfacePreset',
        'baseSurfaceScale',
        'baseSurfaceStrength',
      ],
      !podiumOn,
    );
    this.setControlDisabled(
      ['baseGlassSurfPreset', 'baseGlassSurfScale', 'baseGlassSurfStrength'],
      !glassOn,
    );
    this.setControlDisabled('baseGlassBrightness', !glassOn);
    this.setControlDisabled('baseGlassBlur', !glassOn);
    this.setControlDisabled('baseGlassAmount', !glassOn);

    const backdropOn = !!currentState.backdropEnabled;
    this.setControlDisabled(
      [
        'backdropColor',
        'backdropMetalness',
        'backdropRoughness',
        'backdropSurfacePreset',
        'backdropSurfaceScale',
        'backdropSurfaceStrength',
        'backdropScale',
        'backdropWidth',
        'backdropRotation',
        'backdropY',
        'backdropSnap',
      ],
      !backdropOn,
    );

    // Grid foldout — open state handled in applyMeshFoldouts
    const gridOn = !!currentState.groundWire;
    this.setControlDisabled(
      ['groundWireColor', 'groundWireOpacity', 'gridLineWidth', 'gridY', 'gridScale', 'gridSnap'],
      !gridOn,
    );

    applyEffectFoldouts(currentState, (key, open) => this.setEffectFoldoutOpen(key, open));
    applyStudioFoldouts(currentState, (key, open) => this.setEffectFoldoutOpen(key, open));
    applyMeshFoldouts(currentState, (key, open) => this.setEffectFoldoutOpen(key, open));

    this.updateHdriBackgroundFallbackVisibility(currentState);

    const clayOn = currentState.shading === 'clay';
    if (this.dom.subsections?.clay) {
      this.dom.subsections.clay.hidden = !clayOn;
    }
    if (this.dom.claySubsectionDivider) {
      this.dom.claySubsectionDivider.hidden = !clayOn;
    }

    const keyLightOn =
      !!currentState.lightsEnabled &&
      currentState.lights?.key?.enabled === true;
    this.setControlDisabled('keyLightGoboBtn', !keyLightOn);

    // Fresnel foldout — open state handled in applyMeshFoldouts

    const scene = window.orby?.scene;
    const isFontExtrudeMesh = !!(
      scene?.currentModel?.userData?.orbyFontGenerated ||
      scene?.materialController?._isFontExtrudeModel?.(scene.currentModel)
    );
    const svgExtrudeOn = !!currentState.svgExtrude?.enabled && !isFontExtrudeMesh;
    if (this.dom.svgExtrudePanelBlock) {
      this.dom.svgExtrudePanelBlock.hidden = !svgExtrudeOn;
    }

    if (this.dom.fbxMapSlotsBlock) {
      this.dom.fbxMapSlotsBlock.hidden = !currentState.fbxMapSlots?.enabled;
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

  updateClipPlaneDisplay(near, far, manual) {
    if (this.inputs.cameraClipNear) {
      this.inputs.cameraClipNear.value = near;
      this.updateValueLabel('cameraClipNear', near, 'decimal', 2);
    }
    if (this.inputs.cameraClipFar) {
      this.inputs.cameraClipFar.value = far;
      this.updateValueLabel('cameraClipFar', far, 'decimal', 1);
    }
    if (manual !== undefined) {
      this.setClipPlanesFoldoutOpen(!!manual);
    }
  }
}

