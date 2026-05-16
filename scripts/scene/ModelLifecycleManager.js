import * as THREE from 'three';
import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
} from '../constants.js';
import { LONG_TOAST_CHAR_THRESHOLD } from '../UIManager.js';
import { easeOutExpo, SCALE_TOGGLE_IN_MS } from './toggleScaleAnimation.js';

/** Modal copy after loading `.fbx` — FBX material/textures path is still WIP in Orby. */
const FBX_IMPORT_WIP_ALERT_BODY =
  'FBX import is still a work in progress. Phong/Lambert materials are converted to PBR so mesh sliders behave like GLB; ' +
  'UV sets, packed maps, and external textures may still differ from your DCC. ' +
  'For reliable shading, prefer GLB or glTF when you can. You can still tweak textures under Object → Map Slots.';

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
    if (!s.modelRoot) return;
    s.stateStore.set('fbxMapSlots.enabled', false);
    s.stateStore.set('fbxMapSlots.invertNormalY', false);
    s.stateStore.set('fbxMapSlots.pbrUvChannel', 0);
    s.diagnosticsController.clearBoneHelpers();
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
    s.animationController.dispose();
    s.currentAssetMetadata = null;
    s.svgExtrudeImporter = null;
    s.isSvgExtrudeModel = false;
    s.isStlModel = false;
    s._pivotCenterDelta = null;
    s._disposeStlRawCaches();
    s.originalGeometryIndices = new WeakMap();
    s.originalGeometryAttributes = new WeakMap();
    s.originalMaterialSides = new WeakMap();
    s.eventBus.emit('ui:advanced-alpha-visible', { visible: false });
    s.eventBus.emit('ui:advanced-glass-visible', { visible: false });
    s._emitStlSmoothingControlsVisibility();
    s.eventBus.emit('ui:center-pivot-enabled', { enabled: false });
  }

  applyAssetMetadata(asset = {}) {
    const s = this.scene;
    s.currentAssetMetadata = asset?.gltfMetadata || null;
    const svgExtrude = asset?.svgExtrude || null;
    const isSvgExtrude = !!svgExtrude?.enabled;
    s.svgExtrudeImporter = isSvgExtrude ? svgExtrude.importer : null;
    s.isSvgExtrudeModel = isSvgExtrude;
    s.stateStore.set('svgExtrude.enabled', isSvgExtrude);
    if (!isSvgExtrude) {
      s.stateStore.set('svgExtrude.availableColors', []);
      s.stateStore.set('svgExtrude.colorDepths', {});
      s.stateStore.set('svgExtrude.colorOffsets', {});
      s.stateStore.set('svgExtrude.flipDirection', false);
      return;
    }
    const nextDepth = svgExtrude.depth ?? s.stateStore.getState()?.svgExtrude?.depth ?? 0.2;
    s.stateStore.set('svgExtrude.depth', nextDepth);
    const nextNormalAngle =
      svgExtrude.normalAngle ?? s.stateStore.getState()?.svgExtrude?.normalAngle ?? 45;
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
    const nextColorDepths = {};
    const nextColorOffsets = {};
    availableColors.forEach((color) => {
      if (existingColorDepths[color] !== undefined) {
        nextColorDepths[color] = existingColorDepths[color];
      }
      if (existingColorOffsets[color] !== undefined) {
        nextColorOffsets[color] = existingColorOffsets[color];
      }
    });
    s.stateStore.set('svgExtrude.colorDepths', nextColorDepths);
    s.stateStore.set('svgExtrude.colorOffsets', nextColorOffsets);
    s.setSvgExtrudeColorDepths(nextColorDepths, { updateState: false });
    s.setSvgExtrudeColorOffsets(nextColorOffsets, { updateState: false });
    s.setSvgExtrudeFlipDirection(flipDirection, { updateState: false });
    const svgState = s.stateStore.getState().svgExtrude || {};
    s.setSvgExtrudeColorOverride(
      {
        enabled: !!svgState.colorOverride,
        color: svgState.overrideColor ?? '#7ed321',
      },
      { updateState: false },
    );
    const surfacePreset = svgState.surfacePreset ?? 'none';
    if (surfacePreset !== 'none') {
      s.setSvgExtrudeSurface(
        {
          preset: surfacePreset,
          scale: svgState.surfaceScale ?? 1,
        },
        { updateState: false },
      );
    }
    const fresnelState = s.stateStore.getState().fresnel;
    if (fresnelState?.enabled) {
      s.setFresnelSettings(fresnelState);
    }
  }

  setModel(object, animations) {
    const s = this.scene;
    this.clearModel();
    s.currentModel = object;

    s.transformController?.reset();
    s.modelRoot.add(object);

    s.lensFlareController?.setModelRoot(s.modelRoot);

    s.materialController.prepareMesh(object);
    s._setupStlSmoothingForModel(object);
    s._applyCenterPivotFromState();

    const wasFirstLoad = s.isFirstModelLoad;
    if (s.isFirstModelLoad) {
      s.isFirstModelLoad = false;
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
    if (wasFirstLoad) {
      s._cancelGroundGridBottomAlignAnimation();
      s._alignGroundAndGridToCurrentModelBottom();
    }
    s.materialController.setModel(object, state.shading, {
      clay: state.clay,
      fresnel: state.fresnel,
      subsurface: state.subsurface,
      wireframe: state.wireframe,
      creativeLook: state.creativeLook,
      advanced: state.advanced,
      material: state.material ?? {
        brightness: state.diffuseBrightness ?? DEFAULT_MATERIAL_BRIGHTNESS,
        metalness: 0.0,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
      },
    });
    s.setShading(state.shading);
    s._emitAdvancedAlphaPanelVisibility();
    s.setReverseNormals(state.advanced?.reverseNormals ?? false);
    s.diagnosticsController.setModel(object, state.shading);
    s.refreshBoneHelpers();
    if (state.fresnel?.enabled) {
      s.setFresnelSettings(state.fresnel);
    }
    if (s.scene.environment) {
      const intensity = Math.max(0, s.hdriStrength);
      s.updateMaterialsEnvironment(s.scene.environment, intensity);
    }
    s.animationController.setModel(s.currentModel, animations);

    requestAnimationFrame(() => {
      s.setGroundSolid(state.groundSolid);
      s.setGroundWire(state.groundWire);
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
          const startExposure = 0.1;
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

        s.cameraController?.focusOnObjectAnimated(s.currentModel, 1.0);
        this._scaleInMeshOnSpawn(object);
      });
    });
  }

  _scaleInMeshOnSpawn(object) {
    const s = this.scene;
    if (!object || s.currentModel !== object) return;
    if (this._meshSpawnScaleRaf) {
      cancelAnimationFrame(this._meshSpawnScaleRaf);
      this._meshSpawnScaleRaf = 0;
    }

    const targetScale = object.scale.clone();
    const duration = Math.min(SCALE_TOGGLE_IN_MS, 320);
    const startTime = performance.now();

    object.visible = true;
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

      if (t < 1) {
        this._meshSpawnScaleRaf = requestAnimationFrame(tick);
      } else {
        object.scale.copy(targetScale);
        this._meshSpawnScaleRaf = 0;
      }
    };

    this._meshSpawnScaleRaf = requestAnimationFrame(tick);
  }

  _configureFbxAfterLoad(file) {
    const s = this.scene;
    const isFbx = typeof file?.name === 'string' && file.name.toLowerCase().endsWith('.fbx');
    s.stateStore.set('fbxMapSlots.enabled', isFbx);
    if (isFbx) {
      s.eventBus.emit('scene:fbx-map-slots-reset');
    }
    return isFbx;
  }

  async loadFile(file, options = {}) {
    const s = this.scene;
    if (!file) return;
    await s.ensureStudioReady();
    const previousFile = s.currentFile;
    const hadExistingModel = !!s.currentModel;

    s.currentFile = file;
    s.ui.updateTitle(file.name);
    s.ui.updateTopBarDetail(`${file.name} — Loading…`);
    s.ui.setDropzoneVisible(false);
    await s.syncViewportSize();
    s.startRenderLoop();

    const isFirstLoad = s.isFirstModelLoad;
    if (isFirstLoad) {
      const startExposure = 0.1;
      s.autoExposureController?.setExposure(startExposure);
      s.eventBus.emit('scene:exposure', startExposure);
    }

    s.ui.beginLoadSpinner();
    try {
      const svgExtrudeState = s.stateStore.getState()?.svgExtrude || {};
      const asset = await s.modelLoader.loadFile(file, {
        svgExtrudeDepth: svgExtrudeState.depth,
        svgExtrudeNormalAngle: svgExtrudeState.normalAngle,
        svgExtrudeColorDepths: svgExtrudeState.colorDepths || {},
        svgExtrudeColorOffsets: svgExtrudeState.colorOffsets || {},
        svgExtrudeFlipDirection: !!svgExtrudeState.flipDirection,
      });
      this.setModel(asset.object, asset.animations ?? []);
      this.applyAssetMetadata(asset);
      const isFbx = this._configureFbxAfterLoad(file);
      s.updateStatsUI(file, asset.object, asset.gltfMetadata);
      s.ui.updateTopBarDetail(`${file.name} — Idle`);
      if (!options.silent) {
        if (isFbx) {
          s.ui.showMessageAlert(FBX_IMPORT_WIP_ALERT_BODY, 'FBX — work in progress', {
            okLabel: 'CONTINUE',
            modalTone:
              options.suppressSuccessToastSound === true ? 'none' : 'notification',
          });
        } else {
          s.ui.showToast('Model loaded', 3200, {
            notification: options.suppressSuccessToastSound === true ? false : undefined,
          });
        }
      }
      s.eventBus.emit('scene:model-load-complete', { success: true, file });
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
    await s.ensureStudioReady();
    s.ui.setDropzoneVisible(false);
    await s.syncViewportSize();
    s.startRenderLoop();
    s.ui.beginLoadSpinner();
    try {
      const asset = await s.modelLoader.loadFileBundle(files);
      const sourceFile = asset.sourceFile ?? files[0]?.file;
      if (sourceFile) {
        s.currentFile = sourceFile;
        s.ui.updateTitle(sourceFile.name);
      }
      this.setModel(asset.object, asset.animations ?? []);
      this.applyAssetMetadata(asset);
      const isFbx = this._configureFbxAfterLoad(sourceFile);
      s.updateStatsUI(sourceFile, asset.object, asset.gltfMetadata);
      if (isFbx) {
        s.ui.showMessageAlert(FBX_IMPORT_WIP_ALERT_BODY, 'FBX — work in progress', {
          okLabel: 'CONTINUE',
          modalTone: 'notification',
        });
      } else {
        s.ui.showToast('Folder loaded');
      }
      s.eventBus.emit('scene:model-load-complete', { success: true, file: sourceFile });
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
