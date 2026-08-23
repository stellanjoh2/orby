import {
  isAnamorphicBloomPipelineActive,
  isBloomTuningActive,
  isVignetteUiEnabled,
} from '../constants.js';
import { isMaterialObjectSurfaceEnabled } from '../render/SvgExtrudeSurfaceShader.js';
import { isBackgroundFallbackActive } from '../render/backgroundFallback.js';
import { getBackgroundMode } from '../render/backgroundMode.js';

/**
 * Progressive disclosure for Camera & FX — child controls fold out when a
 * parent toggle is on (or manual exposure when auto exposure is off).
 */
export function applyEffectFoldouts(state, setOpen) {
  const isoOn = !!state.camera?.isometric?.enabled;
  const fisheyeOn = !!state.fisheye?.enabled;
  const abOn = !!state.lensFlare?.anamorphicBloom?.enabled;
  const lensFlareOn =
    !!state.hdriEnabled && !!state.lensFlare?.enabled;
  const godRaysOn = !!state.hdriEnabled && !!state.godRays?.enabled;

  setOpen('manual-exposure', !state.autoExposure);
  setOpen('isometric', isoOn);
  setOpen('fisheye', fisheyeOn && !isoOn);
  setOpen('vignette', isVignetteUiEnabled(state.camera ?? {}));
  setOpen('dof', !!state.dof?.enabled);
  setOpen('bloom', isBloomTuningActive(state));
  setOpen(
    'anamorphic-lens-flare',
    isAnamorphicBloomPipelineActive(state) && abOn,
  );
  setOpen('lens-flare', lensFlareOn && !isoOn);
  setOpen('volumetric-scattering', godRaysOn && !isoOn);
  setOpen('lens-dirt', !!state.lensDirt?.enabled);
  setOpen('grain', !!state.grain?.enabled);
  setOpen('ambient-occlusion', !!state.ambientOcclusion?.enabled);
  setOpen('aberration', !!state.aberration?.enabled);
  setOpen('color-checker', !!state.colorChecker?.enabled);
  setOpen('composition-guides', !!state.camera?.compositionGridEnabled);
}

/**
 * Progressive disclosure for Studio tab — environment, set dressing, and lights.
 */
export function applyStudioFoldouts(state, setOpen) {
  const lightsOn = !!state.lightsEnabled;
  const podiumOn = !!state.groundSolid;
  const glassOn = !!(
    state.baseGlassSurface ??
    state.podiumReflectMesh ??
    false
  );
  const backdropOn = !!state.backdropEnabled;
  const infinityCoveOn = !!state.infinityCoveEnabled;

  setOpen('hdri', !!state.hdriEnabled);
  setOpen('base', podiumOn);
  setOpen('base-glass', glassOn);
  setOpen('backdrop', backdropOn);
  setOpen('infinity-cove', infinityCoveOn);
  setOpen('background-solid', getBackgroundMode(state) === 'solid' && isBackgroundFallbackActive(state));
  setOpen('background-gradient', getBackgroundMode(state) === 'gradient' && isBackgroundFallbackActive(state));
  setOpen('background-image', getBackgroundMode(state) === 'image' && isBackgroundFallbackActive(state));
  setOpen('lights-rig', lightsOn);
  setOpen('lights-shadows', lightsOn && !!state.lightsCastShadows);
  setOpen('key-light', lightsOn && state.lights?.key?.enabled === true);
  setOpen('fill-light', lightsOn && state.lights?.fill?.enabled === true);
  setOpen('rim-light', lightsOn && state.lights?.rim?.enabled === true);
  setOpen('ambient-light', lightsOn && state.lights?.ambient?.enabled === true);
}

/**
 * Progressive disclosure for Object tab — toggles, display modes, and nested options.
 */
export function applyMeshFoldouts(state, setOpen) {
  const wireframeActive = isWireframeSectionActive(state);

  setOpen('fresnel', !!state.fresnel?.enabled);
  setOpen('object-surface', isMaterialObjectSurfaceEnabled(state.material));
  setOpen('grid', !!state.groundWire);
  setOpen('wireframe-settings', wireframeActive);
  setOpen('uv-checker', !!state.advanced?.uvChecker);
  setOpen('normal-view', !!state.advanced?.normalView);
  setOpen('object-info', !!state.advanced?.objectInfoOpen);
  setOpen('rare-fixes-glass', !!state.advanced?.rareFixesGlassOpen);
  setOpen(
    'svg-color-override',
    !!state.svgExtrude?.enabled && !!state.svgExtrude?.colorOverride,
  );
  setOpen(
    'material-color-override',
    !!state.material?.hasImportAlbedoMaps && !!state.material?.colorOverride,
  );
  setOpen('font-extrude', !!state.fontExtrude?.panelOpen);
}

/** Wireframe overlay settings apply when the overlay is actually drawn. */
export function isWireframeSectionActive(state) {
  // Bones mode owns overlay visibility via animation.showWireframe (default off).
  if (state.animation?.showBones) {
    return !!state.animation?.showWireframe;
  }
  return state.shading === 'wireframe' || !!state.wireframe?.alwaysOn;
}

/**
 * Dim shelf section headlines (and nested controls via `.is-muted` CSS) when a parent
 * toggle is off — same visual language as Shader Lab and per-light subsections.
 */
export function applyToggleSectionMute(state, setMuted) {
  const isoOn = !!state.camera?.isometric?.enabled;
  const fisheyeOn = !!state.fisheye?.enabled;
  const lightsOn = !!state.lightsEnabled;
  const wireframeActive = isWireframeSectionActive(state);
  const podiumOn = !!state.groundSolid;
  const glassOn = !!(
    state.baseGlassSurface ??
    state.podiumReflectMesh ??
    false
  );
  const backdropOn = !!state.backdropEnabled;
  const infinityCoveOn = !!state.infinityCoveEnabled;
  const lensFlareOn = !!state.hdriEnabled && !!state.lensFlare?.enabled;
  const godRaysOn = !!state.hdriEnabled && !!state.godRays?.enabled;
  const abOn = !!state.lensFlare?.anamorphicBloom?.enabled;

  // Object tab
  setMuted('fresnel', !state.fresnel?.enabled);
  setMuted('object-surface', !isMaterialObjectSurfaceEnabled(state.material));
  setMuted('wireframe', !wireframeActive);
  setMuted(
    'creative-look',
    !state.creativeLookSectionOpen && !state.creativeLook?.enabled,
  );
  setMuted('grid', !state.groundWire);
  setMuted('object-info', !state.advanced?.objectInfoOpen);
  setMuted('font-extrude', !state.fontExtrude?.panelOpen);
  setMuted('shape-library', !state.shapeLibrary?.panelOpen);

  // Studio tab
  setMuted('hdri', !state.hdriEnabled);
  setMuted('base', !podiumOn && !glassOn);
  setMuted('base-material', !podiumOn);
  setMuted('base-glass', !glassOn);
  setMuted('backdrop', !backdropOn);
  setMuted('infinity-cove', !infinityCoveOn);
  setMuted('lights', !lightsOn);
  setMuted('keyLight', !(lightsOn && state.lights?.key?.enabled === true));
  setMuted('fillLight', !(lightsOn && state.lights?.fill?.enabled === true));
  setMuted('rimLight', !(lightsOn && state.lights?.rim?.enabled === true));
  setMuted('ambientLight', !(lightsOn && state.lights?.ambient?.enabled === true));
  setMuted('lightsShadows', !(lightsOn && !!state.lightsCastShadows));

  // Camera tab
  setMuted('histogram', !state.histogramEnabled);
  setMuted('tone-curve', !state.toneCurveOpen);
  setMuted('look-filters', !state.lookFilterPresetsOpen);
  setMuted('isometric', !isoOn);
  setMuted('fisheye', !fisheyeOn || isoOn);

  // Camera & FX tab
  setMuted('ambient-occlusion', !state.ambientOcclusion?.enabled);
  setMuted('dof', !state.dof?.enabled);
  setMuted('volumetric-scattering', !godRaysOn || isoOn);
  setMuted('bloom', !isBloomTuningActive(state));
  setMuted('anamorphic-lens-flare', !isAnamorphicBloomPipelineActive(state) || !abOn);
  setMuted('lens-flare', !lensFlareOn || isoOn);
  setMuted('lens-dirt', !state.lensDirt?.enabled);
  setMuted('grain', !state.grain?.enabled);
  setMuted('vignette', !isVignetteUiEnabled(state.camera ?? {}));
  setMuted('aberration', !state.aberration?.enabled);
  setMuted('color-checker', !state.colorChecker?.enabled);
  setMuted('composition-guides', !state.camera?.compositionGridEnabled);
  setMuted(
    'cinematic-letterbox',
    !state.camera?.compositionGridEnabled ||
      !state.camera?.cinematicLetterbox219,
  );
}
