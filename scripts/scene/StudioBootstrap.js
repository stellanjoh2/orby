/**
 * Deferred WebGL studio boot, lightweight pre-GPU shell, and full GPU teardown.
 * Extracted from SceneManager — orchestrates controllers but keeps domain logic on SceneManager.
 */

import * as THREE from 'three';
import { TransformControls } from '../vendor/TransformControls.js';
import { HDRI_STRENGTH_UNIT } from '../config/hdri.js';
import { APP_BACKGROUND, DEFAULT_CAMERA_NEAR, DEFAULT_CAMERA_FAR } from '../constants.js';
import { DEFAULT_GOBO_TEXTURE_ID, DEFAULT_GOBO_SOFTNESS } from '../config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS, normalizeShadowQuality } from '../config/shadowQuality.js';
import { lightsAutoRotateDegreesPerSecond } from '../config/lightsAutoRotate.js';
import { GoboProjectionController, normalizeStoredGoboScale } from '../render/GoboProjection.js';
import { CameraController } from '../render/CameraController.js';
import { ModelLoader } from '../render/ModelLoader.js';
import { MeshDiagnosticsController } from '../render/MeshDiagnosticsController.js';
import { TopologyWarningsOverlay } from '../render/TopologyWarningsOverlay.js';
import { JointNameLabelsController } from '../render/JointNameLabelsController.js';
import { LightIndicatorHudController } from '../render/LightIndicatorHudController.js';
import { LightViewportHudActions } from './LightViewportHudActions.js';
import { LightViewportSelectionController } from './LightViewportSelectionController.js';
import { MaterialController } from '../render/MaterialController.js';
import { applyStaticAnimationFrameZero } from '../render/bakeStaticSkinnedGeometry.js';
import {
  creativeLookPresetNeedsHdriBackdrop,
  normalizeCreativeLookPreset,
} from '../render/CreativeLookMaterials.js';
import { AutoExposureController } from '../render/AutoExposureController.js';
import { TransformController, clampMeshScaleComponents } from '../render/TransformController.js';
import { LensDirtController } from '../render/LensDirtController.js';
import { BackgroundController } from '../render/BackgroundController.js';
import { BackgroundGradientController } from '../render/backgroundGradient/BackgroundGradientController.js';
import { BackgroundImageController } from '../render/backgroundImage/BackgroundImageController.js';
import { getBackgroundMode } from '../render/backgroundMode.js';
import { LensFlareController } from '../render/LensFlareController.js';
import { GodRaysController } from '../render/GodRaysController.js';
import { DofAutofocusController } from '../render/DofAutofocusController.js';
import { DofFocusPlaneHelper } from '../render/DofFocusPlaneHelper.js';
import { ModelGlbExporter } from '../export/ModelGlbExporter.js';
import { FontTextRevealController } from './FontTextRevealController.js';
import { FontTextConstantController } from './FontTextConstantController.js';
import { SceneStateApplier } from './SceneStateApplier.js';
import { ModelLifecycleManager } from './ModelLifecycleManager.js';
import { ViewportFramingOverlays } from './ViewportFramingOverlays.js';
import { createColorCheckerMeshGroup } from './ColorCheckerMesh.js';
import { createToggleScaleContext } from './toggleScaleAnimation.js';
import { setupStudioComposer } from './StudioComposerSetup.js';
import { CreativeLookSceneSync } from './CreativeLookSceneSync.js';
import { StudioGroundFacade } from './StudioGroundFacade.js';

/** Lightweight shell — no WebGL until the first model load. */
export function initStudioShell(scene, initialState) {
    scene.currentShading = initialState.shading;
    scene.autoRotateSpeed = 0;
    scene.autoRotateDirection = initialState.autoRotateDirection === 'reverse' ? 'reverse' : 'forward';
    scene.cameraAutoOrbit = initialState.camera?.autoOrbit ?? 'off';
    scene.cameraHandheld = initialState.camera?.handheld ?? 'off';
    /** Suppress mode-change toasts during settings restore / batch apply. */
    scene._suppressModeChangeToasts = 0;
    scene.lightsMaster = initialState.lightsMaster ?? 0.30;
    scene.lightsEnabled = initialState.lightsEnabled ?? true;
    scene.lightsRotation = initialState.lightsRotation ?? 0;
    scene.lightsAutoRotate = initialState.lightsAutoRotate ?? false;
    scene.lightsAutoRotateSpeed = lightsAutoRotateDegreesPerSecond();
    scene.currentFile = null;
    scene.currentModel = null;
    /** Folder bundle from last `loadFileBundle` — used by Map Slots “Scan folder again”. */
    scene._fbxImportBundle = null;
    scene.currentAssetMetadata = null;
    scene.svgExtrudeImporter = null;
    scene.isSvgExtrudeModel = false;
    scene.isImportSmoothingModel = false;
    scene.importRawByMesh = new Map();
    scene._pivotCenterDelta = null;
    scene.reverseNormalsEnabled = initialState.advanced?.reverseNormals ?? false;
    scene.originalGeometryIndices = new WeakMap();
    scene.originalGeometryAttributes = new WeakMap();
    scene.originalMaterialSides = new WeakMap();
    scene.isFirstModelLoad = true;
    /** When true, next `setModel` skips first-load podium/grid bottom snap (.orby restore). */
    scene._skipGroundGridAutoAlignOnNextModelLoad = false;
    /** When true, next `setModel` skips the intro camera flight (.orby restore). */
    scene._skipCameraFlightOnNextModelLoad = false;
    /** When true, focus camera after font typography placement settles. */
    scene._pendingFontCameraFocusAfterTypography = false;
    scene._pendingFontGroundAlignAfterTypography = false;
    scene.unlitMode = false;
    scene.hdriEnabled = initialState.hdriEnabled ?? true;
    scene.hdriBackgroundEnabled = initialState.hdriBackground;
    scene.hdriBlurriness = initialState.hdriBlurriness ?? 0;
    scene.hdriRotation = initialState.hdriRotation ?? 0;
    scene.currentHdri = initialState.hdri ?? 'beach';
    scene.hdriStrength = Math.min(
      5 * HDRI_STRENGTH_UNIT,
      Math.max(0, initialState.hdriStrength ?? 2),
    );
    scene.lightsShadowQuality = normalizeShadowQuality(
      initialState.lightsShadowQuality,
    );
    scene.lightsShadowSoftness = Number.isFinite(initialState.lightsShadowSoftness)
      ? initialState.lightsShadowSoftness
      : DEFAULT_LIGHTS_SHADOW_SOFTNESS;
    scene.lightsShadowContactOffset = Number.isFinite(
      initialState.lightsShadowContactOffset,
    )
      ? initialState.lightsShadowContactOffset
      : -0.0005;
    scene.lightsShadowNormalBias = Number.isFinite(initialState.lightsShadowNormalBias)
      ? initialState.lightsShadowNormalBias
      : 0.01;
    scene.lightsShadowTwoSided = !!initialState.lightsShadowTwoSided;
    scene.lightsCastShadows = !!initialState.lightsCastShadows;
    scene.lightsShadowColor = initialState.lightsShadowColor ?? '#080808';
    scene.lightsShadowOpacity = Number.isFinite(initialState.lightsShadowOpacity)
      ? Math.min(1, Math.max(0, initialState.lightsShadowOpacity))
      : 0.25;
    scene.goboEnabled = !!initialState.gobo?.enabled;
    scene.goboTextureId = initialState.gobo?.texture ?? DEFAULT_GOBO_TEXTURE_ID;
    scene.goboSoftness = Number.isFinite(initialState.gobo?.softness)
      ? Math.min(4, Math.max(0, initialState.gobo.softness))
      : DEFAULT_GOBO_SOFTNESS;
    scene.goboScale = normalizeStoredGoboScale(
      initialState.gobo?.scale,
      initialState.gobo?.scaleSpace,
    );
    scene.goboRotation = Number.isFinite(initialState.gobo?.rotation)
      ? ((initialState.gobo.rotation % 360) + 360) % 360
      : 0;
    scene.goboSoftnessQuality = normalizeShadowQuality(
      initialState.gobo?.softnessQuality ?? 'medium',
    );

    scene.modelLoader = new ModelLoader();
    scene.modelLifecycle = new ModelLifecycleManager(scene);
    scene.modelGlbExporter = new ModelGlbExporter();
    scene.animationController = scene._createAnimationController();
    scene._syncAnimationControllerFromState();
    scene.fontTextRevealController = new FontTextRevealController({
      stateStore: scene.stateStore,
      onNeedRender: () => scene.requestRender(),
      onTypographyLayoutChange: () => {
        scene.finalizeFontModelStudioPlacement();
      },
      reapplyMaterialEmissive: () => {
        const emissive = scene.stateStore.getState().material?.emissive ?? 0;
        scene.materialController.materialSettings.emissive = emissive;
        scene.materialController.updateMaterials();
      },
    });
    scene.fontTextConstantController = new FontTextConstantController({
      stateStore: scene.stateStore,
      revealController: scene.fontTextRevealController,
      onNeedRender: () => scene.requestRender(),
    });
    scene.fontTextRevealController.setConstantController(scene.fontTextConstantController);

    scene._ccToggleCtx = createToggleScaleContext();
    scene._baseToggleCtx = createToggleScaleContext();
    scene._baseGlassToggleCtx = createToggleScaleContext();
    scene._backdropToggleCtx = createToggleScaleContext();
    scene._infinityCoveToggleCtx = createToggleScaleContext();
    const bootGround = scene.stateStore.getState();
    scene._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    scene._baseToggleCtx.prevEnabled = !!bootGround.groundSolid;
    scene._baseGlassToggleCtx.prevEnabled = !!(
      bootGround.baseGlassSurface ?? bootGround.podiumReflectMesh ?? false
    );
    scene._backdropToggleCtx.prevEnabled = !!bootGround.backdropEnabled;
    scene._infinityCoveToggleCtx.prevEnabled = !!bootGround.infinityCoveEnabled;

    scene.viewportFramingOverlays = new ViewportFramingOverlays();
    const cam0 = scene.stateStore.getState().camera ?? {};
    scene.viewportFramingOverlays.syncFromCamera(cam0, {
      letterboxAnimate: false,
      compositionGridAnimate: false,
    });
}

/** Fresh #webgl canvas after GPU teardown or before WebGL init. */
export function refreshWebglCanvas(scene) {
    const parent =
      scene.canvas?.parentElement ?? document.querySelector('.viewport');
    if (!parent) return;
    const next = document.createElement('canvas');
    next.id = 'webgl';
    next.tabIndex = 0;
    if (scene.canvas?.isConnected) {
      scene.canvas.replaceWith(next);
    } else {
      parent.appendChild(next);
    }
    scene.canvas = next;
}

/** Tear down GPU resources and reset studio-ready flag. */
export function teardownStudioGpu(scene) {
    scene.renderLoop?.stop();
    scene._viewportResizeObserver?.disconnect();
    scene._viewportResizeObserver = null;
    scene._studioResizeTeardown?.();
    scene._studioResizeTeardown = null;

    scene.modelLifecycle?.clearModel();
    scene.currentFile = null;
    scene.isFirstModelLoad = true;
    /** When true, next `setModel` skips first-load podium/grid bottom snap (.orby restore). */
    scene._skipGroundGridAutoAlignOnNextModelLoad = false;
    scene._skipCameraFlightOnNextModelLoad = false;
    scene._pendingFontCameraFocusAfterTypography = false;
    scene._pendingFontGroundAlignAfterTypography = false;
    scene.ui?.updateTitle?.('Orby');
    scene.ui?.updateTopBarDetail?.('');
    scene.animationController = scene._createAnimationController();
    scene._syncAnimationControllerFromState();

    scene.meshClickHandler?.detach?.();
    scene.boneHoverHandler?.detach?.();

    scene.transformControlsTranslate?.dispose?.();
    scene.transformControlsRotate?.dispose?.();
    scene.transformControlsScale?.dispose?.();
    scene.transformControlsTranslate = null;
    scene.transformControlsRotate = null;
    scene.transformControlsScale = null;

    scene.histogramController?.dispose?.();
    scene.histogramController = null;
    scene.lensFlareController?.dispose?.();
    scene.lensFlareController = null;
    scene.godRaysController?.dispose?.();
    scene.godRaysController = null;
    scene.lensDirtController?.dispose?.();
    scene.lensDirtController = null;
    scene.autoExposureController?.dispose?.();
    scene.autoExposureController = null;
    scene.environmentController?.dispose?.();
    scene.environmentController = null;
    scene.groundController?.disposeMeshes?.();
    scene.goboProjection?.dispose?.();
    scene.goboProjection = null;
    scene.backgroundController?.dispose?.();
    scene.backgroundController = null;
    scene.backgroundGradientController?.dispose?.();
    scene.backgroundGradientController = null;
    scene.backgroundImageController?.dispose?.();
    scene.backgroundImageController = null;
    scene.materialController?.clear?.();

    if (scene.composer?.renderTarget1) {
      scene.composer.renderTarget1.dispose?.();
      scene.composer.renderTarget2?.dispose?.();
    }
    scene.composer = null;
    scene.postPipeline = null;
    scene.composerLifecycle = null;
    scene.imageExporter = null;
    scene.videoExporter = null;
    scene.exposurePass = null;
    scene.lensDirtPass = null;
    scene.fxaaPass = null;

    scene.cameraController?.dispose?.();
    scene.cameraController = null;
    scene.controls = null;

    if (scene.renderer) {
      scene.renderer.dispose();
    }
    scene.renderer = null;
    scene.scene = null;
    scene.camera = null;
    scene.modelRoot = null;
    scene.colorCheckerRoot = null;
    scene.clock = null;
    scene.diagnosticsController = null;
    scene.jointNameLabelsController?.dispose?.();
    scene.jointNameLabelsController = null;
    scene.lightIndicatorHud?.dispose?.();
    scene.lightIndicatorHud = null;
    scene.lightViewportSelection?.dispose?.();
    scene.lightViewportSelection = null;
    scene.lightViewportHudActions = null;
    scene.materialController = null;
    scene.creativeLookSceneSync = null;
    scene.studioGroundFacade = null;
    scene.lightsController = null;
    scene.lights = null;
    scene.groundController = null;
    scene.hdriMood = null;
    scene.transformController = null;
    scene.textureLoader = null;
    scene.stateApplier = null;

    scene._studioReady = false;
    document.documentElement.classList.remove('orby-studio-active');
}

export function attachViewportResizeObserver(scene) {
    if (typeof ResizeObserver === 'undefined' || !scene.viewport) return;
    scene._viewportResizeObserver?.disconnect();
    scene._viewportResizeObserver = new ResizeObserver(() => {
      scene.handleResize();
    });
    scene._viewportResizeObserver.observe(scene.viewport);
}

/** @param {import('../SceneManager.js').SceneManager} scene */
export async function bootstrapStudio(scene) {
    if (scene._studioReady) return;

    try {
    document.documentElement.classList.add('orby-studio-active');
    refreshWebglCanvas(scene);

    const initialState = scene.stateStore.getState();
    scene.clock = new THREE.Clock();
    scene.scene = new THREE.Scene();
    scene.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      DEFAULT_CAMERA_NEAR,
      DEFAULT_CAMERA_FAR,
    );
    scene.scene.add(scene.camera);
    scene.renderer = new THREE.WebGLRenderer({
      canvas: scene.canvas,
      antialias: true,
      alpha: true,
      // `true` preserves the drawing buffer for synchronous canvas readbacks; it also tends to
      // cause visible black flashes with EffectComposer + custom shaders on some GPUs/browsers.
      // PNG export uses render-target readback (`ImageExporter`); silhouette flow may still call
      // toDataURL after an explicit render.
      preserveDrawingBuffer: false,
    });
    scene.renderer.shadowMap.enabled = true;
    scene.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Disable tone mapping on renderer - we'll apply it as a post-processing pass instead
    scene.renderer.toneMapping = THREE.NoToneMapping;
    scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene.renderer.toneMappingExposure = 1;
    // Opaque first, then transparent (back-to-front) — important for glTF glass / blend materials.
    scene.renderer.sortObjects = true;

    scene.cameraController = new CameraController(scene.camera, scene.canvas, {
      initialFov: scene.camera.fov,
      getFocusPoint: () => {
        const bounds = scene.cameraController?.getModelBounds();
        if (bounds?.center) {
          return bounds.center;
        }
        return scene.controls?.target?.clone() ?? new THREE.Vector3(0, 1, 0);
      },
      onAltLightRotate: (deltaDegrees) => {
        const currentRotation = scene.lightsRotation ?? 0;
        scene.setLightsRotation(currentRotation + deltaDegrees, {
          updateUi: false,
        });
      },
      onAltLightRotateEnd: () => {
        scene.stateStore.set('lightsRotation', scene.lightsRotation);
        scene.ui?.setLightsRotation?.(scene.lightsRotation);
      },
      onShiftHdriRotate: (deltaDegrees) => {
        const currentRotation = scene.hdriRotation ?? 0;
        scene.setHdriRotation(currentRotation + deltaDegrees, {
          updateState: false,
          updateUi: false,
        });
      },
      onShiftHdriRotateEnd: () => {
        scene.stateStore.set('hdriRotation', scene.hdriRotation);
        if (scene.ui?.inputs?.hdriRotation) {
          scene.ui.inputs.hdriRotation.value = scene.hdriRotation;
          scene.ui.updateValueLabel('hdriRotation', scene.hdriRotation, 'angle');
        }
      },
      onAltLightHeight: (deltaHeight) => {
        // Get current height from lights controller (source of truth)
        if (!scene.lightsController) {
          console.warn('lightsController not available for height adjustment');
          return;
        }
        const currentHeight = scene.lightsController.lightsHeight ?? 5;
        const newHeight = Math.max(0.1, Math.min(20, currentHeight + deltaHeight));
        // Directly call setHeight on lightsController for immediate update
        scene.lightsController.setHeight(newHeight);
      },
      onAltLightHeightEnd: () => {
        // Get current height from lights controller and sync to state/UI
        const currentHeight = scene.lightsController?.lightsHeight ?? scene.stateStore.getState().lightsHeight ?? 5;
        scene.stateStore.batch(() => {
          scene.stateStore.set('lightsHeight', currentHeight);
          scene._syncDirectionalLightHeightsFromControllerToState();
        });
        scene.ui?.syncControls?.(scene.stateStore.getState());
      },
      onModelBoundsChanged: (bounds) => {
        scene._syncShadowCameraBounds(bounds);
      },
      onPoseChanged: (pose) => {
        scene.eventBus.emit('camera:pose-changed', pose);
      },
      onNeedRender: () => scene.requestRender(),
      getIsGizmoDragging: () =>
        !!scene._gizmoDragActive || !!scene._lightMoveDragActive,
    });
    scene.controls = scene.cameraController.getControls();
    scene.camera.position.set(0, 1.5, 6);
    scene.controls.target.set(0, 1, 0);
    scene.controls.update();
    scene.cameraController.emitPoseChanged();

    scene.modelRoot = new THREE.Group();
    scene.scene.add(scene.modelRoot);
    scene.colorCheckerRoot = createColorCheckerMeshGroup();
    scene.colorCheckerRoot.visible = false;
    scene.colorCheckerRoot.name = 'ColorCheckerRoot';
    scene.scene.add(scene.colorCheckerRoot);
    /** When Reference colors is on, shading we restore when turning it off (Display mode before Unlit). */
    scene._colorCheckerRestoreShading = null;
    /** Horizontal orbit reference (XZ), reused each frame like LightsController. */
    scene._colorCheckerHorizRef = new THREE.Vector3();
    scene._colorCheckerTowardCam = new THREE.Vector3();
    scene.scene.environmentIntensity = scene.hdriStrength;

    // Initialize background controller (manages solid background color independently from HDRI)
    scene.backgroundController = new BackgroundController({
      renderer: scene.renderer,
      scene: scene.scene,
      camera: scene.camera,
      initialColor: initialState.background ?? APP_BACKGROUND,
    });
    scene.backgroundGradientController = new BackgroundGradientController({
      renderer: scene.renderer,
      scene: scene.scene,
      backgroundController: scene.backgroundController,
    });
    scene.backgroundImageController = new BackgroundImageController({
      renderer: scene.renderer,
      scene: scene.scene,
      backgroundController: scene.backgroundController,
    });
    scene.backgroundController.setGradientController(scene.backgroundGradientController);
    scene.backgroundController.setImageController(scene.backgroundImageController);
    scene.backgroundGradientController.setConfig(initialState.backgroundGradient ?? {});
    scene.backgroundImageController.setConfig(initialState.backgroundImage ?? {});
    scene.backgroundController.setSolidEnabled(getBackgroundMode(initialState) === 'solid');

    scene.creativeLookSceneSync = new CreativeLookSceneSync(scene);

    scene.transformController = new TransformController({
      modelRoot: scene.modelRoot,
    });

    // Setup TransformControls (widgets) for visual transform editing
    // Create separate controls for translate (move), rotate, and scale
    const WIDGET_SIZE = 1.5; // Unified size for all widgets
    
    scene.transformControlsTranslate = new TransformControls(scene.camera, scene.canvas);
    scene.transformControlsTranslate.setMode('translate');
    scene.transformControlsTranslate.setSpace('local'); // Use local/object space for move
    scene.transformControlsTranslate.setSize(WIDGET_SIZE);
    scene.transformControlsTranslate.visible = false;
    scene.scene.add(scene.transformControlsTranslate);
    
    scene.transformControlsRotate = new TransformControls(scene.camera, scene.canvas);
    scene.transformControlsRotate.setMode('rotate');
    scene.transformControlsRotate.setSpace('local'); // Use local space so it follows mesh rotation
    scene.transformControlsRotate.setSize(WIDGET_SIZE);
    scene.transformControlsRotate.visible = false;
    scene.scene.add(scene.transformControlsRotate);
    
    scene.transformControlsScale = new TransformControls(scene.camera, scene.canvas);
    scene.transformControlsScale.setMode('scale');
    scene.transformControlsScale.setSpace('local'); // Use local space for scale
    scene.transformControlsScale.setSize(WIDGET_SIZE);
    // Ensure all scale axes are enabled
    scene.transformControlsScale.showX = true;
    scene.transformControlsScale.showY = true;
    scene.transformControlsScale.showZ = true;
    scene.transformControlsScale.visible = false;
    scene.scene.add(scene.transformControlsScale);

    scene._gizmoDragActive = false;
    
    // Disable OrbitControls when dragging any widget
    const handleGizmoDraggingChanged = (event) => {
      const controls = scene.cameraController?.getControls();
      if (controls) {
        controls.enabled = !event.value;
      }
      if (event.value) {
        scene.eventBus?.emit('undo:prepare');
        scene._gizmoDragActive = true;
        scene.cameraController?.onMeshGizmoDragStart?.();
      } else if (scene._gizmoDragActive) {
        scene._gizmoDragActive = false;
        scene._commitTransformFromGizmo();
      }
    };
    
    scene.transformControlsTranslate.addEventListener('dragging-changed', handleGizmoDraggingChanged);
    scene.transformControlsRotate.addEventListener('dragging-changed', handleGizmoDraggingChanged);
    scene.transformControlsScale.addEventListener('dragging-changed', handleGizmoDraggingChanged);
    
    const handleGizmoChange = () => {
      if (
        scene.transformControlsScale.object === scene.modelRoot
        && scene.transformControlsScale.dragging
      ) {
        clampMeshScaleComponents(scene.modelRoot.scale);
      }
      if (scene._gizmoDragActive) {
        scene._updateTransformSliderUI();
      }
    };
    scene.transformControlsTranslate.addEventListener('change', handleGizmoChange);
    scene.transformControlsRotate.addEventListener('change', handleGizmoChange);
    scene.transformControlsScale.addEventListener('change', handleGizmoChange);

    scene.diagnosticsController = new MeshDiagnosticsController({
      scene: scene.scene,
      modelRoot: scene.modelRoot,
      getLineResolution: () => {
        const canvas = scene.renderer?.domElement;
        return {
          width: canvas?.clientWidth || window.innerWidth || 1,
          height: canvas?.clientHeight || window.innerHeight || 1,
        };
      },
    });

    scene.topologyWarningsOverlay = new TopologyWarningsOverlay({
      getLineResolution: () => {
        const canvas = scene.renderer?.domElement;
        return {
          width: canvas?.clientWidth || window.innerWidth || 1,
          height: canvas?.clientHeight || window.innerHeight || 1,
        };
      },
    });

    scene.jointNameLabelsController?.dispose?.();
    scene.jointNameLabelsController = new JointNameLabelsController({
      viewport: scene.viewport,
      getCamera: () => scene.camera,
      getDiagnostics: () => scene.diagnosticsController,
      getEnabled: () => !!scene.stateStore.getState().animation?.showJointNames,
    });

    scene.materialController = new MaterialController({
      stateStore: scene.stateStore,
      modelRoot: scene.modelRoot,
      getCreativeLookKeyLightDir: (out) => scene._getCreativeLookKeyLightDir(out),
      getCreativeLookToonLightScalars: () =>
        scene._getCreativeLookToonLightScalars(),
      onNeedsTransmissionBackdrop: () => {
        scene.creativeLookSceneSync?.syncTransmissionBackdrop();
      },
      afterCreativeLookMaterialRebuild: () => {
        const preset = normalizeCreativeLookPreset(
          scene.materialController?.creativeLookSettings?.preset,
        );
        if (creativeLookPresetNeedsHdriBackdrop(preset)) {
          scene.creativeLookSceneSync?.syncTransmissionBackdrop();
        }
        scene.creativeLookSceneSync?.syncAsciiPass();
        if (scene.scene?.environment) {
          scene.updateMaterialsEnvironment(
            scene.scene.environment,
            Math.max(0, scene.hdriStrength),
          );
        }
        scene.animationController?.resyncPose?.();
        if (
          typeof scene.renderer?.compile === 'function' &&
          scene.scene &&
          scene.camera
        ) {
          // Defer compile so rapid Shader Lab cycling does not block rAF / input.
          requestAnimationFrame(() => {
            if (!scene.renderer || !scene.scene || !scene.camera) return;
            try {
              scene.renderer.compile(scene.scene, scene.camera);
            } catch (_) {
              /* ignore compile failures on partial rebuild */
            }
          });
        }
      },
      onObjectSurfacePresentationRefresh: () => {
        scene._presentObjectSurfaceChange();
      },
      onCreativeLookAsciiSync: () => scene.creativeLookSceneSync?.syncAsciiPass(),
      prepareStaticVoxelPose: () => {
        if (!scene.currentModel) return;
        applyStaticAnimationFrameZero(scene.currentModel, scene.animationController);
        scene.fontTextRevealController?.snapGlyphsForVoxelization?.();
      },
      restoreStaticVoxelPose: () => {
        scene.animationController?.endStaticPoseHold?.();
      },
      onShadingChanged: (mode) => {
        scene.currentShading = mode;
        scene.diagnosticsController.setModel(scene.currentModel, mode);
        scene.refreshBoneHelpers();
        scene.jointNameLabelsController?.update?.();
        if (scene.diagnosticsController.showBones) {
          scene.diagnosticsController.refreshGhostMesh();
        }
        // Apply current HDRI environment settings after shading change
        if (scene.scene.environment) {
          const intensity = Math.max(0, scene.hdriStrength);
          scene.updateMaterialsEnvironment(scene.scene.environment, intensity);
        }
      },
      onMaterialUpdate: () => {
        scene.fontTextRevealController?.onMaterialBaselineChanged?.();
      },
      onPostShaderMaterialSync: () => {
        scene.wakeViewportPresentation(8);
      },
    });

    scene.textureLoader = new THREE.TextureLoader();
    scene.goboProjection = new GoboProjectionController({
      textureLoader: scene.textureLoader,
      getKeyLight: () => scene.lightsController?.lights?.key ?? null,
      getProjectionCenter: (out) => {
        const bounds = scene.cameraController?.getModelBounds?.();
        if (bounds?.center) return out.copy(bounds.center);
        return out.set(0, 1, 0);
      },
      getProjectionBounds: (out) => {
        out.makeEmpty();
        if (scene.currentModel) out.expandByObject(scene.currentModel);
        // Backdrop/podium still receive the pattern; frustum follows the mesh so
        // studio backdrop width/scale does not rescale the projected gobo.
        return out;
      },
      getProjectionRadius: () => {
        const bounds = scene.cameraController?.getModelBounds?.();
        return Number.isFinite(bounds?.radius) ? Math.max(0.5, bounds.radius) : 3;
      },
    });
    scene.goboProjection.setEnabled(scene.goboEnabled);
    scene.goboProjection.setShadowSettings({
      opacity: scene.lightsShadowOpacity,
      color: scene.lightsShadowColor,
    });
    scene.goboProjection.setGoboSettings({
      softness: scene.goboSoftness,
      scale: scene.goboScale,
      rotation: scene.goboRotation,
    });
    scene.goboProjection.setSoftnessQuality(scene.goboSoftnessQuality);
    void scene.goboProjection.setTextureId(scene.goboTextureId);
    scene.setupLights();
    scene.lightViewportSelection?.dispose?.();
    scene.lightViewportSelection = new LightViewportSelectionController(scene, {
      canvas: scene.canvas,
      onSelectionChange: () => scene.lightIndicatorHud?.update?.(),
    });
    scene.lightViewportHudActions = new LightViewportHudActions(scene);
    scene.lightIndicatorHud?.dispose?.();
    scene.lightIndicatorHud = new LightIndicatorHudController({
      viewport: scene.viewport,
      getCamera: () => scene.camera,
      getLayouts: () => scene.lightsController?.getShadowBadgeLayouts?.() ?? null,
      getActive: () => !!scene.stateStore.getState().showLightIndicators,
      getIntensity: (lightId) => scene.stateStore.getState().lights?.[lightId]?.intensity ?? 1,
      onToggleShadow: (lightId) => scene.lightViewportHudActions.toggleCastShadows(lightId),
      onToggleLight: (lightId) => scene.lightViewportHudActions.toggleLightEnabled(lightId),
      onOpenColor: (lightId, clientX, clientY, clickTarget) =>
        scene.lightViewportHudActions.openColorPicker(lightId, clientX, clientY, clickTarget),
      onSetIntensity: (lightId, value) =>
        scene.lightViewportHudActions.setLightIntensity(lightId, value),
    });
    scene.lightsController?.setSceneStateProvider(() => scene.stateStore.getState());
    scene.setupGround();
    scene.studioGroundFacade = new StudioGroundFacade(scene);
    scene._syncHdriShadowReceiverFromState();
    const bootGround = scene.stateStore.getState();
    scene._ccToggleCtx.prevEnabled = !!bootGround.colorChecker?.enabled;
    scene._baseToggleCtx.prevEnabled = !!bootGround.groundSolid;
    scene._baseGlassToggleCtx.prevEnabled = !!(
      bootGround.baseGlassSurface ?? bootGround.podiumReflectMesh ?? false
    );
    scene._backdropToggleCtx.prevEnabled = !!bootGround.backdropEnabled;
    scene._infinityCoveToggleCtx.prevEnabled = !!bootGround.infinityCoveEnabled;
    scene.setupMoodController();
    scene.setupEnvironment(initialState);
    setupStudioComposer(scene);
    scene.autoExposureController = new AutoExposureController({
      renderer: scene.renderer,
      scene: scene.scene,
      camera: scene.camera,
      exposurePass: scene.exposurePass,
      setExposure: (value) => scene.postPipeline?.setExposure(value),
      stateStore: scene.stateStore,
      onExposureChange: (value) => {
        // Update UI display in real-time when auto-exposure changes exposure
        scene.ui?.updateExposureDisplay?.(value);
      },
    });
    scene.autoExposureController.init(initialState);
    scene.lensDirtController = new LensDirtController({
      lensDirtPass: scene.lensDirtPass,
      textureLoader: scene.textureLoader,
      stateStore: scene.stateStore,
      getAverageLuminance: () => scene.autoExposureController?.getAverageLuminance() ?? 0,
      getCurrentExposure: () => scene.autoExposureController?.getExposure() ?? 1.0,
    });
    scene.lensDirtController.init(initialState);
    scene.lensFlareController = new LensFlareController({
      camera: scene.camera,
      scene: scene.scene,
      stateStore: scene.stateStore,
      getCameraAutoOrbit: () => scene.cameraAutoOrbit ?? 'off',
    });
    scene.lensFlareController.init(initialState, scene.hdriEnabled);
    scene.lensFlareController.setTimeAnimationPaused(scene.panelsShelfScrolling);
    scene.godRaysController = new GodRaysController({
      godRaysPass: scene.postPipeline.godRaysPass,
      stateStore: scene.stateStore,
      getCamera: () => scene.camera,
    });
    scene.godRaysController.init(initialState);
    scene.godRaysController.setHdriEnabled(scene.hdriEnabled);

    scene.dofAutofocus = new DofAutofocusController({
      getCamera: () => scene.camera,
      getCurrentModel: () => scene.currentModel,
      getControlsTarget: () => scene.cameraController?.controls?.target,
      getModelBounds: () => scene.cameraController?.getModelBounds?.(),
      stateStore: scene.stateStore,
      eventBus: scene.eventBus,
    });
    scene.dofAutofocus.resetSmoothFocus(
      scene.stateStore.getState().dof?.focus ?? 1.5,
    );

    scene.dofFocusPlane = new DofFocusPlaneHelper(scene.scene);
    scene._syncDofFocusPlane(scene.stateStore.getState().dof);
    
    // Histogram is created lazily on first enable (see setHistogramEnabled).
    if (scene.stateStore.getState().histogramEnabled) {
      scene.setHistogramEnabled(true);
    }

    scene.stateApplier = new SceneStateApplier(scene);
    scene.setupMeshClickDetection();
    scene.setupBoneHoverHandler();
    attachViewportResizeObserver(scene);

    let resizeTimeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        scene.handleResize();
      }, 16);
    };

    const handleFullscreenChange = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scene.handleResize();
          scene.ui?.syncFullscreenToggle?.();
        });
      });
    };

    window.addEventListener('resize', debouncedResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    scene._studioResizeTeardown = () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };

    await scene.applyStateSnapshot(scene.stateStore.getState());
    scene._studioReady = true;
    // Render loop starts after shelf layout settles (see loadFile / startRenderLoop).
    } catch (error) {
      teardownStudioGpu(scene);
      throw error;
    }
}
