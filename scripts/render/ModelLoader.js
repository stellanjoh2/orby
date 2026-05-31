import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/STLLoader.js';
import { USDZLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/USDZLoader.js';
import { SvgExtrudeImporter } from '../import/SvgExtrudeImporter.js';
import {
  DEFAULT_MATERIAL_ROUGHNESS,
  STUDIO_IMPORT_TARGET_MAX_DIMENSION,
} from '../constants.js';
import { registerKHRMaterialsPbrSpecularGlossiness } from './gltfKHRSpecularGlossinessPlugin.js';

/** Below target × ratio → scale up on import (e.g. Sketchfab GLB with 0.01 node scale). */
const IMPORT_SCALE_MIN_RATIO = 0.25;
/** Above target × ratio → scale down on import (legacy FBX cm/m extremes). */
const IMPORT_SCALE_MAX_RATIO = 10;

/**
 * Uniformly scale a loaded root so its world AABB max dimension sits near {@link STUDIO_IMPORT_TARGET_MAX_DIMENSION}.
 * Skips assets already in the Orby-friendly band so intentional ~2-unit glTF is unchanged.
 */
function normalizeImportScale(object) {
  if (!object) return;
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (!bounds || bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) return;

  const target = STUDIO_IMPORT_TARGET_MAX_DIMENSION;
  const minThreshold = target * IMPORT_SCALE_MIN_RATIO;
  const maxThreshold = target * IMPORT_SCALE_MAX_RATIO;
  if (maxDimension >= minThreshold && maxDimension <= maxThreshold) return;

  const uniformScale = target / maxDimension;
  if (!Number.isFinite(uniformScale) || uniformScale <= 0) return;
  object.scale.multiplyScalar(uniformScale);
  object.updateMatrixWorld(true);
}
/** Mixamo / FBX Phong shininess is usually 0–100; map to PBR roughness. */
const FBX_PHONG_SHININESS_ROUGHNESS_RANGE = 100;

/**
 * FBXLoader emits MeshPhongMaterial / MeshLambertMaterial. Orby’s mesh sliders and Fresnel target
 * MeshStandardMaterial — promote early so FBX gets “basic” parity without a full FBX material stack.
 */
function shininessToRoughnessPhong(shininess) {
  if (!Number.isFinite(shininess)) return DEFAULT_MATERIAL_ROUGHNESS;
  const s = Math.min(Math.max(shininess, 0), FBX_PHONG_SHININESS_ROUGHNESS_RANGE);
  return Math.min(1, Math.max(0, 1 - s / FBX_PHONG_SHININESS_ROUGHNESS_RANGE));
}

function promoteFbxClassicMaterialToStandard(material) {
  if (!material) return material;
  if (!material.isMeshPhongMaterial && !material.isMeshLambertMaterial) {
    return material;
  }

  const roughness = material.isMeshPhongMaterial
    ? shininessToRoughnessPhong(material.shininess)
    : DEFAULT_MATERIAL_ROUGHNESS;

  const std = new THREE.MeshStandardMaterial({
    name: material.name || '',
    color: material.color.clone(),
    roughness,
    metalness: 0,
    map: material.map ?? null,
    lightMap: material.lightMap ?? null,
    lightMapIntensity: material.lightMapIntensity ?? 1,
    normalMap: material.normalMap ?? null,
    normalScale: material.normalScale?.clone?.() ?? new THREE.Vector2(1, 1),
    bumpMap: material.bumpMap ?? null,
    bumpScale: material.bumpScale ?? 1,
    emissive: material.emissive?.clone?.() ?? new THREE.Color(0, 0, 0),
    emissiveIntensity: Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 1,
    emissiveMap: material.emissiveMap ?? null,
    alphaMap: material.alphaMap ?? null,
    aoMap: material.aoMap ?? null,
    aoMapIntensity: material.aoMapIntensity ?? 1,
    envMap: material.envMap ?? null,
    envMapIntensity: material.envMapIntensity ?? 1,
    displacementMap: material.displacementMap ?? null,
    displacementScale: material.displacementScale ?? 1,
    displacementBias: material.displacementBias ?? 0,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest ?? 0,
    side: material.side,
    vertexColors: !!material.vertexColors,
    wireframe: material.wireframe,
    flatShading: material.flatShading,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest,
    toneMapped: material.toneMapped !== false,
    premultipliedAlpha: !!material.premultipliedAlpha,
    skinning: !!material.skinning,
    morphTargets: !!material.morphTargets,
    morphNormals: !!material.morphNormals,
  });

  if (material.userData && typeof material.userData === 'object') {
    std.userData = { ...material.userData };
  }

  material.dispose();
  return std;
}

function promoteFbxClassicMaterialsToPbr(object) {
  if (!object) return;
  object.traverse((child) => {
    if (!child?.isMesh || !child.material) return;
    if (Array.isArray(child.material)) {
      child.material = child.material.map((m) => promoteFbxClassicMaterialToStandard(m));
    } else {
      child.material = promoteFbxClassicMaterialToStandard(child.material);
    }
  });
}

function countMeshes(root) {
  let n = 0;
  root?.traverse?.((o) => {
    if (o.isMesh) n += 1;
  });
  return n;
}

/** User-facing copy for unknown extensions (3D viewers vs raster images). */
function unsupportedFormatMessage(ext) {
  const raw = ext != null ? String(ext).toLowerCase().replace(/^\.+/, '') : '';
  const label = raw ? `.${raw}` : 'this file';
  return (
    `Unsupported file type (${label}). ` +
    `Orby opens 3D geometry in GLB, GLTF (single file or whole folder with textures), OBJ, FBX (drop the FBX plus texture PNGs in one folder — external FBX textures do not load from a single file alone), STL, ` +
    `USDZ / USD when the package uses a text USDA stage (binary USDC is not supported in the browser here), ` +
    `and SVG for extruded logos. ` +
    `Raster images such as PNG, JPEG, or WebP are not imported as meshes—convert or export from your DCC to a supported 3D format first.`
  );
}

function configureGLTFLoader(loader) {
  if (loader.setMeshoptDecoder && MeshoptDecoder) {
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  registerKHRMaterialsPbrSpecularGlossiness(loader);
}

export class ModelLoader {
  constructor() {
    this.fileReaders = {
      text: (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => resolve(reader.result);
          reader.readAsText(file);
        }),
      buffer: (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error);
          reader.onload = () => resolve(reader.result);
          reader.readAsArrayBuffer(file);
        }),
    };
    this.pendingObjectUrls = [];
    this.setupLoaders();
  }

  setupLoaders() {
    this.gltfLoader = new GLTFLoader();
    configureGLTFLoader(this.gltfLoader);
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    this.stlLoader = new STLLoader();
    this.usdLoader = new USDZLoader();
    this.svgExtrudeImporter = new SvgExtrudeImporter();
  }

  disposeObjectUrls() {
    if (!this.pendingObjectUrls) return;
    this.pendingObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.pendingObjectUrls = [];
  }

  registerObjectUrl(url) {
    this.pendingObjectUrls = this.pendingObjectUrls ?? [];
    this.pendingObjectUrls.push(url);
  }

  async loadFile(file, options = {}) {
    if (!file) throw new Error('No file provided');
    const extension = file.name.split('.').pop().toLowerCase();
    const asset = await this.parseFileByExtension(file, extension, options);
    return { ...asset, sourceFile: file };
  }

  async loadFileBundle(files) {
    if (!files?.length) throw new Error('No files in bundle');
    const normalizedMap = new Map();
    files.forEach(({ file, path }) => {
      const key = this.normalizePath(path || file.name);
      normalizedMap.set(key, file);
      normalizedMap.set(key.toLowerCase(), file);
    });

    const primaryKey = [...normalizedMap.keys()].find((key) =>
      key.toLowerCase().endsWith('.gltf'),
    );
    let primaryFile = primaryKey ? normalizedMap.get(primaryKey) : null;

    if (!primaryFile) {
      const glbKey = [...normalizedMap.keys()].find((key) =>
        key.toLowerCase().endsWith('.glb'),
      );
      if (glbKey) {
        return this.loadFile(normalizedMap.get(glbKey));
      }
      const fbxKey = [...normalizedMap.keys()].find((key) =>
        key.toLowerCase().endsWith('.fbx'),
      );
      if (fbxKey) {
        return this.loadFbxFromBundle(normalizedMap, fbxKey);
      }
      throw new Error(
        'No supported root file in folder. Add a .gltf, .glb, or .fbx (with texture files if the FBX references external images).',
      );
    }

    const rootPath = this.getDirectoryFromPath(primaryKey);
    const loader = new GLTFLoader();
    configureGLTFLoader(loader);
    loader.setURLModifier((url) => {
      if (/^https?:\/\//i.test(url)) return url;
      const decoded = decodeURI(url);
      const relative = this.normalizePath(decoded);
      const candidates = [
        this.normalizePath(`${rootPath}${relative}`),
        relative,
      ];
      for (const candidate of candidates) {
        const match =
          normalizedMap.get(candidate) ||
          normalizedMap.get(candidate.toLowerCase());
        if (match) {
          const objectUrl = URL.createObjectURL(match);
          this.registerObjectUrl(objectUrl);
          return objectUrl;
        }
      }
      return url;
    });

    const text = await this.fileReaders.text(primaryFile);
    return new Promise((resolve, reject) => {
      loader.parse(
        text,
        '/',
        (gltf) => {
          const asset = gltf.parser?.json?.asset || {};
          const assetName =
            gltf.scene?.name ?? primaryFile.name.replace(/\.[^/.]+$/, '');
          const gltfMetadata = {
            assetName,
            generator: asset.generator || null,
            version: asset.version || null,
            copyright: asset.copyright || null,
          };
          normalizeImportScale(gltf.scene);
          resolve({
            object: gltf.scene,
            animations: gltf.animations ?? [],
            gltfMetadata,
            sourceFile: primaryFile,
          });
        },
        (error) => reject(error),
      );
    });
  }

  async parseFileByExtension(file, ext, options = {}) {
    switch (ext) {
      case 'glb':
        return this.loadGlb(file);
      case 'gltf':
        return this.loadGltf(file);
      case 'fbx':
        return this.loadFbx(file);
      case 'obj':
        return this.loadObj(file);
      case 'stl':
        return this.loadStl(file);
      case 'usdz':
      case 'usd':
        return this.loadUsd(file);
      case 'svg':
        return this.loadSvg(file, options);
      default:
        throw new Error(unsupportedFormatMessage(ext));
    }
  }

  async loadSvg(file, options = {}) {
    const depth = options.svgExtrudeDepth;
    const normalAngleDeg = options.svgExtrudeNormalAngle;
    const colorDepths = options.svgExtrudeColorDepths || {};
    const colorOffsets = options.svgExtrudeColorOffsets || {};
    const flipDirection = !!options.svgExtrudeFlipDirection;
    const bevelAmount = options.svgExtrudeBevelAmount;
    const detail = options.svgExtrudeDetail;
    const object = await this.svgExtrudeImporter.loadFromFile(file, {
      depth,
      normalAngleDeg,
      colorDepths,
      colorOffsets,
      flipDirection,
      bevelAmount,
      detail,
    });
    const assetName = file.name.replace(/\.[^/.]+$/, '') || 'SVG';
    return {
      object,
      animations: [],
      gltfMetadata: {
        assetName,
        generator: 'SvgExtrudeImporter',
        version: null,
        copyright: null,
      },
      svgExtrude: {
        enabled: true,
        depth: this.svgExtrudeImporter.getDepth(),
        normalAngle: this.svgExtrudeImporter.getNormalAngleDeg(),
        colorDepths: this.svgExtrudeImporter.getColorDepths(),
        colorOffsets: this.svgExtrudeImporter.getColorOffsets(),
        colors: this.svgExtrudeImporter.getAvailableColors(),
        flipDirection: this.svgExtrudeImporter.getFlipDirection(),
        bevelAmount: this.svgExtrudeImporter.getBevelAmount(),
        detail: this.svgExtrudeImporter.getDetail(),
        importer: this.svgExtrudeImporter,
      },
    };
  }

  async loadGlb(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      this.gltfLoader.parse(
        buffer,
        '',
        (gltf) => {
          const json = gltf.parser?.json || {};
          const asset = json.asset || {};
          let assetName = gltf.scene?.name;
          if (!assetName && gltf.scene?.children?.length > 0) {
            assetName = gltf.scene.children[0]?.name;
          }
          if (!assetName) {
            assetName = file.name.replace(/\.[^/.]+$/, '');
          }
          normalizeImportScale(gltf.scene);
          resolve({
            object: gltf.scene,
            animations: gltf.animations,
            gltfMetadata: {
              assetName,
              generator: asset.generator || null,
              version: asset.version || null,
              copyright: asset.copyright || null,
            },
          });
        },
        reject,
      );
    });
  }

  async loadGltf(file) {
    // For single .gltf files, parse as text and use the parser
    // Note: External resources (bin files, textures) won't be resolved for single-file drag-and-drop
    // Users should drag the entire folder for GLTF files with external resources
    const text = await this.fileReaders.text(file);
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      configureGLTFLoader(loader);

      // Parse the GLTF JSON text
      loader.parse(
        text,
        '', // Base path is empty for single file
        (gltf) => {
          const json = gltf.parser?.json || {};
          const asset = json.asset || {};
          let assetName = gltf.scene?.name;
          if (!assetName && gltf.scene?.children?.length > 0) {
            assetName = gltf.scene.children[0]?.name;
          }
          if (!assetName) {
            assetName = file.name.replace(/\.[^/.]+$/, '');
          }
          normalizeImportScale(gltf.scene);
          resolve({
            object: gltf.scene,
            animations: gltf.animations || [],
            gltfMetadata: {
              assetName,
              generator: asset.generator || null,
              version: asset.version || null,
              copyright: asset.copyright || null,
            },
          });
        },
        (error) => {
          // Provide a helpful error message if external resources are missing
          const errorMessage = error?.message || 'Unknown error';
          if (errorMessage.includes('404') || errorMessage.includes('Failed to load')) {
            reject(new Error(
              `Failed to load GLTF file. This file may reference external resources (bin files, textures). ` +
              `Please drag and drop the entire folder containing the .gltf file and all its resources. ` +
              `Original error: ${errorMessage}`
            ));
          } else {
            reject(error);
          }
        },
      );
    });
  }

  /**
   * Map basename → File for resolving FBX embedded texture filenames when dropping a folder.
   */
  _buildBasenameFileLookup(normalizedMap) {
    const lookup = new Map();
    for (const [key, file] of normalizedMap.entries()) {
      if (!(file instanceof File)) continue;
      const base = String(key)
        .split('/')
        .pop()
        .split('\\')
        .pop()
        .toLowerCase();
      if (!lookup.has(base)) lookup.set(base, file);
    }
    return lookup;
  }

  /**
   * Redirect FBX TextureLoader requests (e.g. ak_Roughness.png) to blob URLs from the dropped folder.
   */
  _applyFbxBundleUrlModifier(manager, basenameLookup) {
    manager.setURLModifier((url) => {
      if (!url || /^blob:/i.test(url) || /^data:/i.test(url)) return url;
      const decoded = decodeURIComponent(String(url).split('?')[0]);
      const base = decoded
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .toLowerCase();
      const file = basenameLookup.get(base);
      if (file) {
        const blobUrl = URL.createObjectURL(file);
        this.registerObjectUrl(blobUrl);
        return blobUrl;
      }
      return url;
    });
  }

  async loadFbxFromBundle(normalizedMap, fbxKey) {
    const file = normalizedMap.get(fbxKey);
    if (!file) throw new Error('FBX missing from bundle');
    const buffer = await this.fileReaders.buffer(file);
    const basenameLookup = this._buildBasenameFileLookup(normalizedMap);
    const manager = new THREE.LoadingManager();
    this._applyFbxBundleUrlModifier(manager, basenameLookup);
    const loader = new FBXLoader(manager);
    const object = loader.parse(buffer, '');
    this.normalizeFbxScale(object);
    this.applyFbxVertexColorFallback(object);
    promoteFbxClassicMaterialsToPbr(object);
    return { object, animations: object.animations ?? [], sourceFile: file };
  }

  async loadFbx(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      try {
        const object = this.fbxLoader.parse(buffer, '');
        this.normalizeFbxScale(object);
        this.applyFbxVertexColorFallback(object);
        promoteFbxClassicMaterialsToPbr(object);
        resolve({ object, animations: object.animations ?? [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  normalizeFbxScale(object) {
    normalizeImportScale(object);
  }

  applyFbxVertexColorFallback(object) {
    if (!object) return;
    object.traverse((child) => {
      if (!child?.isMesh || !child.geometry) return;
      const hasVertexColor = !!child.geometry.getAttribute?.('color');
      if (hasVertexColor && !child.geometry.getAttribute('normal')) {
        child.geometry.computeVertexNormals();
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const patched = materials.map((material) => {
        if (!material) {
          return new THREE.MeshStandardMaterial({
            color: hasVertexColor ? 0xffffff : 0xababab,
            roughness: 0.85,
            metalness: 0.0,
            vertexColors: hasVertexColor,
          });
        }

        if (!hasVertexColor) return material;

        const hasAnyTextureMap = !!(
          material.map ||
          material.normalMap ||
          material.emissiveMap ||
          material.roughnessMap ||
          material.metalnessMap ||
          material.specularMap
        );

        // For untextured vertex-color FBX meshes, use a known-good PBR material path.
        // This avoids loader-specific material quirks that can render black in lit mode.
        if (!hasAnyTextureMap) {
          return new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.9,
            metalness: 0.0,
            vertexColors: true,
            side: material.side ?? THREE.DoubleSide,
            transparent: false,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,
          });
        }

        // Preserve original material type where possible, but force vertex color usage.
        if ('vertexColors' in material) {
          material.vertexColors = true;
        }

        // If source material is near-black with no texture map, white-balance it so
        // vertex colors remain visible under lit shading.
        const hasMap = !!material.map;
        const isVeryDark =
          material.color &&
          Number.isFinite(material.color.r) &&
          Number.isFinite(material.color.g) &&
          Number.isFinite(material.color.b) &&
          Math.max(material.color.r, material.color.g, material.color.b) < 0.08;
        if (!hasMap && isVeryDark && material.color) {
          material.color.setRGB(1, 1, 1);
        }
        material.needsUpdate = true;
        return material;
      });
      child.material = Array.isArray(child.material) ? patched : patched[0];
    });
  }

  async loadObj(file) {
    const text = await this.fileReaders.text(file);
    return new Promise((resolve, reject) => {
      try {
        const object = this.objLoader.parse(text);
        normalizeImportScale(object);
        resolve({ object, animations: [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadStl(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      try {
        const geometry = this.stlLoader.parse(buffer);
        const material = new THREE.MeshStandardMaterial({
          color: '#d0d0d0',
          roughness: 0.35,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.orbyStlImport = true;
        normalizeImportScale(mesh);
        resolve({
          object: mesh,
          animations: [],
          sourceFormat: 'stl',
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadUsd(file) {
    const buffer = await this.fileReaders.buffer(file);
    let object;
    if (typeof this.usdLoader.parse === 'function') {
      object = await this.usdLoader.parse(buffer);
    } else {
      const blobUrl = URL.createObjectURL(new Blob([buffer]));
      try {
        object = await this.usdLoader.loadAsync(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
    // Three.js USDZLoader only supports text USDA / non-crate USD inside USDZ.
    // Typical Apple / exporter USDZ uses binary USDC as the root — that yields an empty Group with no warning thrown.
    if (countMeshes(object) === 0) {
      throw new Error(
        'This USDZ uses binary USD (USDC). The viewer only loads USDZ packages whose main stage is text USDA—a common exporter default is USDC, which shows up empty here. Prefer GLB/glTF, or convert with usdcat and repackage if you control the asset.',
      );
    }
    normalizeImportScale(object);
    return { object, animations: [] };
  }

  normalizePath(path = '') {
    return path
      .replace(/\\/g, '/')
      .replace(/^(\.\/)+/, '')
      .replace(/\/{2,}/g, '/')
      .replace(/^\//, '')
      .trim();
  }

  getDirectoryFromPath(path = '') {
    const normalized = this.normalizePath(path);
    if (!normalized.includes('/')) return '';
    return normalized.replace(/[^/]+$/, '');
  }
}

