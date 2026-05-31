import * as THREE from 'three';
import { DEFAULT_MATERIAL_ROUGHNESS } from '../constants.js';
import {
  clampExtrudeBevelAmount,
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  resolveExtrudeBevelSettings,
} from './extrudeBevel.js';
import {
  normalizeExtrudeDetail,
  resolveExtrudeDetailSettings,
} from './extrudeDetail.js';
import { withPatchedCapTriangulation } from './extrudeCapTriangulation.js';
import {
  applyExtrudeDirectionOffset,
  clampExtrudeColorOffset,
  clampExtrudeDepth,
  clampExtrudeNormalAngleDeg,
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
  finalizeExtrudeGroupGeometry,
  preserveExtrudeGroupOnRebuild,
} from './extrudeImporterShared.js';
import {
  buildExtrudeGeometrySafe,
  sanitizeShapeForExtrudeGeometry,
} from './extrudeShapeSanitize.js';
import { densifyShapeForExtrudeCaps } from './extrudeDensify.js';
import { SVGLoader } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/loaders/SVGLoader.js';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';

const COLOR_GROUP_QUANTIZE_STEP = 24;

const quantizeColorChannel = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  return Math.max(
    0,
    Math.min(255, Math.round(clamped / COLOR_GROUP_QUANTIZE_STEP) * COLOR_GROUP_QUANTIZE_STEP),
  );
};

export class SvgExtrudeImporter {
  constructor() {
    this.loader = new SVGLoader();
    this.svgText = '';
    this.sourceName = 'SVG';
    this.group = null;
    this.currentDepth = DEFAULT_EXTRUDE_DEPTH;
    this.currentNormalAngleDeg = DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
    this.currentColorDepths = {};
    this.currentColorOffsets = {};
    this.currentColorPalette = [];
    this.currentFlipDirection = false;
    this.currentBevelAmount = DEFAULT_EXTRUDE_BEVEL_AMOUNT;
    /** @type {'low' | 'medium' | 'high' | 'ultra'} */
    this.currentDetail = 'medium';
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
    this.currentDepth = clampExtrudeDepth(options.depth ?? this.currentDepth);
    this.currentNormalAngleDeg = clampExtrudeNormalAngleDeg(
      options.normalAngleDeg ?? this.currentNormalAngleDeg,
    );
    this.currentColorDepths = { ...(options.colorDepths || this.currentColorDepths || {}) };
    this.currentColorOffsets = { ...(options.colorOffsets || this.currentColorOffsets || {}) };
    this.currentFlipDirection = !!(options.flipDirection ?? this.currentFlipDirection);
    this.currentBevelAmount = clampExtrudeBevelAmount(
      options.bevelAmount ?? this.currentBevelAmount,
      this.currentDepth,
    );
    this.currentDetail = normalizeExtrudeDetail(options.detail ?? this.currentDetail);
    this.group = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    return this.group;
  }

  setDepth(nextDepth) {
    if (!this.svgText) {
      throw new Error('No SVG source available for depth update');
    }
    const newDepth = clampExtrudeDepth(nextDepth);
    const oldDepth = this.currentDepth;
    if (
      oldDepth > 0 &&
      Math.abs(newDepth - oldDepth) > 1e-6 &&
      Object.keys(this.currentColorDepths).length > 0
    ) {
      const ratio = newDepth / oldDepth;
      const scaled = {};
      Object.entries(this.currentColorDepths).forEach(([color, depthValue]) => {
        scaled[color] = clampExtrudeDepth(Number(depthValue) * ratio);
      });
      this.currentColorDepths = scaled;
    }
    this.currentDepth = newDepth;
    this.currentBevelAmount = clampExtrudeBevelAmount(
      this.currentBevelAmount,
      this.currentDepth,
    );
    return this._rebuildPreserveGroup(newDepth, this.currentNormalAngleDeg);
  }

  /**
   * @param {{ amount?: unknown }} [settings]
   */
  setBevelSettings(settings = {}) {
    if (!this.svgText) {
      throw new Error('No SVG source available for bevel update');
    }
    if (settings.amount !== undefined) {
      this.currentBevelAmount = clampExtrudeBevelAmount(
        settings.amount,
        this.currentDepth,
      );
    }
    return this._rebuildPreserveGroup();
  }

  setDetail(nextDetail) {
    if (!this.svgText) {
      throw new Error('No SVG source available for detail update');
    }
    this.currentDetail = normalizeExtrudeDetail(nextDetail);
    return this._rebuildPreserveGroup();
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
      sanitized[key] = clampExtrudeColorOffset(numericOffset);
    });
    this.currentColorOffsets = sanitized;
    return this._rebuildPreserveGroup();
  }

  setNormalAngleDeg(nextNormalAngleDeg) {
    if (!this.svgText) {
      throw new Error('No SVG source available for normal angle update');
    }
    this.currentNormalAngleDeg = clampExtrudeNormalAngleDeg(nextNormalAngleDeg);
    return this._rebuildPreserveGroup(this.currentDepth, this.currentNormalAngleDeg);
  }

  setColorDepths(nextColorDepths = {}) {
    if (!this.svgText) {
      throw new Error('No SVG source available for color depth update');
    }
    const sanitized = {};
    Object.entries(nextColorDepths || {}).forEach(([color, depthValue]) => {
      if (typeof color !== 'string') return;
      const key = color.toLowerCase();
      const depth = clampExtrudeDepth(depthValue);
      if (!Number.isFinite(depth)) return;
      sanitized[key] = depth;
    });
    this.currentColorDepths = sanitized;
    return this._rebuildPreserveGroup();
  }

  setFlipDirection(enabled) {
    if (!this.svgText) {
      throw new Error('No SVG source available for direction update');
    }
    this.currentFlipDirection = !!enabled;
    return this._rebuildPreserveGroup();
  }

  _rebuildPreserveGroup(depth = this.currentDepth, normalAngleDeg = this.currentNormalAngleDeg) {
    const rebuilt = this._buildGroup(depth, normalAngleDeg);
    this.group = preserveExtrudeGroupOnRebuild(this.group, rebuilt);
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

  getBevelAmount() {
    return this.currentBevelAmount;
  }

  getDetail() {
    return this.currentDetail;
  }

  _computeSvgXyNormalizeScale(data) {
    const box = new THREE.Box2();
    box.makeEmpty();
    for (const path of data.paths || []) {
      const shapes = SVGLoader.createShapes(path);
      for (const shape of shapes || []) {
        const extracted = shape.extractPoints?.(12);
        for (const point of extracted?.shape || []) {
          box.expandByPoint(point);
        }
        for (const hole of extracted?.holes || []) {
          for (const point of hole) {
            box.expandByPoint(point);
          }
        }
      }
    }
    const size = new THREE.Vector2();
    box.getSize(size);
    const maxXY = Math.max(size.x, size.y);
    return maxXY > 0 ? 2.0 / maxXY : 1;
  }

  _buildGroup(depth, normalAngleDeg) {
    const data = this.loader.parse(this.svgText);
    const group = new THREE.Group();
    group.name = this.sourceName.replace(/\.[^/.]+$/, '') || 'SVG';
    group.userData.orbySvgExtrude = true;
    group.userData.orbySvgExtrudeDepth = depth;
    group.userData.orbySvgNormalAngleDeg = normalAngleDeg;
    group.userData.orbySvgFlipDirection = this.currentFlipDirection;

    const creaseAngleRad = THREE.MathUtils.degToRad(clampExtrudeNormalAngleDeg(normalAngleDeg));
    const xyNormalizeScale = this._computeSvgXyNormalizeScale(data);

    const extrudeSettings = {
      depth,
      steps: 1,
      curveSegments: 1,
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
      const exactHex = `#${baseColor.getHexString().toLowerCase()}`;
      const groupedColor = new THREE.Color(
        quantizeColorChannel(baseColor.r * 255) / 255,
        quantizeColorChannel(baseColor.g * 255) / 255,
        quantizeColorChannel(baseColor.b * 255) / 255,
      );
      const groupedHex = `#${groupedColor.getHexString().toLowerCase()}`;
      colorPaletteSet.add(groupedHex);
      // Prefer grouped values, but preserve compatibility with previously saved exact color keys.
      const perColorDepth = this.currentColorDepths?.[groupedHex] ?? this.currentColorDepths?.[exactHex];
      const perColorOffset = this.currentColorOffsets?.[groupedHex] ?? this.currentColorOffsets?.[exactHex];
      const effectiveDepth = Number.isFinite(perColorDepth)
        ? clampExtrudeDepth(perColorDepth)
        : depth;
      const effectiveOffset = clampExtrudeColorOffset(perColorOffset);
      const material = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
        metalness: 0.0,
        side: THREE.FrontSide,
      });

      for (const shape of shapes) {
        const bevelSettings = resolveExtrudeBevelSettings({
          amount: this.currentBevelAmount,
          depth: effectiveDepth,
          xyNormalizeScale,
        });
        const detailSettings = resolveExtrudeDetailSettings(this.currentDetail, {
          bevelEnabled: !!bevelSettings.bevelEnabled,
        });
        const smoothedGeometry = this._extrudeShapeWithBevel(
          shape,
          { ...extrudeSettings, depth: effectiveDepth },
          bevelSettings,
          detailSettings,
          creaseAngleRad,
        );
        const mesh = new THREE.Mesh(smoothedGeometry, material.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.orbySvgExtrude = true;
        mesh.userData.orbySvgEffectiveDepth = effectiveDepth;
        mesh.userData.orbySvgColorOffset = effectiveOffset;
        mesh.userData.orbySvgBaseColor = `#${baseColor.getHexString()}`;
        mesh.userData.orbySvgGroupedColor = groupedHex;
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
    applyExtrudeDirectionOffset(group, this.currentFlipDirection, this.currentDepth);
    finalizeExtrudeGroupGeometry(group, creaseAngleRad);

    return group;
  }

  /**
   * @param {THREE.Shape} shape
   * @param {Object} extrudeSettings
   * @param {Object} bevelSettings
   * @param {number} creaseAngleRad
   * @returns {THREE.BufferGeometry}
   */
  _extrudeShapeWithBevel(shape, extrudeSettings, bevelSettings, detailSettings, creaseAngleRad) {
    const denseShape = this._densifyShapeForTriangulation(shape, detailSettings);
    const curveSegments = 16;
    const safeShape = sanitizeShapeForExtrudeGeometry(denseShape, curveSegments);
    let geometry = withPatchedCapTriangulation(() => buildExtrudeGeometrySafe(safeShape, {
      ...extrudeSettings,
      curveSegments,
    }, THREE.ExtrudeGeometry, bevelSettings));
    const smoothedGeometry = toCreasedNormals(geometry, creaseAngleRad);
    geometry.dispose();
    return smoothedGeometry;
  }

  _densifyShapeForTriangulation(shape, detailSettings) {
    return densifyShapeForExtrudeCaps(shape, detailSettings);
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

}
