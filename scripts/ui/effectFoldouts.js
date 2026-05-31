import {
  isBloomPipelineActive,
  isVignetteUiEnabled,
} from '../constants.js';

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
  setOpen('bloom', !!state.bloom?.enabled);
  setOpen(
    'anamorphic-lens-flare',
    isBloomPipelineActive(state) && abOn,
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

  setOpen('hdri', !!state.hdriEnabled);
  setOpen('base', podiumOn);
  setOpen('base-glass', podiumOn && glassOn);
  setOpen('backdrop', backdropOn);
  setOpen('backdrop-texture', backdropOn && !!state.backdropTextureEnabled);
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
  const wireframeRelevant =
    state.shading === 'wireframe' || !!state.wireframe?.alwaysOn;

  setOpen('fresnel', !!state.fresnel?.enabled);
  setOpen('grid', !!state.groundWire);
  setOpen('wireframe-settings', wireframeRelevant);
  setOpen('uv-checker', !!state.advanced?.uvChecker);
  setOpen(
    'svg-color-override',
    !!state.svgExtrude?.enabled && !!state.svgExtrude?.colorOverride,
  );
  setOpen('font-extrude', !!state.fontExtrude?.panelOpen);
}
