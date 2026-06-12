import * as THREE from 'three';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/postprocessing/ShaderPass.js';
import {
  ASCII_ART_INK_HEX,
  ASCII_POST_FRAGMENT,
  creativeAsciiCellSize,
  ensureAsciiFontAtlasLoaded,
  getSharedAsciiFontAtlas,
} from './creativeLookAsciiArt.js';
import { ORBY_BLACK } from '../constants.js';

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Screen-space ASCII pass — 2× VGA grid, Orby lime duotone, Master Hue.
 */
export class CreativeLookAsciiPass {
  /** @param {import('three').WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this._pixelRatio = Math.max(1, renderer?.getPixelRatio?.() ?? 1);

    const atlas = getSharedAsciiFontAtlas();
    void ensureAsciiFontAtlasLoaded().then(() => this._bindAtlas(getSharedAsciiFontAtlas()));

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

  _applyCellSize() {
    const cell = creativeAsciiCellSize();
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
   * @param {{ enabled?: boolean, masterHue?: number }} settings
   */
  updateSettings(settings = {}) {
    if (!settings) return;
    if (typeof settings.enabled === 'boolean') {
      this.pass.enabled = settings.enabled;
    }
    if (typeof settings.masterHue === 'number') {
      this.material.uniforms.uMasterHue.value = settings.masterHue;
    }
    if (!this._atlasBound) {
      void ensureAsciiFontAtlasLoaded().then(() => this._bindAtlas(getSharedAsciiFontAtlas()));
    }
  }

  refreshAtlas() {
    this._bindAtlas(getSharedAsciiFontAtlas());
    this.material.uniforms.uFontAtlas.value.needsUpdate = true;
  }

  dispose() {
    this.material.dispose();
  }
}
