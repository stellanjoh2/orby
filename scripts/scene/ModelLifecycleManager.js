import * as THREE from 'three';
import { recordAssetLoaded } from '../orbyStatsBeacon.js';
import { DEFAULT_MATERIAL_BRIGHTNESS } from '../constants.js';
import { LONG_TOAST_CHAR_THRESHOLD } from '../UIManager.js';
import { clampExtrudeBevelAmount } from '../import/extrudeBevel.js';
import {
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
  DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
} from '../import/extrudeDefaults.js';
import { normalizeExtrudeDetail } from '../import/extrudeDetail.js';
import { isFontExtrudeRevealModel } from './FontTextRevealController.js';
import { easeOutExpo, SCALE_TOGGLE_IN_MS } from './toggleScaleAnimation.js';
import {
  analyzeFbxMaterials,
  defaultFbxActiveMaterialKey,
  formatFbxMaterialReportAppendix,
  fbxMaterialReportModalTitle,
} from '../import/fbxMaterialReport.js';
import { isBoneOnlyArmature } from '../import/bvhArmatureBounds.js';
import { deferSpinnerPaint } from '../utils/viewportLoadSpinner.js';
import { isMaterialObjectSurfaceEnabled } from '../render/SvgExtrudeSurfaceShader.js';

/** Modal copy after loading `.fbx` — FBX material/textures path is still WIP in Orby. */
const FBX_IMPORT_WIP_ALERT_BODY =
  'FBX import is still a work in progress. Phong/Lambert materials are converted to PBR so mesh sliders behave like GLB; ' +
  'UV sets, packed maps, and external textures may still differ from your DCC. ' +
  'When you drop a folder, Orby auto-assigns images named like MaterialName_BaseColor.png to matching materials. ' +
  'For reliable shading, prefer GLB or glTF when you can. You can still tweak textures under Object → Map Slots.';

function buildFbxImportAlert(object) {
  const report = analyzeFbxMaterials(object);
  const appendix = formatFbxMaterialReportAppendix(report);
  const body = appendix ? `${FBX_IMPORT_WIP_ALERT_BODY}\n\n${appendix}` : FBX_IMPORT_WIP_ALERT_BODY;
  return { report, body, title: fbxMaterialReportModalTitle(report) };
}

/**
 * Model load, replace, clear, dispose, and first-load presentation (camera fade, scale-in).
 */
export class ModelLifecycleManager {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  constructor(scene) {
    this.scene = scene;
    this._meshSpawnScaleRaf = 0;
  }

  disposeNode(object) {
    object.traverse?.((node) => {
      if (node.isMesh) {
        if (node.geometry) node.geometry.dispose();
        const material = node.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.());
        } else {
          material?.dispose?.();
        }
      }
      if (node.isTexture) {
        node.dispose();
      }
    });
  }

  clearModel() {
    const s = this.scene;
    if (!s?.modelRoot) return;
    const fbxDefaults = s.stateStore.getDefaults().fbxMapSlots;
    s.stateStore.set('fbxMapSlots', { ...fbxDefaults, enabled: false, activeMaterial: '' });
    s._fbxImportBundle = null;
    s.setAnimationShowBones(false);
    s.diagnosticsController.clearBoneHelpers();
    s.topologyWarningsOverlay?.setEnabled(false);
    s.topologyWarningsOverlay?.setModel(null);
    s.materialController.clear();
    s.modelLoader.disposeObjectUrls();
    while (s.modelRoot.children.length) {
      const child = s.modelRoot.children[0];
      this.disposeNode(child);
      s.modelRoot.remove(child);
    }
    s.currentModel = null;
    s.transformControlsTranslate?.detach();
    s.transformControlsRotate?.detach();
    s.transformControlsScale?.detach();
    s.lensFlareController?.setModelRoot(null);
    s.godRaysController?.setModelRoot(null);
    s.animationController.dispose();
    s.fontTextRevealController?.unbind?.();
    s.currentAssetMetadata = null;
    s.svgExtrudeImporter = null;
    s.isSvgExtrudeModel = false;
    s.isImportSmoothingModel = false;
    s._pivotCenterDelta = null;
    s._disposeImportRawCaches();
    s.originalGeometryIndices = new WeakMap();
    s.originalGeometryAttributes = new WeakMap();
    s.originalMaterialSides = new WeakMap();
    s.eventBus.emit('ui:advanced-alpha-visible', { visible: false });
    s.eventBus.emit('ui:advanced-glass-visible', { visible: false });
    s._emitImportSmoothingControlsVisibility();
    s.eventBus.emit('ui:center-pivot-enabled', { enabled: false });
    s.stateStore.set('objectHidden', false);
    if (s.modelRoot) s.modelRoot.visible = true;
    s.ui.meshControls?.syncHideObjectButton?.({ hidden: false, hasModel: false });
    s.eventBus.emit('scene:model-cleared');
  }

  applyAssetMetadata(asset = {}) {
    const s = this.scene;
    s.currentAssetMetadata = asset?.gltfMetadata || null;
    const svgExtrude = asset?.svgExtrude || null;
    const isSvgExtrude = !!svgExtrude?.enabled;
    s.svgExtrudeImporter = isSvgExtrude ? svgExtrude.importer : null;
    s.isSvgExtrudeModel = isSvgExtrude;
    s.stateStore.set('svgExtrude.enabled', isSvgExtrude);
    s._refreshImportSmoothingUi();
    if (!isSvgExtrude) {
      s.stateStore.set('svgExtrude.availableColors', []);
      s.stateStore.set('svgExtrude.colorDepths', {});
      s.stateStore.set('svgExtrude.colorOffsets', {});
      s.stateStore.set('svgExtrude.colorReplacements', {});
      s.stateStore.set('svgExtrude.flipDirection', false);
      return;
    }
    const nextDepth =
      svgExtrude.depth ?? s.stateStore.getState()?.svgExtrude?.depth ?? DEFAULT_EXTRUDE_DEPTH;
    s.stateStore.set('svgExtrude.depth', nextDepth);
    const nextNormalAngle =
      svgExtrude.normalAngle ??
      s.stateStore.getState()?.svgExtrude?.normalAngle ??
      DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
    s.stateStore.set('svgExtrude.normalAngle', nextNormalAngle);
    const flipDirection = !!(
      svgExtrude.flipDirection ?? s.stateStore.getState()?.svgExtrude?.flipDirection
    );
    s.stateStore.set('svgExtrude.flipDirection', flipDirection);
    const availableColors = Array.isArray(svgExtrude.colors) ? svgExtrude.colors : [];
    s.stateStore.set('svgExtrude.availableColors', availableColors);
    const existingColorDepths =
      svgExtrude.colorDepths ?? s.stateStore.getState()?.svgExtrude?.colorDepths ?? {};
    const existingColorOffsets =
      svgExtrude.colorOffsets ?? s.stateStore.getState()?.svgExtrude?.colorOffsets ?? {};
    const existingColorReplacements =
      svgExtrude.colorReplacements ?? s.stateStore.getState()?.svgExtrude?.colorReplacements ?? {};
    const nextColorDepths = {};
    const nextColorOffsets = {};
    const nextColorReplacements = {};
    availableColors.forEach((color) => {
      if (existingColorDepths[color] !== undefined) {
        nextColorDepths[color] = existingColorDepths[color];
      }
      if (existingColorOffsets[color] !== undefined) {
        nextColorOffsets[color] = existingColorOffsets[color];
      }
      if (existingColorReplacements[color] !== undefined) {
        nextColorReplacements[color] = existingColorReplacements[color];
      }
    });
    s.stateStore.set('svgExtrude.colorDepths', nextColorDepths);
    s.stateStore.set('svgExtrude.colorOffsets', nextColorOffsets);
    s.stateStore.set('svgExtrude.colorReplacements', nextColorReplacements);
    const nextBevelAmount = clampExtrudeBevelAmount(
      svgExtrude.bevelAmount ??
        s.stateStore.getState()?.svgExtrude?.bevelAmount ??
        DEFAULT_EXTRUDE_BEVEL_AMOUNT,
      nextDepth,
    );
    s.stateStore.set('svgExtrude.bevelAmount', nextBevelAmount);
    const nextDetail = normalizeExtrudeDetail(
      svgExtrude.detail ?? s.stateStore.getState()?.svgExtrude?.detail ?? 'high',
    );
    s.stateStore.set('svgExtrude.detail', nextDetail);
    s.setSvgExtrudeColorDepths(nextColorDepths, { updateState: false });
    s.setSvgExtrudeColorOffsets(nextColorOffsets, { updateState: false });
    s.setSvgExtrudeColorReplacements(nextColorReplacements, { updateState: false });
    s.setSvgExtrudeFlipDirection(flipDirection, { updateState: false });
    s.setSvgExtrudeBevel({ amount: nextBevelAmount }, { updateState: false });
    const svgState = s.stateStore.getState().svgExtrude || {};
    s.setSvgExtrudeColorOverride(
      {
        enabled: !!svgState.colorOverride,
        color: svgState.overrideColor ?? DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
        extrudeColor:
          svgState.overrideExtrudeColor
          ?? svgState.overrideColor
          ?? DEFAULT_SVG_EXTRUDE_OVERRIDE_COLOR,
      },
      { updateState: false },
    );
    const matState = s.stateStore.getState().material || {};
    if (isMaterialObjectSurfaceEnabled(matState)) {
      s.setObjectSurface(
        {
          enabled: true,
          preset: matState.surfacePreset,
          scale: matState.surfaceScale ?? 1,
          strength: matState.surfaceStrength ?? 1,
        },
        { updateState: false },
      );
    }
    const fresnelState = s.stateStore.getState().fresnel;
    if (fresnelState?.enabled) {
      s.materialController?.setFresnelSettings(fresnelState);
    }
  }

  setModel(object, animations, options = {}) {
    const s = this.scene;
    const resetTransform = options.resetTransform === true;
    this.clearModel();
    s.currentModel = object;

    s.transformController?.reset();
    s.modelRoot.add(object);

    s.lensFlareController?.setModelRoot(s.modelRoot);
    s.godRaysController?.setModelRoot(s.modelRoot);

    s.materialController.prepareMesh(object);
    s._setupImportSmoothingForModel(object);
    const isFontModel =
      object.userData?.orbyFontGenerated || isFontExtrudeRevealModel(object);
    if (!isFontModel) {
      s.centerImportAtStudioOrigin({ showToast: false });
    }

    const wasFirstLoad = s.isFirstModelLoad;
    if (s.isFirstModelLoad) {
      s.isFirstModelLoad = false;
    }
    if (resetTransform) {
      s.stateStore.batch(() => {
        s.stateStore.set('xOffset', 0);
        s.stateStore.set('yOffset', 0);
        s.stateStore.set('zOffset', 0);
        s.stateStore.set('rotationX', 0);
        s.stateStore.set('rotationY', 0);
        s.stateStore.set('rotationZ', 0);
      });
    }
    const state = s.stateStore.getState();

    if (state.moveWidgetEnabled && s.transformControlsTranslate) {
      s.transformControlsTranslate.attach(s.modelRoot);
      s.transformControlsTranslate.visible = true;
    }
    if (state.rotateWidgetEnabled && s.transformControlsRotate) {
      s.transformControlsRotate.attach(s.modelRoot);
      s.transformControlsRotate.visible = true;
    }
    if (state.scaleWidgetEnabled && s.transformControlsScale) {
      s.transformControlsScale.attach(s.modelRoot);
      s.transformControlsScale.visible = true;
    }
    s.transformController?.applyState(state);
    if (wasFirstLoad && !s._skipGroundGridAutoAlignOnNextModelLoad) {
      if (isFontModel) {
        s._pendingFontGroundAlignAfterTypography = true;
        if (!s._skipCameraFlightOnNextModelLoad) {
          s._pendingFontCameraFocusAfterTypography = true;
        }
      } else {
        s._cancelGroundGridBottomAlignAnimation();
        s._alignGroundAndGridToCurrentModelBottom();
      }
    }
    s._skipGroundGridAutoAlignOnNextModelLoad = false;
    s._updateHdriShadowReceiverContact();
    s.materialController.setModel(object, state.shading, {
      clay: state.clay,
      fresnel: state.fresnel,
      subsurface: state.subsurface,
      wireframe: state.wireframe,
      creativeLook: state.creativeLook,
      advanced: state.advanced,
      material: {
        brightness:
          state.material?.brightness ??
          state.diffuseBrightness ??
          DEFAULT_MATERIAL_BRIGHTNESS,
        metalness: state.material?.metalness,
        roughness: state.material?.roughness,
        emissive: state.material?.emissive ?? 0.0,
      },
      preserveSessionMaterialMr: !wasFirstLoad,
    });
    s.setShading(state.shading);
    s.ui.meshControls?.sync(s.stateStore.getState());
    s._refreshImportSmoothingUi();
    s.repairRenderSurfacesAfterModelLoad?.();
    if (state.gobo?.texture) {
      void s.setGoboTexture(state.gobo.texture, { updateState: false });
    }
    void s.setGoboEnabled(!!state.gobo?.enabled, { updateState: false });
    s._emitAdvancedAlphaPanelVisibility();
    s.setReverseNormals(state.advanced?.reverseNormals ?? false);
    s.diagnosticsController.setModel(object, state.shading);
    s.topologyWarningsOverlay?.setModel(object);
    s.diagnosticsController.setJointScale(state.animation?.jointScale ?? 0.5);
    s.diagnosticsController.setBoneStrokeWidth(state.animation?.boneStrokeWidth ?? 2);
    s.diagnosticsController.setHideMesh(false);
    s.stateStore.set('animation.showBones', false);
    s.stateStore.set('animation.showJointNames', false);
    s.stateStore.set('animation.hideMesh', false);
    const hasSkinnedSkeleton = s.diagnosticsController.hasSkinnedSkeleton();
    s.ui.syncAnimationShowBones(false, hasSkinnedSkeleton);
    s.refreshBoneHelpers();
    s.setObjectHidden(!!state.objectHidden, { updateUi: true });
    if (state.fresnel?.enabled) {
      s.materialController?.setFresnelSettings(state.fresnel);
    }
    if (s.scene.environment) {
      const intensity = Math.max(0, s.hdriStrength);
      s.updateMaterialsEnvironment(s.scene.environment, intensity);
    }
    s.animationController.setModel(s.currentModel, animations);
    s.animationController.setClipPlaybackMode(
      state.animation?.clipPlaybackMode ?? 'loop',
    );
    s.ui.syncAnimationClipMode(
      state.animation?.clipPlaybackMode ?? 'loop',
      animations.length > 0,
    );
    if (isBoneOnlyArmature(object)) {
      s.setAnimationShowBones(true);
    }
    if (isFontExtrudeRevealModel(s.currentModel)) {
      s.fontTextRevealController?.bindModel?.(s.currentModel);
      if (
        s.currentShading === 'wireframe'
        || s.stateStore.getState()?.wireframe?.alwaysOn
      ) {
        s.updateWireframeOverlay?.();
      }
    }

    requestAnimationFrame(() => {
      const studio = s.stateStore.getState();
      s.setGroundSolid(studio.groundSolid);
      s.groundController?.setWireEnabled(studio.groundWire);
      s.materialController?.resyncEmissiveFromImportedMaterials?.();
    });

    s.ui.setDropzoneVisible(false);
    s.ui.revealShelf?.({ skipSound: wasFirstLoad });
    s.eventBus.emit('ui:center-pivot-enabled', { enabled: true });

    object.visible = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!s.currentModel) return;
        if (wasFirstLoad) {
          const targetExposure = s.stateStore.getState().exposure ?? 1.0;
          // Keep HDRI readable during spawn — 0.1 made the backdrop look “off” for ~2s.
          const startExposure = Math.min(targetExposure, Math.max(0.72, targetExposure * 0.88));
          const duration = 2000;
          const startTime = performance.now();

          const fadeExposure = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            const easedProgress = 1 - Math.pow(1 - progress, 2);
            const currentExposure =
              startExposure + (targetExposure - startExposure) * easedProgress;

            s.autoExposureController?.setExposure(currentExposure);
            s.eventBus.emit('scene:exposure', currentExposure);

            if (progress < 1) {
              requestAnimationFrame(fadeExposure);
            } else {
              s.autoExposureController?.setExposure(targetExposure);
              s.eventBus.emit('scene:exposure', targetExposure);
            }
          };

          fadeExposure();
        }

        if (wasFirstLoad) {
          if (!s._skipCameraFlightOnNextModelLoad && !isFontModel) {
            s.cameraController?.focusOnObjectAnimated(s.currentModel, 1.0);
          }
          if (!isFontModel) {
            s._skipCameraFlightOnNextModelLoad = false;
          }
        } else if (s.currentModel) {
          s.cameraController?.refreshModelBounds(s.currentModel);
        }
        this._scaleInMeshOnSpawn(object, { animateSpawn: wasFirstLoad });
      });
    });
  }

  _finalizeFontModelAfterTypography(object) {
    const s = this.scene;
    if (!object || s.currentModel !== object) return;
    if (!object.userData?.orbyFontGenerated && !isFontExtrudeRevealModel(object)) return;

    s.finalizeFontModelStudioPlacement?.({
      alignGround: !!s._pendingFontGroundAlignAfterTypography,
    });
    s._pendingFontGroundAlignAfterTypography = false;
    s.fontTextRevealController?.reconcileTypographyToMaster?.(object);

    if (s._pendingFontCameraFocusAfterTypography) {
      s._pendingFontCameraFocusAfterTypography = false;
      if (!s._skipCameraFlightOnNextModelLoad) {
        s.cameraController?.focusOnObjectAnimated(s.currentModel, 1.0);
      }
      s._skipCameraFlightOnNextModelLoad = false;
    } else if (s.currentModel === object) {
      s.cameraController?.refreshModelBounds(s.currentModel);
    }
  }

  /** Surface must compile on visible lit materials — same rebuild path as a shading toggle. */
  _presentObjectSurfaceAfterModelVisible() {
    const s = this.scene;
    if (!s.currentModel?.visible) return;
    const matState = s.stateStore.getState().material || {};
    if (!isMaterialObjectSurfaceEnabled(matState)) {
      s._refreshViewportAfterOverlayChange?.();
      return;
    }
    const mode = s.currentShading ?? matState.shading ?? s.stateStore.getState().shading;
    if (mode === 'shaded' || mode === 'clay') {
      s.setShading(mode);
      return;
    }
    s._refreshViewportAfterOverlayChange?.();
  }

  _scaleInMeshOnSpawn(object, options = {}) {
    const s = this.scene;
    if (!object || s.currentModel !== object) return;
    if (object.userData?.orbyFontGenerated || isFontExtrudeRevealModel(object)) {
      s.fontTextRevealController?.bindModel?.(object);
      if (
        s.currentShading === 'wireframe'
        || s.stateStore.getState()?.wireframe?.alwaysOn
      ) {
        s.updateWireframeOverlay?.();
      }
      const revealDuration = Number(
        s.stateStore.getState()?.fontExtrude?.revealDurationSec ?? 0,
      );
      if (revealDuration > 0) {
        object.visible = true;
        this._presentObjectSurfaceAfterModelVisible();
        s.fontTextRevealController?.resetAllAnimations?.({
          resumeConstant: true,
          showSettledIdle: true,
        });
        this._finalizeFontModelAfterTypography(object);
        return;
      }
    }
    if (options.animateSpawn === false) {
      object.visible = true;
      this._presentObjectSurfaceAfterModelVisible();
      s.fontTextRevealController?.resetAllAnimations?.({ resumeConstant: true });
      this._finalizeFontModelAfterTypography(object);
      return;
    }
    if (this._meshSpawnScaleRaf) {
      cancelAnimationFrame(this._meshSpawnScaleRaf);
      this._meshSpawnScaleRaf = 0;
    }

    const targetScale = object.scale.clone();
    const duration = Math.min(SCALE_TOGGLE_IN_MS, 320);
    const startTime = performance.now();

    object.visible = true;
    this._presentObjectSurfaceAfterModelVisible();
    s.fontTextRevealController?.resetAllAnimations?.({ resumeConstant: false });
    object.scale.set(
      targetScale.x * 0.001,
      targetScale.y * 0.001,
      targetScale.z * 0.001,
    );

    const tick = () => {
      if (s.currentModel !== object) return;
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const m = easeOutExpo(t);
      object.scale.set(targetScale.x * m, targetScale.y * m, targetScale.z * m);
      s.requestRender();

      if (t < 1) {
        this._meshSpawnScaleRaf = requestAnimationFrame(tick);
      } else {
        object.scale.copy(targetScale);
        this._meshSpawnScaleRaf = 0;
        this._presentObjectSurfaceAfterModelVisible();
        s.fontTextRevealController?.resetAllAnimations?.({ resumeConstant: true });
        this._finalizeFontModelAfterTypography(object);
      }
    };

    this._meshSpawnScaleRaf = requestAnimationFrame(tick);
  }

  _configureFbxAfterLoad(file, object) {
    const s = this.scene;
    const isFbx = typeof file?.name === 'string' && file.name.toLowerCase().endsWith('.fbx');
    s.stateStore.set('fbxMapSlots.enabled', isFbx);
    if (isFbx) {
      const report = analyzeFbxMaterials(object);
      s.stateStore.set('fbxMapSlots.activeMaterial', defaultFbxActiveMaterialKey(report));
      s.eventBus.emit('scene:fbx-map-slots-reset');
      s.eventBus.emit('scene:fbx-material-report', { report });
    }
    return isFbx;
  }

  _presentFbxImportFeedback(object) {
    const s = this.scene;
    const { report, body, title } = buildFbxImportAlert(object);
    if (report.shouldShowDetails) {
      console.info('[Orby] FBX material report', report);
    }
    s.ui.showMessageAlert(body, title, {
      okLabel: 'CONTINUE',
      modalTone: report.hasUntexturedMaterials ? 'caution' : 'none',
    });
  }

  async loadFile(file, options = {}) {
    const s = this.scene;
    if (!file) return;

    const previousFile = s.currentFile;
    const hadExistingModel = !!s.currentModel;

    s.currentFile = file;
    s.ui.updateTitle(file.name);
    s.ui.updateTopBarDetail(`${file.name} — Loading…`);
    s.ui.setDropzoneVisible(false);

    s.ui.setLoadSpinnerStatusPrefix?.('Loading');
    s.ui.beginLoadSpinner();
    s.ui.beginLoadSpinnerElapsed?.();
    await deferSpinnerPaint();

    try {
      await s.ui.ensureStudioUiReady();
      await s.ensureStudioReady();
      await s.syncViewportSize();
      s.startRenderLoop();

      const isFirstLoad = s.isFirstModelLoad;
      if (isFirstLoad) {
        const startExposure = 0.1;
        s.autoExposureController?.setExposure(startExposure);
        s.eventBus.emit('scene:exposure', startExposure);
      }

      const svgExtrudeState = s.stateStore.getState()?.svgExtrude || {};
      const asset = await s.modelLoader.loadFile(file, {
        svgExtrudeDepth: svgExtrudeState.depth,
        svgExtrudeNormalAngle: svgExtrudeState.normalAngle,
        svgExtrudeHardEdgeAngle: svgExtrudeState.hardEdgeAngle,
        svgExtrudeColorDepths: svgExtrudeState.colorDepths || {},
        svgExtrudeColorOffsets: svgExtrudeState.colorOffsets || {},
        svgExtrudeFlipDirection: !!svgExtrudeState.flipDirection,
        svgExtrudeBevelAmount: svgExtrudeState.bevelAmount ?? 0,
        svgExtrudeDetail: svgExtrudeState.detail ?? 'high',
      });
      this.setModel(asset.object, asset.animations ?? [], { resetTransform: true });
      this.applyAssetMetadata(asset);
      s._fbxImportBundle = null;
      const isFbx = this._configureFbxAfterLoad(file, asset.object);
      s.updateStatsUI(file, asset.object, asset.gltfMetadata);
      s.ui.updateTopBarDetail(`${file.name} — Idle`);
      if (options.silent) {
        s.ui.showToast('Model reloaded', 3200, { notification: false });
      } else if (isFbx) {
        this._presentFbxImportFeedback(asset.object);
      } else {
        s.ui.showToast('Model loaded', 3200, { notification: false });
      }
      s.eventBus.emit('scene:model-load-complete', { success: true, file });
      recordAssetLoaded(file);
    } catch (error) {
      console.error('Failed to load model', error);
      const msg =
        error && typeof error.message === 'string' && error.message.trim().length > 0
          ? error.message.trim()
          : 'Could not load model';
      if (msg.length > LONG_TOAST_CHAR_THRESHOLD) {
        s.ui.showMessageAlert(msg, 'Couldn’t load model');
      } else {
        s.ui.showToast(msg);
      }

      if (hadExistingModel) {
        s.currentFile = previousFile ?? null;
        s.ui.setDropzoneVisible(false);
        const label = previousFile?.name ?? 'Model';
        s.ui.updateTitle(label);
        s.ui.updateTopBarDetail(`${label} — Idle`);
      } else {
        await s.shutdownStudio();
        s.ui.setDropzoneVisible(true);
      }
      s.eventBus.emit('scene:model-load-complete', { success: false, file, error });
    } finally {
      s.ui.endLoadSpinner();
    }
  }

  async loadFileBundle(files) {
    const s = this.scene;
    if (!files?.length) return;

    s.ui.setDropzoneVisible(false);
    s.ui.setLoadSpinnerStatusPrefix?.('Loading');
    s.ui.beginLoadSpinner();
    s.ui.beginLoadSpinnerElapsed?.();
    await deferSpinnerPaint();

    try {
      await s.ui.ensureStudioUiReady();
      await s.ensureStudioReady();
      await s.syncViewportSize();
      s.startRenderLoop();

      const asset = await s.modelLoader.loadFileBundle(files);
      const sourceFile = asset.sourceFile ?? files[0]?.file;
      if (sourceFile) {
        s.currentFile = sourceFile;
        s.ui.updateTitle(sourceFile.name);
      }
      this.setModel(asset.object, asset.animations ?? [], { resetTransform: true });
      this.applyAssetMetadata(asset);
      s._fbxImportBundle = files;
      const isFbx = this._configureFbxAfterLoad(sourceFile, asset.object);
      let autoAssigned = 0;
      if (isFbx) {
        const result = await s.autoAssignFbxTexturesFromBundle(files, asset.object);
        autoAssigned = result.applied;
      }
      s.updateStatsUI(sourceFile, asset.object, asset.gltfMetadata);
      if (isFbx) {
        this._presentFbxImportFeedback(asset.object);
        if (autoAssigned > 0) {
          const label =
            autoAssigned === 1 ? '1 texture' : `${autoAssigned} textures`;
          s.ui.showToast(`Auto-assigned ${label} from folder`, 3600, {
            notification: false,
          });
        }
      } else {
        s.ui.showToast('Folder loaded', 3200, { notification: false });
      }
      s.eventBus.emit('scene:model-load-complete', { success: true, file: sourceFile });
      recordAssetLoaded(sourceFile);
    } catch (error) {
      console.error('Folder load failed', error);
      const raw = error?.message || 'Folder load failed';
      const msg = typeof raw === 'string' ? raw.trim() : String(raw);
      if (msg.length > LONG_TOAST_CHAR_THRESHOLD) {
        s.ui.showMessageAlert(msg, 'Couldn’t load folder');
      } else {
        s.ui.showToast(msg);
      }
      s.eventBus.emit('scene:model-load-complete', { success: false, error });
    } finally {
      s.ui.endLoadSpinner();
    }
  }
}
