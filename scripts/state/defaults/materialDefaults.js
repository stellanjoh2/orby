import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  ORBY_BLACK,
  ORBY_LIME,
} from '../../constants.js';
import {
  DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
  DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
  DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
} from '../../import/extrudeDefaults.js';

/** Material sliders, clay, wireframe, fresnel, subsurface, diagnostics, Shader Lab. */
export function createMaterialDefaults() {
  return {
    material: {
      brightness: DEFAULT_MATERIAL_BRIGHTNESS,
      metalness: 0.0,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      emissive: 0.0,
      /** True when the loaded mesh has import metalness/roughness maps (sliders multiply textures). */
      importHasMrMaps: false,
      /** True when import carries per-material PBR factors (sliders scale authored values; 1.0 = file). */
      importUsesAuthoredPbr: false,
      /** Triplanar normal-map surface detail for eligible imports (Object → Material). */
      surfacePreset: DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
      surfaceScale: DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
      surfaceStrength: DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
      /** Set at load — shape library or untextured imports; not persisted in presets. */
      surfaceEligible: false,
      /** Object → Material surface (toggle + foldout). */
      surfaceEnabled: false,
      /** Restored when re-enabling surface after the toggle was turned off. */
      surfaceLastPreset: 'galvanizedSteel',
    },
    advanced: {
      reverseNormals: false,
      /** @type {'default' | 'opaqueBlend' | 'frontFace' | 'opaqueAndFrontFace'} */
      transparencyFix: 'default',
      /** Heuristic glass/window materials only (see MaterialController.isWindowMesh). */
      glassOpacity: 0.45,
      /** Multiplier on scene HDRI env intensity for those materials (1 ≈ same as non-glass). */
      glassReflection: 2,
      /** Base body tint (darker / colored glass). Default black reads better on window meshes. */
      glassTint: ORBY_BLACK,
      /** 0 = import-like; 1 = crush glTF transmission + darken (less see-through). */
      glassBody: 0,
      /**
       * When true, promotes mistaken near-opaque BLEND shells to solid draws and uses alpha-hash only
       * when cutout maps / real layering need it. Turn off if hair/cloth looks too grainy.
       */
      blendSortingMitigation: true,
      /** Transmission / window meshes: negate tangent normal Y if glazing reads inverted vs HDRI. */
      flipGlassNormalMapY: false,
      /** Transmission / window meshes: draw front faces only (single-sided shell). */
      glassFrontFacesOnly: false,
      /**
       * KHR transmission + heuristic window glass: MeshPhysicalMaterial.transmission refraction
       * (PBR env reflections via roughness/specular — not BLEND opacity or planar Reflector).
       */
      physicalGlassTransmission: false,
      /**
       * UV Checker overlay — tiles a checker map across mesh UVs so 3D artists can spot stretching
       * and seam issues at a glance. Renders as a translucent clone of the model so original
       * materials/shading are untouched.
       */
      uvChecker: false,
      /** Tiling multiplier for the UV checker overlay (1 = one tile per UV island). */
      uvCheckerScale: 5,
      /**
       * Checker pattern style. `orby` = Orby brand checker; `classic` = Atlux color UV map;
       * `monochrome` = grayscale variant (reads better on already-colored meshes).
       * @type {'orby' | 'classic' | 'monochrome'}
       */
      uvCheckerStyle: 'orby',
      /**
       * Normal / tangent diagnostic overlay — colors surface normals as RGB so artists can
       * spot flipped shading or inspect tangent-space normal maps.
       */
      normalView: false,
      /** @type {'geometry' | 'tangent'} */
      normalViewMode: 'geometry',
      /** Object Info foldout — UI-only disclosure for file/geometry stats. */
      objectInfoOpen: false,
      /** Imported meshes: recompute vertex normals with a crease angle (see Object → Advanced). */
      stlSmoothShading: false,
      stlSmoothingAngle: 40,
    },
    clay: {
      color: '#808080',
      normalMap: true,
    },
    wireframe: {
      alwaysOn: false,
      color: ORBY_LIME,
      onlyVisibleFaces: true,
      hideMesh: false,
      thickness: 1,
      opacity: 1,
    },
    /** Stylized ShaderMaterial overrides for imported meshes (non-glass); off restores GLB materials. */
    creativeLook: {
      enabled: false,
      /** `null` until the user picks a Shader Lab preset (not Neon Edge by default). */
      preset: null,
      /** When true, animated Shader Lab presets stop advancing `uTime`. */
      pauseShaderAnimations: false,
      /** Multiplier on shader `uTime` for animated presets (0–2). Default tuned for spectral storm pacing. */
      shaderAnimationSpeed: 0.4,
      /** World-space pattern size multiplier for Shader Lab presets. 1 = preset default. */
      patternScale: 1,
      /** Global hue shift for all Shader Lab presets (-180…180°). Independent of Cam/FX grading. */
      masterHue: 0,
      /** Effect punch for Shader Lab presets (0–2). 1 = default; meaning varies by preset. */
      intensity: 1,
      /** Shadow lift (+) vs black crush (−) on shader preset output. True Chrome / Glass ignore. */
      liftCrush: 0,
      /** Viewport bloom shortcut (independent of Camera & FX bloom.enabled). */
      viewportBloom: false,
      /** Physical transmission quality for Glass / Holo-Glass / Crystal Gem (1–10). */
      transmissionSamples: 4,
      /** Double-sided draw for transmission shells (interior refraction; costs more). */
      transmissionDoubleSide: false,
      /** Closed solid scans — front side + stronger blur + interior facet cull. */
      transmissionSolidMeshGlass: false,
      /** Chromatic dispersion strength for glass family (0–1 UI). */
      transmissionDispersion: 0.28,
      /** Preset-specific sliders — e.g. sketch strokeWidth / rasterSize. */
      presetParams: {},
    },
    fresnel: {
      enabled: false,
      color: '#808080',
      radius: 2,
      strength: 0.3,
    },
    /** MeshPhysicalMaterial transmission — volumetric translucency (Shaded + Clay), not the older SubsurfaceScatteringShader demo. */
    subsurface: {
      enabled: false,
      translucency: 0,
      scatterTint: '#ffd4b8',
    },
  };
}
