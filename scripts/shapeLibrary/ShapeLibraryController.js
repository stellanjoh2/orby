/**
 * Load bundled shape-library GLBs into the active scene.
 */
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/GLTFLoader.js';
import { registerKHRMaterialsPbrSpecularGlossiness } from '../render/gltfKHRSpecularGlossinessPlugin.js';
import { normalizeImportScale } from '../import/normalizeImportScale.js';
import {
  findBakeableShapeLibraryEntry,
  applyShapeLibraryPresentationTilt,
  SHAPE_LIBRARY_TARGET_MAX_DIMENSION,
} from './shapeLibraryCatalog.js';

function configureGLTFLoader(loader) {
  registerKHRMaterialsPbrSpecularGlossiness(loader);
}

export class ShapeLibraryController {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {() => import('../SceneManager.js').SceneManager | null | undefined} getScene
   */
  constructor(eventBus, getScene) {
    this.eventBus = eventBus;
    this.getScene = getScene;
    this._loader = new GLTFLoader();
    configureGLTFLoader(this._loader);
    /** @type {Promise<void> | null} */
    this._loadPromise = null;
  }

  /**
   * @param {string} shapeId
   * @returns {Promise<boolean>} true when a shape was loaded
   */
  async insertShape(shapeId) {
    const entry = findBakeableShapeLibraryEntry(shapeId);
    if (!entry) return false;

    const scene = this.getScene?.();
    if (!scene) return false;

    if (scene.currentModel) {
      const confirmed = await this._confirmReplace();
      if (!confirmed) return false;
    }

    if (this._loadPromise) {
      try {
        await this._loadPromise;
      } catch {
        /* prior failure — continue with new load */
      }
    }

    const loadTask = this._loadShapeIntoScene(scene, entry);
    this._loadPromise = loadTask;
    try {
      await loadTask;
      return true;
    } finally {
      if (this._loadPromise === loadTask) this._loadPromise = null;
    }
  }

  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   * @param {import('./shapeLibraryCatalog.js').ShapeLibraryEntry} entry
   */
  async _loadShapeIntoScene(scene, entry) {
    const label = entry.label ?? 'Library shape';

    scene.ui.setLoadSpinnerStatusPrefix?.('Loading');
    scene.ui.beginLoadSpinner();
    scene.ui.beginLoadSpinnerElapsed?.();
    scene.ui.setDropzoneVisible(false);

    try {
      await scene.ui.ensureStudioUiReady();
      await scene.ensureStudioReady();
      await scene.syncViewportSize();
      scene.startRenderLoop();

      const response = await fetch(entry.glbUrl);
      if (!response.ok) {
        throw new Error(`Could not load shape (${response.status})`);
      }
      const buffer = await response.arrayBuffer();

      const asset = await new Promise((resolve, reject) => {
        this._loader.parse(
          buffer,
          '',
          (gltf) => {
            normalizeImportScale(gltf.scene, {
              target: SHAPE_LIBRARY_TARGET_MAX_DIMENSION,
            });
            applyShapeLibraryPresentationTilt(gltf.scene);
            gltf.scene.userData.orbyShapeLibrary = true;
            gltf.scene.userData.orbyShapeLibraryId = entry.id;
            resolve({
              object: gltf.scene,
              animations: gltf.animations ?? [],
              gltfMetadata: {
                assetName: label,
                generator: 'Orby Shape Library',
                version: '1.0',
                copyright: null,
              },
            });
          },
          reject,
        );
      });

      scene.currentFile = null;
      scene.ui.updateTitle(label);
      scene.ui.updateTopBarDetail(`${label} — Idle`);

      scene.modelLifecycle.setModel(asset.object, asset.animations ?? [], {
        resetTransform: true,
        focusCamera: true,
        alignGround: true,
      });
      scene.modelLifecycle.applyAssetMetadata(asset);
      scene._fbxImportBundle = null;
      scene.isSvgExtrudeModel = false;
      scene.svgExtrudeImporter = null;
      scene.updateStatsUI(null, asset.object, asset.gltfMetadata);

      scene.ui.showToast('Shape added to scene', 3200, { notification: false });
      this.eventBus.emit('shape-library:inserted', { id: entry.id });
      scene.eventBus.emit('scene:model-load-complete', { success: true, source: 'shape-library' });
    } catch (error) {
      console.error('Shape library load failed', error);
      const msg =
        error && typeof error.message === 'string' && error.message.trim()
          ? error.message.trim()
          : 'Could not load shape';
      scene.ui.showToast(msg);
      throw error;
    } finally {
      scene.ui.endLoadSpinner?.();
    }
  }

  _confirmReplace() {
    const scene = this.getScene?.();
    return new Promise((resolve) => {
      scene?.ui?.showMessageAlert(
        'The current model will be replaced by this shape. Any unsaved work on the existing object will be lost.',
        'Replace model?',
        {
          confirm: true,
          cancelLabel: 'Keep current',
          okLabel: 'Replace',
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        },
      );
    });
  }
}
