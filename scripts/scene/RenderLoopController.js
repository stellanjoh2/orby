/**
 * Owns the interactive viewport rAF loop: per-frame updates, render, post-render.
 * Pauses between frames when the scene is static to save CPU/GPU; wakes on orbit,
 * state changes, and other motion sources.
 */

import { dofNeedsLiveUpdate } from '../constants.js';
import {
  buildRenderLoopFrameContext,
  needsContinuousFrames,
} from './renderLoopIdle.js';

const HISTOGRAM_IDLE_WAKE_MS = 300;

export class RenderLoopController {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** Studio loop armed (startRenderLoop); distinct from whether a frame is scheduled. */
    this._active = false;
    this._frameId = 0;
    this._pausedByVisibility = false;
    this._wakeSourcesAttached = false;
    this._histogramWakeTimer = 0;
    this._stateStoreUnsub = null;
    this._inTick = false;
    this._queuedWake = false;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this._active || this._frameId) {
            this._pausedByVisibility = true;
            this.stop();
          }
          return;
        }
        if (this._pausedByVisibility && this.scene?.isStudioReady) {
          this._pausedByVisibility = false;
          this.start();
        }
      });
    }

    /** @type {Array<{ id: string, when?: (ctx: ReturnType<typeof buildRenderLoopFrameContext>, scene: import('../SceneManager.js').SceneManager) => boolean, run: (delta: number, scene: import('../SceneManager.js').SceneManager) => void }>} */
    this._updateSteps = [
      {
        id: 'export-movement-preview',
        when: (_ctx, s) => !!s.exportMovementPreview?.isActive?.(),
        run: (delta, s) => {
          s.exportMovementPreview.update(delta);
        },
      },
      {
        id: 'animation',
        when: (_ctx, s) => !s.animationController?.isExportSessionActive?.(),
        run: (delta, s) => {
          s.animationController.update(delta);
        },
      },
      {
        id: 'hdri-shadow-receiver',
        when: (_ctx, s) =>
          !!s.backgroundController?.hdriShadowReceiver?.shouldTrackModelEachFrame?.(),
        run: (_delta, s) => {
          s._updateHdriShadowReceiverContact();
        },
      },
      {
        id: 'mesh-auto-rotate',
        run: (delta, s) => {
          if (s.autoRotateSpeed && s.currentModel) {
            const sign = s.autoRotateDirection === 'reverse' ? -1 : 1;
            s.modelRoot.rotation.y += delta * s.autoRotateSpeed * sign;
          }
        },
      },
      {
        id: 'lights-auto-rotate',
        run: (delta, s) => {
          if (!s.lightsAutoRotate) return;
          const deltaDegrees = s.lightsAutoRotateSpeed * delta;
          // Skip StateStore updates during auto-rotate; synced when auto-rotate stops.
          s.setLightsRotation(s.lightsRotation + deltaDegrees, { updateState: false });
        },
      },
      {
        id: 'camera',
        run: (delta, s) => {
          s.cameraController.update();
          if (s.cameraAutoOrbit !== 'off' && !s.exportMovementPreview?.isActive?.()) {
            s.cameraController.updateAutoOrbit(delta);
          }
          s.cameraController.applyHandheldMotion(delta);
        },
      },
      {
        id: 'dof-autofocus',
        when: (_ctx, s) => dofNeedsLiveUpdate(s.stateStore.peekState().dof),
        run: (delta, s) => {
          s.dofAutofocus?.tick(delta);
          s.updateDof(s.stateStore.peekState().dof);
        },
      },
      {
        id: 'dof-focus-plane',
        when: (_ctx, s) => !!s.stateStore.peekState().dof?.showFocusPlane,
        run: (_delta, s) => {
          s.updateDofFocusPlaneTransform();
        },
      },
      {
        id: 'creative-look-time',
        when: (ctx) => ctx.creativeLookEnabled,
        run: (_delta, s) => {
          s.materialController.updateCreativeLookTime(s.clock.elapsedTime);
        },
      },
      {
        id: 'color-checker-pose',
        when: (ctx) => ctx.colorCheckerActive,
        run: (_delta, s) => {
          s._updateColorCheckerPose();
        },
      },
      {
        id: 'base-appear',
        when: (ctx) => ctx.baseAppearActive,
        run: (_delta, s) => {
          s._updateBaseAppearAnimation();
        },
      },
      {
        id: 'base-glass-appear',
        when: (ctx) => ctx.baseGlassAppearActive,
        run: (_delta, s) => {
          s._updateBaseGlassAppearAnimation();
        },
      },
      {
        id: 'backdrop-appear',
        when: (ctx) => ctx.backdropAppearActive,
        run: (_delta, s) => {
          s._updateBackdropAppearAnimation();
        },
      },
      {
        id: 'font-text-reveal',
        when: (_ctx, s) => s.fontTextRevealController?.shouldRunLiveUpdate?.(s),
        run: (delta, s) => {
          s.fontTextRevealController.update(delta);
        },
      },
      {
        id: 'font-text-constant',
        when: (_ctx, s) => s.fontTextConstantController?.shouldRunLiveUpdate?.(s),
        run: (delta, s) => {
          s.fontTextConstantController.update(delta);
        },
      },
      {
        id: 'diagnostics',
        when: (ctx) => ctx.diagnosticsActive,
        run: (delta, s) => {
          s.diagnosticsController.update(delta);
        },
      },
      {
        id: 'joint-name-labels',
        when: (_ctx, s) => !!s.jointNameLabelsController?.shouldUpdate?.(),
        run: (_delta, s) => {
          s.jointNameLabelsController.update();
        },
      },
      {
        id: 'grain-time',
        when: (ctx) => !ctx.panelsShelfScrolling && ctx.grainActive,
        run: (delta, s) => {
          s.postPipeline?.updateGrainTime(delta);
        },
      },
      {
        id: 'wireframe-overlay',
        when: (ctx) => ctx.wireframeOverlayActive,
        run: (_delta, s) => {
          s.updateWireframeOverlayTransforms();
        },
      },
      {
        id: 'uv-checker-overlay',
        when: (ctx) => ctx.uvCheckerActive,
        run: (_delta, s) => {
          s.updateUvCheckerOverlayTransforms();
        },
      },
      {
        id: 'normal-view-overlay',
        when: (ctx) => ctx.normalViewActive,
        run: (_delta, s) => {
          s.updateNormalViewOverlayTransforms();
        },
      },
      {
        id: 'topology-warnings-overlay',
        when: (ctx) => ctx.topologyWarningsActive,
        run: (_delta, s) => {
          s.updateTopologyWarningsOverlayTransforms();
        },
      },
      {
        id: 'background-sphere',
        when: (ctx) => ctx.backgroundSphereActive,
        run: (_delta, s) => {
          s._updateBackgroundSphere();
        },
      },
    ];

    /** @type {Array<{ id: string, when?: (ctx: ReturnType<typeof buildRenderLoopFrameContext>, scene: import('../SceneManager.js').SceneManager) => boolean, run: (delta: number, scene: import('../SceneManager.js').SceneManager) => void }>} */
    this._postRenderSteps = [
      {
        id: 'histogram',
        when: (ctx) => ctx.histogramEnabled && !ctx.panelsShelfScrolling,
        run: (_delta, s) => {
          s.histogramController.update();
        },
      },
    ];
  }

  /** True while a frame is scheduled or in flight (export pause/resume). */
  isRunning() {
    return this._active && this._frameId !== 0;
  }

  /** True after `startRenderLoop` until `stop` (export, visibility, teardown). */
  isLoopActive() {
    return this._active;
  }

  start() {
    this._active = true;
    this.attachWakeSources();
    this.requestFrame();
  }

  stop() {
    this._active = false;
    this._clearHistogramWake();
    this._cancelFrame();
  }

  /** Schedule at least one frame while the studio loop is armed. */
  requestFrame() {
    if (!this._active || !this.scene?.isStudioReady) return;
    if (this._inTick) {
      this._queuedWake = true;
      return;
    }
    this._clearHistogramWake();
    this._scheduleFrameIfNeeded();
  }

  attachWakeSources() {
    if (this._wakeSourcesAttached) return;
    this._wakeSourcesAttached = true;

    const wake = () => this.requestFrame();

    const controls = this.scene.cameraController?.getControls?.();
    controls?.addEventListener('start', wake);
    controls?.addEventListener('change', wake);

    for (const transformControl of [
      this.scene.transformControlsTranslate,
      this.scene.transformControlsRotate,
      this.scene.transformControlsScale,
    ]) {
      transformControl?.addEventListener('change', wake);
      transformControl?.addEventListener('dragging-changed', (event) => {
        if (event.value) wake();
      });
    }

    this._stateStoreUnsub = this.scene.stateStore?.subscribe?.(() => wake());
  }

  detachWakeSources() {
    this._stateStoreUnsub?.();
    this._stateStoreUnsub = null;
    this._wakeSourcesAttached = false;
  }

  _scheduleFrameIfNeeded() {
    if (this._frameId || !this._active || !this.scene?.isStudioReady) return;
    // Drop stale delta accumulated while idle so motion/easing stays seamless.
    this.scene.clock?.getDelta();
    this._frameId = requestAnimationFrame(() => this._tick());
  }

  _cancelFrame() {
    if (!this._frameId) return;
    cancelAnimationFrame(this._frameId);
    this._frameId = 0;
  }

  _clearHistogramWake() {
    if (!this._histogramWakeTimer) return;
    clearTimeout(this._histogramWakeTimer);
    this._histogramWakeTimer = 0;
  }

  _scheduleHistogramIdleWake() {
    this._clearHistogramWake();
    this._histogramWakeTimer = setTimeout(() => {
      this._histogramWakeTimer = 0;
      if (this._active && !this._frameId) {
        this.requestFrame();
      }
    }, HISTOGRAM_IDLE_WAKE_MS);
  }

  _shouldContinue(ctx) {
    if (needsContinuousFrames(this.scene, ctx)) return true;
    if (ctx.histogramEnabled && !ctx.panelsShelfScrolling) {
      this._scheduleHistogramIdleWake();
    }
    return false;
  }

  _tick() {
    if (!this._active || !this.scene?.isStudioReady) {
      this._frameId = 0;
      return;
    }

    this._frameId = 0;
    this._inTick = true;

    const scene = this.scene;
    const delta = scene.clock.getDelta();
    const ctx = buildRenderLoopFrameContext(scene);

    for (const step of this._updateSteps) {
      if (step.when && !step.when(ctx, scene)) continue;
      step.run(delta, scene);
    }

    scene.render();

    for (const step of this._postRenderSteps) {
      if (step.when && !step.when(ctx, scene)) continue;
      step.run(delta, scene);
    }

    this._inTick = false;

    if (
      this._active
      && (this._queuedWake || this._shouldContinue(ctx))
    ) {
      this._queuedWake = false;
      this._scheduleFrameIfNeeded();
    }
  }
}
