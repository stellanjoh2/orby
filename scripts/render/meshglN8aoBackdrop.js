/**
 * Meshgl N8AO + HDRI backdrop contract — single source of truth for regression tests.
 * See `docs/n8ao-hdri-base-glass-rules.md`, `.cursor/rules/n8ao-hdri-backdrop.mdc`,
 * and `meshglN8aoBackdrop.test.mjs`.
 */

/** Raw beauty depth at or above this is treated as sky (cleared far plane). */
export const N8AO_SKY_DEPTH_THRESHOLD = 0.9995;

/** Reflective studio surfaces — glass mask + RenderPass plate in composite. */
export const N8AO_EXCLUDED_MESH_USER_DATA_KEYS = ['meshglBaseGlassReflector'];

/** Screen-space overlay effects — must not contribute to N8AO depth/beauty auxiliary buffers. */
export const N8AO_DEPTH_IGNORED_USER_DATA_KEYS = ['lensflare'];

/** Isolated camera layer for lens flare — excluded from AO buffers, drawn after composite. */
export const N8AO_SCREENSPACE_OVERLAY_LAYER = 31;

/** @returns {number} */
export function getStudioViewportLayerMask() {
  return (1 << 0) | (1 << N8AO_SCREENSPACE_OVERLAY_LAYER);
}

/** @returns {number} */
export function getN8aoScreenSpaceOverlayLayerMask() {
  return 1 << N8AO_SCREENSPACE_OVERLAY_LAYER;
}

/**
 * @param {number} layerMask
 * @returns {number}
 */
export function getN8aoSceneLayerMaskWithoutOverlays(layerMask) {
  return layerMask & ~getN8aoScreenSpaceOverlayLayerMask();
}

/**
 * @param {import('three').Object3D} object
 */
export function applyN8aoScreenSpaceOverlayLayer(object) {
  if (!object?.layers) return;
  object.layers.disable(0);
  object.layers.enable(N8AO_SCREENSPACE_OVERLAY_LAYER);
}

/**
 * @param {import('three').Camera} camera
 */
export function enableN8aoScreenSpaceOverlayLayerOnCamera(camera) {
  camera.layers.enable(N8AO_SCREENSPACE_OVERLAY_LAYER);
}

/**
 * @param {import('three').Camera} camera
 * @param {number} layerMask
 * @param {() => void} fn
 */
export function withCameraLayerMask(camera, layerMask, fn) {
  const saved = camera.layers.mask;
  camera.layers.mask = layerMask;
  try {
    fn();
  } finally {
    camera.layers.mask = saved;
  }
}

/**
 * @param {import('three').Object3D} object
 * @returns {boolean}
 */
export function isN8aoExcludedMesh(object) {
  return N8AO_EXCLUDED_MESH_USER_DATA_KEYS.some((key) => object.userData?.[key]);
}

/**
 * @param {import('three').Object3D} object
 * @returns {boolean}
 */
export function isN8aoDepthIgnoredMesh(object) {
  return N8AO_DEPTH_IGNORED_USER_DATA_KEYS.some((key) => object.userData?.[key]);
}

/**
 * @param {import('three').Scene} scene
 * @param {() => void} fn
 */
export function withN8aoDepthIgnoredMeshesHidden(scene, fn) {
  /** @type {import('three').Object3D[]} */
  const hidden = [];
  scene.traverse((child) => {
    if (!child.isMesh || !child.visible || !isN8aoDepthIgnoredMesh(child)) return;
    hidden.push(child);
    child.visible = false;
  });
  try {
    fn();
  } finally {
    for (const child of hidden) {
      child.visible = true;
    }
  }
}

/**
 * @param {import('three').Scene} scene
 * @returns {boolean}
 */
export function sceneHasN8aoDepthIgnoredMesh(scene) {
  let found = false;
  scene.traverse((child) => {
    if (found || !child.isMesh || !child.visible) return;
    if (isN8aoDepthIgnoredMesh(child)) found = true;
  });
  return found;
}

/**
 * Render only screen-space overlay meshes (lens flare) — leaves visibility as-is.
 *
 * @param {import('three').Scene} scene
 * @param {() => void} fn
 */
export function withOnlyN8aoDepthIgnoredMeshesVisible(scene, fn) {
  /** @type {Array<[import('three').Object3D, boolean]>} */
  const toggled = [];
  scene.traverse((child) => {
    if (!child.isMesh) return;
    if (isN8aoDepthIgnoredMesh(child)) return;
    if (child.visible) {
      toggled.push([child, true]);
      child.visible = false;
    }
  });
  try {
    fn();
  } finally {
    for (const [node, wasVisible] of toggled) {
      node.visible = wasVisible;
    }
  }
}

/**
 * @param {import('three').Scene} scene
 * @returns {boolean}
 */
export function sceneHasN8aoExcludedMesh(scene) {
  let found = false;
  scene.traverse((child) => {
    if (found || !child.isMesh || !child.visible) return;
    if (isN8aoExcludedMesh(child)) found = true;
  });
  return found;
}

/**
 * @param {import('three').Scene} scene
 * @param {() => void} fn
 */
export function withN8aoExcludedMeshesHidden(scene, fn) {
  /** @type {import('three').Object3D[]} */
  const hidden = [];
  scene.traverse((child) => {
    if (!child.isMesh || !child.visible || !isN8aoExcludedMesh(child)) return;
    hidden.push(child);
    child.visible = false;
  });
  try {
    fn();
  } finally {
    for (const child of hidden) {
      child.visible = true;
    }
  }
}

/**
 * Render pass helper — hide everything except reflective studio surfaces (base glass).
 *
 * @param {import('three').Scene} scene
 * @param {() => void} fn
 */
export function withOnlyN8aoExcludedMeshesVisible(scene, fn) {
  /** @type {Array<[import('three').Object3D, boolean]>} */
  const toggled = [];
  scene.traverse((child) => {
    if (!child.isMesh) return;
    const keep = isN8aoExcludedMesh(child);
    if (keep) {
      if (!child.visible) {
        toggled.push([child, false]);
        child.visible = true;
      }
      return;
    }
    if (child.visible) {
      toggled.push([child, true]);
      child.visible = false;
    }
  });
  try {
    fn();
  } finally {
    for (const [node, wasVisible] of toggled) {
      node.visible = wasVisible;
    }
  }
}

/**
 * Reflector onBeforeRender captures the scene into its own RT and can leave a partial
 * GL viewport — pause hooks while drawing the flat glass mask (silhouette only).
 *
 * @param {import('three').Scene} scene
 * @param {() => void} fn
 */
export function withN8aoExcludedMeshRenderHooksPaused(scene, fn) {
  /** @type {Array<[import('three').Object3D, (() => void) | null, (() => void) | null]>} */
  const paused = [];
  scene.traverse((child) => {
    if (!isN8aoExcludedMesh(child)) return;
    const before = child.onBeforeRender ?? null;
    const after = child.onAfterRender ?? null;
    if (!before && !after) return;
    paused.push([child, before, after]);
    child.onBeforeRender = () => {};
    child.onAfterRender = () => {};
  });
  try {
    fn();
  } finally {
    for (const [child, before, after] of paused) {
      child.onBeforeRender = before ?? (() => {});
      child.onAfterRender = after ?? (() => {});
    }
  }
}

/**
 * Mirrors `n8aoBackdropRestoreShader` composite.
 *
 * @param {[number, number, number]} backdropRgb
 * @param {[number, number, number]} aoRgb
 * @param {number} rawDepth
 * @param {number} [threshold]
 * @param {number} [glassMask]
 * @param {[number, number, number] | null} [beautyRgb]
 * @param {number} [glassAoFloor]
 * @returns {[number, number, number]}
 */
export function compositeAoWithBackdrop(
  backdropRgb,
  aoRgb,
  rawDepth,
  threshold = N8AO_SKY_DEPTH_THRESHOLD,
  glassMask = 0,
  beautyRgb = null,
  glassAoFloor = 0.2,
) {
  const geometry = rawDepth < threshold ? 1 : 0;
  const glass = glassMask >= 0.5 ? 1 : 0;

  if (glass === 1 && beautyRgb) {
    const luma = (rgb) => rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    const beautyLum = Math.max(luma(beautyRgb), 0.05);
    const aoLum = luma(aoRgb);
    const aoFactor = Math.min(1, Math.max(glassAoFloor, aoLum / beautyLum));
    const overlay = backdropRgb.map((backdrop, i) =>
      Math.max(0, backdrop - beautyRgb[i]),
    );
    return beautyRgb.map((b, i) => b * aoFactor + overlay[i]);
  }

  const aoWeight = geometry * (1 - glass);
  return [
    backdropRgb[0] * (1 - aoWeight) + aoRgb[0] * aoWeight,
    backdropRgb[1] * (1 - aoWeight) + aoRgb[1] * aoWeight,
    backdropRgb[2] * (1 - aoWeight) + aoRgb[2] * aoWeight,
  ];
}

/** Files guarded by meshglN8aoBackdrop regression tests (repo-relative). */
export const N8AO_GUARDED_SOURCE_FILES = [
  'scripts/render/MeshglN8AOPass.js',
  'scripts/render/n8aoBackdropRestoreShader.js',
  'scripts/render/PostProcessingPipeline.js',
  'scripts/render/MeshglRenderPass.js',
  'scripts/render/renderSceneBeautyToTarget.js',
];
