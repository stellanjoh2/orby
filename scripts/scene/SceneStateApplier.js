import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  effectiveVignetteIntensity,
  cameraShadowsUiToShader,
} from '../constants.js';

/**
 * Ordered registry that replays a full StateStore snapshot onto SceneManager.
 * Keep step order identical to the legacy `applyStateSnapshot` implementation.
 *
 * @typedef {{ id: string, apply: (scene: import('../SceneManager.js').SceneManager, state: object) => void | Promise<void> }} StateApplyStep
 */

/** @returns {StateApplyStep[]} */
function createStateApplySteps() {
  return [
    {
      id: 'transform',
      apply: (s, state) => {
        s.transformController?.applyState(state);
      },
    },
    {
      id: 'shading',
      apply: (s, state) => {
        s.setShading(state.shading);
      },
    },
    {
      id: 'mesh-auto-rotate',
      apply: (s, state) => {
        s.autoRotateSpeed = state.autoRotate;
      },
    },
    {
      id: 'camera-orbit-handheld',
      apply: (s, state) => {
        s.setCameraAutoOrbit(state.camera?.autoOrbit ?? 'off');
        s.setCameraHandheld(state.camera?.handheld ?? 'off');
      },
    },
    {
      id: 'ground',
      apply: (s, state) => {
        s.setGroundSolid(state.groundSolid);
        s.setGroundWire(state.groundWire);
        s.setGroundSolidColor(state.groundSolidColor);
        s.setGroundWireColor(state.groundWireColor);
        s.setGroundWireOpacity(state.groundWireOpacity);
        s.setGridY(state.gridY ?? 0);
      },
    },
    {
      id: 'base',
      apply: (s, state) => {
        s.setBaseScale(state.baseScale ?? 1, { updateState: false });
        s.setBaseMetalness(state.baseMetalness ?? DEFAULT_MATERIAL_METALNESS, {
          updateState: false,
        });
        s.setBaseRoughness(state.baseRoughness ?? DEFAULT_MATERIAL_ROUGHNESS, {
          updateState: false,
        });
        s.setBaseReflection(state.baseReflection ?? 1, { updateState: false });
        s.setBaseClearcoat(state.baseClearcoat ?? 0, { updateState: false });
        s.setBaseGlassSurface(
          !!(state.baseGlassSurface ?? state.podiumReflectMesh ?? false),
          { updateState: false },
        );
        s.setBaseGlassBlur(state.baseGlassBlur ?? DEFAULT_BASE_GLASS_BLUR, {
          updateState: false,
        });
        s.setBaseGlassAmount(state.baseGlassAmount ?? DEFAULT_BASE_GLASS_AMOUNT, {
          updateState: false,
        });
        s.setBaseGlassBrightness(
          state.baseGlassBrightness ?? DEFAULT_BASE_GLASS_BRIGHTNESS,
          { updateState: false },
        );
      },
    },
    {
      id: 'backdrop',
      apply: (s, state) => {
        s.setBackdropEnabled(!!state.backdropEnabled, { updateState: false });
        s.setBackdropScale(state.backdropScale ?? 1, { updateState: false });
        s.setBackdropWidth(state.backdropWidth ?? 2, { updateState: false });
        s.setBackdropColor(state.backdropColor ?? '#808080', { updateState: false });
        s.setBackdropRotation(state.backdropRotation ?? 0, { updateState: false });
        s.setBackdropY(state.backdropY ?? 0, { updateState: false });
        s.setBackdropTextureEnabled(!!state.backdropTextureEnabled, {
          updateState: false,
        });
        s.setBackdropTextureScale(state.backdropTextureScale ?? 1.8, {
          updateState: false,
        });
      },
    },
    {
      id: 'wireframe-grid',
      apply: (s, state) => {
        s.setSceneGeometryWireframe(false);
        s.setGridScale(state.gridScale ?? 1);
      },
    },
    {
      id: 'auto-exposure',
      apply: (s, state) => {
        s.autoExposureController?.applyStateSnapshot(state);
      },
    },
    {
      id: 'base-hdri-strength-init',
      apply: (s, state) => {
        if (s.baseHdriStrength === undefined) {
          s.baseHdriStrength = (state.hdriStrength ?? 2) * state.exposure;
        }
      },
    },
    {
      id: 'camera-lens-tilt',
      apply: (s, state) => {
        s.syncPerspectiveCameraFovAndLens();
        s.cameraController?.setTilt(state.camera.tilt ?? 0);
      },
    },
    {
      id: 'camera-isometric',
      apply: (s, state) => {
        const iso = state.camera?.isometric;
        if (!iso) return;
        s.applyIsometricCamera?.(iso);
      },
    },
    {
      id: 'lights',
      apply: (s, state) => {
        s.lightsMaster = state.lightsMaster ?? 0.30;
        s.lightsController?.setMaster(s.lightsMaster, state.lights);
        s.setLightsEnabled(state.lightsEnabled ?? false);
        s.setLightsRotation(state.lightsRotation ?? 0);
        s.setLightsHeight(state.lightsHeight ?? 5);
        s.setShowLightIndicators(state.showLightIndicators ?? false);
        s.setLightsAutoRotate(state.lightsAutoRotate ?? false);
        s.setLightsCastShadows(state.lightsCastShadows ?? true);
        s.setLightsShadowQuality(state.lightsShadowQuality ?? 'medium');
        s.setLightsShadowSoftness(state.lightsShadowSoftness ?? 4);
        s.setLightsShadowColor(state.lightsShadowColor ?? '#000000');
        s.setLightsShadowOpacity(state.lightsShadowOpacity ?? 0.25);
        s.setLightsShadowContactOffset(state.lightsShadowContactOffset ?? -0.0001);
        s.setLightsShadowTwoSided(state.lightsShadowTwoSided ?? false);
        if (state.lights) {
          Object.entries(state.lights).forEach(([lightId, config]) => {
            if (config.intensity !== undefined) {
              s.lightsController?.updateLightProperty(lightId, 'intensity', config.intensity);
            }
            if (config.height !== undefined) {
              s.lightsController?.updateLightProperty(lightId, 'height', config.height);
            }
            if (config.rotate !== undefined) {
              s.lightsController?.updateLightProperty(lightId, 'rotate', config.rotate);
            }
          });
        }
      },
    },
    {
      id: 'material',
      apply: (s, state) => {
        if (state.material?.brightness !== undefined) {
          s.materialController.setMaterialBrightness(state.material.brightness);
        }
        if (state.material?.metalness !== undefined) {
          s.materialController.setMaterialMetalness(state.material.metalness);
        }
        if (state.material?.roughness !== undefined) {
          s.materialController.setMaterialRoughness(state.material.roughness);
        }
        if (state.material?.emissive !== undefined) {
          s.materialController.setMaterialEmissive(state.material.emissive);
        }
        if (state.diffuseBrightness !== undefined && state.material?.brightness === undefined) {
          s.materialController.setMaterialBrightness(state.diffuseBrightness);
        }
        if (state.clay) {
          s.materialController.setClaySettings(state.clay);
        }
        if (state.fresnel) {
          s.materialController.setFresnelSettings(state.fresnel);
        }
        if (state.subsurface) {
          s.setSubsurfaceSettings(state.subsurface);
        }
        if (state.wireframe) {
          s.materialController.setWireframeSettings(state.wireframe);
        }
        if (state.creativeLook) {
          s.materialController.setCreativeLookSettings(state.creativeLook, {
            skipStateStore: true,
          });
        }
      },
    },
    {
      id: 'svg-extrude',
      apply: (s, state) => {
        if (state.svgExtrude?.depth !== undefined) {
          s.setSvgExtrudeDepth(state.svgExtrude.depth);
        }
        if (state.svgExtrude?.normalAngle !== undefined) {
          s.setSvgExtrudeNormalAngle(state.svgExtrude.normalAngle);
        }
        if (state.svgExtrude?.colorDepths !== undefined) {
          s.setSvgExtrudeColorDepths(state.svgExtrude.colorDepths, { updateState: false });
        }
        if (state.svgExtrude?.colorOffsets !== undefined) {
          s.setSvgExtrudeColorOffsets(state.svgExtrude.colorOffsets, { updateState: false });
        }
        if (state.svgExtrude?.flipDirection !== undefined) {
          s.setSvgExtrudeFlipDirection(state.svgExtrude.flipDirection, { updateState: false });
        }
        if (state.svgExtrude) {
          s.setSvgExtrudeColorOverride(
            {
              enabled: !!state.svgExtrude.colorOverride,
              color: state.svgExtrude.overrideColor ?? '#7ed321',
            },
            { updateState: false },
          );
          s.setSvgExtrudeSurface(
            {
              preset: state.svgExtrude.surfacePreset,
              scale: state.svgExtrude.surfaceScale,
            },
            { updateState: false },
          );
        }
      },
    },
    {
      id: 'advanced-reverse-normals',
      apply: (s, state) => {
        s.setReverseNormals(state.advanced?.reverseNormals ?? false);
      },
    },
    {
      id: 'post-lens-dirt',
      apply: (s, state) => {
        s.lensDirtController?.updateSettings(state.lensDirt);
        s.updateGrain(state.grain);
        s.updateAberration(state.aberration);
      },
    },
    {
      id: 'background-tone-hdri-strength',
      apply: (s, state) => {
        s.backgroundController?.setColor(state.background);
        s.setToneMapping(state.toneMapping ?? 'aces-filmic');
        s.setHdriStrength(state.hdriStrength ?? 2);
      },
    },
    {
      id: 'camera-color-grade',
      apply: (s, state) => {
        s.setContrast(state.camera?.contrast ?? 1.0);
        s.setSaturation(state.camera?.saturation ?? 1.0);
        s.setClarity(state.camera?.clarity ?? 0);
        s.setFade(state.camera?.fade ?? 0);
        s.setSharpness(state.camera?.sharpness ?? 0);
        s.setToneCurve(state.toneCurve);
        s.setTemperature(state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
        s.setTint((state.camera?.tint ?? 0) / 100);
        s.setHighlights((state.camera?.highlights ?? 0) / 100);
        s.setShadows(cameraShadowsUiToShader(state.camera?.shadows ?? 0));
        const defaultCam = s.stateStore.getDefaults().camera ?? {};
        s.setVignette(effectiveVignetteIntensity(state.camera, defaultCam));
        s.setVignetteColor(state.camera?.vignetteColor ?? '#000000');
      },
    },
    {
      id: 'clay-normal-map',
      apply: (s, state) => {
        if (state.clay?.normalMap !== undefined) {
          s.setClayNormalMap(state.clay.normalMap);
        }
      },
    },
    {
      id: 'hdri-env',
      apply: async (s, state) => {
        s.setHdriBlurriness(state.hdriBlurriness ?? 0);
        s.setHdriRotation(state.hdriRotation ?? 0);
        s.setHdriEnabled(state.hdriEnabled);
        s.setHdriBackground(state.hdriBackground);
        s.lensFlareController?.applyStateSnapshot(state);
        await s.setHdriPreset(state.hdri);
      },
    },
    {
      id: 'render-quality',
      apply: (s) => {
        s.applyRenderQualitySettings();
      },
    },
    {
      id: 'color-checker',
      apply: (s, state) => {
        s.applyColorCheckerFromState(state);
        s._ensureColorCheckerReferenceShadingConsistency();
      },
    },
    {
      id: 'viewport-framing',
      apply: (s, state) => {
        s.viewportFramingOverlays.syncFromCamera(state.camera ?? {}, {
          letterboxAnimate: false,
          compositionGridAnimate: false,
        });
      },
    },
  ];
}

export class SceneStateApplier {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   * @param {{ steps?: StateApplyStep[] }} [options]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this._steps = options.steps ?? createStateApplySteps();
  }

  /** @returns {readonly StateApplyStep[]} */
  getSteps() {
    return this._steps;
  }

  /**
   * @param {object} state
   */
  async apply(state) {
    const scene = this.scene;
    for (const step of this._steps) {
      await step.apply(scene, state);
    }
  }
}
