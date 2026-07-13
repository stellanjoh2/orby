import * as THREE from 'three';
import { APP_BACKGROUND, isCreativeLookOpticsPostActive } from '../constants.js';
import {
  creativeLookFlatPostVariant,
  creativeLookMasterHueRadians,
  creativeLookPresetNeedsHdriBackdrop,
  formatCreativeLookPresetLabel,
  isFlatPostCreativeLookPreset,
  isVectrexCreativeLookPreset,
  isWatercolourCreativeLookPreset,
  isGouacheCreativeLookPreset,
  isOpticsCreativeLookPreset,
  isSketchColourCreativeLookPreset,
  isSketchCreativeLookPreset,
  isDitherPixelCreativeLookPreset,
  normalizeCreativeLookIntensity,
  normalizeCreativeLookLiftCrush,
  normalizeCreativeLookMasterHue,
  normalizeCreativeLookPatternScale,
  normalizeCreativeLookPreset,
} from '../render/CreativeLookMaterials.js';
import { creativeLookWatercolourRadius } from '../render/creativeLookWatercolourArt.js';
import {
  resolveCreativeLookSketchParams,
  SKETCH_PAPER_HEX,
} from '../render/creativeLookSketchArt.js';
import { resolveCreativeLookInkParams } from '../render/creativeLookInkArt.js';
import { isArtisticCreativeLookPreset } from '../render/creativeLookPresetSliders.js';
import { ensureAsciiFontAtlasLoaded } from '../render/creativeLookAsciiArt.js';
import { ensureAscii2FontAtlasLoaded } from '../render/creativeLookAscii2Art.js';
import { ensureAscii3FontAtlasLoaded } from '../render/creativeLookAscii3Art.js';
import { ensureAscii4FontAtlasLoaded } from '../render/creativeLookAscii4Art.js';
import {
  applyTransmissionSceneBackground,
  isSolidStudioBackdropActive,
  resolveSolidStudioBackdropColor,
} from '../render/backgroundFallback.js';

/**
 * Scene-side Shader Lab sync — post passes, artistic backdrop, transmission backdrop,
 * and apply-from-state orchestration (material rebuild stays in MaterialController).
 */
export class CreativeLookSceneSync {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.resetState();
  }

  resetState() {
    /** @type {boolean} */
    this._studioBgSynced = false;
    /** @type {string | null} */
    this._studioBgHex = null;
    /** @type {boolean} */
    this._artisticPaperBg = false;
    /** @type {Promise<void> | undefined} */
    this._applyChain = undefined;
  }

  /** @param {string} hex */
  noteStudioBackgroundColor(hex) {
    this._studioBgHex = hex;
  }

  /** Shared deps for Gouache / Watercolour / Sketch capture hooks + live viewport prep. */
  captureDeps() {
    const scene = this.scene;
    return {
      postPipeline: scene.postPipeline,
      getState: () => scene.stateStore.getState(),
      getCreativeLookAnimationTime: () =>
        scene.materialController?.getCreativeLookAnimationTime?.() ?? 0,
    };
  }

  /**
   * MeshPhysicalMaterial transmission refracts `scene.background`, not the clear color.
   * When Render Backdrop is off, use the user's backdrop color on `scene.background` instead
   * of forcing the HDRI image back on.
   */
  syncTransmissionBackdrop() {
    return applyTransmissionSceneBackground(this.scene);
  }

  /** Enable / tune flat-post passes (ASCII, C64, Game Boy). */
  syncAsciiPass() {
    const scene = this.scene;
    const storeCl = scene.stateStore?.getState()?.creativeLook ?? {};
    const mcCl = scene.materialController?.getCreativeLookSettings?.() ?? {};
    const presetId = normalizeCreativeLookPreset(storeCl.preset ?? mcCl.preset);
    const creativeLookOn =
      (storeCl.enabled ?? mcCl.enabled) === true;
    const prevCreativeLookBackdrop =
      scene.backgroundController?.creativeLookBackdropActive === true;
    scene.backgroundController?.setCreativeLookBackdropActive?.(creativeLookOn);
    if (prevCreativeLookBackdrop !== creativeLookOn) {
      scene.environmentController?.setBackgroundEnabled?.(scene.hdriBackgroundEnabled);
    }
    const enabled = creativeLookOn && isFlatPostCreativeLookPreset(presetId);
    const flatVariant = enabled ? creativeLookFlatPostVariant(presetId) : null;
    const isAscii = flatVariant === 'ascii';

    const masterHue = normalizeCreativeLookMasterHue(storeCl.masterHue ?? mcCl.masterHue);
    const masterHueRad = creativeLookMasterHueRadians(masterHue);
    const asciiSettings = {
      enabled: enabled && isAscii,
      variant: presetId,
      masterHue: masterHueRad,
    };
    const egaSettings = {
      enabled: enabled && flatVariant === 'ega-pixel',
      masterHue: masterHueRad,
    };
    const c64Settings = {
      enabled: enabled && flatVariant === 'c64-pixel',
      masterHue: masterHueRad,
    };
    const gameBoySettings = {
      enabled: enabled && flatVariant === 'gameboy-pixel',
      masterHue: masterHueRad,
    };
    const nesSettings = {
      enabled: enabled && flatVariant === 'nes-pixel',
      masterHue: masterHueRad,
    };
    const megaDriveSettings = {
      enabled: enabled && flatVariant === 'megadrive-pixel',
      masterHue: masterHueRad,
    };
    const gbaSettings = {
      enabled: enabled && flatVariant === 'gba-pixel',
      masterHue: masterHueRad,
    };
    const intellivisionSettings = {
      enabled: enabled && flatVariant === 'intellivision-pixel',
      masterHue: masterHueRad,
    };

    const apple2Settings = {
      enabled: enabled && flatVariant === 'apple2-pixel',
      masterHue: masterHueRad,
    };

    const patternScale = normalizeCreativeLookPatternScale(
      presetId,
      Number(storeCl.patternScale ?? mcCl.patternScale),
    );
    const intensity = normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity);
    const liftCrush = normalizeCreativeLookLiftCrush(storeCl.liftCrush ?? mcCl.liftCrush);
    const ditherSettings = {
      enabled: enabled && isDitherPixelCreativeLookPreset(presetId),
      variant: presetId,
      masterHue: masterHueRad,
      patternScale,
      intensity,
      liftCrush,
    };

    scene.postPipeline?.setCreativeLookFlatPostMode?.({ enabled, variant: flatVariant });
    scene.postPipeline?.updateCreativeLookAscii(asciiSettings);
    scene.postPipeline?.updateCreativeLookEga?.(egaSettings);
    scene.postPipeline?.updateCreativeLookC64?.(c64Settings);
    scene.postPipeline?.updateCreativeLookGameBoy?.(gameBoySettings);
    scene.postPipeline?.updateCreativeLookNes?.(nesSettings);
    scene.postPipeline?.updateCreativeLookMegaDrive?.(megaDriveSettings);
    scene.postPipeline?.updateCreativeLookIntellivision?.(intellivisionSettings);
    scene.postPipeline?.updateCreativeLookGba?.(gbaSettings);
    scene.postPipeline?.updateCreativeLookApple2?.(apple2Settings);
    scene.postPipeline?.updateCreativeLookDither?.(ditherSettings);

    const watercolourOn = creativeLookOn && isWatercolourCreativeLookPreset(presetId);
    const gouacheOn = creativeLookOn && isGouacheCreativeLookPreset(presetId);
    const opticsOn = creativeLookOn && isOpticsCreativeLookPreset(presetId);
    const sketchOn = creativeLookOn && isSketchCreativeLookPreset(presetId);
    const sketchColourOn = creativeLookOn && isSketchColourCreativeLookPreset(presetId);
    const sketchFamilyOn = sketchOn || sketchColourOn;
    const vectrexOn = creativeLookOn && isVectrexCreativeLookPreset(presetId);
    const presetParams = storeCl.presetParams ?? mcCl.presetParams;
    const watercolourInk = resolveCreativeLookInkParams(presetParams, 'watercolour');
    const watercolourSettings = {
      enabled: watercolourOn,
      patternScale,
      radius: creativeLookWatercolourRadius(patternScale),
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: watercolourInk.strokeColor,
      preset: 'watercolour',
    };
    scene.postPipeline?.updateCreativeLookWatercolour?.(watercolourSettings);
    if (!watercolourOn) {
      scene.postPipeline?.releaseCreativeLookWatercolour?.();
    }

    const gouacheInk = resolveCreativeLookInkParams(presetParams, 'gouache');
    const gouacheSettings = {
      enabled: gouacheOn,
      patternScale,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: gouacheInk.strokeColor,
      preset: 'gouache',
    };
    scene.postPipeline?.updateCreativeLookGouache?.(gouacheSettings);
    if (!gouacheOn) {
      scene.postPipeline?.releaseCreativeLookGouache?.();
    }

    const opticsSettings = {
      enabled: opticsOn,
      variant: presetId,
      patternScale,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      masterHue: masterHueRad,
      liftCrush,
      backdropFlat: isSolidStudioBackdropActive(scene.stateStore.getState()),
      backdropColor: resolveSolidStudioBackdropColor(scene.stateStore.getState()),
    };
    scene.postPipeline?.updateCreativeLookOptics?.(opticsSettings);
    if (!opticsOn) {
      scene.postPipeline?.releaseCreativeLookOptics?.();
    }

    const sketchParams = resolveCreativeLookSketchParams(
      presetParams,
      patternScale,
    );
    const sketchInk = resolveCreativeLookInkParams(presetParams, 'sketch');
    const sketchColourInk = resolveCreativeLookInkParams(presetParams, 'sketch-colour');
    const sketchSettings = {
      enabled: sketchOn && sketchParams.rasterSize > 0,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: sketchInk.strokeColor,
      preset: 'sketch',
    };
    const sketchColourSettings = {
      enabled: sketchColourOn && sketchParams.rasterSize > 0,
      strokeWidth: sketchParams.strokeWidth,
      rasterSize: sketchParams.rasterSize,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
      strokeColor: sketchColourInk.strokeColor,
      preset: 'sketch-colour',
    };
    scene.postPipeline?.updateCreativeLookSketch?.(sketchSettings);
    scene.postPipeline?.updateCreativeLookSketchColour?.(sketchColourSettings);
    if (!sketchFamilyOn) {
      scene.postPipeline?.releaseCreativeLookSketch?.();
    }

    const vectrexSettings = {
      enabled: vectrexOn,
      intensity: normalizeCreativeLookIntensity(storeCl.intensity ?? mcCl.intensity),
    };
    scene.postPipeline?.updateCreativeLookVectrex?.(vectrexSettings);
    if (!vectrexOn) {
      scene.postPipeline?.releaseCreativeLookVectrex?.();
    }

    this.syncStudioBackground(creativeLookOn, presetId);

    if (enabled || watercolourOn || gouacheOn || opticsOn || sketchFamilyOn || vectrexOn) {
      const sz = new THREE.Vector2();
      scene.renderer.getSize(sz);
      if (sz.x > 0 && sz.y > 0) {
        if (enabled) {
          scene.postPipeline?.creativeLookAscii?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookEga?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookC64?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookGameBoy?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookNes?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookMegaDrive?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookIntellivision?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookGba?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookApple2?.setSize(sz.x, sz.y);
          scene.postPipeline?.creativeLookDither?.setSize(sz.x, sz.y);
        }
        if (watercolourOn) {
          scene.postPipeline?.creativeLookWatercolour?.setSize(sz.x, sz.y);
        }
        if (gouacheOn) {
          scene.postPipeline?.creativeLookGouache?.setSize(sz.x, sz.y);
        }
        if (opticsOn) {
          scene.postPipeline?.creativeLookOptics?.setSize(sz.x, sz.y);
        }
        if (sketchOn) {
          scene.postPipeline?.creativeLookSketch?.setSize(sz.x, sz.y);
        }
        if (sketchColourOn) {
          scene.postPipeline?.creativeLookSketchColour?.setSize(sz.x, sz.y);
        }
        if (vectrexOn) {
          scene.postPipeline?.creativeLookVectrex?.setSize(sz.x, sz.y);
        }
      }
      if (isAscii) {
        const loadAtlas =
          presetId === 'ascii-art-2'
            ? ensureAscii3FontAtlasLoaded
            : presetId === 'ascii-art-3'
              ? ensureAscii2FontAtlasLoaded
              : presetId === 'ascii-art-4'
                ? ensureAscii4FontAtlasLoaded
                : ensureAsciiFontAtlasLoaded;
        void loadAtlas().then(() => {
          scene.postPipeline?.creativeLookAscii?.refreshAtlas?.();
          scene.postPipeline?.updateCreativeLookAscii(asciiSettings);
        });
      }
    }
  }

  /** Per-frame optics post uniforms — animated grain + live intensity/scale. */
  prepareOpticsFrameUniforms() {
    const scene = this.scene;
    if (!isCreativeLookOpticsPostActive(scene.stateStore.getState())) return;
    const state = scene.stateStore.getState();
    const cl = state.creativeLook ?? {};
    const presetId = normalizeCreativeLookPreset(cl.preset);
    const patternScale = normalizeCreativeLookPatternScale(
      presetId,
      Number(cl.patternScale),
    );
    scene.postPipeline?.updateCreativeLookOptics?.({
      time: scene.materialController?.getCreativeLookAnimationTime?.() ?? 0,
      patternScale,
      intensity: normalizeCreativeLookIntensity(cl.intensity),
      variant: presetId,
      masterHue: creativeLookMasterHueRadians(normalizeCreativeLookMasterHue(cl.masterHue)),
      liftCrush: normalizeCreativeLookLiftCrush(cl.liftCrush),
      backdropFlat: isSolidStudioBackdropActive(state),
      backdropColor: resolveSolidStudioBackdropColor(state),
    });
  }

  /**
   * Shader Lab backdrop — artistic presets use warm paper white; other presets keep studio color.
   * @param {boolean} creativeLookOn
   * @param {import('../render/CreativeLookMaterials.js').CreativeLookPreset | string} [presetId]
   */
  syncStudioBackground(creativeLookOn, presetId = '') {
    const scene = this.scene;
    const state = scene.stateStore.getState();
    const studioBg = state.background ?? APP_BACKGROUND;
    const studioGradient = state.backgroundGradient;

    const restoreStudioBackdrop = () => {
      scene.syncStudioBackgroundColor(studioBg);
      if (studioGradient) {
        scene.backgroundGradientController?.setConfig(studioGradient);
      }
      this._artisticPaperBg = false;
    };

    if (!creativeLookOn) {
      if (this._artisticPaperBg) {
        restoreStudioBackdrop();
      }
      this._studioBgSynced = false;
      this._studioBgHex = null;
      return;
    }

    const artisticOn = isArtisticCreativeLookPreset(
      normalizeCreativeLookPreset(presetId),
    );

    if (artisticOn) {
      if (!this._artisticPaperBg) {
        scene.backgroundController?.setColor(SKETCH_PAPER_HEX);
        scene.backgroundGradientController?.setConfig({
          ...(studioGradient ?? {}),
          enabled: false,
        });
        scene.environmentController?.setFallbackColor(SKETCH_PAPER_HEX);
        this._artisticPaperBg = true;
      }
      this._studioBgSynced = true;
      return;
    }

    if (this._artisticPaperBg) {
      restoreStudioBackdrop();
      this._studioBgSynced = true;
      return;
    }

    const studioBgChanged = this._studioBgHex !== studioBg;
    if (this._studioBgSynced && !studioBgChanged) return;
    scene.syncStudioBackgroundColor(studioBg);
    if (studioGradient) {
      scene.backgroundGradientController?.setConfig(studioGradient);
    }
    this._studioBgSynced = true;
  }

  /**
   * Apply Shader Lab state with viewport spinner + toast when materials rebuild.
   * @param {object} creativeLookState
   * @param {{ skipStateStore?: boolean }} [options]
   */
  applyFromState(creativeLookState, options = {}) {
    this._applyChain = (this._applyChain ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.applyFromStateOnce(creativeLookState, options));
    return this._applyChain;
  }

  /**
   * @param {object} creativeLookState
   * @param {{ skipStateStore?: boolean }} [options]
   */
  async applyFromStateOnce(creativeLookState, options = {}) {
    const scene = this.scene;
    const mc = scene.materialController;
    if (!mc) return;

    const heavy = mc.willRebuildCreativeLookMaterials(creativeLookState);
    if (heavy) {
      scene.ui?.setLoadSpinnerStatusPrefix?.('Loading shader');
      scene.ui?.beginLoadSpinner?.();
      scene.ui?.beginLoadSpinnerElapsed?.();
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
    }

    try {
      mc.setCreativeLookSettings(creativeLookState, options);
      mc.deferCreativeLookSurfaceResync?.();
      this.syncAsciiPass();
      const preset = normalizeCreativeLookPreset(creativeLookState?.preset);
      // Glass / Chrome need scene.background for transmission — only when materials rebuild,
      // not on live tweaks (bloom, sketch sliders, etc.) that reuse mesh:creative-look.
      if (
        heavy &&
        creativeLookState?.enabled === true &&
        creativeLookPresetNeedsHdriBackdrop(preset)
      ) {
        this.syncTransmissionBackdrop();
      }
      if (heavy && creativeLookState?.enabled) {
        const label = formatCreativeLookPresetLabel(creativeLookState.preset);
        scene.ui?.showToast?.(`${label} loaded`, 2800, {
          notification: false,
          icon: 'success',
        });
      }
    } finally {
      if (heavy) {
        scene.ui?.endLoadSpinner?.();
      }
      // Heavy applies yield two rAFs before materials swap; the state-store wake from the
      // preset click can paint and stop the idle loop while shaders are still stale.
      scene.requestRender();
    }
  }
}
