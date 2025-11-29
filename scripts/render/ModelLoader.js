import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/STLLoader.js';
import { USDZLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/USDZLoader.js';

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
    if (this.gltfLoader.setMeshoptDecoder && MeshoptDecoder) {
      this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    this.fbxLoader = new FBXLoader();
    this.objLoader = new OBJLoader();
    this.stlLoader = new STLLoader();
    this.usdLoader = new USDZLoader();
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

  async loadFile(file) {
    if (!file) throw new Error('No file provided');
    const extension = file.name.split('.').pop().toLowerCase();
    const asset = await this.parseFileByExtension(file, extension);
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
      throw new Error('No .gltf/.glb in folder');
    }

    const rootPath = this.getDirectoryFromPath(primaryKey);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder?.(MeshoptDecoder);
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

  async parseFileByExtension(file, ext) {
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
      default:
        throw new Error(`Unsupported format: .${ext}`);
    }
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
      if (loader.setMeshoptDecoder && MeshoptDecoder) {
        loader.setMeshoptDecoder(MeshoptDecoder);
      }
      
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

  async loadFbx(file) {
    const buffer = await this.fileReaders.buffer(file);
    return new Promise((resolve, reject) => {
      try {
        const object = this.fbxLoader.parse(buffer, '');
        resolve({ object, animations: object.animations ?? [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadObj(file) {
    const text = await this.fileReaders.text(file);
    return new Promise((resolve, reject) => {
      try {
        const object = this.objLoader.parse(text);
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
        const geometry = this.stlLoader.parse(buffer, { invert: true });
        const material = new THREE.MeshStandardMaterial({
          color: '#d0d0d0',
          roughness: 0.35,
          metalness: 0.05,
        });
        const mesh = new THREE.Mesh(geometry, material);
        resolve({ object: mesh, animations: [] });
      } catch (error) {
        reject(error);
      }
    });
  }

  async loadUsd(file) {
    const buffer = await this.fileReaders.buffer(file);
    if (typeof this.usdLoader.parse === 'function') {
      const object = await this.usdLoader.parse(buffer);
      return { object, animations: [] };
    }
    const blobUrl = URL.createObjectURL(new Blob([buffer]));
    try {
      const object = await this.usdLoader.loadAsync(blobUrl);
      return { object, animations: [] };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
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

