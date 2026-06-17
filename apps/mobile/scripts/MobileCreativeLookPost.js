import * as THREE from 'three';
import {
  creativeLookFlatPostVariant,
  creativeLookMasterHueRadians,
  isFlatPostCreativeLookPreset,
  isSketchColourCreativeLookPreset,
  isSketchCreativeLookPreset,
  isVectrexCreativeLookPreset,
  isWatercolourCreativeLookPreset,
  normalizeCreativeLookIntensity,
  normalizeCreativeLookLiftCrush,
  normalizeCreativeLookPatternScale,
  normalizeCreativeLookPreset,
} from '../../../scripts/render/CreativeLookMaterials.js';
import { MOBILE_FX_DEFAULTS } from './mobileFxDefaults.js';
import {
  pinMobileExportPixelReferences,
  pinMobileSquarePixelReferences,
  unpinMobileExportPixelReferences,
} from './mobileSquarePixelGrid.js';

/** Stable composer insert order — only mounted passes occupy slots. */
const PASS_KEYS = [
  'ascii',
  'ega',
  'c64',
  'gameboy',
  'nes',
  'megadrive',
  'gba',
  'dither',
  'vectrex',
  'watercolour',
  'sketch',
  'sketchColour',
];

const SQUARE_PIXEL_KEYS = ['ega', 'c64', 'gameboy', 'nes', 'megadrive', 'gba', 'dither'];

/** @type {Record<string, string>} */
const FLAT_VARIANT_TO_PASS_KEY = {
  ascii: 'ascii',
  'ega-pixel': 'ega',
  'c64-pixel': 'c64',
  'gameboy-pixel': 'gameboy',
  'nes-pixel': 'nes',
  'megadrive-pixel': 'megadrive',
  'gba-pixel': 'gba',
  'dither-neutral': 'dither',
  'dither-tritone': 'dither',
  'dither-crosshatch': 'dither',
  'dither-raster': 'dither',
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {string} key
 */
async function createCreativeLookPassInstance(renderer, key) {
  switch (key) {
    case 'ascii': {
      const { CreativeLookAsciiPass } = await import('../../../scripts/render/CreativeLookAsciiPass.js');
      return new CreativeLookAsciiPass(renderer);
    }
    case 'ega': {
      const { CreativeLookEgaPass } = await import('../../../scripts/render/CreativeLookEgaPass.js');
      return new CreativeLookEgaPass(renderer);
    }
    case 'c64': {
      const { CreativeLookC64Pass } = await import('../../../scripts/render/CreativeLookC64Pass.js');
      return new CreativeLookC64Pass(renderer);
    }
    case 'gameboy': {
      const { CreativeLookGameBoyPass } = await import('../../../scripts/render/CreativeLookGameBoyPass.js');
      return new CreativeLookGameBoyPass(renderer);
    }
    case 'nes': {
      const { CreativeLookNesPass } = await import('../../../scripts/render/CreativeLookNesPass.js');
      return new CreativeLookNesPass(renderer);
    }
    case 'megadrive': {
      const { CreativeLookMegaDrivePass } = await import('../../../scripts/render/CreativeLookMegaDrivePass.js');
      return new CreativeLookMegaDrivePass(renderer);
    }
    case 'gba': {
      const { CreativeLookGbaPass } = await import('../../../scripts/render/CreativeLookGbaPass.js');
      return new CreativeLookGbaPass(renderer);
    }
    case 'dither': {
      const { CreativeLookDitherPass } = await import('../../../scripts/render/CreativeLookDitherPass.js');
      return new CreativeLookDitherPass(renderer);
    }
    case 'vectrex': {
      const { CreativeLookVectrex } = await import('../../../scripts/render/CreativeLookVectrexPass.js');
      return new CreativeLookVectrex(renderer);
    }
    case 'watercolour': {
      const { CreativeLookWatercolour } = await import('../../../scripts/render/CreativeLookWatercolourPass.js');
      return new CreativeLookWatercolour(renderer);
    }
    case 'sketch': {
      const { CreativeLookSketch } = await import('../../../scripts/render/CreativeLookSketchPass.js');
      return new CreativeLookSketch(renderer);
    }
    case 'sketchColour': {
      const { CreativeLookSketchColour } = await import('../../../scripts/render/CreativeLookSketchColourPass.js');
      return new CreativeLookSketchColour(renderer);
    }
    default:
      return null;
  }
}

/**
 * Screen-space Shader Lab passes for Orby Mobile — material prepass runs in
 * MaterialController; this module adds the missing ASCII / pixel / sketch / etc. post stack.
 * Pass modules load on first preset selection (dynamic import).
 */
export class MobileCreativeLookPost {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    /** @type {'none' | 'flat' | 'watercolour' | 'sketch' | 'vectrex'} */
    this._presentationMode = 'none';
    /** @type {string | null} */
    this._presetId = null;
    /** @type {ReturnType<typeof creativeLookFlatPostVariant> | null} */
    this._flatVariant = null;
    /** @type {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer | null} */
    this._composer = null;

    /** @type {Record<string, object>} */
    this._instances = {};
    /** @type {Record<string, Promise<object | null>>} */
    this._instancePromises = {};
    /** @type {Set<string>} */
    this._mountedKeys = new Set();
    /** @type {Set<import('three/examples/jsm/postprocessing/Pass.js').Pass>} */
    this._creativePassSet = new Set();

    /** @type {{ min: number, mag: number } | null} */
    this._composerFilterRestore = null;
    /** @type {object} */
    this._settings = {};
    this._viewportBloomStackActive = false;
    this._exportPixelPinned = false;
    this._logicalW = 1;
    this._logicalH = 1;

    /** @type {typeof import('../../../scripts/render/creativeLookInkArt.js') | null} */
    this._inkArt = null;
    /** @type {typeof import('../../../scripts/render/creativeLookSketchArt.js') | null} */
    this._sketchArt = null;
    /** @type {typeof import('../../../scripts/render/creativeLookWatercolourArt.js') | null} */
    this._watercolourArt = null;
  }

  /**
   * @param {string} presetId
   * @returns {string[]}
   */
  _requiredPassKeys(presetId) {
    const id = normalizeCreativeLookPreset(presetId);
    if (!id || id === 'none' || id === 'standard') return [];

    if (isFlatPostCreativeLookPreset(id)) {
      const variant = creativeLookFlatPostVariant(id);
      const key = variant ? FLAT_VARIANT_TO_PASS_KEY[variant] : null;
      return key ? [key] : [];
    }
    if (isWatercolourCreativeLookPreset(id)) return ['watercolour'];
    if (isSketchColourCreativeLookPreset(id)) return ['sketchColour'];
    if (isSketchCreativeLookPreset(id)) return ['sketch'];
    if (isVectrexCreativeLookPreset(id)) return ['vectrex'];
    return [];
  }

  /**
   * Whether selecting this preset still needs lazy pass init / mount work.
   * @param {string} presetId
   */
  needsPrepare(presetId) {
    const keys = this._requiredPassKeys(presetId);
    return keys.some((key) => !this._mountedKeys.has(key));
  }

  /**
   * @param {string[]} keys
   */
  async _loadArtForPassKeys(keys) {
    if (keys.includes('ascii')) {
      const { ensureAsciiFontAtlasLoaded } = await import('../../../scripts/render/creativeLookAsciiArt.js');
      await ensureAsciiFontAtlasLoaded();
      this._instances.ascii?.refreshAtlas?.();
    }

    if (keys.includes('watercolour')) {
      const [inkArt, watercolourArt] = await Promise.all([
        import('../../../scripts/render/creativeLookInkArt.js'),
        import('../../../scripts/render/creativeLookWatercolourArt.js'),
      ]);
      this._inkArt = inkArt;
      this._watercolourArt = watercolourArt;
    }

    if (keys.includes('sketch') || keys.includes('sketchColour')) {
      const loads = [import('../../../scripts/render/creativeLookSketchArt.js')];
      if (!this._inkArt) {
        loads.push(import('../../../scripts/render/creativeLookInkArt.js'));
      }
      const modules = await Promise.all(loads);
      this._sketchArt = modules[0];
      if (!this._inkArt) {
        this._inkArt = modules[1];
      }
    }
  }

  /**
   * Create and mount post passes for a preset before material rebuild.
   * @param {string} presetId
   */
  async prepareForPreset(presetId) {
    const keys = this._requiredPassKeys(presetId);
    if (!keys.length || !this._composer) return;

    await Promise.all(keys.map((key) => this._ensureInstance(key)));

    for (const key of keys) {
      this._mountPassKey(key);
      this._applySizeToKey(key);
    }

    await this._loadArtForPassKeys(keys);
  }

  /** @param {string} key */
  async _ensureInstance(key) {
    if (this._instances[key]) return this._instances[key];

    if (!this._instancePromises[key]) {
      this._instancePromises[key] = createCreativeLookPassInstance(this.renderer, key)
        .then((instance) => {
          if (instance) {
            this._instances[key] = instance;
          }
          delete this._instancePromises[key];
          return instance;
        });
    }

    return this._instancePromises[key];
  }

  /** @param {string} key */
  _getPass(key) {
    const instance = this._instances[key];
    if (!instance?.getPass) return null;
    return instance.getPass();
  }

  /** @param {string} key */
  _mountPassKey(key) {
    if (this._mountedKeys.has(key) || !this._composer) return;
    const pass = this._getPass(key);
    if (!pass) return;

    const orderIdx = PASS_KEYS.indexOf(key);
    let insertAt = 1;
    for (let i = 0; i < orderIdx; i += 1) {
      if (this._mountedKeys.has(PASS_KEYS[i])) insertAt += 1;
    }

    pass.enabled = false;
    pass.renderToScreen = false;
    this._composer.passes.splice(insertAt, 0, pass);
    this._mountedKeys.add(key);
    this._creativePassSet.add(pass);
  }

  /** @param {string} key */
  _applySizeToKey(key) {
    const instance = this._instances[key];
    if (!instance?.setSize) return;
    instance.setSize(this._logicalW, this._logicalH);
  }

  /** @returns {object[]} */
  _initializedSquarePixelPasses() {
    return SQUARE_PIXEL_KEYS
      .map((key) => this._instances[key])
      .filter(Boolean);
  }

  /**
   * Pin screen-pixel grid density to the live preview while export resizes the GL backing store.
   * @param {number} previewLogicalW
   * @param {number} previewLogicalH
   * @param {number} previewPhysW
   * @param {number} previewPhysH
   */
  pinExportPixelReferences(previewLogicalW, previewLogicalH, previewPhysW, previewPhysH) {
    this._exportPixelPinned = true;
    pinMobileExportPixelReferences(this._initializedSquarePixelPasses(), previewPhysW, previewPhysH);
    this._instances.ascii?.pinReferenceLogicalSize?.(previewLogicalW, previewLogicalH);
  }

  unpinExportPixelReferences() {
    if (!this._exportPixelPinned) return;
    this._exportPixelPinned = false;
    unpinMobileExportPixelReferences(this._initializedSquarePixelPasses());
    this._instances.ascii?.unpinReferenceLogicalSize?.();
  }

  /**
   * Store composer reference — creative passes mount on first preset selection.
   * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
   */
  mount(composer) {
    this._composer = composer;
  }

  /** @param {string | null | undefined} presetId @param {object} [settings] */
  sync(presetId, settings = {}) {
    const id = presetId ? normalizeCreativeLookPreset(presetId) : null;
    this._presetId = id;
    this._settings = settings;

    if (!id || id === 'none' || id === 'standard') {
      this._presentationMode = 'none';
      this._flatVariant = null;
      this._disableAllCreativePasses();
      this._restoreComposerFilter();
      return;
    }

    const masterHueRad = creativeLookMasterHueRadians(settings.masterHue ?? 0);
    const patternScale = normalizeCreativeLookPatternScale(id, settings.patternScale ?? 1);
    const intensity = normalizeCreativeLookIntensity(settings.intensity);

    if (isFlatPostCreativeLookPreset(id)) {
      this._presentationMode = 'flat';
      this._flatVariant = creativeLookFlatPostVariant(id);
      this._syncFlatPostSettings(id, masterHueRad, settings);
      return;
    }

    if (isWatercolourCreativeLookPreset(id)) {
      this._presentationMode = 'watercolour';
      this._flatVariant = null;
      if (this._inkArt && this._watercolourArt) {
        const ink = this._inkArt.resolveCreativeLookInkParams({}, 'watercolour');
        this._instances.watercolour?.updateSettings?.({
          enabled: true,
          patternScale,
          radius: this._watercolourArt.creativeLookWatercolourRadius(patternScale),
          intensity,
          strokeColor: ink.strokeColor,
          preset: 'watercolour',
        });
      }
      return;
    }

    if (isSketchCreativeLookPreset(id) || isSketchColourCreativeLookPreset(id)) {
      this._presentationMode = 'sketch';
      this._flatVariant = null;
      this._syncSketchSettings(id, patternScale, intensity, 0);
      return;
    }

    if (isVectrexCreativeLookPreset(id)) {
      this._presentationMode = 'vectrex';
      this._flatVariant = null;
      this._instances.vectrex?.updateSettings?.({ enabled: true, intensity });
      return;
    }

    this._presentationMode = 'none';
    this._flatVariant = null;
    this._disableAllCreativePasses();
    this._restoreComposerFilter();
  }

  /** @param {string} presetId @param {number} masterHueRad @param {object} [settings] */
  _syncFlatPostSettings(presetId, masterHueRad, settings = {}) {
    const enabled = this._presentationMode === 'flat';
    const patternScale = normalizeCreativeLookPatternScale(
      presetId,
      settings.patternScale ?? 1,
    );
    const intensity = normalizeCreativeLookIntensity(settings.intensity);
    const liftCrush = normalizeCreativeLookLiftCrush(settings.liftCrush);
    const ascii = { enabled: enabled && this._flatVariant === 'ascii', variant: presetId, masterHue: masterHueRad };
    this._instances.ascii?.updateSettings?.(ascii);
    this._instances.ega?.updateSettings?.({ enabled: enabled && this._flatVariant === 'ega-pixel', masterHue: masterHueRad });
    this._instances.c64?.updateSettings?.({ enabled: enabled && this._flatVariant === 'c64-pixel', masterHue: masterHueRad });
    this._instances.gameboy?.updateSettings?.({ enabled: enabled && this._flatVariant === 'gameboy-pixel', masterHue: masterHueRad });
    this._instances.nes?.updateSettings?.({ enabled: enabled && this._flatVariant === 'nes-pixel', masterHue: masterHueRad });
    this._instances.megadrive?.updateSettings?.({ enabled: enabled && this._flatVariant === 'megadrive-pixel', masterHue: masterHueRad });
    this._instances.gba?.updateSettings?.({ enabled: enabled && this._flatVariant === 'gba-pixel', masterHue: masterHueRad });
    this._instances.dither?.updateSettings?.({
      enabled:
        enabled
        && (this._flatVariant === 'dither-neutral'
          || this._flatVariant === 'dither-tritone'
          || this._flatVariant === 'dither-crosshatch'
          || this._flatVariant === 'dither-raster'),
      variant: this._flatVariant ?? 'dither-neutral',
      masterHue: masterHueRad,
      patternScale,
      intensity,
      liftCrush,
    });
  }

  /** @param {string} presetId @param {number} patternScale @param {number} intensity @param {number} time */
  _syncSketchSettings(presetId, patternScale, intensity, time) {
    if (!this._sketchArt || !this._inkArt) return;

    const sketchParams = this._sketchArt.resolveCreativeLookSketchParams({}, patternScale);
    const sketchInk = this._inkArt.resolveCreativeLookInkParams({}, 'sketch');
    const colourInk = this._inkArt.resolveCreativeLookInkParams({}, 'sketch-colour');
    const frame = {
      time,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity,
    };
    this._instances.sketch?.updateSettings?.({
      ...frame,
      enabled: isSketchCreativeLookPreset(presetId) && sketchParams.rasterSize > 0,
      strokeColor: sketchInk.strokeColor,
      preset: 'sketch',
    });
    this._instances.sketchColour?.updateSettings?.({
      ...frame,
      enabled: isSketchColourCreativeLookPreset(presetId) && sketchParams.rasterSize > 0,
      strokeColor: colourInk.strokeColor,
      preset: 'sketch-colour',
    });
  }

  /** @param {import('./MobilePost.js').MobilePost} mobilePost @param {number} [animTime] */
  prepareRender(mobilePost, animTime = 0) {
    const cl = mobilePost.getCreativeLookSettings?.() ?? this._settings ?? {};
    const viewportBloom = !!cl.enabled && !!cl.viewportBloom;

    if (this._presentationMode === 'none') {
      if (!viewportBloom || !this._presetId) {
        if (this._viewportBloomStackActive) {
          mobilePost._applyFxState(mobilePost._fxState);
          this._viewportBloomStackActive = false;
        }
        return;
      }
      this._viewportBloomStackActive = true;
      this._applyViewportBloomStack(mobilePost);
      return;
    }

    this._viewportBloomStackActive = false;

    if (this._presentationMode === 'flat' && this._presetId) {
      const masterHueRad = creativeLookMasterHueRadians(cl.masterHue ?? 0);
      this._syncFlatPostSettings(this._presetId, masterHueRad, cl);
    }

    if (this._presentationMode === 'sketch' && this._presetId) {
      const patternScale = normalizeCreativeLookPatternScale(
        this._presetId,
        cl.patternScale ?? 1,
      );
      this._syncSketchSettings(
        this._presetId,
        patternScale,
        normalizeCreativeLookIntensity(cl.intensity),
        animTime,
      );
    }

    const state = mobilePost._fxState ?? {};
    const bloomActive =
      viewportBloom
      || (
        Boolean(state.bloom?.enabled !== false)
        && Number(state.bloom?.strength ?? 0) > 0.0001
      );
    const grainActive =
      Boolean(state.grain?.enabled !== false)
      && Number(state.grain?.intensity ?? 0) > 0.0001;
    const aberrationActive =
      Boolean(state.aberration?.enabled !== false)
      && Number(state.aberration?.amount ?? 0) > 0.0001;

    const {
      renderPass,
      bloomPass,
      bloomCompositePass,
      filmPass,
      grainTintPass,
      gradingPass,
      aberrationPass,
      composer,
    } = mobilePost;

    for (const pass of composer.passes) {
      if (!this._creativePassSet.has(pass)) {
        pass.enabled = false;
      }
    }
    this._disableAllCreativePasses();

    renderPass.enabled = true;

    if (this._presentationMode === 'flat') {
      const passKey = this._flatVariant ? FLAT_VARIANT_TO_PASS_KEY[this._flatVariant] : null;
      const flatPass = passKey ? this._getPass(passKey) : null;
      if (flatPass) flatPass.enabled = true;
      this._setComposerNearestFilter(true);
      gradingPass.enabled = true;
      if (bloomActive) {
        if (viewportBloom) {
          this._configureViewportBloom(mobilePost);
        }
        bloomPass.enabled = true;
        bloomCompositePass.enabled = true;
      }
      if (grainActive) {
        filmPass.enabled = true;
        grainTintPass.enabled = true;
      }
    } else if (this._presentationMode === 'watercolour') {
      this._restoreComposerFilter();
      const pass = this._getPass('watercolour');
      if (pass) pass.enabled = true;
      gradingPass.enabled = true;
      if (grainActive) {
        filmPass.enabled = true;
        grainTintPass.enabled = true;
      }
      if (aberrationActive) aberrationPass.enabled = true;
    } else if (this._presentationMode === 'sketch') {
      this._restoreComposerFilter();
      const sketchKey = isSketchColourCreativeLookPreset(this._presetId) ? 'sketchColour' : 'sketch';
      const pass = this._getPass(sketchKey);
      if (pass) pass.enabled = true;
      gradingPass.enabled = true;
      if (grainActive) {
        filmPass.enabled = true;
        grainTintPass.enabled = true;
      }
      if (aberrationActive) aberrationPass.enabled = true;
    } else if (this._presentationMode === 'vectrex') {
      this._restoreComposerFilter();
      const pass = this._getPass('vectrex');
      if (pass) pass.enabled = true;
      gradingPass.enabled = true;
      if (grainActive) {
        filmPass.enabled = true;
        grainTintPass.enabled = true;
      }
      if (aberrationActive) aberrationPass.enabled = true;
    }

    mobilePost._syncRenderToScreen();
  }

  /** @param {import('./MobilePost.js').MobilePost} mobilePost */
  _configureViewportBloom(mobilePost) {
    const bloomDefaults = { ...MOBILE_FX_DEFAULTS.bloom, enabled: true };
    const thresh = Number(bloomDefaults.threshold);
    bloomDefaults.threshold = Number.isFinite(thresh)
      ? THREE.MathUtils.clamp(thresh * 0.78 + 0.08, 0.05, 0.92)
      : 0.65;
    mobilePost._updateBloom(bloomDefaults);
  }

  /** @param {import('./MobilePost.js').MobilePost} mobilePost */
  _applyViewportBloomStack(mobilePost) {
    const {
      renderPass,
      bloomPass,
      bloomCompositePass,
      gradingPass,
      composer,
    } = mobilePost;

    this._disableAllCreativePasses();
    this._restoreComposerFilter();

    for (const pass of composer.passes) {
      if (!this._creativePassSet.has(pass)) {
        pass.enabled = false;
      }
    }

    this._configureViewportBloom(mobilePost);
    renderPass.enabled = true;
    bloomPass.enabled = true;
    bloomCompositePass.enabled = true;
    gradingPass.enabled = true;
    mobilePost._syncRenderToScreen();
  }

  /** @param {number} w @param {number} h */
  setSize(w, h) {
    this._logicalW = Math.max(1, w);
    this._logicalH = Math.max(1, h);
    const pr = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    const physW = Math.max(1, Math.floor(w * pr));
    const physH = Math.max(1, Math.floor(h * pr));
    if (!this._exportPixelPinned) {
      pinMobileSquarePixelReferences(this._initializedSquarePixelPasses(), physW, physH);
    }

    for (const key of this._mountedKeys) {
      this._applySizeToKey(key);
    }
  }

  _disableAllCreativePasses() {
    for (const pass of this._creativePassSet) {
      pass.enabled = false;
    }
  }

  /** @param {boolean} nearest */
  _setComposerNearestFilter(nearest) {
    const composer = this._composer;
    if (!composer?.renderTarget1?.texture) return;
    const rt = composer.renderTarget1.texture;
    if (nearest) {
      if (!this._composerFilterRestore) {
        this._composerFilterRestore = { min: rt.minFilter, mag: rt.magFilter };
      }
      rt.minFilter = THREE.NearestFilter;
      rt.magFilter = THREE.NearestFilter;
      if (composer.renderTarget2?.texture) {
        composer.renderTarget2.texture.minFilter = THREE.NearestFilter;
        composer.renderTarget2.texture.magFilter = THREE.NearestFilter;
      }
      return;
    }
    this._restoreComposerFilter();
  }

  _restoreComposerFilter() {
    const composer = this._composer;
    const restore = this._composerFilterRestore;
    if (!composer?.renderTarget1?.texture || !restore) return;
    composer.renderTarget1.texture.minFilter = restore.min;
    composer.renderTarget1.texture.magFilter = restore.mag;
    if (composer.renderTarget2?.texture) {
      composer.renderTarget2.texture.minFilter = restore.min;
      composer.renderTarget2.texture.magFilter = restore.mag;
    }
    this._composerFilterRestore = null;
  }

  dispose() {
    this._restoreComposerFilter();
    for (const key of Object.keys(this._instances)) {
      this._instances[key]?.dispose?.();
    }
    this._instances = {};
    this._instancePromises = {};
    this._mountedKeys.clear();
    this._creativePassSet.clear();
    this._inkArt = null;
    this._sketchArt = null;
    this._watercolourArt = null;
  }
}
