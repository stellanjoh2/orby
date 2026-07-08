import {
  relinkOuterShaderPatchesAfterSurface,
  getSvgExtrudeSurfacePresetConfig,
  getSurfacePresetNormalMapTexture,
  scheduleObjectSurfaceRefreshWhenTextureReady,
} from './SvgExtrudeSurfaceShader.js';

function relinkMeshSurfaceMaterials(mesh) {
  if (!mesh?.material) return;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach((m) => {
    if (m?.userData?.svgExtrudeProceduralPatched) {
      relinkOuterShaderPatchesAfterSurface(m);
    }
  });
}

/** Relink surface ↔ shadow ↔ gobo hook order on all studio ground meshes. */
export function relinkStudioGroundSurfaceMaterials(groundController) {
  if (!groundController) return;
  relinkMeshSurfaceMaterials(groundController.podium);
  relinkMeshSurfaceMaterials(groundController.backdrop);
  relinkMeshSurfaceMaterials(groundController.infinityCove?.mesh);
}

function collectActiveStudioNormalMapPresets(groundController) {
  if (!groundController) return [];
  const presetIds = [
    groundController.baseSurfacePreset,
    groundController.backdropSurfacePreset,
    groundController.infinityCove?.surfacePreset,
  ];
  const seen = new Set();
  const active = [];
  for (const presetId of presetIds) {
    const id = presetId ?? 'none';
    if (id === 'none' || seen.has(id)) continue;
    const config = getSvgExtrudeSurfacePresetConfig(id);
    if (config?.kind !== 'normalMap') continue;
    seen.add(id);
    active.push(id);
  }
  return active;
}

function forceRepaintStudioGroundMaterials(groundController) {
  if (!groundController) return;
  const targets = [
    { mesh: groundController.podium, preset: groundController.baseSurfacePreset },
    { mesh: groundController.backdrop, preset: groundController.backdropSurfacePreset },
    { mesh: groundController.infinityCove?.mesh, preset: groundController.infinityCove?.surfacePreset },
  ];
  for (const { mesh, preset } of targets) {
    if (!mesh?.material) continue;
    const config = getSvgExtrudeSurfacePresetConfig(preset ?? 'none');
    if (config.kind === 'none') continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      if (m) m.needsUpdate = true;
    });
  }
}

/**
 * Re-apply studio ground surfaces once triplanar normal maps finish loading.
 * @param {import('./GroundController.js').GroundController | null | undefined} groundController
 * @param {(() => void) | undefined} callback
 */
export function scheduleStudioGroundSurfaceTextureRefresh(groundController, callback) {
  if (!groundController || typeof callback !== 'function') return;
  for (const presetId of collectActiveStudioNormalMapPresets(groundController)) {
    const tex = getSurfacePresetNormalMapTexture(presetId);
    scheduleObjectSurfaceRefreshWhenTextureReady(tex, callback);
  }
}

/**
 * Studio ground surface presentation — same order as MaterialController.reapplySvgExtrudeSurfaceShaders:
 * 1. apply surface (+ base glass), 2. shadow tint, 3. relink hooks, 4. schedule texture-ready refresh.
 *
 * @param {import('./GroundController.js').GroundController | null | undefined} groundController
 * @param {{ applyShadowTintToObject: Function } | null | undefined} materialController
 * @param {{ color?: string, strength?: number, opacity?: number }} [tintOpts]
 * @param {{ onTextureReadyRefresh?: () => void }} [options]
 */
export function syncStudioGroundRenderSurfaces(
  groundController,
  materialController,
  tintOpts = {},
  options = {},
) {
  if (!groundController) return;

  groundController.applyBaseSurface();
  groundController.applyBackdropSurface();
  groundController.infinityCove?.applySurface();

  if (!materialController) {
    relinkStudioGroundSurfaceMaterials(groundController);
    forceRepaintStudioGroundMaterials(groundController);
    scheduleStudioGroundSurfaceTextureRefresh(groundController, options.onTextureReadyRefresh);
    return;
  }

  const opts = {
    color: tintOpts.color ?? '#080808',
    strength: tintOpts.strength ?? 0,
    opacity: tintOpts.opacity ?? 0.25,
    forceRepatch: options.forceRepatch === true,
  };

  if (groundController.podium) {
    materialController.applyShadowTintToObject(groundController.podium, opts);
  }
  if (groundController.backdrop) {
    materialController.applyShadowTintToObject(groundController.backdrop, {
      ...opts,
      includeStudioBackdrop: true,
    });
  }
  if (groundController.infinityCove?.mesh) {
    materialController.applyShadowTintToObject(groundController.infinityCove.mesh, {
      ...opts,
      includeStudioBackdrop: true,
    });
  }

  relinkStudioGroundSurfaceMaterials(groundController);
  forceRepaintStudioGroundMaterials(groundController);
  scheduleStudioGroundSurfaceTextureRefresh(groundController, options.onTextureReadyRefresh);
}
