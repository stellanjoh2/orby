import * as THREE from 'three';
import {
  CREATIVE_CHROME_BASE_HEX,
  createCreativeLookMaterial,
  creativeChromeRoughness,
  creativeGlassParams,
  creativeOrderedDitherPixelScale,
  normalizeCreativeLookPreset,
} from './CreativeLookMaterials.js';
import { normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import {
  applySvgExtrudeSurfaceToMaterial,
  ensureSvgExtrudeFresnelChain,
  getSvgExtrudeSurfacePresetConfig,
  isFresnelLinkedInSvgSurfaceChain,
  reapplySvgExtrudeSurfaceFromState,
  removeSvgExtrudeProceduralFromMaterial,
} from './SvgExtrudeSurfaceShader.js';
import { UvCheckerOverlay } from './UvCheckerOverlay.js';
import {
  applyShadowTintToObject as patchShadowTintOnObject,
  clearShadowTintFromObject as patchClearShadowTintFromObject,
  DEFAULT_SHADOW_OPACITY,
} from './ShadowTint.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
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
    /** Called after creative ShaderMaterials are (re)built — e.g. `renderer.compile(scene, camera)` to avoid first-draw hitches. */
    afterCreativeLookMaterialRebuild = null,
  }) {
    this.stateStore = stateStore;
    this.modelRoot = modelRoot;
    this.onShadingChanged = onShadingChanged;
    this.onMaterialUpdate = onMaterialUpdate;
    this.getCreativeLookKeyLightDir = getCreativeLookKeyLightDir;
    this.afterCreativeLookMaterialRebuild = afterCreativeLookMaterialRebuild;

    this.currentModel = null;
    this.currentShading = null;
    this.originalMaterials = new WeakMap();
    /** @type {THREE.Mesh[]|null} Wire overlay meshes (parented next to their source mesh for correct hierarchy). */
    this.wireframeOverlayMeshes = null;
    /** UV Checker overlay (Atlux map) — extracted to keep this controller focused on materials/shading. */
    this.uvCheckerOverlay = new UvCheckerOverlay();
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
    /** When enabled, replaces non-glass mesh materials with creative ShaderMaterials (restored when off). */
    this.creativeLookSettings = {
      enabled: false,
      preset: 'neon-edge',
      pauseShaderAnimations: false,
      shaderAnimationSpeed: 0.4,
      patternScale: 1,
    };
    /** Clock time (seconds) for animated presets (flow-field, plasma). */
    this._creativeLookTime = 0;
    /** Wall-clock snapshot when `pauseShaderAnimations` is on (frozen `uTime`). */
    this._creativeLookPausedAt = null;
    /** Reused when syncing toon `uLightDir` from scene key light. */
    this._creativeToonKeyDirScratch = new THREE.Vector3();
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
        color: '#c4ff00',
        onlyVisibleFaces: true,
        hideMesh: false,
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
      patternScale: (() => {
        const ps = Number(icl.patternScale);
        return Number.isFinite(ps) ? THREE.MathUtils.clamp(ps, 0.02, 5) : 1;
      })(),
    };
    this.materialSettings = {
      brightness:
        initialState.material?.brightness ??
        initialState.diffuseBrightness ??
        DEFAULT_MATERIAL_BRIGHTNESS,
      metalness: initialState.material?.metalness ?? 0.0,
      roughness: initialState.material?.roughness ?? DEFAULT_MATERIAL_ROUGHNESS,
      emissive: initialState.material?.emissive ?? 0.0,
    };
    this.originalMaterials = new WeakMap();
    this.prepareMesh(model);
    
    // Try to read roughness from the first material we find to preserve artist's intention
    if (initialState.material?.roughness === undefined) {
      let foundRoughness = null;
      model.traverse((child) => {
        if (child.isMesh && child.material && !foundRoughness) {
          const mat = Array.isArray(child.material) ? child.material[0] : child.material;
          if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) && mat.roughness !== undefined) {
            foundRoughness = mat.roughness;
          }
        }
      });
      if (foundRoughness !== null) {
        this.materialSettings.roughness = foundRoughness;
        // Update state store with the found value
        this.stateStore?.set('material.roughness', foundRoughness);
      }
    }
    // Note: Fresnel will be applied by setShading, which is called after setModel
  }

  prepareMesh(object) {
    this._snapshotImportMaterialBaselinesIfNeeded(object);

    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!this.originalMaterials.has(child)) {
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
        : '#ffffff';
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
      target.transparent = b.transparent;
      target.opacity = b.opacity;
      target.depthWrite = b.depthWrite;
      if ('alphaHash' in target) target.alphaHash = b.alphaHash;
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

    const getOrigColor = (orig, idx = 0) => {
      if (Array.isArray(orig)) {
        return orig[idx]?.color?.clone() ?? new THREE.Color('#ffffff');
      }
      return orig?.color?.clone() ?? new THREE.Color('#ffffff');
    };

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
        const adjustedColor = this._diffuseColorWithBrightness(getOrigColor(original, idx), bright);
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
    if (!object) return;
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
    if (!object || !this.modelHasGltfTransmissionMaterials(object)) return;
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
   */
  _materialIsFalseBlendShell(m) {
    if (!m || (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial)) return false;
    if (!m.transparent) return false;

    const op = Number.isFinite(m.opacity) ? m.opacity : 1;
    if (op < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return false;
    if (m.alphaMap) return false;
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
  applyGlassAppearanceFromState(object) {
    if (!object || !this.stateStore) return;
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
        : '#ffffff';
    const bodyDarken = Math.max(0.06, 1 - 0.72 * glassBody);
    /** Pull effective coverage toward opaque when body is high (stacks with Glass opacity). */
    const bodyOpacity = Math.min(
      1,
      glassOpacity + glassBody * (1 - glassOpacity) * 0.55,
    );

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

      // Heuristic window/glass without glTF transmission — opacity/tint/body sliders apply.
      m.color.set(glassTintHex);
      m.color.multiplyScalar(bodyDarken);
      m.opacity = bodyOpacity;
      m.transparent = true;
      m.depthWrite = false;
      m.needsUpdate = true;
    });
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

      if (baseTr && baseOp >= GLTF_FULL_OPACITY_BLEND_THRESHOLD) {
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
    const adjustedColor = this._diffuseColorWithBrightness(baseColor);
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
    this.currentShading = mode;
    const modelHasEmissive = this._modelHasAnyEmissiveBaseline();
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      
      // Skip glass materials - they should maintain their properties
      const isGlass = this.isWindowMesh(child);
      if (isGlass) return;
      
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
          // Get base color from original material or default to white
          const baseColor = mat?.color
              ? mat.color.clone()
            : new THREE.Color('#ffffff');
          
          const brightColor = this._diffuseColorWithBrightness(baseColor);

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
            const adjustedColor = this._diffuseColorWithBrightness(
              mat.color ? mat.color : new THREE.Color('#ffffff'),
            );
            cloned.color.copy(adjustedColor);
            // Apply metalness and roughness
            cloned.metalness = this.materialSettings.metalness;
            cloned.roughness = this.materialSettings.roughness;
            this._applyUserEmissiveOrRestoreImport(
              cloned,
              mat,
              adjustedColor,
              this.materialSettings.emissive || 0.0,
              modelHasEmissive,
            );
            // Disable original metalness/roughness maps so sliders behave consistently — unless the user
            // assigned FBX slot textures (manual maps).
            if (!mat?.userData?.orbyFbxSlotMaps) {
              if ('metalnessMap' in cloned) {
                cloned.metalnessMap = null;
              }
              if ('roughnessMap' in cloned) {
                cloned.roughnessMap = null;
              }
            }
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
    this.applyFresnelToModel(this.currentModel);
    this.reapplySvgExtrudeSurfaceShaders();
    this._applyCreativeLookOverride();
    this._applyRenderedImportGltfGlassPresentation(this.currentModel);

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

  _applyCreativeLookOverride() {
    if (!this.currentModel || !this.creativeLookSettings.enabled) return;
    if (this.currentShading === 'textures' || this.currentShading === 'wireframe') return;

    const preset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);

    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      if (this.isWindowMesh(child)) return;

      const importOriginal = this.originalMaterials.get(child);
      if (!importOriginal) return;

      this._disposeTransientMeshMaterials(child);

      const mk = (origMat) => {
        const rawOp = origMat?.opacity;
        const opacity = Number.isFinite(Number(rawOp))
          ? Math.min(1, Math.max(0, Number(rawOp)))
          : 1;
        // GLTF often sets transparent:true with opacity 0.999… — that path uses per-frame
        // transparent sorting and flickers badly when orbiting/zooming. Align with
        // GLTF_FULL_OPACITY_BLEND_THRESHOLD (near-opaque = opaque draw order).
        const useTransparentSort =
          !!origMat?.transparent && opacity < GLTF_FULL_OPACITY_BLEND_THRESHOLD;
        const state = this.stateStore?.getState();
        const hdriBlur = Number(state?.hdriBlurriness ?? 0);
        return createCreativeLookMaterial(preset, {
          transparent: useTransparentSort,
          opacity,
          side: origMat?.side ?? THREE.FrontSide,
          time: this._creativeLookTime,
          patternScale: this.creativeLookSettings.patternScale,
          hdriBlurriness: Number.isFinite(hdriBlur)
            ? THREE.MathUtils.clamp(hdriBlur, 0, 1)
            : 0,
          diffuseTint: origMat?.color?.clone?.() ?? undefined,
        });
      };

      if (Array.isArray(importOriginal)) {
        child.material = importOriginal.map((om) => mk(om));
      } else {
        child.material = mk(importOriginal);
      }
      // Custom ShaderMaterials rarely participate cleanly in shadow-map passes; casting/receiving
      // with incomplete depth programs correlates with intermittent black-frame GL stalls on some GPUs.
      child.castShadow = false;
      child.receiveShadow = false;
    });

    if (this.onMaterialUpdate) {
      this.onMaterialUpdate();
    }
    if (typeof this.afterCreativeLookMaterialRebuild === 'function') {
      this.afterCreativeLookMaterialRebuild();
    }
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
   * @param {object} patch
   * @param {{ skipStateStore?: boolean }} [options]
   */
  setCreativeLookSettings(patch, options = {}) {
    const prevEnabled = this.creativeLookSettings.enabled;
    const prevPreset = normalizeCreativeLookPreset(this.creativeLookSettings.preset);

    this.creativeLookSettings = {
      ...this.creativeLookSettings,
      ...patch,
    };
    this.creativeLookSettings.enabled = !!this.creativeLookSettings.enabled;
    this.creativeLookSettings.pauseShaderAnimations =
      !!this.creativeLookSettings.pauseShaderAnimations;
    const sp = Number(this.creativeLookSettings.shaderAnimationSpeed);
    this.creativeLookSettings.shaderAnimationSpeed = Number.isFinite(sp)
      ? THREE.MathUtils.clamp(sp, 0, 2)
      : 0.4;
    const ps = Number(this.creativeLookSettings.patternScale);
    this.creativeLookSettings.patternScale = Number.isFinite(ps)
      ? THREE.MathUtils.clamp(ps, 0.02, 5)
      : 1;
    this.creativeLookSettings.preset = normalizeCreativeLookPreset(
      this.creativeLookSettings.preset,
    );

    if (!options.skipStateStore && this.stateStore) {
      this.stateStore.set('creativeLook', this.creativeLookSettings);
    }

    if (!this.currentModel) {
      if (this.onMaterialUpdate) this.onMaterialUpdate();
      return;
    }

    if (!this.creativeLookSettings.enabled) {
      this.setShading(this.currentShading);
      this._restoreMeshShadowDefaults();
      return;
    }

    // Rebuilding every ShaderMaterial disposes GPU programs; redundant applies (duplicate events /
    // same state) caused visible black flashes. Only rebuild when enabled preset actually changes.
    const redundant =
      prevEnabled &&
      this.creativeLookSettings.enabled &&
      prevPreset === this.creativeLookSettings.preset;
    if (redundant) {
      return;
    }

    this._applyCreativeLookOverride();
  }

  updateCreativeLookTime(elapsedSeconds) {
    const cl = this.stateStore?.getState()?.creativeLook ?? {};
    let animSpeed = Number(cl.shaderAnimationSpeed);
    if (!Number.isFinite(animSpeed)) animSpeed = 0.4;
    animSpeed = THREE.MathUtils.clamp(animSpeed, 0, 2);
    let patternScale = Number(cl.patternScale);
    if (!Number.isFinite(patternScale)) patternScale = 1;
    patternScale = THREE.MathUtils.clamp(patternScale, 0.02, 5);

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

    if (
      (preset === 'toon' || preset === 'ordered-dither') &&
      typeof this.getCreativeLookKeyLightDir === 'function'
    ) {
      const dir = this.getCreativeLookKeyLightDir(this._creativeToonKeyDirScratch);
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (
            (m?.userData?.orbyCreativeLook === 'toon' ||
              m?.userData?.orbyCreativeLook === 'ordered-dither') &&
            m.uniforms?.uLightDir
          ) {
            m.uniforms.uLightDir.value.copy(dir);
          }
        }
      });
    }

    const animPreset =
      preset === 'flow-field' ||
      preset === 'plasma' ||
      preset === 'holographic' ||
      preset === 'spectral-storm';
    if (animPreset) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          const tag = m?.userData?.orbyCreativeLook;
          if (
            (tag === 'flow-field' ||
              tag === 'plasma' ||
              tag === 'holographic' ||
              tag === 'spectral-storm') &&
            m.uniforms?.uTime
          ) {
            m.uniforms.uTime.value = effectiveTime;
            if (m.uniforms.uPatternScale) {
              m.uniforms.uPatternScale.value = patternScale;
            }
          }
        }
      });
    }

    if (preset === 'ordered-dither') {
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (
            m?.userData?.orbyCreativeLook === 'ordered-dither' &&
            m.uniforms?.uPixelScale
          ) {
            m.uniforms.uPixelScale.value =
              creativeOrderedDitherPixelScale(patternScale);
          }
        }
      });
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
      const { thickness, roughness } = creativeGlassParams(
        patternScale,
        Number.isFinite(blur) ? blur : 0,
      );
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m?.userData?.orbyCreativeLook === 'glass' && m.isMeshPhysicalMaterial) {
            m.thickness = thickness;
            m.roughness = roughness;
          }
        }
      });
    }

  }

  getCreativeLookSettings() {
    return { ...this.creativeLookSettings };
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

  /**
   * Brightness-adjusted albedo. Dielectrics may exceed 1.0 (HDR-style diffuse boost).
   * When metalness is active, clamp to [0, 1] so conductor F0 does not blow out specular.
   * @param {THREE.Color|string} sourceColor
   * @param {number} [brightness]
   * @param {number|null} [metalnessForClamp] — pass `0` for unlit/textures; omit to use slider metalness
   */
  _diffuseColorWithBrightness(
    sourceColor,
    brightness = this.materialSettings.brightness,
    metalnessForClamp = undefined,
  ) {
    const color =
      sourceColor?.isColor
        ? sourceColor.clone()
        : new THREE.Color(sourceColor ?? '#ffffff');
    const b = Number(brightness);
    const scale = Number.isFinite(b) ? b : DEFAULT_MATERIAL_BRIGHTNESS;
    color.multiplyScalar(scale);

    const metalRaw =
      metalnessForClamp !== undefined
        ? metalnessForClamp
        : this.materialSettings.metalness ?? 0;
    const metal = Number.isFinite(Number(metalRaw)) ? Math.min(1, Math.max(0, Number(metalRaw))) : 0;
    if (metal > 1e-4) {
      const clamp = (v) => Math.min(1, Math.max(0, v));
      color.r = THREE.MathUtils.lerp(color.r, clamp(color.r), metal);
      color.g = THREE.MathUtils.lerp(color.g, clamp(color.g), metal);
      color.b = THREE.MathUtils.lerp(color.b, clamp(color.b), metal);
    }
    return color;
  }

  setMaterialBrightness(brightness) {
    const b = Number(brightness);
    this.materialSettings.brightness = Number.isFinite(b) ? b : DEFAULT_MATERIAL_BRIGHTNESS;
    this.updateMaterials();
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
            if (Array.isArray(orig)) {
              return orig[idx]?.color?.clone() ?? new THREE.Color('#ffffff');
            }
            return orig?.color?.clone() ?? new THREE.Color('#ffffff');
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
            if (Array.isArray(orig)) {
              return orig[idx]?.color?.clone() ?? new THREE.Color('#ffffff');
            }
            return orig?.color?.clone() ?? new THREE.Color('#ffffff');
          };

          if (Array.isArray(material) && Array.isArray(original)) {
            material.forEach((mat, idx) => {
              if (mat?.userData?.orbyCreativeLook) return;
              if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
                let m = mat;
                const origMat = Array.isArray(original) ? original[idx] : original;
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
                const adjustedColor = this._diffuseColorWithBrightness(getOriginalColor(original, idx));
                m.color.copy(adjustedColor);
                m.metalness = this.materialSettings.metalness;
                m.roughness = this.materialSettings.roughness;
                this._applyUserEmissiveOrRestoreImport(
                  m,
                  origMat,
                  adjustedColor,
                  this.materialSettings.emissive || 0.0,
                  modelHasEmissive,
                );
                this._syncTransparentFlagsFromImport(m, origMat);
                if ('metalnessMap' in m) {
                  m.metalnessMap = null;
                }
                if ('roughnessMap' in m) {
                  m.roughnessMap = null;
                }
                if (tSub > SUBSURFACE_EPS && m.isMeshPhysicalMaterial) {
                  delete m.userData.orbySubsurface;
                  this._applySubsurfacePhysicalParams(m, tSub);
                }
                m.needsUpdate = true;
              } else if (mat && (mat.isMeshPhongMaterial || mat.isMeshLambertMaterial)) {
                if (mat?.userData?.orbyCreativeLook) return;
                // FBX (e.g. Mixamo) often loads as Phong/Lambert — brightness must still apply live.
                const adjustedColor = this._diffuseColorWithBrightness(getOriginalColor(original, idx));
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
            const adjustedColor = this._diffuseColorWithBrightness(getOriginalColor(original));
            mat.color.copy(adjustedColor);
            mat.metalness = this.materialSettings.metalness;
            mat.roughness = this.materialSettings.roughness;
            this._applyUserEmissiveOrRestoreImport(
              mat,
              original,
              adjustedColor,
              this.materialSettings.emissive || 0.0,
              modelHasEmissive,
            );
            this._syncTransparentFlagsFromImport(mat, original);
            if ('metalnessMap' in mat) {
              mat.metalnessMap = null;
            }
            if ('roughnessMap' in mat) {
              mat.roughnessMap = null;
            }
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
            const adjustedColor = this._diffuseColorWithBrightness(getOriginalColor(original));
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
    if (meshes && meshes.length) {
      for (const child of meshes) {
        if (child.isMesh) {
          if (child.geometry && child.userData.isCloned) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat?.dispose?.());
            } else {
              child.material.dispose();
            }
          }
          child.parent?.remove(child);
        }
      }
      this.wireframeOverlayMeshes = null;
    }
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
      ) {
        // Hide mesh if hideMesh is enabled (but keep wireframe + uv checker overlays visible)
        child.visible = !hideMesh;
      }
    });

    // Create overlay if "always on" is enabled OR if wireframe mode is active
    // Wireframe mode now shows overlay on top of original materials (not pure wireframe)
    const shouldShowOverlay = this.wireframeSettings.alwaysOn || this.currentShading === 'wireframe';
    
    if (shouldShowOverlay) {
      this.wireframeOverlayMeshes = [];

      const { color, onlyVisibleFaces } = this.wireframeSettings;
      const wireMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        wireframe: true,
        depthTest: onlyVisibleFaces, // Enable depth test when only showing visible faces
        depthWrite: false,
        transparent: !onlyVisibleFaces, // No transparency when showing only visible faces
        opacity: onlyVisibleFaces
          ? WIREFRAME_OPACITY_VISIBLE
          : WIREFRAME_OPACITY_OVERLAY,
      });

      // Add depth offset to prevent z-fighting when showing only visible faces
      // Increased values help with darker colors where z-fighting is more visible
      if (onlyVisibleFaces) {
        wireMaterial.polygonOffset = true;
        wireMaterial.polygonOffsetFactor = WIREFRAME_POLYGON_OFFSET_FACTOR;
        wireMaterial.polygonOffsetUnits = WIREFRAME_POLYGON_OFFSET_UNITS;
      }

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
        ) return;
        // InstancedMesh uses instance matrices; a plain wire clone would not match instances.
        if (child.isInstancedMesh) return;

        let geometry = child.geometry;
        let isCloned = false;

        // If onlyVisibleFaces is enabled, push vertices along normals
        if (onlyVisibleFaces) {
          geometry = child.geometry.clone();
          isCloned = true;
          const positions = geometry.attributes.position;

          if (!geometry.attributes.normal) {
            geometry.computeVertexNormals();
          }

          const offset = WIREFRAME_OFFSET;
          for (let i = 0; i < positions.count; i++) {
            const normal = new THREE.Vector3();
            normal.fromBufferAttribute(geometry.attributes.normal, i);
            const position = new THREE.Vector3();
            position.fromBufferAttribute(positions, i);
            position.addScaledVector(normal, offset);
            positions.setXYZ(i, position.x, position.y, position.z);
          }
          positions.needsUpdate = true;
        }

        const wireMesh = child.isSkinnedMesh
          ? new THREE.SkinnedMesh(geometry, wireMaterial)
          : new THREE.Mesh(geometry, wireMaterial);

        wireMesh.userData.originalMesh = child;
        wireMesh.userData.isCloned = isCloned;
        wireMesh.userData.isWireframeOverlay = true;
        wireMesh.name = child.name ? `${child.name}_wireframe` : 'wireframe';
        wireMesh.renderOrder = 999;

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
      if (!wireMesh.isMesh || !wireMesh.userData.originalMesh) continue;
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
    reapplySvgExtrudeSurfaceFromState(
      this.currentModel,
      this.stateStore,
      this.currentShading,
    );
    if (this.shadowTintStrength > 0) {
      this.applyShadowTintToObject(this.currentModel);
    }
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
    material.needsUpdate = true;
  }

  updateMaterialsEnvironment(envTexture, intensity, hdriBlurriness = 0) {
    if (!this.currentModel) return;

    // If we're in textures/unlit mode, skip - MeshBasicMaterial doesn't use environment maps
    if (this.currentShading === 'textures') {
      return;
    }

    // Clay: env map only; surface props restored after Fresnel (or immediately if Fresnel off).
    if (this.currentShading === 'clay') {
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
          const nextIntensity = intensity;
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

          if (importGltfGlass && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) {
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
            let envMul = intensity;
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
  /**
   * Apply Map Slots → Invert normal Y to all materials that use a normal map (original/import materials).
   */
  applyFbxNormalYInvertFromState() {
    if (!this.currentModel) return;
    this.currentModel.traverse((child) => {
      if (!child.isMesh) return;
      const orig = this.originalMaterials.get(child);
      if (!orig) return;
      const mats = Array.isArray(orig) ? orig : [orig];
      for (const m of mats) {
        if (m?.normalMap) this._syncFbxNormalScaleY(m);
      }
    });
    const mode = this.currentShading ?? this.stateStore?.getState()?.shading ?? 'shaded';
    this.setShading(mode);
  }

  _syncFbxNormalScaleY(material) {
    if (!material?.normalMap) return;
    const invert = !!this.stateStore?.getState()?.fbxMapSlots?.invertNormalY;
    const ax = Math.abs(Number(material.normalScale?.x) || 1) || 1;
    const ay = Math.abs(Number(material.normalScale?.y) || 1) || 1;
    if (!material.normalScale) {
      material.normalScale = new THREE.Vector2(ax, invert ? -ay : ay);
    } else {
      material.normalScale.set(ax, invert ? -ay : ay);
    }
    material.needsUpdate = true;
  }

  applyFbxSlotTexture(slot, texture) {
    if (!this.currentModel || !texture) return;

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

    this._configureFbxTexture(texture, slot);

    if (this._getPbrUvChannelIndex() === 1) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.geometry?.attributes?.uv) return;
        if (!child.geometry.attributes.uv2) {
          child.geometry.setAttribute('uv2', child.geometry.attributes.uv.clone());
        }
      });
    }

    this.currentModel.traverse((child) => {
      if (!child.isMesh || this.isWindowMesh(child)) return;
      let orig = this.originalMaterials.get(child);
      if (!orig) return;

      const assignOne = (mat, geom) => {
        const m = this._ensureStandardForFbxSlot(mat);
        m.userData.orbyFbxSlotMaps = true;
        this._disposePreviousFbxSlotTexture(m, slot);
        this._assignTextureToMaterialSlot(m, slot, texture, geom);
        this._refreshAllFbxSlotTransformsForMaterial(m);
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

    this.applyTransparencyPipeline(this.currentModel);
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
  _getPbrUvChannelIndex() {
    return this.stateStore?.getState()?.fbxMapSlots?.pbrUvChannel === 1 ? 1 : 0;
  }

  /**
   * Normal maps must use `channel` 0: MeshStandardMaterial tangents are built from `attributes.uv` only.
   * Sampling normals on `uv2` without matching tangents yields flat/broken lighting (Three limitation).
   */
  _getDetailTextureChannelForSlot(slot) {
    if (slot === 'normal' || slot === 'albedo') return 0;
    return this._getPbrUvChannelIndex();
  }

  _setTextureUvChannelForSlot(texture, slot) {
    if (!texture || !('channel' in texture)) return;
    texture.channel = this._getDetailTextureChannelForSlot(slot);
  }

  /**
   * Reapply Texture.channel on all original materials (e.g. after user switches UV2 for detail maps).
   */
  applyFbxPbrUvChannelsFromState() {
    if (!this.currentModel) return;
    const detailCh = this._getPbrUvChannelIndex();
    if (detailCh === 1) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.geometry?.attributes?.uv) return;
        if (!child.geometry.attributes.uv2) {
          child.geometry.setAttribute('uv2', child.geometry.attributes.uv.clone());
        }
      });
    }
    this.currentModel.traverse((child) => {
      if (!child.isMesh || this.isWindowMesh(child)) return;
      const orig = this.originalMaterials.get(child);
      if (!orig) return;
      const mats = Array.isArray(orig) ? orig : [orig];
      for (const m of mats) {
        if (!m) continue;
        if (m.map?.isTexture) m.map.channel = 0;
        if (m.normalMap?.isTexture) m.normalMap.channel = 0;
        const setCh = (tex) => {
          if (tex?.isTexture) tex.channel = detailCh;
        };
        setCh(m.roughnessMap);
        setCh(m.metalnessMap);
        setCh(m.aoMap);
        setCh(m.emissiveMap);
        setCh(m.alphaMap);
        setCh(m.displacementMap);
        m.needsUpdate = true;
      }
    });
    const mode = this.currentShading ?? this.stateStore?.getState()?.shading ?? 'shaded';
    this.setShading(mode);
  }

  _configureFbxTexture(texture, slot) {
    texture.userData.orbyFbxUserTexture = true;
    texture.needsUpdate = true;
    if ('colorSpace' in texture) {
      const srgbSlots = new Set(['albedo', 'emissive']);
      texture.colorSpace = srgbSlots.has(slot) ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    }
    if (slot === 'normal') {
      texture.flipY = false;
    }
    this._setTextureUvChannelForSlot(texture, slot);
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
   * Prefer albedo, then any already-assigned PBR map (embedded FBX textures often carry correct tiling).
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
    if (!ref?.isTexture) return;
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
      seen.add(t.uuid);
      this._copyUvTransform(ref, t);
    }
  }

  /** Tangents must match UVs for correct normal mapping; some FBX meshes ship without usable tangents. */
  _ensureTangentsForNormalMapping(root) {
    root?.traverse?.((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geom = child.geometry;
      if (
        !geom.index ||
        !geom.attributes?.position ||
        !geom.attributes?.normal ||
        !geom.attributes?.uv ||
        typeof geom.computeTangents !== 'function'
      ) {
        return;
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
      return;
    }
    if (slot === 'normal') {
      material.normalMap = texture;
      material.normalMapType = THREE.TangentSpaceNormalMap;
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
    this.disposeFbxUserTextures(this.currentModel);
    this.clearWireframeOverlay();
    this.uvCheckerOverlay.setModel(null);
    this.currentModel = null;
    this.currentShading = null;
    this.originalMaterials = new WeakMap();
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

