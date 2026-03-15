import * as THREE from 'three';
import { SVGLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/SVGLoader.js';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js';

const DEFAULT_DEPTH = 0.2;
const MIN_DEPTH = 0.01;
const MAX_DEPTH = 2.0;
const DEFAULT_NORMAL_ANGLE_DEG = 45;
const MIN_NORMAL_ANGLE_DEG = 0;
const MAX_NORMAL_ANGLE_DEG = 180;
const MIN_COLOR_OFFSET = -1.0;
const MAX_COLOR_OFFSET = 1.0;

const clampDepth = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DEPTH;
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, numeric));
};

const clampNormalAngleDeg = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_NORMAL_ANGLE_DEG;
  return Math.max(MIN_NORMAL_ANGLE_DEG, Math.min(MAX_NORMAL_ANGLE_DEG, numeric));
};

export class SvgExtrudeImporter {
  constructor() {
    this.loader = new SVGLoader();
    this.svgText = '';
    this.sourceName = 'SVG';
    this.group = null;
    this.currentDepth = DEFAULT_DEPTH;
    this.currentNormalAngleDeg = DEFAULT_NORMAL_ANGLE_DEG;
    this.currentColorDepths = {};
    this.currentColorOffsets = {};
    this.currentColorPalette = [];
    this.currentFlipDirection = false;
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
    this.currentNormalAngleDeg = clampNormalAngleDeg(options.normalAngleDeg ?? this.currentNormalAngleDeg);
    this.currentColorDepths = { ...(options.colorDepths || this.currentColorDepths || {}) };
    this.currentColorOffsets = { ...(options.colorOffsets || this.currentColorOffsets || {}) };
    this.currentFlipDirection = !!(options.flipDirection ?? this.currentFlipDirection);
    this.group = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    return this.group;
  }

  setDepth(nextDepth) {
    if (!this.svgText) {
      throw new Error('No SVG source available for depth update');
    }
    const depth = clampDepth(nextDepth);
    this.currentDepth = depth;
    const rebuilt = this._buildGroup(depth, this.currentNormalAngleDeg);
    if (!this.group) {
      this.group = rebuilt;
      return this.group;
    }
    this._replaceChildren(this.group, rebuilt);
    return this.group;
  }

  setColorOffsets(nextColorOffsets = {}) {
    if (!this.svgText) {
      throw new Error('No SVG source available for color offset update');
    }
    const sanitized = {};
    Object.entries(nextColorOffsets || {}).forEach(([color, offsetValue]) => {
      if (typeof color !== 'string') return;
      const key = color.toLowerCase();
      const numericOffset = Number(offsetValue);
      if (!Number.isFinite(numericOffset)) return;
      sanitized[key] = Math.max(MIN_COLOR_OFFSET, Math.min(MAX_COLOR_OFFSET, numericOffset));
    });
    this.currentColorOffsets = sanitized;
    const rebuilt = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    if (!this.group) {
      this.group = rebuilt;
      return this.group;
    }
    this._replaceChildren(this.group, rebuilt);
    return this.group;
  }

  setNormalAngleDeg(nextNormalAngleDeg) {
    if (!this.svgText) {
      throw new Error('No SVG source available for normal angle update');
    }
    const normalAngleDeg = clampNormalAngleDeg(nextNormalAngleDeg);
    this.currentNormalAngleDeg = normalAngleDeg;
    const rebuilt = this._buildGroup(this.currentDepth, normalAngleDeg);
    if (!this.group) {
      this.group = rebuilt;
      return this.group;
    }
    this._replaceChildren(this.group, rebuilt);
    return this.group;
  }

  setColorDepths(nextColorDepths = {}) {
    if (!this.svgText) {
      throw new Error('No SVG source available for color depth update');
    }
    const sanitized = {};
    Object.entries(nextColorDepths || {}).forEach(([color, depthValue]) => {
      if (typeof color !== 'string') return;
      const key = color.toLowerCase();
      const depth = clampDepth(depthValue);
      if (!Number.isFinite(depth)) return;
      sanitized[key] = depth;
    });
    this.currentColorDepths = sanitized;
    const rebuilt = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    if (!this.group) {
      this.group = rebuilt;
      return this.group;
    }
    this._replaceChildren(this.group, rebuilt);
    return this.group;
  }

  setFlipDirection(enabled) {
    if (!this.svgText) {
      throw new Error('No SVG source available for direction update');
    }
    this.currentFlipDirection = !!enabled;
    const rebuilt = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
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

  getNormalAngleDeg() {
    return this.currentNormalAngleDeg;
  }

  getColorDepths() {
    return { ...this.currentColorDepths };
  }

  getAvailableColors() {
    return [...this.currentColorPalette];
  }

  getColorOffsets() {
    return { ...this.currentColorOffsets };
  }

  getFlipDirection() {
    return !!this.currentFlipDirection;
  }

  _buildGroup(depth, normalAngleDeg) {
    const data = this.loader.parse(this.svgText);
    const group = new THREE.Group();
    group.name = this.sourceName.replace(/\.[^/.]+$/, '') || 'SVG';
    group.userData.orbySvgExtrude = true;
    group.userData.orbySvgExtrudeDepth = depth;
    group.userData.orbySvgNormalAngleDeg = normalAngleDeg;
    group.userData.orbySvgFlipDirection = this.currentFlipDirection;

    const creaseAngleRad = THREE.MathUtils.degToRad(clampNormalAngleDeg(normalAngleDeg));

    const extrudeSettings = {
      depth,
      steps: 1,
      curveSegments: 16,
      bevelEnabled: false,
    };

    let meshCount = 0;

    const colorPaletteSet = new Set();
    for (const path of data.paths || []) {
      const fill = path?.userData?.style?.fill;
      if (!fill || fill === 'none') continue;
      const opacity = Number(path?.userData?.style?.fillOpacity ?? 1);
      if (!Number.isFinite(opacity) || opacity <= 0) continue;

      const shapes = SVGLoader.createShapes(path);
      if (!shapes?.length) continue;

      const baseColor = path.color?.isColor ? path.color.clone() : new THREE.Color(0xffffff);
      const baseHex = `#${baseColor.getHexString().toLowerCase()}`;
      colorPaletteSet.add(baseHex);
      const perColorDepth = this.currentColorDepths?.[baseHex];
      const perColorOffset = this.currentColorOffsets?.[baseHex];
      const effectiveDepth = Number.isFinite(perColorDepth)
        ? clampDepth(perColorDepth)
        : depth;
      const effectiveOffset = Number.isFinite(Number(perColorOffset))
        ? Math.max(MIN_COLOR_OFFSET, Math.min(MAX_COLOR_OFFSET, Number(perColorOffset)))
        : 0;
      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.FrontSide,
      });

      for (const shape of shapes) {
        const geometry = new THREE.ExtrudeGeometry(shape, {
          ...extrudeSettings,
          depth: effectiveDepth,
        });
        // Smooth curved surfaces while preserving sharper corners via crease angle.
        const smoothedGeometry = toCreasedNormals(geometry, creaseAngleRad);
        geometry.dispose();
        const mesh = new THREE.Mesh(smoothedGeometry, material.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.orbySvgExtrude = true;
        mesh.userData.orbySvgEffectiveDepth = effectiveDepth;
        mesh.userData.orbySvgColorOffset = effectiveOffset;
        mesh.userData.orbySvgBaseColor = `#${baseColor.getHexString()}`;
        mesh.userData.orbySvgBaseColorLinear = {
          r: baseColor.r,
          g: baseColor.g,
          b: baseColor.b,
        };
        group.add(mesh);
        meshCount += 1;
      }

      material.dispose();
    }

    if (!meshCount) {
      throw new Error('SVG has no filled paths to extrude');
    }
    this.currentColorPalette = [...colorPaletteSet].sort();

    this._normalizeGeometrySpace(group);
    this._applyDirectionOffset(group, this.currentFlipDirection);
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

  _applyDirectionOffset(group, flipDirection) {
    group.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const depth = clampDepth(child.userData?.orbySvgEffectiveDepth ?? this.currentDepth);
      const colorOffset = Math.max(
        MIN_COLOR_OFFSET,
        Math.min(MAX_COLOR_OFFSET, Number(child.userData?.orbySvgColorOffset ?? 0)),
      );
      const directionOffset = (flipDirection ? 1 : -1) * depth * 0.5;
      child.geometry.translate(0, 0, directionOffset + colorOffset);
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    });
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
