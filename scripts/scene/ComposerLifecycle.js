import * as THREE from 'three';
import { fullViewportLogicalSize } from '../render/fullViewportLogicalSize.js';

/**
 * EffectComposer prep, render, and viewport/clear repair — shared by the live loop,
 * PNG export, and video capture so paths cannot drift.
 */
export class ComposerLifecycle {
  constructor({
    renderer,
    scene,
    composer,
    postPipeline,
    backgroundController,
    getCreativeLookEnabled,
    getCreativeLookViewportBloomActive,
    syncPostProcessingForLogicalSize,
    beforeComposerRender,
    onRestoreBloomAfterCreativeLook,
  }) {
    this.renderer = renderer;
    this.scene = scene;
    this.composer = composer;
    this.postPipeline = postPipeline;
    this.backgroundController = backgroundController;
    this.getCreativeLookEnabled = getCreativeLookEnabled ?? (() => false);
    this.getCreativeLookViewportBloomActive =
      getCreativeLookViewportBloomActive ?? (() => false);
    this.syncPostProcessingForLogicalSize = syncPostProcessingForLogicalSize;
    this.beforeComposerRender = beforeComposerRender;
    this.onRestoreBloomAfterCreativeLook = onRestoreBloomAfterCreativeLook;
    this._creativeBloomWasSuppressed = false;
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
    const logical = fullViewportLogicalSize(this.renderer);
    this.syncPostProcessingForLogicalSize?.(logical.x, logical.y);
  }

  /** Reset logical viewport + scissor around the post stack (passes may leave partial viewport). */
  resetRendererViewportToCanvas() {
    const r = this.renderer;
    const v = fullViewportLogicalSize(r);
    r.setViewport(0, 0, v.x, v.y);
    if (typeof r.setScissorTest === 'function') {
      r.setScissorTest(false);
    }
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
        : this.backgroundController?.getColor() ?? '#080808';
      r.setClearColor(new THREE.Color(hex), 1);
      return;
    }
    if (bg.isColor) {
      r.setClearColor(bg, 1);
      return;
    }
    r.setClearColor(0x000000, 1);
  }

  /**
   * UnrealBloomPass on Shader Lab caused black bands — disable it while Shader Lab is on.
   * Viewport bloom uses {@link CreativeLookViewportBloom} via pushCreativeLookViewportPresentation.
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
   * Interactive viewport + PNG export — identical EffectComposer sequence.
   */
  renderComposerPass() {
    if (!this.composer) return;
    this.beforeComposerRender?.();
    const viewportBloom = this.getCreativeLookViewportBloomActive() === true;
    if (viewportBloom) {
      this.postPipeline?.pushCreativeLookViewportPresentation?.();
    } else {
      this.applyCreativeLookBloomSuppression();
    }
    this.ensureComposerBuffersMatchRenderer();
    this.resetRendererViewportToCanvas();
    this.syncRendererClearForSceneBackground();
    this.composer.render();
    if (viewportBloom) {
      this.postPipeline?.popCreativeLookViewportPresentation?.();
    }
    this.resetRendererViewportToCanvas();
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
    if (!this.composer) return;
    this.applyCreativeLookBloomSuppression();
    this.ensureComposerBuffersMatchRenderer();
    this.resetRendererViewportToCanvas();
    if (!transparent) {
      this.syncRendererClearForSceneBackground();
    }
    this.composer.render();
    this.resetRendererViewportToCanvas();
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
