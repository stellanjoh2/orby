import * as THREE from 'three';
import { DEFAULT_MATERIAL_ROUGHNESS } from '../constants.js';
import { fixExtrudedSvgCapFaceOrientations } from './svgExtrudeCapNormals.js';
import {
  FONT_EXTRUDE_TARGET_CAP_HEIGHT,
  resolveFontExtrudeSampling,
} from './fontExtrudeSampling.js';
import { opentypePathHasArea, opentypePathToShapes } from './opentypePathToShape.js';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';

const DEFAULT_DEPTH = 0.2;
const MIN_DEPTH = 0.01;
const MAX_DEPTH = 2.0;
const DEFAULT_NORMAL_ANGLE_DEG = 45;
const MIN_NORMAL_ANGLE_DEG = 0;
const MAX_NORMAL_ANGLE_DEG = 180;
const MIN_COLOR_OFFSET = -1.0;
const MAX_COLOR_OFFSET = 1.0;
const DEFAULT_GLYPH_FILL = '#ffffff';

/** @param {string} [value] */
export function normalizeGlyphFillHex(value) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return DEFAULT_GLYPH_FILL;
}

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

/**
 * Direct opentype glyph → THREE.Shape → ExtrudeGeometry (no SVG, no densify).
 */
export class FontExtrudeImporter {
  constructor() {
    this.sourceName = 'Text';
    this.group = null;
    /** @type {Array<{ glyphPath: import('../vendor/opentype.module.js').Path }>} */
    this._glyphEntries = [];
    this.currentDepth = DEFAULT_DEPTH;
    this.currentNormalAngleDeg = DEFAULT_NORMAL_ANGLE_DEG;
    this.currentColorDepths = {};
    this.currentColorOffsets = {};
    this.currentFillColor = DEFAULT_GLYPH_FILL;
    this.currentColorPalette = [DEFAULT_GLYPH_FILL];
    this.currentFlipDirection = false;
    this._layoutFontSize = 72;
    this._sampling = resolveFontExtrudeSampling('medium');
  }

  /**
   * @param {Object} layout — from FontExtrudeController.layoutTextAsync
   * @param {Object} [options]
   */
  buildFromLayout(layout, options = {}) {
    this._glyphEntries = [];
    for (const line of layout?.lines || []) {
      for (const entry of line.paths || []) {
        if (entry?.glyphPath && opentypePathHasArea(entry.glyphPath)) {
          this._glyphEntries.push({ glyphPath: entry.glyphPath });
        }
      }
    }
    if (!this._glyphEntries.length) {
      throw new Error('Text has no filled paths to extrude');
    }
    this.sourceName = options.sourceName || 'Text';
    this.currentDepth = clampDepth(options.depth ?? this.currentDepth);
    this.currentNormalAngleDeg = clampNormalAngleDeg(
      options.normalAngleDeg ?? this.currentNormalAngleDeg,
    );
    this.currentColorDepths = { ...(options.colorDepths || this.currentColorDepths || {}) };
    this.currentColorOffsets = { ...(options.colorOffsets || this.currentColorOffsets || {}) };
    this.currentFlipDirection = !!(options.flipDirection ?? this.currentFlipDirection);
    if (options.fillColor) {
      this.currentFillColor = normalizeGlyphFillHex(options.fillColor);
      this.currentColorPalette = [this.currentFillColor];
    }
    this._layoutFontSize = Number(layout?.fontSize) > 0 ? Number(layout.fontSize) : 72;
    this._sampling = resolveFontExtrudeSampling(options.detail ?? 'medium');
    this.group = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    return this.group;
  }

  setDepth(nextDepth) {
    if (!this._glyphEntries.length) throw new Error('No font layout available for depth update');
    const newDepth = clampDepth(nextDepth);
    const oldDepth = this.currentDepth;
    if (
      oldDepth > 0 &&
      Math.abs(newDepth - oldDepth) > 1e-6 &&
      Object.keys(this.currentColorDepths).length > 0
    ) {
      const ratio = newDepth / oldDepth;
      const scaled = {};
      Object.entries(this.currentColorDepths).forEach(([color, depthValue]) => {
        scaled[color] = clampDepth(Number(depthValue) * ratio);
      });
      this.currentColorDepths = scaled;
    }
    this.currentDepth = newDepth;
    return this._rebuildPreserveGroup();
  }

  setNormalAngleDeg(nextNormalAngleDeg) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    this.currentNormalAngleDeg = clampNormalAngleDeg(nextNormalAngleDeg);
    return this._rebuildPreserveGroup();
  }

  setColorDepths(nextColorDepths = {}) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    const sanitized = {};
    Object.entries(nextColorDepths || {}).forEach(([color, depthValue]) => {
      if (typeof color !== 'string') return;
      const key = color.toLowerCase();
      const depth = clampDepth(depthValue);
      if (Number.isFinite(depth)) sanitized[key] = depth;
    });
    this.currentColorDepths = sanitized;
    return this._rebuildPreserveGroup();
  }

  setColorOffsets(nextColorOffsets = {}) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    const sanitized = {};
    Object.entries(nextColorOffsets || {}).forEach(([color, offsetValue]) => {
      if (typeof color !== 'string') return;
      const key = color.toLowerCase();
      const numericOffset = Number(offsetValue);
      if (!Number.isFinite(numericOffset)) return;
      sanitized[key] = Math.max(MIN_COLOR_OFFSET, Math.min(MAX_COLOR_OFFSET, numericOffset));
    });
    this.currentColorOffsets = sanitized;
    return this._rebuildPreserveGroup();
  }

  setFlipDirection(enabled) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    this.currentFlipDirection = !!enabled;
    return this._rebuildPreserveGroup();
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

  getColorOffsets() {
    return { ...this.currentColorOffsets };
  }

  getAvailableColors() {
    return [...this.currentColorPalette];
  }

  getFillColor() {
    return this.currentFillColor;
  }

  getFlipDirection() {
    return !!this.currentFlipDirection;
  }

  _rebuildPreserveGroup() {
    const rebuilt = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    if (!this.group) {
      this.group = rebuilt;
      return this.group;
    }
    this._replaceChildren(this.group, rebuilt);
    return this.group;
  }

  _buildGroup(depth, normalAngleDeg) {
    const group = new THREE.Group();
    group.name = this.sourceName;
    group.userData.orbySvgExtrude = true;
    group.userData.orbyFontExtrude = true;
    group.userData.orbySvgExtrudeDepth = depth;
    group.userData.orbySvgNormalAngleDeg = normalAngleDeg;
    group.userData.orbySvgFlipDirection = this.currentFlipDirection;

    const creaseAngleRad = THREE.MathUtils.degToRad(clampNormalAngleDeg(normalAngleDeg));
    const fillHex = this.currentFillColor.toLowerCase();
    const effectiveDepth = Number.isFinite(this.currentColorDepths?.[fillHex])
      ? clampDepth(this.currentColorDepths[fillHex])
      : depth;
    const effectiveOffset = Number.isFinite(Number(this.currentColorOffsets?.[fillHex]))
      ? Math.max(MIN_COLOR_OFFSET, Math.min(MAX_COLOR_OFFSET, Number(this.currentColorOffsets[fillHex])))
      : 0;

    const baseColor = new THREE.Color(this.currentFillColor);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      metalness: 0.0,
      side: THREE.FrontSide,
    });

    const extrudeSettings = {
      depth: effectiveDepth,
      steps: 1,
      curveSegments: this._sampling.sideSegments,
      bevelEnabled: false,
    };

    let meshCount = 0;
    for (const { glyphPath } of this._glyphEntries) {
      const shapes = opentypePathToShapes(glyphPath, this._sampling.curveDivisions);
      for (const shape of shapes) {
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const smoothedGeometry = toCreasedNormals(geometry, creaseAngleRad);
        geometry.dispose();
        const mesh = new THREE.Mesh(smoothedGeometry, material.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.orbySvgExtrude = true;
        mesh.userData.orbyFontExtrude = true;
        mesh.userData.orbyFontGenerated = true;
        mesh.userData.orbySvgEffectiveDepth = effectiveDepth;
        mesh.userData.orbySvgColorOffset = effectiveOffset;
        mesh.userData.orbySvgBaseColor = this.currentFillColor;
        mesh.userData.orbySvgGroupedColor = fillHex;
        mesh.userData.orbySvgBaseColorLinear = {
          r: baseColor.r,
          g: baseColor.g,
          b: baseColor.b,
        };
        group.add(mesh);
        meshCount += 1;
      }
    }

    material.dispose();
    if (!meshCount) {
      throw new Error('Text has no filled paths to extrude');
    }

    this._normalizeFontGeometrySpace(group, this._layoutFontSize);
    this._applyDirectionOffset(group, this.currentFlipDirection);

    group.traverse((child) => {
      if (!child.isMesh || !child.geometry || !child.userData?.orbySvgExtrude) return;
      const nextGeom = fixExtrudedSvgCapFaceOrientations(child.geometry, creaseAngleRad);
      if (nextGeom !== child.geometry) {
        child.geometry.dispose();
        child.geometry = nextGeom;
      }
    });

    return group;
  }

  /**
   * Scale by em height so adding lines/words does not shrink individual glyphs
   * (unlike SVG import, which fits the whole asset into ~2 units).
   */
  _normalizeFontGeometrySpace(group, layoutFontSize) {
    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) return;
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    const em = Number(layoutFontSize) > 0 ? Number(layoutFontSize) : 72;
    const uniformScale = FONT_EXTRUDE_TARGET_CAP_HEIGHT / em;

    group.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      child.geometry.translate(-center.x, -center.y, -center.z);
      child.geometry.scale(uniformScale, uniformScale, 1);
      child.geometry.rotateX(Math.PI);
      child.geometry.computeBoundingBox();
      child.geometry.computeBoundingSphere();
    });

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

  _replaceChildren(targetGroup, sourceGroup) {
    while (targetGroup.children.length) {
      const child = targetGroup.children[0];
      this._disposeNode(child);
      targetGroup.remove(child);
    }
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
