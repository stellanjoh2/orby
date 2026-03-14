import * as THREE from 'three';
import { SVGLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/SVGLoader.js';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js';

const DEFAULT_DEPTH = 0.2;
const MIN_DEPTH = 0.01;
const MAX_DEPTH = 2.0;
const CREASE_ANGLE_RAD = THREE.MathUtils.degToRad(45);

const clampDepth = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DEPTH;
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, numeric));
};

export class SvgExtrudeImporter {
  constructor() {
    this.loader = new SVGLoader();
    this.svgText = '';
    this.sourceName = 'SVG';
    this.group = null;
    this.currentDepth = DEFAULT_DEPTH;
  }

  async loadFromFile(file, options = {}) {
    const text = await file.text();
    return this.loadFromText(text, file?.name || 'SVG', options);
  }

  loadFromText(svgText, sourceName = 'SVG', options = {}) {
    if (!svgText || typeof svgText !== 'string') {
      throw new Error('SVG file is empty or invalid');
    }
    this.svgText = svgText;
    this.sourceName = sourceName;
    this.currentDepth = clampDepth(options.depth ?? this.currentDepth);
    this.group = this._buildGroup(this.currentDepth);
    return this.group;
  }

  setDepth(nextDepth) {
    if (!this.svgText) {
      throw new Error('No SVG source available for depth update');
    }
    const depth = clampDepth(nextDepth);
    this.currentDepth = depth;
    const rebuilt = this._buildGroup(depth);
    if (!this.group) {
      this.group = rebuilt;
      return this.group;
    }
    this._replaceChildren(this.group, rebuilt);
    return this.group;
  }

  getDepth() {
    return this.currentDepth;
  }

  _buildGroup(depth) {
    const data = this.loader.parse(this.svgText);
    const group = new THREE.Group();
    group.name = this.sourceName.replace(/\.[^/.]+$/, '') || 'SVG';
    group.userData.orbySvgExtrude = true;
    group.userData.orbySvgExtrudeDepth = depth;

    const extrudeSettings = {
      depth,
      steps: 1,
      curveSegments: 16,
      bevelEnabled: false,
    };

    let meshCount = 0;

    for (const path of data.paths || []) {
      const fill = path?.userData?.style?.fill;
      if (!fill || fill === 'none') continue;
      const opacity = Number(path?.userData?.style?.fillOpacity ?? 1);
      if (!Number.isFinite(opacity) || opacity <= 0) continue;

      const shapes = SVGLoader.createShapes(path);
      if (!shapes?.length) continue;

      const baseColor = path.color?.isColor ? path.color.clone() : new THREE.Color(0xffffff);
      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.FrontSide,
      });

      for (const shape of shapes) {
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Smooth curved surfaces while preserving sharper corners via crease angle.
        const smoothedGeometry = toCreasedNormals(geometry, CREASE_ANGLE_RAD);
        geometry.dispose();
        const mesh = new THREE.Mesh(smoothedGeometry, material.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.orbySvgExtrude = true;
        mesh.userData.orbySvgBaseColor = `#${baseColor.getHexString()}`;
        group.add(mesh);
        meshCount += 1;
      }

      material.dispose();
    }

    if (!meshCount) {
      throw new Error('SVG has no filled paths to extrude');
    }

    this._normalizeGeometrySpace(group);
    return group;
  }

  _normalizeGeometrySpace(group) {
    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) return;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);

    // Normalize XY footprint so different SVGs land at a consistent size,
    // but keep Z unscaled so extrusion depth remains visually meaningful.
    const maxXY = Math.max(size.x, size.y);
    const targetSize = 2.0;
    const uniformScale = maxXY > 0 ? targetSize / maxXY : 1;

    group.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      child.geometry.translate(-center.x, -center.y, -center.z);
      child.geometry.scale(uniformScale, uniformScale, 1);
      // Flip SVG's Y-down space into scene space without mirrored handedness.
      child.geometry.rotateX(Math.PI);
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    });

    // Recenter Z after scale to ensure depth stays centered around origin.
    const normalizedBounds = new THREE.Box3().setFromObject(group);
    if (!normalizedBounds.isEmpty()) {
      const normalizedCenter = new THREE.Vector3();
      normalizedBounds.getCenter(normalizedCenter);
      group.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;
        child.geometry.translate(0, 0, -normalizedCenter.z);
        child.geometry.computeBoundingBox();
        child.geometry.computeBoundingSphere();
      });
    }
  }

  _replaceChildren(targetGroup, sourceGroup) {
    while (targetGroup.children.length) {
      const child = targetGroup.children[0];
      this._disposeNode(child);
      targetGroup.remove(child);
    }

    // Move all children safely; mutating the source array while iterating
    // with forEach can skip items and make parts of the SVG disappear.
    while (sourceGroup.children.length) {
      targetGroup.add(sourceGroup.children[0]);
    }

    targetGroup.name = sourceGroup.name;
    targetGroup.userData = { ...sourceGroup.userData };
    targetGroup.scale.copy(sourceGroup.scale);
    targetGroup.position.copy(sourceGroup.position);
    targetGroup.rotation.copy(sourceGroup.rotation);
  }

  _disposeNode(node) {
    node.traverse?.((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat?.dispose?.());
      } else {
        child.material?.dispose?.();
      }
    });
  }
}
