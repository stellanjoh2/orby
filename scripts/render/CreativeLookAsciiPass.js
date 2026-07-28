import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import {
  ASCII_ART_INK_HEX,
  ASCII_POST_FRAGMENT,
  ASCII_SHADOW_INK_FLOOR,
  creativeAsciiCellSize,
  ensureAsciiFontAtlasLoaded,
  getSharedAsciiFontAtlas,
} from './creativeLookAsciiArt.js';
import {
  ASCII_2_INK_HEX,
  ASCII_2_POST_FRAGMENT,
  creativeAscii2CellSize,
  ensureAscii2FontAtlasLoaded,
  getSharedAscii2FontAtlas,
} from './creativeLookAscii2Art.js';
import {
  ASCII_3_INK_HEX,
  ASCII_3_POST_FRAGMENT,
  creativeAscii3CellSize,
  ensureAscii3FontAtlasLoaded,
  getSharedAscii3FontAtlas,
} from './creativeLookAscii3Art.js';
import {
  ASCII_4_LIME_HEX,
  ASCII_4_POST_FRAGMENT,
  ASCII_4_SHADOW_INK_FLOOR,
  creativeAscii4CellSize,
  ensureAscii4FontAtlasLoaded,
  getSharedAscii4FontAtlas,
} from './creativeLookAscii4Art.js';
import { ORBY_BLACK } from '../constants.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** @typedef {'ascii-art' | 'ascii-art-2' | 'ascii-art-3' | 'ascii-art-4'} AsciiCreativeLookVariant */

/** @type {Record<AsciiCreativeLookVariant, {
 *   fragment: string,
 *   inkHex: number,
 *   inkFloor: number,
 *   edgeCharCount: number,
 *   cellSize: () => { width: number, height: number },
 *   getAtlas: () => ReturnType<typeof getSharedAsciiFontAtlas>,
 *   ensureAtlas: () => Promise<ReturnType<typeof getSharedAsciiFontAtlas>>,
 * }>} */
const ASCII_VARIANTS = {
  'ascii-art': {
    fragment: ASCII_POST_FRAGMENT,
    inkHex: ASCII_ART_INK_HEX,
    inkFloor: ASCII_SHADOW_INK_FLOOR,
    edgeCharCount: 0,
    cellSize: creativeAsciiCellSize,
    getAtlas: getSharedAsciiFontAtlas,
    ensureAtlas: ensureAsciiFontAtlasLoaded,
  },
  'ascii-art-2': {
    fragment: ASCII_3_POST_FRAGMENT,
    inkHex: ASCII_3_INK_HEX,
    inkFloor: ASCII_SHADOW_INK_FLOOR,
    edgeCharCount: 0,
    cellSize: creativeAscii3CellSize,
    getAtlas: getSharedAscii3FontAtlas,
    ensureAtlas: ensureAscii3FontAtlasLoaded,
  },
  'ascii-art-3': {
    fragment: ASCII_2_POST_FRAGMENT,
    inkHex: ASCII_2_INK_HEX,
    inkFloor: ASCII_SHADOW_INK_FLOOR,
    edgeCharCount: 0,
    cellSize: creativeAscii2CellSize,
    getAtlas: getSharedAscii2FontAtlas,
    ensureAtlas: ensureAscii2FontAtlasLoaded,
  },
  'ascii-art-4': {
    fragment: ASCII_4_POST_FRAGMENT,
    inkHex: ASCII_4_LIME_HEX,
    inkFloor: ASCII_4_SHADOW_INK_FLOOR,
    edgeCharCount: 0,
    cellSize: creativeAscii4CellSize,
    getAtlas: getSharedAscii4FontAtlas,
    ensureAtlas: ensureAscii4FontAtlasLoaded,
  },
};

/**
 * Screen-space ASCII pass — VGA (1), fine terminal (2), or braille (3); Orby lime, Master Hue.
 */
export class CreativeLookAsciiPass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this._pixelRatio = Math.max(1, renderer?.getPixelRatio?.() ?? 1);
    /** @type {AsciiCreativeLookVariant} */
    this._variant = 'ascii-art';

    const atlas = getSharedAsciiFontAtlas();
    void ensureAsciiFontAtlasLoaded().then(() => this._bindAtlas(getSharedAsciiFontAtlas()));
    void ensureAscii2FontAtlasLoaded();
    void ensureAscii3FontAtlasLoaded();
    void ensureAscii4FontAtlasLoaded();

    const cell = creativeAsciiCellSize();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCellSize: { value: new THREE.Vector2(cell.width, cell.height) },
        uInkColor: { value: new THREE.Color(ASCII_ART_INK_HEX) },
        uBgColor: { value: new THREE.Color(ORBY_BLACK) },
        uFontAtlas: { value: atlas.texture },
        uCharCount: { value: atlas.charCount },
        uCellGlyphSize: { value: new THREE.Vector2(atlas.cellGlyphW, atlas.cellGlyphH) },
        uAtlasGlyphSize: { value: new THREE.Vector2(atlas.atlasGlyphW, atlas.atlasGlyphH) },
        uAtlasGrid: { value: new THREE.Vector2(atlas.cols, atlas.rows) },
        uMasterHue: { value: 0 },
        uInkFloor: { value: ASCII_SHADOW_INK_FLOOR },
        uEdgeCharCount: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: ASCII_POST_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });

    this.pass = new ShaderPass(this.material);
    this.pass.enabled = false;
    this._atlasBound = false;
    /** CSS/logical viewport size — ASCII grid density is fixed in these units. */
    this._referenceLogicalSize = new THREE.Vector2(1, 1);
    /** When true, setSize does not overwrite reference (PNG export resize). */
    this._referencePinned = false;
    this._applyCellSize();
  }

  /** @param {AsciiCreativeLookVariant | string} variant */
  _resolveVariant(variant) {
    if (
      variant === 'ascii-art-2' ||
      variant === 'ascii-art-3' ||
      variant === 'ascii-art-4'
    ) {
      return variant;
    }
    return 'ascii-art';
  }

  /** @param {AsciiCreativeLookVariant} variant */
  _config(variant) {
    return ASCII_VARIANTS[variant] ?? ASCII_VARIANTS['ascii-art'];
  }

  /** @param {ReturnType<typeof getSharedAsciiFontAtlas>} atlas */
  _bindAtlas(atlas) {
    if (!atlas) return;
    const u = this.material.uniforms;
    u.uFontAtlas.value = atlas.texture;
    u.uCharCount.value = atlas.charCount;
    u.uCellGlyphSize.value.set(atlas.cellGlyphW, atlas.cellGlyphH);
    u.uAtlasGlyphSize.value.set(atlas.atlasGlyphW, atlas.atlasGlyphH);
    u.uAtlasGrid.value.set(atlas.cols, atlas.rows);
    this._atlasBound = true;
  }

  /** @param {AsciiCreativeLookVariant | string} variant */
  _applyVariant(variant) {
    const next = this._resolveVariant(variant);
    if (next === this._variant && this._atlasBound) return;
    this._variant = next;

    const cfg = this._config(next);
    this.material.fragmentShader = cfg.fragment;
    this.material.needsUpdate = true;
    this.material.uniforms.uInkColor.value.setHex(cfg.inkHex);
    this.material.uniforms.uInkFloor.value = cfg.inkFloor;
    this.material.uniforms.uEdgeCharCount.value = cfg.edgeCharCount;

    const atlas = cfg.getAtlas();
    this._bindAtlas(atlas);
    this._applyCellSize();

    void cfg.ensureAtlas().then(() => {
      if (this._variant !== next) return;
      this._bindAtlas(cfg.getAtlas());
    });
  }

  _cellSizeForVariant() {
    return this._config(this._variant).cellSize();
  }

  _applyCellSize() {
    const cell = this._cellSizeForVariant();
    const res = this.material.uniforms.uResolution.value;
    const ref = this._referenceLogicalSize;
    const refW = Math.max(1, ref.x);
    const refH = Math.max(1, ref.y);
    this.material.uniforms.uCellSize.value.set(
      cell.width * (res.x / refW),
      cell.height * (res.y / refH),
    );
  }

  /**
   * Pin the interactive viewport logical size so 2× PNG export keeps the same
   * on-screen cell density (export sets pixelRatio=1 but doubles backing-store px).
   * @param {number} logicalW
   * @param {number} logicalH
   */
  pinReferenceLogicalSize(logicalW, logicalH) {
    this._referenceLogicalSize.set(Math.max(1, logicalW), Math.max(1, logicalH));
    this._referencePinned = true;
    this._applyCellSize();
  }

  unpinReferenceLogicalSize() {
    this._referencePinned = false;
  }

  getPass() {
    return this.pass;
  }

  /**
   * @param {number} logicalW
   * @param {number} logicalH
   */
  setSize(logicalW, logicalH) {
    this._pixelRatio = Math.max(1, this.renderer?.getPixelRatio?.() ?? 1);
    if (!this._referencePinned) {
      this._referenceLogicalSize.set(Math.max(1, logicalW), Math.max(1, logicalH));
    }
    this.material.uniforms.uResolution.value.set(
      Math.max(1, Math.floor(logicalW * this._pixelRatio)),
      Math.max(1, Math.floor(logicalH * this._pixelRatio)),
    );
    this._applyCellSize();
  }

  /**
   * @param {{ enabled?: boolean, masterHue?: number, time?: number, variant?: AsciiCreativeLookVariant | string }} settings
   */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.variant === 'string') {
      this._applyVariant(settings.variant);
    }
    if (typeof settings.enabled === 'boolean') {
      this.pass.enabled = settings.enabled;
    }
    if (typeof settings.masterHue === 'number') {
      this.material.uniforms.uMasterHue.value = settings.masterHue;
    }
    if (typeof settings.time === 'number') {
      this.material.uniforms.uTime.value = settings.time;
    }
    if (!this._atlasBound) {
      const cfg = this._config(this._variant);
      void cfg.ensureAtlas().then(() => this._bindAtlas(cfg.getAtlas()));
    }
  }

  refreshAtlas() {
    const cfg = this._config(this._variant);
    this._bindAtlas(cfg.getAtlas());
    this.material.uniforms.uFontAtlas.value.needsUpdate = true;
  }

  dispose() {
    this.material.dispose();
  }
}
