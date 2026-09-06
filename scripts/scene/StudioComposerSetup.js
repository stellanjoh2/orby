/**
 * Post-processing composer, export pipelines, and movement preview wiring.
 * Extracted from SceneManager.setupComposer — domain callbacks stay on SceneManager.
 */

import * as THREE from 'three';
import {
  isCreativeLookViewportPostActive,
  isCreativeLookWatercolourPostActive,
  isCreativeLookGouachePostActive,
  isCreativeLookOpticsPostActive,
  isCreativeLookSketchPostActive,
  isCreativeLookVectrexPostActive,
  isCreativeLookAscii4PostActive,
} from '../constants.js';
import {
  isFlatPostCreativeLookPreset,
  creativeLookPresetUsesShaderAnimation,
} from '../render/CreativeLookMaterials.js';
import { PostProcessingPipeline } from '../render/PostProcessingPipeline.js';
import { ComposerLifecycle } from './ComposerLifecycle.js';
import { ImageExporter } from '../render/ImageExporter.js';
import { VideoExporter } from '../render/VideoExporter.js';
import { ExportMovementPreview } from '../render/ExportMovementPreview.js';
import { prepareArtisticCreativeLookForCapture } from '../render/capture/captureArtisticLookPrep.js';
import { isFontExtrudeRevealModel } from './FontTextRevealController.js';
import { toggleScaleAnimActive } from './renderLoopIdle.js';

/** @param {import('../SceneManager.js').SceneManager} scene */
export function setupStudioComposer(scene) {
    scene.postPipeline = new PostProcessingPipeline(scene.renderer, scene.scene, scene.camera, {
      getDofDepthProxy: () => scene.backgroundController?.getBackgroundSphere?.() ?? null,
      getBackgroundGradientController: () => scene.backgroundGradientController,
      getBackgroundController: () => scene.backgroundController,
      getOrbitControls: () => scene.controls,
      getModelRoot: () => scene.modelRoot,
      getForceAoRecompute: () => {
        if (scene._gizmoDragActive) return true;
        // Viewport light HUD drag / Alt+RMB light height (live path skips StateStore).
        if (scene._lightMoveDragActive) return true;
        if (scene.cameraController?.altRightDragging) return true;
        // Settled-view AO plate must not freeze mesh beauty while scrubbing materials / HDRI / FX.
        if (scene.ui?.helpers?.isViewportScrubActive?.()) return true;
        // Soft idle grace after toggles / state edits — Base, cove, etc. must recompute AO.
        if (scene.renderLoop?.isIdleGraceActive?.()) return true;
        // Pause all / scrub-idle export preview: camera + mesh are frozen so the AO plate
        // would otherwise hide light intensity and other beauty edits until resume.
        const exportPreview = scene.exportMovementPreview;
        if (exportPreview?.isActive?.() && !exportPreview?.isPlaying?.()) return true;
        // Lights auto-rotate updates with updateState:false — plate would freeze lighting.
        if (scene.lightsAutoRotate) return true;
        // Shader Lab uTime animation is beauty-baked; force while live (not paused).
        const cl = scene.stateStore?.peekState?.()?.creativeLook;
        if (
          cl?.enabled === true
          && cl.pauseShaderAnimations !== true
          && creativeLookPresetUsesShaderAnimation(cl.preset)
        ) {
          return true;
        }
        // Skinned / morph clips deform without changing modelRoot.matrixWorld.
        if (scene.animationController?.isExportSessionActive?.()) return true;
        const action = scene.animationController?.currentAction;
        if (action && !action.paused && action.isRunning?.()) return true;
        if (toggleScaleAnimActive(scene._ccToggleCtx)) return true;
        if (toggleScaleAnimActive(scene._baseToggleCtx)) return true;
        if (toggleScaleAnimActive(scene._baseGlassToggleCtx)) return true;
        if (toggleScaleAnimActive(scene._backdropToggleCtx)) return true;
        if (toggleScaleAnimActive(scene._infinityCoveToggleCtx)) return true;
        return false;
      },
    });
    scene.composer = scene.postPipeline.composer;
    scene.lensDirtPass = scene.postPipeline.lensDirtPass;
    scene.fxaaPass = scene.postPipeline.fxaaPass;
    scene.exposurePass = scene.postPipeline.exposurePass;

    scene.composerLifecycle = new ComposerLifecycle({
      renderer: scene.renderer,
      scene: scene.scene,
      camera: scene.camera,
      composer: scene.composer,
      postPipeline: scene.postPipeline,
      backgroundController: scene.backgroundController,
      getCreativeLookEnabled: () =>
        scene.materialController?.getCreativeLookSettings?.()?.enabled === true,
      getTransformControls: () => [
        scene.transformControlsTranslate,
        scene.transformControlsRotate,
        scene.transformControlsScale,
      ].filter(Boolean),
      getGroundGrid: () => scene.groundController?.grid ?? null,
      getCreativeLookViewportBloomActive: () => {
        const state = scene.stateStore.getState();
        return (
          scene.materialController?.getCreativeLookSettings?.()?.enabled === true &&
          isCreativeLookViewportPostActive(state)
        );
      },
      getCreativeLookAsciiActive: () => {
        const state = scene.stateStore.getState();
        const cl = state.creativeLook ?? {};
        return cl.enabled === true && isFlatPostCreativeLookPreset(cl.preset);
      },
      getCreativeLookWatercolourActive: () => {
        const state = scene.stateStore.getState();
        return isCreativeLookWatercolourPostActive(state);
      },
      getCreativeLookGouacheActive: () => {
        const state = scene.stateStore.getState();
        return isCreativeLookGouachePostActive(state);
      },
      getCreativeLookOpticsActive: () => {
        const state = scene.stateStore.getState();
        return isCreativeLookOpticsPostActive(state);
      },
      getCreativeLookSketchActive: () => {
        const state = scene.stateStore.getState();
        return isCreativeLookSketchPostActive(state);
      },
      getCreativeLookVectrexActive: () => {
        const state = scene.stateStore.getState();
        return isCreativeLookVectrexPostActive(state);
      },
      getWireframeOverlayMeshes: () =>
        scene.materialController?.wireframeOverlayMeshes ?? [],
      getLightIndicatorOverlayGroups: () => {
        const roots = scene.lightsController?.getIndicatorOverlayGroups?.() ?? [];
        const manipulator = scene.lightViewportSelection?.getOverlayRoot?.();
        if (manipulator) roots.push(manipulator);
        return roots;
      },
      getRenderState: () => scene.stateStore.peekState(),
      syncPostProcessingForLogicalSize: (w, h) =>
        scene.syncPostProcessingForLogicalSize(w, h),
      beforeComposerRender: () => {
        scene.materialController?.syncImportGltfGlassMaterials?.();
        scene.lensFlareController?.prepareFrame(scene.renderer);
        scene.godRaysController?.prepareFrame(scene.renderer);
        if (isCreativeLookVectrexPostActive(scene.stateStore.getState())) {
          scene.postPipeline?.updateCreativeLookVectrex?.({
            time: scene.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
        prepareArtisticCreativeLookForCapture({}, scene.creativeLookSceneSync?.captureDeps());
        if (isCreativeLookOpticsPostActive(scene.stateStore.getState())) {
          scene.creativeLookSceneSync?.prepareOpticsFrameUniforms();
        }
        if (isCreativeLookAscii4PostActive(scene.stateStore.getState())) {
          scene.postPipeline?.updateCreativeLookAscii?.({
            time: scene.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
      },
      onRestoreBloomAfterCreativeLook: () => {
        scene.updateBloom(scene.stateStore.getState().bloom);
        scene.applyRenderQualityVisualOverrides();
      },
    });

    // Initialize image exporter (needs composer)
    scene.imageExporter = new ImageExporter({
      renderer: scene.renderer,
      scene: scene.scene,
      camera: scene.camera,
      composer: scene.composer,
      postPipeline: scene.postPipeline,
      isLensDistortionActive: () =>
        scene.postPipeline?.lensDistortionPass?.enabled === true,
      backgroundController: scene.backgroundController,
      environmentController: scene.environmentController,
      syncPostProcessingForLogicalSize: (w, h) =>
        scene.syncPostProcessingForLogicalSize(w, h),
      syncPerspectiveProjection: (opts) => scene.syncPerspectiveCameraFovAndLens(opts),
      renderComposerPassForExport: (opts) =>
        scene.composerLifecycle.renderComposerPassForExport(opts),
      composerLifecycle: scene.composerLifecycle,
      notifyExportSizeClamped: ({
        requestedWidth,
        requestedHeight,
        actualWidth,
        actualHeight,
      }) => {
        scene.ui?.showToast?.(
          `Export capped at ${actualWidth}×${actualHeight} (requested ${requestedWidth}×${requestedHeight})`,
          4200,
          { caution: true },
        );
      },
      getRenderState: () => scene.stateStore.peekState(),
      creativeLookCaptureDeps: scene.creativeLookSceneSync?.captureDeps(),
    });
    scene.imageExporter.getHdriRotationDegrees = () =>
      scene.hdriRotation ?? scene.stateStore.getState().hdriRotation ?? 0;
    scene.imageExporter.reapplyStudioAfterCapture = () => {
      const rot = scene.hdriRotation ?? scene.stateStore.getState().hdriRotation ?? 0;
      scene.setHdriRotation(rot, { updateState: false, updateUi: false });
      // Transparent capture zeros RenderPass.clearAlpha; if restore snapped the wrong value,
      // opaque studio clears stay alpha=0 and the alpha:true canvas shows CSS gray instead.
      if (scene.postPipeline?.renderPass?.clearAlpha === 0) {
        scene.postPipeline.renderPass.clearAlpha = 1;
      }
      scene.flushStudioViewportBackdrop?.();
      const size = new THREE.Vector2();
      scene.renderer?.getSize(size);
      if (size.x > 0 && size.y > 0) {
        scene.materialController?.syncWireframeLineResolution?.(
          size.x,
          size.y,
          scene.renderer?.getPixelRatio?.() ?? 1,
        );
      }
    };
    scene.imageExporter.pinStudioBackgroundForCapture = () => {
      const hex = scene.stateStore?.getState()?.background;
      if (hex) {
        scene.syncStudioBackgroundColor(hex);
      } else {
        scene.flushStudioViewportBackdrop?.();
      }
      if (scene.postPipeline?.renderPass?.clearAlpha === 0) {
        scene.postPipeline.renderPass.clearAlpha = 1;
      }
    };
    scene.imageExporter.setSuppressResizeForExport = (active) => {
      scene._suppressResizeForExport = active === true;
    };

    const szComposer = new THREE.Vector2();
    scene.renderer.getSize(szComposer);
    if (szComposer.x > 0 && szComposer.y > 0) {
      scene.syncPostProcessingForLogicalSize(szComposer.x, szComposer.y);
    }

    scene.videoExporter = new VideoExporter({
      renderer: scene.renderer,
      scene: scene.scene,
      camera: scene.camera,
      composer: scene.composer,
      imageExporter: scene.imageExporter,
      backgroundController: scene.backgroundController,
      environmentController: scene.environmentController,
      stateStore: scene.stateStore,
      ui: scene.ui,
      syncPostProcessingForLogicalSize: (w, h) =>
        scene.syncPostProcessingForLogicalSize(w, h),
      syncPerspectiveProjection: (opts) => scene.syncPerspectiveCameraFovAndLens(opts),
      ensureComposerBuffersMatchRenderer: () =>
        scene.composerLifecycle.ensureComposerBuffersMatchRenderer(),
      resetRendererViewportToCanvas: () =>
        scene.composerLifecycle.resetRendererViewportToCanvas(),
      prepareComposerCapture: () => scene.composerLifecycle.prepareComposerCapture(),
      beforeComposerRender: () => {
        scene.materialController?.syncImportGltfGlassMaterials?.();
        scene.lensFlareController?.prepareFrame(scene.renderer);
        scene.godRaysController?.prepareFrame(scene.renderer);
        if (isCreativeLookVectrexPostActive(scene.stateStore.getState())) {
          scene.postPipeline?.updateCreativeLookVectrex?.({
            time: scene.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
        prepareArtisticCreativeLookForCapture({}, scene.creativeLookSceneSync?.captureDeps());
        if (isCreativeLookOpticsPostActive(scene.stateStore.getState())) {
          scene.creativeLookSceneSync?.prepareOpticsFrameUniforms();
        }
        if (isCreativeLookAscii4PostActive(scene.stateStore.getState())) {
          scene.postPipeline?.updateCreativeLookAscii?.({
            time: scene.materialController?.getCreativeLookAnimationTime?.() ?? 0,
          });
        }
      },
      renderComposerPassForExport: (opts) =>
        scene.composerLifecycle.renderComposerPassForExport(opts),
      setRotationY: (value) => scene.setRotationY(value),
      setLightsRotation: (value, opts) => scene.setLightsRotation(value, opts),
      setHdriRotation: (value, opts) => scene.setHdriRotation(value, opts),
      getHdriRotation: () => scene.hdriRotation ?? 0,
      beginExportCameraDrive: () => scene.cameraController?.beginExportCameraDrive?.(),
      applyExportCameraDriveFrame: (t, options) =>
        scene.cameraController?.applyExportCameraDriveFrame?.(t, options),
      endExportCameraDrive: (options) => {
        scene.cameraController?.endExportCameraDrive?.(options);
        if (scene.cameraAutoOrbit !== 'off') {
          scene.setCameraAutoOrbit(scene.cameraAutoOrbit);
        }
      },
      beginExportFovDrive: () => scene.cameraController?.beginExportFovDrive?.(),
      applyExportFovDriveFrame: (t, fovOffset) =>
        scene.cameraController?.applyExportFovDriveFrame?.(t, fovOffset),
      endExportFovDrive: (options) => scene.cameraController?.endExportFovDrive?.(options),
      beginExportAnimationDrive: (opts) => scene.animationController?.beginExportDrive?.(opts),
      applyExportAnimationDriveFrame: (frameIndex, fps) =>
        scene.animationController?.applyExportDriveFrame?.(frameIndex, fps),
      endExportAnimationDrive: () => scene.animationController?.endExportDrive?.(),
      applyCreativeLookExportFrame: (frameIndex, fps) => {
        const elapsed = frameIndex / Math.max(1, fps);
        scene.materialController?.updateCreativeLookTime?.(elapsed);
      },
      applyGrainExportFrame: (frameIndex, fps) => {
        const elapsed = frameIndex / Math.max(1, fps);
        scene.postPipeline?.setGrainTimeForExport?.(elapsed);
      },
      beginFontTextRevealExportDrive: () =>
        scene.fontTextRevealController?.beginExportDrive?.(scene.currentModel),
      applyFontTextRevealExportFrame: (frameIndex, fps) =>
        scene.fontTextRevealController?.applyExportFrame?.(frameIndex, fps, scene.currentModel),
      endFontTextRevealExportDrive: () =>
        scene.fontTextRevealController?.endExportDrive?.(),
      isFontRevealFullyHiddenAtExportTime: (exportTimeSec) =>
        scene.fontTextRevealController?.isFullyHiddenAtExportTime?.(
          exportTimeSec,
          scene.currentModel,
        ) ?? false,
      findFirstVisibleRevealExportFrameIndex: (startFrameIndex, totalFrames, fps) =>
        scene.fontTextRevealController?.findFirstVisibleExportFrameIndex?.(
          startFrameIndex,
          totalFrames,
          fps,
          scene.currentModel,
        ) ?? startFrameIndex,
      setDustFieldCaptureScale: (scale) =>
        scene.materialController?.setDustFieldCaptureScale?.(scale),
      getCurrentModel: () => scene.currentModel,
      getCurrentFile: () => scene.currentFile,
      getCurrentAssetMetadata: () => scene.currentAssetMetadata,
      getHdriBackgroundEnabled: () => scene.hdriBackgroundEnabled,
      getAnimationClipCount: () => scene.animationController?.animations?.length ?? 0,
      getAnimationClipDuration: (index) => {
        const clip = scene.animationController?.animations?.[index];
        return clip?.duration ?? 0;
      },
      getAnimationClipLabel: (index) => {
        const clip = scene.animationController?.animations?.[index];
        return clip?.name || (clip ? `Clip ${index + 1}` : null);
      },
      getFontTextRevealExportLabel: () => {
        const model = scene.currentModel;
        const controller = scene.fontTextRevealController;
        const constant = scene.fontTextConstantController;
        if (!isFontExtrudeRevealModel(model)) return null;
        const revealActive = controller?.isEnabled?.() ?? false;
        const trackingActive = controller?.isTrackingAnimatorActive?.() ?? false;
        const constantActive = constant?.isEnabled?.() ?? false;
        if (!revealActive && !constantActive && !trackingActive) return null;
        const parts = [];
        if (revealActive) {
          const type = controller.getRevealType?.();
          const unit = controller.getRevealUnit?.();
          const duration = controller.getDurationSec?.();
          parts.push('Reveal');
          if (type) parts.push(type);
          if (unit) parts.push(unit);
          if (Number.isFinite(duration) && duration > 0) parts.push(`${duration}s`);
        }
        if (trackingActive) {
          parts.push('Tracking');
          const trackingTime = controller.getTrackingAnimatorTimeSec?.();
          if (Number.isFinite(trackingTime) && trackingTime > 0) parts.push(`${trackingTime}s`);
        }
        if (constantActive) {
          const constantType = constant.getType?.();
          if (constantType) parts.push(`Looping ${constantType}`);
        }
        return parts.join(' · ');
      },
      handleResize: () => scene.handleResize(),
      creativeLookCaptureDeps: scene.creativeLookSceneSync?.captureDeps(),
    });

    scene.exportMovementPreview = new ExportMovementPreview({
      stateStore: scene.stateStore,
      ui: scene.ui,
      setRotationY: (value) => scene.setRotationY(value),
      setLightsRotation: (value, opts) => scene.setLightsRotation(value, opts),
      setHdriRotation: (value, opts) => scene.setHdriRotation(value, opts),
      getHdriRotation: () => scene.hdriRotation ?? 0,
      getCurrentModel: () => scene.currentModel,
      getAnimationClipCount: () => scene.animationController?.animations?.length ?? 0,
      getAnimationClipDuration: (index) => {
        const clip = scene.animationController?.animations?.[index];
        return clip?.duration ?? 0;
      },
      beginExportCameraDrive: () => scene.cameraController?.beginExportCameraDrive?.(),
      applyExportCameraDriveFrame: (t, options) =>
        scene.cameraController?.applyExportCameraDriveFrame?.(t, options),
      endExportCameraDrive: (options) => {
        scene.cameraController?.endExportCameraDrive?.(options);
        if (scene.cameraAutoOrbit !== 'off') {
          scene.setCameraAutoOrbit(scene.cameraAutoOrbit);
        }
      },
      beginPreviewViewportLock: () => scene.cameraController?.beginPreviewViewportLock?.(),
      endPreviewViewportLock: () => scene.cameraController?.endPreviewViewportLock?.(),
      beginExportFovDrive: () => scene.cameraController?.beginExportFovDrive?.(),
      applyExportFovDriveFrame: (t, fovOffset) =>
        scene.cameraController?.applyExportFovDriveFrame?.(t, fovOffset),
      endExportFovDrive: (options) => scene.cameraController?.endExportFovDrive?.(options),
      beginExportAnimationDrive: (opts) => scene.animationController?.beginExportDrive?.(opts),
      applyExportAnimationDriveTime: (exportTimeSec) =>
        scene.animationController?.applyExportDriveTime?.(exportTimeSec),
      endExportAnimationDrive: () => scene.animationController?.endExportDrive?.(),
      beginFontTextRevealExportDrive: () =>
        scene.fontTextRevealController?.beginExportDrive?.(scene.currentModel),
      applyFontTextRevealExportTime: (exportTimeSec) =>
        scene.fontTextRevealController?.applyExportTime?.(exportTimeSec, scene.currentModel),
      endFontTextRevealExportDrive: () =>
        scene.fontTextRevealController?.endExportDrive?.(),
      isExportCameraDriving: () => scene.cameraController?.isExportCameraDriving?.() ?? false,
      isExportFovDriving: () => scene.cameraController?.isExportFovDriving?.() ?? false,
      isExportViewportLocked: () => scene.cameraController?.isPreviewViewportLocked?.() ?? false,
      onActiveChange: (active) => {
        scene.ui?.setExportVideoPreviewActive?.(active);
        scene.ui?.setExportPreviewBannerVisible?.(active);
        if (!active) {
          scene.ui?.setExportPreviewPlaying?.(false);
          scene.ui?.updateExportPreviewTimeline?.(0, scene._exportPreviewDurationSec(), {
            fromPlayback: true,
          });
        }
        scene.ui?.syncExportPreviewPauseAll?.();
      },
      onProgressChange: ({ currentSec, durationSec, playing }) => {
        scene.ui?.setExportPreviewPlaying?.(playing);
        scene.ui?.updateExportPreviewTimeline?.(currentSec, durationSec, {
          fromPlayback: true,
        });
      },
    });
}
