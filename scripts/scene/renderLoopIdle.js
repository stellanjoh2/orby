/**
 * Idle-render helpers for {@link RenderLoopController}.
 * Keeps the rAF loop alive only while motion, damping, or time-based effects need frames.
 */

import { dofNeedsLiveUpdate } from '../constants.js';

/** @param {ReturnType<import('./toggleScaleAnimation.js').createToggleScaleContext>} ctx */
export function toggleScaleAnimActive(ctx) {
  return ctx?.phase === 'in' || ctx?.phase === 'out';
}

/**
 * OrbitControls still needs frames while the user drags or damping settles.
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null | undefined} controls
 */
export function orbitControlsNeedFrame(controls) {
  if (!controls?.enabled) return false;
  // three@0.167 OrbitControls: STATE.NONE === -1
  if (typeof controls.state === 'number' && controls.state !== -1) return true;
  const sd = controls.sphericalDelta;
  if (sd) {
    if (Math.abs(sd.theta) > 1e-6 || Math.abs(sd.phi) > 1e-6 || Math.abs(sd.radius) > 1e-6) {
      return true;
    }
  }
  const po = controls.panOffset;
  if (po && po.lengthSq() > 1e-12) return true;
  return false;
}

/**
 * @param {import('../SceneManager.js').SceneManager} scene
 * @param {ReturnType<typeof buildRenderLoopFrameContext>} ctx
 */
export function needsContinuousFrames(scene, ctx) {
  const state = scene.stateStore.peekState();

  if (scene.exportMovementPreview?.isActive?.()) return true;

  const action = scene.animationController?.currentAction;
  if (action && !action.paused && action.isRunning?.()) return true;

  if (scene.backgroundController?.hdriShadowReceiver?.shouldTrackModelEachFrame?.()) {
    return true;
  }

  if (scene.autoRotateSpeed && scene.currentModel) return true;
  if (scene.lightsAutoRotate) return true;
  if (
    scene.cameraAutoOrbit !== 'off'
    && !scene.exportMovementPreview?.isActive?.()
  ) {
    return true;
  }
  if (scene.cameraController?.handheldMode !== 'off') return true;
  if (scene.cameraController?.isFocusAnimating?.()) return true;
  if (scene.cameraController?.hasViewportInteraction?.()) return true;

  if (dofNeedsLiveUpdate(state.dof)) return true;

  if (ctx.creativeLookEnabled) return true;
  if (ctx.grainActive && !ctx.panelsShelfScrolling) return true;

  if (toggleScaleAnimActive(scene._ccToggleCtx)) return true;
  if (toggleScaleAnimActive(scene._baseToggleCtx)) return true;
  if (toggleScaleAnimActive(scene._baseGlassToggleCtx)) return true;
  if (toggleScaleAnimActive(scene._backdropToggleCtx)) return true;

  if (scene.fontTextRevealController?.shouldRunLiveUpdate?.(scene)) return true;
  if (scene.fontTextConstantController?.shouldRunLiveUpdate?.(scene)) return true;

  if (state.autoExposure || state.lensDirt?.enabled) return true;

  if (scene._gizmoDragActive) return true;

  if (scene.ui?.helpers?.isViewportScrubActive?.()) return true;

  return orbitControlsNeedFrame(scene.cameraController?.getControls?.());
}

/**
 * Snapshot of feature flags for one frame (avoids repeated stateStore reads per step).
 * @param {import('../SceneManager.js').SceneManager} scene
 */
export function buildRenderLoopFrameContext(scene) {
  const state = scene.stateStore.peekState();
  return {
    panelsShelfScrolling: !!scene.panelsShelfScrolling,
    histogramEnabled:
      !!state.histogramEnabled &&
      !!scene.histogramController?.enabled &&
      !scene.unlitMode,
    grainActive:
      !!state.grain?.enabled && !!scene.postPipeline?.grainTintPass?.enabled,
    creativeLookEnabled: !!scene.materialController?.creativeLookSettings?.enabled,
    colorCheckerActive:
      !!scene.colorCheckerRoot || toggleScaleAnimActive(scene._ccToggleCtx),
    baseAppearActive:
      !!scene.groundController?.podiumRoot ||
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
    normalViewActive: !!scene.materialController?.normalViewOverlay?.enabled,
    topologyWarningsActive: !!scene.topologyWarningsOverlay?.enabled,
    backgroundSphereActive:
      !!scene.backgroundController?.backgroundSphere &&
      !!scene.postPipeline?.bokehPass?.enabled,
  };
}
