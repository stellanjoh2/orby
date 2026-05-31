import * as THREE from 'three';
import { DEFAULT_MATERIAL_ROUGHNESS } from '../constants.js';
import {
  clampExtrudeBevelAmount,
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  resolveExtrudeBevelSettings,
} from './extrudeBevel.js';
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
import { geometryHasNaNPositions } from './extrudeShapeSanitize.js';
import {
  FONT_EXTRUDE_TARGET_CAP_HEIGHT,
  normalizeExtrudeDetail,
  resolveBevelSideCurveSegments,
  resolveExtrudeDetailSettings,
} from './extrudeDetail.js';
import { opentypePathHasArea, opentypePathToShapes } from './opentypePathToShape.js';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/utils/BufferGeometryUtils.js';

const DEFAULT_GLYPH_FILL = '#ffffff';

/** @param {string} [value] */
export function normalizeGlyphFillHex(value) {
  if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim())) {
    return value.trim().toLowerCase();
  }
  return DEFAULT_GLYPH_FILL;
}

/**
 * Direct opentype glyph → THREE.Shape → stock ExtrudeGeometry (no custom cap triangulation).
 */
export class FontExtrudeImporter {
  constructor() {
    this.sourceName = 'Text';
    this.group = null;
    /** @type {Array<{ glyphPath: import('../vendor/opentype.module.js').Path }>} */
    this._glyphEntries = [];
    this.currentDepth = DEFAULT_EXTRUDE_DEPTH;
    this.currentNormalAngleDeg = DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG;
    this.currentColorDepths = {};
    this.currentColorOffsets = {};
    this.currentFillColor = DEFAULT_GLYPH_FILL;
    this.currentColorPalette = [DEFAULT_GLYPH_FILL];
    this.currentFlipDirection = false;
    this.currentBevelAmount = DEFAULT_EXTRUDE_BEVEL_AMOUNT;
    this._layoutFontSize = 72;
    /** @type {'low' | 'medium' | 'high' | 'ultra'} */
    this._detailLevel = 'medium';
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
    if (options.fillColor) {
      this.currentFillColor = normalizeGlyphFillHex(options.fillColor);
      this.currentColorPalette = [this.currentFillColor];
    }
    this._layoutFontSize = Number(layout?.fontSize) > 0 ? Number(layout.fontSize) : 72;
    this._detailLevel = normalizeExtrudeDetail(options.detail ?? this._detailLevel);
    this.group = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    return this.group;
  }

  setDepth(nextDepth) {
    if (!this._glyphEntries.length) throw new Error('No font layout available for depth update');
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
    return this._rebuildPreserveGroup();
  }

  setNormalAngleDeg(nextNormalAngleDeg) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    this.currentNormalAngleDeg = clampExtrudeNormalAngleDeg(nextNormalAngleDeg);
    return this._rebuildPreserveGroup();
  }

  setColorDepths(nextColorDepths = {}) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    const sanitized = {};
    Object.entries(nextColorDepths || {}).forEach(([color, depthValue]) => {
      if (typeof color !== 'string') return;
      const key = color.toLowerCase();
      const depth = clampExtrudeDepth(depthValue);
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
      sanitized[key] = clampExtrudeColorOffset(numericOffset);
    });
    this.currentColorOffsets = sanitized;
    return this._rebuildPreserveGroup();
  }

  setFlipDirection(enabled) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    this.currentFlipDirection = !!enabled;
    return this._rebuildPreserveGroup();
  }

  /**
   * @param {{ amount?: unknown }} [settings]
   */
  setBevelSettings(settings = {}) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    if (settings.amount !== undefined) {
      this.currentBevelAmount = clampExtrudeBevelAmount(
        settings.amount,
        this.currentDepth,
      );
    }
    return this._rebuildPreserveGroup();
  }

  setDetail(nextDetail) {
    if (!this._glyphEntries.length) throw new Error('No font layout available');
    this._detailLevel = normalizeExtrudeDetail(nextDetail);
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

  getBevelAmount() {
    return this.currentBevelAmount;
  }

  getDetail() {
    return this._detailLevel;
  }

  _rebuildPreserveGroup() {
    const rebuilt = this._buildGroup(this.currentDepth, this.currentNormalAngleDeg);
    this.group = preserveExtrudeGroupOnRebuild(this.group, rebuilt);
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

    const creaseAngleRad = THREE.MathUtils.degToRad(clampExtrudeNormalAngleDeg(normalAngleDeg));
    const fillHex = this.currentFillColor.toLowerCase();
    const effectiveDepth = Number.isFinite(this.currentColorDepths?.[fillHex])
      ? clampExtrudeDepth(this.currentColorDepths[fillHex])
      : depth;
    const effectiveOffset = clampExtrudeColorOffset(this.currentColorOffsets?.[fillHex]);

    const baseColor = new THREE.Color(this.currentFillColor);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: DEFAULT_MATERIAL_ROUGHNESS,
      metalness: 0.0,
      side: THREE.FrontSide,
    });

    const xyNormalizeScale = FONT_EXTRUDE_TARGET_CAP_HEIGHT / this._layoutFontSize;
    const bevelSettings = resolveExtrudeBevelSettings({
      amount: this.currentBevelAmount,
      depth: effectiveDepth,
      xyNormalizeScale,
    });
    const bevelEnabled = !!bevelSettings.bevelEnabled;
    const detailSettings = resolveExtrudeDetailSettings(this._detailLevel, { bevelEnabled });
    const curveSegments = bevelEnabled
      ? resolveBevelSideCurveSegments(this._detailLevel, detailSettings.curveSegments)
      : detailSettings.curveSegments;
    const extrudeSettings = {
      depth: effectiveDepth,
      steps: 1,
      curveSegments,
      ...bevelSettings,
    };

    let meshCount = 0;
    for (const { glyphPath } of this._glyphEntries) {
      const shapes = opentypePathToShapes(glyphPath, detailSettings.curveDivisions);
      for (const shape of shapes) {
        const extrudeOptions = {
          ...extrudeSettings,
          curveSegments,
        };
        let geometry = new THREE.ExtrudeGeometry(shape, extrudeOptions);
        if (geometryHasNaNPositions(geometry) && bevelSettings?.bevelEnabled) {
          geometry.dispose();
          geometry = new THREE.ExtrudeGeometry(shape, {
            ...extrudeOptions,
            bevelEnabled: false,
          });
        }
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
    applyExtrudeDirectionOffset(group, this.currentFlipDirection, this.currentDepth);
    finalizeExtrudeGroupGeometry(group, creaseAngleRad);

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
}
