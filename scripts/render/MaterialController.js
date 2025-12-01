import * as THREE from 'three';
import {
  WIREFRAME_OFFSET,
  WIREFRAME_POLYGON_OFFSET_FACTOR,
  WIREFRAME_POLYGON_OFFSET_UNITS,
  WIREFRAME_OPACITY_VISIBLE,
  WIREFRAME_OPACITY_OVERLAY,
} from '../constants.js';

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
    this.wireframeOverlay = null;
    this.unlitMode = false;

    // Settings
    this.claySettings = {};
    this.fresnelSettings = {};
    this.wireframeSettings = {};
    this.materialSettings = {
      brightness: 1.0,
      metalness: 0.0,
      roughness: 0.8, // Default to 0.8 (original fallback value)
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
      }),
    };
    this.materialSettings = {
      brightness: initialState.material?.brightness ?? initialState.diffuseBrightness ?? 1.0,
      metalness: initialState.material?.metalness ?? 0.0,
      roughness: initialState.material?.roughness ?? 0.8, // Default to 0.8 (original fallback value)
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
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (!this.originalMaterials.has(child)) {
          this.originalMaterials.set(child, child.material);
        }
      }
    });
    
    // Disabled: Glass material application - keeping default transparency behavior
    // this.applyGlassMaterial(object);
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
    const windowKeywords = ['glass', 'windshield', 'windscreen', 'visor', 'glazing'];
    const isWindowByName = windowKeywords.some(keyword => 
      name.includes(keyword) || parentName.includes(keyword)
    );
    
    // Only check material name for glass/window (not just transparency, as many things are transparent)
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const materialName = material?.name?.toLowerCase() || '';
    const isWindowByMaterial = materialName.includes('glass') || materialName.includes('window');
    
    return isWindowByName || isWindowByMaterial;
  }
  
  identifyWindowMaterials(object) {
    if (!object) return [];
    
    const windowInfo = [];
    object.traverse((child) => {
      if (!this.isWindowMesh(child)) return;
      
      const material = Array.isArray(child.material) ? child.material[0] : child.material;
      const info = {
        meshName: child.name || 'unnamed',
        parentName: child.parent?.name || 'none',
        materialName: material?.name || 'unnamed',
        materialType: material?.type || 'unknown',
        transparent: material?.transparent || false,
        opacity: material?.opacity !== undefined ? material.opacity : 1.0,
        roughness: material?.roughness !== undefined ? material.roughness : 'N/A',
        metalness: material?.metalness !== undefined ? material.metalness : 'N/A',
      };
      windowInfo.push(info);
    });
    
    return windowInfo;
  }
  
  applyGlassMaterial(object) {
    if (!object) return;
    
    // First, identify and log current window materials
    const windowInfo = this.identifyWindowMaterials(object);
    if (windowInfo.length > 0) {
      console.log('[MaterialController] Identified window materials:');
      windowInfo.forEach((info, idx) => {
        console.log(`  Window ${idx + 1}:`, {
          mesh: info.meshName,
          parent: info.parentName,
          material: info.materialName,
          type: info.materialType,
          transparent: info.transparent,
          opacity: info.opacity,
          roughness: info.roughness,
          metalness: info.metalness,
        });
      });
    }
    
    object.traverse((child) => {
      if (!this.isWindowMesh(child)) return;
      
      // Check if mesh has valid geometry
      if (!child.geometry || !child.geometry.attributes || !child.geometry.attributes.position) {
        console.warn(`[MaterialController] Window mesh "${child.name || 'unnamed'}" has invalid geometry, skipping glass material`);
        return;
      }
      
      const originalMaterial = this.originalMaterials.get(child) || child.material;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      
      // Create optimized glass material (using MeshStandardMaterial for better performance)
      // Transmission is expensive, so we use transparency + environment map for reflections
      const glassMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0a0a0a), // Near black like real car windows
        transparent: true,
        opacity: 0.2, // 20% opaque (80% transparent) - very see-through
        roughness: 0.05, // Very smooth/glossy for shiny reflections
        metalness: 0.0,
        side: THREE.DoubleSide, // Render both sides
        depthWrite: true, // Keep default depth writing
        depthTest: true, // Enable depth testing
        // Remove any textures that might be causing issues
        map: null,
        normalMap: null,
        aoMap: null,
        emissiveMap: null,
        metalnessMap: null,
        roughnessMap: null,
        // Use environment map for reflections instead of expensive transmission
      });
      
      // Always set environment map for reflections (glass should be reflective)
      // The environment map will be set by updateMaterialsEnvironment, but we ensure it's enabled
      // Preserve environment map if original had one, otherwise it will be set later
      if (originalMaterial && !Array.isArray(originalMaterial)) {
        if (originalMaterial.envMap) {
          glassMaterial.envMap = originalMaterial.envMap;
          glassMaterial.envMapIntensity = (originalMaterial.envMapIntensity || 1.0) * 2.0; // Boost reflection intensity for glass
        }
      }
      
      // Mark this as a glass material so we can identify it later
      glassMaterial.userData.isGlass = true;
      
      // Apply glass material
      if (Array.isArray(child.material)) {
        // Replace all materials in array with glass
        child.material = materials.map(() => glassMaterial.clone());
      } else {
        child.material = glassMaterial;
      }
      
      // Set render order for proper transparency sorting (render glass after opaque objects)
      child.renderOrder = 1;
      
      // Store original material for restoration
      if (!this.originalMaterials.has(child)) {
        this.originalMaterials.set(child, originalMaterial);
      }
      
      // Log window detection for debugging
      console.log(`[MaterialController] Applied glass material to window mesh: ${child.name || 'unnamed'} (parent: ${child.parent?.name || 'none'})`, {
        geometry: child.geometry ? 'valid' : 'invalid',
        vertices: child.geometry?.attributes?.position?.count || 0,
        material: glassMaterial.type,
        opacity: glassMaterial.opacity,
        transparent: glassMaterial.transparent,
      });
    });
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
        const { color } = this.wireframeSettings;
        const createWire = (mat) => {
          const base = mat?.clone
            ? mat.clone()
            : new THREE.MeshStandardMaterial();
          base.wireframe = true;
          base.color = new THREE.Color(color);
          return base;
        };
        applyMaterial(buildArray(createWire));
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
            cloned.color.copy(originalColor.multiplyScalar(this.materialSettings.brightness));
            // Apply metalness and roughness
            cloned.metalness = this.materialSettings.metalness;
            cloned.roughness = this.materialSettings.roughness;
            // Disable original metalness/roughness maps so sliders behave consistently with Clay mode
            if ('metalnessMap' in cloned) {
              cloned.metalnessMap = null;
            }
            if ('roughnessMap' in cloned) {
              cloned.roughnessMap = null;
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
    }
  }

  setWireframeSettings(patch) {
    this.wireframeSettings = { ...this.wireframeSettings, ...patch };
    this.stateStore.set('wireframe', this.wireframeSettings);
    this.updateWireframeOverlay();
    if (this.currentShading === 'wireframe') {
      this.setShading('wireframe');
    }
  }

  clearWireframeOverlay() {
    if (this.wireframeOverlay) {
      this.wireframeOverlay.traverse((child) => {
        if (child.isMesh) {
          // Only dispose geometry if it was cloned (has userData.isCloned)
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
        }
      });
      // Remove from parent (could be currentModel or modelRoot)
      if (this.wireframeOverlay.parent) {
        this.wireframeOverlay.parent.remove(this.wireframeOverlay);
      }
      this.wireframeOverlay = null;
    }
  }

  updateWireframeOverlay() {
    if (!this.currentModel) return;

    // Always clear existing overlay first to prevent duplicates
    this.clearWireframeOverlay();

    // Create overlay if "always on" is enabled
    if (this.wireframeSettings.alwaysOn) {
      this.wireframeOverlay = new THREE.Group();
      this.wireframeOverlay.name = 'wireframeOverlay';

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

      // Create wireframe meshes that follow the model
      this.currentModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
          let geometry = child.geometry;
          let isCloned = false;

          // If onlyVisibleFaces is enabled, push vertices along normals
          if (onlyVisibleFaces) {
            // Clone geometry so we don't modify the original
            geometry = child.geometry.clone();
            isCloned = true;
            const positions = geometry.attributes.position;

            // Compute normals if they don't exist
            if (!geometry.attributes.normal) {
              geometry.computeVertexNormals();
            }

            // Push vertices along their normals by a small amount (0.002 units)
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

          const wireMesh = new THREE.Mesh(geometry, wireMaterial);
          // Link to original mesh for matrix updates
          wireMesh.userData.originalMesh = child;
          wireMesh.userData.isCloned = isCloned;
          wireMesh.renderOrder = 999; // Render on top
          this.wireframeOverlay.add(wireMesh);
        }
      });

      // Add wireframe overlay as a child of currentModel so it inherits the same transforms
      // This ensures both the original meshes and wireframe meshes rotate together through modelRoot
      if (this.currentModel) {
        this.currentModel.add(this.wireframeOverlay);
      } else {
        this.modelRoot.add(this.wireframeOverlay);
      }
    }
  }

  updateWireframeOverlayTransforms() {
    if (!this.wireframeOverlay || !this.currentModel) return;

    // Update wireframe overlay transforms to match the model perfectly
    // Since wireframeOverlay is now a child of currentModel (same as original meshes),
    // we just need to copy local transforms and they'll inherit modelRoot rotations together
    this.wireframeOverlay.traverse((wireMesh) => {
      if (wireMesh.isMesh && wireMesh.userData.originalMesh) {
        const original = wireMesh.userData.originalMesh;
        // Copy local position, rotation, and scale from original
        // This ensures they transform together through modelRoot
        wireMesh.position.copy(original.position);
        wireMesh.rotation.copy(original.rotation);
        wireMesh.scale.copy(original.scale);
        // Let Three.js handle matrix updates through the parent hierarchy
        wireMesh.matrixAutoUpdate = true;
        wireMesh.updateMatrix();
        wireMesh.matrixAutoUpdate = false;
      }
    });
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
      material.onBeforeCompile !== undefined &&
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
      if (uniforms && uniforms.color && uniforms.color.value) {
        uniforms.color.value.set(settings.color || '#ffffff');
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

      // Don't process non-clay materials when in clay mode
      return;
    }

    // For non-clay materials, apply environment and blurriness as normal
    // IMPORTANT: Store current materialSettings values to ensure we use the latest user settings
    const currentMetalness = this.materialSettings.metalness;
    const currentRoughness = this.materialSettings.roughness;
    
    this.currentModel.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((material) => {
          if (!material) return;

          // Apply environment map to all materials that support it (including glass)
          if (
            material.isMeshStandardMaterial ||
            material.isMeshPhysicalMaterial ||
            material.isMeshLambertMaterial ||
            material.isMeshPhongMaterial
          ) {
            material.envMap = envTexture;
            if (material.envMapIntensity !== undefined) {
              // Boost intensity for glass materials to make reflections more visible
              const isGlass = this.isWindowMesh(child);
              material.envMapIntensity = isGlass ? intensity * 2.0 : intensity;
            }

            // CRITICAL: Always restore metalness and roughness from materialSettings
            // Setting envMap might trigger Three.js internal updates that reset these values
            // Use stored values to ensure we have the latest user settings
            // BUT: Preserve glass material properties (they should stay glossy and transparent)
            const isGlass = material.userData?.isGlass || this.isWindowMesh(child);
            if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
              if (isGlass) {
                // Glass materials: keep low roughness for reflections, no metalness, maintain transparency
                material.metalness = 0.0;
                material.roughness = 0.05; // Keep glass glossy
                material.transparent = true;
                material.opacity = 0.2; // Ensure transparency is maintained
                material.depthWrite = false; // Important for proper transparency
              } else {
                material.metalness = currentMetalness;
                
                // Apply blurriness to roughness, using user's desired roughness as the base
                if (hdriBlurriness > 0) {
                  const blurRoughness =
                    currentRoughness + (1.0 - currentRoughness) * hdriBlurriness;
                  material.roughness = Math.min(1.0, blurRoughness);
                } else {
                  // Reset to user's desired roughness when blurriness is 0
                  material.roughness = currentRoughness;
                }
              }
            } else if (material.roughness !== undefined && !isGlass) {
              // For non-standard materials, just set the user's desired roughness (unless it's glass)
              material.roughness = currentRoughness;
            }

            material.needsUpdate = true;
          }
        });
      }
    });
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
              if (mat.roughness === 0 || Math.abs(mat.roughness - targetRoughness) > 0.01) {
                mat.roughness = targetRoughness;
              }
              if (mat.metalness === 0 || Math.abs(mat.metalness - targetMetalness) > 0.01) {
                mat.metalness = targetMetalness;
              }
              mat.color.copy(tintedClayColor);
              mat.needsUpdate = true;
            }
          });
        }
      });
    }
  }

  clear() {
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

