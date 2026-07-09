import { resolveViewportGridLineWidthPx } from '../../constants.js';
import { renderGroundGridOverlay } from '../transformGizmoLayers.js';

/**
 * Screen-space grid linewidth for capture readback. Scales with export size so 2× PNG matches
 * viewport weight (LineMaterial linewidth is absolute pixels on the render target).
 * @param {number} gridLineWidth — studio slider (0.5–2.5)
 * @param {number} [exportScale=1] — export UI size multiplier (1 or 2)
 * @param {number} [studioPixelRatio=1] — render quality tier DPR (Ultra = 2)
 */
export function resolveCaptureGridLineWidthPx(
  gridLineWidth,
  exportScale = 1,
  studioPixelRatio = 1,
) {
  const scale = Math.max(0.25, Number(exportScale) || 1);
  const studio = Math.max(0.25, Number(studioPixelRatio) || 1);
  const linePx = resolveViewportGridLineWidthPx(gridLineWidth, 1, 1, studio);
  return Math.min(5, Math.max(0.5, linePx * scale));
}

/**
 * Export readback composites the grid after the post stack (same as the live viewport overlay).
 * @param {{
 *   getGroundGrid?: () => import('three').Object3D | null | undefined,
 * }} deps
 */
export function shouldCompositeGroundGridForCapture(deps) {
  const grid = deps.getGroundGrid?.();
  return grid?.visible === true;
}

/** @deprecated Use {@link shouldCompositeGroundGridForCapture} */
export function shouldCompositeAsciiGroundGridForCapture(deps) {
  return shouldCompositeGroundGridForCapture(deps);
}

/**
 * Draw ground grid on the byte readback RT (after composer copyPass). Line2 targets unsigned
 * byte buffers reliably; half-float composer RTs can drop the overlay during export.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   getGroundGrid?: () => import('three').Object3D | null | undefined,
 *   getGridLineWidth?: () => number,
 *   getStudioPixelRatio?: () => number,
 *   exportScale?: number,
 * }} deps
 * @param {import('three').WebGLRenderTarget} byteTarget
 */
export function compositeAsciiGroundGridOnByteTarget(deps, byteTarget) {
  const grid = deps.getGroundGrid?.();
  if (!grid?.visible || !byteTarget) return;

  const material = grid.material;
  const mats = material ? (Array.isArray(material) ? material : [material]) : [];
  const lineWidthPx = resolveCaptureGridLineWidthPx(
    deps.getGridLineWidth?.() ?? 1,
    deps.exportScale ?? 1,
    deps.getStudioPixelRatio?.() ?? deps.exportScale ?? 1,
  );
  const prevState = mats.map((mat) => ({
    linewidth: mat?.linewidth,
    resolution: mat?.resolution?.clone?.(),
  }));

  for (const mat of mats) {
    if (!mat) continue;
    if (mat.resolution) {
      mat.resolution.set(byteTarget.width, byteTarget.height);
    }
    mat.linewidth = lineWidthPx;
    mat.needsUpdate = true;
  }

  try {
    renderGroundGridOverlay({
      renderer: deps.renderer,
      camera: deps.camera,
      scene: deps.scene ?? null,
      grid,
      renderTarget: byteTarget,
    });
  } finally {
    for (let i = 0; i < mats.length; i += 1) {
      const mat = mats[i];
      const prev = prevState[i];
      if (!mat || !prev) continue;
      if (prev.linewidth !== undefined) mat.linewidth = prev.linewidth;
      if (prev.resolution) mat.resolution.copy(prev.resolution);
      mat.needsUpdate = true;
    }
  }
}
