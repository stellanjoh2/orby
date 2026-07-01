import * as THREE from 'three';
import { APP_BACKGROUND } from '../constants.js';
import { getViewportBackingStorePixels } from '../render/drawingBufferSize.js';
import { ensureExportCapturePixelRatio } from '../render/capture/forceExportCaptureFramebuffer.js';
import { resetRendererFullViewport } from '../render/resetRendererFullViewport.js';
import { isSketchColourCreativeLookPreset } from '../render/CreativeLookMaterials.js';
import {
  hideGroundGridForPass,
  hideTransformGizmosForPass,
  renderGroundGridOverlay,
  renderTransformGizmoOverlay,
  restoreGroundGridFromPass,
  restoreTransformGizmosFromPass,
  shouldOverlayTransformGizmos,
} from '../render/transformGizmoLayers.js';
import {
  hideWireframeOverlaysForPass,
  renderWireframeOverlay,
  restoreWireframeOverlaysFromPass,
  shouldOverlayWireframeMeshes,
} from '../render/wireframeOverlayPass.js';
import {
  hideLightIndicatorOverlaysForPass,
  renderLightIndicatorOverlay,
  restoreLightIndicatorOverlaysFromPass,
  shouldOverlayLightIndicators,
} from '../render/lightIndicatorOverlayPass.js';

/**
 * EffectComposer prep, render, and viewport/clear repair — shared by the live loop,
 * PNG export, and video capture so paths cannot drift.
 */
export class ComposerLifecycle {
  constructor({
    renderer,
    scene,
    camera,
    composer,
    postPipeline,
    backgroundController,
    getCreativeLookEnabled,
    getCreativeLookViewportBloomActive,
    getCreativeLookAsciiActive,
    getCreativeLookWatercolourActive,
    getCreativeLookSketchActive,
    getCreativeLookGouacheActive,
    getCreativeLookOpticsActive,
    getCreativeLookVectrexActive,
    getWireframeOverlayMeshes,
    getLightIndicatorOverlayGroups,
    getTransformControls,
    getGroundGrid,
    getRenderState,
    syncPostProcessingForLogicalSize,
    beforeComposerRender,
    onRestoreBloomAfterCreativeLook,
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = composer;
    this.postPipeline = postPipeline;
    this.backgroundController = backgroundController;
    this.getCreativeLookEnabled = getCreativeLookEnabled ?? (() => false);
    this.getTransformControls = getTransformControls ?? (() => []);
    this.getGroundGrid = getGroundGrid ?? (() => null);
    this.getCreativeLookViewportBloomActive =
      getCreativeLookViewportBloomActive ?? (() => false);
    this.getCreativeLookAsciiActive = getCreativeLookAsciiActive ?? (() => false);
    this.getCreativeLookWatercolourActive =
      getCreativeLookWatercolourActive ?? (() => false);
    this.getCreativeLookSketchActive =
      getCreativeLookSketchActive ?? (() => false);
    this.getCreativeLookGouacheActive =
      getCreativeLookGouacheActive ?? (() => false);
    this.getCreativeLookOpticsActive =
      getCreativeLookOpticsActive ?? (() => false);
    this.getCreativeLookVectrexActive =
      getCreativeLookVectrexActive ?? (() => false);
    this.getWireframeOverlayMeshes = getWireframeOverlayMeshes ?? (() => []);
    this.getLightIndicatorOverlayGroups =
      getLightIndicatorOverlayGroups ?? (() => []);
    this.getRenderState = getRenderState ?? (() => ({}));
    this.syncPostProcessingForLogicalSize = syncPostProcessingForLogicalSize;
    this.beforeComposerRender = beforeComposerRender;
    this.onRestoreBloomAfterCreativeLook = onRestoreBloomAfterCreativeLook;
    this._creativeBloomWasSuppressed = false;
    /** @type {Array<{ gizmo: import('three').Object3D, visible: boolean }> | null} */
    this._gizmoPassVisibility = null;
    /** @type {{ grid: import('three').Object3D, visible: boolean } | null} */
    this._gridPassVisibility = null;
    /** @type {Array<{ mesh: import('three').Mesh, visible: boolean }> | null} */
    this._wireframePassVisibility = null;
    /** @type {Array<{ root: import('three').Object3D, visible: boolean }> | null} */
    this._lightIndicatorPassVisibility = null;
  }

  /**
   * EffectComposer RTs use `logical × composer._pixelRatio`. If that drifts from
   * `renderer.getPixelRatio()` (async resize, Ultra/Medium toggle), podium blur restores the
   * viewport with `rtWidth / rendererPR` and undershoots (~¾ frame + L-shaped black bars).
   */
  ensureComposerBuffersMatchRenderer() {
    if (!this.composer?.renderTarget1) return;
    const gl = this.renderer.getContext();
    let bw;
    let bh;
    if (gl && gl.drawingBufferWidth > 0 && gl.drawingBufferHeight > 0) {
      bw = gl.drawingBufferWidth;
      bh = gl.drawingBufferHeight;
    } else {
      const db = new THREE.Vector2();
      this.renderer.getDrawingBufferSize(db);
      bw = db.x;
      bh = db.y;
    }
    const rt = this.composer.renderTarget1;
    if (Math.abs(rt.width - bw) <= 2 && Math.abs(rt.height - bh) <= 2) {
      return;
    }
    const pr = Math.max(1e-6, this.renderer.getPixelRatio());
    this.syncPostProcessingForLogicalSize?.(bw / pr, bh / pr);
  }

  /** Reset logical viewport + scissor around the post stack (passes may leave partial viewport). */
  resetRendererViewportToCanvas() {
    resetRendererFullViewport(this.renderer);
  }

  /**
   * Bloom / several ShaderPasses temporarily set clear alpha (e.g. 0). If that lingers in Three's
   * tracked clear state, the next frame's RenderPass can snapshot a bad `oldClearAlpha` and clear
   * the scene RT wrong → random black behind the HDRI. Reset before EffectComposer each frame.
   */
  syncRendererClearForSceneBackground() {
    const r = this.renderer;
    const bg = this.scene.background;
    if (bg == null) {
      const gradient = this.backgroundController?.gradientController;
      const hex = gradient?.isActive?.()
        ? gradient.getFallbackColor()
        : this.backgroundController?.getColor() ?? APP_BACKGROUND;
      r.setClearColor(new THREE.Color(hex), 1);
      r.setClearAlpha(1);
      return;
    }
    if (bg.isColor) {
      r.setClearColor(bg, 1);
      r.setClearAlpha(1);
      return;
    }
    r.setClearColor(0x000000, 1);
    r.setClearAlpha(1);
  }

  /**
   * UnrealBloomPass on the full grading stack caused black bands — disable it while Shader Lab is on.
   * Viewport bloom uses the same UnrealBloomPass in a slim stack via pushCreativeLookViewportPresentation.
   */
  applyCreativeLookBloomSuppression() {
    const creativeLookOn = this.getCreativeLookEnabled() === true;

    if (creativeLookOn && this.postPipeline) {
      if (this.postPipeline.bloomPass) this.postPipeline.bloomPass.enabled = false;
      if (this.postPipeline.bloomTintPass) this.postPipeline.bloomTintPass.enabled = false;
      if (this.postPipeline.anamorphicBloomPass) {
        this.postPipeline.anamorphicBloomPass.enabled = false;
      }
      this._creativeBloomWasSuppressed = true;
    } else if (this._creativeBloomWasSuppressed) {
      this._creativeBloomWasSuppressed = false;
      this.onRestoreBloomAfterCreativeLook?.();
    }
  }

  /**
   * Shared composer render — live viewport, PNG export, and video capture use the same pass
   * sequence so Shader Lab viewport bloom cannot drift from export.
   * @param {{ transparent?: boolean, beforeRender?: () => void, overlayTransformGizmos?: boolean, overlayLightIndicators?: boolean }} [opts]
   */
  _runComposerWithCreativeLookPrep({
    transparent = false,
    beforeRender,
    overlayTransformGizmos = false,
    overlayLightIndicators = false,
  } = {}) {
    if (!this.composer) return;
    beforeRender?.();
    const viewportBloom = this.getCreativeLookViewportBloomActive() === true;
    const asciiTerminal = this.getCreativeLookAsciiActive() === true;
    const watercolour = this.getCreativeLookWatercolourActive() === true;
    const sketch = this.getCreativeLookSketchActive() === true;
    const gouache = this.getCreativeLookGouacheActive() === true;
    const optics = this.getCreativeLookOpticsActive() === true;
    const vectrex = this.getCreativeLookVectrexActive() === true;
    if (!watercolour) {
      this.postPipeline?.releaseCreativeLookWatercolour?.();
    }
    if (!sketch) {
      this.postPipeline?.releaseCreativeLookSketch?.();
    }
    if (!gouache) {
      this.postPipeline?.releaseCreativeLookGouache?.();
    }
    if (!optics) {
      this.postPipeline?.releaseCreativeLookOptics?.();
    }
    if (!vectrex) {
      this.postPipeline?.releaseCreativeLookVectrex?.();
    } else {
      this.applyCreativeLookBloomSuppression();
    }
    const shaderLabOn = this.getCreativeLookEnabled() === true;
    const overlayGizmos =
      overlayTransformGizmos &&
      shouldOverlayTransformGizmos(this.postPipeline, shaderLabOn);
    const wireframeMeshes = this.getWireframeOverlayMeshes?.() ?? [];
    const overlayWireframe =
      wireframeMeshes.length > 0 &&
      shouldOverlayWireframeMeshes(this.postPipeline, shaderLabOn);
    const lightIndicatorRoots = this.getLightIndicatorOverlayGroups?.() ?? [];
    const overlayLights =
      overlayLightIndicators &&
      lightIndicatorRoots.length > 0 &&
      shouldOverlayLightIndicators(this.postPipeline, shaderLabOn);
    if (overlayGizmos) {
      this._gizmoPassVisibility = hideTransformGizmosForPass(
        this.getTransformControls?.() ?? [],
      );
    }
    if (overlayWireframe) {
      this._wireframePassVisibility = hideWireframeOverlaysForPass(wireframeMeshes);
    }
    if (overlayLights) {
      this._lightIndicatorPassVisibility =
        hideLightIndicatorOverlaysForPass(lightIndicatorRoots);
    }
    const grid = this.getGroundGrid?.();
    const overlayGrid = asciiTerminal && grid?.visible === true;
    if (overlayGrid) {
      this._gridPassVisibility = hideGroundGridForPass(grid);
    }
    if (watercolour) {
      if (viewportBloom) {
        this.postPipeline?.prepareCreativeLookViewportPresentation?.();
      }
      this.postPipeline?.pushCreativeLookWatercolourPresentation?.({ viewportBloom });
    } else if (gouache) {
      if (viewportBloom) {
        this.postPipeline?.prepareCreativeLookViewportPresentation?.();
      }
      this.postPipeline?.pushCreativeLookGouachePresentation?.({ viewportBloom });
    } else if (optics) {
      if (viewportBloom) {
        this.postPipeline?.prepareCreativeLookViewportPresentation?.();
      }
      this.postPipeline?.pushCreativeLookOpticsPresentation?.({ viewportBloom });
    } else if (sketch) {
      if (viewportBloom) {
        this.postPipeline?.prepareCreativeLookViewportPresentation?.();
      }
      const state = this.getRenderState();
      const passKey = isSketchColourCreativeLookPreset(state?.creativeLook?.preset)
        ? 'creativeLookSketchColourPass'
        : 'creativeLookSketchPass';
      this.postPipeline?.pushCreativeLookSketchPresentation?.({ viewportBloom, passKey });
    } else if (vectrex) {
      if (viewportBloom) {
        this.postPipeline?.prepareCreativeLookViewportPresentation?.();
      }
      this.postPipeline?.pushCreativeLookVectrexPresentation?.({ viewportBloom });
    } else if (viewportBloom) {
      this.postPipeline?.prepareCreativeLookViewportPresentation?.();
      this.postPipeline?.pushCreativeLookViewportPresentation?.();
    } else if (asciiTerminal) {
      this.postPipeline?.prepareCreativeLookAsciiPresentation?.(this.getRenderState());
      this.postPipeline?.pushCreativeLookAsciiPresentation?.();
    } else {
      this.applyCreativeLookBloomSuppression();
    }
    try {
      this.ensureComposerBuffersMatchRenderer();
      const gradient = this.backgroundController?.gradientController;
      const captureBlit = gradient?.shouldBlitForCapture?.() === true;
      if (captureBlit) {
        ensureExportCapturePixelRatio({
          renderer: this.renderer,
          composer: this.composer,
        });
        gradient.pinCaptureViewport(this.renderer);
      } else {
        if (this.composer?.renderToScreen !== false) {
          this.composer?.clearExportCaptureViewportPin?.();
        }
        this.resetRendererViewportToCanvas();
      }
      if (!transparent) {
        if (captureBlit) {
          const { width: cw, height: ch } = gradient.getCapturePixelSize();
          gradient.syncToDrawingBuffer(cw, ch, { forceRedraw: true });
        } else {
          const db = getViewportBackingStorePixels(this.renderer);
          gradient?.syncToDrawingBuffer?.(db.width, db.height, { forceRedraw: true });
          gradient?.applyIfActive?.();
        }
        this.syncRendererClearForSceneBackground();
      }
      this.composer.render();
      if (overlayGizmos) {
        restoreTransformGizmosFromPass(this._gizmoPassVisibility);
        this._gizmoPassVisibility = null;
        this._renderTransformGizmoOverlay();
      }
      if (this._gridPassVisibility) {
        restoreGroundGridFromPass(this._gridPassVisibility);
        this._gridPassVisibility = null;
        this._renderGroundGridOverlay();
      }
      if (this._wireframePassVisibility) {
        restoreWireframeOverlaysFromPass(this._wireframePassVisibility);
        this._wireframePassVisibility = null;
        this._renderWireframeOverlay();
      }
      if (this._lightIndicatorPassVisibility) {
        restoreLightIndicatorOverlaysFromPass(this._lightIndicatorPassVisibility);
        this._lightIndicatorPassVisibility = null;
        this._renderLightIndicatorOverlay();
      }
    } finally {
      if (this._gizmoPassVisibility) {
        restoreTransformGizmosFromPass(this._gizmoPassVisibility);
        this._gizmoPassVisibility = null;
      }
      if (this._gridPassVisibility) {
        restoreGroundGridFromPass(this._gridPassVisibility);
        this._gridPassVisibility = null;
      }
      if (this._wireframePassVisibility) {
        restoreWireframeOverlaysFromPass(this._wireframePassVisibility);
        this._wireframePassVisibility = null;
      }
      if (this._lightIndicatorPassVisibility) {
        restoreLightIndicatorOverlaysFromPass(this._lightIndicatorPassVisibility);
        this._lightIndicatorPassVisibility = null;
      }
      if (watercolour) {
        this.postPipeline?.popCreativeLookWatercolourPresentation?.();
      } else if (gouache) {
        this.postPipeline?.popCreativeLookGouachePresentation?.();
      } else if (optics) {
        this.postPipeline?.popCreativeLookOpticsPresentation?.();
      } else if (sketch) {
        this.postPipeline?.popCreativeLookSketchPresentation?.();
      } else if (vectrex) {
        this.postPipeline?.popCreativeLookVectrexPresentation?.();
      } else if (viewportBloom) {
        this.postPipeline?.popCreativeLookViewportPresentation?.();
      } else if (asciiTerminal) {
        this.postPipeline?.popCreativeLookAsciiPresentation?.();
      } else {
        this.postPipeline?.releaseCreativeLookWatercolour?.();
        this.postPipeline?.releaseCreativeLookGouache?.();
        this.postPipeline?.releaseCreativeLookOptics?.();
        this.postPipeline?.releaseCreativeLookSketch?.();
        this.postPipeline?.releaseCreativeLookVectrex?.();
      }
      const gradient = this.backgroundController?.gradientController;
      // Offline capture keeps gradient pinned until readback / session restore (renderToScreen false).
      if (
        gradient?.shouldBlitForCapture?.()
        && this.composer?.renderToScreen !== false
      ) {
        gradient.restoreAfterCapture();
      }
      this.resetRendererViewportToCanvas();
      // Transparent PNG/video export reads alpha from a direct scene pass after this —
      // leaving clearAlpha at 0 avoids an opaque black backdrop in the mask buffer.
      if (!transparent && typeof this.renderer?.setClearAlpha === 'function') {
        this.renderer.setClearAlpha(1);
      }
    }
  }

  /** Crisp transform widgets on top of post stack (Shader Lab, DOF, etc.). */
  _renderTransformGizmoOverlay() {
    renderTransformGizmoOverlay({
      renderer: this.renderer,
      camera: this.camera,
      gizmos: this.getTransformControls?.() ?? [],
    });
  }

  /** Ground grid on top of ASCII terminal post — normal line art, not glyphs. */
  _renderGroundGridOverlay() {
    // Offline capture composites grid on the byte readback RT (captureReadback.js).
    if (this.composer?.renderToScreen === false) return;
    renderGroundGridOverlay({
      renderer: this.renderer,
      camera: this.camera,
      grid: this.getGroundGrid?.(),
      renderTarget: null,
    });
  }

  /** Wireframe on top of post stack — crisp lines, not DoF blur or Shader Lab stylization. */
  _renderWireframeOverlay() {
    renderWireframeOverlay({
      renderer: this.renderer,
      camera: this.camera,
      wireframeMeshes: this.getWireframeOverlayMeshes?.() ?? [],
    });
  }

  /** Spotlight cones and beam guides on top of post — not Shader Lab pixel looks or DoF blur. */
  _renderLightIndicatorOverlay() {
    renderLightIndicatorOverlay({
      renderer: this.renderer,
      camera: this.camera,
      roots: this.getLightIndicatorOverlayGroups?.() ?? [],
    });
  }

  /** Interactive viewport — same EffectComposer sequence as PNG/video export. */
  renderComposerPass() {
    this._runComposerWithCreativeLookPrep({
      beforeRender: () => this.beforeComposerRender?.(),
      overlayTransformGizmos: true,
      overlayLightIndicators: true,
    });
  }

  /**
   * Creative look + clear only (video capture prep; buffers/viewport handled separately).
   */
  prepareComposerCapture() {
    this.applyCreativeLookBloomSuppression();
    this.syncRendererClearForSceneBackground();
  }

  /**
   * PNG export — same pass sequence as the live loop; resets viewport before and after render
   * so passes that shrink the GL viewport (bloom, N8AO, podium blur) cannot leave dead edge pixels.
   * @param {{ transparent?: boolean }} [opts] — skip opaque background clear when exporting alpha.
   */
  renderComposerPassForExport({ transparent = false } = {}) {
    this._runComposerWithCreativeLookPrep({
      transparent,
      beforeRender: () => this.beforeComposerRender?.(),
    });
  }

  /**
   * Video preview frames — buffer + viewport only (no bloom/clear prep).
   */
  renderVideoPreviewPass() {
    if (!this.composer) return;
    this.ensureComposerBuffersMatchRenderer();
    this.resetRendererViewportToCanvas();
    this.composer.render();
    this.resetRendererViewportToCanvas();
  }

  /**
   * Video PNG capture — buffers, viewport, capture prep; caller runs `composer.render()`.
   */
  prepareVideoCapturePass() {
    this.ensureComposerBuffersMatchRenderer();
    this.resetRendererViewportToCanvas();
    this.prepareComposerCapture();
  }
}
