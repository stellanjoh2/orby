import * as THREE from 'three';
import {
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
} from '../constants.js';
import { isTextureImageReady } from '../utils/textureReady.js';
import { DUST_FIELD_DEFAULT_INTENSITY, DUST_FIELD_DEFAULT_PATTERN_SCALE } from './creativeLookDustField.js';
import { createShadowTintUniformValues } from './ShadowTint.js';
import {
  ASCII_LUMINANCE_PREP_FRAGMENT,
  creativeAsciiCellSize,
  creativeLookAsciiFixedScale,
  creativeLookAsciiFixedIntensity,
} from './creativeLookAsciiArt.js';
import {
  ASCII_2_LUMINANCE_PREP_FRAGMENT,
  creativeLookAscii2FixedScale,
  creativeLookAscii2FixedIntensity,
} from './creativeLookAscii2Art.js';
import {
  ASCII_3_LUMINANCE_PREP_FRAGMENT,
  creativeLookAscii3FixedScale,
  creativeLookAscii3FixedIntensity,
} from './creativeLookAscii3Art.js';
import {
  ASCII_4_LUMINANCE_PREP_FRAGMENT,
  creativeLookAscii4FixedScale,
  creativeLookAscii4FixedIntensity,
} from './creativeLookAscii4Art.js';
import {
  EGA_PREP_FRAGMENT,
  creativeLookEgaFixedScale,
  creativeLookEgaFixedIntensity,
} from './creativeLookEgaArt.js';
import {
  C64_PREP_FRAGMENT,
  creativeLookC64FixedScale,
  creativeLookC64FixedIntensity,
} from './creativeLookC64Art.js';
import {
  GB_PREP_FRAGMENT,
  creativeLookGameBoyFixedScale,
  creativeLookGameBoyFixedIntensity,
} from './creativeLookGameBoyArt.js';
import {
  NES_PREP_FRAGMENT,
  creativeLookNesFixedScale,
  creativeLookNesFixedIntensity,
} from './creativeLookNesArt.js';
import {
  MD_PREP_FRAGMENT,
  creativeLookMegaDriveFixedScale,
  creativeLookMegaDriveFixedIntensity,
} from './creativeLookMegaDriveArt.js';
import {
  INTV_PREP_FRAGMENT,
  creativeLookIntellivisionFixedScale,
  creativeLookIntellivisionFixedIntensity,
} from './creativeLookIntellivisionArt.js';
import {
  GBA_PREP_FRAGMENT,
  creativeLookGbaFixedScale,
  creativeLookGbaFixedIntensity,
} from './creativeLookGbaArt.js';
import {
  A2_PREP_FRAGMENT,
  creativeLookApple2FixedScale,
  creativeLookApple2FixedIntensity,
} from './creativeLookApple2Art.js';
import { CREATIVE_LOOK_LIFT_CRUSH_GLSL } from './creativeLookFlatPostMasterHue.js';
import {
  DITHER_NEUTRAL_PREP_FRAGMENT,
  DITHER_NEUTRAL_DEFAULT_INTENSITY,
  DITHER_NEUTRAL_DEFAULT_PATTERN_SCALE,
  DITHER_TRITONE_DEFAULT_INTENSITY,
  DITHER_TRITONE_DEFAULT_PATTERN_SCALE,
  DITHER_CROSSHATCH_DEFAULT_INTENSITY,
  DITHER_CROSSHATCH_DEFAULT_PATTERN_SCALE,
  DITHER_CROSSHATCH_DEFAULT_LIFT_CRUSH,
  DITHER_RASTER_DEFAULT_INTENSITY,
  DITHER_RASTER_DEFAULT_PATTERN_SCALE,
  DITHER_PIXEL_CREATIVE_LOOK_PRESETS,
} from './creativeLookDitherArt.js';
import {
  withCreativeLookPrepPbrModulation,
  isCreativeLookMaterialPbrSliderPreset,
} from './creativeLookMaterialPbrArt.js';
import {
  CREATIVE_LOOK_APPLY_BRIGHTNESS_GLSL,
  CREATIVE_LOOK_BRIGHTNESS_UNIFORM_GLSL,
  creativeLookBrightnessEffectiveScale,
} from './creativeLookBrightnessArt.js';
import {
  VGA_DOS_3D_FRAGMENT,
  VGA_DOS_PALETTE_COUNT,
  getVgaDosPaletteTexture,
} from './creativeLookVgaDos3dArt.js';
import {
  creativeWatercolourVertexDrift,
  creativeWatercolourWobbleScale,
  WATERCOLOUR_BAND_INK_STRENGTH,
  WATERCOLOUR_LIGHT_BANDS,
  WATERCOLOUR_PREPASS_SOFT_BLEND,
  WATERCOLOUR_SHADE_CEIL,
  WATERCOLOUR_SHADE_FLOOR,
} from './creativeLookWatercolourArt.js';
import {
  SKETCH_FRAGMENT,
  SKETCH_PATTERN_SCALE_MAX,
  SKETCH_PATTERN_SCALE_MIN,
  creativeSketchVertexDrift,
  creativeSketchWobbleScale,
  normalizeCreativeLookSketchPatternScale,
} from './creativeLookSketchArt.js';
import {
  SKETCH_COLOUR_FRAGMENT,
} from './creativeLookSketchColourArt.js';
import {
  GOUACHE_FRAGMENT,
  GOUACHE_PATTERN_SCALE_MIN,
  GOUACHE_PATTERN_SCALE_MAX,
  creativeGouacheVertexDrift,
  creativeGouacheWobbleScale,
} from './creativeLookGouacheArt.js';
import {
  creativeLookVoxelFixedScale,
  isVoxelCreativeLookPreset,
} from './creativeLookVoxelArt.js';
import {
  ORBY_CREATIVE_SURFACE_FRAG_HELPERS,
  createOrbySurfaceUniformRefs,
  creativeLookPresetSupportsSurfaceDetail,
} from './SvgExtrudeSurfaceShader.js';
import {
  attachCreativeLookHoloGlassShader,
  creativeHoloGlassParamsForMesh,
  CREATIVE_HOLO_GLASS_ENV_MAP_MUL,
} from './creativeLookHoloGlass.js';
import {
  attachCreativeLookCrystalGemShader,
  creativeCrystalGemParamsForMesh,
  CREATIVE_CRYSTAL_GEM_ENV_MAP_MUL,
  applyCreativeLookCrystalGemPerformanceTuning,
} from './creativeLookCrystalGem.js';
import {
  THERMAL_DEFAULT_INTENSITY,
  THERMAL_DEFAULT_PATTERN_SCALE,
} from './creativeLookThermalArt.js';
import {
  THERMAL_EXTREME_DEFAULT_INTENSITY,
  THERMAL_EXTREME_DEFAULT_PATTERN_SCALE,
} from './creativeLookThermalExtremeArt.js';
import {
  THERMAL_ACID_DEFAULT_INTENSITY,
  THERMAL_ACID_DEFAULT_PATTERN_SCALE,
  THERMAL_ACID_MESH_GAIN,
  THERMAL_ACID_LUMINANCE_PREP_FRAGMENT,
} from './creativeLookThermalAcidArt.js';
import {
  OPTICS_LUMINANCE_PREP_FRAGMENT,
  isOpticsCreativeLookPreset,
} from './creativeLookOpticsArt.js';

export { isOpticsCreativeLookPreset };

export { creativeLookPresetSupportsSurfaceDetail } from './SvgExtrudeSurfaceShader.js';

export { creativeLookUsesVoxelGeometry, isVoxelCreativeLookPreset } from './creativeLookVoxelArt.js';

/**
 * Animated presets read `uTime` as one shared timeline: MaterialController sets
 * `uTime = elapsedSeconds * creativeLook.shaderAnimationSpeed` (after pause freeze).
 * Shader fragments use `float t = uTime` for animated presets (flow-field, plasma, holographic, spectral-storm, chrome-plasma, voronoi, scanline-hologram, wire-pulse, fractal-storm, holo-topo, dust-field, vectrex, ps2-crush, psx, holo-glass, crystal-gem). EGA Pixel uses a fixed 640×350 screen grid (no time scroll).
 *
 * The chrome preset uses MeshPhysicalMaterial so PMREM / CubeUV environment maps match the rest of the viewer.
 * The glass preset uses MeshPhysicalMaterial.transmission for real refraction (Three.js transmission pipeline).
 * Spec: https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial.transmission
 * When transmission > 0, opacity must stay 1. Refraction samples scene.background + opaque geometry
 * in the transmission prepass — not other transmissive/transparent meshes (Three.js renderer design).
 */

/** @typedef {'neon-edge' | 'flow-field' | 'plasma' | 'toon' | 'ega-pixel' | 'c64-pixel' | 'gameboy-pixel' | 'gba-pixel' | 'nes-pixel' | 'megadrive-pixel' | 'intellivision-pixel' | 'apple2-pixel' | 'dither-neutral' | 'dither-tritone' | 'dither-crosshatch' | 'dither-raster' | 'ascii-art' | 'ascii-art-2' | 'ascii-art-3' | 'ascii-art-4' | 'holographic' | 'spectral-storm' | 'voronoi' | 'scanline-hologram' | 'wire-pulse' | 'fractal-storm' | 'holo-topo' | 'dust-field' | 'ps2-crush' | 'psx' | 'vga-dos-3d' | 'vectrex' | 'voxel-hd' | 'watercolour' | 'sketch' | 'sketch-colour' | 'gouache' | 'chrome-plasma' | 'chrome' | 'glass' | 'holo-glass' | 'crystal-gem' | 'thermal' | 'thermal-extreme' | 'thermal-acid'} CreativeLookPreset */

export const CREATIVE_LOOK_PRESETS = /** @type {const} */ ([
  'neon-edge',
  'flow-field',
  'plasma',
  'toon',
  'ega-pixel',
  'c64-pixel',
  'gameboy-pixel',
  'gba-pixel',
  'nes-pixel',
  'megadrive-pixel',
  'intellivision-pixel',
  'apple2-pixel',
  'dither-neutral',
  'dither-tritone',
  'dither-crosshatch',
  'dither-raster',
  'ascii-art',
  'ascii-art-2',
  'ascii-art-3',
  'ascii-art-4',
  'holographic',
  'voronoi',
  'scanline-hologram',
  'wire-pulse',
  'fractal-storm',
  'holo-topo',
  'dust-field',
  'ps2-crush',
  'psx',
  'vga-dos-3d',
  'vectrex',
  'voxel-hd',
  'watercolour',
  'sketch',
  'sketch-colour',
  'gouache',
  'chrome-plasma',
  'chrome',
  'glass',
  'holo-glass',
  'crystal-gem',
  'thermal',
  'thermal-extreme',
  'thermal-acid',
  'spectral-storm',
]);

/**
 * Base color for creative chrome (metalness 1): in Three’s metal workflow this tints
 * specular / env reflections. Dark values read as “black chrome”; silver uses light neutral F0.
 */
export const CREATIVE_CHROME_BASE_HEX = 0xeef1f5;

/** Physical env-map presets — need HDRI lighting and Render Backdrop for refraction / reflections. */
export function creativeLookPresetNeedsHdriBackdrop(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id === 'glass' || id === 'holo-glass' || id === 'crystal-gem' || id === 'chrome';
}

/** Full colorwheel range for Shader Lab master hue (degrees). */
export const CREATIVE_LOOK_MASTER_HUE_MIN = -180;
export const CREATIVE_LOOK_MASTER_HUE_MAX = 180;

/** Shader Lab effect punch — 0 = subtle, 1 = default, 2 = extreme. */
export const CREATIVE_LOOK_INTENSITY_MIN = 0;
export const CREATIVE_LOOK_INTENSITY_MAX = 2;
export const CREATIVE_LOOK_INTENSITY_DEFAULT = 1;

/** Default Shader Lab intensity for Scanline Hologram (strength slider). */
export const SCANLINE_HOLOGRAM_DEFAULT_INTENSITY = 0.25;

/** Default Shader Lab intensity for Vectrex (line brightness). */
export const VECTREX_DEFAULT_INTENSITY = 0.25;

/** Default Shader Lab intensity for Wire Pulse (line thickness). */
export const WIRE_PULSE_DEFAULT_INTENSITY = 0.25;

/** Default Shader Lab intensity for Topo Minimal (contour line glow). */
export const FRACTAL_STORM_DEFAULT_INTENSITY = 1;

/** Default Shader Lab scale for Topo Minimal (contour density). */
export const FRACTAL_STORM_DEFAULT_PATTERN_SCALE = 1;

export {
  DUST_FIELD_PARTICLE_COUNT,
  DUST_FIELD_DEFAULT_INTENSITY,
  DUST_FIELD_DEFAULT_PATTERN_SCALE,
  isDustFieldCreativeLookPreset,
  creativeLookUsesDustFieldGeometry,
  buildDustFieldGeometry,
  updateDustFieldParticlePositions,
} from './creativeLookDustField.js';

/** Default Shader Lab scale for Vectrex (analog beam wobble amount). */
export const VECTREX_DEFAULT_PATTERN_SCALE = 0.5;

/** Default Shader Lab scale for Flow Field (world-space color drift density). */
export const FLOW_FIELD_DEFAULT_PATTERN_SCALE = 0.1;

/** Default Shader Lab scale for Plasma (world-space wave density). */
export const PLASMA_DEFAULT_PATTERN_SCALE = 1;

/** Default Shader Lab scale for Spectral Storm (world-space plasma density). */
export const SPECTRAL_STORM_DEFAULT_PATTERN_SCALE = 1;

/** Fixed creative Scale for PS2 Crush — decimation runs once at apply (not live). */
export const CREATIVE_PS2_CRUSH_PATTERN_SCALE = 2;

/** Fixed creative Scale for PSX — coarser decimation than PS2. */
export const CREATIVE_PSX_PATTERN_SCALE = 2.5;

/** Fixed creative Scale for VGA/DOS 3D — moderate decimation between PS2 and PSX. */
export const CREATIVE_VGA_DOS_3D_PATTERN_SCALE = 2.2;

/** Wire Pulse / Vectrex need per-triangle barycentrics (non-indexed triangle soup). */
export function creativeLookUsesWirePulseGeometry(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id === 'wire-pulse' || id === 'vectrex';
}

/** Wire Pulse, Dust Field, and Vectrex draw in the transparent pass. */
export function creativeLookForceTransparentDraw(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id === 'wire-pulse' || id === 'dust-field' || id === 'vectrex';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isVectrexCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'vectrex';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isWatercolourCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'watercolour';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isSketchCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'sketch';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isSketchColourCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'sketch-colour';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isGouacheCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'gouache';
}

/** B&W Sketch + coloured Sketch Colour — shared geometry, sliders, and post stack. */
export function isSketchFamilyCreativeLookPreset(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id === 'sketch' || id === 'sketch-colour';
}

/** @param {number} side @param {number} shaderAlpha */
export function creativeLookHolographicShellMaterialOpts(side, shaderAlpha) {
  return {
    transparent: true,
    opacity: shaderAlpha,
    side,
    depthTest: true,
    depthWrite: false,
    toneMapped: true,
  };
}

/** Dust Field — additive point sprites sampled from mesh surface. */
export function creativeLookDustFieldMaterialOpts(shaderAlpha) {
  return {
    transparent: true,
    opacity: shaderAlpha,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  };
}

/** Wire Pulse / Vectrex — no hidden-line removal; vectors draw through like CRT / x-ray wireframe. */
export function creativeLookWireVectorMaterialOpts(shaderAlpha) {
  return {
    transparent: true,
    opacity: shaderAlpha,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  };
}

/**
 * Non-indexed triangle soup + barycentric attribute for wire / vertex shaders.
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry}
 */
export function prepareCreativeLookWirePulseGeometry(geometry) {
  let working = geometry.clone();
  if (working.index) {
    const flat = working.toNonIndexed();
    working.dispose?.();
    working = flat;
  }
  if (!working.getAttribute('barycentric')) {
    const count = working.attributes.position.count;
    const bary = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 3) {
      bary[i * 3] = 1;
      bary[i * 3 + 1] = 0;
      bary[i * 3 + 2] = 0;
      bary[(i + 1) * 3] = 0;
      bary[(i + 1) * 3 + 1] = 1;
      bary[(i + 1) * 3 + 2] = 0;
      bary[(i + 2) * 3] = 0;
      bary[(i + 2) * 3 + 1] = 0;
      bary[(i + 2) * 3 + 2] = 1;
    }
    working.setAttribute('barycentric', new THREE.BufferAttribute(bary, 3));
  }
  if (!working.attributes.normal) {
    working.computeVertexNormals();
  }
  working.computeBoundingSphere();
  return working;
}

/** Shader Lab presets that preserve import alpha (vehicle glass, hologram shells, etc.). */
export const CREATIVE_LOOK_TRANSPARENT_PRESETS = /** @type {const} */ ([
  'glass',
  'holo-glass',
  'crystal-gem',
  'chrome',
  'ps2-crush',
  'psx',
  'vga-dos-3d',
  'ega-pixel',
  'c64-pixel',
  'gameboy-pixel',
  'gba-pixel',
  'nes-pixel',
  'megadrive-pixel',
  'intellivision-pixel',
  'apple2-pixel',
  'dither-neutral',
  'dither-tritone',
  'dither-crosshatch',
  'dither-raster',
  'ascii-art',
  'ascii-art-2',
  'ascii-art-3',
  'ascii-art-4',
  'scanline-hologram',
  'wire-pulse',
  'dust-field',
  'vectrex',
  'watercolour',
  'gouache',
]);

/** @param {CreativeLookPreset | string | undefined} preset */
export function creativeLookAllowsTransparency(preset) {
  return CREATIVE_LOOK_TRANSPARENT_PRESETS.includes(normalizeCreativeLookPreset(preset));
}

/** Screen-space Bayer dither — no shadow-map vertex chunks (avoids compile issues on thin alpha shells). */
export function creativeLookPresetUsesShadowReceive(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id !== 'ega-pixel' && id !== 'c64-pixel' && id !== 'gameboy-pixel' && id !== 'gba-pixel' && id !== 'nes-pixel' && id !== 'megadrive-pixel' && id !== 'intellivision-pixel' && id !== 'apple2-pixel' && id !== 'ascii-art' && id !== 'ascii-art-2' && id !== 'ascii-art-3' && id !== 'ascii-art-4' && id !== 'watercolour' && id !== 'sketch' && id !== 'sketch-colour' && id !== 'gouache' && id !== 'vectrex';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isEgaPixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'ega-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isGameBoyPixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'gameboy-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isC64PixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'c64-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isNesPixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'nes-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isMegaDrivePixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'megadrive-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isGbaPixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'gba-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isIntellivisionPixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'intellivision-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isApple2PixelCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'apple2-pixel';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isDitherNeutralCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'dither-neutral';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isDitherTritoneCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'dither-tritone';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isDitherCrosshatchCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'dither-crosshatch';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isDitherRasterCreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'dither-raster';
}

/** Shader Lab Dither — hard square pixel presets. */
export function isDitherPixelCreativeLookPreset(preset) {
  return DITHER_PIXEL_CREATIVE_LOOK_PRESETS.includes(normalizeCreativeLookPreset(preset));
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isDitherCreativeLookPreset(preset) {
  return isDitherPixelCreativeLookPreset(preset);
}

/** Object → Material brightness / metalness / roughness sliders in Shader Lab. */
export function creativeLookPresetSupportsMaterialPbrSliders(preset) {
  return isCreativeLookMaterialPbrSliderPreset(normalizeCreativeLookPreset(preset));
}

/** Shader Lab “Screen pixels” grid — matches index.html creative-look section. */
export const SCREEN_PIXEL_CREATIVE_LOOK_PRESETS = /** @type {const} */ ([
  'ega-pixel',
  'c64-pixel',
  'gameboy-pixel',
  'gba-pixel',
  'nes-pixel',
  'megadrive-pixel',
  'intellivision-pixel',
  'apple2-pixel',
]);

/** @param {CreativeLookPreset | string | undefined} preset */
export function isScreenPixelCreativeLookPreset(preset) {
  return SCREEN_PIXEL_CREATIVE_LOOK_PRESETS.includes(normalizeCreativeLookPreset(preset));
}

/** Two-pass screen grid: ASCII terminal, EGA, or retro flat pixels. */
export function isFlatPostCreativeLookPreset(preset) {
  return (
    isAsciiCreativeLookPreset(preset) ||
    isEgaPixelCreativeLookPreset(preset) ||
    isC64PixelCreativeLookPreset(preset) ||
    isGameBoyPixelCreativeLookPreset(preset) ||
    isGbaPixelCreativeLookPreset(preset) ||
    isNesPixelCreativeLookPreset(preset) ||
    isMegaDrivePixelCreativeLookPreset(preset) ||
    isIntellivisionPixelCreativeLookPreset(preset) ||
    isApple2PixelCreativeLookPreset(preset) ||
    isDitherNeutralCreativeLookPreset(preset) ||
    isDitherTritoneCreativeLookPreset(preset) ||
    isDitherCrosshatchCreativeLookPreset(preset) ||
    isDitherRasterCreativeLookPreset(preset)
  );
}

/**
 * Default Shader Lab stack (neon-edge, glass, voxel-hd, …) — N8AO stays in the composer,
 * including the viewport-bloom slim stack. Artistic / flat-post presets replace the stack.
 * @param {CreativeLookPreset | string | undefined} preset
 */
export function creativeLookPresetAllowsAmbientOcclusion(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (isFlatPostCreativeLookPreset(id)) return false;
  if (isWatercolourCreativeLookPreset(id)) return false;
  if (isGouacheCreativeLookPreset(id)) return false;
  if (isSketchFamilyCreativeLookPreset(id)) return false;
  if (isVectrexCreativeLookPreset(id)) return false;
  return true;
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function creativeLookFlatPostVariant(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (isAsciiCreativeLookPreset(id)) return 'ascii';
  if (id === 'ega-pixel') return 'ega-pixel';
  if (id === 'c64-pixel') return 'c64-pixel';
  if (id === 'gameboy-pixel') return 'gameboy-pixel';
  if (id === 'nes-pixel') return 'nes-pixel';
  if (id === 'megadrive-pixel') return 'megadrive-pixel';
  if (id === 'intellivision-pixel') return 'intellivision-pixel';
  if (id === 'gba-pixel') return 'gba-pixel';
  if (id === 'apple2-pixel') return 'apple2-pixel';
  if (id === 'dither-neutral') return 'dither-neutral';
  if (id === 'dither-tritone') return 'dither-tritone';
  if (id === 'dither-crosshatch') return 'dither-crosshatch';
  if (id === 'dither-raster') return 'dither-raster';
  return null;
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isAsciiCreativeLookPreset(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id === 'ascii-art' || id === 'ascii-art-2' || id === 'ascii-art-3' || id === 'ascii-art-4';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function isAscii4CreativeLookPreset(preset) {
  return normalizeCreativeLookPreset(preset) === 'ascii-art-4';
}

/** Reference effective studio intensities at lights master 1.0 (LightsController multipliers). */
const CREATIVE_LOOK_REF_LIGHT = {
  key: 1.28 * 2,
  fill: 0.8 * 2,
  rim: 0.96 * 2,
  ambient: 0.48 * 4,
};

const CREATIVE_LOOK_REF_KEY_BLEND =
  CREATIVE_LOOK_REF_LIGHT.key +
  CREATIVE_LOOK_REF_LIGHT.fill * 0.45 +
  CREATIVE_LOOK_REF_LIGHT.rim * 0.35;

/**
 * HDRI-only fill when the studio rig is off — keeps PS2 Crush near shaded luminance.
 * @param {number | undefined} hdriStrength
 * @param {boolean} [hdriEnabled]
 */
export function creativeLookHdriFillScalars(hdriStrength, hdriEnabled = true) {
  if (!hdriEnabled) {
    return { lightScale: 0.95, ambientFloor: 0.52 };
  }
  const s = Number(hdriStrength);
  const strength = Number.isFinite(s) ? Math.max(0, s) : 1;
  return {
    lightScale: THREE.MathUtils.clamp(0.98 + 0.2 * strength, 0.88, 2.6),
    ambientFloor: THREE.MathUtils.clamp(0.54 + 0.07 * strength, 0.5, 0.7),
  };
}

/**
 * Maps the 3-point rig + ambient (and HDRI when rig is off) to toon / PS2 Crush lighting uniforms.
 * @param {import('./LightsController.js').LightsController | null | undefined} lightsController
 * @param {{ hdriStrength?: number, hdriEnabled?: boolean }} [options]
 * @returns {{ lightScale: number, ambientFloor: number }}
 */
export function computeCreativeLookToonLightScalars(lightsController, options = {}) {
  const hdriFill = creativeLookHdriFillScalars(
    options.hdriStrength,
    options.hdriEnabled !== false,
  );
  if (!lightsController?.lightsEnabled) return hdriFill;

  const rawMaster = Number(lightsController.lightsMaster);
  const master = Number.isFinite(rawMaster) ? Math.max(0, rawMaster) : 1;

  // Match dark studio rig at Strength 0 — do not use `|| 1` (0 is valid).
  if (master <= 1e-6) {
    return { lightScale: 0.12, ambientFloor: 0.16 };
  }

  /** Per-light base intensity when enabled (no engine overexposure clamp — keeps slider linear). */
  const lightContrib = (id, weight = 1) => {
    const props = lightsController.individualProperties?.[id];
    const enabled = props?.enabled === true && lightsController.lightsEnabled;
    if (!enabled) return 0;
    const base = Number(props?.intensity);
    if (!Number.isFinite(base) || base <= 0) return 0;
    return base * weight;
  };

  const keyBlend =
    lightContrib('key') * 2 +
    lightContrib('fill') * 2 * 0.45 +
    lightContrib('rim') * 2 * 0.35;
  const ambBase = lightContrib('ambient') * 4;

  const studio = {
    lightScale: THREE.MathUtils.clamp(
      (master * keyBlend) / CREATIVE_LOOK_REF_KEY_BLEND,
      0.12,
      8,
    ),
    ambientFloor: THREE.MathUtils.clamp(
      0.16 + 0.26 * ((master * ambBase) / CREATIVE_LOOK_REF_LIGHT.ambient),
      0.14,
      0.9,
    ),
  };
  // Blend HDRI fill so Shader Lab does not plunge vs shaded when rig is dim.
  return {
    lightScale: THREE.MathUtils.clamp(
      studio.lightScale * 0.82 + hdriFill.lightScale * 0.18,
      0.12,
      8,
    ),
    ambientFloor: THREE.MathUtils.clamp(
      Math.max(studio.ambientFloor, hdriFill.ambientFloor * 0.55),
      0.14,
      0.9,
    ),
  };
}

/** @param {number | undefined} value */
export function normalizeCreativeLookIntensity(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return CREATIVE_LOOK_INTENSITY_DEFAULT;
  return THREE.MathUtils.clamp(v, CREATIVE_LOOK_INTENSITY_MIN, CREATIVE_LOOK_INTENSITY_MAX);
}

/** Preset-specific intensity when the slider is not locked (`creativeLookFixedIntensity`). */
export function creativeLookDefaultIntensity(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'scanline-hologram') return SCANLINE_HOLOGRAM_DEFAULT_INTENSITY;
  if (id === 'vectrex') return VECTREX_DEFAULT_INTENSITY;
  if (id === 'wire-pulse') return WIRE_PULSE_DEFAULT_INTENSITY;
  if (id === 'fractal-storm') return FRACTAL_STORM_DEFAULT_INTENSITY;
  if (id === 'dust-field') return DUST_FIELD_DEFAULT_INTENSITY;
  if (id === 'dither-neutral') return DITHER_NEUTRAL_DEFAULT_INTENSITY;
  if (id === 'dither-tritone') return DITHER_TRITONE_DEFAULT_INTENSITY;
  if (id === 'dither-crosshatch') return DITHER_CROSSHATCH_DEFAULT_INTENSITY;
  if (id === 'dither-raster') return DITHER_RASTER_DEFAULT_INTENSITY;
  if (id === 'thermal') return THERMAL_DEFAULT_INTENSITY;
  if (id === 'thermal-extreme') return THERMAL_EXTREME_DEFAULT_INTENSITY;
  if (id === 'thermal-acid') return THERMAL_ACID_DEFAULT_INTENSITY;
  return CREATIVE_LOOK_INTENSITY_DEFAULT;
}

/** Preset-specific scale when switching presets, or `null` to keep the current scale. */
export function creativeLookDefaultPatternScale(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'flow-field') return FLOW_FIELD_DEFAULT_PATTERN_SCALE;
  if (id === 'plasma') return PLASMA_DEFAULT_PATTERN_SCALE;
  if (id === 'spectral-storm') return SPECTRAL_STORM_DEFAULT_PATTERN_SCALE;
  if (id === 'vectrex') return VECTREX_DEFAULT_PATTERN_SCALE;
  if (id === 'dust-field') return DUST_FIELD_DEFAULT_PATTERN_SCALE;
  if (id === 'fractal-storm') return FRACTAL_STORM_DEFAULT_PATTERN_SCALE;
  if (id === 'dither-neutral') return DITHER_NEUTRAL_DEFAULT_PATTERN_SCALE;
  if (id === 'dither-tritone') return DITHER_TRITONE_DEFAULT_PATTERN_SCALE;
  if (id === 'dither-crosshatch') return DITHER_CROSSHATCH_DEFAULT_PATTERN_SCALE;
  if (id === 'dither-raster') return DITHER_RASTER_DEFAULT_PATTERN_SCALE;
  if (id === 'thermal') return THERMAL_DEFAULT_PATTERN_SCALE;
  if (id === 'thermal-extreme') return THERMAL_EXTREME_DEFAULT_PATTERN_SCALE;
  if (id === 'thermal-acid') return THERMAL_ACID_DEFAULT_PATTERN_SCALE;
  return null;
}

/** Preset-specific lift/crush when switching presets (`creativeLookFixedLiftCrush` none yet). */
export function creativeLookDefaultLiftCrush(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'dither-crosshatch') return DITHER_CROSSHATCH_DEFAULT_LIFT_CRUSH;
  if (id === 'glass') return CREATIVE_GLASS_DEFAULT_LIFT_CRUSH;
  return CREATIVE_LOOK_LIFT_CRUSH_DEFAULT;
}

/**
 * When switching between two dither pixel presets, always snap Scale + Intensity + Lift/Crush to the
 * destination preset's tuned defaults (each variant has its own optimal Scale / Intensity).
 */
export function shouldResetDitherPresetTuning(prevPreset, nextPreset) {
  const prev = normalizeCreativeLookPreset(prevPreset);
  const next = normalizeCreativeLookPreset(nextPreset);
  return prev !== next && isDitherPixelCreativeLookPreset(prev) && isDitherPixelCreativeLookPreset(next);
}

/** Shader Lab Scale slider bounds per preset (Sketch uses bespoke Stroke / Raster sliders). */
export function creativeLookPatternScaleBounds(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'sketch' || id === 'sketch-colour') {
    return { min: SKETCH_PATTERN_SCALE_MIN, max: SKETCH_PATTERN_SCALE_MAX };
  }
  if (id === 'gouache') {
    return { min: GOUACHE_PATTERN_SCALE_MIN, max: GOUACHE_PATTERN_SCALE_MAX };
  }
  if (isDitherPixelCreativeLookPreset(id)) {
    if (id === 'dither-raster') {
      return { min: 0.25, max: 5 };
    }
    return { min: 0, max: 5 };
  }
  return { min: 0.02, max: 5 };
}

/** Clamp stored Scale to preset bounds; fixed-grid presets return their locked value. */
export function normalizeCreativeLookPatternScale(preset, value) {
  const fixed = creativeLookFixedPatternScale(preset);
  if (fixed != null) return fixed;
  const { min, max } = creativeLookPatternScaleBounds(preset);
  const ps = Number(value);
  if (!Number.isFinite(ps)) return 1;
  return THREE.MathUtils.clamp(ps, min, max);
}

/** Shadow lift (+) vs black crush (−) for Shader Lab output grading. */
export const CREATIVE_LOOK_LIFT_CRUSH_MIN = -1;
export const CREATIVE_LOOK_LIFT_CRUSH_MAX = 1;
export const CREATIVE_LOOK_LIFT_CRUSH_DEFAULT = 0;

/** @param {number | undefined} value */
export function normalizeCreativeLookLiftCrush(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return CREATIVE_LOOK_LIFT_CRUSH_DEFAULT;
  return THREE.MathUtils.clamp(v, CREATIVE_LOOK_LIFT_CRUSH_MIN, CREATIVE_LOOK_LIFT_CRUSH_MAX);
}

/** @param {number | undefined} degrees */
export function normalizeCreativeLookMasterHue(degrees) {
  const d = Number(degrees);
  if (!Number.isFinite(d)) return 0;
  return THREE.MathUtils.clamp(d, CREATIVE_LOOK_MASTER_HUE_MIN, CREATIVE_LOOK_MASTER_HUE_MAX);
}

/** @param {number | undefined} degrees */
export function creativeLookMasterHueRadians(degrees) {
  return THREE.MathUtils.degToRad(normalizeCreativeLookMasterHue(degrees));
}

/** Rotate a color around the HSL wheel; preserves saturation and lightness. */
export function rotateCreativeLookHue(color, degrees) {
  const src = color instanceof THREE.Color ? color : new THREE.Color(color);
  const out = src.clone();
  const hue = normalizeCreativeLookMasterHue(degrees);
  if (Math.abs(hue) < 1e-4) return out;
  const hsl = { h: 0, s: 0, l: 0 };
  out.getHSL(hsl);
  hsl.h = (hsl.h + hue / 360 + 1) % 1;
  out.setHSL(hsl.h, hsl.s, hsl.l);
  return out;
}

const CREATIVE_LOOK_MASTER_HUE_GLSL = /* glsl */ `
uniform float uMasterHue;

vec3 applyCreativeMasterHue(vec3 color) {
  if (abs(uMasterHue) < 0.0001) return color;
  const mat3 RGB_TO_YIQ = mat3(
    0.299, 0.587, 0.114,
    0.596, -0.274, -0.322,
    0.211, -0.523, 0.312
  );
  const mat3 YIQ_TO_RGB = mat3(
    1.0, 0.956, 0.621,
    1.0, -0.272, -0.647,
    1.0, -1.106, 1.703
  );
  vec3 yiq = RGB_TO_YIQ * color;
  float cosA = cos(uMasterHue);
  float sinA = sin(uMasterHue);
  mat2 rot = mat2(cosA, -sinA, sinA, cosA);
  yiq.yz = rot * yiq.yz;
  return clamp(YIQ_TO_RGB * yiq, 0.0, 4.0);
}
`;

const CREATIVE_LOOK_BRIGHTNESS_GLSL = /* glsl */ `
${CREATIVE_LOOK_BRIGHTNESS_UNIFORM_GLSL}

${CREATIVE_LOOK_APPLY_BRIGHTNESS_GLSL}
`;

const CREATIVE_LOOK_SHADOW_FRAGMENT_HEADER = /* glsl */ `
#include <common>
#include <packing>
uniform bool receiveShadow;
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uOrbyShadowColor;
uniform float uOrbyShadowStrength;
uniform float uOrbyShadowOpacity;
`;

function creativeLookFinalColorChain(colorVar, alphaExpr = 'uOpacity', shadowTint = true, skipLiftCrush = false) {
  const shadowBlock = shadowTint
    ? `#ifdef USE_SHADOWMAP
  float orbyShadowAmt = getShadowMask() * uOrbyShadowStrength * uOrbyShadowOpacity;
  ${colorVar} = mix(${colorVar}, uOrbyShadowColor, clamp(orbyShadowAmt, 0.0, 1.0));
  #endif
  `
    : '';
  const liftCrushStep = skipLiftCrush ? '' : `${colorVar} = applyCreativeLiftCrush(${colorVar});
  `;
  return `${liftCrushStep}${shadowBlock}${colorVar} = applyCreativeMasterHue(${colorVar});
  ${colorVar} = applyCreativeBrightness(${colorVar});
  gl_FragColor = vec4(${colorVar}, ${alphaExpr});`;
}

function injectCreativeLookFinalColorChain(combined, shadowTint = true, skipLiftCrush = false) {
  return combined.replace(
    /gl_FragColor = vec4\((\w+), ([^)]+)\);/g,
    (_, colorVar, alphaExpr) =>
      creativeLookFinalColorChain(colorVar, alphaExpr.trim(), shadowTint, skipLiftCrush),
  );
}

/** Prepends shadow-map varyings/uniforms for receiveShadow on Shader Lab materials. */
export function withCreativeLookShadowReceive(fragmentShader) {
  let combined = fragmentShader.trim();
  if (!combined.includes('shadowmap_pars_fragment')) {
    combined = `${CREATIVE_LOOK_SHADOW_FRAGMENT_HEADER}\n${combined}`;
  }
  return combined;
}

/** @param {object} [options] */
export function createCreativeLookShadowUniforms(options = {}) {
  const vals = createShadowTintUniformValues(options);
  return {
    uOrbyShadowColor: { value: vals.color },
    uOrbyShadowStrength: { value: vals.strength },
    uOrbyShadowOpacity: { value: vals.opacity },
  };
}

/** @param {THREE.ShaderMaterial} material */
export function syncCreativeLookShadowTint(material, options = {}) {
  if (!material?.isShaderMaterial || !material.userData?.orbyCreativeLook) return;
  if (!creativeLookPresetUsesShadowReceive(material.userData.orbyCreativeLook)) {
    if (
      material.lights
      || material.uniforms?.directionalLightShadows
      || material.uniforms?.ambientLightColor
    ) {
      clearCreativeLookLightingUniforms(material);
      material.needsUpdate = true;
    }
    return;
  }
  ensureCreativeLookLightingUniforms(material);
  const vals = createShadowTintUniformValues(options);
  if (material.uniforms?.uOrbyShadowColor) {
    material.uniforms.uOrbyShadowColor.value.copy(vals.color);
  }
  if (material.uniforms?.uOrbyShadowStrength) {
    material.uniforms.uOrbyShadowStrength.value = vals.strength;
  }
  if (material.uniforms?.uOrbyShadowOpacity) {
    material.uniforms.uOrbyShadowOpacity.value = vals.opacity;
  }
}

/**
 * Dedicated depth pass for custom Shader Lab materials — avoids incomplete default depth
 * programs that can stall the GL pipeline on some GPUs.
 * @param {THREE.ShaderMaterial} material
 */
export function attachCreativeLookDepthMaterial(material) {
  if (!material?.isShaderMaterial) return;
  if (!material.customDepthMaterial) {
    material.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
  }
}

/** Drop merged `UniformsLib.lights` when a preset does not receive shadow maps. */
export function clearCreativeLookLightingUniforms(material) {
  if (!material?.isShaderMaterial) return;
  material.lights = false;
  for (const key of Object.keys(THREE.UniformsLib.lights)) {
    delete material.uniforms?.[key];
  }
  delete material.uniforms?.receiveShadow;
}

/**
 * Shader Lab sets `material.lights = true` for shadow receive. Three.js then writes
 * `UniformsLib.lights` each frame — merge them once so `ambientLightColor.value = …`
 * does not throw on custom ShaderMaterials (e.g. PS2 Crush + cast shadows).
 * @param {THREE.ShaderMaterial} material
 */
export function ensureCreativeLookLightingUniforms(material) {
  if (!material?.isShaderMaterial) return;
  if (material.uniforms?.ambientLightColor) {
    material.lights = true;
    return;
  }
  material.uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    { receiveShadow: { value: true } },
    material.uniforms,
  ]);
  material.lights = true;
}

/** Prepends lift/crush + master-hue helpers and applies both before output. */
export function withCreativeLookPostProcess(fragmentShader, options = {}) {
  const shadowTint = options.shadowTint !== false;
  const skipLiftCrush = options.skipLiftCrush === true;
  let combined = fragmentShader.trim();
  if (!skipLiftCrush && !combined.includes('uniform float uLiftCrush;')) {
    combined = `${CREATIVE_LOOK_LIFT_CRUSH_GLSL}\n${combined}`;
  }
  if (!combined.includes('uniform float uMasterHue;')) {
    combined = `${CREATIVE_LOOK_MASTER_HUE_GLSL}\n${combined}`;
  }
  if (!combined.includes('uniform float uBrightness;')) {
    combined = `${CREATIVE_LOOK_BRIGHTNESS_GLSL}\n${combined}`;
  }
  if (/\w+ = applyCreativeBrightness\(\w+\);/.test(combined)) {
    return combined;
  }
  if (!skipLiftCrush && /\w+ = applyCreativeLiftCrush\(\w+\);/.test(combined)) {
    return combined;
  }
  if (/\w+ = applyCreativeMasterHue\(\w+\);/.test(combined)) {
    return injectCreativeLookFinalColorChain(combined, shadowTint, skipLiftCrush);
  }
  return injectCreativeLookFinalColorChain(combined, shadowTint, skipLiftCrush);
}

/** Prepends master-hue helper and applies it to the main rgb output. */
export function withCreativeLookMasterHue(fragmentShader) {
  return withCreativeLookPostProcess(fragmentShader);
}

/** @param {THREE.MeshPhysicalMaterial} mat */
export function captureCreativeLookPhysicalHueSources(mat) {
  if (!mat?.isMeshPhysicalMaterial) return;
  mat.userData.orbyCreativeLookHueSources = {
    color: mat.color.clone(),
    specularColor: mat.specularColor?.clone?.() ?? null,
    sheenColor: mat.sheenColor?.clone?.() ?? null,
    attenuationColor: mat.attenuationColor?.clone?.() ?? null,
  };
}

/** @param {THREE.MeshPhysicalMaterial} mat */
export function applyCreativeLookPhysicalMasterHue(mat, degrees, brightness) {
  if (!mat?.isMeshPhysicalMaterial) return;
  const src = mat.userData.orbyCreativeLookHueSources;
  if (!src) return;
  const hue = normalizeCreativeLookMasterHue(degrees);
  const b = Number(brightness);
  const metal = Math.min(1, Math.max(0, Number(mat.metalness ?? 0)));
  const scale = creativeLookBrightnessEffectiveScale(b, { metalness: metal });

  const applyScaled = (target, source) => {
    if (!target || !source) return;
    target.copy(rotateCreativeLookHue(source, hue)).multiplyScalar(scale);
    if (metal > 1e-4) {
      target.r = Math.min(1, Math.max(0, target.r));
      target.g = Math.min(1, Math.max(0, target.g));
      target.b = Math.min(1, Math.max(0, target.b));
    }
  };

  applyScaled(mat.color, src.color);
  if (src.specularColor) {
    applyScaled(mat.specularColor, src.specularColor);
  }
  if (src.sheenColor) {
    applyScaled(mat.sheenColor, src.sheenColor);
  }
  if (src.attenuationColor) {
    applyScaled(mat.attenuationColor, src.attenuationColor);
  }
}

/** @param {string | null | undefined} preset */
export function resolveCreativeLookPresetChoice(preset) {
  let p = typeof preset === 'string' ? preset : '';
  if (p === 'matcap' || p === 'halftone') p = 'spectral-storm';
  if (p === 'vertex-points') p = 'fractal-storm';
  if (p === 'glass-holo') p = 'holographic';
  if (p === 'ordered-dither') p = 'dither-neutral';
  if (p === 'pixel-art') p = 'ega-pixel';
  if (p === 'snes') p = 'vga-dos-3d';
  if (p === 'night-vision') p = 'thermal-acid';
  if (p === 'shutter') p = 'thermal';
  if (p && CREATIVE_LOOK_PRESETS.includes(p)) {
    return /** @type {CreativeLookPreset} */ (p);
  }
  return null;
}

/** @param {string | null | undefined} preset */
export function normalizeCreativeLookPreset(preset) {
  return resolveCreativeLookPresetChoice(preset) ?? 'neon-edge';
}

/** @param {CreativeLookPreset | string | undefined} preset */
export function creativeLookUsesRetroDecimation(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return id === 'ps2-crush' || id === 'psx' || id === 'vga-dos-3d' || id === 'watercolour' || id === 'sketch' || id === 'sketch-colour' || id === 'gouache';
}

/** Fixed pattern scale for retro console presets and ASCII Art, or `null` if live scale applies. */
export function creativeLookFixedPatternScale(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'ascii-art') return creativeLookAsciiFixedScale();
  if (id === 'ascii-art-2') return creativeLookAscii3FixedScale();
  if (id === 'ascii-art-3') return creativeLookAscii2FixedScale();
  if (id === 'ascii-art-4') return creativeLookAscii4FixedScale();
  if (id === 'ega-pixel') return creativeLookEgaFixedScale();
  if (id === 'c64-pixel') return creativeLookC64FixedScale();
  if (id === 'gameboy-pixel') return creativeLookGameBoyFixedScale();
  if (id === 'nes-pixel') return creativeLookNesFixedScale();
  if (id === 'megadrive-pixel') return creativeLookMegaDriveFixedScale();
  if (id === 'intellivision-pixel') return creativeLookIntellivisionFixedScale();
  if (id === 'gba-pixel') return creativeLookGbaFixedScale();
  if (id === 'apple2-pixel') return creativeLookApple2FixedScale();
  const voxelScale = creativeLookVoxelFixedScale(preset);
  if (voxelScale != null) return voxelScale;
  return creativeLookRetroConsoleFixedScale(preset);
}

/** Whether Shader Lab Master Hue is locked (fixed palette). */
export function creativeLookPresetLocksMasterHue(_preset) {
  return false;
}

/** Whether Shader Lab Scale slider is locked (fixed grid). */
export function creativeLookPresetLocksPatternScale(preset) {
  return creativeLookFixedPatternScale(preset) != null;
}

/** Whether Shader Lab Intensity slider is locked (fixed baked look). */
export function creativeLookPresetLocksIntensity(preset) {
  return (
    isAsciiCreativeLookPreset(preset) ||
    isEgaPixelCreativeLookPreset(preset) ||
    isC64PixelCreativeLookPreset(preset) ||
    isGameBoyPixelCreativeLookPreset(preset) ||
    isNesPixelCreativeLookPreset(preset) ||
    isMegaDrivePixelCreativeLookPreset(preset) ||
    isIntellivisionPixelCreativeLookPreset(preset) ||
    isGbaPixelCreativeLookPreset(preset) ||
    isApple2PixelCreativeLookPreset(preset)
  );
}

/** Whether Shader Lab anim speed / pause controls apply (preset reads animated `uTime`). */
export function creativeLookPresetUsesShaderAnimation(preset) {
  const id = normalizeCreativeLookPreset(preset);
  return (
    id === 'flow-field' ||
    id === 'plasma' ||
    id === 'holographic' ||
    id === 'holo-glass' ||
    id === 'crystal-gem' ||
    id === 'spectral-storm' ||
    id === 'chrome-plasma' ||
    id === 'voronoi' ||
    id === 'scanline-hologram' ||
    id === 'wire-pulse' ||
    id === 'fractal-storm' ||
    id === 'holo-topo' ||
    id === 'dust-field' ||
    id === 'vectrex' ||
    id === 'ps2-crush' ||
    id === 'psx' ||
    id === 'watercolour' ||
    id === 'sketch' ||
    id === 'sketch-colour' ||
    id === 'gouache' ||
    id === 'ascii-art-4' ||
    id === 'thermal' ||
    id === 'thermal-extreme' ||
    id === 'thermal-acid'
  );
}

/** Fixed intensity for presets that lock the slider, or `null`. */
export function creativeLookFixedIntensity(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'ascii-art') return creativeLookAsciiFixedIntensity();
  if (id === 'ascii-art-2') return creativeLookAscii3FixedIntensity();
  if (id === 'ascii-art-3') return creativeLookAscii2FixedIntensity();
  if (id === 'ascii-art-4') return creativeLookAscii4FixedIntensity();
  if (id === 'ega-pixel') return creativeLookEgaFixedIntensity();
  if (id === 'c64-pixel') return creativeLookC64FixedIntensity();
  if (id === 'gameboy-pixel') return creativeLookGameBoyFixedIntensity();
  if (id === 'nes-pixel') return creativeLookNesFixedIntensity();
  if (id === 'megadrive-pixel') return creativeLookMegaDriveFixedIntensity();
  if (id === 'intellivision-pixel') return creativeLookIntellivisionFixedIntensity();
  if (id === 'gba-pixel') return creativeLookGbaFixedIntensity();
  if (id === 'apple2-pixel') return creativeLookApple2FixedIntensity();
  return null;
}

/** Fixed pattern scale for retro console presets, or `null` if live scale applies. */
export function creativeLookRetroConsoleFixedScale(preset) {
  const id = normalizeCreativeLookPreset(preset);
  if (id === 'ps2-crush') return CREATIVE_PS2_CRUSH_PATTERN_SCALE;
  if (id === 'psx') return CREATIVE_PSX_PATTERN_SCALE;
  if (id === 'vga-dos-3d') return CREATIVE_VGA_DOS_3D_PATTERN_SCALE;
  return null;
}

/** Human-readable Shader Lab preset name for toasts / status copy. */
export function formatCreativeLookPresetLabel(preset) {
  const id = normalizeCreativeLookPreset(preset);
  const labels = /** @type {const} */ ({
    'neon-edge': 'Neon Edge',
    'flow-field': 'Flow Field',
    plasma: 'Plasma',
    toon: 'Toon',
    'ega-pixel': 'EGA Pixel',
    'c64-pixel': 'C64 Pixel',
    'gameboy-pixel': 'Game Boy',
    'nes-pixel': 'NES',
    'megadrive-pixel': 'Mega Drive',
    'intellivision-pixel': 'Intellivision',
    'gba-pixel': 'Game Boy Advance',
    'apple2-pixel': 'Apple II',
    'dither-neutral': 'Neutral',
    'dither-tritone': 'Tritone',
    'dither-crosshatch': 'Crosshatch',
    'dither-raster': 'Raster',
    'ascii-art': 'ASCII Art',
    'ascii-art-2': 'ASCII 2',
    'ascii-art-3': 'ASCII 3',
    'ascii-art-4': 'ASCII 4',
    holographic: 'Holographic',
    'spectral-storm': 'Spectral Storm',
    'chrome-plasma': 'Chrome Plasma',
    voronoi: 'Voronoi',
    'scanline-hologram': 'Scanline Hologram',
    'wire-pulse': 'Wire Pulse',
    'fractal-storm': 'Topo Minimal',
    'holo-topo': 'Holographic 2',
    'dust-field': 'Dust Field',
    'ps2-crush': 'PS2 Crush',
    psx: 'PSX',
    'vga-dos-3d': 'VGA/DOS 3D',
    vectrex: 'Vectrex',
    'voxel-hd': 'Voxel HD',
    watercolour: 'Watercolour',
    sketch: 'Sketch',
    'sketch-colour': 'Sketch Colour',
    gouache: 'Gouache',
    chrome: 'True Chrome',
    glass: 'Glass',
    'holo-glass': 'Holo Glass',
    'crystal-gem': 'Crystal Gem',
    thermal: 'Thermal',
    'thermal-extreme': 'Thermal Extreme',
    'thermal-acid': 'Thermal Acid',
  });
  return labels[id] ?? id;
}

/**
 * Near-mirror chrome: lower roughness at small pattern scales, softer at large scales.
 * HDRI blur slider mixes toward rougher reflections (matches studio HDRI controls).
 * Higher `CREATIVE_CHROME_REFLECTION_SOFTNESS` + baseline curve = less mirror-crisp IBL.
 * @param {number} patternScale — creative look scale slider (0.1–5)
 * @param {number} [hdriBlurriness] — 0–1 scene HDRI blur
 */
const CREATIVE_CHROME_REFLECTION_SOFTNESS = 2.45;

export function creativeChromeRoughness(patternScale, hdriBlurriness = 0) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const raw = THREE.MathUtils.clamp(0.02 + ps * 0.022, 0.014, 0.22);
  const base = Math.min(1, raw * CREATIVE_CHROME_REFLECTION_SOFTNESS);
  const blur = THREE.MathUtils.clamp(Number(hdriBlurriness) || 0, 0, 1);
  if (blur > 0) {
    return Math.min(1, base + (1 - base) * blur);
  }
  return base;
}

export { creativeAsciiCellSize, creativeLookAsciiFixedScale, creativeLookAsciiFixedIntensity } from './creativeLookAsciiArt.js';

/**
 * Average-edge-length multiplier for PS2 Crush edge-collapse threshold.
 * Higher creative Scale → coarser low-poly (surface-following edge collapse only).
 * @param {number} patternScale — Creative Scale (typically 0.02–5)
 */
export function creativePs2CrushMergeFactor(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  const base = THREE.MathUtils.lerp(1.12, 2.85, t);
  return base * 1.155;
}

/**
 * Screen-space snap grid for PS2 vertex wobble (NDC units).
 * Higher creative Scale → chunkier internal resolution.
 * @param {number} patternScale
 */
export function creativePs2CrushSnapGrid(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  // Subtle screen snap for PS1-style wobble — geometry carries the low-poly read.
  return THREE.MathUtils.lerp(200, 56, t);
}

/**
 * Target max edge for PS2 Crush diffuse bake (world-space tex density at creative Scale).
 * @param {number} patternScale
 */
export function creativePs2CrushTexRes(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  // ~109 px max edge at locked scale 2 — bilinear filtered at sample (authentic PS2).
  return Math.round(THREE.MathUtils.lerp(160, 32, t));
}

/**
 * Downscale a diffuse map for PS2 Crush — low-res bake + LinearFilter at sample time.
 * Does not mutate the source texture.
 * @param {THREE.Texture} source
 * @param {number} texRes — max edge length from {@link creativePs2CrushTexRes}
 * @returns {THREE.Texture}
 */
export function bakePs2CrushDiffuseMap(source, texRes) {
  if (!source?.isTexture) return source;

  const targetMax = Math.max(8, Math.round(texRes));
  const img = source.image;
  const srcW = img?.width ?? img?.videoWidth ?? 0;
  const srcH = img?.height ?? img?.videoHeight ?? 0;

  const applyLinearSampling = (tex) => {
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  };

  if (!srcW || !srcH) {
    return applyLinearSampling(source.clone());
  }

  const scale = targetMax / Math.max(srcW, srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  if (srcW <= dstW && srcH <= dstH) {
    const copy = source.clone();
    copy.minFilter = source.minFilter;
    copy.magFilter = source.magFilter;
    return applyLinearSampling(copy);
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return applyLinearSampling(source.clone());
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(img, 0, 0, dstW, dstH);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = source.flipY;
  tex.wrapS = source.wrapS;
  tex.wrapT = source.wrapT;
  if ('colorSpace' in tex) {
    tex.colorSpace = source.colorSpace ?? THREE.SRGBColorSpace;
  }
  return applyLinearSampling(tex);
}

/**
 * Average-edge-length multiplier for PSX edge-collapse — coarser than PS2.
 * @param {number} patternScale
 */
export function creativePsxMergeFactor(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  const base = THREE.MathUtils.lerp(1.35, 3.35, t);
  return base * 1.2;
}

/** Screen-space snap grid for PSX vertex wobble — chunkier than PS2. */
export function creativePsxSnapGrid(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  return THREE.MathUtils.lerp(128, 40, t);
}

/**
 * PSX diffuse resolution — lower than PS2; used for nearest bake + UV quant.
 * @param {number} patternScale
 */
export function creativePsxTexRes(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  // ~52 px max edge at locked scale 2.5.
  return Math.round(THREE.MathUtils.lerp(96, 8, t));
}

/**
 * Downscale a diffuse map for PSX — nearest-neighbor bake + NearestFilter at sample.
 * @param {THREE.Texture} source
 * @param {number} texRes
 * @returns {THREE.Texture}
 */
export function bakePsxDiffuseMap(source, texRes) {
  if (!source?.isTexture) return source;

  const targetMax = Math.max(4, Math.round(texRes));
  const img = source.image;
  const srcW = img?.width ?? img?.videoWidth ?? 0;
  const srcH = img?.height ?? img?.videoHeight ?? 0;

  const applyNearestSampling = (tex) => {
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  };

  if (!srcW || !srcH) {
    return applyNearestSampling(source.clone());
  }

  const scale = targetMax / Math.max(srcW, srcH);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  if (srcW <= dstW && srcH <= dstH) {
    return applyNearestSampling(source.clone());
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return applyNearestSampling(source.clone());
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, dstW, dstH);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = source.flipY;
  tex.wrapS = source.wrapS;
  tex.wrapT = source.wrapT;
  if ('colorSpace' in tex) {
    tex.colorSpace = source.colorSpace ?? THREE.SRGBColorSpace;
  }
  return applyNearestSampling(tex);
}

/**
 * Average-edge-length multiplier for VGA/DOS 3D edge-collapse — lighter than PSX
 * (DOS shooters kept small portal faces; avoid huge facet blocks).
 * @param {number} patternScale
 */
export function creativeVgaDos3dMergeFactor(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  const base = THREE.MathUtils.lerp(1.08, 2.45, t);
  return base * 1.02;
}

/** Screen-space snap grid for VGA/DOS 3D stable pixelation (no vertex drift). */
export function creativeVgaDos3dSnapGrid(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  // ~640×400 feel at locked scale 2.2 — finer than raw 320×200 but still chunky.
  return THREE.MathUtils.lerp(360, 150, t);
}

/**
 * VGA/DOS 3D diffuse resolution — nearest bake + UV quant (chunky affine texels).
 * @param {number} patternScale
 */
export function creativeVgaDos3dTexRes(patternScale) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.02, 5);
  const t = (ps - 0.02) / (5 - 0.02);
  return Math.round(THREE.MathUtils.lerp(112, 28, t));
}

/** Shader Lab glass — HDRI reflection scale (transmission already carries the backdrop). */
export const CREATIVE_GLASS_ENV_MAP_MUL = 0.58;

/** Default Lift/Crush when selecting Glass — tames transmission / env blowout. */
export const CREATIVE_GLASS_DEFAULT_LIFT_CRUSH = -0.75;

export const CREATIVE_GLASS_BASE_SPECULAR_INTENSITY = 0.72;
export const CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE = 1.05;

/**
 * Env / specular exposure from Lift/Crush — physical glass skips the GLSL crush pass.
 * @param {number | undefined} liftCrush
 */
export function creativeGlassLiftCrushExposureMul(liftCrush) {
  const crush = Math.max(-normalizeCreativeLookLiftCrush(liftCrush), 0);
  if (crush < 0.0001) return 1;
  return 1 - crush * 0.57;
}

/**
 * @param {number} intensity — Shader Lab intensity + HDRI env strength
 * @param {number} litEnvMul — object material brightness env multiplier
 * @param {number | undefined} liftCrush
 */
export function creativeGlassEnvMapIntensity(intensity, litEnvMul, liftCrush) {
  return (
    intensity
    * litEnvMul
    * CREATIVE_GLASS_ENV_MAP_MUL
    * creativeGlassLiftCrushExposureMul(liftCrush)
  );
}

/**
 * Sync physical glass from Shader Lab Lift/Crush + scale (live slider path).
 * @param {import('three').MeshPhysicalMaterial} material
 * @param {{
 *   patternScale?: number,
 *   hdriBlurriness?: number,
 *   mesh?: import('three').Mesh | null,
 *   intensity?: number,
 *   litEnvMul?: number,
 *   liftCrush?: number,
 *   envTexture?: import('three').Texture | null,
 * }} opts
 */
export function syncCreativeLookGlassPhysical(material, opts = {}) {
  if (!material?.isMeshPhysicalMaterial) return;
  const patternScale = THREE.MathUtils.clamp(Number(opts.patternScale) || 1, 0.02, 5);
  const hdriBlur = THREE.MathUtils.clamp(Number(opts.hdriBlurriness) || 0, 0, 1);
  const crushMul = creativeGlassLiftCrushExposureMul(opts.liftCrush);
  const { thickness, roughness } = creativeGlassParamsForMesh(
    patternScale,
    hdriBlur,
    opts.mesh ?? null,
  );
  material.thickness = thickness;
  material.roughness = roughness;
  material.transmission = 1;
  if (opts.envTexture) {
    material.envMap = opts.envTexture;
  }
  if (material.envMapIntensity !== undefined) {
    material.envMapIntensity = creativeGlassEnvMapIntensity(
      Number(opts.intensity) || 0,
      Number(opts.litEnvMul) || 1,
      opts.liftCrush,
    );
  }
  material.specularIntensity = CREATIVE_GLASS_BASE_SPECULAR_INTENSITY * crushMul;
  material.attenuationDistance = CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE
    * Math.max(crushMul, 0.35);
  material.transparent = true;
  material.opacity = 1;
  material.depthWrite = false;
}

/**
 * Physical transmission glass/water: thickness + roughness from creative Scale; HDRI blur adds frost.
 * @returns {{ thickness: number, roughness: number }}
 */
export function creativeGlassParams(patternScale, hdriBlurriness = 0) {
  const ps = THREE.MathUtils.clamp(patternScale, 0.1, 5);
  const thickness = THREE.MathUtils.clamp(0.18 + ps * 0.42, 0.12, 2.6);
  let roughness = THREE.MathUtils.clamp(
    0.052 + Math.abs(ps - 1) * 0.072,
    0.032,
    0.48,
  );
  const blur = THREE.MathUtils.clamp(Number(hdriBlurriness) || 0, 0, 1);
  if (blur > 0) {
    roughness = Math.min(1, roughness + blur * 0.42);
  }
  return { thickness, roughness };
}

/**
 * Scale glass slab thickness to mesh size — extruded type (~0.36 cap height) needs thinner
 * slabs than vehicle-scale defaults or refraction reads as flat alpha.
 *
 * @param {number} patternScale
 * @param {number} hdriBlurriness
 * @param {THREE.Mesh | null | undefined} mesh
 * @returns {{ thickness: number, roughness: number }}
 */
export function creativeGlassParamsForMesh(patternScale, hdriBlurriness, mesh) {
  const base = creativeGlassParams(patternScale, hdriBlurriness);
  if (!mesh?.geometry) return base;
  if (!mesh.geometry.boundingSphere) {
    mesh.geometry.computeBoundingSphere();
  }
  const radius = mesh.geometry.boundingSphere?.radius;
  if (!Number.isFinite(radius) || radius <= 1e-6) return base;
  const meshThickness = THREE.MathUtils.clamp(
    radius * THREE.MathUtils.lerp(0.22, 0.42, THREE.MathUtils.clamp(base.thickness / 2.6, 0, 1)),
    0.012,
    base.thickness,
  );
  return { ...base, thickness: meshThickness };
}

/**
 * Always compute world position — Three r167+ `worldpos_vertex` only declares
 * `worldPosition` when USE_SHADOWMAP / USE_ENVMAP / USE_TRANSMISSION etc. are defined.
 */
const CREATIVE_LOOK_WORLD_POSITION_VS = /* glsl */ `
  vec4 worldPosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    worldPosition = batchingMatrix * worldPosition;
  #endif
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;
`;

const NEON_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
varying vec3 vNormalView;
varying vec3 vPosView;
void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vNormalView = normalize(transformedNormal);
  vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
  vPosView = mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const NEON_FRAGMENT = /* glsl */ `
varying vec3 vNormalView;
varying vec3 vPosView;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
uniform float uRimPower;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec3 viewDir = normalize(-vPosView);
  float ndotv = max(dot(normalize(vNormalView), viewDir), 0.0);
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float rimPower = uRimPower * (1.0 - d * 0.65);
  vec3 core = uCoreColor * (1.0 - d * 0.62);
  vec3 edge = uEdgeColor * (1.0 + d * 0.42);
  float rim = pow(1.0 - ndotv, rimPower);
  vec3 color = mix(core, edge, rim);
  gl_FragColor = vec4(color, uOpacity);
}
`;

const FLOW_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
varying vec3 vWorldPosition;
void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const FLOW_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;

void main() {
  vec3 p = vWorldPosition * (0.35 / max(uPatternScale, 0.001));
  float t = uTime;
  float n = sin(p.x + t) * cos(p.y - t * 0.6) + sin(p.z * 1.2 + t * 0.35);
  float m = n * 0.5 + 0.5;
  vec3 col = mix(uColorA, uColorB, m);
  float bands = sin(dot(p, vec3(1.0, 1.3, 0.7)) * 2.5 + t) * 0.5 + 0.5;
  col = mix(col, uColorB * 1.1, bands * 0.25);
  gl_FragColor = vec4(col, uOpacity);
}
`;

const PLASMA_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uOpacity;

void main() {
  vec3 p = vWorldPosition * (1.15 / max(uPatternScale, 0.001));
  float t = uTime;
  float w1 = sin(p.x * 2.1 + t * 1.05) + sin(p.y * 2.35 - t * 0.88) + sin(p.z * 1.62 + t * 0.72);
  float w2 = sin(length(p.xy) * 3.4 + t * 2.1);
  float w3 = sin(dot(p, vec3(0.95, 1.35, 1.05)) * 2.75 - t * 1.35);
  float v = w1 + w2 * 0.62 + w3 * 0.48;
  vec3 col = 0.5 + 0.5 * cos(v * vec3(2.15, 2.45, 2.75) + t * 0.55 + vec3(0.0, 2.15, 4.35));
  col = clamp(col, vec3(0.0), vec3(1.0));
  col = pow(col, vec3(0.88));
  col *= orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);
  gl_FragColor = vec4(col, uOpacity);
}
`;

const WORLD_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const WORLD_SURFACE_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
varying vec3 vOrbyNm0;
varying vec3 vOrbyNm1;
varying vec3 vOrbyNm2;
varying vec3 vOrbyWm0;
varying vec3 vOrbyWm1;
varying vec3 vOrbyWm2;
void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  vOrbyLocalPos = transformed;
  vOrbyLocalNormal = normalize(objectNormal);
  vOrbyNm0 = normalMatrix[0];
  vOrbyNm1 = normalMatrix[1];
  vOrbyNm2 = normalMatrix[2];
  mat3 worldNm = mat3(transpose(inverse(modelMatrix)));
  vOrbyWm0 = worldNm[0];
  vOrbyWm1 = worldNm[1];
  vOrbyWm2 = worldNm[2];
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const TOON_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform vec3 uLightDir;
uniform vec3 uShadow;
uniform vec3 uLight;
uniform float uBands;
uniform float uLightScale;
uniform float uAmbientFloor;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float b = max(uBands, 2.0);
  float idx = floor(ndl * b);
  float stepped = idx / max(b - 1.0, 1.0);
  stepped = clamp(stepped, 0.0, 1.0);
  vec3 shadowCol = uShadow * max(uAmbientFloor, 0.15);
  vec3 lightCol = uLight * uLightScale;
  vec3 col = mix(shadowCol, lightCol, stepped);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  col += rim * vec3(0.12, 0.18, 0.48);
  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Voxel looks — baked vertex colours; flat albedo (no extra shading). */
const VOXEL_VERTEX = /* glsl */ `
#include <common>
#include <color_pars_vertex>
void main() {
  #include <color_vertex>
  vec3 transformed = position;
  vec3 objectNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const VOXEL_FRAGMENT = /* glsl */ `
#include <color_pars_fragment>
uniform float uOpacity;

void main() {
  vec3 col = clamp(vColor, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Colormap prepass — soft wrap + light bands (fuzzy base, some edge hooks). */
const WATERCOLOUR_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vTexAffine;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uOpacity;

void main() {
  vec3 baseCol = clamp(uTint, vec3(0.0), vec3(1.0));
  float mapAlpha = 1.0;
  if (uHasMap > 0.5) {
    vec2 uvAff = vTexAffine.xy / max(vTexAffine.z, 1e-5);
    vec4 mapSample = texture2D(uMap, uvAff);
    baseCol = mapSample.rgb;
    mapAlpha = mapSample.a;
  }

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float bands = ${WATERCOLOUR_LIGHT_BANDS.toFixed(1)};
  float stepped = floor(ndl * bands) / max(bands - 1.0, 1.0);
  float wrap = smoothstep(0.0, 1.0, ndl * 0.3 + 0.7);
  float shadeT = mix(stepped, wrap, ${WATERCOLOUR_PREPASS_SOFT_BLEND.toFixed(2)});
  float shade = mix(${WATERCOLOUR_SHADE_FLOOR.toFixed(2)}, ${WATERCOLOUR_SHADE_CEIL.toFixed(2)}, shadeT);
  float bandInk = abs(fract(ndl * bands - 0.001) - 0.5) * 2.0;
  shade *= 1.0 - smoothstep(0.84, 1.0, bandInk) * ${WATERCOLOUR_BAND_INK_STRENGTH.toFixed(3)};
  vec3 col = baseCol * shade;

  gl_FragColor = vec4(col, uOpacity * mapAlpha);
}
`;

/** Shared flat-post mesh vertex (EGA, C64, Game Boy, etc.). */
const PIXEL_ART_VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  #include <uv_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  vWorldPosition = worldPosition.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

/**
 * Rich iridescent / thin-film look: near-black body, oil-slick phase warp,
 * chromatic phase offsets at grazing angles, layered Fresnel + sharp spec (in-shader “bloom friend” via toneMapped off).
 */
const HOLOGRAPHIC_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec3 N = orbyCreativeSurfaceNormal(
    normalize(vWorldNormal),
    vWorldPosition,
    vOrbyLocalPos,
    vOrbyLocalNormal,
    mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2)
  );
  float surfMod = orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndv = max(dot(N, V), 1e-4);
  float F = 1.0 - ndv;
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);

  float fresnelWide = pow(F, 1.28);
  float fresnel = pow(F, 2.05);
  float fresnelTight = pow(F, 5.0);

  // Slider 0.1–5 is linear in the UI; map through log₂(scale) so equal steps feel even in pattern size.
  // Pin scale=1 to w=1.35 (legacy look); taper ends so low/high scales are not hyperbolic extremes.
  float sc = clamp(uPatternScale, 0.1, 5.0);
  float logMin = -3.321928094887362;
  float logMax = 2.321928094887362;
  float u = (log2(sc) - logMin) / (logMax - logMin);
  float wFreq = mix(2.923, 0.25, u);
  vec3 pw = vWorldPosition * wFreq;
  float t = uTime * (wFreq / 1.35);

  float oil =
    sin(pw.x * 0.72 + t * 0.72) * cos(pw.y * 0.78 - t * 0.62) +
    sin(pw.z * 0.68 + t * 0.42) * 0.45 +
    sin(dot(pw, vec3(0.72, 1.02, 0.58)) * 1.05 + t * 0.85) * 0.35;
  oil *= 1.0 - down * 0.45 + up * 0.72;
  oil *= surfMod;

  float film =
    fresnel * (6.2 + up * 2.2 - down * 2.0) +
    oil * (1.45 + up * 0.6 - down * 0.5) +
    dot(N, vec3(0.15, 0.97, 0.18)) * (0.38 + up * 0.14 - down * 0.16) +
    t * (0.48 + up * 0.2 - down * 0.2);

  float chrom = fresnel * fresnel * (1.55 + up * 0.2 - down * 0.7);
  vec3 phase = film * vec3(3.45, 4.15, 4.95) + vec3(0.0, 2.2, 5.0);
  phase += vec3(chrom * 1.05, -chrom * 0.78, chrom * 0.92);

  vec3 holo = 0.5 + 0.53 * cos(phase);
  holo *= 0.96 + 0.04 * sin(film * 4.2 + t * 1.15);
  holo = pow(max(holo, vec3(0.0)), vec3(0.93 - down * 0.07 + up * 0.07));

  vec3 base = vec3(0.0035, 0.0065, 0.0165);
  float rimMix = fresnelWide * 0.82 + fresnel * 0.58 + fresnelTight * 0.38;
  rimMix = clamp(rimMix * (1.0 + up * 0.28 - down * 0.58), 0.0, 1.0);
  vec3 col = mix(base, holo, rimMix);

  vec3 L = normalize(vec3(0.42, 0.9, 0.36));
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spHi = pow(nh, 228.0);
  float spLo = pow(nh, 68.0);
  vec3 specTint = mix(vec3(0.72, 0.94, 1.05), vec3(1.05, 0.58, 0.92), fresnel);
  col += specTint * (spHi * 1.25 + spLo * 0.38) * (0.18 + fresnel * 0.92) * (1.0 + up * 0.2 - down * 0.33);

  vec3 rimPink = vec3(1.0, 0.28, 0.82);
  col += fresnelTight * rimPink * (0.62 + up * 0.43 - down * 0.44);
  col += fresnel * vec3(0.1, 0.48, 1.05) * (0.48 + up * 0.24 - down * 0.26);
  col += oil * (fresnel + 0.15) * vec3(0.2, 0.88, 1.0) * (0.14 + up * 0.1 - down * 0.08);

  col *= orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);

  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Slow BW plasma: extreme contrast, mostly pure black/white with thin animated boundary (`uTime`). */
const SPECTRAL_STORM_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec3 N = orbyCreativeSurfaceNormal(
    normalize(vWorldNormal),
    vWorldPosition,
    vOrbyLocalPos,
    vOrbyLocalNormal,
    mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2)
  );
  vec3 p = vWorldPosition * (2.6 / max(uPatternScale, 0.001));
  float t = uTime;
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);

  float wave =
    sin(p.x * 3.5 + t * 2.05) * cos(p.y * 3.0 - t * 1.6) +
    sin(p.z * 4.2 + t * 2.5) * 0.92 +
    sin(dot(p, vec3(1.08, 0.95, 1.18)) * 5.8 + t * 3.9) * 0.68;

  float radial = sin(length(p.xy) * 6.5 - t * 5.4);
  wave += radial * 0.58;

  float slices = sin(wave * 8.5 + t * 2.35);
  float poster = smoothstep(0.12, 0.88, slices * 0.5 + 0.5);

  float plasma = wave * 0.15 + radial * 0.11 + (poster - 0.5) * (0.26 + up * 0.12 - down * 0.12);
  plasma = plasma * 0.62 + 0.5;
  plasma = clamp(plasma, 0.0, 1.0);
  plasma = clamp((plasma - 0.5) * (8.5 + up * 3.0 - down * 4.5) + 0.5, 0.0, 1.0);

  float sweep = sin(t * 0.5 + dot(p, vec3(2.05, 1.62, 2.35)) * 3.4) * (0.035 + up * 0.02 - down * 0.015);
  float bw = smoothstep(0.458 - up * 0.01 + down * 0.01 + sweep, 0.542 + up * 0.01 - down * 0.01 + sweep, plasma);

  vec3 col = vec3(bw);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2 - up * 0.6 + down * 1.0);
  float strobe = sin(t * (15.0 + up * 3.0 - down * 5.0) + dot(p, vec3(8.5, 5.3, 7.1))) * 0.5 + 0.5;
  float rimGate = rim * (0.42 + 0.58 * strobe + up * 0.16 - down * 0.2);
  col = mix(col, vec3(1.0), rimGate * (0.82 + up * 0.23 - down * 0.47));

  col *= orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);

  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Liquid chrome plasma — domain-warped neon marbling on Orby black with mirror Fresnel streaks. */
const CHROME_PLASMA_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

const vec3 CP_BASE = vec3(0.03137, 0.03137, 0.03137);

// Fract hash (no sin) — same family as Voronoi look in this file.
float cpHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float cpNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = cpHash(i);
  float n100 = cpHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = cpHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = cpHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = cpHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = cpHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = cpHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = cpHash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

// 3 octaves — domain warp only needs large-scale flow, not fine grain.
float cpFbmWarp(vec3 p) {
  float v = cpNoise(p);
  p = p * 2.03 + 1.7;
  v += 0.5 * cpNoise(p);
  p = p * 2.03 + 1.7;
  return v + 0.25 * cpNoise(p);
}

// 4 octaves — final marbling detail (was 5; imperceptible at this contrast).
float cpFbm(vec3 p) {
  float v = cpNoise(p);
  p = p * 2.03 + 1.7;
  v += 0.5 * cpNoise(p);
  p = p * 2.03 + 1.7;
  v += 0.25 * cpNoise(p);
  p = p * 2.03 + 1.7;
  return v + 0.125 * cpNoise(p);
}

vec3 cpNeonRamp(float phase) {
  float t = fract(phase);
  vec3 electricBlue = vec3(0.0, 0.5, 1.0);
  vec3 cyan = vec3(0.0, 1.0, 1.0);
  vec3 magenta = vec3(1.0, 0.0, 1.0);
  vec3 mid = mix(electricBlue, cyan, smoothstep(0.0, 0.45, t));
  vec3 hi = mix(cyan, magenta, smoothstep(0.45, 0.88, t));
  return mix(mid, hi, smoothstep(0.35, 0.92, t));
}

void main() {
  vec3 N = orbyCreativeSurfaceNormal(
    normalize(vWorldNormal),
    vWorldPosition,
    vOrbyLocalPos,
    vOrbyLocalNormal,
    mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2)
  );
  float surfMod = orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);

  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);

  float sc = clamp(uPatternScale, 0.1, 5.0);
  float freq = mix(2.65, 0.52, (sc - 0.1) / 4.9);
  vec3 flowDir = normalize(vec3(0.72, -0.62, 0.28));
  float t = uTime * 0.34;
  vec3 p = vWorldPosition * freq + flowDir * t;

  // First warp: 2 FBM samples + derived Z (was 3 full FBM).
  float q0 = cpFbmWarp(p + vec3(0.0, 0.0, t * 0.22));
  float q1 = cpFbmWarp(p + vec3(5.2, 1.3, t * 0.18));
  vec3 q = vec3(q0, q1, mix(q0, q1, 0.58) + cpNoise(p + vec3(1.7, 4.8, t * 0.24)) * 0.42);

  // Second warp: 2 FBM samples + derived Z (was 3 full FBM).
  vec3 pq = p + 4.0 * q;
  float r0 = cpFbmWarp(pq + vec3(8.3, 2.8, t * 0.15));
  float r1 = cpFbmWarp(pq + vec3(3.1, 6.7, t * 0.19));
  vec3 r = vec3(r0, r1, mix(r0, r1, 0.52) + cpNoise(pq + vec3(6.2, 1.4, t * 0.21)) * 0.38);

  float plasma = cpFbm(p + 3.5 * r);
  plasma += cpFbm(p * 1.85 + q * 2.15 + t * 0.12) * 0.58;
  plasma = mix(plasma, cpFbm(p * 0.62 - flowDir * t * 0.42 + r * 1.75), 0.36);

  // Fine striations: single noise sample at high freq (was full FBM).
  float hair = abs(cpNoise(p * 4.8 + r * 2.4 + t * 0.28) - 0.5) * 2.0;
  plasma += (0.5 - hair) * 0.14 * (0.65 + up * 0.35 - down * 0.25);

  float field = plasma * 0.62 + 0.5;
  field = pow(clamp(field, 0.0, 1.0), mix(2.15, 1.32, up) + down * 0.75);
  field = clamp((field - 0.5) * (5.8 + up * 2.4 - down * 2.1) + 0.5, 0.0, 1.0);

  float inkGate = smoothstep(
    0.27 - up * 0.06 + down * 0.08,
    0.44 - up * 0.04 + down * 0.06,
    field
  );

  float phase = field * 4.35 + plasma * 2.65 + t * 0.38 + dot(r, vec3(1.2, 0.8, 1.5)) * 1.75;
  vec3 plasmaCol = cpNeonRamp(phase);
  plasmaCol = mix(CP_BASE, plasmaCol, inkGate);
  plasmaCol = pow(max(plasmaCol, vec3(0.0)), vec3(0.92 - down * 0.06 + up * 0.05));

  vec3 col = plasmaCol;

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndv = max(dot(N, V), 1e-4);
  float F = pow(1.0 - ndv, mix(2.9, 1.55, up));
  float fresnelTight = pow(1.0 - ndv, 6.2);

  vec3 L = normalize(vec3(0.38, 0.88, 0.42));
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float specHi = pow(nh, 220.0 + up * 45.0);
  float specLo = pow(nh, 68.0);
  vec3 specTint = mix(vec3(0.68, 0.92, 1.05), vec3(1.0, 0.42, 0.95), F);
  col += specTint * (specHi * 1.42 + specLo * 0.4) * (0.2 + F * 1.05) * inkGate;

  col += fresnelTight * mix(vec3(0.12, 0.72, 1.0), vec3(1.0, 0.28, 0.88), field) * (0.34 + up * 0.24) * inkGate;
  col += F * plasmaCol * (0.16 + up * 0.12) * inkGate;

  col = max(col, CP_BASE * inkGate);
  col *= surfMod;

  gl_FragColor = vec4(col, uOpacity);
}
`;

/** World-space 3D Voronoi: stained-glass cells, dark grout, slow seed drift. Scale = cell size. */
const VORONOI_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform vec3 uTint;
uniform float uOpacity;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

void main() {
  float sc = clamp(uPatternScale, 0.1, 5.0);
  float cellFreq = 1.65 / max(sc, 0.001);
  vec3 p = vWorldPosition * cellFreq;
  float t = uTime * 0.38;

  vec3 ip = floor(p);
  vec3 fp = fract(p);

  float md = 8.0;
  float md2 = 8.0;
  vec3 nearestSeed = vec3(0.0);

  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 g = vec3(float(i), float(j), float(k));
        vec3 rnd = hash33(ip + g);
        vec3 o = 0.5 + 0.38 * sin(t * vec3(1.05, 0.88, 1.22) + rnd * 6.28318);
        vec3 r = g + o - fp;
        float d = dot(r, r);
        if (d < md) {
          md2 = md;
          md = d;
          nearestSeed = ip + g;
        } else if (d < md2) {
          md2 = d;
        }
      }
    }
  }

  float edge = sqrt(md2) - sqrt(md);
  float grout = 1.0 - smoothstep(0.012, 0.065, edge);

  vec3 hue = hash33(nearestSeed * 0.417 + 0.17);
  vec3 accent = clamp(uTint * vec3(1.06, 0.98, 1.02), vec3(0.0), vec3(1.0));
  vec3 cellA = mix(vec3(0.14, 0.2, 0.38), accent, 0.42);
  vec3 cellB = 0.52 + 0.48 * cos(hue * 6.28318 + vec3(0.0, 2.05, 4.2) + t * 0.32);
  cellB = mix(cellA, cellB, 0.58);
  float cellShade = 0.58 + 0.42 * (1.0 - sqrt(md));
  vec3 col = cellB * cellShade;

  vec3 groutCol = vec3(0.018, 0.022, 0.038);
  col = mix(col, groutCol, grout * 0.92);

  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.4);
  col += rim * vec3(0.1, 0.34, 0.62) * (0.22 + grout * 0.18);

  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Retro console crush: screen-space vertex snap + drift, affine UVs. Shared by PS2 / PSX. */
const RETRO_CONSOLE_VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform float uTime;
uniform float uSnapGrid;
uniform float uIntensity;

void main() {
  #include <uv_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>

  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>

  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vTexAffine = vec3(uv * clip.w, clip.w);

  float snap = max(uSnapGrid, 16.0);
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float jitter = mix(0.08, 0.38, max(d, 0.0)) * (1.0 - max(-d, 0.0) * 0.4);
  float t = uTime;
  vec2 drift = vec2(
    sin(t * 1.65 + transformed.x * 2.85 + transformed.z * 1.4),
    cos(t * 1.35 + transformed.y * 2.35 + transformed.x * 0.9)
  ) * jitter;

  vec2 ndc = clip.xy / max(abs(clip.w), 1e-5);
  ndc = (floor(ndc * snap + drift) + 0.5) / snap;
  clip.xy = ndc * clip.w;

  gl_Position = clip;
}
`;

/** Watercolour wobble — smooth clip-space drift, no screen-pixel grid snap. */
const WATERCOLOUR_VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform float uTime;
uniform float uWobbleScale;
uniform float uIntensity;

void main() {
  #include <uv_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>

  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}

  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vTexAffine = vec3(uv * clip.w, clip.w);

  float wobble = max(uWobbleScale, 48.0);
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float jitter = mix(0.06, 0.28, max(d, 0.0)) * (1.0 - max(-d, 0.0) * 0.4);
  float t = uTime;
  vec2 drift = vec2(
    sin(t * 1.65 + transformed.x * 2.85 + transformed.z * 1.4),
    cos(t * 1.35 + transformed.y * 2.35 + transformed.x * 0.9)
  ) * jitter;

  vec2 ndc = clip.xy / max(abs(clip.w), 1e-5);
  ndc += drift * (2.2 / wobble);
  clip.xy = ndc * clip.w;

  gl_Position = clip;
}
`;

/** PSX-style snap/drift without shadow-map varyings (watercolour uses fake lighting in the fragment). */
const RETRO_CONSOLE_VERTEX_NO_SHADOW = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform float uTime;
uniform float uSnapGrid;
uniform float uIntensity;

void main() {
  #include <uv_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>

  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}

  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vTexAffine = vec3(uv * clip.w, clip.w);

  float snap = max(uSnapGrid, 16.0);
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float jitter = mix(0.08, 0.38, max(d, 0.0)) * (1.0 - max(-d, 0.0) * 0.4);
  float t = uTime;
  vec2 drift = vec2(
    sin(t * 1.65 + transformed.x * 2.85 + transformed.z * 1.4),
    cos(t * 1.35 + transformed.y * 2.35 + transformed.x * 0.9)
  ) * jitter;

  vec2 ndc = clip.xy / max(abs(clip.w), 1e-5);
  ndc = (floor(ndc * snap + drift) + 0.5) / snap;
  clip.xy = ndc * clip.w;

  gl_Position = clip;
}
`;

/** VGA/DOS 3D: stable screen-space snap (no PSX-style vertex drift). */
const VGA_DOS_3D_VERTEX = /* glsl */ `
#include <common>
#include <uv_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform float uSnapGrid;

void main() {
  #include <uv_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>

  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);

  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>

  vWorldPosition = worldPosition.xyz;

  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vec4 clip = projectionMatrix * mvPosition;
  vTexAffine = vec3(uv * clip.w, clip.w);

  float snap = max(uSnapGrid, 16.0);
  vec2 ndc = clip.xy / max(abs(clip.w), 1e-5);
  ndc = (floor(ndc * snap) + 0.5) / snap;
  clip.xy = ndc * clip.w;

  gl_Position = clip;
}
`;

const PS2_CRUSH_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uLightScale;
uniform float uAmbientFloor;
uniform float uIntensity;
uniform float uOpacity;

const vec3 PS2_LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 ps2RestoreSaturation(vec3 col, vec3 ref) {
  float refLum = dot(ref, PS2_LUMA);
  float colLum = dot(col, PS2_LUMA);
  vec3 refGrey = vec3(refLum);
  vec3 colGrey = vec3(colLum);
  float refSat = length(ref - refGrey);
  float colSat = length(col - colGrey);
  if (colSat >= refSat * 0.9) return col;
  float boost = clamp(refSat / max(colSat, 1e-4), 1.0, 1.18);
  return mix(colGrey, col, boost);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float crush = clamp(uIntensity, 0.0, 2.0);
  float crushT = clamp((crush - 1.0) / 1.0, 0.0, 1.0);
  float bands = mix(6.0, 4.0, crushT);
  float stepped = floor(ndl * bands) / max(bands - 1.0, 1.0);
  stepped = clamp(stepped, 0.0, 1.0);

  vec3 baseCol = clamp(uTint, vec3(0.0), vec3(1.0));
  float mapAlpha = 1.0;
  if (uHasMap > 0.5) {
    vec2 uvAff = vTexAffine.xy / max(vTexAffine.z, 1e-5);
    vec4 mapSample = texture2D(uMap, uvAff);
    baseCol = mapSample.rgb;
    mapAlpha = mapSample.a;
  }

  vec3 sourceCol = baseCol;
  float shade = uAmbientFloor + (1.0 - uAmbientFloor) * stepped * uLightScale;

  float srcLum = max(dot(sourceCol, PS2_LUMA), 1e-4);
  float litLum = srcLum * shade;
  vec3 col = sourceCol * (litLum / srcLum);
  col = ps2RestoreSaturation(col, sourceCol);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.8);
  col += rim * mix(vec3(0.05, 0.07, 0.1), sourceCol * 0.42, 0.62) * 0.42;

  col = clamp(col, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(col, uOpacity * mapAlpha);
}
`;

/** PSX: affine UVs, nearest + UV quant, 15-bit-style bands, hardware 2×2 ordered dither. */
const PSX_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vTexAffine;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uTexRes;
uniform float uColorLevels;
uniform float uLightScale;
uniform float uAmbientFloor;
uniform float uIntensity;
uniform float uOpacity;

const vec3 PSX_LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 psxRestoreSaturation(vec3 col, vec3 ref) {
  float refLum = dot(ref, PSX_LUMA);
  float colLum = dot(col, PSX_LUMA);
  vec3 refGrey = vec3(refLum);
  vec3 colGrey = vec3(colLum);
  float refSat = length(ref - refGrey);
  float colSat = length(col - colGrey);
  if (colSat >= refSat * 0.85) return col;
  float boost = clamp(refSat / max(colSat, 1e-4), 1.0, 1.12);
  return mix(colGrey, col, boost);
}

float psxBayer2(vec2 pix) {
  int x = int(mod(pix.x, 2.0));
  int y = int(mod(pix.y, 2.0));
  int i = x + y * 2;
  if (i == 0) return 0.0;
  if (i == 1) return 2.0;
  if (i == 2) return 3.0;
  return 1.0;
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(N, L), 0.0);
  float crush = clamp(uIntensity, 0.0, 2.0);
  float crushT = clamp((crush - 1.0) / 1.0, 0.0, 1.0);
  float bands = mix(5.0, 3.0, crushT);
  float stepped = floor(ndl * bands) / max(bands - 1.0, 1.0);
  stepped = clamp(stepped, 0.0, 1.0);

  vec3 baseCol = clamp(uTint, vec3(0.0), vec3(1.0));
  float mapAlpha = 1.0;
  if (uHasMap > 0.5) {
    vec2 uvAff = vTexAffine.xy / max(vTexAffine.z, 1e-5);
    float tr = max(uTexRes, 4.0);
    uvAff = (floor(uvAff * tr) + 0.5) / tr;
    vec4 mapSample = texture2D(uMap, uvAff);
    baseCol = mapSample.rgb;
    mapAlpha = mapSample.a;
  }

  vec3 sourceCol = baseCol;
  float shade = uAmbientFloor + (1.0 - uAmbientFloor) * stepped * uLightScale;

  float srcLum = max(dot(sourceCol, PSX_LUMA), 1e-4);
  float litLum = srcLum * shade;
  vec3 col = sourceCol * (litLum / srcLum);
  col = psxRestoreSaturation(col, sourceCol);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  col += rim * mix(vec3(0.04, 0.05, 0.08), sourceCol * 0.35, 0.55) * 0.32;

  float ditherCell = mix(2.0, 1.5, crushT);
  float ditherPush = mix(1.05, 2.1, crushT);
  float dotDark = mix(0.88, 0.48, crushT);
  float dotBright = mix(1.04, 1.16, crushT);
  float levels = mix(max(uColorLevels, 6.0), max(uColorLevels, 6.0) * 0.38, crushT);

  vec2 pix = floor(gl_FragCoord.xy / ditherCell + 1e-3);
  float br = psxBayer2(pix) / 4.0;

  col = floor(col * levels + (br - 0.5) * ditherPush) / levels;
  col = clamp(col, vec3(0.0), vec3(1.0));
  col *= mix(dotDark, dotBright, br);

  gl_FragColor = vec4(col, uOpacity * mapAlpha);
}
`;

/** Barycentric wireframe + traveling emissive pulse (holographic wire look). */
const WIRE_PULSE_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>

attribute vec3 barycentric;
varying vec3 vBarycentric;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vWorldPosition = worldPosition.xyz;
  vBarycentric = barycentric;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const WIRE_PULSE_FRAGMENT = /* glsl */ `
varying vec3 vBarycentric;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndv = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - ndv, 2.35);
  float fresnelTight = pow(1.0 - ndv, 5.5);

  float inten = clamp(uIntensity, 0.0, 2.0);

  vec3 bary = vBarycentric;
  vec3 dBary = fwidth(bary);
  float edgeWidth = mix(0.4, 3.4, inten * 0.5);
  vec3 edgeAA = smoothstep(vec3(0.0), dBary * edgeWidth, bary);
  float wireMask = 1.0 - min(min(edgeAA.x, edgeAA.y), edgeAA.z);

  float sc = max(uPatternScale, 0.02);
  float waveFreq = 2.15 / sc;
  float t = uTime;
  vec3 marchDir = normalize(vec3(0.58, 0.28, 0.76));
  float phase = dot(vWorldPosition, marchDir) * waveFreq - t * 2.75;

  float bandPos = fract(phase * 0.19);
  float band = smoothstep(0.0, 0.045, bandPos) * smoothstep(0.15, 0.045, bandPos);

  float trail = pow(clamp(sin(phase * 6.28318) * 0.5 + 0.5, 0.0, 1.0), 3.2);
  float pulse = max(band, trail * 0.42);

  float phase2 = dot(vWorldPosition, vec3(-0.32, 0.88, 0.34)) * waveFreq * 0.82 - t * 1.85;
  pulse = clamp(pulse + smoothstep(0.7, 0.98, sin(phase2 * 5.2) * 0.5 + 0.5) * 0.5, 0.0, 1.55);

  vec3 wireIdle = mix(vec3(0.0, 0.36, 0.46), vec3(0.46, 0.08, 0.4), fresnel * 0.55) * 0.3;
  vec3 wireHot = mix(vec3(0.32, 1.0, 0.92), vec3(1.0, 0.4, 0.86), fresnel) * 1.35;

  vec3 col = vec3(0.008, 0.012, 0.018);
  col += wireIdle * wireMask;
  col += wireHot * pulse * wireMask;

  col += vec3(0.04, 0.15, 0.21) * fresnel * 0.12;
  col += vec3(0.52, 0.1, 0.42) * fresnelTight * 0.07;

  float alpha = wireMask * (0.52 + pulse * 0.48) + fresnel * 0.07;
  alpha = clamp(alpha, 0.0, 1.0) * uOpacity;

  gl_FragColor = vec4(col, alpha);
}
`;

/** Topo Minimal — domain-warped FBM height field with glowing topographic contour lines. */
const FRACTAL_STORM_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

const vec3 FS_BASE = vec3(0.03137, 0.03137, 0.03137);

float fsHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float fsNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = fsHash(i);
  float n100 = fsHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = fsHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = fsHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = fsHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = fsHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = fsHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = fsHash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fsFbm(vec3 p) {
  float v = fsNoise(p);
  p = p * 2.03 + 1.7;
  v += 0.5 * fsNoise(p);
  p = p * 2.03 + 1.7;
  v += 0.25 * fsNoise(p);
  p = p * 2.03 + 1.7;
  return v + 0.125 * fsNoise(p);
}

void main() {
  vec3 N = orbyCreativeSurfaceNormal(
    normalize(vWorldNormal),
    vWorldPosition,
    vOrbyLocalPos,
    vOrbyLocalNormal,
    mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2)
  );
  vec3 p = vWorldPosition * (1.65 / max(uPatternScale, 0.001));
  float t = uTime;
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);

  vec3 warp = vec3(
    fsFbm(p * 0.52 + vec3(t * 0.11, t * 0.07, 0.0)),
    fsFbm(p * 0.52 + vec3(4.1, t * 0.09, 1.2)),
    fsFbm(p * 0.52 + vec3(1.6, 2.8, t * 0.1))
  );
  vec3 q = p + (warp - 0.5) * mix(1.45, 2.35, up * 0.5);

  float height = fsFbm(q * 1.28 + vec3(0.0, 0.0, t * 0.16));
  height += 0.44 * fsFbm(q * 2.62 + vec3(t * 0.2, 0.0, 0.0));
  height += 0.22 * fsFbm(q * 5.15 - vec3(t * 0.14, t * 0.08, 0.0));

  float contourFreq = mix(7.5, 22.0, inten * 0.5);
  float v = height * contourFreq;
  float fw = max(fwidth(v), 1e-4);
  float iso = abs(fract(v) - 0.5) * 2.0;

  // Screen-space minimum width — stops sub-pixel dotted dashes on curved surfaces.
  float linePx = mix(2.6, 4.4, inten * 0.5);
  float lineW = max(linePx * fw, fw * 2.1);

  float line = 1.0 - smoothstep(0.0, lineW, iso);
  float lineCore = 1.0 - smoothstep(lineW * 0.22, lineW * 0.95, iso);
  float glow = exp(-iso * iso / (lineW * lineW * 9.0 + 1e-5)) * line * 0.55;

  float grad = dot(normalize(vWorldPosition.xz + vec2(0.001)), vec2(0.92, 0.38)) * 0.5 + 0.5;
  grad = clamp(grad + sin(t * 0.28 + height * 2.4) * 0.06, 0.0, 1.0);
  vec3 lineColA = vec3(0.48, 0.14, 1.0);
  vec3 lineColB = vec3(0.12, 1.0, 0.95);
  vec3 lineCol = mix(lineColA, lineColB, grad);

  vec3 lines = lineCol * lineCore * (2.65 + up * 1.45 - down * 0.55);
  lines += lineCol * glow * (1.55 + up * 0.95 - down * 0.35);

  vec3 V = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  lines += mix(lineColA, lineColB, fresnel) * fresnel * line * (0.62 + up * 0.38 - down * 0.22);

  float film = orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);
  lines *= film;

  vec3 col = FS_BASE + lines;
  col += vec3(0.04, 0.34, 0.42) * pow(fresnel, 3.1) * (0.14 + up * 0.05 - down * 0.04);
  col = min(col, vec3(3.2));

  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Holographic 2 — Holographic's artifact-free thin-film core, remixed to full-surface thermal chrome. */
const HOLO_TOPO_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec3 N = orbyCreativeSurfaceNormal(
    normalize(vWorldNormal),
    vWorldPosition,
    vOrbyLocalPos,
    vOrbyLocalNormal,
    mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2)
  );
  float surfMod = orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float F = 1.0 - max(dot(N, V), 1e-4);
  float fresnelWide = pow(F, 1.28);
  float fresnel = pow(F, 2.05);
  float fresnelTight = pow(F, 5.0);
  float inten = clamp(uIntensity, 0.0, 2.0);

  // Scale maps through log2 so equal UI steps feel even — keeps low frequencies (no aliasing).
  float sc = clamp(uPatternScale, 0.1, 5.0);
  float u = (log2(sc) + 3.321928094887362) / 5.643856189774724;
  float wFreq = mix(2.923, 0.25, u);
  vec3 pw = vWorldPosition * wFreq;
  float t = uTime * (wFreq / 1.35);

  // Smooth analytic oil-slick flow (Holographic's field) — low frequency, artifact-free.
  float oil =
    sin(pw.x * 0.72 + t * 0.72) * cos(pw.y * 0.78 - t * 0.62) +
    sin(pw.z * 0.68 + t * 0.42) * 0.45 +
    sin(dot(pw, vec3(0.72, 1.02, 0.58)) * 1.05 + t * 0.85) * 0.35;
  oil *= surfMod;

  // Thin-film phase carried across the WHOLE surface by the flow (full thermal coverage),
  // with a gentle Fresnel shift so grazing angles still bend the rainbow. Intensity = band richness.
  float bandRich = mix(0.72, 1.32, inten * 0.5);
  float film = (oil * 1.95 + fresnel * 1.55 + dot(N, vec3(0.15, 0.97, 0.18)) * 0.4 + t * 0.4) * bandRich;

  vec3 phase = film * vec3(3.45, 4.15, 4.95) + vec3(0.0, 2.2, 5.0);
  vec3 holo = 0.5 + 0.5 * cos(phase);
  holo = pow(max(holo, vec3(0.0)), vec3(0.82));

  // Full-surface thermal-chrome body — bright everywhere, brighter toward grazing angles.
  vec3 col = holo * (0.95 + fresnelWide * 0.6) * surfMod;

  // Chrome specular pop.
  vec3 L = normalize(vec3(0.42, 0.9, 0.36));
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  vec3 specTint = mix(vec3(0.72, 0.94, 1.05), vec3(1.05, 0.58, 0.92), fresnel);
  col += specTint * (pow(nh, 228.0) * 1.25 + pow(nh, 68.0) * 0.38) * (0.2 + fresnel * 0.9);

  // Iridescent rim accents (pink + blue) for that holographic chrome edge.
  col += fresnelTight * vec3(1.0, 0.28, 0.82) * 0.5;
  col += fresnel * vec3(0.1, 0.48, 1.05) * 0.4;

  col = min(col, vec3(3.0));
  gl_FragColor = vec4(col, uOpacity);
}
`;

/** Surface-sampled point sprites — mesh-driven magical dust (inspired by particle-mofing look). */
const DUST_FIELD_VERTEX = /* glsl */ `
attribute vec4 randomPhase;
attribute float revealAlpha;

varying vec3 vWorldPosition;
varying float vRandomAlpha;
varying float vFogDepth;
varying float vTwinklePhase;
varying float vRevealAlpha;

uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
// Export parity: gl_PointSize is absolute framebuffer pixels. Scale by the export/viewport
// framebuffer-height ratio so particles keep the same on-screen fraction at any output size.
uniform float uPointSizeScale;

float dustSineInOut(float x) {
  return -0.5 * (cos(x) - 1.0);
}

void main() {
  vRevealAlpha = revealAlpha;
  vRandomAlpha = randomPhase.x + 0.32;
  vTwinklePhase = randomPhase.z * 6.28318 + randomPhase.w * 4.17;

  float sc = max(uPatternScale, 0.02);
  float wobbleAmp = sc * 0.072;
  float phase = randomPhase.y;
  float t = uTime;

  float driftX = sin(t * 1.05 + phase * 6.28318);
  float driftY = cos(t * 0.92 + phase * 4.17 + 1.3);
  float driftZ = sin(t * 1.18 + phase * 3.71 + 2.1);
  float driftEnv = dustSineInOut(t * 0.55 + phase * 3.14 + 0.7);

  vec3 wobble = vec3(
    driftX * dustSineInOut(t * 1.72 + phase * 6.28318),
    driftY * dustSineInOut(t * 1.38 + phase * 4.17),
    driftZ * dustSineInOut(t * 1.94 + phase * 3.71)
  ) * wobbleAmp;
  wobble += vec3(driftX, driftY, driftZ) * wobbleAmp * 0.22 * driftEnv;

  vec3 pos = position + wobble;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
  vFogDepth = -mvPosition.z;

  float inten = clamp(uIntensity, 0.0, 2.0);
  float sizeBase = mix(5.0, 20.0, inten * 0.5);
  float sizePulse = dustSineInOut(sin(t * 2.05 * randomPhase.z + randomPhase.w * 6.28318) * 0.5 + 0.5);
  float sizeBreath = dustSineInOut(sin(t * 0.78 + phase * 2.4) * 0.5 + 0.5);
  gl_PointSize = sizeBase + mix(2.0, 10.0, inten * 0.5) * sizePulse + 2.5 * sizeBreath;
  gl_PointSize *= clamp(320.0 / max(-mvPosition.z, 0.35), 0.35, 2.8);
  gl_PointSize *= vRevealAlpha;
  gl_PointSize *= uPointSizeScale;
}
`;

const DUST_FIELD_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
varying float vRandomAlpha;
varying float vFogDepth;
varying float vTwinklePhase;
varying float vRevealAlpha;

uniform float uTime;
uniform float uOpacity;

void main() {
  if (vRevealAlpha <= 0.0) discard;

  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float len = length(p);
  if (len > 1.0) discard;

  float alpha = pow(max(1.0 - len, 0.0), 1.28);

  float fogStart = 1.8;
  float fogEnd = 11.0;
  float fog = clamp((vFogDepth - fogStart) / max(fogEnd - fogStart, 0.001), 0.0, 1.0);

  float hueMix = fract(vRandomAlpha * 1.73 + dot(vWorldPosition, vec3(0.07, 0.11, 0.05)) * 0.35);
  vec3 cyan = vec3(0.18, 0.67, 1.0);
  vec3 magenta = vec3(1.0, 0.35, 0.78);
  vec3 gold = vec3(1.0, 0.91, 0.55);
  vec3 col = mix(cyan, magenta, smoothstep(0.15, 0.85, hueMix));
  col = mix(col, gold, smoothstep(0.72, 0.98, hueMix) * 0.42);

  float twinkle = 0.62 + 0.38 * sin(vTwinklePhase + uTime * 1.85);
  twinkle *= 0.84 + 0.16 * sin(uTime * 0.95 + vRandomAlpha * 11.0);
  col *= twinkle;

  vec3 fogCol = vec3(0.015, 0.05, 0.12);
  col = mix(col, fogCol, fog * 0.72);

  float outAlpha = alpha * vRandomAlpha * uOpacity * vRevealAlpha * (1.0 - fog * 0.35);
  outAlpha *= 0.78 + 0.22 * sin(vTwinklePhase * 1.37 + uTime * 2.35);
  gl_FragColor = vec4(col, outAlpha);
}
`;

/** Vectrex P31 phosphor — Wire Pulse barycentrics + analog beam wobble. */
const VECTREX_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>

attribute vec3 barycentric;
varying vec3 vBarycentric;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;

void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>

  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vWorldPosition = worldPosition.xyz;
  vBarycentric = barycentric;

  vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  float sc = max(uPatternScale, 0.02);
  float t = uTime;
  // Analog beam jitter in screen space (after skinning/morph) — object-space wobble vanishes on animated rigs.
  float wobblePx = sc * 0.0016 * clip.w;
  float amp = mix(0.35, 2.6, clamp(sc / 2.0, 0.0, 1.0));
  clip.x += sin(t * 47.0 + vWorldPosition.x * 14.0 + vWorldPosition.z * 9.0) * wobblePx * amp;
  clip.y += cos(t * 53.0 + vWorldPosition.y * 12.0 + vWorldPosition.x * 6.0) * wobblePx * amp;
  clip.x += sin(t * 17.3) * wobblePx * 0.35;
  clip.y += cos(t * 19.1) * wobblePx * 0.28;

  gl_Position = clip;
}
`;

const VECTREX_FRAGMENT = /* glsl */ `
varying vec3 vBarycentric;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndv = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - ndv, 2.35);

  float inten = clamp(uIntensity, 0.0, 2.0);

  vec3 bary = vBarycentric;
  vec3 dBary = fwidth(bary);
  float edgeWidth = mix(0.4, 3.4, inten * 0.5);
  vec3 edgeAA = smoothstep(vec3(0.0), dBary * edgeWidth, bary);
  float wireMask = 1.0 - min(min(edgeAA.x, edgeAA.y), edgeAA.z);

  float db = max(max(dBary.x, dBary.y), dBary.z);
  float cornerReach = mix(0.05, 0.48, inten * 0.5) * max(db * 6.0, 1e-5);
  float va = smoothstep(1.0 - cornerReach, 1.0, bary.x);
  float vb = smoothstep(1.0 - cornerReach, 1.0, bary.y);
  float vc = smoothstep(1.0 - cornerReach, 1.0, bary.z);
  float vertexMask = max(va, max(vb, vc));
  vertexMask = pow(clamp(vertexMask, 0.0, 1.0), 1.25);

  float beam = 0.86 + 0.14 * sin(dot(vWorldPosition, vec3(13.7, 7.3, 11.1)) * 3.6 + uTime * 2.0);

  // P31 phosphor green — vivid beam, soft shoulder so brightness / persistence stay green.
  vec3 wireIdle = vec3(0.022, 0.2, 0.05) * (0.55 + fresnel * 0.25);
  vec3 wireHot = vec3(0.22, 0.9, 0.27);

  vec3 col = vec3(0.0);
  col += wireIdle * wireMask * beam;
  col += wireHot * wireMask * beam * (0.74 + inten * 0.34);
  col += wireHot * vertexMask * 0.46 * beam;

  float peak = max(col.r, max(col.g, col.b));
  col /= 1.0 + peak * 0.26;

  float alpha = wireMask * (0.62 + inten * 0.18) + vertexMask * 0.28 + fresnel * 0.04;
  alpha = clamp(alpha, 0.0, 1.0) * uOpacity;

  gl_FragColor = vec4(col, alpha);
}
`;

/** Vertex slip: horizontal band displacement in clip space (whole mesh slices shift sideways). */
const SCANLINE_HOLOGRAM_VERTEX = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec3 vOrbyLocalPos;
varying vec3 vOrbyLocalNormal;
varying vec3 vOrbyNm0;
varying vec3 vOrbyNm1;
varying vec3 vOrbyNm2;
varying vec3 vOrbyWm0;
varying vec3 vOrbyWm1;
varying vec3 vOrbyWm2;
varying float vGlitchBoost;
uniform float uTime;
uniform float uIntensity;

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

void main() {
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  vOrbyLocalPos = transformed;
  vOrbyLocalNormal = normalize(objectNormal);
  vOrbyNm0 = normalMatrix[0];
  vOrbyNm1 = normalMatrix[1];
  vOrbyNm2 = normalMatrix[2];
  mat3 worldNm = mat3(transpose(inverse(modelMatrix)));
  vOrbyWm0 = worldNm[0];
  vOrbyWm1 = worldNm[1];
  vOrbyWm2 = worldNm[2];
  ${CREATIVE_LOOK_WORLD_POSITION_VS}
  #include <shadowmap_vertex>
  vWorldPosition = worldPosition.xyz;

  vec4 clip = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  float screenY = clip.y / max(abs(clip.w), 1e-4);
  float t = uTime;
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  // Quadratic gate: ~0 slip at intensity 0, eases in through the low range, full at 1+.
  float dispGate = inten <= 1.0 ? inten * inten : 1.0;

  // Pixel slip is ~constant in screen space, so zoomed-out meshes look more destroyed.
  // Boost when the camera is close so close-ups get the same wide, intense slice shear.
  float modelScale = max(
    max(length(vec3(modelMatrix[0].xyz)), length(vec3(modelMatrix[1].xyz))),
    length(vec3(modelMatrix[2].xyz))
  );
  modelScale = max(modelScale, 1e-3);
  float dist = max(length(cameraPosition - vWorldPosition), modelScale * 0.08);
  float normDist = dist / modelScale;
  const float REF_NORM_DIST = 4.0;
  float closeBoost = clamp(REF_NORM_DIST / max(normDist, 0.32), 1.0, 9.0);
  vGlitchBoost = closeBoost;

  float boostT = smoothstep(1.0, 6.5, closeBoost);
  float effectT = max(boostT * dispGate, up);
  float coarseBands = mix(38.0, 10.0, effectT);
  float glitchThreshold = mix(0.48, 0.22, effectT);
  float heavyThreshold = mix(0.8, 0.48, effectT);

  // Snap to coarse band center — every vertex in the same horizontal slice gets
  // identical slip so triangles don't shear into glue threads.
  float slipY = (floor(screenY * coarseBands + 1000.0) + 0.5 - 1000.0) / coarseBands;
  float band = floor(slipY * coarseBands + 1000.0);
  float glitchRoll = hash11(band + floor(t * 4.8));
  float glitchActive = step(glitchThreshold, glitchRoll);
  float heavyGlitch = step(heavyThreshold, glitchRoll);

  float slipPx =
    (hash11(band * 2.41 + floor(t * 8.5)) - 0.5) *
    mix(8.0, 38.0, glitchActive) *
    (0.45 + 0.55 * sin(t * 16.0 + band * 1.4));

  slipPx += (hash11(band * 1.07 + floor(t * 3.2)) - 0.5) * heavyGlitch * mix(34.0, 88.0, effectT);

  // Continuous sin jitter only — fine-band displacement removed (it caused thread shear).
  slipPx += sin(t * 38.0 + screenY * 64.0) * mix(0.4, 3.2, glitchActive) * mix(1.0, 2.6, effectT);

  float dispMul = inten <= 1.0 ? dispGate : (1.0 + up * 0.85);
  slipPx *= closeBoost * dispMul;

  // ~NDC px scale ( tuned ~1080p ).
  clip.x += slipPx * clip.w * 0.0016;

  gl_Position = clip;
}
`;

/** Glitch hologram: horizontal RGB scan bands, slice displacement (vertex), no black voids. */
const SCANLINE_HOLOGRAM_FRAGMENT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying float vGlitchBoost;
uniform float uTime;
uniform float uPatternScale;
uniform float uIntensity;
uniform float uOpacity;

float hash11(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float lineMask(float v, float sharp) {
  float s = sin(v * 6.28318);
  return pow(abs(s), sharp);
}

vec3 boostContrast(vec3 c, float amount) {
  return clamp((c - 0.5) * amount + 0.5, vec3(0.0), vec3(1.55));
}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Matches a pushed-down shelf tone curve (lowered ⅓ & ⅔ knots, highlights anchored).
float toneCurvePushed(float x) {
  x = clamp(x, 0.0, 1.0);
  if (x < 0.333333) {
    float t = x / 0.333333;
    t = t * t * (3.0 - 2.0 * t);
    return mix(0.0, 0.21, t);
  }
  if (x < 0.666667) {
    float t = (x - 0.333333) / 0.333333;
    t = t * t * (3.0 - 2.0 * t);
    return mix(0.21, 0.43, t);
  }
  float t = (x - 0.666667) / 0.333333;
  t = t * t * (3.0 - 2.0 * t);
  return mix(0.43, 1.0, t);
}

vec3 applyPushedToneCurve(vec3 c) {
  float l = dot(c, LUMA);
  if (l < 1e-5) {
    return c;
  }
  float l2;
  if (l <= 1.0) {
    l2 = toneCurvePushed(l);
  } else {
    float y1 = toneCurvePushed(1.0);
    l2 = y1 + (l - 1.0) * 0.55;
  }
  return clamp(c * (l2 / l), vec3(0.0), vec3(1.55));
}

void main() {
  vec3 N = orbyCreativeSurfaceNormal(
    normalize(vWorldNormal),
    vWorldPosition,
    vOrbyLocalPos,
    vOrbyLocalNormal,
    mat3(vOrbyWm0, vOrbyWm1, vOrbyWm2)
  );
  vec3 V = normalize(cameraPosition - vWorldPosition);
  float ndv = max(dot(N, V), 0.0);
  float F = 1.0 - ndv;
  float fresnel = pow(F, 1.65);
  float fresnelTight = pow(F, 5.0);

  float sc = clamp(uPatternScale, 0.1, 5.0);
  float hLineBase = mix(3.8, 12.0, (sc - 0.1) / 4.9);
  float t = uTime;
  vec2 pix = gl_FragCoord.xy;
  float inten = clamp(uIntensity, 0.0, 2.0);
  float d = inten - 1.0;
  float up = max(d, 0.0);
  float down = max(-d, 0.0);
  float boostT = smoothstep(1.0, 6.5, vGlitchBoost);
  float effectT = max(boostT, up);

  float bandH = hLineBase * mix(6.0, 14.0, effectT * 0.55);
  float band = floor(pix.y / bandH);
  float bandFrac = fract(pix.y / bandH);

  float glitchRoll = hash11(band + floor(t * 4.8));
  float glitchThreshold = mix(0.48, 0.22, effectT);
  float heavyThreshold = mix(0.8, 0.48, effectT);
  float glitchActive = step(glitchThreshold, glitchRoll);
  float heavyGlitch = step(heavyThreshold, glitchRoll);

  vec2 p = pix;

  float ca = mix(0.012, 0.055, fresnel) * (1.0 + glitchActive * 1.8 + heavyGlitch * 0.6);
  ca *= mix(1.0, 2.6, boostT) * (1.0 + up * 0.65 - down * 0.45);

  // Horizontal scan bands — constant downward scroll; valleys dim, never black.
  float hRow = floor(p.y / 2.6);
  float hDarkScale = mix(0.55, 2.05, hash11(hRow * 0.69 + floor(t * 0.75)));
  float hPitch = hLineBase * hDarkScale;
  float hPhaseOff = hash11(hRow * 1.19) * 6.28318;
  float scroll = t * 4.2;

  float hR = lineMask((p.y + ca * 120.0) / hPitch - scroll + hPhaseOff, 0.92);
  float hG = lineMask(p.y / hPitch - scroll + hPhaseOff, 0.85);
  float hB = lineMask((p.y - ca * 120.0) / hPitch - scroll + hPhaseOff, 0.92);

  float scanBright = hG * 0.5 + hR * 0.28 + hB * 0.22;
  scanBright = clamp((scanBright - 0.5) * 1.95 + 0.42, 0.0, 1.0);
  float scanMod = mix(0.54, 0.92, scanBright);

  float phosphor = 0.935 + 0.065 * sin(p.x * 3.14159 / max(hLineBase * 0.55, 1.0));
  scanMod *= phosphor;

  float bandWave = sin(bandFrac * 6.28318 * mix(1.0, 2.4, hash11(band)) - t * 1.6 + band * 0.35);
  bandWave = bandWave * 0.5 + 0.5;
  bandWave = clamp((bandWave - 0.5) * 1.85 + 0.44, 0.0, 1.0);
  scanMod *= mix(0.72, 0.92, bandWave);

  vec2 vignUv = (pix / vec2(800.0, 600.0) - 0.5) * 2.0;
  float vign = 1.0 - dot(vignUv, vignUv) * 0.18;
  vign = clamp(vign, 0.65, 1.0);

  vec3 holoBody = vec3(0.025, 0.05, 0.09) + fresnel * vec3(0.08, 0.26, 0.38) * 0.48;

  vec3 cyan = vec3(0.0, 0.74, 0.84);
  vec3 magenta = vec3(0.82, 0.0, 0.62);
  vec3 lime = vec3(0.62, 0.82, 0.0);

  vec3 scanCol =
    cyan * hG * (0.9 + bandWave * 0.22) +
    magenta * hR * 0.65 +
    lime * hB * 0.42;

  scanCol *= (0.48 + fresnel * 0.88) * vign * scanMod;

  float brightBand = smoothstep(0.36, 0.54, sin(bandFrac * 6.28318 - t * 2.2)) * glitchActive;
  scanCol += brightBand * cyan * 0.26;

  float staticRow = hash21(vec2(hRow, floor(t * 42.0)));
  float snow = step(0.988, staticRow);
  scanCol += snow * (cyan * 0.3 + magenta * 0.12) * scanBright;

  vec3 col = holoBody + scanCol;

  col += fresnel * cyan * 0.52;
  col += fresnelTight * mix(magenta, lime, 0.5) * 0.42;
  col += heavyGlitch * bandFrac * mix(cyan, magenta, hash11(band)) * mix(0.12, 0.28, boostT) * (1.0 + up * 0.55 - down * 0.47);

  col = applyPushedToneCurve(col);
  col = boostContrast(col, 1.34 * (1.0 + up * 0.38 - down * 0.22));
  col = min(col, vec3(1.55));

  col *= orbyCreativeSurfaceFilmMod(vWorldPosition, vOrbyLocalPos, vOrbyLocalNormal);

  gl_FragColor = vec4(col, uOpacity);
}
`;

/**
 * @param {CreativeLookPreset | string} preset
 * @param {object} opts
 * @param {boolean} [opts.transparent]
 * @param {number} [opts.opacity]
 * @param {number} [opts.side]
 * @param {number} [opts.time] — initial uTime for animated presets
 * @param {number} [opts.patternScale] — 1 = preset default; higher values make the pattern larger
 * @param {number} [opts.hdriBlurriness] — for chrome / glass presets; roughness vs HDRI blur
 * @param {THREE.Color} [opts.diffuseTint] — mesh albedo fallback when no diffuse map
 * @param {THREE.Texture} [opts.diffuseMap] — albedo for ps2-crush (bilinear bake) / psx|vga-dos-3d (nearest bake)
 * @param {number} [opts.masterHue] — global hue shift in degrees (-180…180)
 * @param {number} [opts.intensity] — effect punch (0–2, 1 = default)
 * @param {number} [opts.liftCrush] — shadow lift (+) vs crush (−), -1…1
 * @param {number} [opts.materialBrightness] — matches Object → Material brightness (live)
 * @param {number} [opts.materialMetalness] — matches Object → Material metalness (live)
 * @param {number} [opts.materialRoughness] — matches Object → Material roughness (live)
 * @param {boolean} [opts.skinning] — enable skeletal animation (SkinnedMesh / GLB rigs)
 * @param {boolean} [opts.morphTargets] — enable morph-target animation
 * @param {ReturnType<typeof createOrbySurfaceUniformRefs> | null} [opts.surfaceState] — Appearance surface preset uniforms
 * @returns {THREE.ShaderMaterial | THREE.MeshPhysicalMaterial}
 */
export function createCreativeLookMaterial(preset, opts = {}) {
  if (opts.diffuseMap?.isTexture && !isTextureImageReady(opts.diffuseMap)) {
    opts = { ...opts, diffuseMap: null };
  }
  const transparent = !!opts.transparent;
  const opacity = Math.min(
    1,
    Math.max(0, Number.isFinite(opts.opacity) ? opts.opacity : 1),
  );
  /** When not in the transparent pipeline, force alpha 1 so Three never blends/sorts like a ~opaque fade (causes black flashes with orbit/zoom). Shader Lab callers default to opaque except Glass/Chrome showcase presets. */
  const shaderAlpha = transparent ? opacity : 1;
  const side = opts.side ?? THREE.FrontSide;
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const patternScale = Number.isFinite(opts.patternScale)
    ? THREE.MathUtils.clamp(opts.patternScale, 0.02, 5)
    : 1;
  const hdriBlur = Number.isFinite(opts.hdriBlurriness)
    ? THREE.MathUtils.clamp(opts.hdriBlurriness, 0, 1)
    : 0;
  const diffuseTint =
    opts.diffuseTint instanceof THREE.Color
      ? opts.diffuseTint.clone()
      : null;
  const id = normalizeCreativeLookPreset(preset);
  const masterHueRad = creativeLookMasterHueRadians(opts.masterHue ?? 0);
  const hueUniform = { uMasterHue: { value: masterHueRad } };
  const liftCrush = normalizeCreativeLookLiftCrush(opts.liftCrush ?? CREATIVE_LOOK_LIFT_CRUSH_DEFAULT);
  const liftCrushUniform = { uLiftCrush: { value: liftCrush } };
  const materialBrightness = Number.isFinite(Number(opts.materialBrightness))
    ? Number(opts.materialBrightness)
    : DEFAULT_MATERIAL_BRIGHTNESS;
  const materialMetalness = Number.isFinite(Number(opts.materialMetalness))
    ? THREE.MathUtils.clamp(Number(opts.materialMetalness), 0, 1)
    : DEFAULT_MATERIAL_METALNESS;
  const materialRoughness = Number.isFinite(Number(opts.materialRoughness))
    ? THREE.MathUtils.clamp(Number(opts.materialRoughness), 0, 1)
    : DEFAULT_MATERIAL_ROUGHNESS;
  const brightnessUniform = { uBrightness: { value: materialBrightness } };
  const pbrUniforms = {
    uMetalness: { value: materialMetalness },
    uRoughness: { value: materialRoughness },
  };
  const shadowUniforms = createCreativeLookShadowUniforms();
  const gradeUniforms = {
    ...hueUniform,
    ...liftCrushUniform,
    ...brightnessUniform,
    ...shadowUniforms,
  };
  const intensity = normalizeCreativeLookIntensity(opts.intensity ?? CREATIVE_LOOK_INTENSITY_DEFAULT);
  const intensityUniform = { uIntensity: { value: intensity } };
  const toonLightUniforms = {
    uLightScale: { value: 1 },
    uAmbientFloor: { value: 0.42 },
  };
  const lookFrag = (fragmentShader) =>
    withCreativeLookPostProcess(withCreativeLookShadowReceive(fragmentShader));
  const lookFragOptics = (fragmentShader) =>
    withCreativeLookPostProcess(withCreativeLookShadowReceive(fragmentShader), {
      skipLiftCrush: true,
    });
  const lookFragNoShadow = (fragmentShader) =>
    withCreativeLookPostProcess(fragmentShader, { shadowTint: false });
  const flatPostPrepFrag = (fragmentShader, mode = 'lit') =>
    lookFragNoShadow(withCreativeLookPrepPbrModulation(fragmentShader, { mode }));
  const retroLitPrepFrag = (fragmentShader, mode) =>
    lookFrag(withCreativeLookPrepPbrModulation(fragmentShader, { mode }));
  const surfaceUniformRefs = creativeLookPresetSupportsSurfaceDetail(id)
    ? createOrbySurfaceUniformRefs(opts.surfaceState ?? null)
    : null;
  const surfaceUniformSpread = surfaceUniformRefs ?? {};
  const lookFragWithSurface = (fragmentShader) =>
    lookFrag(
      surfaceUniformRefs
        ? `${ORBY_CREATIVE_SURFACE_FRAG_HELPERS}\n${fragmentShader}`
        : fragmentShader,
    );
  const lookFragOpticsWithSurface = (fragmentShader) =>
    lookFragOptics(
      surfaceUniformRefs
        ? `${ORBY_CREATIVE_SURFACE_FRAG_HELPERS}\n${fragmentShader}`
        : fragmentShader,
    );

  /** Align with post half-float + linear workflow; `toneMapped: false` mismatched encoding on some GPUs (random black frames). Bloom still reads scene RT before exposure/tone passes. */
  const commonMatOpts = {
    transparent,
    opacity: shaderAlpha,
    side,
    depthTest: true,
    depthWrite: !transparent || opacity >= 0.99,
    toneMapped: true,
  };

  const finish = (mat, { shadows = true, castShadowDepth = shadows } = {}) => {
    if (mat.isShaderMaterial) {
      if (opts.skinning) mat.skinning = true;
      if (opts.morphTargets) mat.morphTargets = true;
    }
    if ('outputColorSpace' in mat && THREE.LinearSRGBColorSpace) {
      mat.outputColorSpace = THREE.LinearSRGBColorSpace;
    }
    if (mat.isShaderMaterial && castShadowDepth) {
      attachCreativeLookDepthMaterial(mat);
    }
    if (mat.isShaderMaterial && shadows) {
      ensureCreativeLookLightingUniforms(mat);
    }
    if (surfaceUniformRefs && mat.isShaderMaterial) {
      mat.userData.orbyCreativeSurfaceUniformRefs = surfaceUniformRefs;
    }
    return mat;
  };

  const finishPhysical = (mat, tag) => {
    if (opts.skinning) mat.skinning = true;
    if (opts.morphTargets) mat.morphTargets = true;
    if ('outputColorSpace' in mat && THREE.LinearSRGBColorSpace) {
      mat.outputColorSpace = THREE.LinearSRGBColorSpace;
    }
    mat.userData.orbyCreativeLook = tag;
    captureCreativeLookPhysicalHueSources(mat);
    applyCreativeLookPhysicalMasterHue(
      mat,
      normalizeCreativeLookMasterHue(opts.masterHue ?? 0),
      materialBrightness,
    );
    return mat;
  };

  if (id === 'flow-field') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uColorA: { value: new THREE.Color(0x1a0a2e) },
        uColorB: { value: new THREE.Color(0x00e5ff) },
        uOpacity: { value: shaderAlpha },
        ...gradeUniforms,
      },
      vertexShader: FLOW_VERTEX,
      fragmentShader: lookFrag(FLOW_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'flow-field';
    return finish(mat);
  }

  if (id === 'plasma') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragWithSurface(PLASMA_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'plasma';
    return finish(mat);
  }

  if (id === 'toon') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        /** Default; overridden each frame from the scene key light when MaterialController supplies `getCreativeLookKeyLightDir`. */
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uShadow: { value: new THREE.Color(0x1a2040) },
        uLight: { value: new THREE.Color(0xe8f0ff) },
        uBands: { value: 4.0 },
        uOpacity: { value: shaderAlpha },
        ...toonLightUniforms,
        ...gradeUniforms,
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: lookFrag(TOON_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'toon';
    return finish(mat);
  }

  if (id === 'watercolour') {
    const tint = diffuseTint ?? new THREE.Color(0xffffff);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uWobbleScale: { value: creativeWatercolourWobbleScale(patternScale) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WATERCOLOUR_VERTEX,
      fragmentShader: lookFragNoShadow(WATERCOLOUR_FRAGMENT),
      ...commonMatOpts,
    });
    mat.uniforms.uIntensity.value = creativeWatercolourVertexDrift(patternScale);
    mat.userData.orbyCreativeLook = 'watercolour';
    return finish(mat, { shadows: false, castShadowDepth: true });
  }

  if (id === 'sketch') {
    const tint = diffuseTint ?? new THREE.Color(0xffffff);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const strokeWidth = Number.isFinite(opts.sketchStrokeWidth)
      ? opts.sketchStrokeWidth
      : patternScale;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uWobbleScale: { value: creativeSketchWobbleScale(strokeWidth) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WATERCOLOUR_VERTEX,
      fragmentShader: withCreativeLookPrepPbrModulation(SKETCH_FRAGMENT, { mode: 'sketch' }),
      ...commonMatOpts,
    });
    mat.uniforms.uIntensity.value = creativeSketchVertexDrift(strokeWidth);
    mat.userData.orbyCreativeLook = 'sketch';
    return finish(mat, { shadows: false, castShadowDepth: true });
  }

  if (id === 'sketch-colour') {
    const tint = diffuseTint ?? new THREE.Color(0xffffff);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const strokeWidth = Number.isFinite(opts.sketchStrokeWidth)
      ? opts.sketchStrokeWidth
      : patternScale;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uWobbleScale: { value: creativeSketchWobbleScale(strokeWidth) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WATERCOLOUR_VERTEX,
      fragmentShader: withCreativeLookPrepPbrModulation(SKETCH_COLOUR_FRAGMENT, {
        mode: 'sketch-colour',
      }),
      ...commonMatOpts,
    });
    mat.uniforms.uIntensity.value = creativeSketchVertexDrift(strokeWidth);
    mat.userData.orbyCreativeLook = 'sketch-colour';
    return finish(mat, { shadows: false, castShadowDepth: true });
  }

  if (id === 'gouache') {
    const tint = diffuseTint ?? new THREE.Color(0xffffff);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uWobbleScale: { value: creativeGouacheWobbleScale(patternScale) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WATERCOLOUR_VERTEX,
      fragmentShader: withCreativeLookPrepPbrModulation(GOUACHE_FRAGMENT, {
        mode: 'gouache',
      }),
      ...commonMatOpts,
    });
    mat.uniforms.uIntensity.value = creativeGouacheVertexDrift(patternScale);
    mat.userData.orbyCreativeLook = 'gouache';
    return finish(mat, { shadows: false, castShadowDepth: true });
  }

  if (id === 'ega-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xc8b8e8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(EGA_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'ega-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'c64-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xe8e0d8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(C64_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'c64-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'gameboy-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xe8e0d8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(GB_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'gameboy-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'gba-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xc8b8e8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(GBA_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'gba-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'nes-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xe8e0d8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(NES_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'nes-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'megadrive-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xe8e0d8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(MD_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'megadrive-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'intellivision-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xd8c8a0);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(INTV_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'intellivision-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'apple2-pixel') {
    const tint = diffuseTint ?? new THREE.Color(0xd8d8d8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: flatPostPrepFrag(A2_PREP_FRAGMENT, 'lum'),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'apple2-pixel';
    return finish(mat, { shadows: false });
  }

  if (id === 'dither-neutral' || id === 'dither-tritone' || id === 'dither-crosshatch' || id === 'dither-raster') {
    const tint = diffuseTint ?? new THREE.Color(0xe8e0d8);
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const ditherGradeUniforms = {
      ...hueUniform,
      ...brightnessUniform,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...ditherGradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: withCreativeLookPostProcess(DITHER_NEUTRAL_PREP_FRAGMENT, {
        shadowTint: false,
        skipLiftCrush: true,
      }),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = id;
    return finish(mat, { shadows: false });
  }

  if (id === 'ascii-art' || id === 'ascii-art-2' || id === 'ascii-art-3' || id === 'ascii-art-4') {
    const map = opts.diffuseMap?.isTexture ? opts.diffuseMap.clone() : null;
    if (map) {
      map.minFilter = THREE.LinearFilter;
      map.magFilter = THREE.LinearFilter;
    }
    const prepass =
      id === 'ascii-art-2'
        ? ASCII_3_LUMINANCE_PREP_FRAGMENT
        : id === 'ascii-art-3'
          ? ASCII_2_LUMINANCE_PREP_FRAGMENT
          : id === 'ascii-art-4'
            ? ASCII_4_LUMINANCE_PREP_FRAGMENT
            : ASCII_LUMINANCE_PREP_FRAGMENT;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
      },
      vertexShader: PIXEL_ART_VERTEX,
      fragmentShader: withCreativeLookPrepPbrModulation(prepass, { mode: 'form' }),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = id;
    return finish(mat, { shadows: false });
  }

  if (isVoxelCreativeLookPreset(id)) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: shaderAlpha },
        ...gradeUniforms,
      },
      vertexShader: VOXEL_VERTEX,
      fragmentShader: lookFragNoShadow(VOXEL_FRAGMENT),
      vertexColors: true,
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = id;
    return finish(mat, { shadows: false });
  }

  if (id === 'ps2-crush') {
    const tint = diffuseTint ?? new THREE.Color(0xb8b0a8);
    const map = opts.diffuseMap?.isTexture
      ? bakePs2CrushDiffuseMap(opts.diffuseMap, creativePs2CrushTexRes(patternScale))
      : null;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uSnapGrid: { value: creativePs2CrushSnapGrid(patternScale) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...toonLightUniforms,
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: RETRO_CONSOLE_VERTEX,
      fragmentShader: retroLitPrepFrag(PS2_CRUSH_FRAGMENT, 'ps2'),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'ps2-crush';
    return finish(mat);
  }

  if (id === 'psx') {
    const tint = diffuseTint ?? new THREE.Color(0xa8a098);
    const texRes = creativePsxTexRes(patternScale);
    const map = opts.diffuseMap?.isTexture
      ? bakePsxDiffuseMap(opts.diffuseMap, texRes)
      : null;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uSnapGrid: { value: creativePsxSnapGrid(patternScale) },
        uTexRes: { value: texRes },
        uColorLevels: { value: 32 },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uOpacity: { value: shaderAlpha },
        ...toonLightUniforms,
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: RETRO_CONSOLE_VERTEX,
      fragmentShader: retroLitPrepFrag(PSX_FRAGMENT, 'psx'),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'psx';
    return finish(mat);
  }

  if (id === 'vga-dos-3d') {
    const tint = diffuseTint ?? new THREE.Color(0x908878);
    const texRes = creativeVgaDos3dTexRes(patternScale);
    const map = opts.diffuseMap?.isTexture
      ? bakePsxDiffuseMap(opts.diffuseMap, texRes)
      : null;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSnapGrid: { value: creativeVgaDos3dSnapGrid(patternScale) },
        uLightDir: { value: new THREE.Vector3(0.35, 0.92, 0.42).normalize() },
        uTint: { value: tint },
        uMap: { value: map },
        uHasMap: { value: map ? 1 : 0 },
        uTexRes: { value: texRes },
        uPalette: { value: getVgaDosPaletteTexture() },
        uPaletteCount: { value: VGA_DOS_PALETTE_COUNT },
        uOpacity: { value: shaderAlpha },
        ...toonLightUniforms,
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: VGA_DOS_3D_VERTEX,
      fragmentShader: retroLitPrepFrag(VGA_DOS_3D_FRAGMENT, 'vga'),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'vga-dos-3d';
    return finish(mat);
  }

  if (id === 'holographic') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragWithSurface(HOLOGRAPHIC_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'holographic';
    return finish(mat);
  }

  if (id === 'spectral-storm') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragWithSurface(SPECTRAL_STORM_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'spectral-storm';
    return finish(mat);
  }

  if (id === 'thermal') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        uLuminanceGain: { value: 1 },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: lookFragOptics(OPTICS_LUMINANCE_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'thermal';
    return finish(mat);
  }

  if (id === 'thermal-extreme') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        uLuminanceGain: { value: 1 },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: lookFragOptics(OPTICS_LUMINANCE_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'thermal-extreme';
    return finish(mat);
  }

  if (id === 'thermal-acid') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        uLuminanceGain: { value: THERMAL_ACID_MESH_GAIN },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
        ...surfaceUniformSpread,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragOpticsWithSurface(THERMAL_ACID_LUMINANCE_PREP_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'thermal-acid';
    return finish(mat);
  }

  if (id === 'voronoi') {
    const tint = diffuseTint ?? new THREE.Color(0x5cc8ff);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uTint: { value: tint },
        uOpacity: { value: shaderAlpha },
        ...gradeUniforms,
      },
      vertexShader: WORLD_VERTEX,
      fragmentShader: lookFrag(VORONOI_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'voronoi';
    return finish(mat);
  }

  if (id === 'scanline-hologram') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: SCANLINE_HOLOGRAM_VERTEX,
      fragmentShader: lookFragWithSurface(SCANLINE_HOLOGRAM_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'scanline-hologram';
    return finish(mat);
  }

  if (id === 'wire-pulse') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WIRE_PULSE_VERTEX,
      fragmentShader: lookFrag(WIRE_PULSE_FRAGMENT),
      ...creativeLookWireVectorMaterialOpts(shaderAlpha),
    });
    mat.userData.orbyCreativeLook = 'wire-pulse';
    return finish(mat);
  }

  if (id === 'fractal-storm') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragWithSurface(FRACTAL_STORM_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'fractal-storm';
    return finish(mat);
  }

  if (id === 'holo-topo') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragWithSurface(HOLO_TOPO_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'holo-topo';
    return finish(mat);
  }

  if (id === 'dust-field') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        uPointSizeScale: { value: 1 },
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: DUST_FIELD_VERTEX,
      fragmentShader: lookFragNoShadow(DUST_FIELD_FRAGMENT),
      ...creativeLookDustFieldMaterialOpts(shaderAlpha),
    });
    mat.userData.orbyCreativeLook = 'dust-field';
    return finish(mat, { shadows: false, castShadowDepth: false });
  }

  if (id === 'vectrex') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...pbrUniforms,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: VECTREX_VERTEX,
      fragmentShader: lookFragNoShadow(
        withCreativeLookPrepPbrModulation(VECTREX_FRAGMENT, { mode: 'vectrex' }),
      ),
      ...creativeLookWireVectorMaterialOpts(shaderAlpha),
    });
    mat.userData.orbyCreativeLook = 'vectrex';
    return finish(mat, { shadows: false, castShadowDepth: false });
  }

  if (id === 'chrome-plasma') {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: time },
        uPatternScale: { value: patternScale },
        uOpacity: { value: shaderAlpha },
        ...surfaceUniformSpread,
        ...gradeUniforms,
        ...intensityUniform,
      },
      vertexShader: WORLD_SURFACE_VERTEX,
      fragmentShader: lookFragWithSurface(CHROME_PLASMA_FRAGMENT),
      ...commonMatOpts,
    });
    mat.userData.orbyCreativeLook = 'chrome-plasma';
    return finish(mat);
  }

  if (id === 'glass') {
    const liftCrush = opts.liftCrush ?? CREATIVE_GLASS_DEFAULT_LIFT_CRUSH;
    const crushMul = creativeGlassLiftCrushExposureMul(liftCrush);
    const { thickness, roughness } = creativeGlassParams(patternScale, hdriBlur);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      metalness: 0,
      roughness,
      transmission: 1,
      thickness,
      ior: 1.5,
      specularIntensity: CREATIVE_GLASS_BASE_SPECULAR_INTENSITY * crushMul,
      specularColor: new THREE.Color(0xd8d8d8),
      /** Grazing-angle lobe — subtler than chrome. */
      sheen: 0.18,
      sheenRoughness: 0.84,
      sheenColor: new THREE.Color(0xc8c8c8),
      envMapIntensity: CREATIVE_GLASS_ENV_MAP_MUL * crushMul,
      transparent: true,
      opacity: 1,
      attenuationColor: new THREE.Color(0xd4d4d4),
      attenuationDistance: CREATIVE_GLASS_BASE_ATTENUATION_DISTANCE
        * Math.max(crushMul, 0.35),
      side,
      toneMapped: true,
      depthWrite: false,
    });
    return finishPhysical(mat, 'glass');
  }

  if (id === 'holo-glass') {
    const {
      thickness,
      roughness,
      iridescence,
      iridescenceThicknessRange,
    } = creativeHoloGlassParamsForMesh(patternScale, hdriBlur, null, intensity);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xd4dce8),
      metalness: 0,
      roughness,
      transmission: 1,
      thickness,
      ior: 1.52,
      specularIntensity: 0.64,
      specularColor: new THREE.Color(0xd8dce8),
      iridescence,
      iridescenceIOR: 1.28,
      iridescenceThicknessRange,
      sheen: 0.2,
      sheenRoughness: 0.78,
      sheenColor: new THREE.Color(0xb8c8e8),
      envMapIntensity: CREATIVE_HOLO_GLASS_ENV_MAP_MUL,
      transparent: true,
      opacity: 1,
      attenuationColor: new THREE.Color(0xd0d8e8),
      attenuationDistance: 1.55,
      side,
      toneMapped: true,
      depthWrite: false,
    });
    attachCreativeLookHoloGlassShader(mat, {
      time,
      patternScale,
      intensity,
    });
    return finishPhysical(mat, 'holo-glass');
  }

  if (id === 'crystal-gem') {
    const {
      thickness,
      roughness,
      attenuationDistance,
    } = creativeCrystalGemParamsForMesh(patternScale, hdriBlur, null, intensity);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xd8eeff),
      metalness: 0,
      roughness,
      transmission: 1,
      thickness,
      ior: 1.77,
      specularIntensity: 1.0,
      specularColor: new THREE.Color(0xf0f8ff),
      iridescence: 0,
      sheen: 0.08,
      sheenRoughness: 0.92,
      sheenColor: new THREE.Color(0x88c8e8),
      envMapIntensity: CREATIVE_CRYSTAL_GEM_ENV_MAP_MUL,
      transparent: true,
      opacity: 1,
      attenuationColor: new THREE.Color(0x041828),
      attenuationDistance,
      side,
      toneMapped: true,
      depthWrite: false,
    });
    attachCreativeLookCrystalGemShader(mat, {
      time,
      patternScale,
      intensity,
    });
    applyCreativeLookCrystalGemPerformanceTuning(mat, opts.renderQuality);
    return finishPhysical(mat, 'crystal-gem');
  }

  if (id === 'chrome') {
    const rough = creativeChromeRoughness(patternScale, hdriBlur);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(CREATIVE_CHROME_BASE_HEX),
      metalness: 1,
      roughness: rough,
      envMapIntensity: 1,
      clearcoat: 0,
      transparent,
      opacity: shaderAlpha,
      side,
      toneMapped: true,
    });
    return finishPhysical(mat, 'chrome');
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color(0x0a0a12) },
      uEdgeColor: { value: new THREE.Color(0x00ffd5) },
      uRimPower: { value: 2.2 },
      uOpacity: { value: shaderAlpha },
      ...gradeUniforms,
      ...intensityUniform,
    },
    vertexShader: NEON_VERTEX,
    fragmentShader: lookFrag(NEON_FRAGMENT),
    ...commonMatOpts,
  });
  mat.userData.orbyCreativeLook = 'neon-edge';
  return finish(mat);
}
