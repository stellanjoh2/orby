import * as THREE from 'three';
import { mergeVertices } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';
import { LineMaterial } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/lines/LineSegments2.js';
import {
  decimatePs2CrushGeometry,
  estimatePs2CrushMeanEdgeLength,
} from './Ps2CrushDecimator.js';
import {
  CREATIVE_CHROME_BASE_HEX,
  createCreativeLookMaterial,
  creativeLookAllowsTransparency,
  creativeLookForceTransparentDraw,
  creativeLookPresetUsesShadowReceive,
  creativeLookUsesWirePulseGeometry,
  prepareCreativeLookWirePulseGeometry,
  creativeLookUsesDustFieldGeometry,
  isDustFieldCreativeLookPreset,
  buildDustFieldGeometry,
  updateDustFieldParticlePositions,
  DUST_FIELD_PARTICLE_COUNT,
  creativeChromeRoughness,
  CREATIVE_GLASS_ENV_MAP_MUL,
  creativeGlassParamsForMesh,
  creativeLookMasterHueRadians,
  creativePs2CrushMergeFactor,
  creativePsxMergeFactor,
  creativeVgaDos3dMergeFactor,
  creativeLookUsesRetroDecimation,
  creativeLookUsesVoxelGeometry,
  creativeLookFixedPatternScale,
  creativeLookDefaultIntensity,
  creativeLookDefaultPatternScale,
  creativeLookPatternScaleBounds,
  normalizeCreativeLookPatternScale,
  creativeLookPresetUsesShaderAnimation,
  creativeLookPresetNeedsHdriBackdrop,
  isFlatPostCreativeLookPreset,
  isDitherPixelCreativeLookPreset,
  shouldResetDitherPresetTuning,
  isWatercolourCreativeLookPreset,
  isGouacheCreativeLookPreset,
  isSketchCreativeLookPreset,
  isSketchColourCreativeLookPreset,
  isSketchFamilyCreativeLookPreset,
  isVectrexCreativeLookPreset,
  isVoxelCreativeLookPreset,
  normalizeCreativeLookIntensity,
  normalizeCreativeLookLiftCrush,
  normalizeCreativeLookMasterHue,
  normalizeCreativeLookPreset,
  resolveCreativeLookPresetChoice,
  applyCreativeLookPhysicalMasterHue,
  clearCreativeLookLightingUniforms,
  ensureCreativeLookLightingUniforms,
  syncCreativeLookShadowTint,
} from './CreativeLookMaterials.js';
import {
  creativeGouacheMergeFactor,
  creativeGouacheVertexDrift,
  creativeGouacheWobbleScale,
} from './creativeLookGouacheArt.js';
import { voxelizeModelMeshes } from './Voxelizer.js';
import {
  bakeSkinnedMeshToStaticGeometry,
  meshUsesSkinning,
} from './bakeStaticSkinnedGeometry.js';
import {
  creativeVoxelMaxAxis,
  creativeVoxelMaxVoxels,
  resolveVoxelLookConfig,
} from './creativeLookVoxelArt.js';
import {
  creativeWatercolourMergeFactor,
  creativeWatercolourVertexDrift,
  creativeWatercolourWobbleScale,
} from './creativeLookWatercolourArt.js';
import {
  creativeSketchMergeFactor,
  creativeSketchVertexDrift,
  creativeSketchWobbleScale,
  resolveCreativeLookSketchParams,
} from './creativeLookSketchArt.js';
import { normalizeCreativeLookPresetParams } from './creativeLookPresetSliders.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import {
  applySvgExtrudeSurfaceToMaterial,
  computeExtrudeSurfaceMappingBounds,
  ensureSvgExtrudeFresnelChain,
  resolveOrbySurfaceUniformState,
  syncCreativeLookSurfaceToModel,
  syncSvgExtrudeSurfaceProgramCacheKey,
  getSvgExtrudeSurfacePresetConfig,
  isFresnelLinkedInSvgSurfaceChain,
  reapplySvgExtrudeSurfaceFromState,
  removeSvgExtrudeProceduralFromMaterial,
} from './SvgExtrudeSurfaceShader.js';
import { materialMatchesFbxGroup } from '../import/fbxMaterialReport.js';
import {
  getFbxTuningForImportMaterial,
  resolveFbxNormalFlipY,
  resolveFbxNormalScaleY,
} from '../import/fbxMapSlotsSettings.js';
import { syncFbxOrmPackingOnMaterial } from './fbxOrmPackingShader.js';
import { isTextureImageReady } from '../utils/textureReady.js';
import { NormalViewOverlay } from './NormalViewOverlay.js';
import { UvCheckerOverlay } from './UvCheckerOverlay.js';
import { MapInspectPreview } from './MapInspectPreview.js';
import {
  applyShadowTintToObject as patchShadowTintOnObject,
  clearShadowTintFromObject as patchClearShadowTintFromObject,
  DEFAULT_SHADOW_OPACITY,
} from './ShadowTint.js';
import {
  resolveWireframeSurfaceOffset,
  WIREFRAME_EDGES_THRESHOLD_DEG,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  DEFAULT_WIREFRAME_LINE_WIDTH,
  wireframeLineWidthToPixels,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  IMPORT_MATERIAL_MR_MULTIPLIER,
  MATERIAL_TEXTURED_BRIGHTNESS_HDR_PEAK,
  materialBrightnessLitEnvMultiplier,
  ORBY_BLACK,
  ORBY_LIME,
} from '../constants.js';

/** BLEND materials at/above this opacity are treated as fully opaque (optional alpha-hash + force-opaque modes). */
const GLTF_FULL_OPACITY_BLEND_THRESHOLD = 0.989;

/** User subsurface / translucency via MeshPhysicalMaterial.transmission (distinct from webgl_materials_subsurface_scattering ShaderMaterial demo). */
/** Set `true` to re-enable subsurface UI + shader path (see commented blocks in index.html, MeshControls, UIManager, EventManager). */
export const SUBSURFACE_FEATURE_ENABLED = false;
const SUBSURFACE_EPS = 0.001;
const DEFAULT_SUBSURFACE_SCATTER_TINT = '#ffd4b8';
/** Bump when Fresnel GLSL inject changes (forces one recompile per material). */
const FRESNEL_SHADER_INJECT_VERSION = 3;

/** Ensure fresnel color uniform stays a THREE.Color (Three may replace .value on recompile). */
function setFresnelColorUniform(uniform, cssColor) {
  const hex = cssColor || '#ffffff';
  const v = uniform?.value;
  if (v instanceof THREE.Color) {
    v.set(hex);
  } else {
    uniform.value = new THREE.Color(hex);
  }
}

/** Append GLSL immediately after the first matching include (keeps a single `#include`). */
function appendAfterShaderInclude(fragmentShader, includeName, suffix) {
  const bare = `#include <${includeName}>`;
  const tabbed = `\t${bare}`;
  if (fragmentShader.includes(tabbed)) {
    return fragmentShader.replace(tabbed, `${tabbed}${suffix}`);
  }
  if (fragmentShader.includes(bare)) {
    return fragmentShader.replace(bare, `${bare}${suffix}`);
  }
  return fragmentShader;
}

/** Insert GLSL immediately before the first matching include (include line stays once). */
function insertBeforeShaderInclude(fragmentShader, includeName, prefix) {
  const bare = `#include <${includeName}>`;
  const tabbed = `\t${bare}`;
  if (fragmentShader.includes(tabbed)) {
    return fragmentShader.replace(tabbed, `${prefix}\n${tabbed}`);
  }
  if (fragmentShader.includes(bare)) {
    return fragmentShader.replace(bare, `${prefix}\n${bare}`);
  }
  return fragmentShader;
}

const FRESNEL_UNIFORM_DECL = /* glsl */ `
        uniform vec3 fresnelColor;
        uniform float fresnelStrength;
        uniform float fresnelPower;
`;

const FRESNEL_LIGHTS_INJECT = /* glsl */ `
        vec3 fresnelNormal = normalize( normal );
        vec3 fresnelViewDir = normalize( vViewPosition );
        float fresnelTerm = pow( max(0.0, 1.0 - abs(dot(fresnelNormal, fresnelViewDir))), fresnelPower );
        vec3 fresnelContribution = fresnelColor * fresnelTerm * fresnelStrength;
        reflectedLight.directDiffuse += fresnelContribution;
        totalEmissiveRadiance += fresnelContribution;
`;

function markFresnelShaderInjectCurrent(material) {
  if (material?.userData) {
    material.userData.orbyFresnelGlslVersion = FRESNEL_SHADER_INJECT_VERSION;
  }
}

function needsFresnelShaderRecompile(material) {
  return (
    material?.userData?.orbyFresnelGlslVersion !== FRESNEL_SHADER_INJECT_VERSION
  );
}

function injectFresnelFragmentShader(shader) {
  if (!shader.fragmentShader.includes('uniform vec3 fresnelColor')) {
    shader.fragmentShader = appendAfterShaderInclude(
      shader.fragmentShader,
      'common',
      FRESNEL_UNIFORM_DECL,
    );
  }
  if (!shader.fragmentShader.includes('fresnelContribution')) {
    const before = shader.fragmentShader;
    shader.fragmentShader = insertBeforeShaderInclude(
      shader.fragmentShader,
      'lights_fragment_end',
      FRESNEL_LIGHTS_INJECT,
    );
    if (shader.fragmentShader === before) {
      console.warn('[Orby] Fresnel: could not find #include <lights_fragment_end> in material shader');
    }
  }
}

function isOrbyShaderPatchHook(hook) {
  return !!(
    hook?.__orbyFresnelShaderPatch
    || hook?.__orbyShadowTintPatch
    || hook?.__orbySvgSurfPatch
  );
}

/**
 * Base onBeforeCompile for Fresnel — not another Orby patch.
 * When shadow tint is already outer, using it as Fresnel's `original` creates a cycle
 * (shadow → fresnel → shadow → …) and duplicate GLSL on compile.
 */
function resolveFresnelBaseOnBeforeCompile(material) {
  const unwrapShadowTint = (hook) => {
    if (typeof hook === 'function' && hook.__orbyShadowTintPatch) {
      const inner = material.userData?.orbyShadowTint?.previousOnBeforeCompile;
      if (typeof inner === 'function') return inner;
    }
    return hook;
  };

  let candidate = unwrapShadowTint(material.onBeforeCompile);
  if (typeof candidate === 'function' && candidate.__orbyFresnelShaderPatch) {
    candidate = unwrapShadowTint(material.userData?.originalOnBeforeCompile);
  }

  if (typeof candidate === 'function' && !isOrbyShaderPatchHook(candidate)) {
    return candidate;
  }

  const stored = unwrapShadowTint(material.userData?.originalOnBeforeCompile);
  if (typeof stored === 'function' && stored.__orbyFresnelShaderPatch) {
    return () => {};
  }
  if (typeof stored === 'function' && !isOrbyShaderPatchHook(stored)) {
    return stored;
  }

  return () => {};
}

export class MaterialController {
  constructor({
    stateStore,
    modelRoot,
    onShadingChanged = null,
    onMaterialUpdate = null,
    /** Optional `(out?: THREE.Vector3) => THREE.Vector3` — world-space direction **toward** key light for creative **toon**. */
    getCreativeLookKeyLightDir = null,
    /** Optional `() => { lightScale, ambientFloor }` — studio rig strength for toon / PS2 Crush. */
    getCreativeLookToonLightScalars = null,
    /** Called after creative ShaderMaterials are (re)built — e.g. `renderer.compile(scene, camera)` to avoid first-draw hitches. */
    afterCreativeLookMaterialRebuild = null,
    /** Glass / Chrome — ensure HDRI Render Backdrop is on `scene.background` before materials build. */
    onNeedsTransmissionBackdrop = null,
    /** Called when ASCII Art live uniforms change — sync screen-space glyph pass. */
    onCreativeLookAsciiSync = null,
    /** Pause animations at clip 0 / frame 0 before skinned voxel baking. */
    prepareStaticVoxelPose = null,
    /** Restore animation pose after skinned voxel baking. */
    restoreStaticVoxelPose = null,
  }) {
    this.stateStore = stateStore;
    this.modelRoot = modelRoot;
    this.onShadingChanged = onShadingChanged;
    this.onMaterialUpdate = onMaterialUpdate;
    this.getCreativeLookKeyLightDir = getCreativeLookKeyLightDir;
    this.getCreativeLookToonLightScalars = getCreativeLookToonLightScalars;
    this.afterCreativeLookMaterialRebuild = afterCreativeLookMaterialRebuild;
    this.onNeedsTransmissionBackdrop = onNeedsTransmissionBackdrop;
    this.onCreativeLookAsciiSync = onCreativeLookAsciiSync;
    this.prepareStaticVoxelPose = prepareStaticVoxelPose;
    this.restoreStaticVoxelPose = restoreStaticVoxelPose;

    this.currentModel = null;
    this.currentShading = null;
    this.originalMaterials = new WeakMap();
    /** @type {THREE.Mesh[]|null} Wire overlay meshes (parented next to their source mesh for correct hierarchy). */
    this.wireframeOverlayMeshes = null;
    /** @type {import('three/examples/jsm/lines/LineMaterial.js').LineMaterial|null} */
    this._wireframeLineMaterial = null;
    /** @type {THREE.MeshBasicMaterial|null} */
    this._wireframeBasicMaterial = null;
    /** UV Checker overlay (Atlux map) — extracted to keep this controller focused on materials/shading. */
    this.uvCheckerOverlay = new UvCheckerOverlay();
    /** Normal / tangent diagnostic overlay (Object → Advanced). */
    this.normalViewOverlay = new NormalViewOverlay();
    /** Hover preview for Object → Maps channel inspection. */
    this.mapInspectPreview = new MapInspectPreview(this);
    this.unlitMode = false;

    // Settings
    this.claySettings = {};
    this.fresnelSettings = {};
    this.subsurfaceSettings = {
      enabled: false,
      translucency: 0,
      scatterTint: DEFAULT_SUBSURFACE_SCATTER_TINT,
    };
    this.wireframeSettings = {};
    this.shadowTintColor = stateStore?.getState()?.lightsShadowColor ?? '#080808';
    this.shadowTintStrength = 0;
    this.shadowTintOpacity =
      stateStore?.getState()?.lightsShadowOpacity ?? DEFAULT_SHADOW_OPACITY;
    /** @type {THREE.Texture|null} */
    this._lastEnvTexture = null;
    this._lastEnvIntensity = 1;
    this._lastHdriBlurriness = 0;
    /** When enabled, replaces non-glass mesh materials with creative ShaderMaterials (restored when off). */
    this.creativeLookSettings = {
      enabled: false,
      preset: null,
      pauseShaderAnimations: false,
      shaderAnimationSpeed: 0.4,
      patternScale: 1,
      masterHue: 0,
      intensity: 1,
      liftCrush: 0,
      viewportBloom: false,
      presetParams: {},
    };
    /** Clock time (seconds) for animated presets (flow-field, plasma). */
    this._creativeLookTime = 0;
    /** Wall-clock snapshot when `pauseShaderAnimations` is on (frozen `uTime`). */
    this._creativeLookPausedAt = null;
    /** Reused when syncing toon `uLightDir` from scene key light. */
    this._creativeToonKeyDirScratch = new THREE.Vector3();
    /** Last preset whose ShaderMaterials are on the mesh — drives redundant-apply detection. */
    this._appliedCreativeLookPreset = null;
    this.materialSettings = {
      brightness: DEFAULT_MATERIAL_BRIGHTNESS,
      metalness: 0.0,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      emissive: 0.0,
    };
  }

  setModel(model, shading, initialState = {}) {
    this.currentModel = model;
    this.currentShading = shading;
    this.claySettings = { ...(initialState.clay || {}) };
    this.fresnelSettings = { ...(initialState.fresnel || {}) };
    this.subsurfaceSettings = {
      enabled: initialState.subsurface?.enabled === true,
      translucency: initialState.subsurface?.translucency ?? 0,
      scatterTint: initialState.subsurface?.scatterTint ?? DEFAULT_SUBSURFACE_SCATTER_TINT,
    };
    this.wireframeSettings = {
      ...(initialState.wireframe || {
        alwaysOn: false,
        color: ORBY_LIME,
        onlyVisibleFaces: true,
        hideMesh: false,
        thickness: DEFAULT_WIREFRAME_LINE_WIDTH,
      }),
    };
    {
      const adv = initialState.advanced ?? {};
      this.uvCheckerOverlay.applySettings({
        enabled: adv.uvChecker === true,
        scale: adv.uvCheckerScale,
        style: adv.uvCheckerStyle,
      });
      this.uvCheckerOverlay.setModel(model);
      this.normalViewOverlay.applySettings({
        enabled: adv.normalView === true,
        mode: adv.normalViewMode,
      });
      this.normalViewOverlay.setModel(model);
    }
    const icl = initialState.creativeLook ?? {};
    this.creativeLookSettings = {
      enabled: icl.enabled === true,
      preset: normalizeCreativeLookPreset(icl.preset),
      pauseShaderAnimations: icl.pauseShaderAnimations === true,
      shaderAnimationSpeed: (() => {
        const sp = Number(icl.shaderAnimationSpeed);
        return Number.isFinite(sp) ? THREE.MathUtils.clamp(sp, 0, 2) : 0.4;
      })(),
      patternScale: normalizeCreativeLookPatternScale(
        normalizeCreativeLookPreset(icl.preset),
        icl.patternScale,
      ),
      masterHue: normalizeCreativeLookMasterHue(icl.masterHue),
      intensity: normalizeCreativeLookIntensity(icl.intensity),
      liftCrush: normalizeCreativeLookLiftCrush(icl.liftCrush),
      viewportBloom: icl.viewportBloom === true,
      presetParams: normalizeCreativeLookPresetParams(
        normalizeCreativeLookPreset(icl.preset),
        icl.presetParams ?? {},
        icl.patternScale,
      ),
    };
    this.materialSettings = {
      brightness:
        initialState.material?.brightness ??
        initialState.diffuseBrightness ??
        DEFAULT_MATERIAL_BRIGHTNESS,
      metalness: 0.0,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      emissive: initialState.material?.emissive ?? 0.0,
    };
    this.originalMaterials = new WeakMap();
    this._appliedCreativeLookPreset = null;
    this.prepareMesh(model);
    this._syncImportPbrFromModel(model);
    this.stateStore?.set(
      'material.importHasMrMaps',
      this._modelHasImportMrMaps(model),
    );
    this.stateStore?.set(
      'material.importUsesAuthoredPbr',
      this._modelHasAuthoredPbrMaterials(model),
    );
    // Note: Fresnel will be applied by setShading, which is called after setModel
  }

  prepareMesh(object) {
    this._snapshotImportMaterialBaselinesIfNeeded(object);

    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Extrude rebuilds swap mesh nodes — refresh import snapshots, never Shader Lab clones.
        if (
          child.userData?.orbySvgExtrude ||
          child.userData?.orbyFontExtrude
        ) {
          const importMat = this._resolveExtrudeImportMaterialForMesh(child);
          if (importMat) this.originalMaterials.set(child, importMat);
        } else if (!this.originalMaterials.has(child)) {
          this.originalMaterials.set(child, child.material);
        }
        const stored = this.originalMaterials.get(child);
        const srcMats = Array.isArray(stored) ? stored : [stored];
        for (const m of srcMats) {
          if (m) this._syncEmissiveDisplayMesh(child, m);
        }
        // Some exporters set an own `onBeforeCompile: undefined` on materials, which shadows
        // Material.prototype.onBeforeCompile and breaks customProgramCacheKey (undefined.toString()).
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m?.isMaterial && typeof m.onBeforeCompile !== 'function') {
            delete m.onBeforeCompile;
          }
        }
      }
    });

    this.applyTransparencyPipeline(object);
  }

  _forEachMeshMaterial(object, callback) {
    if (!object) return;
    object.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < mats.length; i++) {
        const m = mats[i];
        if (m) callback(child, m);
      }
    });
  }

  _forEachUniqueMaterial(object, callback) {
    const seen = new Set();
    this._forEachMeshMaterial(object, (mesh, m) => {
      if (seen.has(m)) return;
      seen.add(m);
      callback(m);
    });
  }

  /** Import/source materials from {@link #originalMaterials} — pipeline must drive these, not shaded clones. */
  _forEachImportMaterial(object, callback) {
    if (!object) return;
    const seen = new Set();
    object.traverse((child) => {
      if (!child.isMesh) return;
      const stored = this.originalMaterials.get(child);
      const source = stored ?? child.material;
      const mats = Array.isArray(source) ? source : [source];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        callback(m, child);
      }
    });
  }

  _forEachImportMeshMaterial(object, callback) {
    if (!object) return;
    object.traverse((child) => {
      if (!child.isMesh) return;
      const stored = this.originalMaterials.get(child);
      const source = stored ?? child.material;
      const mats = Array.isArray(source) ? source : [source];
      for (const m of mats) {
        if (m) callback(child, m);
      }
    });
  }

  /** Three.js applies glTF alphaMode but does not store it — infer once at import snapshot. */
  _inferGltfAlphaMode(m) {
    if (m.userData?.alphaMode) return m.userData.alphaMode;
    if (m.alphaTest > 0) return 'MASK';
    if (m.transparent) return 'BLEND';
    return 'OPAQUE';
  }

  /** Import snapshot had KHR_materials_transmission (baseline), not live transmission slider state. */
  _materialHadImportTransmission(m) {
    if (m?.userData?.orbyGltfTransmissionFallback) return true;
    const importT = Number(m?.userData?.orbyGltfImportBaseline?.transmission);
    return Number.isFinite(importT) && importT > 1e-4;
  }

  /** Import had KHR_materials_transmission — includes live drift before baseline is snapshotted. */
  _materialHasImportTransmission(m) {
    if (m?.userData?.orbyGltfTransmissionFallback) return true;
    if (this._materialHadImportTransmission(m)) return true;
    return (
      m?.isMeshPhysicalMaterial &&
      (Number(m.transmission) > 1e-4 || !!m.transmissionMap)
    );
  }

  /** True when the loaded model uses KHR_materials_transmission (import baseline). */
  modelHasGltfTransmissionMaterials(object) {
    if (!object) return false;
    let found = false;
    this._forEachImportMaterial(object, (m) => {
      if (found) return;
      if (this._materialHasImportTransmission(m)) found = true;
    });
    return found;
  }

  /** glTF BLEND + emissiveTexture (HUD / MFD holograms) — must keep alpha from baseColor, never force opaque. */
  _materialIsEmissiveDisplay(m) {
    if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return false;
    if (m.userData?.orbyEmissiveBlend) return true;
    if (m.emissiveMap) return true;
    return this._importMaterialHasEmissiveBaseline(m);
  }

  _syncEmissiveBlendMaterial(m) {
    if (!this._materialIsEmissiveDisplay(m)) return;
    const alphaMode = m.userData?.alphaMode ?? this._inferGltfAlphaMode(m);
    const isBlendDisplay =
      alphaMode === 'BLEND' || (m.transparent && !this._materialHasImportTransmission(m));
    if (!isBlendDisplay) return;

    m.userData.orbyEmissiveBlend = true;
    m.userData.orbySkipBlendMitigation = true;
    if ('alphaHash' in m) m.alphaHash = false;
    m.opacity = 1;

    // Binary-alpha hologram quads (HUD/MFD): alphaTest cutout avoids solid black BLEND shells in WebGL.
    if (m.map) {
      m.alphaTest = 0.02;
      m.transparent = false;
      m.depthWrite = true;
    } else {
      m.alphaTest = 0;
      m.transparent = true;
      m.depthWrite = false;
    }
    m.needsUpdate = true;
  }

  /** Emissive BLEND display (HUD plane, MFD) — keep import PBR; global sliders must not repaint the quad. */
  _isEmissiveBlendDisplayImport(importMat) {
    if (!importMat || !this._materialIsEmissiveDisplay(importMat)) return false;
    const alphaMode =
      importMat.userData?.alphaMode ?? this._inferGltfAlphaMode(importMat);
    return alphaMode === 'BLEND' || !!importMat.transparent;
  }

  /**
   * HUD / MFD hologram meshes: draw after glass, and opt out of N8AO's transparency-aware AO skip
   * (transparent + depthWrite:false otherwise keeps full brightness while the cockpit darkens).
   */
  _syncEmissiveDisplayMesh(mesh, importMat) {
    if (!mesh?.isMesh || !this._isEmissiveBlendDisplayImport(importMat)) return;
    mesh.renderOrder = 10;
    mesh.userData.treatAsOpaque = true;
  }

  _emissiveDisplayGain(importMat, userEmissive = 0) {
    const ei = Number(importMat?.emissiveIntensity);
    let baseGain = 1;
    if (importMat?.emissiveMap && (!Number.isFinite(ei) || ei <= 0)) {
      baseGain = 1;
    } else if (Number.isFinite(ei) && ei > 0) {
      baseGain = ei;
    }
    const slider = userEmissive > 0 ? userEmissive : 0;
    return baseGain * (slider > 0 ? 1 + slider : 1);
  }

  /**
   * HUD / MFD holograms: draw emissiveTexture with additive blending so black texels add nothing
   * (avoids solid BLEND quads that block the cockpit in WebGL).
   */
  _buildEmissiveDisplayMaterial(importMat, userEmissive = 0) {
    const tex = importMat?.emissiveMap || importMat?.map;
    if (!tex) return null;
    const mat = new THREE.MeshBasicMaterial({
      name: importMat.name || '',
      map: tex,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: importMat.side ?? THREE.DoubleSide,
      toneMapped: importMat.toneMapped !== false,
    });
    mat.color.setScalar(this._emissiveDisplayGain(importMat, userEmissive));
    mat.userData.orbyEmissiveBlend = true;
    mat.userData.orbyEmissiveDisplay = true;
    mat.userData.orbySkipBlendMitigation = true;
    return mat;
  }

  _applyEmissiveDisplayMaterialGain(target, importMat, userEmissive = 0) {
    if (!target?.userData?.orbyEmissiveDisplay || !target.isMeshBasicMaterial) return;
    target.color.setScalar(this._emissiveDisplayGain(importMat, userEmissive));
    target.needsUpdate = true;
  }

  /** Advanced → glass slider bundle for import glTF glass presentation. */
  _glassPresentationFromState() {
    const adv = this.stateStore?.getState()?.advanced;
    const rawOp = adv?.glassOpacity;
    const glassOpacity = Number.isFinite(Number(rawOp))
      ? Math.min(1, Math.max(0.02, Number(rawOp)))
      : 0.45;
    const rawBody = adv?.glassBody;
    const glassBody = Number.isFinite(Number(rawBody))
      ? Math.min(1, Math.max(0, Number(rawBody)))
      : 0;
    const rawTint = adv?.glassTint;
    const glassTintHex =
      typeof rawTint === 'string' && /^#[0-9A-Fa-f]{6}$/.test(rawTint.trim())
        ? rawTint.trim()
        : ORBY_BLACK;
    const rawRef = adv?.glassReflection;
    const glassReflection = Number.isFinite(Number(rawRef))
      ? Math.min(4, Math.max(0, Number(rawRef)))
      : 2;
    return { glassOpacity, glassBody, glassTintHex, glassReflection };
  }

  /**
   * KHR_materials_transmission → env-heavy BLEND glass (Punto-style), not Three.js transmission pass.
   * Demote MeshPhysicalMaterial → MeshStandardMaterial so transmission can never re-enter the render list.
   */
  _applyImportGltfGlassPresentation(m, opts = {}) {
    if (!m || !this._materialHasImportTransmission(m)) return m;
    if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return m;

    const b = m.userData?.orbyGltfImportBaseline;
    const glassOpacity = opts.glassOpacity ?? this._glassPresentationFromState().glassOpacity;
    const glassBody = opts.glassBody ?? this._glassPresentationFromState().glassBody;
    const glassTintHex = opts.glassTintHex ?? this._glassPresentationFromState().glassTintHex;
    const bodyDarken = Math.max(0.06, 1 - 0.72 * glassBody);
    const bodyOpacity = Math.min(
      1,
      glassOpacity + glassBody * (1 - glassOpacity) * 0.55,
    );
    const importRough = Number.isFinite(b?.roughness) ? b.roughness : Number(m.roughness);
    const glassRough = Number.isFinite(importRough)
      ? THREE.MathUtils.clamp(importRough, 0.02, 0.18)
      : 0.08;

    let target = m;
    if (m.isMeshPhysicalMaterial && !m.userData?.orbyGltfGlassStandardFallback) {
      target = new THREE.MeshStandardMaterial();
      target.name = m.name;
      target.userData = {
        ...(m.userData || {}),
        orbyGltfTransmissionFallback: true,
        orbyGltfGlassStandardFallback: true,
        orbySkipBlendMitigation: true,
      };
      if (m.envMap) target.envMap = m.envMap;
      if (m.envMapIntensity !== undefined) target.envMapIntensity = m.envMapIntensity;
      if (m.normalMap) {
        target.normalMap = m.normalMap;
        if (m.normalScale?.clone) target.normalScale = m.normalScale.clone();
      }
      m.dispose?.();
    }

    // Author baseColor maps for transmission often encode visibility in alpha (~0 on this ship).
    target.map = null;
    target.alphaMap = null;
    const tint = new THREE.Color(glassTintHex);
    if (b?.color?.isColor) {
      target.color.copy(b.color).lerp(tint, 0.72);
    } else if (b?.color) {
      target.color.set(b.color).lerp(tint, 0.72);
    } else {
      target.color.copy(tint);
    }
    target.color.multiplyScalar(bodyDarken);
    target.roughness = glassRough;
    target.metalness = 0;
    target.opacity = Math.max(0.08, bodyOpacity);
    target.transparent = true;
    target.depthWrite = false;
    if ('alphaHash' in target) target.alphaHash = false;
    target.side = b?.side ?? target.side ?? THREE.DoubleSide;
    target.userData.orbyGltfTransmissionFallback = true;
    target.userData.orbySkipBlendMitigation = true;
    target.needsUpdate = true;
    return target;
  }

  /** Swap a material reference on every mesh + import snapshot (shared glTF materials). */
  _replaceMaterialReference(object, oldMat, newMat) {
    if (!object || !oldMat || !newMat || oldMat === newMat) return;
    object.traverse((child) => {
      if (!child.isMesh) return;
      const patch = (cur) => {
        if (cur === oldMat) return newMat;
        if (Array.isArray(cur)) {
          let changed = false;
          const next = cur.map((mat) => {
            if (mat === oldMat) {
              changed = true;
              return newMat;
            }
            return mat;
          });
          return changed ? next : cur;
        }
        return cur;
      };
      const nextLive = patch(child.material);
      if (nextLive !== child.material) child.material = nextLive;
      const stored = this.originalMaterials.get(child);
      if (stored) {
        const nextStored = patch(stored);
        if (nextStored !== stored) this.originalMaterials.set(child, nextStored);
      }
    });
  }

  _assignImportGltfGlassPresentation(object, m, opts = {}) {
    const next = this._applyImportGltfGlassPresentation(m, opts);
    if (next && next !== m) this._replaceMaterialReference(object, m, next);
    return next;
  }

  _syncTransparentFlagsFromImport(target, importMat) {
    if (!target || !importMat) return;
    const hasImportTransmission = this._materialHasImportTransmission(importMat);
    const b = importMat.userData?.orbyGltfImportBaseline;
    // KHR_materials_transmission imports use BLEND fallback — baseline opacity/map are for the native pass.
    if (b && !hasImportTransmission) {
      if (importMat.userData?.orbyGlassPresentation) {
        target.transparent = !!importMat.transparent;
        target.opacity = Number.isFinite(importMat.opacity) ? importMat.opacity : 1;
        target.depthWrite = importMat.depthWrite !== false;
        if (importMat.color?.isColor) target.color.copy(importMat.color);
        if ('alphaHash' in target) target.alphaHash = !!importMat.alphaHash;
      } else {
        const mitigation = importMat.userData?.orbyBlendMitigation;
        if (mitigation === 'opaque') {
          target.transparent = false;
          target.opacity = 1;
          target.depthWrite = true;
          if ('alphaHash' in target) target.alphaHash = false;
        } else if (mitigation === 'alphaHash') {
          target.transparent = b.transparent;
          target.opacity = b.opacity;
          target.depthWrite = b.depthWrite;
          if ('alphaHash' in target) target.alphaHash = true;
        } else {
          target.transparent = b.transparent;
          target.opacity = b.opacity;
          target.depthWrite = b.depthWrite;
          if ('alphaHash' in target) target.alphaHash = b.alphaHash;
        }
      }
      if (b.alphaMode) target.userData.alphaMode = b.alphaMode;
    }
    if (importMat.userData?.orbyEmissiveBlend || this._materialIsEmissiveDisplay(importMat)) {
      this._syncEmissiveBlendMaterial(target);
    }
    if (importMat.userData?.orbySkipBlendMitigation) {
      target.userData.orbySkipBlendMitigation = true;
    }
  }

  applyEmissiveBlendPresentation(object) {
    this._forEachImportMaterial(object, (m) => this._syncEmissiveBlendMaterial(m));
  }

  /**
   * Whether the imported material had emissive content (glTF emissiveTexture / emissiveFactor, etc.).
   * `targetMat` is the live shaded clone when available — its emissiveMap can differ if import was synced late.
   * When false and the user Emissive slider is 0, we clear emissive on the working material.
   */
  _importMaterialHasEmissiveBaseline(importMat, targetMat) {
    if (importMat?.emissiveMap || targetMat?.emissiveMap) return true;
    if (!importMat) return false;
    const int = Number(importMat.emissiveIntensity);
    if (!Number.isFinite(int) || int === 0 || !importMat.emissive) return false;
    const e = importMat.emissive;
    return e.r !== 0 || e.g !== 0 || e.b !== 0;
  }

  /**
   * Whether ANY material in the current model has emissive baseline (import or live, e.g. user-added
   * FBX emissive slot map). Used to gate the legacy diffuse-tint fallback so plain non-emissive
   * materials in a model that already contains emissive parts don't get globally lit when the slider
   * is raised. Computed on demand and cheap (one traversal); callers should compute once per
   * top-level update and pass through to {@link #_applyUserEmissiveOrRestoreImport}.
   */
  _modelHasAnyEmissiveBaseline() {
    if (!this.currentModel) return false;
    let found = false;
    this.currentModel.traverse((child) => {
      if (found || !child.isMesh) return;
      const original = this.originalMaterials?.get(child);
      const live = child.material;
      const liveArr = Array.isArray(live) ? live : [live];
      const origArr = Array.isArray(original) ? original : [original];
      for (let i = 0; i < liveArr.length; i++) {
        if (this._importMaterialHasEmissiveBaseline(origArr[i], liveArr[i])) {
          found = true;
          return;
        }
      }
    });
    return found;
  }

  /**
   * User Emissive slider > 0:
   * - Materials that already had glTF/FBX emissive content: boost authored emissive (map + factor) via
   *   intensity × (1 + slider) so only emissive channels brighten — diffuse is never copied into emissive.
   * - Materials with no import emissive, in a model that has *some* emissive parts: leave non-emissive
   *   (don't smear diffuse-tinted glow over plates/bodies that the artist authored as non-glowing).
   * - Materials with no import emissive, in a model that has *no* emissive at all: legacy tint-based
   *   glow using the brightness-adjusted diffuse color (so the slider remains useful for plain models).
   * Slider at 0: keep file emissive + map so glTF emissive textures are not wiped by updateMaterials / setShading.
   */
  _applyUserEmissiveOrRestoreImport(target, importMat, adjustedColor, userEmissive, modelHasEmissive = false) {
    const slider = userEmissive > 0 ? userEmissive : 0;
    if (slider > 0) {
      if (this._importMaterialHasEmissiveBaseline(importMat, target)) {
        const map = importMat?.emissiveMap || target?.emissiveMap;
        if (map) target.emissiveMap = map;

        if (importMat?.emissive) {
          target.emissive.copy(importMat.emissive);
        } else if (map) {
          target.emissive.setRGB(1, 1, 1);
        } else {
          target.emissive.set(0, 0, 0);
        }
        if (
          map &&
          target.emissive.r === 0 &&
          target.emissive.g === 0 &&
          target.emissive.b === 0
        ) {
          target.emissive.setRGB(1, 1, 1);
        }
        const ei = importMat?.emissiveIntensity;
        let baseIntensity;
        if (map && (!Number.isFinite(ei) || ei <= 0)) {
          baseIntensity = 1;
        } else {
          baseIntensity = Number.isFinite(ei) && ei >= 0 ? ei : 1;
        }
        target.emissiveIntensity = baseIntensity * (1 + slider);
        return;
      }
      if (modelHasEmissive) {
        target.emissive.set(0, 0, 0);
        target.emissiveIntensity = 0;
        return;
      }
      target.emissive.copy(adjustedColor).multiplyScalar(slider);
      target.emissiveIntensity = slider;
      return;
    }
    const map = importMat?.emissiveMap || target?.emissiveMap;
    if (map) target.emissiveMap = map;

    if (this._importMaterialHasEmissiveBaseline(importMat, target)) {
      if (importMat?.emissive) target.emissive.copy(importMat.emissive);
      else if (map) target.emissive.setRGB(1, 1, 1);
      else target.emissive.set(0, 0, 0);
      // Rare broken exports: emissiveTexture but zero emissiveFactor — still show the map.
      if (
        map &&
        target.emissive.r === 0 &&
        target.emissive.g === 0 &&
        target.emissive.b === 0
      ) {
        target.emissive.setRGB(1, 1, 1);
      }
      const ei = importMat?.emissiveIntensity;
      if (map && (!Number.isFinite(ei) || ei <= 0)) {
        target.emissiveIntensity = 1;
      } else {
        target.emissiveIntensity = Number.isFinite(ei) && ei >= 0 ? ei : 1;
      }
      return;
    }
    target.emissive.set(0, 0, 0);
    target.emissiveIntensity = 0;
  }

  /**
   * Reattach emissive textures from {@link #originalMaterials} to shaded clones and re-apply the
   * emissive slider vs import baseline. Run deferred once after load so any late texture binding
   * on the import material still reaches the mesh.
   */
  resyncEmissiveFromImportedMaterials() {
    if (!this.currentModel || this.currentShading !== 'shaded') return;

    const userEm = this.materialSettings.emissive ?? 0;
    const bright = this.materialSettings.brightness ?? DEFAULT_MATERIAL_BRIGHTNESS;
    const modelHasEmissive = this._modelHasAnyEmissiveBaseline();

    this.currentModel.traverse((child) => {
      if (!child.isMesh || this.isWindowMesh(child)) return;
      const original = this.originalMaterials.get(child);
      if (!original) return;

      const patch = (mat, idx) => {
        if (!mat) return;
        const origMat = Array.isArray(original) ? original[idx] : original;
        if (!origMat) return;
        if (mat.userData?.orbyEmissiveDisplay && mat.isMeshBasicMaterial) {
          this._applyEmissiveDisplayMaterialGain(mat, origMat, userEm);
          return;
        }
        if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
        if (origMat.emissiveMap && mat.emissiveMap !== origMat.emissiveMap) {
          mat.emissiveMap = origMat.emissiveMap;
        }
        const adjustedColor = this._diffuseColorWithBrightness(
          this._importDiffuseTintForShading(origMat),
          bright,
          undefined,
          origMat,
        );
        mat.color.copy(adjustedColor);
        this._applyUserEmissiveOrRestoreImport(mat, origMat, adjustedColor, userEm, modelHasEmissive);
        this._syncTransparentFlagsFromImport(mat, origMat);
        mat.needsUpdate = true;
      };

      if (Array.isArray(child.material) && Array.isArray(original)) {
        child.material.forEach((m, i) => patch(m, i));
      } else if (child.material) {
        patch(child.material, 0);
      }
    });

    if (this.fresnelSettings?.enabled) {
      this.applyFresnelToModel(this.currentModel);
    }
    this.reapplySvgExtrudeSurfaceShaders();
  }

  _importMaterialHasMrMaps(mat) {
    return !!(mat?.metalnessMap?.isTexture || mat?.roughnessMap?.isTexture);
  }

  /** Whether any import material on the model carries metalness/roughness maps. */
  _modelHasImportMrMaps(object) {
    if (!object) return false;
    let hasMaps = false;
    object.traverse((child) => {
      if (hasMaps || !child.isMesh) return;
      const stored = this.originalMaterials.get(child);
      const mats = Array.isArray(stored) ? stored : [stored];
      for (const mat of mats) {
        if (mat && this._importMaterialHasMrMaps(mat)) {
          hasMaps = true;
          return;
        }
      }
    });
    return hasMaps;
  }

  /** Whether any import material is standard/physical PBR (per-material authored factors). */
  _modelHasAuthoredPbrMaterials(object) {
    if (!object) return false;
    let hasPbr = false;
    object.traverse((child) => {
      if (hasPbr || !child.isMesh) return;
      const stored = this.originalMaterials.get(child);
      const mats = stored
        ? Array.isArray(stored)
          ? stored
          : [stored]
        : Array.isArray(child.material)
          ? child.material
          : [child.material];
      for (const mat of mats) {
        if (mat?.isMeshStandardMaterial || mat?.isMeshPhysicalMaterial) {
          hasPbr = true;
          return;
        }
      }
    });
    return hasPbr;
  }

  /**
   * Authored metalness/roughness from import snapshot (or live import mat).
   * @param {import('three').Material | null | undefined} importMat
   * @returns {{ metalness: number, roughness: number, hasMrMaps: boolean } | null}
   */
  _resolveAuthoredMetalRoughness(importMat) {
    const baseline = importMat?.userData?.orbyGltfImportBaseline;
    if (baseline?.metalness !== undefined || baseline?.roughness !== undefined) {
      return {
        metalness: Number.isFinite(baseline.metalness) ? baseline.metalness : 0,
        roughness: Number.isFinite(baseline.roughness)
          ? baseline.roughness
          : DEFAULT_MATERIAL_ROUGHNESS,
        hasMrMaps: !!baseline.hasMrMaps,
      };
    }
    if (
      importMat &&
      (importMat.isMeshStandardMaterial || importMat.isMeshPhysicalMaterial)
    ) {
      return {
        metalness: Number.isFinite(importMat.metalness) ? importMat.metalness : 0,
        roughness: Number.isFinite(importMat.roughness)
          ? importMat.roughness
          : DEFAULT_MATERIAL_ROUGHNESS,
        hasMrMaps: this._importMaterialHasMrMaps(importMat),
      };
    }
    return null;
  }

  /** On mesh load, set global MR sliders to neutral multipliers (1.0 = as-authored). */
  _syncImportPbrFromModel(model) {
    if (!this._modelHasAuthoredPbrMaterials(model)) return;
    const neutral = IMPORT_MATERIAL_MR_MULTIPLIER;
    this.materialSettings.metalness = neutral;
    this.materialSettings.roughness = neutral;
    this.stateStore?.set('material.metalness', neutral);
    this.stateStore?.set('material.roughness', neutral);
  }

  /**
   * Shaded mode: scale authored factors by global sliders; keep import MR maps when present.
   * Scalar-only: authored × slider. MR-mapped: authored × slider, except when both authored
   * factors are ~0 (Sketchfab-style placeholder) — then slider is the glTF factor on the map.
   */
  _applyShadedMetalRoughness(target, importMat) {
    if (!target) return;
    const globalM = Number.isFinite(this.materialSettings.metalness)
      ? this.materialSettings.metalness
      : IMPORT_MATERIAL_MR_MULTIPLIER;
    const globalR = Number.isFinite(this.materialSettings.roughness)
      ? this.materialSettings.roughness
      : IMPORT_MATERIAL_MR_MULTIPLIER;

    const authored = this._resolveAuthoredMetalRoughness(importMat);
    if (authored) {
      const mapPlaceholderScalars =
        authored.hasMrMaps &&
        authored.metalness < 1e-6 &&
        authored.roughness < 1e-6;
      if (mapPlaceholderScalars) {
        target.metalness = THREE.MathUtils.clamp(globalM, 0, 1);
        target.roughness = THREE.MathUtils.clamp(globalR, 0, 1);
      } else {
        target.metalness = THREE.MathUtils.clamp(authored.metalness * globalM, 0, 1);
        target.roughness = THREE.MathUtils.clamp(authored.roughness * globalR, 0, 1);
      }
      if (authored.hasMrMaps && importMat) {
        if (importMat.metalnessMap && !target.metalnessMap) {
          target.metalnessMap = importMat.metalnessMap;
        }
        if (importMat.roughnessMap && !target.roughnessMap) {
          target.roughnessMap = importMat.roughnessMap;
        }
      } else {
        if ('metalnessMap' in target) target.metalnessMap = null;
        if ('roughnessMap' in target) target.roughnessMap = null;
      }
      return;
    }

    target.metalness = globalM;
    target.roughness = globalR;
    const hasMrMaps = this._importMaterialHasMrMaps(importMat);
    if (hasMrMaps && importMat) {
      if (importMat.metalnessMap && !target.metalnessMap) {
        target.metalnessMap = importMat.metalnessMap;
      }
      if (importMat.roughnessMap && !target.roughnessMap) {
        target.roughnessMap = importMat.roughnessMap;
      }
      return;
    }
    if ('metalnessMap' in target) target.metalnessMap = null;
    if ('roughnessMap' in target) target.roughnessMap = null;
  }

  /**
   * Capture loader output once per material so Advanced → Alpha modes can restore and re-apply.
   */
  _snapshotImportMaterialBaselinesIfNeeded(object) {
    this._forEachUniqueMaterial(object, (m) => {
      if (m.userData?.orbyGltfImportBaseline) return;
      if (!('transparent' in m)) return;
      m.userData.alphaMode = this._inferGltfAlphaMode(m);
      const baseline = {
        transparent: !!m.transparent,
        opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
        side: m.side,
        depthWrite: m.depthWrite !== false,
        alphaHash: 'alphaHash' in m ? !!m.alphaHash : false,
        alphaMode: m.userData.alphaMode,
      };
      if (m.isMeshPhysicalMaterial) {
        baseline.transmission = Number(m.transmission) || 0;
        baseline.thickness = Number.isFinite(m.thickness) ? m.thickness : 0;
        baseline.roughness = Number.isFinite(m.roughness) ? m.roughness : undefined;
        baseline.ior = Number.isFinite(m.ior) ? m.ior : undefined;
        baseline.color = m.color?.clone?.() ?? null;
      }
      if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) {
        baseline.metalness = Number.isFinite(m.metalness)
          ? THREE.MathUtils.clamp(m.metalness, 0, 1)
          : 0;
        baseline.roughness = Number.isFinite(m.roughness)
          ? THREE.MathUtils.clamp(m.roughness, 0, 1)
          : DEFAULT_MATERIAL_ROUGHNESS;
        baseline.hasMrMaps = this._importMaterialHasMrMaps(m);
      }
      if (
        (m.emissiveMap || this._importMaterialHasEmissiveBaseline(m)) &&
        baseline.alphaMode === 'BLEND'
      ) {
        m.userData.orbyEmissiveBlend = true;
      }
      m.userData.orbyGltfImportBaseline = baseline;
    });
  }

  _restoreImportMaterialBaselines(object) {
    this._forEachImportMaterial(object, (m) => {
      const b = m.userData?.orbyGltfImportBaseline;
      if (!b) return;
      m.transparent = b.transparent;
      m.opacity = b.opacity;
      m.side = b.side;
      m.depthWrite = b.depthWrite;
      if ('alphaHash' in m) m.alphaHash = b.alphaHash;
      if (b.alphaMode) m.userData.alphaMode = b.alphaMode;
      if (m.isMeshPhysicalMaterial && b.transmission !== undefined) {
        const hadImportTransmission = Number(b.transmission) > 1e-4;
        if (hadImportTransmission) {
          // KHR_materials_transmission — keep pass off; _applyImportGltfGlassPresentation runs after.
          m.transmission = 0;
          m.transmissionMap = null;
          m.thickness = 0;
          if (b.color && m.color) m.color.copy(b.color);
        } else {
          m.transmission = b.transmission;
          if (b.thickness !== undefined) m.thickness = b.thickness;
          if (b.color && m.color) m.color.copy(b.color);
        }
      }
      delete m.userData.orbyGlassPresentation;
      delete m.userData.orbyBlendMitigation;
      delete m.userData.orbyUserOpaqueBlend;
      delete m.userData.orbyAdvGlassPhysical;
      m.needsUpdate = true;
    });
  }

  /**
   * User-controlled transparency handling (Advanced panel). Starts from imported material state each time.
   */
  applyTransparencyPipeline(object) {
    if (!object) return;
    this._restoreImportMaterialBaselines(object);

    const mode = this.stateStore?.getState()?.advanced?.transparencyFix ?? 'default';

    if (mode === 'opaqueBlend') {
      this._applyUserForceOpaqueBlend(object);
    } else if (mode === 'frontFace') {
      this._applyUserForceFrontFace(object);
    } else if (mode === 'opaqueAndFrontFace') {
      this._applyUserForceOpaqueBlend(object);
      this._applyUserForceFrontFace(object);
    } else {
      this.applyNamedGlassPresentation(object);
      this.applyGltfBlendSortingMitigation(object);
    }
    this.applyEmissiveBlendPresentation(object);
    this.applyGlassAppearanceFromState(object);
    this.applyGlassOrientationFromState(object);
    this._applyAllImportGltfGlassPresentation(object);
    this._applyRenderedImportGltfGlassPresentation(object);
  }

  /** BLEND glass for KHR_materials_transmission imports (no Three.js transmission pass). */
  _applyAllImportGltfGlassPresentation(object) {
    const glass = this._glassPresentationFromState();
    this._forEachImportMaterial(object, (m) => {
      if (this._materialHasImportTransmission(m)) {
        this._assignImportGltfGlassPresentation(object, m, glass);
      }
    });
  }

  /** Live mesh materials — re-apply transmission fallback on what is actually drawn. */
  _applyRenderedImportGltfGlassPresentation(object) {
    if (!object || this._shaderLabBypassesGlassPresentation()) return;
    const glass = this._glassPresentationFromState();
    object.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const stored = this.originalMaterials.get(child);
      const liveMats = Array.isArray(child.material) ? child.material : [child.material];
      const importMats = stored
        ? Array.isArray(stored)
          ? stored
          : [stored]
        : liveMats;
      for (let i = 0; i < liveMats.length; i += 1) {
        const live = liveMats[i];
        const imp = importMats[i] ?? importMats[0];
        if (!live?.isMeshStandardMaterial && !live?.isMeshPhysicalMaterial) continue;
        if (
          this._materialHadImportTransmission(imp) ||
          this._materialHadImportTransmission(live) ||
          this._materialHasImportTransmission(live)
        ) {
          this._assignImportGltfGlassPresentation(object, live, glass);
        }
      }
    });
  }

  /** Keep KHR transmission imports on BLEND fallback (rendered meshes + post-load / per-frame guard). */
  syncImportGltfGlassMaterials(object = this.currentModel, { forcePresentation = false } = {}) {
    if (!object || this._shaderLabBypassesGlassPresentation()) return;
    if (!this.modelHasGltfTransmissionMaterials(object)) return;
    const glass = this._glassPresentationFromState();
    object.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const stored = this.originalMaterials.get(child);
      const liveMats = Array.isArray(child.material) ? child.material : [child.material];
      const importMats = stored
        ? Array.isArray(stored)
          ? stored
          : [stored]
        : liveMats;
      for (let i = 0; i < liveMats.length; i += 1) {
        const live = liveMats[i];
        const imp = importMats[i] ?? importMats[0];
        if (!live?.isMeshStandardMaterial && !live?.isMeshPhysicalMaterial) continue;
        if (
          !this._materialHadImportTransmission(imp) &&
          !this._materialHadImportTransmission(live) &&
          !this._materialHasImportTransmission(live)
        ) {
          continue;
        }
        const drifted =
          forcePresentation ||
          !live.userData?.orbyGltfTransmissionFallback ||
          !!live.map ||
          (live.isMeshPhysicalMaterial &&
            (Number(live.transmission) > 1e-4 || !!live.transmissionMap));
        if (drifted) {
          this._assignImportGltfGlassPresentation(object, live, glass);
        }
      }
    });
  }

  _subsurfaceTranslucency() {
    const t = Number(this.subsurfaceSettings?.translucency);
    return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  }

  /** Transmission path active only when the UI switch is on and translucency > 0. */
  _isSubsurfaceActive() {
    if (!SUBSURFACE_FEATURE_ENABLED) return false;
    return this.subsurfaceSettings?.enabled === true && this._subsurfaceTranslucency() > SUBSURFACE_EPS;
  }

  /**
   * `MeshPhysicalMaterial.copy(source)` assumes Physical-like sources. Plain MeshStandardMaterial
   * lacks several Vector2/Color fields → `.copy(undefined)` throws (e.g. clearcoatNormalScale).
   */
  _patchStandardMaterialForPhysicalCopy(src) {
    if (!src || src.isMeshPhysicalMaterial) return;
    if (!src.normalScale) src.normalScale = new THREE.Vector2(1, 1);
    if (!src.envMapRotation) src.envMapRotation = new THREE.Euler();
    if (!src.clearcoatNormalScale) src.clearcoatNormalScale = new THREE.Vector2(1, 1);
    if (!src.iridescenceThicknessRange) src.iridescenceThicknessRange = [100, 400];
    if (!src.sheenColor) src.sheenColor = new THREE.Color(0x000000);
    if (!src.attenuationColor) src.attenuationColor = new THREE.Color(1, 1, 1);
    if (!src.specularColor) src.specularColor = new THREE.Color(1, 1, 1);
  }

  _upgradeStandardMaterialToPhysical(srcMat) {
    this._patchStandardMaterialForPhysicalCopy(srcMat);
    const phys = new THREE.MeshPhysicalMaterial();
    phys.copy(srcMat);
    srcMat.dispose?.();
    return phys;
  }

  /**
   * Physically-based transmission + attenuation (MeshPhysicalMaterial).
   * Differs from three.js `webgl_materials_subsurface_scattering` (Blinn-Phong + thickness map shader).
   */
  _applySubsurfacePhysicalParams(mat, sliderT) {
    if (!mat?.isMeshPhysicalMaterial) return;
    const raw = Math.min(1, Math.max(0, sliderT));
    const t = Math.min(1, Math.pow(raw, 0.78));
    mat.userData.orbySubsurface = true;
    mat.transmission = t;
    // Thickness in world units — keep bounded so transmission RT isn’t “infinitely thick mud”.
    mat.thickness = THREE.MathUtils.lerp(1.2, 6.5, t);
    const tint = this.subsurfaceSettings?.scatterTint || DEFAULT_SUBSURFACE_SCATTER_TINT;
    mat.attenuationColor.set(tint);
    // IMPORTANT: distance must stay well above ~1 or Beer–Lambert absorption reads as fully opaque
    // at high transmission (previous `6*(1-t)+0.15` hit ~0.15 at t≈1 → “nothing visible”).
    mat.attenuationDistance = THREE.MathUtils.lerp(24.0, 4.5, t);
    mat.ior = 1.5;
    // Wax / skin reads satin — not mirror chrome (avoid spec 1 + ultra-low roughness).
    if ('specularIntensity' in mat) {
      mat.specularIntensity = THREE.MathUtils.lerp(0.62, 0.82, 1 - t);
    }
    mat.transparent = t > SUBSURFACE_EPS;
    const userM = Number(this.materialSettings?.metalness ?? 0);
    mat.metalness = Math.max(0, userM * (1 - 0.92 * t));
    const userR = Number(this.materialSettings?.roughness ?? 0.5);
    // Do not lerp toward ~0.18 roughness — that + boosted env reads as polished metal/glass.
    const waxRoughTarget = Math.max(0.38, Math.min(userR + 0.22 * t, 0.82));
    mat.roughness = THREE.MathUtils.lerp(Math.min(userR, 0.98), waxRoughTarget, t);
    mat.side = THREE.DoubleSide;
    mat.depthWrite = t < 0.985;
    mat.needsUpdate = true;
  }

  setSubsurfaceSettings(settings = {}) {
    const prev = { ...this.subsurfaceSettings };
    this.subsurfaceSettings = {
      enabled:
        settings.enabled !== undefined ? !!settings.enabled : prev.enabled ?? false,
      translucency:
        settings.translucency !== undefined ? settings.translucency : prev.translucency ?? 0,
      scatterTint:
        settings.scatterTint !== undefined
          ? settings.scatterTint
          : prev.scatterTint ?? DEFAULT_SUBSURFACE_SCATTER_TINT,
    };
    const tn = Number(this.subsurfaceSettings.translucency);
    this.subsurfaceSettings.translucency = Number.isFinite(tn)
      ? Math.min(1, Math.max(0, tn))
      : 0;
    if (typeof this.subsurfaceSettings.scatterTint !== 'string') {
      this.subsurfaceSettings.scatterTint = DEFAULT_SUBSURFACE_SCATTER_TINT;
    }
    if (
      this.currentModel &&
      (this.currentShading === 'shaded' || this.currentShading === 'clay')
    ) {
      this.setShading(this.currentShading);
    }
  }

  /**
   * True if the model has Standard/Physical materials on meshes matching glass/window heuristics.
   */
  modelHasHeuristicGlass(object) {
    if (!object) return false;
    let found = false;
    object.traverse((child) => {
      if (found || !child.isMesh) return;
      if (!this.isWindowMesh(child)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m?.isMeshStandardMaterial || m?.isMeshPhysicalMaterial) {
          found = true;
          return;
        }
      }
    });
    return found;
  }

  /**
   * Import-side signals that Advanced → Alpha may apply (baseline + maps + glTF hints).
   * Prefer sources stored in {@link #originalMaterials} after prepareMesh — mesh.material may be clones
   * without complete userData after {@link #setShading}.
   */
  _materialImportLooksAlphaRelevant(m) {
    if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return false;

    const b = m.userData?.orbyGltfImportBaseline;
    if (b) {
      if (b.transparent) return true;
      if (Number.isFinite(b.opacity) && b.opacity < 0.999) return true;
    } else if ('transparent' in m) {
      if (m.transparent) return true;
      const op = Number.isFinite(m.opacity) ? m.opacity : 1;
      if (op < 0.999) return true;
    }

    const gltfMode = m.userData?.alphaMode ?? this._inferGltfAlphaMode(m);
    if (gltfMode === 'BLEND' || gltfMode === 'MASK') return true;

    if (m.alphaMap) return true;
    if (m.alphaTest > 0) return true;

    // Do not treat RGBAFormat baseColor alone as transparency — glTF often uses RGBA PNGs for OPAQUE materials.

    if (m.isMeshPhysicalMaterial && m.transmission > 0.01) return true;

    return false;
  }

  /**
   * Near-opaque BLEND + DoubleSide without cutout maps is a common exporter mistake (opacity 1, no alpha
   * texture). Alpha-hash dithers the whole surface; prefer forcing an opaque draw instead.
   * BLEND + baseColorTexture keeps alpha in the albedo map (Sketchfab ground shadows, decals) — never opaque.
   */
  _materialIsFalseBlendShell(m) {
    if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return false;
    if (!m.transparent) return false;

    const op = Number.isFinite(m.opacity) ? m.opacity : 1;
    if (op < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return false;
    if (m.alphaMap) return false;
    if (m.map?.isTexture) return false;
    if (m.alphaTest > 0) return false;
    // BLEND + emissive (HUD / MFD screens) or transmission glass — author intended real alpha or refraction.
    if (m.userData?.orbyEmissiveBlend || this._materialIsEmissiveDisplay(m)) return false;

    const gltfMode = m.userData?.alphaMode ?? this._inferGltfAlphaMode(m);
    if (gltfMode === 'MASK') return false;
    if (this._materialHasImportTransmission(m)) return false;

    return true;
  }

  /**
   * Alpha-hash only when dither actually helps layered cutouts / near-opaque shells — not “BLEND” flags alone.
   */
  _materialNeedsAlphaHashMitigation(m) {
    if (!this._materialImportLooksAlphaRelevant(m)) return false;
    if (this._materialIsFalseBlendShell(m)) return false;

    if (m.alphaMap) return true;
    if (m.alphaTest > 0) return true;
    if (m.userData?.alphaMode === 'MASK') return true;

    const op = Number.isFinite(m.opacity) ? m.opacity : 1;
    if (op < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return true;

    return false;
  }

  _forceOpaqueBlendMaterial(m) {
    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
    if ('alphaHash' in m) m.alphaHash = false;
    m.userData.orbyBlendMitigation = 'opaque';
    m.needsUpdate = true;
  }

  /**
   * True if any mesh uses materials where transparency / alpha matters (import intent).
   * Uses {@link #originalMaterials} when set so behavior stays correct after shaded-mode clones replace mesh.material.
   */
  modelHasAlphaRelevantMaterials(object) {
    if (!object) return false;
    let found = false;
    object.traverse((child) => {
      if (found || !child.isMesh) return;
      const stored = this.originalMaterials.get(child);
      const mats = stored
        ? Array.isArray(stored)
          ? stored
          : [stored]
        : Array.isArray(child.material)
          ? child.material
          : [child.material];
      for (const m of mats) {
        if (this._materialImportLooksAlphaRelevant(m)) {
          found = true;
          return;
        }
      }
    });
    return found;
  }

  /**
   * Glass / transmission often looks “flipped” (wrong refraction, inside-out) from tangent normal
   * convention or double-sided shells. Optional fixes — transmission & window-tagged meshes only.
   */
  applyGlassOrientationFromState(object) {
    if (!object || !this.stateStore) return;
    const adv = this.stateStore.getState()?.advanced ?? {};
    const flipY = adv.flipGlassNormalMapY === true;
    const frontOnly = adv.glassFrontFacesOnly === true;

    this._forEachImportMeshMaterial(object, (mesh, m) => {
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;
      if (!this._isGlassLikeForOrientation(mesh, m)) return;

      const b = m.userData?.orbyGltfImportBaseline;

      if (m.normalMap && m.normalScale) {
        if (m.userData.orbyGlassImportNormalY === undefined) {
          m.userData.orbyGlassImportNormalY = Number.isFinite(m.normalScale.y)
            ? m.normalScale.y
            : 1;
        }
        const baseY = m.userData.orbyGlassImportNormalY;
        m.normalScale.y = flipY ? -baseY : baseY;
      }

      if (frontOnly) {
        m.side = THREE.FrontSide;
      } else if (b && b.side !== undefined) {
        m.side = b.side;
      }

      m.needsUpdate = true;
    });
  }

  /** Transmission / heuristic glass — not full-mesh BLEND characters (those need Alpha modes instead). */
  _isGlassLikeForOrientation(mesh, m) {
    if (!mesh?.isMesh || !m) return false;
    if (this._materialHadImportTransmission(m)) return true;
    return this.isWindowMesh(mesh);
  }

  /**
   * Apply Advanced glass opacity (transparency mode Auto only). Reflection strength is applied in updateMaterialsEnvironment.
   */
  _applyHeuristicGlassAppearanceToMaterial(m, { glassTintHex, bodyDarken, bodyOpacity }) {
    if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return;
    if (this._materialHasImportTransmission(m)) return;
    m.color.set(glassTintHex);
    m.color.multiplyScalar(bodyDarken);
    m.opacity = bodyOpacity;
    m.transparent = true;
    m.depthWrite = false;
    m.needsUpdate = true;
  }

  /** Live shaded clones — window/glass meshes without KHR transmission. */
  _applyRenderedHeuristicGlassPresentation(object, glass, mode) {
    if (!object || mode !== 'default') return;
    object.traverse((child) => {
      if (!child.isMesh || !this.isWindowMesh(child)) return;
      const liveMats = Array.isArray(child.material) ? child.material : [child.material];
      for (const live of liveMats) {
        this._applyHeuristicGlassAppearanceToMaterial(live, glass);
      }
    });
  }

  applyGlassAppearanceFromState(object) {
    if (!object || !this.stateStore) return;
    if (this._shaderLabBypassesGlassPresentation()) return;
    const adv = this.stateStore.getState()?.advanced;
    const mode = adv?.transparencyFix ?? 'default';
    const rawOp = adv?.glassOpacity;
    const glassOpacity = Number.isFinite(Number(rawOp))
      ? Math.min(1, Math.max(0.02, Number(rawOp)))
      : 0.45;
    const rawBody = adv?.glassBody;
    const glassBody = Number.isFinite(Number(rawBody))
      ? Math.min(1, Math.max(0, Number(rawBody)))
      : 0;
    const rawTint = adv?.glassTint;
    const glassTintHex =
      typeof rawTint === 'string' && /^#[0-9A-Fa-f]{6}$/.test(rawTint.trim())
        ? rawTint.trim()
        : ORBY_BLACK;
    const bodyDarken = Math.max(0.06, 1 - 0.72 * glassBody);
    /** Pull effective coverage toward opaque when body is high (stacks with Glass opacity). */
    const bodyOpacity = Math.min(
      1,
      glassOpacity + glassBody * (1 - glassOpacity) * 0.55,
    );
    const glass = { glassTintHex, bodyDarken, bodyOpacity };

    this._forEachImportMeshMaterial(object, (mesh, m) => {
      if (!this.isWindowMesh(mesh)) return;
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;

      if (mode !== 'default') return;

      // glTF KHR_materials_transmission — BLEND fallback; Glass sliders still apply.
      if (this._materialHasImportTransmission(m)) {
        this._assignImportGltfGlassPresentation(object, m, {
          glassOpacity,
          glassBody,
          glassTintHex,
        });
        return;
      }

      this._applyHeuristicGlassAppearanceToMaterial(m, glass);
    });
    this._applyRenderedHeuristicGlassPresentation(object, glass, mode);
    this._applyRenderedImportGltfGlassPresentation(object);
  }

  /** Re-run pipeline after load / when Advanced setting changes (uses currentModel). */
  reapplyTransparencyPipeline() {
    if (!this.currentModel) return;
    this.applyTransparencyPipeline(this.currentModel);
    const shading = this.currentShading ?? this.stateStore?.getState()?.shading ?? 'shaded';
    if (shading === 'shaded' || shading === 'clay' || shading === 'textures') {
      this.setShading(shading);
    }
  }

  /** Treat full-opacity BLEND glTF as opaque shading (fixes many Sketchfab single-atlas exports). */
  _applyUserForceOpaqueBlend(object) {
    this._forEachImportMaterial(object, (m) => {
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;
      if (this._materialHasImportTransmission(m)) return;
      if (this._materialIsEmissiveDisplay(m)) return;

      const b = m.userData?.orbyGltfImportBaseline;
      const baseOp = b ? b.opacity : (Number.isFinite(m.opacity) ? m.opacity : 1);
      const baseTr = b ? b.transparent : m.transparent;

      if (baseTr && baseOp >= GLTF_FULL_OPACITY_BLEND_THRESHOLD && !m.map?.isTexture) {
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        if ('alphaHash' in m) m.alphaHash = false;
        m.needsUpdate = true;
      }
    });
  }

  _applyUserForceFrontFace(object) {
    this._forEachImportMaterial(object, (m) => {
      if (m.side === undefined) return;
      // Only transparent / transmission draws — not opaque DoubleSide hull plates (would vanish).
      if (!this._materialImportLooksAlphaRelevant(m) && !this._materialHasImportTransmission(m)) {
        return;
      }
      m.side = THREE.FrontSide;
      m.needsUpdate = true;
    });
  }

  /**
   * Sketchfab-style BLEND + DoubleSide on a single mesh cannot be depth-sorted per triangle in WebGL;
   * alpha-hash trades a slight dither for stable layering (visor vs face vs helmet).
   * Controlled by Advanced → “Alpha-hash blend fix” (default on); turn off for softer hair/fur only.
   */
  applyGltfBlendSortingMitigation(object) {
    const enabled =
      this.stateStore?.getState()?.advanced?.blendSortingMitigation !== false;
    if (!enabled) return;

    this._forEachImportMaterial(object, (m) => {
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;
      if (m.userData?.orbySkipBlendMitigation) return;
      if (this._materialHasImportTransmission(m)) return;
      if (!m.transparent) return;

      const op = Number.isFinite(m.opacity) ? m.opacity : 1;
      if (op < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return;

      if (this._materialIsFalseBlendShell(m)) {
        this._forceOpaqueBlendMaterial(m);
        return;
      }

      if (m.side !== THREE.DoubleSide) return;
      if (m.alphaTest > 0) return;

      if (!this._materialNeedsAlphaHashMitigation(m)) return;

      if ('alphaHash' in m && typeof m.alphaHash === 'boolean') {
        m.alphaHash = true;
        m.userData.orbyBlendMitigation = 'alphaHash';
        m.needsUpdate = true;
      }
    });
  }

  /**
   * Promote heuristic “glass” meshes (visor/window/…) from fully opaque PBR to translucent blend.
   * Runs at prepare time so fade-in + shading see correct transparency without needing scene.environment.
   */
  applyNamedGlassPresentation(object) {
    this._forEachImportMeshMaterial(object, (mesh, m) => {
      if (!this.isWindowMesh(mesh)) return;
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;
      if (m.userData?.orbyGlassPresentation) return;

      if (this._materialHasImportTransmission(m)) {
        m.userData.orbyGlassPresentation = true;
        return;
      }

      m.userData.orbyGlassPresentation = true;
      m.metalness = 0.0;
      m.depthWrite = false;
      if (Number.isFinite(m.roughness)) {
        m.roughness = Math.min(m.roughness, 0.14);
      } else {
        m.roughness = 0.1;
      }

      if (!m.transparent) {
        m.transparent = true;
        m.opacity = 0.45;
      } else if (Number.isFinite(m.opacity) && m.opacity > 0.95) {
        m.transparent = true;
        m.opacity = 0.45;
      } else {
        m.transparent = true;
      }

      m.needsUpdate = true;
    });
  }
  
  isWindowMesh(mesh) {
    if (!mesh || !mesh.isMesh) return false;
    
    const name = mesh.name?.toLowerCase() || '';
    const parentName = mesh.parent?.name?.toLowerCase() || '';
    const fullName = `${name} ${parentName}`;
    
    // Exclude non-window parts (lights, engine, etc.)
    const excludeKeywords = ['light', 'engine', 'hood', 'cleaner', 'chrome', 'gumme', 'gomme', 'translucent'];
    const isExcluded = excludeKeywords.some(keyword => fullName.includes(keyword));
    if (isExcluded) return false;
    
    // Only check for actual window/glass keywords (more specific)
    const windowKeywords = [
      'window',
      'glass',
      'windshield',
      'windscreen',
      'visor',
      'glazing',
      'plexi',
      'canopy',
      'sunroof',
      'moonroof',
      'roof_glass',
      'rearscreen',
      'rear_screen',
      'quarterglass',
      'sideglass',
      'doorglass',
      'fenster',
      'vitre',
      'parabrisas',
      'crystal',
      'lens',
      'acrylic',
    ];
    const isWindowByName = windowKeywords.some(
      (keyword) => name.includes(keyword) || parentName.includes(keyword),
    );

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const isWindowByMaterial = materials.some((mat) => {
      const materialName = mat?.name?.toLowerCase() || '';
      return windowKeywords.some((keyword) => materialName.includes(keyword));
    });

    return isWindowByName || isWindowByMaterial;
  }

  /**
   * Import material reads as glass or see-through — excluded from voxel triangle soup.
   * Keeps opaque BLEND shells and MASK cutouts (hair, foliage) in the voxel mesh.
   */
  _materialLooksGlassOrTransparentForVoxel(m) {
    if (!m) return false;
    if (this._materialHasImportTransmission(m)) return true;
    if (this._isEmissiveBlendDisplayImport(m)) return true;

    const materialName = m?.name?.toLowerCase() || '';
    const glassKeywords = [
      'window',
      'glass',
      'windshield',
      'windscreen',
      'visor',
      'glazing',
      'canopy',
      'crystal',
      'lens',
      'acrylic',
    ];
    if (glassKeywords.some((keyword) => materialName.includes(keyword))) return true;

    if (this._materialIsFalseBlendShell(m)) return false;

    const b = m.userData?.orbyGltfImportBaseline;
    const gltfMode = m.userData?.alphaMode ?? this._inferGltfAlphaMode(m);
    const opacity = Number.isFinite(b?.opacity)
      ? b.opacity
      : Number.isFinite(m.opacity)
        ? m.opacity
        : 1;
    const transparent = b?.transparent ?? m.transparent;

    if (gltfMode === 'BLEND') {
      if (opacity < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return true;
      if (transparent && !m.map?.isTexture && !m.alphaMap) return true;
    }

    if (transparent && opacity < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return true;

    return false;
  }

  /** Skip glass / transparent import meshes when building the voxel cube mesh. */
  _shouldSkipMeshForVoxelization(mesh) {
    if (!mesh?.isMesh) return true;
    if (this.isWindowMesh(mesh)) return true;

    const stored = this.originalMaterials.get(mesh);
    if (!stored) return false;

    const mats = Array.isArray(stored) ? stored : [stored];
    let hasMaterial = false;
    for (const m of mats) {
      if (!m) continue;
      hasMaterial = true;
      if (this._materialHasImportTransmission(m)) return true;
      if (!this._materialLooksGlassOrTransparentForVoxel(m)) return false;
    }
    return hasMaterial;
  }

  /**
   * Shader Lab stylized presets (everything except Glass / Chrome / PS2 Crush / Scanline Hologram)
   * force opaque draws and must not run the glTF transmission / window glass restore pipeline on live meshes.
   */
  _shaderLabBypassesGlassPresentation() {
    if (!this.creativeLookSettings?.enabled) return false;
    const preset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);
    if (
      isSketchFamilyCreativeLookPreset(preset)
      && !this._creativeLookSketchMaterialsActive()
    ) {
      return false;
    }
    return preset !== 'glass' && preset !== 'chrome';
  }

  /** Sketch / Sketch Colour — raster size 0 turns the effect off while the preset stays selected. */
  _creativeLookSketchMaterialsActive(settings = this.creativeLookSettings) {
    const preset = normalizeCreativeLookPreset(settings.preset);
    if (!isSketchFamilyCreativeLookPreset(preset)) return true;
    const params = resolveCreativeLookSketchParams(
      settings.presetParams,
      settings.patternScale,
    );
    return params.rasterSize > 0;
  }

  _shouldApplyCreativeLookMaterials(settings = this.creativeLookSettings) {
    if (!settings.enabled) return false;
    return this._creativeLookSketchMaterialsActive(settings);
  }

  _restoreCreativeLookBaseMaterials() {
    this._appliedCreativeLookPreset = null;
    this._restorePs2CrushGeometry();
    this._restoreVoxelGeometry();
    this._restoreWirePulseGeometry();
    this._restoreScanlineGeometry();
    this._restoreDustFieldGeometry();
    this.setShading(this.currentShading);
    this._restoreMeshShadowDefaults();
  }

  /** @returns {THREE.Points | null} */
  _getDustFieldPoints() {
    return this.currentModel?.userData?.orbyDustFieldPoints ?? null;
  }

  /**
   * Resolve albedo for Shader Lab when import snapshots lost maps (transmission BLEND fallback)
   * or kept a black diffuse factor over a textured surface.
   * @param {THREE.Mesh} mesh
   * @param {THREE.Material} origMat
   * @param {THREE.Material[]} liveMats
   * @param {number} [matIndex]
   */
  _resolveCreativeLookDiffuseSources(mesh, origMat, liveMats, matIndex = 0) {
    const liveMat = liveMats[matIndex] ?? liveMats[0];
    let diffuseMap =
      origMat?.map?.isTexture && isTextureImageReady(origMat.map) ? origMat.map : null;
    if (!diffuseMap && liveMat?.map?.isTexture && isTextureImageReady(liveMat.map)) {
      diffuseMap = liveMat.map;
    }

    let diffuseTint =
      origMat?.color?.clone?.() ??
      origMat?.userData?.orbyGltfImportBaseline?.color?.clone?.() ??
      null;
    if (!diffuseTint?.isColor && liveMat?.color?.isColor) {
      diffuseTint = liveMat.color.clone();
    }
    if (
      diffuseTint?.isColor &&
      this._isNearBlackDiffuseColor(diffuseTint)
    ) {
      diffuseTint.setRGB(1, 1, 1);
    }
    if (!diffuseTint?.isColor && mesh?.userData?.orbySvgBaseColorLinear) {
      const linear = mesh.userData.orbySvgBaseColorLinear;
      if (Number.isFinite(linear.r) && Number.isFinite(linear.g) && Number.isFinite(linear.b)) {
        diffuseTint = new THREE.Color(linear.r, linear.g, linear.b);
      }
    }
    if (!diffuseTint?.isColor && mesh?.userData?.orbySvgBaseColor) {
      diffuseTint = new THREE.Color(mesh.userData.orbySvgBaseColor);
    }
    return { diffuseMap, diffuseTint };
  }

  /**
   * Build a fresh `MeshStandardMaterial` from a `MeshBasicMaterial` (typically an import
   * tagged `KHR_materials_unlit` — Sketchfab `materialmerger.gles` bakes are the common
   * source) so Shaded-mode sliders (Brightness, Metalness, Roughness, Emissive) have a
   * surface to write to. The diffuse map and base color carry over; lighting now affects
   * the result instead of being baked-in only. Subsurface translucency, when active, is
   * applied by upgrading to `MeshPhysicalMaterial` at the end.
   *
   * Called from {@link setShading}'s `createShadedMaterial` factory for non-glass meshes.
   *
   * @param {THREE.MeshBasicMaterial} basicMat — the imported unlit material
   * @param {boolean} modelHasEmissive — propagated from {@link _modelHasAnyEmissiveBaseline}
   * @returns {THREE.MeshStandardMaterial|THREE.MeshPhysicalMaterial}
   */
  _promoteBasicToStandardForShaded(basicMat, modelHasEmissive) {
    const baseColor = basicMat.color
      ? basicMat.color.clone()
      : new THREE.Color('#ffffff');
    const adjustedColor = this._diffuseColorWithBrightness(
      baseColor,
      undefined,
      undefined,
      basicMat,
    );
    const standard = new THREE.MeshStandardMaterial({
      color: adjustedColor,
      map: basicMat.map ?? null,
      transparent: !!basicMat.transparent,
      opacity: typeof basicMat.opacity === 'number' ? basicMat.opacity : 1,
      alphaTest: typeof basicMat.alphaTest === 'number' ? basicMat.alphaTest : 0,
      side: basicMat.side ?? THREE.FrontSide,
      vertexColors: !!basicMat.vertexColors,
      metalness: this.materialSettings.metalness,
      roughness: this.materialSettings.roughness,
    });
    if (basicMat.name) standard.name = basicMat.name;
    if (basicMat.aoMap) {
      standard.aoMap = basicMat.aoMap;
      if (Number.isFinite(basicMat.aoMapIntensity)) {
        standard.aoMapIntensity = basicMat.aoMapIntensity;
      }
    }
    if (basicMat.lightMap) {
      standard.lightMap = basicMat.lightMap;
      if (Number.isFinite(basicMat.lightMapIntensity)) {
        standard.lightMapIntensity = basicMat.lightMapIntensity;
      }
    }
    this._applyUserEmissiveOrRestoreImport(
      standard,
      basicMat,
      adjustedColor,
      this.materialSettings.emissive || 0.0,
      modelHasEmissive,
    );
    standard.wireframe = false;
    standard.needsUpdate = true;

    const tSub = this._isSubsurfaceActive() ? this._subsurfaceTranslucency() : 0;
    if (tSub > SUBSURFACE_EPS) {
      const physical = this._upgradeStandardMaterialToPhysical(standard);
      delete physical.userData.orbySubsurface;
      this._applySubsurfacePhysicalParams(physical, tSub);
      return physical;
    }
    return standard;
  }

  setShading(mode) {
    if (!this.currentModel) return;
    this.mapInspectPreview?.clear();
    this.currentShading = mode;
    const modelHasEmissive = this._modelHasAnyEmissiveBaseline();
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      
      const isGlass = this.isWindowMesh(child);
      // Window meshes keep import glass until Shader Lab replaces them (opaque stylized presets).
      if (isGlass && this._shaderLabBypassesGlassPresentation()) return;
      
      const original = this.originalMaterials.get(child);
      if (!original) return;

      const disposeIfTransient = () => {
        const material = child.material;
        const sameReference =
          material === original ||
          (Array.isArray(material) &&
            Array.isArray(original) &&
            material.length === original.length &&
            material.every((mat, idx) => mat === original[idx]));
        if (sameReference) return;
        if (Array.isArray(material)) {
          material.forEach((mat) => mat?.dispose?.());
        } else {
          material?.dispose?.();
        }
      };

      const applyMaterial = (material) => {
        disposeIfTransient();
        child.material = material;
      };

      const buildArray = (factory) => {
        if (Array.isArray(original)) {
          return original.map((mat) => factory(mat));
        }
        return factory(original);
      };

      if (mode === 'wireframe') {
        const resolveWireframeMaterial = (mat) => {
          if (this._isEmissiveBlendDisplayImport(mat)) {
            const built = this._buildEmissiveDisplayMaterial(
              mat,
              this.materialSettings.emissive || 0.0,
            );
            if (built) return built;
          }
          return mat;
        };
        applyMaterial(buildArray(resolveWireframeMaterial));
      } else if (mode === 'clay') {
        const { color } = this.claySettings;
        // Use material settings for roughness and metalness (unified controls)
        const createClay = (originalMat) => {
          const clayColor = this.getClayColorWithBrightness();
          const tSub =
            this._isSubsurfaceActive() ? this._subsurfaceTranslucency() : 0;
          const clay =
            tSub > SUBSURFACE_EPS
              ? new THREE.MeshPhysicalMaterial({
                  color: clayColor,
                  roughness: this.materialSettings.roughness,
                  metalness: this.materialSettings.metalness,
                  side: THREE.DoubleSide,
                })
              : new THREE.MeshStandardMaterial({
                  color: clayColor,
                  roughness: this.materialSettings.roughness,
                  metalness: this.materialSettings.metalness,
                  side: THREE.DoubleSide,
                });
          // Preserve normal map from original material only if enabled
          const normalMapEnabled =
            this.stateStore.getState().clay?.normalMap !== false;
          if (normalMapEnabled && originalMat?.normalMap) {
            clay.normalMap = originalMat.normalMap;
            clay.normalMapType =
              originalMat.normalMapType ?? THREE.TangentSpaceNormalMap;
            if (originalMat.normalScale) {
              clay.normalScale = originalMat.normalScale.clone();
            }
          }
          if (tSub > SUBSURFACE_EPS && clay.isMeshPhysicalMaterial) {
            this._applySubsurfacePhysicalParams(clay, tSub);
          }
          return clay;
        };
        applyMaterial(buildArray(createClay));
      } else if (mode === 'textures') {
        const createTextureMaterial = (mat) => {
          if (this._isEmissiveBlendDisplayImport(mat)) {
            const built = this._buildEmissiveDisplayMaterial(
              mat,
              this.materialSettings.emissive || 0.0,
            );
            if (built) {
              built.wireframe = false;
              return built;
            }
          }
          const brightColor = this._diffuseColorWithBrightness(
            this._importDiffuseTintForShading(mat),
            undefined,
            undefined,
            mat,
          );

          // Use MeshBasicMaterial for truly unlit rendering - ignores all lighting
          // Note: MeshBasicMaterial only supports map (diffuse), not normalMap, aoMap, etc.
          const basic = new THREE.MeshBasicMaterial({
            map: mat?.map ?? null,
            color: brightColor,
            transparent: mat?.transparent ?? false,
            opacity: mat?.opacity ?? 1,
            side: mat?.side ?? THREE.FrontSide,
          });
          
          // If original material had emissive, add it to the color for MeshBasicMaterial
          // (since MeshBasicMaterial doesn't have separate emissive, we blend it into color)
          if (mat?.emissive && mat.emissiveIntensity) {
            const emissiveContribution = mat.emissive.clone().multiplyScalar(mat.emissiveIntensity);
            basic.color.add(emissiveContribution);
          }
          
          basic.wireframe = false;
          return basic;
        };
        applyMaterial(buildArray(createTextureMaterial));
      } else {
        // Restore original materials when switching away from wireframe/clay/textures
        // But apply diffuse brightness to them
        const createShadedMaterial = (mat, isGlass = false) => {
          if (!mat) return mat;
          // glTF `KHR_materials_unlit` imports as `MeshBasicMaterial`, which has no
          // metalness/roughness/emissive surface and therefore silently ignores every
          // Shaded-mode slider. Promote it here so Brightness, Metalness, Roughness, and
          // Emissive behave the same as on a regular PBR import. Subsurface upgrade to
          // Physical (if active) happens further down in the existing flow.
          if (!isGlass && mat.isMeshBasicMaterial) {
            return this._promoteBasicToStandardForShaded(mat, modelHasEmissive);
          }
          if (this._isEmissiveBlendDisplayImport(mat)) {
            const display = this._buildEmissiveDisplayMaterial(
              mat,
              this.materialSettings.emissive || 0.0,
            );
            if (display) {
              display.wireframe = false;
              return display;
            }
          }
          let cloned = mat.clone ? mat.clone() : mat;
          this._syncTransparentFlagsFromImport(cloned, mat);
          if (mat?.userData?.orbyFbxSlotMaps) {
            cloned = this._finalizeFbxSlotShadedClone(cloned, mat);
          }
          // Don't apply brightness/metalness/roughness to glass materials
          if (isGlass) {
            if (this._materialHasImportTransmission(cloned)) {
              cloned = this._applyImportGltfGlassPresentation(
                cloned,
                this._glassPresentationFromState(),
              );
            }
            if (cloned) {
              cloned.wireframe = false;
            }
            return cloned;
          }
          // Apply material brightness multiplier to color (which multiplies the texture map)
          // The material's color property multiplies the texture map, so this brightens the diffuse map
          if (
            cloned &&
            (cloned.isMeshStandardMaterial ||
              cloned.isMeshPhysicalMaterial ||
              cloned.isMeshPhongMaterial ||
              cloned.isMeshLambertMaterial)
          ) {
            const fbxSlotMaps = !!mat?.userData?.orbyFbxSlotMaps;
            const adjustedColor = fbxSlotMaps
              ? cloned.color.clone()
              : this._diffuseColorWithBrightness(
                  this._importDiffuseTintForShading(mat),
                  undefined,
                  undefined,
                  mat,
                );
            if (!fbxSlotMaps) {
              cloned.color.copy(adjustedColor);
              this._applyShadedMetalRoughness(cloned, mat);
            }
            this._applyUserEmissiveOrRestoreImport(
              cloned,
              mat,
              adjustedColor,
              this.materialSettings.emissive || 0.0,
              modelHasEmissive,
            );
            const normalMapEnabled =
              this.stateStore.getState().clay?.normalMap !== false;
            if (!normalMapEnabled) {
              if ('normalMap' in cloned) {
                cloned.normalMap = null;
              }
              if ('normalMapType' in cloned) {
                cloned.normalMapType = THREE.TangentSpaceNormalMap;
              }
            }
            cloned.needsUpdate = true;
          }
          const tSub =
            !isGlass && this._isSubsurfaceActive()
              ? this._subsurfaceTranslucency()
              : 0;
          if (!isGlass && tSub > SUBSURFACE_EPS && cloned) {
            if (cloned.isMeshStandardMaterial && !cloned.isMeshPhysicalMaterial) {
              cloned = this._upgradeStandardMaterialToPhysical(cloned);
            }
            if (cloned.isMeshPhysicalMaterial) {
              delete cloned.userData.orbySubsurface;
              this._applySubsurfacePhysicalParams(cloned, tSub);
            }
          }
          if (cloned) {
            cloned.wireframe = false;
          }
          return cloned;
        };
        
        // Check if this is a glass mesh (before we potentially replace the material)
        const isGlass = this.isWindowMesh(child);
        
        if (Array.isArray(original)) {
          const materials = original.map((mat) => createShadedMaterial(mat, isGlass));
          disposeIfTransient();
          child.material = materials;
        } else {
          const material = createShadedMaterial(original, isGlass);
          disposeIfTransient();
          child.material = material;
        }
      }
    });

    this.unlitMode = mode === 'textures';
    this.updateWireframeOverlay();
    this.uvCheckerOverlay.rebuild();
    this.normalViewOverlay.rebuild();
    this.applyFresnelToModel(this.currentModel);
    this.reapplySvgExtrudeSurfaceShaders();
    if (!this._shaderLabBypassesGlassPresentation()) {
      this._applyRenderedImportGltfGlassPresentation(this.currentModel);
    }
    this._applyCreativeLookOverride();

    // After recreating shaded materials, either apply user emissive glow or re-sync file emissive
    // (microtask so hooks like Fresnel/SVG run first; import textures may also finish binding).
    if (mode === 'shaded') {
      if (this.materialSettings?.emissive > 0) {
        this.updateMaterials();
      } else {
        queueMicrotask(() => this.resyncEmissiveFromImportedMaterials());
      }
    } else if (this.materialSettings?.emissive > 0 && mode !== 'wireframe' && mode !== 'textures') {
      this.updateMaterials();
    }

    if (this.onShadingChanged) {
      this.onShadingChanged(mode);
    }
    if (this.onMaterialUpdate) {
      this.onMaterialUpdate();
    }
  }

  /** @param {THREE.Material | null | undefined} m */
  _isImportBaselineMaterial(m) {
    return (
      !!m &&
      !m.userData?.orbyCreativeLook &&
      (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshBasicMaterial)
    );
  }

  /** Rebuild a shaded import material when snapshots were lost or polluted by Shader Lab. */
  _synthesizeExtrudeImportMaterial(mesh) {
    const linear = mesh.userData?.orbySvgBaseColorLinear;
    const hex = mesh.userData?.orbySvgBaseColor;
    let color;
    if (linear && Number.isFinite(linear.r)) {
      color = new THREE.Color(linear.r, linear.g, linear.b);
    } else if (hex) {
      color = new THREE.Color(hex);
    } else {
      color = new THREE.Color('#ffffff');
    }
    return new THREE.MeshStandardMaterial({
      color: this._diffuseColorWithBrightness(color),
      metalness: this.materialSettings.metalness ?? DEFAULT_MATERIAL_METALNESS,
      roughness: this.materialSettings.roughness ?? DEFAULT_MATERIAL_ROUGHNESS,
      side: THREE.FrontSide,
    });
  }

  /**
   * Resolve the import baseline for an extrude mesh — never a Shader Lab material.
   * @param {THREE.Mesh} mesh
   */
  _resolveExtrudeImportMaterialForMesh(mesh) {
    const stored = this.originalMaterials.get(mesh);
    if (stored) {
      const items = Array.isArray(stored) ? stored : [stored];
      if (items.every((m) => this._isImportBaselineMaterial(m))) return stored;
    }
    const live = mesh.material;
    const liveItems = Array.isArray(live) ? live : live ? [live] : [];
    if (liveItems.length > 0 && liveItems.every((m) => this._isImportBaselineMaterial(m))) {
      return live;
    }
    if (mesh.userData?.orbySvgExtrude || mesh.userData?.orbyFontExtrude) {
      return this._synthesizeExtrudeImportMaterial(mesh);
    }
    return this._isImportBaselineMaterial(stored) ? stored : null;
  }

  /** Dispose active Shader Lab materials and restore import baselines on every mesh. */
  _stripCreativeLookMaterialsBeforeApply() {
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (!child.isMesh || child.userData.isWireframeOverlay) return;

      if (child.userData?.orbySvgExtrude || child.userData?.orbyFontExtrude) {
        const importMat = this._resolveExtrudeImportMaterialForMesh(child);
        if (importMat) this.originalMaterials.set(child, importMat);
      }

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      if (!mats.some((m) => m?.userData?.orbyCreativeLook)) return;

      for (const m of mats) {
        if (m?.userData?.orbyCreativeLook) m.dispose?.();
      }

      const importOriginal = this.originalMaterials.get(child);
      if (importOriginal) {
        child.material = importOriginal;
      }
    });
  }

  /** Register import materials for SVG / font extrude meshes (glyph rebuilds add new mesh nodes). */
  _ensureExtrudeImportMaterialSnapshots(object) {
    if (!object) return;
    object.traverse((child) => {
      if (!child.isMesh || child.userData.isWireframeOverlay) return;
      if (!child.userData?.orbySvgExtrude && !child.userData?.orbyFontExtrude) return;
      const resolved = this._resolveExtrudeImportMaterialForMesh(child);
      if (resolved) this.originalMaterials.set(child, resolved);
    });
  }

  _disposeTransientMeshMaterials(mesh) {
    const original = this.originalMaterials.get(mesh);
    const material = mesh.material;
    if (!material) return;
    const sameReference =
      material === original ||
      (Array.isArray(material) &&
        Array.isArray(original) &&
        material.length === original.length &&
        material.every((mat, idx) => mat === original[idx]));
    if (sameReference) return;
    if (Array.isArray(material)) {
      material.forEach((mat) => mat?.dispose?.());
    } else {
      material?.dispose?.();
    }
  }

  _syncRetroConsoleGeometryForPreset(preset, patternScale) {
    if (!creativeLookUsesDustFieldGeometry(preset)) {
      this._restoreDustFieldGeometry();
    }

    if (creativeLookUsesVoxelGeometry(preset)) {
      this._restorePs2CrushGeometry();
      this._restoreWirePulseGeometry();
      this._restoreScanlineGeometry();
      this._applyVoxelGeometry(preset);
    } else if (creativeLookUsesRetroDecimation(preset)) {
      this._restoreVoxelGeometry();
      this._applyRetroConsoleGeometry(preset, patternScale);
      this._restoreWirePulseGeometry();
      this._restoreScanlineGeometry();
    } else if (creativeLookUsesWirePulseGeometry(preset)) {
      this._restorePs2CrushGeometry();
      this._restoreVoxelGeometry();
      this._restoreScanlineGeometry();
      this._applyWirePulseGeometry();
    } else if (creativeLookUsesDustFieldGeometry(preset)) {
      this._restorePs2CrushGeometry();
      this._restoreVoxelGeometry();
      this._restoreWirePulseGeometry();
      this._restoreScanlineGeometry();
      this._applyDustFieldGeometry();
    } else {
      this._restorePs2CrushGeometry();
      this._restoreVoxelGeometry();
      this._restoreWirePulseGeometry();
      this._restoreScanlineGeometry();
    }
  }

  _applyCreativeLookOverride() {
    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    if (!this._shouldApplyCreativeLookMaterials()) return;

    const preset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);
    const patternScale = normalizeCreativeLookPatternScale(
      preset,
      this.creativeLookSettings.patternScale,
    );
    if (
      creativeLookPresetNeedsHdriBackdrop(preset) &&
      typeof this.onNeedsTransmissionBackdrop === 'function'
    ) {
      this.onNeedsTransmissionBackdrop();
    }
    const sketchParams = isSketchFamilyCreativeLookPreset(preset)
      ? this._resolveSketchParams()
      : null;

    // Always sync geometry when Shader Lab is on — PS2/PSX/VGA decimation strips normals and
    // breaks other presets if we bail out early for textures/wireframe shading.
    this._syncRetroConsoleGeometryForPreset(
      preset,
      sketchParams?.strokeWidth ?? patternScale,
    );

    if (isDustFieldCreativeLookPreset(preset)) {
      this._applyDustFieldMaterial(preset, patternScale);
      this._appliedCreativeLookPreset = preset;
      if (this.onMaterialUpdate) {
        this.onMaterialUpdate();
      }
      if (typeof this.afterCreativeLookMaterialRebuild === 'function') {
        this.afterCreativeLookMaterialRebuild();
      }
      return;
    }

    // Shader Lab replaces mesh materials even in textures/wireframe display modes so imports
    // with missing maps (common FBX drops) still render as stylized geometry.

    // Insta-kill any active Shader Lab materials before rebuilding (font extrude = many glyphs).
    this._stripCreativeLookMaterialsBeforeApply();
    this._ensureExtrudeImportMaterialSnapshots(this.currentModel);

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (child.userData.isWireframeOverlay) return;

      const importOriginal = this.originalMaterials.get(child);
      if (!importOriginal) return;

      const liveMats = Array.isArray(child.material)
        ? child.material
        : [child.material];

      this._disposeTransientMeshMaterials(child);

      const mk = (origMat, matIndex = 0) => {
        const rawOp = origMat?.opacity;
        const opacity = Number.isFinite(Number(rawOp))
          ? Math.min(1, Math.max(0, Number(rawOp)))
          : 1;
        // Most stylized presets force opaque draws so GLTF “almost opaque” blend shells do not
        // vanish in the transparent pass. PS2 Crush / PSX / Scanline Hologram / Glass / Chrome keep
        // real alpha for vehicle glass and showcase materials.
        const allowTransparency = creativeLookAllowsTransparency(preset);
        const alphaRelevant =
          opacity < GLTF_FULL_OPACITY_BLEND_THRESHOLD ||
          !!origMat?.transparent ||
          !!origMat?.alphaMap ||
          (origMat?.alphaTest > 0) ||
          origMat?.userData?.alphaMode === 'BLEND' ||
          origMat?.userData?.alphaMode === 'MASK' ||
          !!origMat?.userData?.orbyGltfImportBaseline?.transparent;
        const falseBlendShell =
          (origMat?.isMeshStandardMaterial || origMat?.isMeshPhysicalMaterial) &&
          this._materialIsFalseBlendShell(origMat);
        const useTransparentSort =
          creativeLookForceTransparentDraw(preset) ||
          (allowTransparency && alphaRelevant && !falseBlendShell);
        const drawOpacity = useTransparentSort ? opacity : 1;
        const state = this.stateStore?.getState();
        const hdriBlur = Number(state?.hdriBlurriness ?? 0);
        const geom = child.geometry;
        const voxelLook = isVoxelCreativeLookPreset(preset);
        const skinning = !voxelLook && (
          child.isSkinnedMesh ||
          !!geom?.attributes?.skinIndex ||
          !!geom?.attributes?.skinWeight
        );
        const morphTargets = !voxelLook && !!child.morphTargetInfluences?.length;
        const { diffuseMap, diffuseTint } = this._resolveCreativeLookDiffuseSources(
          child,
          origMat,
          liveMats,
          matIndex,
        );
        return createCreativeLookMaterial(preset, {
          transparent: useTransparentSort,
          opacity: drawOpacity,
          side: origMat?.side ?? THREE.FrontSide,
          time: this._creativeLookTime,
          patternScale,
          sketchStrokeWidth: sketchParams?.strokeWidth,
          hdriBlurriness: Number.isFinite(hdriBlur)
            ? THREE.MathUtils.clamp(hdriBlur, 0, 1)
            : 0,
          diffuseTint: diffuseTint ?? undefined,
          diffuseMap,
          masterHue: this.creativeLookSettings.masterHue,
          intensity: this.creativeLookSettings.intensity,
          liftCrush: this.creativeLookSettings.liftCrush,
          materialBrightness:
            this.materialSettings.brightness ?? DEFAULT_MATERIAL_BRIGHTNESS,
          materialMetalness: this.materialSettings.metalness ?? DEFAULT_MATERIAL_METALNESS,
          materialRoughness: this.materialSettings.roughness ?? DEFAULT_MATERIAL_ROUGHNESS,
          skinning,
          morphTargets,
          surfaceState: resolveOrbySurfaceUniformState(
            this.stateStore?.getState()?.svgExtrude?.surfacePreset ?? 'none',
            this.stateStore?.getState()?.svgExtrude?.surfaceScale ?? 1,
            this.stateStore?.getState()?.svgExtrude?.surfaceStrength ?? 1,
            computeExtrudeSurfaceMappingBounds(child),
          ),
        });
      };

      if (Array.isArray(importOriginal)) {
        child.material = importOriginal.map((om, idx) => mk(om, idx));
      } else {
        child.material = mk(importOriginal, 0);
      }
      if (preset === 'glass') {
        const blur = Number(this.stateStore?.getState()?.hdriBlurriness ?? 0);
        const hdriBlurVal = Number.isFinite(blur) ? blur : 0;
        const patchGlassThickness = (m) => {
          if (m?.userData?.orbyCreativeLook !== 'glass' || !m.isMeshPhysicalMaterial) return;
          const { thickness, roughness } = creativeGlassParamsForMesh(
            patternScale,
            hdriBlurVal,
            child,
          );
          m.thickness = thickness;
          m.roughness = roughness;
        };
        if (Array.isArray(child.material)) {
          child.material.forEach(patchGlassThickness);
        } else {
          patchGlassThickness(child.material);
        }
      }
      // Shader Lab uses dedicated depth materials for shadow-map casting; receiveShadow uses
      // custom shadow-map chunks in the creative look shaders (see CreativeLookMaterials).
      child.castShadow = true;
      child.receiveShadow = creativeLookPresetUsesShadowReceive(preset);
    });

    this._syncCreativeLookShadowTint();
    if (preset === 'glass') {
      this._stabilizeFontExtrudeGlassPresentation();
    }
    this._appliedCreativeLookPreset = preset;

    if (this.onMaterialUpdate) {
      this.onMaterialUpdate();
    }
    if (typeof this.afterCreativeLookMaterialRebuild === 'function') {
      this.afterCreativeLookMaterialRebuild();
    }
    requestAnimationFrame(() => {
      if (this.currentModel) this.reapplyCreativeLookSurfaceShaders();
    });
  }

  /** Push current shadow-tint settings onto Shader Lab materials. */
  _syncCreativeLookShadowTint() {
    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    const opts = {
      color: this.shadowTintColor,
      strength: this.shadowTintStrength,
      opacity: this.shadowTintOpacity,
    };
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m?.userData?.orbyCreativeLook) continue;
        syncCreativeLookShadowTint(m, opts);
      }
    });
  }

  /** Restore default shadow flags after creative look (matches prepareMesh). */
  _restoreMeshShadowDefaults() {
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }

  /**
   * Hole-safe edge-collapse decimation for PS2 / PSX / VGA/DOS 3D — only merges verts connected by an edge.
   * Skips skinned meshes. Restored on preset off / switch.
   * @param {string} preset
   * @param {number} patternScale
   */
  _applyRetroConsoleGeometry(preset, patternScale) {
    if (!this.currentModel) return;
    const id = normalizeCreativeLookPreset(preset);
    if (id === 'watercolour') {
      this._applyArtisticDecimationGeometry(patternScale, creativeWatercolourMergeFactor);
      return;
    }
    if (id === 'gouache') {
      this._applyArtisticDecimationGeometry(patternScale, creativeGouacheMergeFactor);
      return;
    }
    if (id === 'sketch' || id === 'sketch-colour') {
      this._applySketchGeometry(patternScale);
      return;
    }

    const mergeFactor =
      id === 'psx'
        ? creativePsxMergeFactor(patternScale)
        : id === 'vga-dos-3d'
          ? creativeVgaDos3dMergeFactor(patternScale)
          : creativePs2CrushMergeFactor(patternScale);

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (this.isWindowMesh(child)) return;
      if (!this.originalMaterials.get(child)) return;
      const geom = child.geometry;
      if (!geom?.attributes?.position) return;

      if (!child.userData.orbyPs2OriginalGeometry) {
        child.userData.orbyPs2OriginalGeometry = geom;
      }

      const source = child.userData.orbyPs2OriginalGeometry;
      const current = child.geometry;
      if (current !== source && child.userData.orbyPs2CrushedGeometry) {
        current.dispose?.();
      }

      if (
        child.isSkinnedMesh ||
        source.attributes.skinIndex ||
        source.attributes.skinWeight
      ) {
        child.geometry = source;
        child.userData.orbyPs2CrushedGeometry = true;
        return;
      }

      let working = source.clone();
      try {
        if (!working.index) {
          const merged = mergeVertices(working);
          if (merged !== working) {
            working.dispose?.();
            working = merged;
          }
        }

        if (!working.index || working.attributes.position.count < 9) {
          child.geometry = working;
          child.userData.orbyPs2CrushedGeometry = true;
          return;
        }

        let meanEdge = estimatePs2CrushMeanEdgeLength(working);
        if (!Number.isFinite(meanEdge) || meanEdge <= 1e-8) {
          working.computeBoundingBox();
          const size = new THREE.Vector3();
          working.boundingBox.getSize(size);
          meanEdge = Math.max(size.x, size.y, size.z, 1e-6) / 48;
        }

        const maxEdge = meanEdge * mergeFactor;
        let decimated = decimatePs2CrushGeometry(working, maxEdge);
        if (decimated !== working) {
          working.dispose?.();
          working = decimated;
        }

        working.deleteAttribute('normal');
        working.deleteAttribute('tangent');

        let flat = working.index ? working.toNonIndexed() : working;
        if (flat !== working) {
          working.dispose?.();
        }
        flat.computeBoundingSphere();

        child.geometry = flat;
        child.userData.orbyPs2CrushedGeometry = true;
      } catch (_) {
        working.dispose?.();
        child.geometry = source;
        child.userData.orbyPs2CrushedGeometry = true;
      }
    });
  }

  /**
   * Artistic decimation — edge-collapse along real mesh edges, keeps indexed topology + normals.
   * @param {number} patternScale
   * @param {(scale: number) => number} mergeFactorFn
   */
  _applyArtisticDecimationGeometry(patternScale, mergeFactorFn) {
    if (!this.currentModel) return;
    const mergeFactor = mergeFactorFn(patternScale);

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (this.isWindowMesh(child)) return;
      if (!this.originalMaterials.get(child)) return;
      const geom = child.geometry;
      if (!geom?.attributes?.position) return;

      if (!child.userData.orbyPs2OriginalGeometry) {
        child.userData.orbyPs2OriginalGeometry = geom;
      }

      const source = child.userData.orbyPs2OriginalGeometry;
      const current = child.geometry;
      if (current !== source && child.userData.orbyPs2CrushedGeometry) {
        current.dispose?.();
      }

      if (
        child.isSkinnedMesh ||
        source.attributes.skinIndex ||
        source.attributes.skinWeight
      ) {
        child.geometry = source;
        child.userData.orbyPs2CrushedGeometry = true;
        return;
      }

      let working = source.clone();
      try {
        if (!working.index) {
          const merged = mergeVertices(working);
          if (merged !== working) {
            working.dispose?.();
            working = merged;
          }
        }

        if (!working.index || working.attributes.position.count < 9) {
          if (!working.attributes.normal) {
            working.computeVertexNormals();
          }
          child.geometry = working;
          child.userData.orbyPs2CrushedGeometry = true;
          return;
        }

        let meanEdge = estimatePs2CrushMeanEdgeLength(working);
        if (!Number.isFinite(meanEdge) || meanEdge <= 1e-8) {
          working.computeBoundingBox();
          const size = new THREE.Vector3();
          working.boundingBox.getSize(size);
          meanEdge = Math.max(size.x, size.y, size.z, 1e-6) / 48;
        }

        const maxEdge = meanEdge * mergeFactor;
        let decimated = decimatePs2CrushGeometry(working, maxEdge);
        if (decimated !== working) {
          working.dispose?.();
          working = decimated;
        }

        working.computeVertexNormals();
        working.computeBoundingSphere();

        child.geometry = working;
        child.userData.orbyPs2CrushedGeometry = true;
      } catch (_) {
        working.dispose?.();
        child.geometry = source;
        child.userData.orbyPs2CrushedGeometry = true;
      }
    });
  }

  /**
   * Sketch decimation — edge-collapse along real mesh edges, keeps indexed topology + normals.
   * @param {number} patternScale
   */
  _applySketchGeometry(patternScale) {
    if (!this.currentModel) return;
    const mergeFactor = creativeSketchMergeFactor(patternScale);

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (this.isWindowMesh(child)) return;
      if (!this.originalMaterials.get(child)) return;
      const geom = child.geometry;
      if (!geom?.attributes?.position) return;

      if (!child.userData.orbyPs2OriginalGeometry) {
        child.userData.orbyPs2OriginalGeometry = geom;
      }

      const source = child.userData.orbyPs2OriginalGeometry;
      const current = child.geometry;
      if (current !== source && child.userData.orbyPs2CrushedGeometry) {
        current.dispose?.();
      }

      if (
        child.isSkinnedMesh ||
        source.attributes.skinIndex ||
        source.attributes.skinWeight
      ) {
        child.geometry = source;
        child.userData.orbyPs2CrushedGeometry = true;
        return;
      }

      let working = source.clone();
      try {
        if (!working.index) {
          const merged = mergeVertices(working);
          if (merged !== working) {
            working.dispose?.();
            working = merged;
          }
        }

        if (!working.index || working.attributes.position.count < 9) {
          if (!working.attributes.normal) {
            working.computeVertexNormals();
          }
          child.geometry = working;
          child.userData.orbyPs2CrushedGeometry = true;
          return;
        }

        let meanEdge = estimatePs2CrushMeanEdgeLength(working);
        if (!Number.isFinite(meanEdge) || meanEdge <= 1e-8) {
          working.computeBoundingBox();
          const size = new THREE.Vector3();
          working.boundingBox.getSize(size);
          meanEdge = Math.max(size.x, size.y, size.z, 1e-6) / 48;
        }

        const maxEdge = meanEdge * mergeFactor;
        let decimated = decimatePs2CrushGeometry(working, maxEdge);
        if (decimated !== working) {
          working.dispose?.();
          working = decimated;
        }

        working.computeVertexNormals();
        working.computeBoundingSphere();

        child.geometry = working;
        child.userData.orbyPs2CrushedGeometry = true;
      } catch (_) {
        working.dispose?.();
        child.geometry = source;
        child.userData.orbyPs2CrushedGeometry = true;
      }
    });
  }

  /** Restore mesh geometry after PS2 / PSX / VGA/DOS 3D decimation. */
  _restorePs2CrushGeometry() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const orig = child.userData.orbyPs2OriginalGeometry;
      const current = child.geometry;
      if (!orig) {
        if (current && !current.attributes?.normal) {
          current.computeVertexNormals();
        }
        return;
      }
      if (current !== orig) {
        current?.dispose?.();
      }
      child.geometry = orig;
      delete child.userData.orbyPs2OriginalGeometry;
      delete child.userData.orbyPs2CrushedGeometry;
    });
  }

  /** Keep live Shader Lab slider fields aligned with state store (slider drags skip full apply). */
  _syncCreativeLookFieldsFromStore(cl = this.stateStore?.getState()?.creativeLook ?? {}) {
    if (!cl || typeof cl !== 'object') return;
    // Preset / enabled are owned by setCreativeLookSettings — syncing them here races ahead of
    // mesh:creative-look and makes the redundant-apply guard skip preset switches.
    const preset = normalizeCreativeLookPreset(cl.preset ?? this.creativeLookSettings.preset);
    if (cl.patternScale !== undefined) {
      this.creativeLookSettings.patternScale = normalizeCreativeLookPatternScale(
        preset,
        Number(cl.patternScale),
      );
    }
    if (cl.intensity !== undefined) {
      this.creativeLookSettings.intensity = normalizeCreativeLookIntensity(cl.intensity);
    }
    if (cl.liftCrush !== undefined) {
      this.creativeLookSettings.liftCrush = normalizeCreativeLookLiftCrush(cl.liftCrush);
    }
    if (cl.masterHue !== undefined) {
      this.creativeLookSettings.masterHue = normalizeCreativeLookMasterHue(cl.masterHue);
    }
  }

  /** Live Shader Lab slider tweaks — uniforms without rebuilding materials. */
  syncCreativeLookLiveFromStore() {
    const cl = this.stateStore?.getState()?.creativeLook ?? {};
    this._syncCreativeLookFieldsFromStore(cl);
    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    const preset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);
    if (isVoxelCreativeLookPreset(preset) && this._voxelMaterialsNeedGradeRebuild()) {
      this._applyCreativeLookOverride();
      return;
    }
    if (isVoxelCreativeLookPreset(preset) && this._meshesNeedVoxelGeometry(preset)) {
      this._syncRetroConsoleGeometryForPreset(preset, this.creativeLookSettings.patternScale);
    }
    if (isDustFieldCreativeLookPreset(preset) && !this._getDustFieldPoints()) {
      this._syncRetroConsoleGeometryForPreset(preset, this.creativeLookSettings.patternScale);
      this._applyDustFieldMaterial(preset, this.creativeLookSettings.patternScale);
    }
    this._syncCreativeLookLiveUniforms(cl);
  }

  /** Rebuild when voxel shaders predate flat albedo or grade post-process. */
  _voxelMaterialsNeedGradeRebuild() {
    if (!this.currentModel) return false;
    let needs = false;
    this.currentModel.traverse((child) => {
      if (needs || !child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!isVoxelCreativeLookPreset(m?.userData?.orbyCreativeLook)) continue;
        const frag = m?.fragmentShader ?? '';
        const vert = m?.vertexShader ?? '';
        if (
          !frag.includes('applyCreativeLiftCrush')
          || frag.includes('uLightScale')
          || frag.includes('baseCol * shade')
          || vert.includes('skinning_vertex')
          || m?.skinning
        ) {
          needs = true;
          break;
        }
      }
    });
    return needs;
  }

  /** True when Voxel HD is active but meshes still carry smooth source geometry. */
  _meshesNeedVoxelGeometry(preset = this.creativeLookSettings?.preset) {
    if (!this.currentModel || !isVoxelCreativeLookPreset(normalizeCreativeLookPreset(preset))) {
      return false;
    }
    let needs = false;
    this.currentModel.traverse((child) => {
      if (needs || !child.isMesh) return;
      if (this._shouldSkipMeshForVoxelization(child)) return;
      if (
        !this.originalMaterials.get(child) &&
        !child.userData?.orbyFontExtrude &&
        !child.userData?.orbySvgExtrude
      ) {
        return;
      }
      if (!child.userData.orbyVoxelPreparedGeometry) {
        needs = true;
        return;
      }
      if ((child.geometry?.attributes?.color?.count ?? 0) <= 0) {
        needs = true;
      }
    });
    return needs;
  }

  /** Replace mesh geometry with merged voxel cubes (Shader Lab Voxel section). */
  _applyVoxelGeometry(preset) {
    if (!this.currentModel) return;
    const cfg = resolveVoxelLookConfig(preset);

    /** @type {Array<{
     *   mesh: THREE.Mesh,
     *   source: THREE.BufferGeometry,
     *   current: THREE.BufferGeometry,
     * }>} */
    const bakeFailed = [];

    /** @type {Array<{
     *   mesh: THREE.Mesh,
     *   geometry: THREE.BufferGeometry,
     *   matrixWorld: THREE.Matrix4,
     *   inverseWorldMatrix: THREE.Matrix4,
     *   diffuseMap: THREE.Texture | null,
     *   diffuseTint: THREE.Color | null,
     * }>} */
    const voxelEntries = [];

    try {
      this.prepareStaticVoxelPose?.();
      this.currentModel.updateWorldMatrix(true, true);

      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        if (this._shouldSkipMeshForVoxelization(child)) {
          if (!('orbyVoxelSkipRestoreVisible' in child.userData)) {
            child.userData.orbyVoxelSkipRestoreVisible = child.visible;
          }
          child.visible = false;
          return;
        }
        if (!this.originalMaterials.get(child)) {
          if (!child.userData?.orbyFontExtrude && !child.userData?.orbySvgExtrude) return;
        }
        const geom = child.geometry;
        if (!geom?.attributes?.position) return;

        const hasLiveVoxelColors =
          !!child.userData.orbyVoxelPreparedGeometry &&
          (geom?.attributes?.color?.count ?? 0) > 0;
        if (!hasLiveVoxelColors) {
          const storedOrig = child.userData.orbyVoxelOriginalGeometry;
          if (!storedOrig || storedOrig !== geom) {
            child.userData.orbyVoxelOriginalGeometry = geom;
          }
          delete child.userData.orbyVoxelPreparedGeometry;
        }

        const source = child.userData.orbyVoxelOriginalGeometry;
        const current = child.geometry;
        if (current !== source && child.userData.orbyVoxelPreparedGeometry) {
          current.dispose?.();
        }

        let voxelSource = source;
        if (meshUsesSkinning(child)) {
          const baked = child.isSkinnedMesh
            ? bakeSkinnedMeshToStaticGeometry(child)
            : null;
          if (!baked) {
            bakeFailed.push({ mesh: child, source, current: child.geometry });
            return;
          }
          const prevBaked = child.userData.orbyVoxelBakedStaticGeometry;
          if (prevBaked && prevBaked !== baked) {
            prevBaked.dispose?.();
          }
          child.userData.orbyVoxelBakedStaticGeometry = baked;
          voxelSource = baked;
        }

        const origMat = this.originalMaterials.get(child);
        const liveMats = Array.isArray(child.material) ? child.material : [child.material];
        const sourceMat = Array.isArray(origMat) ? origMat[0] : origMat;
        const { diffuseMap, diffuseTint } = this._resolveCreativeLookDiffuseSources(
          child,
          sourceMat,
          liveMats,
          0,
        );

        const matrixWorld = child.matrixWorld.clone();
        const inverseWorldMatrix = matrixWorld.clone().invert();

        voxelEntries.push({
          mesh: child,
          geometry: voxelSource,
          matrixWorld,
          inverseWorldMatrix,
          diffuseMap,
          diffuseTint,
        });
      });

      /** @type {Map<THREE.Mesh, THREE.BufferGeometry | null>} */
      let voxelizedByMesh = new Map();
      let voxelMaxAxis = creativeVoxelMaxAxis(preset);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          voxelizedByMesh = voxelizeModelMeshes(voxelEntries, {
            preset,
            maxAxis: voxelMaxAxis,
            fillInterior: cfg.fillInterior,
            maxVoxels: creativeVoxelMaxVoxels(preset, voxelMaxAxis),
            preserveThinFeatures: this._isFontExtrudeModel() || !!this.currentModel?.userData?.orbySvgExtrude,
            cullComponentMinVoxels: cfg.cullComponentMinVoxels,
            smallMeshSurfaceRatio: cfg.smallMeshSurfaceRatio,
            smallMeshBboxRatio: cfg.smallMeshBboxRatio,
            spikeErodePasses: cfg.spikeErodePasses,
            spikeMaxNeighbors: cfg.spikeMaxNeighbors,
            satelliteMinGridGapVoxels: cfg.satelliteMinGridGapVoxels,
            needleMaxAspectRatio: cfg.needleMaxAspectRatio,
            needleMaxVoxels: cfg.needleMaxVoxels,
          });
        } catch (_) {
          voxelizedByMesh = new Map();
        }

        const hasColoredVoxels = [...voxelizedByMesh.values()].some(
          (geom) => geom?.attributes?.color?.count > 0,
        );
        if (hasColoredVoxels) break;
        voxelMaxAxis = Math.max(64, Math.floor(voxelMaxAxis * 0.82));
      }

      if (![...voxelizedByMesh.values()].some((geom) => geom?.attributes?.color?.count > 0)) {
        console.warn('[Orby] Voxel HD geometry preparation failed — smooth mesh kept.');
      }

      for (const entry of voxelEntries) {
        const voxelized = voxelizedByMesh.get(entry.mesh);
        if (!voxelized?.attributes?.color?.count) {
          continue;
        }
        const prev = entry.mesh.geometry;
        if (prev !== voxelized && prev !== entry.geometry) {
          prev.dispose?.();
        }
        entry.mesh.geometry = voxelized;
        entry.mesh.userData.orbyVoxelPreparedGeometry = true;
      }

      for (const { mesh, source } of bakeFailed) {
        mesh.geometry = source;
        mesh.userData.orbyVoxelPreparedGeometry = true;
      }
    } finally {
      this.restoreStaticVoxelPose?.();
    }
  }

  /** Restore mesh geometry after voxelization. */
  _restoreVoxelGeometry() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if ('orbyVoxelSkipRestoreVisible' in child.userData) {
        child.visible = child.userData.orbyVoxelSkipRestoreVisible;
        delete child.userData.orbyVoxelSkipRestoreVisible;
      }
      const orig = child.userData.orbyVoxelOriginalGeometry;
      const current = child.geometry;
      if (!orig) {
        if (current && !current.attributes?.normal) {
          current.computeVertexNormals();
        }
        return;
      }
      if (current !== orig) {
        current?.dispose?.();
      }
      child.geometry = orig;
      delete child.userData.orbyVoxelOriginalGeometry;
      delete child.userData.orbyVoxelPreparedGeometry;
      const baked = child.userData.orbyVoxelBakedStaticGeometry;
      if (baked) {
        baked.dispose?.();
        delete child.userData.orbyVoxelBakedStaticGeometry;
      }
    });
  }

  /** Restore mesh geometry after Wire Pulse barycentric prep. */
  _restoreWirePulseGeometry() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const orig = child.userData.orbyWirePulseOriginalGeometry;
      const current = child.geometry;
      if (!orig) {
        if (current && !current.attributes?.normal) {
          current.computeVertexNormals();
        }
        return;
      }
      if (current !== orig) {
        current?.dispose?.();
      }
      child.geometry = orig;
      delete child.userData.orbyWirePulseOriginalGeometry;
      delete child.userData.orbyWirePulsePreparedGeometry;
    });
  }

  /** Restore mesh geometry if a previous Scanline Hologram prep pass left triangle soup behind. */
  _restoreScanlineGeometry() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const orig = child.userData.orbyScanlineOriginalGeometry;
      if (!orig) return;
      const current = child.geometry;
      if (current !== orig) {
        current?.dispose?.();
      }
      child.geometry = orig;
      delete child.userData.orbyScanlineOriginalGeometry;
      delete child.userData.orbyScanlinePreparedGeometry;
    });
  }

  /** Non-indexed triangle soup + barycentrics for Wire Pulse wireframe shader. */
  _applyWirePulseGeometry() {
    if (!this.currentModel) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (this.isWindowMesh(child)) return;
      if (!this.originalMaterials.get(child)) return;
      const geom = child.geometry;
      if (!geom?.attributes?.position) return;

      if (!child.userData.orbyWirePulseOriginalGeometry) {
        child.userData.orbyWirePulseOriginalGeometry = geom;
      }

      const source = child.userData.orbyWirePulseOriginalGeometry;
      const current = child.geometry;
      if (current !== source && child.userData.orbyWirePulsePreparedGeometry) {
        current.dispose?.();
      }

      try {
        const prepared = prepareCreativeLookWirePulseGeometry(source);
        child.geometry = prepared;
        child.userData.orbyWirePulsePreparedGeometry = true;
      } catch (_) {
        child.geometry = source;
        child.userData.orbyWirePulsePreparedGeometry = true;
      }
    });
  }

  /** Surface-sample mesh into a model-local point cloud; hides source meshes. */
  _applyDustFieldGeometry() {
    if (!this.currentModel) return;

    this._restoreDustFieldGeometry();

    this.currentModel.updateWorldMatrix(true, true);

    const built = buildDustFieldGeometry(this.currentModel, {
      particleCount: DUST_FIELD_PARTICLE_COUNT,
      shouldIncludeMesh: (child) => {
        if (this.isWindowMesh(child)) return false;
        if (this._shouldSkipMeshForVoxelization(child)) return false;
        if (
          !this.originalMaterials.get(child) &&
          !child.userData?.orbyFontExtrude &&
          !child.userData?.orbySvgExtrude
        ) {
          return false;
        }
        return !!child.geometry?.attributes?.position;
      },
    });

    if (!built?.geometry) return;

    updateDustFieldParticlePositions(
      built.anchors,
      this.currentModel,
      built.geometry,
    );

    const points = new THREE.Points(built.geometry);
    points.frustumCulled = false;
    points.renderOrder = 12;
    points.name = 'orbyDustFieldPoints';
    this.currentModel.add(points);
    this.currentModel.userData.orbyDustFieldPoints = points;
    this.currentModel.userData.orbyDustFieldAnchors = built.anchors;

    for (const child of built.meshes) {
      if (!('orbyDustFieldHiddenVisible' in child.userData)) {
        child.userData.orbyDustFieldHiddenVisible = child.visible;
      }
      child.visible = false;
    }

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (!this._shouldSkipMeshForVoxelization(child)) return;
      if (!('orbyDustFieldHiddenVisible' in child.userData)) {
        child.userData.orbyDustFieldHiddenVisible = child.visible;
      }
      child.visible = false;
    });
  }

  /** Restore meshes and remove the dust-field point cloud. */
  _restoreDustFieldGeometry() {
    if (!this.currentModel) return;

    const points = this.currentModel.userData.orbyDustFieldPoints;
    if (points) {
      this._disposeTransientMeshMaterials(points);
      points.geometry?.dispose?.();
      points.removeFromParent();
      delete this.currentModel.userData.orbyDustFieldPoints;
    }
    delete this.currentModel.userData.orbyDustFieldAnchors;

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if ('orbyDustFieldHiddenVisible' in child.userData) {
        child.visible = child.userData.orbyDustFieldHiddenVisible;
        delete child.userData.orbyDustFieldHiddenVisible;
      }
    });
  }

  _updateDustFieldParticlePositions() {
    const points = this._getDustFieldPoints();
    const anchors = this.currentModel?.userData?.orbyDustFieldAnchors;
    if (!points?.geometry || !anchors) return;
    updateDustFieldParticlePositions(anchors, this.currentModel, points.geometry);
  }

  /**
   * @param {string} preset
   * @param {number} patternScale
   */
  _applyDustFieldMaterial(preset, patternScale) {
    const points = this._getDustFieldPoints();
    if (!points) return;

    this._disposeTransientMeshMaterials(points);

    const state = this.stateStore?.getState();
    const hdriBlur = Number(state?.hdriBlurriness ?? 0);
    points.material = createCreativeLookMaterial(preset, {
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      time: this._creativeLookTime,
      patternScale,
      hdriBlurriness: Number.isFinite(hdriBlur)
        ? THREE.MathUtils.clamp(hdriBlur, 0, 1)
        : 0,
      masterHue: this.creativeLookSettings.masterHue,
      intensity: this.creativeLookSettings.intensity,
      liftCrush: this.creativeLookSettings.liftCrush,
      materialBrightness:
        this.materialSettings.brightness ?? DEFAULT_MATERIAL_BRIGHTNESS,
      materialMetalness: this.materialSettings.metalness ?? DEFAULT_MATERIAL_METALNESS,
      materialRoughness: this.materialSettings.roughness ?? DEFAULT_MATERIAL_ROUGHNESS,
    });
    points.castShadow = false;
    points.receiveShadow = false;
  }

  _resolveSketchParams(source = this.creativeLookSettings) {
    return resolveCreativeLookSketchParams(
      source?.presetParams,
      source?.patternScale ?? 1,
    );
  }

  /**
   * Whether applying `patch` will rebuild Shader Lab materials (not live-uniform tweaks).
   * @param {object} [patch]
   */
  willRebuildCreativeLookMaterials(patch = {}) {
    const prevEnabled = !!this.creativeLookSettings.enabled;
    const prevPreset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);
    if (!this.currentModel) return false;

    const merged = { ...this.creativeLookSettings, ...patch };
    const nextEnabled = !!merged.enabled;
    const nextPreset = normalizeCreativeLookPreset(merged.preset);

    if (!nextEnabled) return prevEnabled;
    if (!prevEnabled && nextEnabled) return true;
    return prevEnabled && nextEnabled && prevPreset !== nextPreset;
  }

  /**
   * @param {object} patch
   * @param {{ skipStateStore?: boolean }} [options]
   */
  setCreativeLookSettings(patch, options = {}) {
    const prevEnabled = this.creativeLookSettings.enabled;
    const prevPreset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);
    const prevSketchStroke = isSketchFamilyCreativeLookPreset(prevPreset)
      ? this._resolveSketchParams().strokeWidth
      : null;
    const prevAppliesMaterials = this._shouldApplyCreativeLookMaterials(this.creativeLookSettings);

    this.creativeLookSettings = {
      ...this.creativeLookSettings,
      ...patch,
    };
    this.creativeLookSettings.enabled = !!this.creativeLookSettings.enabled;
    this.creativeLookSettings.pauseShaderAnimations =
      !!this.creativeLookSettings.pauseShaderAnimations;
    this.creativeLookSettings.viewportBloom =
      !!this.creativeLookSettings.viewportBloom;
    const sp = Number(this.creativeLookSettings.shaderAnimationSpeed);
    this.creativeLookSettings.shaderAnimationSpeed = Number.isFinite(sp)
      ? THREE.MathUtils.clamp(sp, 0, 2)
      : 0.4;
    const ps = Number(this.creativeLookSettings.patternScale);
    this.creativeLookSettings.patternScale = normalizeCreativeLookPatternScale(
      this.creativeLookSettings.preset,
      ps,
    );
    this.creativeLookSettings.masterHue = normalizeCreativeLookMasterHue(
      this.creativeLookSettings.masterHue,
    );
    this.creativeLookSettings.liftCrush = normalizeCreativeLookLiftCrush(
      this.creativeLookSettings.liftCrush,
    );
    this.creativeLookSettings.preset = resolveCreativeLookPresetChoice(
      this.creativeLookSettings.preset,
    );
    const nextPreset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);
    const mergedPresetParams = {
      ...(this.creativeLookSettings.presetParams ?? {}),
      ...(patch.presetParams ?? {}),
    };
    if (
      (nextPreset === 'sketch' || nextPreset === 'sketch-colour') &&
      nextPreset !== prevPreset &&
      patch.presetParams?.sketch === undefined
    ) {
      const fb = this.creativeLookSettings.patternScale;
      mergedPresetParams.sketch = {
        strokeWidth: fb,
        rasterSize: fb,
        ...mergedPresetParams.sketch,
      };
    }
    this.creativeLookSettings.presetParams = normalizeCreativeLookPresetParams(
      nextPreset,
      mergedPresetParams,
      this.creativeLookSettings.patternScale,
    );
    const fixedScale = creativeLookFixedPatternScale(nextPreset);
    const resetDitherTuning = shouldResetDitherPresetTuning(prevPreset, nextPreset);
    if (fixedScale != null) {
      this.creativeLookSettings.patternScale = fixedScale;
    } else if (resetDitherTuning) {
      this.creativeLookSettings.patternScale = creativeLookDefaultPatternScale(nextPreset);
    } else if (nextPreset !== prevPreset && patch.patternScale === undefined) {
      const defaultScale = creativeLookDefaultPatternScale(nextPreset);
      if (defaultScale != null) {
        this.creativeLookSettings.patternScale = defaultScale;
      }
    }
    if (
      resetDitherTuning
      || (
        nextPreset !== prevPreset
        && patch.intensity === undefined
        && (nextPreset === 'scanline-hologram' || nextPreset === 'vectrex' || nextPreset === 'wire-pulse' || nextPreset === 'vertex-points' || nextPreset === 'dust-field' || isDitherPixelCreativeLookPreset(nextPreset))
      )
    ) {
      this.creativeLookSettings.intensity = creativeLookDefaultIntensity(nextPreset);
    }
    this.creativeLookSettings.intensity = normalizeCreativeLookIntensity(
      this.creativeLookSettings.intensity,
    );

    if (!options.skipStateStore && this.stateStore) {
      this.stateStore.set('creativeLook', this.creativeLookSettings);
    }

    if (!this.currentModel) {
      if (this.onMaterialUpdate) this.onMaterialUpdate();
      return;
    }

    if (!this.creativeLookSettings.enabled) {
      this._restoreCreativeLookBaseMaterials();
      return;
    }

    const nextAppliesMaterials = this._shouldApplyCreativeLookMaterials();
    if (!nextAppliesMaterials) {
      this._restoreCreativeLookBaseMaterials();
      if (typeof this.onCreativeLookAsciiSync === 'function') {
        this.onCreativeLookAsciiSync();
      }
      return;
    }

    // Rebuilding every ShaderMaterial disposes GPU programs; redundant applies (duplicate events /
    // same state) caused visible black flashes. Only skip rebuild when mesh materials already match.
    const appliedPreset = normalizeCreativeLookPreset(this._appliedCreativeLookPreset);
    const redundant =
      prevEnabled &&
      this.creativeLookSettings.enabled &&
      appliedPreset === nextPreset &&
      prevAppliesMaterials;
    if (redundant) {
      this._syncCreativeLookLiveUniforms(this.creativeLookSettings);
      if (isVoxelCreativeLookPreset(nextPreset) && this._meshesNeedVoxelGeometry(nextPreset)) {
        this._syncRetroConsoleGeometryForPreset(
          nextPreset,
          this.creativeLookSettings.patternScale,
        );
      }
      if (isDustFieldCreativeLookPreset(nextPreset) && !this._getDustFieldPoints()) {
        this._syncRetroConsoleGeometryForPreset(
          nextPreset,
          this.creativeLookSettings.patternScale,
        );
        this._applyDustFieldMaterial(nextPreset, this.creativeLookSettings.patternScale);
      }
      if (isSketchFamilyCreativeLookPreset(nextPreset)) {
        const nextStroke = this._resolveSketchParams().strokeWidth;
        if (prevSketchStroke !== null && prevSketchStroke !== nextStroke) {
          this._syncRetroConsoleGeometryForPreset(nextPreset, nextStroke);
        }
      }
      if (
        (isFlatPostCreativeLookPreset(nextPreset) ||
          isWatercolourCreativeLookPreset(nextPreset) ||
          isGouacheCreativeLookPreset(nextPreset) ||
          isSketchFamilyCreativeLookPreset(nextPreset) ||
          isVectrexCreativeLookPreset(nextPreset)) &&
        typeof this.onCreativeLookAsciiSync === 'function'
      ) {
        this.onCreativeLookAsciiSync();
      }
      return;
    }

    if (
      prevEnabled &&
      this.creativeLookSettings.enabled &&
      prevPreset !== nextPreset
    ) {
      this._appliedCreativeLookPreset = null;
    }

    this._applyCreativeLookOverride();
  }

  updateCreativeLookTime(elapsedSeconds) {
    const cl = this.stateStore?.getState()?.creativeLook ?? {};
    this._syncCreativeLookFieldsFromStore(cl);
    let animSpeed = Number(cl.shaderAnimationSpeed);
    if (!Number.isFinite(animSpeed)) animSpeed = 0.4;
    animSpeed = THREE.MathUtils.clamp(animSpeed, 0, 2);
    let patternScale = Number(cl.patternScale);
    if (!Number.isFinite(patternScale)) patternScale = 1;
    patternScale = normalizeCreativeLookPatternScale(
      normalizeCreativeLookPreset(cl.preset),
      patternScale,
    );
    this.creativeLookSettings.patternScale = patternScale;
    this.creativeLookSettings.presetParams = normalizeCreativeLookPresetParams(
      normalizeCreativeLookPreset(cl.preset),
      cl.presetParams ?? {},
      patternScale,
    );

    const scaledClock = elapsedSeconds * animSpeed;

    const paused = cl.pauseShaderAnimations === true;
    if (paused) {
      if (this._creativeLookPausedAt === null) {
        this._creativeLookPausedAt = scaledClock;
      }
    } else {
      this._creativeLookPausedAt = null;
    }
    const effectiveTime =
      paused && this._creativeLookPausedAt !== null
        ? this._creativeLookPausedAt
        : scaledClock;
    this._creativeLookTime = effectiveTime;

    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    const preset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);

    this._syncCreativeLookToonLightUniforms();

    if (creativeLookPresetUsesShaderAnimation(preset)) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          const tag = m?.userData?.orbyCreativeLook;
          if (
            creativeLookPresetUsesShaderAnimation(tag) &&
            m.uniforms?.uTime
          ) {
            m.uniforms.uTime.value = effectiveTime;
            if (m.uniforms.uPatternScale) {
              m.uniforms.uPatternScale.value = patternScale;
            }
          }
        }
      });
      if (isDustFieldCreativeLookPreset(preset)) {
        const dustPoints = this._getDustFieldPoints();
        const dustMat = dustPoints?.material;
        if (
          dustMat?.userData?.orbyCreativeLook === 'dust-field' &&
          dustMat.uniforms?.uTime
        ) {
          dustMat.uniforms.uTime.value = effectiveTime;
          if (dustMat.uniforms.uPatternScale) {
            dustMat.uniforms.uPatternScale.value = patternScale;
          }
        }
      }
    }

    if (
      isFlatPostCreativeLookPreset(preset) ||
      isWatercolourCreativeLookPreset(preset) ||
      isGouacheCreativeLookPreset(preset) ||
      isSketchFamilyCreativeLookPreset(preset) ||
      isVectrexCreativeLookPreset(preset)
    ) {
      if (typeof this.onCreativeLookAsciiSync === 'function') {
        this.onCreativeLookAsciiSync();
      }
    }

    if (preset === 'chrome') {
      const blur = Number(this.stateStore?.getState()?.hdriBlurriness ?? 0);
      const rough = creativeChromeRoughness(
        patternScale,
        Number.isFinite(blur) ? blur : 0,
      );
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m?.userData?.orbyCreativeLook === 'chrome' && m.isMeshPhysicalMaterial) {
            m.roughness = rough;
          }
        }
      });
    }

    if (preset === 'glass') {
      const blur = Number(this.stateStore?.getState()?.hdriBlurriness ?? 0);
      const hdriBlur = Number.isFinite(blur) ? blur : 0;
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m?.userData?.orbyCreativeLook === 'glass' && m.isMeshPhysicalMaterial) {
            const { thickness, roughness } = creativeGlassParamsForMesh(
              patternScale,
              hdriBlur,
              child,
            );
            m.thickness = thickness;
            m.roughness = roughness;
          }
        }
      });
    }

    if (isDustFieldCreativeLookPreset(preset)) {
      this._updateDustFieldParticlePositions();
    }

    this._syncCreativeLookLiveUniforms(cl);
  }

  _syncCreativeLookToonLightUniforms() {
    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    if (typeof this.getCreativeLookKeyLightDir === 'function') {
      const dir = this.getCreativeLookKeyLightDir(this._creativeToonKeyDirScratch);
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          const tag = m?.userData?.orbyCreativeLook;
          if (
            (tag === 'toon' ||
              tag === 'ps2-crush' ||
              tag === 'psx' ||
              tag === 'vga-dos-3d' ||
              isVoxelCreativeLookPreset(tag) ||
              tag === 'watercolour' ||
              tag === 'gouache' ||
              tag === 'sketch' ||
              tag === 'sketch-colour') &&
            m.uniforms?.uLightDir
          ) {
            m.uniforms.uLightDir.value.copy(dir);
          }
        }
      });
    }
    if (typeof this.getCreativeLookToonLightScalars === 'function') {
      const { lightScale, ambientFloor } = this.getCreativeLookToonLightScalars();
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          const tag = m?.userData?.orbyCreativeLook;
          if (isVoxelCreativeLookPreset(tag)) {
            if (m.uniforms?.uLightScale) m.uniforms.uLightScale.value = 1;
            continue;
          }
          if (
            tag !== 'toon' &&
            tag !== 'ps2-crush' &&
            tag !== 'psx' &&
            tag !== 'vga-dos-3d'
          )
            continue;
          if (m.uniforms?.uLightScale) m.uniforms.uLightScale.value = lightScale;
          if (m.uniforms?.uAmbientFloor) m.uniforms.uAmbientFloor.value = ambientFloor;
        }
      });
    }
  }

  _syncCreativeLookLiveUniforms(source = this.creativeLookSettings) {
    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    this._syncCreativeLookToonLightUniforms();
    const masterHue = normalizeCreativeLookMasterHue(source?.masterHue);
    const hueRad = creativeLookMasterHueRadians(masterHue);
    const intensity = normalizeCreativeLookIntensity(source?.intensity);
    const liftCrush = normalizeCreativeLookLiftCrush(source?.liftCrush);
    const brightness =
      this.materialSettings.brightness ?? DEFAULT_MATERIAL_BRIGHTNESS;
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!m?.userData?.orbyCreativeLook) continue;
        if (!creativeLookPresetUsesShadowReceive(m.userData.orbyCreativeLook)) {
          if (
            m.lights
            || m.uniforms?.directionalLightShadows
            || m.uniforms?.ambientLightColor
          ) {
            clearCreativeLookLightingUniforms(m);
            m.needsUpdate = true;
          }
        } else {
          ensureCreativeLookLightingUniforms(m);
        }
        if (m.uniforms?.uMasterHue) {
          m.uniforms.uMasterHue.value = hueRad;
        }
        if (m.uniforms?.uLiftCrush) {
          m.uniforms.uLiftCrush.value = liftCrush;
        }
        if (m.uniforms?.uBrightness) {
          m.uniforms.uBrightness.value = brightness;
        }
        if (m.uniforms?.uMetalness) {
          m.uniforms.uMetalness.value =
            this.materialSettings.metalness ?? DEFAULT_MATERIAL_METALNESS;
        }
        if (m.uniforms?.uRoughness) {
          m.uniforms.uRoughness.value =
            this.materialSettings.roughness ?? DEFAULT_MATERIAL_ROUGHNESS;
        }
        if (m.uniforms?.uIntensity) {
          if (m.userData.orbyCreativeLook === 'watercolour') {
            const ps = normalizeCreativeLookPatternScale(
              'watercolour',
              source?.patternScale ?? this.creativeLookSettings.patternScale,
            );
            m.uniforms.uIntensity.value = creativeWatercolourVertexDrift(ps);
          } else if (m.userData.orbyCreativeLook === 'gouache') {
            const ps = normalizeCreativeLookPatternScale(
              'gouache',
              source?.patternScale ?? this.creativeLookSettings.patternScale,
            );
            m.uniforms.uIntensity.value = creativeGouacheVertexDrift(ps);
          } else if (m.userData.orbyCreativeLook === 'sketch' || m.userData.orbyCreativeLook === 'sketch-colour') {
            const { strokeWidth } = this._resolveSketchParams(source);
            m.uniforms.uIntensity.value = creativeSketchVertexDrift(strokeWidth);
          } else {
            m.uniforms.uIntensity.value = intensity;
          }
        }
        if (m.userData.orbyCreativeLook === 'watercolour') {
          const ps = normalizeCreativeLookPatternScale(
            'watercolour',
            source?.patternScale ?? this.creativeLookSettings.patternScale,
          );
          if (m.uniforms?.uWobbleScale) {
            m.uniforms.uWobbleScale.value = creativeWatercolourWobbleScale(ps);
          }
        }
        if (m.userData.orbyCreativeLook === 'gouache') {
          const ps = normalizeCreativeLookPatternScale(
            'gouache',
            source?.patternScale ?? this.creativeLookSettings.patternScale,
          );
          if (m.uniforms?.uWobbleScale) {
            m.uniforms.uWobbleScale.value = creativeGouacheWobbleScale(ps);
          }
        }
        if (m.userData.orbyCreativeLook === 'sketch' || m.userData.orbyCreativeLook === 'sketch-colour') {
          const { strokeWidth } = this._resolveSketchParams(source);
          if (m.uniforms?.uWobbleScale) {
            m.uniforms.uWobbleScale.value = creativeSketchWobbleScale(strokeWidth);
          }
        }
        if (m.isMeshPhysicalMaterial) {
          applyCreativeLookPhysicalMasterHue(m, masterHue, brightness);
        }
      }
    });

    const preset = normalizeCreativeLookPreset(
      source?.preset ?? this.creativeLookSettings.preset,
    );
    if (isDustFieldCreativeLookPreset(preset)) {
      const dustPoints = this._getDustFieldPoints();
      const dustMat = dustPoints?.material;
      if (dustMat?.userData?.orbyCreativeLook === 'dust-field') {
        if (dustMat.uniforms?.uMasterHue) {
          dustMat.uniforms.uMasterHue.value = hueRad;
        }
        if (dustMat.uniforms?.uLiftCrush) {
          dustMat.uniforms.uLiftCrush.value = liftCrush;
        }
        if (dustMat.uniforms?.uBrightness) {
          dustMat.uniforms.uBrightness.value = brightness;
        }
        if (dustMat.uniforms?.uIntensity) {
          dustMat.uniforms.uIntensity.value = intensity;
        }
        const ps = normalizeCreativeLookPatternScale(
          'dust-field',
          source?.patternScale ?? this.creativeLookSettings.patternScale,
        );
        if (dustMat.uniforms?.uPatternScale) {
          dustMat.uniforms.uPatternScale.value = ps;
        }
      }
    }
  }

  getCreativeLookSettings() {
    return { ...this.creativeLookSettings };
  }

  /** Shader animation clock — shared by mesh shaders and Vectrex phosphor post. */
  getCreativeLookAnimationTime() {
    return this._creativeLookTime;
  }

  setClaySettings(patch) {
    this.claySettings = { ...this.claySettings, ...patch };
    if (this.stateStore.getState().shading === 'clay') {
      // Update existing clay materials directly instead of recreating them
      if (this.currentModel) {
        this.currentModel.traverse((child) => {
          if (!child.isMesh) return;
          const material = child.material;
          if (this._isClayMesh(child)) {
            const patchClay = (mat) => {
              if (this._syncClayMaterialSurface(mat)) {
                mat.needsUpdate = true;
              }
            };
            if (Array.isArray(material)) {
              material.forEach(patchClay);
            } else {
              patchClay(material);
            }
          }
        });
      } else {
        // Fallback to recreating materials if no model loaded
        this.setShading('clay');
      }
    }
  }

  /** @param {THREE.Color} color @param {THREE.Material} [importMat] @param {number} [brightness] */
  _softCapTexturedBrightnessAlbedo(color, importMat, brightness) {
    if (!color?.isColor || !importMat) return;
    const hasAlbedo =
      !!importMat.map?.isTexture || !!importMat.userData?.orbyFbxSlotMaps;
    if (!hasAlbedo) return;
    const b = Number(brightness ?? this.materialSettings.brightness);
    const scale = Number.isFinite(b) ? b : DEFAULT_MATERIAL_BRIGHTNESS;
    const peak = Math.max(color.r, color.g, color.b);
    const maxPeak = Math.max(MATERIAL_TEXTURED_BRIGHTNESS_HDR_PEAK, scale);
    if (peak > maxPeak) {
      color.multiplyScalar(maxPeak / peak);
    }
  }

  /**
   * Brightness-adjusted albedo. Dielectrics may exceed 1.0 (HDR-style diffuse boost).
   * When metalness is active (scalar-only PBR), clamp to [0, 1] so conductor F0 does not blow out specular.
   * Skipped when {@link importMat} has MR maps — the slider is a map multiplier, not surface metalness.
   * Albedo-mapped imports get a soft HDR peak so map × tint does not clip before tonemap.
   * @param {THREE.Color|string} sourceColor
   * @param {number} [brightness]
   * @param {number|null} [metalnessForClamp] — pass `0` for unlit/textures; omit to use slider metalness
   * @param {THREE.Material} [importMat]
   */
  _metalnessForBrightnessClamp(metalnessForClamp, importMat) {
    if (metalnessForClamp !== undefined) return metalnessForClamp;
    if (importMat && this._importMaterialHasMrMaps(importMat)) return 0;
    return this.materialSettings.metalness ?? 0;
  }

  _isNearBlackDiffuseColor(color) {
    if (!color?.isColor) return false;
    const { r, g, b } = color;
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false;
    return Math.max(r, g, b) < 0.08;
  }

  /**
   * FBX / Substance exports often keep diffuse color at black when albedo lives in the map.
   * Three.js multiplies `material.color` × `material.map`, so black tint → invisible mesh.
   */
  _whiteBalanceFbxTexturedDiffuse(material) {
    if (!material?.color) return;
    const hasAlbedo = !!material.map?.isTexture || !!material.userData?.orbyFbxSlotMaps;
    if (hasAlbedo && this._isNearBlackDiffuseColor(material.color)) {
      material.color.setRGB(1, 1, 1);
      material.needsUpdate = true;
    }
  }

  /**
   * Shaded clones from FBX Map Slots need explicit map handoff, white diffuse tint, and PBR
   * multipliers — otherwise black FBX factors or flipped OpenGL normals can zero out lighting.
   * @param {THREE.Material} cloned
   * @param {THREE.Material} importMat
   */
  _finalizeFbxSlotShadedClone(cloned, importMat) {
    if (!cloned || !importMat) return cloned;
    this._whiteBalanceFbxTexturedDiffuse(importMat);

    const mapKeys = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'aoMap',
      'emissiveMap',
      'alphaMap',
      'displacementMap',
    ];
    for (const key of mapKeys) {
      if (importMat[key]) cloned[key] = importMat[key];
    }

    if (importMat.normalMap) {
      cloned.normalMapType = THREE.TangentSpaceNormalMap;
      if (importMat.normalScale) {
        cloned.normalScale = importMat.normalScale.clone();
      }
      this._syncFbxNormalScaleY(cloned);
      this._syncFbxNormalMapOrientation(cloned);
    }

    const adjustedColor = this._diffuseColorWithBrightness(
      this._importDiffuseTintForShading(importMat),
      undefined,
      undefined,
      importMat,
    );
    cloned.color.copy(adjustedColor);
    cloned.metalness = importMat.metalnessMap
      ? 1
      : this.materialSettings.metalness;
    cloned.roughness = importMat.roughnessMap
      ? 1
      : this.materialSettings.roughness;
    cloned.userData.orbyFbxSlotMaps = true;
    cloned.needsUpdate = true;
    return cloned;
  }

  _importDiffuseTintForShading(importMat) {
    if (!importMat) return new THREE.Color('#ffffff');
    const hasAlbedo =
      !!importMat.map?.isTexture || !!importMat.userData?.orbyFbxSlotMaps;
    if (hasAlbedo && this._isNearBlackDiffuseColor(importMat.color)) {
      // BLEND + black factor × albedo is glTF modulate semantics (Sketchfab ground shadows).
      // White-balancing is for FBX Phong/Lambert black tints only — not alpha-masked decals.
      const alphaMode =
        importMat.userData?.alphaMode ?? this._inferGltfAlphaMode(importMat);
      if (alphaMode !== 'BLEND') {
        return new THREE.Color('#ffffff');
      }
    }
    return importMat.color?.clone?.() ?? new THREE.Color('#ffffff');
  }

  _diffuseColorWithBrightness(
    sourceColor,
    brightness = this.materialSettings.brightness,
    metalnessForClamp = undefined,
    importMat = undefined,
  ) {
    const color =
      sourceColor?.isColor
        ? sourceColor.clone()
        : new THREE.Color(sourceColor ?? '#ffffff');
    const b = Number(brightness);
    const scale = Number.isFinite(b) ? b : DEFAULT_MATERIAL_BRIGHTNESS;
    color.multiplyScalar(scale);

    const metalRaw = this._metalnessForBrightnessClamp(metalnessForClamp, importMat);
    const metal = Number.isFinite(Number(metalRaw)) ? Math.min(1, Math.max(0, Number(metalRaw))) : 0;
    if (metal > 1e-4) {
      const clamp = (v) => Math.min(1, Math.max(0, v));
      color.r = THREE.MathUtils.lerp(color.r, clamp(color.r), metal);
      color.g = THREE.MathUtils.lerp(color.g, clamp(color.g), metal);
      color.b = THREE.MathUtils.lerp(color.b, clamp(color.b), metal);
    }
    this._softCapTexturedBrightnessAlbedo(color, importMat, scale);
    return color;
  }

  setMaterialBrightness(brightness) {
    const b = Number(brightness);
    this.materialSettings.brightness = Number.isFinite(b) ? b : DEFAULT_MATERIAL_BRIGHTNESS;
    this.updateMaterials();
    if (this._lastEnvTexture != null) {
      this.updateMaterialsEnvironment(
        this._lastEnvTexture,
        this._lastEnvIntensity,
        this._lastHdriBlurriness,
      );
    }
  }

  setMaterialMetalness(metalness) {
    const m = Number(metalness);
    this.materialSettings.metalness = Number.isFinite(m) ? Math.min(1, Math.max(0, m)) : 0;
    this.updateMaterials();
  }

  setMaterialRoughness(roughness) {
    const r = Number(roughness);
    this.materialSettings.roughness = Number.isFinite(r)
      ? Math.min(1, Math.max(0, r))
      : DEFAULT_MATERIAL_ROUGHNESS;
    this.updateMaterials();
  }

  setMaterialEmissive(emissive) {
    this.materialSettings.emissive = emissive;
    this.updateMaterials();
  }

  getClayColorWithBrightness() {
    const baseColorHex = this.claySettings?.color ?? '#808080';
    return this._diffuseColorWithBrightness(new THREE.Color(baseColorHex));
  }

  updateMaterials() {
    // Object → Maps preview swaps transient MeshBasicMaterials on the mesh; shaded clones
    // are parked in MapInspectPreview._savedMaterials. Patching child.material here would
    // miss the parked materials and leave a stale restore (brightness pop after unpin).
    if (this.mapInspectPreview?.activeSlot) return;

    // Update existing materials in all modes (except wireframe which has its own color)
    // Material controls now apply to both Color/Textures modes AND Clay mode
    if (this.currentModel && (this.currentShading === 'shaded' || this.currentShading === 'textures' || this.currentShading === 'clay')) {
      const modelHasEmissive =
        this.currentShading === 'shaded' ? this._modelHasAnyEmissiveBaseline() : false;
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const original = this.originalMaterials.get(child);
        const material = child.material;
        
        // Skip glass materials - they should not be affected by brightness/metalness/roughness sliders
        const isGlass = this.isWindowMesh(child);
        if (isGlass) return;
        
        if (this.currentShading === 'clay' && this._isClayMesh(child)) {
          const patchClayMat = (mat) => {
            if (mat?.userData?.orbyCreativeLook) return;
            if (this._syncClayMaterialSurface(mat)) {
              mat.needsUpdate = true;
            }
          };
          if (Array.isArray(material)) {
            material.forEach(patchClayMat);
          } else {
            patchClayMat(material);
          }
        } else if (this.currentShading === 'textures') {
          // For unlit/textures mode (MeshBasicMaterial), only update brightness
          // MeshBasicMaterial doesn't support metalness/roughness - it's truly unlit
          if (!original) return;
          
          const getOriginalColor = (orig, idx = 0) => {
            const importMat = Array.isArray(orig) ? orig[idx] : orig;
            return this._importDiffuseTintForShading(importMat);
          };

          if (Array.isArray(material) && Array.isArray(original)) {
            material.forEach((mat, idx) => {
              if (mat?.userData?.orbyCreativeLook) return;
              if (mat && mat.isMeshBasicMaterial) {
                const adjustedColor = this._diffuseColorWithBrightness(
                  getOriginalColor(original, idx),
                  undefined,
                  0,
                );
                mat.color.copy(adjustedColor);
                mat.needsUpdate = true;
              }
            });
          } else if (material && material.isMeshBasicMaterial) {
            if (material.userData?.orbyCreativeLook) return;
            const adjustedColor = this._diffuseColorWithBrightness(
              getOriginalColor(original),
              undefined,
              0,
            );
            material.color.copy(adjustedColor);
            material.needsUpdate = true;
          }
        } else if (this.currentShading === 'shaded') {
          // For shaded mode, update brightness, metalness, and roughness
          if (!original) return;

          const tSub = this._isSubsurfaceActive()
            ? this._subsurfaceTranslucency()
            : 0;

          const getOriginalColor = (orig, idx = 0) => {
            const importMat = Array.isArray(orig) ? orig[idx] : orig;
            return this._importDiffuseTintForShading(importMat);
          };

          if (Array.isArray(material) && Array.isArray(original)) {
            material.forEach((mat, idx) => {
              if (mat?.userData?.orbyCreativeLook) return;
              const origMat = Array.isArray(original) ? original[idx] : original;
              if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
                let m = mat;
                if (this._isEmissiveBlendDisplayImport(origMat)) {
                  if (m.userData?.orbyEmissiveDisplay && m.isMeshBasicMaterial) {
                    this._applyEmissiveDisplayMaterialGain(
                      m,
                      origMat,
                      this.materialSettings.emissive || 0.0,
                    );
                  } else {
                    this._applyUserEmissiveOrRestoreImport(
                      m,
                      origMat,
                      m.color,
                      this.materialSettings.emissive || 0.0,
                      modelHasEmissive,
                    );
                    this._syncEmissiveBlendMaterial(m);
                  }
                  m.needsUpdate = true;
                  return;
                }
                if (tSub > SUBSURFACE_EPS && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) {
                  m = this._upgradeStandardMaterialToPhysical(m);
                  material[idx] = m;
                }
                const adjustedColor = this._diffuseColorWithBrightness(
                  getOriginalColor(original, idx),
                  undefined,
                  undefined,
                  origMat,
                );
                m.color.copy(adjustedColor);
                if (origMat?.userData?.orbyFbxSlotMaps) {
                  m.metalness = this.materialSettings.metalness;
                  m.roughness = this.materialSettings.roughness;
                } else {
                  this._applyShadedMetalRoughness(m, origMat);
                }
                this._applyUserEmissiveOrRestoreImport(
                  m,
                  origMat,
                  adjustedColor,
                  this.materialSettings.emissive || 0.0,
                  modelHasEmissive,
                );
                this._syncTransparentFlagsFromImport(m, origMat);
                if (tSub > SUBSURFACE_EPS && m.isMeshPhysicalMaterial) {
                  delete m.userData.orbySubsurface;
                  this._applySubsurfacePhysicalParams(m, tSub);
                }
                m.needsUpdate = true;
              } else if (mat && (mat.isMeshPhongMaterial || mat.isMeshLambertMaterial)) {
                if (mat?.userData?.orbyCreativeLook) return;
                // FBX (e.g. Mixamo) often loads as Phong/Lambert — brightness must still apply live.
                const adjustedColor = this._diffuseColorWithBrightness(
                  getOriginalColor(original, idx),
                  undefined,
                  undefined,
                  origMat,
                );
                mat.color.copy(adjustedColor);
                mat.needsUpdate = true;
              }
            });
          } else if (material && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) {
            if (material.userData?.orbyCreativeLook) return;
            if (this._isEmissiveBlendDisplayImport(original)) {
              if (material.userData?.orbyEmissiveDisplay && material.isMeshBasicMaterial) {
                this._applyEmissiveDisplayMaterialGain(
                  material,
                  original,
                  this.materialSettings.emissive || 0.0,
                );
              } else {
                this._applyUserEmissiveOrRestoreImport(
                  material,
                  original,
                  material.color,
                  this.materialSettings.emissive || 0.0,
                  modelHasEmissive,
                );
                this._syncEmissiveBlendMaterial(material);
              }
              material.needsUpdate = true;
              return;
            }
            let mat = material;
            if (tSub > SUBSURFACE_EPS && mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) {
              mat = this._upgradeStandardMaterialToPhysical(mat);
              child.material = mat;
            }
            const adjustedColor = this._diffuseColorWithBrightness(
              getOriginalColor(original),
              undefined,
              undefined,
              original,
            );
            mat.color.copy(adjustedColor);
            if (original?.userData?.orbyFbxSlotMaps) {
              mat.metalness = this.materialSettings.metalness;
              mat.roughness = this.materialSettings.roughness;
            } else {
              this._applyShadedMetalRoughness(mat, original);
            }
            this._applyUserEmissiveOrRestoreImport(
              mat,
              original,
              adjustedColor,
              this.materialSettings.emissive || 0.0,
              modelHasEmissive,
            );
            this._syncTransparentFlagsFromImport(mat, original);
            if (tSub > SUBSURFACE_EPS && mat.isMeshPhysicalMaterial) {
              delete mat.userData.orbySubsurface;
              this._applySubsurfacePhysicalParams(mat, tSub);
            }
            mat.needsUpdate = true;
          } else if (
            material &&
            (material.isMeshPhongMaterial || material.isMeshLambertMaterial)
          ) {
            if (material.userData?.orbyCreativeLook) return;
            const adjustedColor = this._diffuseColorWithBrightness(
              getOriginalColor(original),
              undefined,
              undefined,
              original,
            );
            material.color.copy(adjustedColor);
            material.needsUpdate = true;
          }
        }
      });
      
      // CRITICAL: Reapply Fresnel after material updates
      // Material updates trigger shader recompilation which can lose the onBeforeCompile hook
      // Reapplying ensures Fresnel continues to work
      if (this.fresnelSettings?.enabled) {
        this.applyFresnelToModel(this.currentModel);
      }
      this.reapplySvgExtrudeSurfaceShaders();
    }
    if (this.creativeLookSettings?.enabled) {
      this._syncCreativeLookLiveUniforms();
    }
    if (this.onMaterialUpdate) {
      this.onMaterialUpdate();
    }
  }

  setWireframeSettings(patch) {
    this.wireframeSettings = { ...this.wireframeSettings, ...patch };
    this.stateStore.set('wireframe', this.wireframeSettings);
    this.updateWireframeOverlay();
    // Wireframe mode now uses overlay, so any setting change just updates the overlay
    // No need to refresh shading mode
  }

  clearWireframeOverlay() {
    const meshes = this.wireframeOverlayMeshes;
    if (meshes?.length) {
      for (const child of meshes) {
        child.parent?.remove(child);
        if (child.userData.ownsGeometry || child.userData.isCloned) {
          child.geometry?.dispose?.();
        }
      }
    }
    this._wireframeLineMaterial?.dispose?.();
    this._wireframeLineMaterial = null;
    this._wireframeBasicMaterial?.dispose?.();
    this._wireframeBasicMaterial = null;
    this.wireframeOverlayMeshes = null;
  }

  _resolveWireframeLineResolution(width, height, pixelRatio = 1) {
    const w = width > 0 ? width : window.innerWidth;
    const h = height > 0 ? height : window.innerHeight;
    const dpr = Math.max(1e-6, pixelRatio || window.devicePixelRatio || 1);
    return {
      x: Math.max(1, Math.floor(w * dpr)),
      y: Math.max(1, Math.floor(h * dpr)),
    };
  }

  _syncWireframeLineMaterialResolution(width, height, pixelRatio = 1) {
    if (!this._wireframeLineMaterial?.resolution) return;
    const res = this._resolveWireframeLineResolution(width, height, pixelRatio);
    this._wireframeLineMaterial.resolution.set(res.x, res.y);
  }

  syncWireframeLineResolution(width, height, pixelRatio = 1) {
    this._syncWireframeLineMaterialResolution(width, height, pixelRatio);
  }

  _resolveWireframeSurfaceOffsetForGeometry(sourceGeometry) {
    if (!sourceGeometry.boundingBox) {
      sourceGeometry.computeBoundingBox();
    }
    const size = new THREE.Vector3();
    sourceGeometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    return resolveWireframeSurfaceOffset(maxDim);
  }

  /**
   * @param {THREE.BufferGeometry} sourceGeometry
   * @param {{ applySurfaceOffset?: boolean }} [options]
   */
  _buildOffsetWireframeSourceGeometry(sourceGeometry, options = {}) {
    const { applySurfaceOffset = true } = options;
    const geometry = sourceGeometry.clone();
    const merged = mergeVertices(geometry, 1e-4);
    const working = merged !== geometry ? merged : geometry;
    if (merged !== geometry) {
      geometry.dispose();
    }

    if (!applySurfaceOffset) {
      return working;
    }

    working.deleteAttribute('normal');
    working.computeVertexNormals();

    const positions = working.attributes.position;
    const offset = this._resolveWireframeSurfaceOffsetForGeometry(working);
    for (let i = 0; i < positions.count; i++) {
      const normal = new THREE.Vector3();
      normal.fromBufferAttribute(working.attributes.normal, i);
      const position = new THREE.Vector3();
      position.fromBufferAttribute(positions, i);
      position.addScaledVector(normal, offset);
      positions.setXYZ(i, position.x, position.y, position.z);
    }
    positions.needsUpdate = true;
    return working;
  }

  _buildWireframeLineGeometry(sourceGeometry) {
    // Low threshold: hide coplanar cap triangulation (~0°) but keep high-segment extrude ring edges.
    const edges = new THREE.EdgesGeometry(sourceGeometry, WIREFRAME_EDGES_THRESHOLD_DEG);
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(edges.attributes.position.array);
    edges.dispose();
    return lineGeometry;
  }

  _createWireframeLineMaterial({
    color,
    onlyVisibleFaces,
    thickness,
    width,
    height,
    pixelRatio,
  }) {
    const material = new LineMaterial({
      color: new THREE.Color(color).getHex(),
      linewidth: wireframeLineWidthToPixels(thickness),
      depthTest: onlyVisibleFaces,
      depthWrite: false,
      transparent: !onlyVisibleFaces,
      opacity: onlyVisibleFaces
        ? WIREFRAME_OPACITY_VISIBLE
        : WIREFRAME_OPACITY_OVERLAY,
      toneMapped: true,
      worldUnits: false,
    });
    if (onlyVisibleFaces) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = WIREFRAME_POLYGON_OFFSET_FACTOR;
      material.polygonOffsetUnits = WIREFRAME_POLYGON_OFFSET_UNITS;
    }
    const res = this._resolveWireframeLineResolution(width, height, pixelRatio);
    material.resolution.set(res.x, res.y);
    return material;
  }

  _createWireframeBasicMaterial({ color, onlyVisibleFaces, thickness }) {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      wireframe: true,
      depthTest: onlyVisibleFaces,
      depthWrite: false,
      transparent: !onlyVisibleFaces,
      opacity: onlyVisibleFaces
        ? WIREFRAME_OPACITY_VISIBLE
        : WIREFRAME_OPACITY_OVERLAY,
    });
    material.linewidth = wireframeLineWidthToPixels(thickness);
    if (onlyVisibleFaces) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = WIREFRAME_POLYGON_OFFSET_FACTOR;
      material.polygonOffsetUnits = WIREFRAME_POLYGON_OFFSET_UNITS;
    }
    return material;
  }

  updateWireframeOverlay() {
    if (!this.currentModel) return;

    // Always clear existing overlay first to prevent duplicates
    this.clearWireframeOverlay();

    // Update mesh visibility based on hideMesh setting
    const { hideMesh } = this.wireframeSettings;
    this.currentModel.traverse((child) => {
      if (
        child.isMesh
        && !child.userData.isWireframeOverlay
        && !child.userData.isUvCheckerOverlay
        && !child.userData.isNormalViewOverlay
        && !child.userData.isTopologyWarningsOverlay
      ) {
        // Hide mesh if hideMesh is enabled (but keep diagnostic overlays visible)
        child.visible = !hideMesh;
      }
    });

    // Create overlay if "always on" is enabled OR if wireframe mode is active
    // Wireframe mode now shows overlay on top of original materials (not pure wireframe)
    const shouldShowOverlay = this.wireframeSettings.alwaysOn || this.currentShading === 'wireframe';
    
    if (shouldShowOverlay) {
      this.wireframeOverlayMeshes = [];

      const {
        color,
        onlyVisibleFaces,
        thickness = DEFAULT_WIREFRAME_LINE_WIDTH,
      } = this.wireframeSettings;
      this._wireframeLineMaterial = this._createWireframeLineMaterial({
        color,
        onlyVisibleFaces,
        thickness,
        width: 0,
        height: 0,
        pixelRatio: window.devicePixelRatio || 1,
      });
      this._wireframeBasicMaterial = this._createWireframeBasicMaterial({
        color,
        onlyVisibleFaces,
        thickness,
      });

      // Create wireframe meshes that follow the model.
      // Parent each wire mesh to the same Object3D as the source mesh so local transforms
      // (position/rotation/scale) stay correct — a single overlay group under the model root
      // would misapply nested locals and produce huge offsets / wrong scale (common on GLB).
      this.currentModel.traverse((child) => {
        if (
          !child.isMesh
          || !child.geometry
          || child.userData.isWireframeOverlay
          || child.userData.isUvCheckerOverlay
          || child.userData.isNormalViewOverlay
          || child.userData.isTopologyWarningsOverlay
        ) return;
        // InstancedMesh uses instance matrices; a plain wire clone would not match instances.
        if (child.isInstancedMesh) return;

        const pushAlongNormals = !onlyVisibleFaces;
        let offsetGeometry = this._buildOffsetWireframeSourceGeometry(child.geometry, {
          applySurfaceOffset: pushAlongNormals,
        });
        const sourceGeometry = offsetGeometry;

        let wireMesh;
        if (child.isSkinnedMesh) {
          wireMesh = new THREE.SkinnedMesh(
            sourceGeometry,
            this._wireframeBasicMaterial,
          );
          wireMesh.userData.ownsGeometry = true;
        } else {
          const lineGeometry = this._buildWireframeLineGeometry(sourceGeometry);
          wireMesh = new LineSegments2(lineGeometry, this._wireframeLineMaterial);
          wireMesh.frustumCulled = false;
          wireMesh.userData.ownsGeometry = true;
          offsetGeometry.dispose();
        }

        wireMesh.userData.originalMesh = child;
        wireMesh.userData.isCloned = !!child.isSkinnedMesh;
        wireMesh.userData.isWireframeOverlay = true;
        wireMesh.name = child.name ? `${child.name}_wireframe` : 'wireframe';
        wireMesh.renderOrder = 999;

        wireMesh.position.copy(child.position);
        wireMesh.rotation.copy(child.rotation);
        wireMesh.scale.copy(child.scale);

        if (child.isSkinnedMesh) {
          wireMesh.bind(child.skeleton, child.bindMatrix);
          if (child.bindMatrixInverse) {
            wireMesh.bindMatrixInverse = child.bindMatrixInverse.clone();
          }
        }
        const hostParent = child.parent;
        if (hostParent) {
          hostParent.add(wireMesh);
        } else {
          this.currentModel.add(wireMesh);
        }
        this.wireframeOverlayMeshes.push(wireMesh);
      });
    }
  }

  updateWireframeOverlayTransforms() {
    if (!this.wireframeOverlayMeshes?.length || !this.currentModel) return;

    // Keep wire mesh locals in sync with each source mesh (same parent in the scene graph).
    for (const wireMesh of this.wireframeOverlayMeshes) {
      if (!wireMesh?.userData?.originalMesh) continue;
      const original = wireMesh.userData.originalMesh;
      wireMesh.position.copy(original.position);
      wireMesh.rotation.copy(original.rotation);
      wireMesh.scale.copy(original.scale);
      const shouldDisableAutoUpdate = !wireMesh.isSkinnedMesh;
      wireMesh.matrixAutoUpdate = true;
      wireMesh.updateMatrix();
      if (shouldDisableAutoUpdate) {
        wireMesh.matrixAutoUpdate = false;
      }
      wireMesh.updateMatrixWorld(true);
    }
  }

  /** Delegating wrappers — UV Checker logic lives in {@link UvCheckerOverlay}. */
  setUvCheckerSettings(partial) {
    this.uvCheckerOverlay.applySettings(partial);
  }

  setUvCheckerScale(scale) {
    this.uvCheckerOverlay.setScale(scale);
  }

  setUvCheckerStyle(style) {
    this.uvCheckerOverlay.setStyle(style);
  }

  clearUvCheckerOverlay() {
    this.uvCheckerOverlay.clear();
  }

  updateUvCheckerOverlayTransforms() {
    if (!this.uvCheckerOverlay.enabled) return;
    this.uvCheckerOverlay.updateTransforms();
  }

  /** Delegating wrappers — normal view logic lives in {@link NormalViewOverlay}. */
  setNormalViewSettings(partial) {
    this.normalViewOverlay.applySettings(partial);
  }

  setNormalViewMode(mode) {
    this.normalViewOverlay.setMode(mode);
  }

  clearNormalViewOverlay() {
    this.normalViewOverlay.clear();
  }

  updateNormalViewOverlayTransforms() {
    if (!this.normalViewOverlay.enabled) return;
    this.normalViewOverlay.updateTransforms();
  }

  setFresnelSettings(settings) {
    this.fresnelSettings = {
      ...this.fresnelSettings,
      ...settings,
    };
    // Invert radius: low radius (0.5) = high power (5.0) = narrow, high radius (5.0) = low power (0.5) = wide
    this.fresnelSettings.radius = Math.max(
      0.5,
      Math.min(5.0, this.fresnelSettings.radius || 1),
    );
    this.applyFresnelToModel(this.currentModel);
    this.reapplySvgExtrudeSurfaceShaders();
  }

  /**
   * SVG brushed/car-paint hooks must sit inside shadow tint; re-apply tint after surface patches.
   */
  reapplySvgExtrudeSurfaceShaders() {
    if (!this.currentModel) return;
    // SVG surface wraps Fresnel in onBeforeCompile — patch Fresnel before re-applying surface.
    if (this.fresnelSettings?.enabled) {
      this.applyFresnelToModel(this.currentModel);
    }
    reapplySvgExtrudeSurfaceFromState(
      this.currentModel,
      this.stateStore,
      this.currentShading,
    );
    if (this.shadowTintStrength > 0) {
      this.applyShadowTintToObject(this.currentModel);
    }
    this.reapplyCreativeLookSurfaceShaders();
  }

  /** Appearance → Material surface onto compatible Shader Lab presets (holographic, chrome, etc.). */
  reapplyCreativeLookSurfaceShaders() {
    if (!this.currentModel) return;
    syncCreativeLookSurfaceToModel(this.currentModel, this.stateStore);
  }

  applyFresnelToModel(root) {
    if (!root) return;
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((mat) => this.applyFresnelToMaterial(mat));
    });
    // Fresnel repatch sets needsUpdate and can reset clay roughness/metalness on recompile.
    if (this.currentShading === 'clay') {
      this._restoreClayMaterialSurfaces();
    }
    if (this.shadowTintStrength > 0) {
      this.applyShadowTintToObject(root);
    }
  }

  setShadowTintSettings({ color, strength, opacity } = {}) {
    if (color !== undefined) {
      this.shadowTintColor = color;
    }
    if (strength !== undefined) {
      this.shadowTintStrength = Math.min(1, Math.max(0, Number(strength) || 0));
    }
    if (opacity !== undefined) {
      const o = Number(opacity);
      this.shadowTintOpacity = Number.isFinite(o)
        ? Math.min(1, Math.max(0, o))
        : DEFAULT_SHADOW_OPACITY;
    }
    if (this.currentModel) {
      this.applyShadowTintToObject(this.currentModel);
    }
  }

  applyShadowTintToObject(object, options = {}) {
    const color = options.color ?? this.shadowTintColor ?? '#080808';
    const strength =
      options.strength !== undefined ? options.strength : this.shadowTintStrength;
    const opacity =
      options.opacity !== undefined ? options.opacity : this.shadowTintOpacity;
    patchShadowTintOnObject(object, {
      color,
      strength,
      opacity,
      includeStudioBackdrop: options.includeStudioBackdrop,
    });
    this._syncCreativeLookShadowTint();
  }

  clearShadowTintFromObject(object) {
    patchClearShadowTintFromObject(object);
  }

  /** Transient clay material on a mesh (not the imported original). */
  _isClayMesh(child) {
    if (!child?.isMesh || !child.material) return false;
    const original = this.originalMaterials.get(child);
    const material = child.material;
    if (!original) return false;
    return (
      material !== original &&
      (!Array.isArray(material) ||
        !Array.isArray(original) ||
        material.length !== original.length ||
        !material.every((mat, idx) => mat === original[idx]))
    );
  }

  /**
   * Sync clay roughness, metalness, and tint from sliders. Returns true if anything changed.
   * @param {THREE.Material} mat
   */
  _syncClayMaterialSurface(mat) {
    if (!mat || (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial)) {
      return false;
    }
    let dirty = false;
    const targetRoughness = this.materialSettings.roughness;
    const targetMetalness = this.materialSettings.metalness;
    const tintedClayColor = this.getClayColorWithBrightness();
    if (mat.roughness === 0 || Math.abs(mat.roughness - targetRoughness) > 0.01) {
      mat.roughness = targetRoughness;
      dirty = true;
    }
    if (mat.metalness === 0 || Math.abs(mat.metalness - targetMetalness) > 0.01) {
      mat.metalness = targetMetalness;
      dirty = true;
    }
    if (!mat.color.equals(tintedClayColor)) {
      mat.color.copy(tintedClayColor);
      dirty = true;
    }
    const tSub = this._isSubsurfaceActive() ? this._subsurfaceTranslucency() : 0;
    if (tSub > SUBSURFACE_EPS && mat.isMeshPhysicalMaterial) {
      delete mat.userData.orbySubsurface;
      this._applySubsurfacePhysicalParams(mat, tSub);
      dirty = true;
    }
    return dirty;
  }

  /**
   * Re-apply clay PBR surface after env-map assignment or Fresnel shader work.
   * Event-driven only — not called from the render loop.
   */
  _restoreClayMaterialSurfaces() {
    if (this.currentShading !== 'clay' || !this.claySettings || !this.currentModel) {
      return;
    }
    this.currentModel.traverse((child) => {
      if (!this._isClayMesh(child)) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((mat) => {
        if (this._syncClayMaterialSurface(mat)) {
          mat.needsUpdate = true;
        }
      });
    });
  }

  applyFresnelToMaterial(material) {
    const settings = this.fresnelSettings || {};
    const needsFresnel =
      settings.enabled &&
      settings.strength > 0.0001 &&
      material &&
      (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial);

    if (!needsFresnel) {
      if (material?.userData?.fresnelPatched) {
        const svgPreset = material.userData.svgExtrudeSurfacePresetId ?? 'none';
        const svgScale = material.userData.svgExtrudeProceduralScale;
        const svgStrength = material.userData.svgExtrudeSurfaceStrength;
        const hadSvg = !!material.userData.svgExtrudeProceduralPatched;
        const base = resolveFresnelBaseOnBeforeCompile(material);
        const shadowHook = material.userData.shadowTintOnBeforeCompile;
        const hadShadowTint = !!material.userData.shadowTintPatched;
        if (hadSvg) {
          removeSvgExtrudeProceduralFromMaterial(material);
        }
        if (hadShadowTint && typeof shadowHook === 'function') {
          material.onBeforeCompile = shadowHook;
          if (material.userData.orbyShadowTint) {
            material.userData.orbyShadowTint.previousOnBeforeCompile =
              typeof base === 'function' ? base : (() => {});
          }
        } else {
          material.onBeforeCompile = typeof base === 'function' ? base : (() => {});
        }
        delete material.userData.originalOnBeforeCompile;
        delete material.userData.fresnelPatched;
        delete material.userData.fresnelUniforms;
        delete material.userData.fresnelOnBeforeCompile;
        if (hadSvg && getSvgExtrudeSurfacePresetConfig(svgPreset).kind !== 'none') {
          applySvgExtrudeSurfaceToMaterial(material, {
            preset: svgPreset,
            scale: svgScale ?? 1,
            strength: svgStrength,
            normalBounds: material.userData?.svgExtrudeNormalBounds ?? null,
          });
        } else {
          material.needsUpdate = true;
        }
      }
      return;
    }

    // Always re-patch if material was replaced or uniforms are missing
    // This ensures Fresnel works even after material updates/recompilations
    if (material.userData.fresnelPatched) {
      if (isOrbyShaderPatchHook(material.userData.originalOnBeforeCompile)) {
        material.userData.originalOnBeforeCompile = resolveFresnelBaseOnBeforeCompile(material);
        delete material.userData.fresnelPatched;
        delete material.userData.fresnelOnBeforeCompile;
      }
    }
    if (material.userData.fresnelPatched) {
      const uniforms = material.userData.fresnelUniforms;
      // If uniforms exist and are valid, just update values (no recompilation needed)
      if (uniforms && uniforms.color && uniforms.color.value !== undefined) {
        setFresnelColorUniform(uniforms.color, settings.color);
        uniforms.strength.value = settings.strength || 0.5;
        // Invert radius: low radius (0.5) = high power (5.0) = narrow, high radius (5.0) = low power (0.5) = wide
        const radius = settings.radius || 2.0;
        uniforms.power.value = Math.max(0.1, 5.5 - radius);
        // Ensure onBeforeCompile hook is still set (in case material was recompiled elsewhere)
        if (!material.userData.fresnelOnBeforeCompile) {
          // Stored hook ref lost but uniforms lingered: restore the base hook, drop stale uniform
          // refs, and full repatch below. Never delete originalOnBeforeCompile here — if we do, the
          // next patch can treat the old Fresnel closure as "original", call it from the new hook,
          // and double-inject GLSL (duplicate uniforms → shader compile failure, Fresnel "dies").
          const base = resolveFresnelBaseOnBeforeCompile(material);
          material.userData.originalOnBeforeCompile = base;
          material.onBeforeCompile = base;
          delete material.userData.fresnelPatched;
          delete material.userData.fresnelUniforms;
        } else if (!material.onBeforeCompile || material.onBeforeCompile !== material.userData.fresnelOnBeforeCompile) {
          if (material.userData?.svgExtrudeProceduralPatched) {
            if (ensureSvgExtrudeFresnelChain(material)) {
              return;
            }
            if (!isFresnelLinkedInSvgSurfaceChain(material)) {
              const preset = material.userData.svgExtrudeSurfacePresetId ?? 'none';
              const scale = material.userData.svgExtrudeProceduralScale ?? 1;
              const strength = material.userData.svgExtrudeSurfaceStrength;
              removeSvgExtrudeProceduralFromMaterial(material);
              if (getSvgExtrudeSurfacePresetConfig(preset).kind !== 'none') {
                applySvgExtrudeSurfaceToMaterial(material, {
                  preset,
                  scale,
                  strength,
                  normalBounds: material.userData?.svgExtrudeNormalBounds ?? null,
                });
              }
            }
            if (needsFresnelShaderRecompile(material)) {
              markFresnelShaderInjectCurrent(material);
              material.needsUpdate = true;
            }
            return;
          }
          material.onBeforeCompile = material.userData.fresnelOnBeforeCompile;
          material.needsUpdate = true;
          return;
        } else if (material.userData?.svgExtrudeProceduralPatched) {
          if (ensureSvgExtrudeFresnelChain(material)) {
            return;
          }
          if (needsFresnelShaderRecompile(material)) {
            markFresnelShaderInjectCurrent(material);
            material.needsUpdate = true;
          }
          return;
        } else if (needsFresnelShaderRecompile(material)) {
          markFresnelShaderInjectCurrent(material);
          material.needsUpdate = true;
          return;
        } else {
          return;
        }
      } else {
        // Uniform bag broken: restore base compile hook before full repatch
        const savedOriginal = material.userData.originalOnBeforeCompile;
        material.onBeforeCompile = typeof savedOriginal === 'function' ? savedOriginal : (() => {});
        delete material.userData.fresnelPatched;
        delete material.userData.fresnelUniforms;
        delete material.userData.fresnelOnBeforeCompile;
        delete material.userData.originalOnBeforeCompile;
      }
    }

    // Create new patch - this handles both new materials and re-patching
    const svgPatched = !!material.userData?.svgExtrudeProceduralPatched;
    const svgHook = material.userData?.svgExtrudeProceduralOnBeforeCompile;
    let original = material.userData.originalOnBeforeCompile;
    if (typeof original !== 'function' || isOrbyShaderPatchHook(original)) {
      if (svgPatched) {
        const chainBase = material.userData.svgExtrudeProceduralPrevious;
        if (typeof chainBase === 'function' && !chainBase.__orbyFresnelShaderPatch) {
          original = chainBase;
        } else {
          original = resolveFresnelBaseOnBeforeCompile(material);
        }
      } else {
        original = resolveFresnelBaseOnBeforeCompile(material);
      }
      material.userData.originalOnBeforeCompile = original;
    }

    // Create uniforms that will be stored and reused
    // Invert radius: low radius (0.5) = high power (5.0) = narrow, high radius (5.0) = low power (0.5) = wide
    const radius = settings.radius || 2.0;
    const invertedPower = Math.max(0.1, 5.5 - radius);
    const uniforms = material.userData.fresnelUniforms || {
      color: { value: new THREE.Color(settings.color || '#ffffff') },
      strength: { value: settings.strength || 0.5 },
      power: { value: invertedPower },
    };
    setFresnelColorUniform(uniforms.color, settings.color);
    uniforms.strength.value = settings.strength || 0.5;
    uniforms.power.value = invertedPower;

    // Store uniforms before patching so they're available even if shader recompiles
    material.userData.fresnelUniforms = uniforms;

    const fresnelOnBeforeCompile = (shader) => {
      original?.(shader);

      // Use stored uniforms or create new ones if missing (defensive)
      const fresnelUniforms = material.userData.fresnelUniforms || uniforms;

      shader.uniforms.fresnelColor = fresnelUniforms.color;
      shader.uniforms.fresnelStrength = fresnelUniforms.strength;
      shader.uniforms.fresnelPower = fresnelUniforms.power;

      injectFresnelFragmentShader(shader);

      // Ensure uniforms are stored after shader compilation
      material.userData.fresnelUniforms = fresnelUniforms;
    };
    fresnelOnBeforeCompile.__orbyFresnelShaderPatch = true;

    material.userData.fresnelOnBeforeCompile = fresnelOnBeforeCompile;
    material.userData.fresnelPatched = true;
    if (svgPatched && typeof svgHook === 'function') {
      material.userData.svgExtrudeProceduralPrevious = fresnelOnBeforeCompile;
      material.onBeforeCompile = svgHook;
    } else {
      material.onBeforeCompile = fresnelOnBeforeCompile;
    }
    markFresnelShaderInjectCurrent(material);
    if (material.userData?.svgExtrudeProceduralPatched) {
      syncSvgExtrudeSurfaceProgramCacheKey(material);
    }
    material.needsUpdate = true;
  }

  updateMaterialsEnvironment(envTexture, intensity, hdriBlurriness = 0) {
    if (!this.currentModel) return;
    this._lastEnvTexture = envTexture ?? null;
    this._lastEnvIntensity = intensity;
    this._lastHdriBlurriness = hdriBlurriness;

    // If we're in textures/unlit mode, skip - MeshBasicMaterial doesn't use environment maps
    if (this.currentShading === 'textures') {
      return;
    }

    // Clay: env map only; surface props restored after Fresnel (or immediately if Fresnel off).
    if (this.currentShading === 'clay') {
      const litEnvMul = materialBrightnessLitEnvMultiplier(
        this.materialSettings.brightness,
      );
      this.currentModel.traverse((child) => {
        if (!this._isClayMesh(child)) return;
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => {
          if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) {
            return;
          }
          const envChanged = material.envMap !== envTexture;
          const nextIntensity = intensity * litEnvMul;
          const intChanged =
            material.envMapIntensity !== undefined &&
            material.envMapIntensity !== nextIntensity;
          material.envMap = envTexture;
          if (material.envMapIntensity !== undefined) {
            material.envMapIntensity = nextIntensity;
          }
          if (envChanged || intChanged) {
            material.needsUpdate = true;
          }
        });
      });

      if (this.fresnelSettings?.enabled) {
        this.applyFresnelToModel(this.currentModel);
      } else {
        this._restoreClayMaterialSurfaces();
      }
      this.reapplySvgExtrudeSurfaceShaders();
      return;
    }

    // For non-clay materials, only sync environment map/intensity.
    // Keep user-authored material surface values (metalness/roughness) intact while editing HDRI.
    const state = this.stateStore?.getState();
    const rawGlassRef = state?.advanced?.glassReflection;
    const glassEnvMul = Number.isFinite(Number(rawGlassRef))
      ? Math.min(4, Math.max(0, Number(rawGlassRef)))
      : 2;
    const litEnvMul = materialBrightnessLitEnvMultiplier(
      this.materialSettings.brightness,
    );
    
    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material) return;

        if (material.userData?.orbyCreativeLook === 'chrome') {
          if (!material.isMeshPhysicalMaterial) return;
          material.envMap = envTexture;
          if (material.envMapIntensity !== undefined) {
            material.envMapIntensity = intensity;
          }
          material.metalness = 1.0;
          material.color.setHex(CREATIVE_CHROME_BASE_HEX);
          const ps = Number(state?.creativeLook?.patternScale);
          const patternScale = Number.isFinite(ps)
            ? THREE.MathUtils.clamp(ps, 0.02, 5)
            : 1;
          material.roughness = creativeChromeRoughness(
            patternScale,
            hdriBlurriness,
          );
          material.needsUpdate = true;
          return;
        }

        if (material.userData?.orbyCreativeLook === 'glass') {
          if (!material.isMeshPhysicalMaterial) return;
          material.envMap = envTexture;
          material.transmission = 1;
          if (material.envMapIntensity !== undefined) {
            material.envMapIntensity =
              intensity * litEnvMul * CREATIVE_GLASS_ENV_MAP_MUL;
          }
          const ps = Number(state?.creativeLook?.patternScale);
          const patternScale = Number.isFinite(ps)
            ? THREE.MathUtils.clamp(ps, 0.02, 5)
            : 1;
          const { thickness, roughness } = creativeGlassParamsForMesh(
            patternScale,
            hdriBlurriness,
            child,
          );
          material.thickness = thickness;
          material.roughness = roughness;
          material.transparent = true;
          material.opacity = 1;
          material.depthWrite = false;
          if (this._isFontExtrudeModel()) {
            material.side = THREE.DoubleSide;
          }
          material.needsUpdate = true;
          return;
        }

        if (
          material.isMeshStandardMaterial ||
          material.isMeshPhysicalMaterial ||
          material.isMeshLambertMaterial ||
          material.isMeshPhongMaterial
        ) {
          const importGltfGlass =
            material.userData?.orbyGltfTransmissionFallback === true ||
            this._materialHadImportTransmission(material) ||
            this._materialHasImportTransmission(material);
          const usesTransmission =
            !importGltfGlass &&
            material.isMeshPhysicalMaterial &&
            (Number(material.transmission) > 1e-4 || !!material.transmissionMap);

          if (
            importGltfGlass &&
            !this._shaderLabBypassesGlassPresentation() &&
            (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)
          ) {
            const active =
              this._assignImportGltfGlassPresentation(
                this.currentModel,
                material,
                this._glassPresentationFromState(),
              ) || material;
            active.envMap = envTexture;
            if (active.envMapIntensity !== undefined) {
              active.envMapIntensity = intensity * glassEnvMul;
            }
            active.needsUpdate = true;
            return;
          }

          const envChanged = material.envMap !== envTexture;
          material.envMap = envTexture;
          if (material.envMapIntensity !== undefined) {
            const glassBoost = this.isWindowMesh(child) || importGltfGlass || usesTransmission;
            const userSubsurface = material.userData?.orbySubsurface === true;
            let envMul = intensity * litEnvMul;
            if (glassBoost) {
              if (userSubsurface) {
                // Full glass multiplier on curved organic meshes reads as chrome; keep env reflections subtle.
                envMul = intensity * Math.min(1.52, 1.08 + glassEnvMul * 0.2);
              } else {
                envMul = intensity * glassEnvMul;
              }
            }
            const intChanged = material.envMapIntensity !== envMul;
            material.envMapIntensity = envMul;
            if (!envChanged && !intChanged) {
              return;
            }
          } else if (!envChanged) {
            return;
          }

          if (usesTransmission) {
            material.needsUpdate = true;
            return;
          }

          const isGlass = material.userData?.isGlass || this.isWindowMesh(child);
          if (
            isGlass &&
            (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)
          ) {
            material.metalness = 0.0;
            if (material.transparent) {
              material.depthWrite = false;
            }
          }

          material.needsUpdate = true;
        }
      });
    });

    if (this.fresnelSettings?.enabled) {
      this.applyFresnelToModel(this.currentModel);
    }
    this.reapplySvgExtrudeSurfaceShaders();
  }

  /**
   * Dispose textures loaded via Object panel → Map Slots (FBX). Safe before model teardown.
   * @param {THREE.Object3D} [object]
   */
  disposeFbxUserTextures(object) {
    const root = object ?? this.currentModel;
    if (!root) return;
    const seenUuids = new Set();
    const disposeTex = (t) => {
      if (!t?.isTexture || !t.userData?.orbyFbxUserTexture) return;
      if (seenUuids.has(t.uuid)) return;
      seenUuids.add(t.uuid);
      const url = t.userData.orbyFbxBlobUrl;
      t.dispose();
      if (typeof url === 'string') URL.revokeObjectURL(url);
    };
    root.traverse((child) => {
      if (!child.isMesh) return;
      const walk = (m) => {
        if (!m) return;
        disposeTex(m.map);
        disposeTex(m.normalMap);
        disposeTex(m.roughnessMap);
        disposeTex(m.metalnessMap);
        disposeTex(m.aoMap);
        disposeTex(m.displacementMap);
        disposeTex(m.emissiveMap);
        disposeTex(m.alphaMap);
      };
      const stored = this.originalMaterials.get(child);
      const mats = stored
        ? Array.isArray(stored)
          ? stored
          : [stored]
        : [];
      mats.forEach(walk);
    });
  }

  /**
   * @param {string} slot - albedo | normal | orm | roughness | metallic | occlusion | displacement | emissive | opacity
   * @param {THREE.Texture} texture
   */
  /** Reapply per-material Map Slots tuning (normals, UV channels, ORM packing). */
  applyFbxMapSlotsTuningFromState() {
    if (!this.currentModel) return;
    const fbxState = this.stateStore?.getState()?.fbxMapSlots;

    this.currentModel.traverse((child) => {
      if (!child.isMesh || this.isWindowMesh(child)) return;
      const orig = this.originalMaterials.get(child);
      if (!orig) return;
      const mats = Array.isArray(orig) ? orig : [orig];
      for (const m of mats) {
        if (!m) continue;
        const tuning = getFbxTuningForImportMaterial(m, fbxState);
        const detailCh = tuning.pbrUvChannel === 1 ? 1 : 0;

        if (m.map?.isTexture) m.map.channel = 0;
        if (m.normalMap?.isTexture) {
          m.normalMap.channel = 0;
          this._syncFbxNormalMapOrientation(m);
          this._syncFbxNormalScaleY(m);
        }
        if (detailCh === 1) this._ensureUv2ForAo(child.geometry);

        const setCh = (tex) => {
          if (tex?.isTexture) tex.channel = detailCh;
        };
        setCh(m.roughnessMap);
        setCh(m.metalnessMap);
        setCh(m.aoMap);
        setCh(m.emissiveMap);
        setCh(m.alphaMap);
        setCh(m.displacementMap);

        syncFbxOrmPackingOnMaterial(m, tuning.ormPacking);
        m.needsUpdate = true;
      }
    });

    const mode = this.currentShading ?? this.stateStore?.getState()?.shading ?? 'shaded';
    this.setShading(mode);
  }

  _syncFbxNormalScaleY(material) {
    if (!material?.normalMap) return;
    const tuning = getFbxTuningForImportMaterial(
      material,
      this.stateStore?.getState()?.fbxMapSlots,
    );
    const scaleY = resolveFbxNormalScaleY(tuning.normalConvention);
    const ax = Math.abs(Number(material.normalScale?.x) || 1) || 1;
    const ay = Math.abs(Number(material.normalScale?.y) || 1) || 1;
    if (!material.normalScale) {
      material.normalScale = new THREE.Vector2(ax, scaleY < 0 ? -ay : ay);
    } else {
      material.normalScale.set(ax, scaleY < 0 ? -ay : ay);
    }
    material.needsUpdate = true;
  }

  /**
   * @param {string} slot
   * @param {import('three').Texture} texture
   * @param {{ materialKey?: string | null, fileName?: string }} [options]
   */
  applyFbxSlotTexture(slot, texture, options = {}) {
    if (!this.currentModel || !texture) return;
    const materialKey = options.materialKey || null;
    const fileName = options.fileName || '';

    const allowed = new Set([
      'albedo',
      'normal',
      'orm',
      'roughness',
      'metallic',
      'occlusion',
      'displacement',
      'emissive',
      'opacity',
    ]);
    if (!allowed.has(slot)) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh || this.isWindowMesh(child)) return;
      let orig = this.originalMaterials.get(child);
      if (!orig) return;

      const assignOne = (mat, geom) => {
        if (!materialMatchesFbxGroup(mat, materialKey)) return mat;
        const m = this._ensureStandardForFbxSlot(mat);
        m.userData.orbyFbxSlotMaps = true;
        if (fileName) {
          m.userData.orbyFbxSlotFileNames = {
            ...(m.userData.orbyFbxSlotFileNames || {}),
            [slot]: fileName,
          };
        }
        this._disposePreviousFbxSlotTexture(m, slot);
        const texForMat = texture.clone();
        texForMat.userData.orbyFbxUserTexture = true;
        if (fileName) {
          texForMat.userData.orbyFbxFileName = fileName;
        }
        if (texture.userData?.orbyFbxBlobUrl) {
          texForMat.userData.orbyFbxBlobUrl = texture.userData.orbyFbxBlobUrl;
        }
        if (
          this._getPbrUvChannelIndex(m) === 1 &&
          slot !== 'normal' &&
          slot !== 'albedo'
        ) {
          this._ensureUv2ForAo(geom);
        }
        this._configureFbxTexture(texForMat, slot, m);
        this._assignTextureToMaterialSlot(m, slot, texForMat, geom);
        this._refreshAllFbxSlotTransformsForMaterial(m);
        const tuning = getFbxTuningForImportMaterial(m, this.stateStore?.getState()?.fbxMapSlots);
        syncFbxOrmPackingOnMaterial(m, tuning.ormPacking);
        m.needsUpdate = true;
        return m;
      };

      if (Array.isArray(orig)) {
        for (let i = 0; i < orig.length; i += 1) {
          const next = assignOne(orig[i], child.geometry);
          if (next !== orig[i]) orig[i] = next;
        }
      } else {
        const next = assignOne(orig, child.geometry);
        if (next !== orig) {
          this.originalMaterials.set(child, next);
        }
      }
    });

    if (slot === 'normal') {
      this._ensureTangentsForNormalMapping(this.currentModel);
    }

    this._reapplyFbxUserTextureColorSpaces(this.currentModel);
    this.applyTransparencyPipeline(this.currentModel);
    const mode = this.currentShading ?? this.stateStore?.getState()?.shading ?? 'shaded';
    this.setShading(mode);
  }

  /**
   * Remove a user-assigned Map Slot texture from mesh materials.
   * @param {string} slot - albedo | normal | orm | roughness | metallic | occlusion | displacement | emissive | opacity
   * @param {{ materialKey?: string | null }} [options]
   */
  clearFbxSlotTexture(slot, options = {}) {
    if (!this.currentModel) return;
    const materialKey = options.materialKey || null;

    const allowed = new Set([
      'albedo',
      'normal',
      'orm',
      'roughness',
      'metallic',
      'occlusion',
      'displacement',
      'emissive',
      'opacity',
    ]);
    if (!allowed.has(slot)) return;

    this.currentModel.traverse((child) => {
      if (!child.isMesh || this.isWindowMesh(child)) return;
      const orig = this.originalMaterials.get(child);
      if (!orig) return;

      const clearOne = (mat) => {
        if (!materialMatchesFbxGroup(mat, materialKey)) return;
        this._disposePreviousFbxSlotTexture(mat, slot);
        this._clearTextureFromMaterialSlot(mat, slot);
        if (mat.userData?.orbyFbxSlotFileNames) {
          const next = { ...mat.userData.orbyFbxSlotFileNames };
          delete next[slot];
          mat.userData.orbyFbxSlotFileNames = next;
        }
        this._refreshAllFbxSlotTransformsForMaterial(mat);
        mat.needsUpdate = true;
      };

      if (Array.isArray(orig)) {
        for (const m of orig) clearOne(m);
      } else {
        clearOne(orig);
      }
    });

    const mode = this.currentShading ?? this.stateStore?.getState()?.shading ?? 'shaded';
    this.setShading(mode);
    this.applyTransparencyPipeline(this.currentModel);
  }

  /**
   * @param {THREE.Material} material
   * @param {string} slot
   */
  _clearTextureFromMaterialSlot(material, slot) {
    if (slot === 'albedo') {
      if (material.map?.userData?.orbyFbxUserTexture) material.map = null;
      return;
    }
    if (slot === 'normal') {
      if (material.normalMap?.userData?.orbyFbxUserTexture) material.normalMap = null;
      return;
    }
    if (slot === 'roughness') {
      if (material.roughnessMap?.userData?.orbyFbxUserTexture) material.roughnessMap = null;
      return;
    }
    if (slot === 'metallic') {
      if (material.metalnessMap?.userData?.orbyFbxUserTexture) material.metalnessMap = null;
      return;
    }
    if (slot === 'occlusion') {
      if (material.aoMap?.userData?.orbyFbxUserTexture) material.aoMap = null;
      return;
    }
    if (slot === 'displacement') {
      if (material.displacementMap?.userData?.orbyFbxUserTexture) material.displacementMap = null;
      return;
    }
    if (slot === 'orm') {
      for (const key of ['aoMap', 'roughnessMap', 'metalnessMap']) {
        if (material[key]?.userData?.orbyFbxUserTexture) material[key] = null;
      }
      return;
    }
    if (slot === 'emissive') {
      if (material.emissiveMap?.userData?.orbyFbxUserTexture) material.emissiveMap = null;
      return;
    }
    if (slot === 'opacity') {
      if (material.alphaMap?.userData?.orbyFbxUserTexture) material.alphaMap = null;
    }
  }

  _disposePreviousFbxSlotTexture(material, slot) {
    if (slot === 'orm') {
      const seen = new Set();
      for (const mapKey of ['aoMap', 'roughnessMap', 'metalnessMap']) {
        const prev = material[mapKey];
        if (!prev?.isTexture || !prev.userData?.orbyFbxUserTexture || seen.has(prev.uuid)) continue;
        seen.add(prev.uuid);
        const url = prev.userData.orbyFbxBlobUrl;
        prev.dispose();
        if (typeof url === 'string') URL.revokeObjectURL(url);
      }
      return;
    }
    const key =
      slot === 'albedo'
        ? 'map'
        : slot === 'normal'
          ? 'normalMap'
          : slot === 'roughness'
            ? 'roughnessMap'
            : slot === 'metallic'
              ? 'metalnessMap'
              : slot === 'occlusion'
                ? 'aoMap'
                : slot === 'displacement'
                  ? 'displacementMap'
                  : slot === 'emissive'
                    ? 'emissiveMap'
                    : slot === 'opacity'
                      ? 'alphaMap'
                      : null;
    if (!key) return;
    const prev = material[key];
    if (!prev?.isTexture || !prev.userData?.orbyFbxUserTexture) return;
    // Packed ORM uses one texture on ao + roughness + metalness — don't dispose when another slot still references it.
    const ormKeys = ['aoMap', 'roughnessMap', 'metalnessMap'];
    if (ormKeys.includes(key)) {
      const refCount = ormKeys.reduce((n, k) => (material[k] === prev ? n + 1 : n), 0);
      if (refCount > 1) return;
    }
    const url = prev.userData.orbyFbxBlobUrl;
    prev.dispose();
    if (typeof url === 'string') URL.revokeObjectURL(url);
  }

  /** Three.js `Texture.channel`: 0 = `uv`, 1 = `uv2`. Base color stays on UV1; detail maps can target UV2. */
  _getPbrUvChannelIndex(material) {
    const tuning = getFbxTuningForImportMaterial(
      material,
      this.stateStore?.getState()?.fbxMapSlots,
    );
    return tuning.pbrUvChannel === 1 ? 1 : 0;
  }

  /**
   * Normal maps must use `channel` 0: MeshStandardMaterial tangents are built from `attributes.uv` only.
   * Sampling normals on `uv2` without matching tangents yields flat/broken lighting (Three limitation).
   */
  _getDetailTextureChannelForSlot(slot, material) {
    if (slot === 'normal' || slot === 'albedo') return 0;
    return this._getPbrUvChannelIndex(material);
  }

  _setTextureUvChannelForSlot(texture, slot, material) {
    if (!texture || !('channel' in texture)) return;
    texture.channel = this._getDetailTextureChannelForSlot(slot, material);
  }

  _fbxSlotUsesSrgbColorSpace(slot) {
    return slot === 'albedo' || slot === 'emissive';
  }

  _applyFbxSlotTextureColorSpace(texture, slot) {
    if (!texture || !('colorSpace' in texture)) return;
    if (this._fbxSlotUsesSrgbColorSpace(slot)) {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (THREE.NoColorSpace) {
      // Normal / roughness / metallic / AO / ORM / displacement / opacity are data — not color.
      texture.colorSpace = THREE.NoColorSpace;
    }
    texture.needsUpdate = true;
  }

  _resetFbxUserTextureUvTransform(texture) {
    if (!texture?.isTexture) return;
    texture.offset.set(0, 0);
    texture.repeat.set(1, 1);
    texture.rotation = 0;
    texture.center.set(0.5, 0.5);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }

  _configureFbxTexture(texture, slot, material) {
    texture.userData.orbyFbxUserTexture = true;
    this._resetFbxUserTextureUvTransform(texture);
    this._applyFbxSlotTextureColorSpace(texture, slot);
    this._setTextureUvChannelForSlot(texture, slot, material);
  }

  /** Re-apply color space on every user Map Slot texture (fixes textures loaded before configure). */
  _reapplyFbxUserTextureColorSpaces(root) {
    if (!root) return;
    const slotMap = [
      ['map', 'albedo'],
      ['normalMap', 'normal'],
      ['roughnessMap', 'roughness'],
      ['metalnessMap', 'metallic'],
      ['aoMap', 'occlusion'],
      ['emissiveMap', 'emissive'],
      ['alphaMap', 'opacity'],
      ['displacementMap', 'displacement'],
    ];
    this._forEachImportMaterial(root, (material) => {
      for (const [prop, slot] of slotMap) {
        const tex = material[prop];
        if (!tex?.isTexture || !tex.userData?.orbyFbxUserTexture) continue;
        this._applyFbxSlotTextureColorSpace(tex, slot);
      }
      const ormTex = material.aoMap;
      if (
        ormTex?.isTexture &&
        ormTex.userData?.orbyFbxUserTexture &&
        material.roughnessMap === ormTex &&
        material.metalnessMap === ormTex
      ) {
        this._applyFbxSlotTextureColorSpace(ormTex, 'orm');
      }
      this._syncFbxNormalMapOrientation(material);
      const tuning = getFbxTuningForImportMaterial(material, this.stateStore?.getState()?.fbxMapSlots);
      syncFbxOrmPackingOnMaterial(material, tuning.ormPacking);
    });
  }

  _syncFbxNormalMapOrientation(material) {
    const nm = material?.normalMap;
    if (!nm?.isTexture || !nm.userData?.orbyFbxUserTexture) return;
    const tuning = getFbxTuningForImportMaterial(
      material,
      this.stateStore?.getState()?.fbxMapSlots,
    );
    nm.flipY = resolveFbxNormalFlipY(material, tuning.normalConvention);
    nm.needsUpdate = true;
  }

  _ensureUv2ForAo(geometry) {
    if (!geometry?.attributes?.uv) return;
    if (geometry.attributes.uv2) return;
    geometry.setAttribute('uv2', geometry.attributes.uv.clone());
  }

  _ensureStandardForFbxSlot(material) {
    if (!material) return material;
    if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) return material;

    const std = new THREE.MeshStandardMaterial();

    if (material.color) std.color.copy(material.color);
    this._whiteBalanceFbxTexturedDiffuse(std);
    if (material.map) std.map = material.map;
    if (material.lightMap) std.lightMap = material.lightMap;
    if (material.lightMapIntensity !== undefined) std.lightMapIntensity = material.lightMapIntensity;
    if (material.aoMap) std.aoMap = material.aoMap;
    if (material.aoMapIntensity !== undefined) std.aoMapIntensity = material.aoMapIntensity;
    if (material.bumpMap) std.bumpMap = material.bumpMap;
    if (material.bumpScale !== undefined) std.bumpScale = material.bumpScale;
    if (material.normalMap) std.normalMap = material.normalMap;
    if (material.normalMapType !== undefined) std.normalMapType = material.normalMapType;
    if (material.normalScale) std.normalScale = material.normalScale.clone();
    if (material.displacementMap) std.displacementMap = material.displacementMap;
    if (material.displacementScale !== undefined) std.displacementScale = material.displacementScale;
    if (material.displacementBias !== undefined) std.displacementBias = material.displacementBias;
    if (material.emissive) std.emissive.copy(material.emissive);
    if (material.emissiveMap) std.emissiveMap = material.emissiveMap;
    if (material.emissiveIntensity !== undefined) std.emissiveIntensity = material.emissiveIntensity;
    if (material.alphaMap) std.alphaMap = material.alphaMap;
    if (material.envMap) std.envMap = material.envMap;
    if (material.envMapIntensity !== undefined) std.envMapIntensity = material.envMapIntensity;

    std.transparent = !!material.transparent;
    std.opacity = Number.isFinite(material.opacity) ? material.opacity : 1;
    std.side = material.side ?? THREE.FrontSide;
    std.depthWrite = material.depthWrite !== false;
    std.depthTest = material.depthTest !== false;

    if (material.isMeshPhongMaterial && Number.isFinite(material.shininess)) {
      const s = Math.max(0, Math.min(100, material.shininess));
      std.roughness = Math.min(1, Math.sqrt(1 - s / 100));
    } else {
      std.roughness = 0.85;
    }
    std.metalness = 0;

    material.dispose?.();
    return std;
  }

  /**
   * Prefer user-assigned Map Slot textures, then embedded FBX maps (often carry correct tiling).
   * Excludes `excludeTexture` when picking (e.g. the texture just assigned).
   */
  _pickUvReferenceTexture(material, excludeTexture) {
    const keys = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'aoMap',
      'emissiveMap',
      'alphaMap',
      'displacementMap',
    ];
    for (const key of keys) {
      const t = material[key];
      if (
        t?.isTexture &&
        t !== excludeTexture &&
        t.userData?.orbyFbxUserTexture
      ) {
        return t;
      }
    }
    for (const key of keys) {
      const t = material[key];
      if (t?.isTexture && t !== excludeTexture) return t;
    }
    return null;
  }

  _copyUvTransform(fromTex, toTex) {
    if (!fromTex?.isTexture || !toTex?.isTexture || fromTex === toTex) return;
    toTex.offset.copy(fromTex.offset);
    toTex.repeat.copy(fromTex.repeat);
    toTex.rotation = fromTex.rotation;
    toTex.center.copy(fromTex.center);
    toTex.wrapS = fromTex.wrapS;
    toTex.wrapT = fromTex.wrapT;
    toTex.needsUpdate = true;
  }

  /**
   * FBXLoader applies UV offset/repeat/rotation/wrap to embedded textures. Manual slots default to repeat (1,1).
   * Align every user slot texture to one reference so roughness/metal match diffuse UVs even when map was assigned last.
   */
  _refreshAllFbxSlotTransformsForMaterial(material) {
    const ref = this._pickUvReferenceTexture(material, null);
    if (!ref?.isTexture) {
      this._resetAllUserFbxSlotTextureTransforms(material);
      this._syncFbxNormalMapOrientation(material);
      return;
    }
    const seen = new Set([ref.uuid]);
    const slotKeys = [
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'aoMap',
      'emissiveMap',
      'alphaMap',
      'displacementMap',
    ];
    for (const key of slotKeys) {
      const t = material[key];
      if (!t?.isTexture || seen.has(t.uuid)) continue;
      if (t.userData?.orbyFbxUserTexture) {
        this._copyUvTransform(ref, t);
      } else if (!ref.userData?.orbyFbxUserTexture) {
        this._copyUvTransform(ref, t);
      }
      seen.add(t.uuid);
    }
    this._syncFbxNormalMapOrientation(material);
  }

  _resetAllUserFbxSlotTextureTransforms(material) {
    const keys = [
      'map',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'aoMap',
      'emissiveMap',
      'alphaMap',
      'displacementMap',
    ];
    for (const key of keys) {
      const t = material[key];
      if (t?.isTexture && t.userData?.orbyFbxUserTexture) {
        this._resetFbxUserTextureUvTransform(t);
      }
    }
  }

  /**
   * FBX exports are sometimes non-indexed; computeTangents requires an index buffer.
   * @returns {THREE.BufferGeometry}
   */
  _ensureIndexedGeometryForTangents(geom, root) {
    if (!geom || geom.index) return geom;
    try {
      const merged = mergeVertices(geom);
      if (!merged?.index) return geom;
      if (merged !== geom) {
        root?.traverse?.((m) => {
          if (m.isMesh && m.geometry === geom) m.geometry = merged;
        });
      }
      return merged;
    } catch (_) {
      return geom;
    }
  }

  /** Tangents must match UVs for correct normal mapping; some FBX meshes ship without usable tangents. */
  _ensureTangentsForNormalMapping(root) {
    const prepared = new WeakSet();
    root?.traverse?.((child) => {
      if (!child.isMesh || !child.geometry) return;
      let geom = child.geometry;
      if (prepared.has(geom)) return;
      if (
        !geom.attributes?.position ||
        !geom.attributes?.normal ||
        !geom.attributes?.uv ||
        typeof geom.computeTangents !== 'function'
      ) {
        return;
      }
      geom = this._ensureIndexedGeometryForTangents(geom, root);
      if (!geom.index) return;
      prepared.add(geom);
      if (geom.attributes.tangent) {
        geom.deleteAttribute('tangent');
      }
      try {
        geom.computeTangents();
      } catch (_) {
        /* Degenerate UVs or edge cases */
      }
    });
  }

  _assignTextureToMaterialSlot(material, slot, texture, geometry) {
    if (slot === 'albedo') {
      material.map = texture;
      this._whiteBalanceFbxTexturedDiffuse(material);
      return;
    }
    if (slot === 'normal') {
      material.normalMap = texture;
      material.normalMapType = THREE.TangentSpaceNormalMap;
      material.bumpMap = null;
      if (!material.normalScale) {
        material.normalScale = new THREE.Vector2(1, 1);
      }
      this._syncFbxNormalScaleY(material);
      return;
    }
    if (slot === 'roughness') {
      material.roughnessMap = texture;
      return;
    }
    if (slot === 'metallic') {
      material.metalnessMap = texture;
      return;
    }
    if (slot === 'occlusion') {
      this._ensureUv2ForAo(geometry);
      material.aoMap = texture;
      if (material.aoMapIntensity === undefined || material.aoMapIntensity <= 0) {
        material.aoMapIntensity = 1;
      }
      return;
    }
    if (slot === 'displacement') {
      material.displacementMap = texture;
      if (!Number.isFinite(material.displacementScale) || material.displacementScale === 0) {
        material.displacementScale = 0.05;
      }
      return;
    }
    if (slot === 'orm') {
      this._ensureUv2ForAo(geometry);
      material.aoMap = texture;
      material.roughnessMap = texture;
      material.metalnessMap = texture;
      if (material.aoMapIntensity === undefined || material.aoMapIntensity <= 0) {
        material.aoMapIntensity = 1;
      }
      return;
    }
    if (slot === 'emissive') {
      material.emissiveMap = texture;
      material.emissive.setRGB(1, 1, 1);
      if (!Number.isFinite(material.emissiveIntensity) || material.emissiveIntensity <= 0) {
        material.emissiveIntensity = 1;
      }
      return;
    }
    if (slot === 'opacity') {
      material.alphaMap = texture;
      material.transparent = true;
      if (!Number.isFinite(material.opacity)) {
        material.opacity = 1;
      }
    }
  }

  clear() {
    this._restorePs2CrushGeometry();
    this._restoreVoxelGeometry();
    this._restoreWirePulseGeometry();
    this.mapInspectPreview?.clear();
    this.disposeFbxUserTextures(this.currentModel);
    this.clearWireframeOverlay();
    this.uvCheckerOverlay.setModel(null);
    this.normalViewOverlay.setModel(null);
    this.currentModel = null;
    this.currentShading = null;
    this.originalMaterials = new WeakMap();
    this.stateStore?.set('material.importHasMrMaps', false);
    this.stateStore?.set('material.importUsesAuthoredPbr', false);
  }

  getClaySettings() {
    return { ...this.claySettings };
  }

  getFresnelSettings() {
    return { ...this.fresnelSettings };
  }

  getSubsurfaceSettings() {
    return { ...this.subsurfaceSettings };
  }

  getWireframeSettings() {
    return { ...this.wireframeSettings };
  }

  getUnlitMode() {
    return this.unlitMode;
  }

  getOriginalMaterial(mesh) {
    return this.originalMaterials.get(mesh);
  }

  /** @param {THREE.Object3D | null | undefined} [root] */
  _isFontExtrudeModel(root = this.currentModel) {
    if (!root) return false;
    if (root.userData?.orbyFontGenerated) return true;
    let found = false;
    root.traverse((child) => {
      if (found || !child.isMesh) return;
      if (child.userData?.orbyFontExtrude) found = true;
    });
    return found;
  }

  /**
   * Font glyphs (especially e/g/o) are often several extrude shells in one group. Align with the
   * official transmission example (DoubleSide + stable renderOrder) to reduce angle-dependent sort
   * glitches. Does not fix the engine limit: transmission still won't refract other glass meshes.
   */
  _stabilizeFontExtrudeGlassPresentation() {
    if (!this.currentModel || !this._isFontExtrudeModel()) return;

    this.currentModel.traverse((child) => {
      if (child.userData?.orbyFontGlyphGroup) {
        child.renderOrder = Number(child.userData.orbyFontGlyphIndex) || 0;
      }
      if (!child.isMesh || !child.userData?.orbyFontExtrude) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m?.userData?.orbyCreativeLook !== 'glass' || !m.isMeshPhysicalMaterial) continue;
        // https://threejs.org/examples/webgl_materials_physical_transmission.html uses DoubleSide.
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    });
  }

  /**
   * Live fill color for Generate from Font meshes (preview + post-generate 3D).
   * @param {string} hex
   */
  setFontExtrudeFillColor(hex) {
    if (!this.currentModel || !this._isFontExtrudeModel()) return;
    const fillHex = normalizeGlyphFillHex(hex);
    const baseColor = new THREE.Color(fillHex);
    const visibleColor = this._diffuseColorWithBrightness(baseColor);
    const linear = { r: baseColor.r, g: baseColor.g, b: baseColor.b };
    const colorOverrideEnabled = !!this.stateStore?.getState()?.svgExtrude?.colorOverride;

    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.userData?.orbyFontExtrude) return;

      child.userData.orbySvgBaseColor = fillHex;
      child.userData.orbySvgGroupedColor = fillHex;
      child.userData.orbySvgBaseColorLinear = linear;

      if (colorOverrideEnabled) return;

      const patchBase = (mat) => {
        if (!mat?.color || mat.userData?.orbyCreativeLook) return;
        mat.color.copy(baseColor);
        mat.needsUpdate = true;
      };
      const patchVisible = (mat) => {
        if (!mat?.color || mat.userData?.orbyCreativeLook) return;
        mat.color.copy(visibleColor);
        mat.needsUpdate = true;
      };

      const original = this.originalMaterials.get(child);
      if (original) {
        if (Array.isArray(original)) original.forEach(patchBase);
        else patchBase(original);
      }

      const live = child.material;
      if (Array.isArray(live)) live.forEach(patchVisible);
      else patchVisible(live);
    });

    if (this.creativeLookSettings?.enabled) {
      this._applyCreativeLookOverride();
    } else {
      if (this.fresnelSettings?.enabled) {
        this.applyFresnelToModel(this.currentModel);
      }
      this.reapplySvgExtrudeSurfaceShaders();
    }

    if (this.onMaterialUpdate) {
      this.onMaterialUpdate();
    }
  }

  isClayMaterial(mesh) {
    if (!mesh || !mesh.material) return false;
    const original = this.originalMaterials.get(mesh);
    if (!original) return false;
    const material = mesh.material;
    return (
      material !== original &&
      (!Array.isArray(material) ||
        !Array.isArray(original) ||
        material.length !== original.length ||
        !material.every((mat, idx) => mat === original[idx]))
    );
  }
}

