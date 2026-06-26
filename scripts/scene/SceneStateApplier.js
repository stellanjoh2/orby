import { normalizeStoredGoboScale, GOBO_UI_DEFAULT } from '../render/GoboProjection.js';
import { DEFAULT_GOBO_SOFTNESS } from '../config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from '../config/shadowQuality.js';
import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  effectiveVignetteIntensity,
  cameraShadowsUiToShader,
} from '../constants.js';
import { getBackgroundMode } from '../render/backgroundMode.js';
import { normalizeBackgroundGradient } from '../render/backgroundGradient/backgroundGradientDefaults.js';

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
        s.setAutoRotateSpeed(state.autoRotate, { silent: true });
        s.setAutoRotateDirection(state.autoRotateDirection);
      },
    },
    {
      id: 'camera-orbit-handheld',
      apply: (s, state) => {
        s.setCameraAutoOrbit(state.camera?.autoOrbit ?? 'off', { silent: true });
        s.setCameraHandheld(state.camera?.handheld ?? 'off', { silent: true });
      },
    },
    {
      id: 'ground',
      apply: (s, state) => {
        s.setGroundSolid(state.groundSolid);
        s.groundController?.setWireEnabled(state.groundWire);
        s.groundController?.setSolidColor(state.groundSolidColor);
        s.groundController?.setWireColor(state.groundWireColor);
        s.groundController?.setWireOpacity(state.groundWireOpacity);
        s.setGroundY(state.groundY ?? 0);
        s.groundController?.setGridY(state.gridY ?? 0);
      },
    },
    {
      id: 'base',
      apply: (s, state) => {
        s.setBaseScale(state.baseScale ?? 1, { updateState: false });
        s.groundController?.setBaseMetalness(
          state.baseMetalness ?? DEFAULT_MATERIAL_METALNESS,
        );
        s.groundController?.setBaseRoughness(
          state.baseRoughness ?? DEFAULT_MATERIAL_ROUGHNESS,
        );
        s.groundController?.setBaseReflection(state.baseReflection ?? 1);
        s.groundController?.setBaseClearcoat(state.baseClearcoat ?? 0);
        s.setBaseSurface(
          {
            preset: state.baseSurfacePreset,
            scale: state.baseSurfaceScale,
            strength: state.baseSurfaceStrength,
          },
          { updateState: false },
        );
        s.setBaseGlassSurface(
          !!(state.baseGlassSurface ?? state.podiumReflectMesh ?? false),
          { updateState: false },
        );
        s.groundController?.setBaseGlassBlur(state.baseGlassBlur ?? DEFAULT_BASE_GLASS_BLUR);
        s.groundController?.setBaseGlassAmount(state.baseGlassAmount ?? DEFAULT_BASE_GLASS_AMOUNT);
        s.groundController?.setBaseGlassBrightness(
          state.baseGlassBrightness ?? DEFAULT_BASE_GLASS_BRIGHTNESS,
        );
      },
    },
    {
      id: 'backdrop',
      apply: (s, state) => {
        s.setBackdropEnabled(!!state.backdropEnabled, { updateState: false });
        s.setBackdropScale(state.backdropScale ?? 1, { updateState: false });
        s.setBackdropWidth(state.backdropWidth ?? 2, { updateState: false });
        s.groundController?.setBackdropColor(state.backdropColor ?? '#808080');
        s.setBackdropRotation(state.backdropRotation ?? 0, { updateState: false });
        s.setBackdropY(state.backdropY ?? 0, { updateState: false });
        s.groundController?.setBackdropMetalness(
          state.backdropMetalness ?? DEFAULT_BACKDROP_METALNESS,
        );
        s.groundController?.setBackdropRoughness(
          state.backdropRoughness ?? DEFAULT_BACKDROP_ROUGHNESS,
        );
        s.setBackdropSurface(
          {
            preset: state.backdropSurfacePreset,
            scale: state.backdropSurfaceScale,
            strength: state.backdropSurfaceStrength,
          },
          { updateState: false },
        );
      },
    },
    {
      id: 'wireframe-grid',
      apply: (s, state) => {
        s.setSceneGeometryWireframe(false);
        s.groundController?.setGridScale(state.gridScale ?? 1);
        s.groundController?.setGridLineWidth(state.gridLineWidth ?? 1);
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
        s.syncCameraClipPlanes();
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
        s.setLightsRotation(state.lightsRotation ?? 0);
        s.setLightsHeight(state.lightsHeight ?? 5);
        s.setShowLightIndicators(state.showLightIndicators ?? false);
        s.setLightsAutoRotate(state.lightsAutoRotate ?? false);
        s.setLightsCastShadows(state.lightsCastShadows ?? false);
        s.setLightsShadowQuality(state.lightsShadowQuality ?? 'medium');
        s.setLightsShadowSoftness(state.lightsShadowSoftness ?? DEFAULT_LIGHTS_SHADOW_SOFTNESS);
        s.setLightsShadowColor(state.lightsShadowColor ?? '#080808');
        s.setLightsShadowOpacity(state.lightsShadowOpacity ?? 0.25);
        s.setLightsShadowContactOffset(state.lightsShadowContactOffset ?? -0.0005);
        s.setLightsShadowNormalBias(state.lightsShadowNormalBias ?? 0.01);
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
            if (config.color !== undefined) {
              s.lightsController?.updateLightProperty(lightId, 'color', config.color);
            }
          });
        }
        // After per-light sliders/colors — `setLightsEnabled` owns enabled + shadow sync.
        s.setLightsEnabled(state.lightsEnabled ?? false);
      },
    },
    {
      id: 'gobo',
      apply: async (s, state) => {
        const gobo = state.gobo ?? {};
        await s.setGoboTexture(gobo.texture ?? 'palm', { updateState: false });
        s.setGoboSoftness(gobo.softness ?? DEFAULT_GOBO_SOFTNESS, { updateState: false });
        s.setGoboScale(
          normalizeStoredGoboScale(gobo.scale, gobo.scaleSpace) ?? GOBO_UI_DEFAULT,
          { updateState: false },
        );
        s.setGoboRotation(gobo.rotation ?? 0, { updateState: false });
        await s.setGoboEnabled(!!gobo.enabled, { updateState: false });
      },
    },
    {
      id: 'material',
      apply: async (s, state) => {
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
          await s.applyCreativeLookFromState(state.creativeLook, {
            skipStateStore: true,
          });
          if (
            state.creativeLook.enabled &&
            state.svgExtrude?.surfacePreset &&
            state.svgExtrude.surfacePreset !== 'none'
          ) {
            s.materialController?.reapplyCreativeLookSurfaceShaders?.();
          }
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
        if (state.svgExtrude?.hardEdgeAngle !== undefined) {
          s.setSvgExtrudeHardEdgeAngle(state.svgExtrude.hardEdgeAngle);
        }
        if (state.svgExtrude?.bevelAmount !== undefined) {
          s.setSvgExtrudeBevel(
            { amount: state.svgExtrude.bevelAmount },
            { updateState: false },
          );
        }
        if (state.svgExtrude?.colorDepths !== undefined) {
          s.setSvgExtrudeColorDepths(state.svgExtrude.colorDepths, { updateState: false });
        }
        if (state.svgExtrude?.colorOffsets !== undefined) {
          s.setSvgExtrudeColorOffsets(state.svgExtrude.colorOffsets, { updateState: false });
        }
        if (state.svgExtrude?.colorReplacements !== undefined) {
          s.setSvgExtrudeColorReplacements(state.svgExtrude.colorReplacements, { updateState: false });
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
              strength: state.svgExtrude.surfaceStrength,
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
        s.postPipeline?.updateGrain(state.grain);
        s.postPipeline?.updateAberration(state.aberration);
      },
    },
    {
      id: 'background-tone-hdri-strength',
      apply: (s, state) => {
        s.backgroundController?.setColor(state.background);
        s.backgroundController?.setSolidEnabled(getBackgroundMode(state) === 'solid');
        s.backgroundGradientController?.setConfig(
          normalizeBackgroundGradient(state.backgroundGradient ?? {}),
        );
        s.backgroundImageController?.setConfig(state.backgroundImage ?? {});
        s.postPipeline?.setToneMapping(state.toneMapping ?? 'aces-filmic');
        s.setHdriStrength(state.hdriStrength ?? 2);
      },
    },
    {
      id: 'camera-color-grade',
      apply: (s, state) => {
        s.postPipeline?.setContrast(state.camera?.contrast ?? 1.0);
        s.postPipeline?.setSaturation(state.camera?.saturation ?? 1.0);
        s.postPipeline?.setClarity(state.camera?.clarity ?? 0);
        s.postPipeline?.setFade(state.camera?.fade ?? 0);
        s.postPipeline?.setSharpness(state.camera?.sharpness ?? 0);
        s.postPipeline?.setToneCurve(state.toneCurve);
        s.postPipeline?.setTemperature(state.camera?.temperature ?? CAMERA_TEMPERATURE_NEUTRAL_K);
        s.postPipeline?.setTint((state.camera?.tint ?? 0) / 100);
        s.postPipeline?.setHighlights((state.camera?.highlights ?? 0) / 100);
        s.postPipeline?.setShadows(cameraShadowsUiToShader(state.camera?.shadows ?? 0));
        const defaultCam = s.stateStore.getDefaults().camera ?? {};
        s.postPipeline?.setVignette(effectiveVignetteIntensity(state.camera, defaultCam));
        s.postPipeline?.setVignetteColor(state.camera?.vignetteColor ?? '#080808');
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
        s.setHdriReceiveShadowsAo(!!state.hdriReceiveShadowsAo);
        s.lensFlareController?.applyStateSnapshot(state);
        s.godRaysController?.applyStateSnapshot(state);
        await s.setHdriPreset(state.hdri);
        s.syncCreativeLookTransmissionBackdrop?.();
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
      id: 'animation',
      apply: (s, state) => {
        const animation = state.animation;
        if (!animation) return;
        s.setAnimationShowBones(!!animation.showBones);
        s.setAnimationShowJointNames(!!animation.showJointNames);
        s.setAnimationJointScale(animation.jointScale ?? 0.5);
        s.setAnimationBoneStrokeWidth(animation.boneStrokeWidth ?? 2);
        s.setAnimationHideMesh(!!animation.hideMesh);
        s._syncAnimationControllerFromState?.();
      },
    },
    {
      id: 'transform-widgets',
      apply: (s, state) => {
        s.eventBus?.emit('mesh:move-widget-enabled', !!state.moveWidgetEnabled);
        s.eventBus?.emit('mesh:rotate-widget-enabled', !!state.rotateWidgetEnabled);
        s.eventBus?.emit('mesh:scale-widget-enabled', !!state.scaleWidgetEnabled);
      },
    },
    {
      id: 'camera-orbit-pose',
      apply: (s, state) => {
        const position = state.camera?.position;
        const target = state.camera?.target;
        if (!position && !target) return;
        s.eventBus?.emit('camera:set-state', { position, target });
      },
    },
    {
      id: 'fisheye',
      apply: (s, state) => {
        if (!state.fisheye) return;
        s.syncPerspectiveCameraFovAndLens?.();
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
