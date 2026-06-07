/**
 * Owns the interactive viewport rAF loop: per-frame updates, render, post-render.
 */

/** @param {ReturnType<import('./toggleScaleAnimation.js').createToggleScaleContext>} ctx */
function toggleScaleAnimActive(ctx) {
  return ctx?.phase === 'in' || ctx?.phase === 'out';
}

/**
 * Snapshot of feature flags for one frame (avoids repeated stateStore reads per step).
 * @param {import('../SceneManager.js').SceneManager} scene
 */
function buildFrameContext(scene) {
  const state = scene.stateStore.getState();
  return {
    panelsShelfScrolling: !!scene.panelsShelfScrolling,
    histogramEnabled:
      !!state.histogramEnabled &&
      !!scene.histogramController?.enabled &&
      !scene.unlitMode,
    grainActive:
      !!state.grain?.enabled && !!scene.postPipeline?.grainTintPass?.enabled,
    creativeLookEnabled: !!scene.materialController?.creativeLookSettings?.enabled,
    /** Root always exists; pose step must run while scale-out after `enabled` flips off. */
    colorCheckerActive:
      !!scene.colorCheckerRoot || toggleScaleAnimActive(scene._ccToggleCtx),
    /** Run while mesh exists so scale-out still runs after state flips off (same frame). */
    baseAppearActive:
      !!scene.groundController?.podium ||
      toggleScaleAnimActive(scene._baseToggleCtx),
    baseGlassAppearActive:
      !!scene.groundController?.podiumReflector ||
      toggleScaleAnimActive(scene._baseGlassToggleCtx),
    backdropAppearActive:
      !!scene.groundController?.backdrop ||
      toggleScaleAnimActive(scene._backdropToggleCtx),
    diagnosticsActive: !!scene.diagnosticsController?.hasActiveDiagnostics?.(),
    wireframeOverlayActive:
      (scene.materialController?.wireframeOverlayMeshes?.length ?? 0) > 0,
    uvCheckerActive: !!scene.materialController?.uvCheckerOverlay?.enabled,
    backgroundSphereActive:
      !!scene.backgroundController?.backgroundSphere &&
      !!scene.postPipeline?.bokehPass?.enabled,
  };
}

export class RenderLoopController {
  /**
   * @param {import('../SceneManager.js').SceneManager} scene
   */
  constructor(scene) {
    this.scene = scene;
    this._running = false;
    this._frameId = 0;
    this._pausedByVisibility = false;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this._running) {
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

    /** @type {Array<{ id: string, when?: (ctx: ReturnType<typeof buildFrameContext>, scene: import('../SceneManager.js').SceneManager) => boolean, run: (delta: number, scene: import('../SceneManager.js').SceneManager) => void }>} */
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
            s.modelRoot.rotation.y += delta * s.autoRotateSpeed;
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
        id: 'background-sphere',
        when: (ctx) => ctx.backgroundSphereActive,
        run: (_delta, s) => {
          s._updateBackgroundSphere();
        },
      },
    ];

    /** @type {Array<{ id: string, when?: (ctx: ReturnType<typeof buildFrameContext>, scene: import('../SceneManager.js').SceneManager) => boolean, run: (delta: number, scene: import('../SceneManager.js').SceneManager) => void }>} */
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

  isRunning() {
    return this._running;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._scheduleFrame();
  }

  stop() {
    this._running = false;
    if (this._frameId) {
      cancelAnimationFrame(this._frameId);
      this._frameId = 0;
    }
  }

  _scheduleFrame() {
    this._frameId = requestAnimationFrame(() => this._tick());
  }

  _tick() {
    if (!this._running || !this.scene?.isStudioReady) return;
    this._scheduleFrame();

    const scene = this.scene;
    const delta = scene.clock.getDelta();
    const ctx = buildFrameContext(scene);

    for (const step of this._updateSteps) {
      if (step.when && !step.when(ctx, scene)) continue;
      step.run(delta, scene);
    }

    scene.render();

    for (const step of this._postRenderSteps) {
      if (step.when && !step.when(ctx, scene)) continue;
      step.run(delta, scene);
    }
  }
}
