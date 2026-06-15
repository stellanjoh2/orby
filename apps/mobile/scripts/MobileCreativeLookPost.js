import * as THREE from 'three';
import { CreativeLookAsciiPass } from '../../../scripts/render/CreativeLookAsciiPass.js';
import { CreativeLookEgaPass } from '../../../scripts/render/CreativeLookEgaPass.js';
import { CreativeLookC64Pass } from '../../../scripts/render/CreativeLookC64Pass.js';
import { CreativeLookGameBoyPass } from '../../../scripts/render/CreativeLookGameBoyPass.js';
import { CreativeLookNesPass } from '../../../scripts/render/CreativeLookNesPass.js';
import { CreativeLookMegaDrivePass } from '../../../scripts/render/CreativeLookMegaDrivePass.js';
import { CreativeLookGbaPass } from '../../../scripts/render/CreativeLookGbaPass.js';
import { CreativeLookDitherPass } from '../../../scripts/render/CreativeLookDitherPass.js';
import { CreativeLookVectrex } from '../../../scripts/render/CreativeLookVectrexPass.js';
import { CreativeLookWatercolour } from '../../../scripts/render/CreativeLookWatercolourPass.js';
import { CreativeLookSketch } from '../../../scripts/render/CreativeLookSketchPass.js';
import { CreativeLookSketchColour } from '../../../scripts/render/CreativeLookSketchColourPass.js';
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
import { ensureAsciiFontAtlasLoaded } from '../../../scripts/render/creativeLookAsciiArt.js';
import { resolveCreativeLookInkParams } from '../../../scripts/render/creativeLookInkArt.js';
import { resolveCreativeLookSketchParams } from '../../../scripts/render/creativeLookSketchArt.js';
import { creativeLookWatercolourRadius } from '../../../scripts/render/creativeLookWatercolourArt.js';
import { MOBILE_FX_DEFAULTS } from './mobileFxDefaults.js';

/**
 * Screen-space Shader Lab passes for Orby Mobile — material prepass runs in
 * MaterialController; this module adds the missing ASCII / pixel / sketch / etc. post stack.
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

    this.creativeLookAscii = new CreativeLookAsciiPass(renderer);
    this.creativeLookEga = new CreativeLookEgaPass(renderer);
    this.creativeLookC64 = new CreativeLookC64Pass(renderer);
    this.creativeLookGameBoy = new CreativeLookGameBoyPass(renderer);
    this.creativeLookNes = new CreativeLookNesPass(renderer);
    this.creativeLookMegaDrive = new CreativeLookMegaDrivePass(renderer);
    this.creativeLookGba = new CreativeLookGbaPass(renderer);
    this.creativeLookDither = new CreativeLookDitherPass(renderer);
    this.creativeLookVectrex = new CreativeLookVectrex(renderer);
    this.creativeLookWatercolour = new CreativeLookWatercolour(renderer);
    this.creativeLookSketch = new CreativeLookSketch(renderer);
    this.creativeLookSketchColour = new CreativeLookSketchColour(renderer);

    this.creativeLookAsciiPass = this.creativeLookAscii.getPass();
    this.creativeLookEgaPass = this.creativeLookEga.getPass();
    this.creativeLookC64Pass = this.creativeLookC64.getPass();
    this.creativeLookGameBoyPass = this.creativeLookGameBoy.getPass();
    this.creativeLookNesPass = this.creativeLookNes.getPass();
    this.creativeLookMegaDrivePass = this.creativeLookMegaDrive.getPass();
    this.creativeLookGbaPass = this.creativeLookGba.getPass();
    this.creativeLookDitherPass = this.creativeLookDither.getPass();
    this.creativeLookVectrexPass = this.creativeLookVectrex.getPass();
    this.creativeLookWatercolourPass = this.creativeLookWatercolour.getPass();
    this.creativeLookSketchPass = this.creativeLookSketch.getPass();
    this.creativeLookSketchColourPass = this.creativeLookSketchColour.getPass();

    /** @type {Record<string, import('three/examples/jsm/postprocessing/Pass.js').Pass>} */
    this._flatPassByVariant = {
      ascii: this.creativeLookAsciiPass,
      'ega-pixel': this.creativeLookEgaPass,
      'c64-pixel': this.creativeLookC64Pass,
      'gameboy-pixel': this.creativeLookGameBoyPass,
      'nes-pixel': this.creativeLookNesPass,
      'megadrive-pixel': this.creativeLookMegaDrivePass,
      'gba-pixel': this.creativeLookGbaPass,
      'dither-neutral': this.creativeLookDitherPass,
      'dither-tritone': this.creativeLookDitherPass,
      'dither-crosshatch': this.creativeLookDitherPass,
      'dither-raster': this.creativeLookDitherPass,
    };

    this._allCreativePasses = [
      this.creativeLookAsciiPass,
      this.creativeLookEgaPass,
      this.creativeLookC64Pass,
      this.creativeLookGameBoyPass,
      this.creativeLookNesPass,
      this.creativeLookMegaDrivePass,
      this.creativeLookGbaPass,
      this.creativeLookDitherPass,
      this.creativeLookVectrexPass,
      this.creativeLookWatercolourPass,
      this.creativeLookSketchPass,
      this.creativeLookSketchColourPass,
    ];
    this._creativePassSet = new Set(this._allCreativePasses);
    /** @type {{ min: number, mag: number } | null} */
    this._composerFilterRestore = null;
    /** @type {object} */
    this._settings = {};
    this._viewportBloomStackActive = false;
  }

  /**
   * Insert creative passes immediately after the scene RenderPass.
   * @param {import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer} composer
   */
  mount(composer) {
    this._composer = composer;
    let insertAt = 1;
    for (const pass of this._allCreativePasses) {
      pass.enabled = false;
      pass.renderToScreen = false;
      composer.passes.splice(insertAt, 0, pass);
      insertAt += 1;
    }
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
      if (this._flatVariant === 'ascii') {
        void ensureAsciiFontAtlasLoaded().then(() => {
          this.creativeLookAscii.refreshAtlas?.();
          this._syncFlatPostSettings(id, masterHueRad, settings);
        });
      }
      return;
    }

    if (isWatercolourCreativeLookPreset(id)) {
      this._presentationMode = 'watercolour';
      this._flatVariant = null;
      const ink = resolveCreativeLookInkParams({}, 'watercolour');
      this.creativeLookWatercolour.updateSettings({
        enabled: true,
        patternScale,
        radius: creativeLookWatercolourRadius(patternScale),
        intensity,
        strokeColor: ink.strokeColor,
        preset: 'watercolour',
      });
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
      this.creativeLookVectrex.updateSettings({ enabled: true, intensity });
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
    this.creativeLookAscii.updateSettings(ascii);
    this.creativeLookEga.updateSettings({ enabled: enabled && this._flatVariant === 'ega-pixel', masterHue: masterHueRad });
    this.creativeLookC64.updateSettings({ enabled: enabled && this._flatVariant === 'c64-pixel', masterHue: masterHueRad });
    this.creativeLookGameBoy.updateSettings({ enabled: enabled && this._flatVariant === 'gameboy-pixel', masterHue: masterHueRad });
    this.creativeLookNes.updateSettings({ enabled: enabled && this._flatVariant === 'nes-pixel', masterHue: masterHueRad });
    this.creativeLookMegaDrive.updateSettings({ enabled: enabled && this._flatVariant === 'megadrive-pixel', masterHue: masterHueRad });
    this.creativeLookGba.updateSettings({ enabled: enabled && this._flatVariant === 'gba-pixel', masterHue: masterHueRad });
    this.creativeLookDither.updateSettings({
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
    const sketchParams = resolveCreativeLookSketchParams({}, patternScale);
    const sketchInk = resolveCreativeLookInkParams({}, 'sketch');
    const colourInk = resolveCreativeLookInkParams({}, 'sketch-colour');
    const frame = {
      time,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity,
    };
    this.creativeLookSketch.updateSettings({
      ...frame,
      enabled: isSketchCreativeLookPreset(presetId) && sketchParams.rasterSize > 0,
      strokeColor: sketchInk.strokeColor,
      preset: 'sketch',
    });
    this.creativeLookSketchColour.updateSettings({
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
      const flatPass = this._flatVariant ? this._flatPassByVariant[this._flatVariant] : null;
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
      this.creativeLookWatercolourPass.enabled = true;
      gradingPass.enabled = true;
      if (grainActive) {
        filmPass.enabled = true;
        grainTintPass.enabled = true;
      }
      if (aberrationActive) aberrationPass.enabled = true;
    } else if (this._presentationMode === 'sketch') {
      this._restoreComposerFilter();
      if (isSketchColourCreativeLookPreset(this._presetId)) {
        this.creativeLookSketchColourPass.enabled = true;
      } else {
        this.creativeLookSketchPass.enabled = true;
      }
      gradingPass.enabled = true;
      if (grainActive) {
        filmPass.enabled = true;
        grainTintPass.enabled = true;
      }
      if (aberrationActive) aberrationPass.enabled = true;
    } else if (this._presentationMode === 'vectrex') {
      this._restoreComposerFilter();
      this.creativeLookVectrexPass.enabled = true;
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
    this.creativeLookAscii.setSize(w, h);
    this.creativeLookEga.setSize(w, h);
    this.creativeLookC64.setSize(w, h);
    this.creativeLookGameBoy.setSize(w, h);
    this.creativeLookNes.setSize(w, h);
    this.creativeLookMegaDrive.setSize(w, h);
    this.creativeLookGba.setSize(w, h);
    this.creativeLookDither.setSize(w, h);
    this.creativeLookVectrex.setSize(w, h);
    this.creativeLookWatercolour.setSize(w, h);
    this.creativeLookSketch.setSize(w, h);
    this.creativeLookSketchColour.setSize(w, h);
  }

  _disableAllCreativePasses() {
    for (const pass of this._allCreativePasses) {
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
  }
}
