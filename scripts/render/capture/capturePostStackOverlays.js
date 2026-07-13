import { resolveViewportGridLineWidthPx } from '../../constants.js';
import { renderGroundGridOverlay } from '../transformGizmoLayers.js';

/**
 * Screen-space grid linewidth for capture readback. Matches GroundController._syncGridLineMaterial
 * (preview DPR + HiDPI min-width rule), then scales by export UI multiplier so 2× PNG keeps the
 * same visual weight on the larger render target.
 * @param {number} gridLineWidth — studio slider (0.5–2.5)
 * @param {number} [exportScale=1] — export UI size multiplier (1 or 2)
 * @param {number} [studioPixelRatio=1] — render quality tier DPR (Ultra = 2)
 * @param {number} [previewPixelRatio=1] — interactive viewport DPR before export resize
 * @param {number} [displayPixelRatio=previewPixelRatio] — window.devicePixelRatio
 */
export function resolveCaptureGridLineWidthPx(
  gridLineWidth,
  exportScale = 1,
  studioPixelRatio = 1,
  previewPixelRatio = 1,
  displayPixelRatio = previewPixelRatio,
) {
  const scale = Math.max(0.25, Number(exportScale) || 1);
  const studio = Math.max(0.25, Number(studioPixelRatio) || 1);
  const preview = Math.max(0.25, Number(previewPixelRatio) || 1);
  const display = Math.max(preview, Number(displayPixelRatio) || preview);
  const linePx = resolveViewportGridLineWidthPx(
    gridLineWidth,
    preview,
    display,
    studio,
  );
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
 *   scene?: import('three').Scene | null,
 *   getGroundGrid?: () => import('three').Object3D | null | undefined,
 *   getGridLineWidth?: () => number,
 *   getGroundWireColor?: () => string | undefined,
 *   getGroundWireOpacity?: () => number | undefined,
 *   getStudioPixelRatio?: () => number,
 *   getPreviewPixelRatio?: () => number,
 *   getDisplayPixelRatio?: () => number,
 *   exportScale?: number,
 * }} deps
 * @param {import('three').WebGLRenderTarget} byteTarget
 */
export function compositeAsciiGroundGridOnByteTarget(deps, byteTarget) {
  const grid = deps.getGroundGrid?.();
  if (!grid?.visible || !byteTarget) return;

  const material = grid.material;
  const mats = material ? (Array.isArray(material) ? material : [material]) : [];
  const previewDpr = deps.getPreviewPixelRatio?.() ?? 1;
  const displayDpr = deps.getDisplayPixelRatio?.() ?? previewDpr;
  const studioDpr = deps.getStudioPixelRatio?.() ?? previewDpr;
  const wireColor = deps.getGroundWireColor?.();
  const wireOpacity = deps.getGroundWireOpacity?.();
  const lineWidthPx = resolveCaptureGridLineWidthPx(
    deps.getGridLineWidth?.() ?? 1,
    deps.exportScale ?? 1,
    studioDpr,
    previewDpr,
    displayDpr,
  );
  const prevState = mats.map((mat) => ({
    linewidth: mat?.linewidth,
    resolution: mat?.resolution?.clone?.(),
    color: mat?.color?.clone?.(),
    opacity: mat?.opacity,
    transparent: mat?.transparent,
    depthWrite: mat?.depthWrite,
  }));

  for (const mat of mats) {
    if (!mat) continue;
    if (mat.resolution) {
      mat.resolution.set(byteTarget.width, byteTarget.height);
    }
    mat.linewidth = lineWidthPx;
    if (wireColor && mat.color) {
      mat.color.set(wireColor);
    }
    if (wireOpacity !== undefined) {
      const opaque = wireOpacity >= 1;
      mat.opacity = wireOpacity;
      mat.transparent = !opaque;
      mat.depthWrite = opaque;
    }
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
      if (prev.color && mat.color) mat.color.copy(prev.color);
      if (prev.opacity !== undefined) mat.opacity = prev.opacity;
      if (prev.transparent !== undefined) mat.transparent = prev.transparent;
      if (prev.depthWrite !== undefined) mat.depthWrite = prev.depthWrite;
      mat.needsUpdate = true;
    }
  }
}
