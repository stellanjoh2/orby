import * as THREE from 'three';
import { reapplySvgExtrudeProceduralFromState } from './SvgExtrudeSurfaceShader.js';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
  DEFAULT_MATERIAL_ROUGHNESS,
} from '../constants.js';

/** BLEND materials at/above this opacity are treated as fully opaque (alpha-hash + force-opaque modes). */
const GLTF_FULL_OPACITY_BLEND_THRESHOLD = 0.989;

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

export class MaterialController {
  constructor({
    stateStore,
    modelRoot,
    onShadingChanged = null,
    onMaterialUpdate = null,
  }) {
    this.stateStore = stateStore;
    this.modelRoot = modelRoot;
    this.onShadingChanged = onShadingChanged;
    this.onMaterialUpdate = onMaterialUpdate;

    this.currentModel = null;
    this.currentShading = null;
    this.originalMaterials = new WeakMap();
    /** @type {THREE.Mesh[]|null} Wire overlay meshes (parented next to their source mesh for correct hierarchy). */
    this.wireframeOverlayMeshes = null;
    this.unlitMode = false;

    // Settings
    this.claySettings = {};
    this.fresnelSettings = {};
    this.wireframeSettings = {};
    this.materialSettings = {
      brightness: 1.0,
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
    this.wireframeSettings = {
      ...(initialState.wireframe || {
        alwaysOn: false,
        color: '#9fb7ff',
        onlyVisibleFaces: false,
        hideMesh: false,
      }),
    };
    this.materialSettings = {
      brightness: initialState.material?.brightness ?? initialState.diffuseBrightness ?? 1.0,
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

  /**
   * Capture loader output once per material so Advanced → Alpha modes can restore and re-apply.
   */
  _snapshotImportMaterialBaselinesIfNeeded(object) {
    this._forEachUniqueMaterial(object, (m) => {
      if (m.userData?.orbyGltfImportBaseline) return;
      if (!('transparent' in m)) return;
      m.userData.orbyGltfImportBaseline = {
        transparent: !!m.transparent,
        opacity: Number.isFinite(m.opacity) ? m.opacity : 1,
        side: m.side,
        depthWrite: m.depthWrite !== false,
        alphaHash: 'alphaHash' in m ? !!m.alphaHash : false,
      };
    });
  }

  _restoreImportMaterialBaselines(object) {
    this._forEachUniqueMaterial(object, (m) => {
      const b = m.userData?.orbyGltfImportBaseline;
      if (!b) return;
      m.transparent = b.transparent;
      m.opacity = b.opacity;
      m.side = b.side;
      m.depthWrite = b.depthWrite;
      if ('alphaHash' in m) m.alphaHash = b.alphaHash;
      delete m.userData.orbyGlassPresentation;
      delete m.userData.orbyBlendMitigation;
      delete m.userData.orbyUserOpaqueBlend;
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
    this.applyGlassAppearanceFromState(object);
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

    const gltfMode = m.userData?.alphaMode;
    if (gltfMode === 'BLEND' || gltfMode === 'MASK') return true;

    if (m.alphaMap) return true;
    if (m.alphaTest > 0) return true;

    if (m.map && m.map.format === THREE.RGBAFormat) return true;

    if (m.isMeshPhysicalMaterial && m.transmission > 0.01) return true;

    return false;
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
   * Apply Advanced glass opacity (Alpha → Default only). Reflection strength is applied in updateMaterialsEnvironment.
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

    this._forEachMeshMaterial(object, (mesh, m) => {
      if (!this.isWindowMesh(mesh)) return;
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;

      if (mode !== 'default') return;

      // glTF car glass often uses MeshPhysicalMaterial + transmission (any magnitude). We must
      // keep using this path after crushing transmission, else we stop driving body once T<0.01.
      const hadPhysSnapshot = !!m.userData?.orbyAdvGlassPhysical;
      const physTransmission = m.isMeshPhysicalMaterial ? Number(m.transmission) || 0 : 0;
      const usePhysicalGlassPath =
        m.isMeshPhysicalMaterial && (physTransmission > 1e-6 || hadPhysSnapshot);

      if (usePhysicalGlassPath) {
        if (!m.userData.orbyAdvGlassPhysical) {
          m.userData.orbyAdvGlassPhysical = {
            baseTransmission: Math.min(1, Math.max(0, physTransmission)),
            baseThickness: Number.isFinite(m.thickness) ? m.thickness : 1,
          };
        }
        const snap = m.userData.orbyAdvGlassPhysical;
        const bt = snap.baseTransmission;
        // Linear to 0 at full body — noticeably reduces see-through vs a soft floor at ~2% T.
        m.transmission = bt * (1 - glassBody);
        if (glassBody >= 0.999) m.transmission = 0;
        // Thicker slab = more in-volume absorption while transmission > 0 (reads “more solid”).
        const th0 = Number.isFinite(snap.baseThickness) ? snap.baseThickness : 1;
        m.thickness = th0 * (1 + 4 * glassBody);

        m.color.set(glassTintHex);
        m.color.multiplyScalar(bodyDarken);
        m.metalness = 0;
        m.opacity = bodyOpacity;
        m.transparent = true;
        m.depthWrite = false;
        m.needsUpdate = true;
        return;
      }

      // Standard (or physical with no measurable transmission): single blend path.
      m.color.set(glassTintHex);
      m.color.multiplyScalar(bodyDarken);
      m.opacity = bodyOpacity;
      m.transparent = true;
      m.depthWrite = false;
      m.needsUpdate = true;
    });
  }

  /** Re-run pipeline after load / when Advanced setting changes (uses currentModel). */
  reapplyTransparencyPipeline() {
    if (!this.currentModel) return;
    this.applyTransparencyPipeline(this.currentModel);
  }

  /** Treat full-opacity BLEND glTF as opaque shading (fixes many Sketchfab single-atlas exports). */
  _applyUserForceOpaqueBlend(object) {
    this._forEachUniqueMaterial(object, (m) => {
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;

      const b = m.userData?.orbyGltfImportBaseline;
      const baseOp = b ? b.opacity : (Number.isFinite(m.opacity) ? m.opacity : 1);
      const baseTr = b ? b.transparent : m.transparent;
      const hasTransmission = m.isMeshPhysicalMaterial && m.transmission > 0.01;
      if (hasTransmission) return;

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
    this._forEachUniqueMaterial(object, (m) => {
      if (m.side === undefined) return;
      m.side = THREE.FrontSide;
      m.needsUpdate = true;
    });
  }

  /**
   * Reduces transparency popping / z-fighting when glTF marks full-opacity surfaces as BLEND + DoubleSide
   * (common on Sketchfab). Uses Three.js alpha-hash transparency when available.
   */
  applyGltfBlendSortingMitigation(object) {
    this._forEachUniqueMaterial(object, (m) => {
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;
      if (m.userData?.orbySkipBlendMitigation) return;

      const hasTransmission = m.isMeshPhysicalMaterial && m.transmission > 0.01;
      if (hasTransmission) return;
      if (!m.transparent) return;

      const op = Number.isFinite(m.opacity) ? m.opacity : 1;
      if (op < GLTF_FULL_OPACITY_BLEND_THRESHOLD) return;
      if (m.side !== THREE.DoubleSide) return;
      if (m.alphaTest > 0) return;

      if ('alphaHash' in m && typeof m.alphaHash === 'boolean') {
        m.alphaHash = true;
        m.needsUpdate = true;
      }
    });
  }

  /**
   * Promote heuristic “glass” meshes (visor/window/…) from fully opaque PBR to translucent blend.
   * Runs at prepare time so fade-in + shading see correct transparency without needing scene.environment.
   */
  applyNamedGlassPresentation(object) {
    this._forEachMeshMaterial(object, (mesh, m) => {
      if (!this.isWindowMesh(mesh)) return;
      if (!m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return;
      if (m.userData?.orbyGlassPresentation) return;

      const hasTransmission = m.isMeshPhysicalMaterial && m.transmission > 0.01;
      if (hasTransmission) {
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

  setShading(mode) {
    if (!this.currentModel) return;
    this.currentShading = mode;
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
        // Wireframe mode: keep original materials but show overlay on top
        // Restore original materials (they'll be visible under the wireframe overlay)
        applyMaterial(original);
      } else if (mode === 'clay') {
        const { color } = this.claySettings;
        // Use material settings for roughness and metalness (unified controls)
        const createClay = (originalMat) => {
          const clayColor = this.getClayColorWithBrightness();
          const clay = new THREE.MeshStandardMaterial({
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
          return clay;
        };
        applyMaterial(buildArray(createClay));
      } else if (mode === 'textures') {
        const createTextureMaterial = (mat) => {
          // Get base color from original material or default to white
          const baseColor = mat?.color
              ? mat.color.clone()
            : new THREE.Color('#ffffff');
          
          // Apply material brightness multiplier
          baseColor.multiplyScalar(this.materialSettings.brightness);
          
          // Use MeshBasicMaterial for truly unlit rendering - ignores all lighting
          // Note: MeshBasicMaterial only supports map (diffuse), not normalMap, aoMap, etc.
          const basic = new THREE.MeshBasicMaterial({
            map: mat?.map ?? null,
            color: baseColor,
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
          const cloned = mat.clone ? mat.clone() : mat;
          // Don't apply brightness/metalness/roughness to glass materials
          if (isGlass) {
            // Glass materials should keep their properties
            if (cloned) {
              cloned.wireframe = false;
            }
            return cloned;
          }
          // Apply material brightness multiplier to color (which multiplies the texture map)
          // The material's color property multiplies the texture map, so this brightens the diffuse map
          if (cloned && (cloned.isMeshStandardMaterial || cloned.isMeshPhysicalMaterial || cloned.isMeshPhongMaterial)) {
            const originalColor = mat.color ? mat.color.clone() : new THREE.Color('#ffffff');
            const adjustedColor = originalColor.multiplyScalar(this.materialSettings.brightness);
            cloned.color.copy(adjustedColor);
            // Apply metalness and roughness
            cloned.metalness = this.materialSettings.metalness;
            cloned.roughness = this.materialSettings.roughness;
            // Apply emissive: multiply adjusted color by emissive value for glowing effect
            const emissiveIntensity = this.materialSettings.emissive || 0.0;
            if (emissiveIntensity > 0) {
              cloned.emissive.copy(adjustedColor).multiplyScalar(emissiveIntensity);
              cloned.emissiveIntensity = emissiveIntensity;
            } else {
              cloned.emissive.set(0, 0, 0);
              cloned.emissiveIntensity = 0;
            }
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
    this.applyFresnelToModel(this.currentModel);
    reapplySvgExtrudeProceduralFromState(this.currentModel, this.stateStore, mode);
    
    // CRITICAL: Reapply emissive after shading change
    // Materials are recreated in setShading, so we need to ensure emissive is applied
    if (this.materialSettings?.emissive > 0 && mode !== 'wireframe' && mode !== 'textures') {
      this.updateMaterials();
    }

    if (this.onShadingChanged) {
      this.onShadingChanged(mode);
    }
    if (this.onMaterialUpdate) {
      this.onMaterialUpdate();
    }
  }

  setClaySettings(patch) {
    this.claySettings = { ...this.claySettings, ...patch };
    if (this.stateStore.getState().shading === 'clay') {
      // Update existing clay materials directly instead of recreating them
      if (this.currentModel) {
        this.currentModel.traverse((child) => {
          if (!child.isMesh) return;
          const material = child.material;
          // Check if this is a clay material (not an original material)
          const original = this.originalMaterials.get(child);
          const isClayMaterial =
            material &&
            original &&
            material !== original &&
            (!Array.isArray(material) ||
              !Array.isArray(original) ||
              material.length !== original.length ||
              !material.every((mat, idx) => mat === original[idx]));

          if (isClayMaterial) {
            const tintedClayColor = this.getClayColorWithBrightness();
            // This is a clay material, update it directly
            if (Array.isArray(material)) {
              material.forEach((mat) => {
                if (mat && mat.isMeshStandardMaterial) {
                  mat.color.copy(tintedClayColor);
                  // Roughness and metalness are now controlled by Material settings, not clay settings
                  // Always use material settings for roughness and metalness
                  mat.roughness = this.materialSettings.roughness;
                  mat.metalness = this.materialSettings.metalness;
                  mat.needsUpdate = true;
                }
              });
            } else if (material.isMeshStandardMaterial) {
              material.color.copy(tintedClayColor);
              // Roughness and metalness are now controlled by Material settings, not clay settings
              // Always use material settings for roughness and metalness
              material.roughness = this.materialSettings.roughness;
              material.metalness = this.materialSettings.metalness;
              material.needsUpdate = true;
            }
          }
        });
      } else {
        // Fallback to recreating materials if no model loaded
        this.setShading('clay');
      }
    }
  }

  setMaterialBrightness(brightness) {
    this.materialSettings.brightness = brightness;
    this.updateMaterials();
  }

  setMaterialMetalness(metalness) {
    this.materialSettings.metalness = metalness;
    this.updateMaterials();
  }

  setMaterialRoughness(roughness) {
    this.materialSettings.roughness = roughness;
    this.updateMaterials();
  }

  setMaterialEmissive(emissive) {
    this.materialSettings.emissive = emissive;
    this.updateMaterials();
  }

  getClayColorWithBrightness() {
    const baseColorHex = this.claySettings?.color ?? '#808080';
    const brightness = this.materialSettings?.brightness ?? 1.0;
    const baseColor = new THREE.Color(baseColorHex);
    const tinted = baseColor.multiplyScalar(brightness);
    tinted.r = Math.min(1, Math.max(0, tinted.r));
    tinted.g = Math.min(1, Math.max(0, tinted.g));
    tinted.b = Math.min(1, Math.max(0, tinted.b));
    return tinted;
  }

  updateMaterials() {
    // Update existing materials in all modes (except wireframe which has its own color)
    // Material controls now apply to both Color/Textures modes AND Clay mode
    if (this.currentModel && (this.currentShading === 'shaded' || this.currentShading === 'textures' || this.currentShading === 'clay')) {
      this.currentModel.traverse((child) => {
        if (!child.isMesh) return;
        const original = this.originalMaterials.get(child);
        const material = child.material;
        
        // Skip glass materials - they should not be affected by brightness/metalness/roughness sliders
        const isGlass = this.isWindowMesh(child);
        if (isGlass) return;
        
        // Check if this is a clay material
        const isClayMaterial = original && material !== original && 
          (!Array.isArray(material) || !Array.isArray(original) || 
           material.length !== original.length || 
           !material.every((mat, idx) => mat === original[idx]));
        
        if (this.currentShading === 'clay' && isClayMaterial) {
          // For clay materials, only update roughness and metalness (color is controlled by clay.color)
          const tintedClayColor = this.getClayColorWithBrightness();
          if (Array.isArray(material)) {
            material.forEach((mat) => {
              if (mat && mat.isMeshStandardMaterial) {
                mat.roughness = this.materialSettings.roughness;
                mat.metalness = this.materialSettings.metalness;
                mat.color.copy(tintedClayColor);
                  mat.needsUpdate = true;
                }
              });
          } else if (material && material.isMeshStandardMaterial) {
            material.roughness = this.materialSettings.roughness;
            material.metalness = this.materialSettings.metalness;
            material.color.copy(tintedClayColor);
            material.needsUpdate = true;
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
              if (mat && mat.isMeshBasicMaterial) {
                const originalColor = getOriginalColor(original, idx);
                const adjustedColor = originalColor.multiplyScalar(this.materialSettings.brightness);
                mat.color.copy(adjustedColor);
                mat.needsUpdate = true;
              }
            });
          } else if (material && material.isMeshBasicMaterial) {
            const originalColor = getOriginalColor(original);
            const adjustedColor = originalColor.multiplyScalar(this.materialSettings.brightness);
            material.color.copy(adjustedColor);
            material.needsUpdate = true;
          }
        } else if (this.currentShading === 'shaded') {
          // For shaded mode, update brightness, metalness, and roughness
          if (!original) return;
          
          const getOriginalColor = (orig, idx = 0) => {
            if (Array.isArray(orig)) {
              return orig[idx]?.color?.clone() ?? new THREE.Color('#ffffff');
            }
            return orig?.color?.clone() ?? new THREE.Color('#ffffff');
          };
          
          if (Array.isArray(material) && Array.isArray(original)) {
            material.forEach((mat, idx) => {
              if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) {
                const originalColor = getOriginalColor(original, idx);
                const adjustedColor = originalColor.multiplyScalar(this.materialSettings.brightness);
                mat.color.copy(adjustedColor);
                mat.metalness = this.materialSettings.metalness;
                mat.roughness = this.materialSettings.roughness;
                // Apply emissive: multiply original color by emissive value for glowing effect
                const emissiveIntensity = this.materialSettings.emissive || 0.0;
                if (emissiveIntensity > 0) {
                  mat.emissive.copy(adjustedColor).multiplyScalar(emissiveIntensity);
                  mat.emissiveIntensity = emissiveIntensity;
                } else {
                  mat.emissive.set(0, 0, 0);
                  mat.emissiveIntensity = 0;
                }
                if ('metalnessMap' in mat) {
                  mat.metalnessMap = null;
                }
                if ('roughnessMap' in mat) {
                  mat.roughnessMap = null;
                }
                mat.needsUpdate = true;
              }
            });
          } else if (material && (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) {
            const originalColor = getOriginalColor(original);
            const adjustedColor = originalColor.multiplyScalar(this.materialSettings.brightness);
            material.color.copy(adjustedColor);
            material.metalness = this.materialSettings.metalness;
            material.roughness = this.materialSettings.roughness;
            // Apply emissive: multiply adjusted color by emissive value for glowing effect
            const emissiveIntensity = this.materialSettings.emissive || 0.0;
            if (emissiveIntensity > 0) {
              material.emissive.copy(adjustedColor).multiplyScalar(emissiveIntensity);
              material.emissiveIntensity = emissiveIntensity;
      } else {
              material.emissive.set(0, 0, 0);
              material.emissiveIntensity = 0;
            }
            if ('metalnessMap' in material) {
              material.metalnessMap = null;
            }
            if ('roughnessMap' in material) {
              material.roughnessMap = null;
            }
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
      reapplySvgExtrudeProceduralFromState(this.currentModel, this.stateStore, this.currentShading);
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
      if (child.isMesh && !child.userData.isWireframeOverlay) {
        // Hide mesh if hideMesh is enabled (but keep wireframe overlay visible)
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
        if (!child.isMesh || !child.geometry || child.userData.isWireframeOverlay) return;
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
        material.onBeforeCompile =
          material.userData.originalOnBeforeCompile || (() => {});
        delete material.userData.originalOnBeforeCompile;
        delete material.userData.fresnelPatched;
        delete material.userData.fresnelUniforms;
        delete material.userData.fresnelOnBeforeCompile;
        material.needsUpdate = true;
      }
      return;
    }

    // Always re-patch if material was replaced or uniforms are missing
    // This ensures Fresnel works even after material updates/recompilations
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
        // If hook is missing or different, restore it from stored reference
        if (!material.userData.fresnelOnBeforeCompile) {
          // Hook was lost, need to re-patch - fall through to re-patching code
          delete material.userData.fresnelPatched;
          delete material.userData.originalOnBeforeCompile;
        } else if (!material.onBeforeCompile || material.onBeforeCompile !== material.userData.fresnelOnBeforeCompile) {
          // Hook exists but material lost it, restore it and trigger recompilation
          material.onBeforeCompile = material.userData.fresnelOnBeforeCompile;
          material.needsUpdate = true; // Force recompilation to apply the hook
        }
        // Don't force recompilation on normal uniform updates - uniforms update in real-time
        return;
      }
      // If uniforms are missing, clear flag and re-patch
      delete material.userData.fresnelPatched;
      delete material.userData.originalOnBeforeCompile;
      delete material.userData.fresnelOnBeforeCompile;
    }

    // Create new patch - this handles both new materials and re-patching
    // Only store original if we haven't stored it before (to preserve the true original)
    const original = material.userData.originalOnBeforeCompile || material.onBeforeCompile;
    if (!material.userData.originalOnBeforeCompile) {
      material.userData.originalOnBeforeCompile = original;
    }

    // Create uniforms that will be stored and reused
    // Invert radius: low radius (0.5) = high power (5.0) = narrow, high radius (5.0) = low power (0.5) = wide
    const radius = settings.radius || 2.0;
    const invertedPower = Math.max(0.1, 5.5 - radius);
    const uniforms = {
      color: { value: new THREE.Color(settings.color || '#ffffff') },
      strength: { value: settings.strength || 0.5 },
      power: { value: invertedPower },
    };

    // Store uniforms before patching so they're available even if shader recompiles
    material.userData.fresnelUniforms = uniforms;

    const fresnelOnBeforeCompile = (shader) => {
      original?.(shader);

      // Use stored uniforms or create new ones if missing (defensive)
      const fresnelUniforms = material.userData.fresnelUniforms || uniforms;

      shader.uniforms.fresnelColor = fresnelUniforms.color;
      shader.uniforms.fresnelStrength = fresnelUniforms.strength;
      shader.uniforms.fresnelPower = fresnelUniforms.power;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `
        #include <common>
        uniform vec3 fresnelColor;
        uniform float fresnelStrength;
        uniform float fresnelPower;
      `,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `
        #include <lights_fragment_end>
        vec3 fresnelNormal = normalize( normal );
        vec3 fresnelViewDir = normalize( vViewPosition );
        float fresnelTerm = pow( max(0.0, 1.0 - abs(dot(fresnelNormal, fresnelViewDir))), fresnelPower );
        vec3 fresnelContribution = fresnelColor * fresnelTerm * fresnelStrength;
        reflectedLight.directDiffuse += fresnelContribution;
        totalEmissiveRadiance += fresnelContribution;
      `,
      );

      // Ensure uniforms are stored after shader compilation
      material.userData.fresnelUniforms = fresnelUniforms;
    };
    
    material.onBeforeCompile = fresnelOnBeforeCompile;
    material.userData.fresnelOnBeforeCompile = fresnelOnBeforeCompile; // Store reference for restoration
    material.userData.fresnelPatched = true;
    material.needsUpdate = true;
  }

  updateMaterialsEnvironment(envTexture, intensity, hdriBlurriness = 0) {
    if (!this.currentModel) return;

    // If we're in textures/unlit mode, skip - MeshBasicMaterial doesn't use environment maps
    if (this.currentShading === 'textures') {
      return;
    }

    // If we're in clay mode, handle clay materials separately and skip the rest
    if (this.currentShading === 'clay') {
      const targetRoughness = this.materialSettings.roughness;
      const targetMetalness = this.materialSettings.metalness;
      const tintedClayColor = this.getClayColorWithBrightness();

      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const isClayMaterial = !this.originalMaterials.has(child);

        if (isClayMaterial) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];

          materials.forEach((material) => {
            if (!material || !material.isMeshStandardMaterial) return;

            // ONLY set envMap and intensity - NEVER touch roughness/metalness
            material.envMap = envTexture;
            if (material.envMapIntensity !== undefined) {
              material.envMapIntensity = intensity;
            }

            // CRITICAL: Always restore roughness and metalness immediately after setting envMap
            // Setting envMap might trigger Three.js internal updates that reset these values
            material.roughness = targetRoughness;
            material.metalness = targetMetalness;
            material.color.copy(tintedClayColor);

            material.needsUpdate = true;
          });
        }
      });
      
      // CRITICAL: Reapply Fresnel after material updates
      // Material updates trigger shader recompilation which can lose the onBeforeCompile hook
      if (this.fresnelSettings?.enabled) {
        this.applyFresnelToModel(this.currentModel);
      }
      reapplySvgExtrudeProceduralFromState(this.currentModel, this.stateStore, this.currentShading);

      // Don't process non-clay materials when in clay mode
      return;
    }

    // For non-clay materials, apply environment and blurriness as normal
    // IMPORTANT: Always read the latest values from stateStore to ensure we have the most current user settings
    // This prevents values from "resetting" when HDRI blurriness changes
    const state = this.stateStore?.getState();
    const rawGlassRef = state?.advanced?.glassReflection;
    const glassEnvMul = Number.isFinite(Number(rawGlassRef))
      ? Math.min(4, Math.max(0, Number(rawGlassRef)))
      : 2;
    const currentMetalness = state?.material?.metalness ?? this.materialSettings.metalness ?? 0.0;
    const currentRoughness =
      state?.material?.roughness ?? this.materialSettings.roughness ?? DEFAULT_MATERIAL_ROUGHNESS;
    
    // Also update materialSettings to keep them in sync
    this.materialSettings.metalness = currentMetalness;
    this.materialSettings.roughness = currentRoughness;
    
    this.currentModel.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      materials.forEach((material) => {
        if (!material) return;

        if (
          material.isMeshStandardMaterial ||
          material.isMeshPhysicalMaterial ||
          material.isMeshLambertMaterial ||
          material.isMeshPhongMaterial
        ) {
          material.envMap = envTexture;
          if (material.envMapIntensity !== undefined) {
            const isGlass = this.isWindowMesh(child);
            material.envMapIntensity = isGlass ? intensity * glassEnvMul : intensity;
          }

          const isGlass = material.userData?.isGlass || this.isWindowMesh(child);
          if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
            if (isGlass) {
              material.metalness = 0.0;
              if (material.transparent) {
                material.depthWrite = false;
              }
            } else {
              material.metalness = currentMetalness;
              if (hdriBlurriness > 0) {
                const blurRoughness =
                  currentRoughness + (1.0 - currentRoughness) * hdriBlurriness;
                material.roughness = Math.min(1.0, blurRoughness);
              } else {
                material.roughness = currentRoughness;
              }
            }
          } else if (material.roughness !== undefined && !isGlass) {
            material.roughness = currentRoughness;
          }

          material.needsUpdate = true;
        }
      });
    });

    if (this.fresnelSettings?.enabled) {
      this.applyFresnelToModel(this.currentModel);
    }
    reapplySvgExtrudeProceduralFromState(this.currentModel, this.stateStore, this.currentShading);
  }

  forceRestoreClaySettings() {
    // Simple restoration - just set the values directly from claySettings
    if (this.currentShading === 'clay' && this.claySettings && this.currentModel) {
      const targetRoughness = this.materialSettings.roughness;
      const targetMetalness = this.materialSettings.metalness;
      const tintedClayColor = this.getClayColorWithBrightness();

      this.currentModel.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const material = child.material;
        const isClayMaterial = !this.originalMaterials.has(child) ||
          (material !== this.originalMaterials.get(child) &&
            (!Array.isArray(material) ||
              !Array.isArray(this.originalMaterials.get(child)) ||
              material.length !== this.originalMaterials.get(child).length ||
              !material.every((mat, idx) => mat === this.originalMaterials.get(child)[idx])));

        if (isClayMaterial) {
          const materials = Array.isArray(material) ? material : [material];
          materials.forEach((mat) => {
            if (mat && mat.isMeshStandardMaterial) {
              let dirty = false;
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
              if (dirty) mat.needsUpdate = true;
            }
          });
        }
      });
    }
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

  getWireframeSettings() {
    return { ...this.wireframeSettings };
  }

  getUnlitMode() {
    return this.unlitMode;
  }

  getOriginalMaterial(mesh) {
    return this.originalMaterials.get(mesh);
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

