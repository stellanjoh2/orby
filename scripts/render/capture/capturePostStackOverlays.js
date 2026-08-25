import * as THREE from 'three';
import { resolveViewportGridLineWidthPx, resolveViewportWireframeLineWidthPx, DEFAULT_WIREFRAME_LINE_WIDTH } from '../../constants.js';
import { renderGroundGridOverlay } from '../transformGizmoLayers.js';
import {
  renderWireframeOverlay,
  shouldOverlayWireframeMeshes,
  wireframeMeshesWantDepthTest,
  wireframeOverlayIsXRay,
} from '../wireframeOverlayPass.js';

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
 * Studio ground grid is a viewport helper — never bake it into PNG/JPEG/video export.
 * @param {{
 *   getGroundGrid?: () => import('three').Object3D | null | undefined,
 * }} [_deps]
 */
export function shouldCompositeGroundGridForCapture(_deps) {
  return false;
}

/** @deprecated Use {@link shouldCompositeGroundGridForCapture} */
export function shouldCompositeAsciiGroundGridForCapture(deps) {
  return shouldCompositeGroundGridForCapture(deps);
}

/**
 * Export readback composites wireframe after the post stack (same as the live viewport overlay).
 * @param {{
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 * }} deps
 */
export function shouldCompositeWireframeForCapture(deps) {
  return shouldOverlayWireframeMeshes(deps.getWireframeOverlayMeshes?.());
}

/**
 * Byte readback RT needs a depth buffer when visible-faces wireframe will depth-test.
 * @param {{
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 * }} deps
 */
export function captureByteTargetNeedsDepthBuffer(deps) {
  return wireframeMeshesWantDepthTest(deps.getWireframeOverlayMeshes?.());
}

/**
 * Copy composer output to an unsigned-byte RT, then composite post-stack wireframe.
 * Line2 overlays do not survive half-float composer targets — this is the export path
 * that matches the live viewport overlay. Caller must dispose the returned target.
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   composer: import('three/examples/jsm/postprocessing/EffectComposer.js').EffectComposer,
 *   camera?: import('three').Camera,
 *   scene?: import('three').Scene | null,
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 *   getWireframeThickness?: () => number,
 *   getExportViewportReference?: () => object | null,
 *   getStudioPixelRatio?: () => number,
 *   getPreviewPixelRatio?: () => number,
 *   getDisplayPixelRatio?: () => number,
 *   exportScale?: number,
 * }} deps
 * @param {import('three').WebGLRenderTarget | null | undefined} outputRT
 * @param {number} readW
 * @param {number} readH
 * @returns {import('three').WebGLRenderTarget}
 */
export function blitComposerOutputToByteTarget(deps, outputRT, readW, readH) {
  const { renderer, composer } = deps;
  const byteRT = new THREE.WebGLRenderTarget(readW, readH, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    // Depth needed so visible-faces wireframe can depth-test against scene meshes.
    depthBuffer: captureByteTargetNeedsDepthBuffer(deps),
    stencilBuffer: false,
  });
  composer.copyPass.render(renderer, byteRT, outputRT, 0, false);
  if (deps.camera && deps.scene && shouldCompositeWireframeForCapture(deps)) {
    compositeWireframeOnByteTarget(deps, byteRT);
  }
  return byteRT;
}

/**
 * Screen-space wireframe linewidth for capture readback — matches grid DPR + export scaling.
 * @param {number} thickness — studio slider (0.5–2.5)
 * @param {number} [exportScale=1] — export UI size multiplier (1 or 2)
 * @param {number} [studioPixelRatio=1] — render quality tier DPR (Ultra = 2)
 * @param {number} [previewPixelRatio=1] — interactive viewport DPR before export resize
 * @param {number} [displayPixelRatio=previewPixelRatio] — window.devicePixelRatio
 */
export function resolveCaptureWireframeLineWidthPx(
  thickness,
  exportScale = 1,
  studioPixelRatio = 1,
  previewPixelRatio = 1,
  displayPixelRatio = previewPixelRatio,
) {
  return resolveCaptureGridLineWidthPx(
    thickness,
    exportScale,
    studioPixelRatio,
    previewPixelRatio,
    displayPixelRatio,
  );
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
    const wireframeMeshes = deps.getWireframeOverlayMeshes?.() ?? [];
    const wireframeXRay = wireframeOverlayIsXRay(wireframeMeshes);
    renderGroundGridOverlay({
      renderer: deps.renderer,
      camera: deps.camera,
      scene: deps.scene ?? null,
      grid,
      renderTarget: byteTarget,
      depthTestAgainstScene: !wireframeXRay,
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

/**
 * Draw wireframe overlays on the byte readback RT (after composer copyPass).
 *
 * @param {{
 *   renderer: import('three').WebGLRenderer,
 *   camera: import('three').Camera,
 *   scene?: import('three').Scene | null,
 *   getWireframeOverlayMeshes?: () => import('three').Mesh[] | null | undefined,
 *   getWireframeThickness?: () => number,
 *   getExportViewportReference?: () => {
 *     logicalWidth: number,
 *     logicalHeight: number,
 *     backingWidth: number,
 *     backingHeight: number,
 *     previewDensity: number,
 *   } | null,
 *   getStudioPixelRatio?: () => number,
 *   getPreviewPixelRatio?: () => number,
 *   getDisplayPixelRatio?: () => number,
 *   exportScale?: number,
 * }} deps
 * @param {import('three').WebGLRenderTarget} byteTarget
 */
export function compositeWireframeOnByteTarget(deps, byteTarget) {
  const wireframeMeshes = deps.getWireframeOverlayMeshes?.() ?? [];
  if (!shouldOverlayWireframeMeshes(wireframeMeshes) || !byteTarget) return;

  const previewDpr = deps.getPreviewPixelRatio?.() ?? 1;
  const displayDpr = deps.getDisplayPixelRatio?.() ?? previewDpr;
  const studioDpr = deps.getStudioPixelRatio?.() ?? previewDpr;
  const exportRef = deps.getExportViewportReference?.() ?? null;
  const refPreviewDpr = exportRef?.previewDensity ?? previewDpr;
  const studioLinePx = resolveViewportWireframeLineWidthPx(
    deps.getWireframeThickness?.() ?? DEFAULT_WIREFRAME_LINE_WIDTH,
    refPreviewDpr,
    displayDpr,
    studioDpr,
  );
  const studioBackingW = exportRef?.backingWidth ?? byteTarget.width;
  const lineWidthPx = Math.min(
    5,
    Math.max(0.5, studioLinePx * (byteTarget.width / Math.max(1, studioBackingW))),
  );

  /** @type {import('three').Material[]} */
  const uniqueMaterials = [];
  const seenMaterials = new Set();
  for (const mesh of wireframeMeshes) {
    if (!mesh?.visible) continue;
    const meshMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of meshMats) {
      if (!mat || seenMaterials.has(mat)) continue;
      seenMaterials.add(mat);
      uniqueMaterials.push(mat);
    }
  }

  const prevState = uniqueMaterials.map((mat) => ({
    linewidth: mat.linewidth,
    resolution: mat.resolution?.clone?.(),
  }));

  for (const mat of uniqueMaterials) {
    if (mat.resolution) {
      mat.resolution.set(byteTarget.width, byteTarget.height);
    }
    if (mat.linewidth !== undefined) {
      mat.linewidth = lineWidthPx;
    }
    mat.needsUpdate = true;
  }

  try {
    renderWireframeOverlay({
      renderer: deps.renderer,
      camera: deps.camera,
      scene: deps.scene ?? null,
      wireframeMeshes,
      renderTarget: byteTarget,
    });
  } finally {
    for (let i = 0; i < uniqueMaterials.length; i += 1) {
      const mat = uniqueMaterials[i];
      const prev = prevState[i];
      if (!mat || !prev) continue;
      if (prev.linewidth !== undefined) mat.linewidth = prev.linewidth;
      if (prev.resolution && mat.resolution) mat.resolution.copy(prev.resolution);
      mat.needsUpdate = true;
    }
  }
}
