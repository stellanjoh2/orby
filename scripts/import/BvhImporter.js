import * as THREE from 'three';
import { BVHLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/BVHLoader.js';
import { normalizeImportScale } from './normalizeImportScale.js';
import { findArmatureRootBone } from './bvhArmatureBounds.js';

export class BvhImporter {
  constructor() {
    this.loader = new BVHLoader();
  }

  /**
   * @param {string} text — raw BVH file contents
   * @param {string} [fileName]
   */
  parse(text, fileName = 'capture.bvh') {
    const { skeleton, clip } = this.loader.parse(text);
    if (!skeleton?.bones?.length || !clip) {
      throw new Error('BVH file did not contain a skeleton or animation clip.');
    }

    const assetName = fileName.replace(/\.[^/.]+$/, '') || 'BVH';
    if (!clip.name || clip.name === 'animation') {
      clip.name = assetName;
    }

    const root = new THREE.Group();
    root.name = assetName;
    root.userData.orbyBvhImport = true;

    const rootBone = findArmatureRootBone(skeleton.bones);
    if (!rootBone) {
      throw new Error('BVH skeleton has no root bone.');
    }
    root.add(rootBone);

    normalizeImportScale(root);

    return {
      object: root,
      animations: [clip],
      gltfMetadata: {
        assetName,
        generator: 'Biovision Hierarchy (BVH)',
        version: null,
        copyright: null,
      },
      bvh: {
        enabled: true,
        boneCount: skeleton.bones.length,
        frameCount: clip.tracks[0]?.times?.length ?? 0,
        durationSec: clip.duration,
      },
    };
  }

  /**
   * @param {File} file
   * @param {(file: File) => Promise<string>} readText
   */
  async loadFromFile(file, readText) {
    const text = await readText(file);
    return this.parse(text, file.name);
  }
}
