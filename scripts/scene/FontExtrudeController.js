import * as opentype from 'opentype';
import { FontExtrudeImporter, normalizeGlyphFillHex } from '../import/FontExtrudeImporter.js';
import { normalizeImportScale } from '../import/normalizeImportScale.js';
import { opentypePathHasArea } from '../import/opentypePathToShape.js';
import {
  getPairKerningPx,
  normalizeFontKerningMode,
} from './fontKerning.js';
import { LocalFontPreviewCache } from './localFontPreviewCache.js';
import { resolveDefaultFontPostscript } from './fontExtrudeDefaultFont.js';
import {
  DEFAULT_EXTRUDE_BEVEL_AMOUNT,
  DEFAULT_EXTRUDE_DEPTH,
  DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
} from '../import/extrudeDefaults.js';

const DEFAULT_FONT_SIZE = 72;
const PREVIEW_LAYOUT_WIDTH = 520;
const GLYPH_CHUNK_SIZE = 48;
const DEFAULT_PREVIEW_FILL = '#808080';
/** Text extrudes toward the camera (flip on); not exposed in the font panel. */
const FONT_EXTRUDE_FLIP_DIRECTION = true;

/** Local Font Access returns one entry per face; group rows per family for the UI. */
function localFontFamilyKey(entry) {
  const family = (entry.family || '').trim();
  if (family) return family.toLowerCase();
  return (entry.fullName || entry.postscriptName || '').trim().toLowerCase();
}

/** Lower rank = better default face when multiple styles share a family name. */
function localFontFaceRank(entry) {
  const hay = `${entry.postscriptName || ''} ${entry.fullName || ''} ${entry.style || ''}`.toLowerCase();
  if (!hay.trim()) return 50;
  if (/\bregular\b/.test(hay)) return 0;
  if (/\b(book|roman|normal|plain)\b/.test(hay) && !/\b(bold|italic|oblique|black|heavy)\b/.test(hay)) {
    return 1;
  }
  const ps = (entry.postscriptName || '').trim();
  const fam = (entry.family || '').trim();
  if (ps && fam && ps.replace(/\s+/g, '') === fam.replace(/\s+/g, '')) return 2;
  if (/\bmedium\b/.test(hay) && !/\b(bold|italic|black|heavy|light|thin)\b/.test(hay)) return 3;
  if (
    /\b(bold|italic|oblique|light|thin|black|heavy|condensed|compressed|narrow|ultra|semibold|demi|extra|hairline|extralight)\b/.test(
      hay,
    )
  ) {
    return 20;
  }
  return 5;
}

function parseNumericFontWeight(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function localFontStyleLabel(entry) {
  const weightNum = parseNumericFontWeight(entry.weight);
  const rawStyle = String(entry.style || '').trim();
  const normalizedStyle = rawStyle.toLowerCase();
  const hasItalic = /\b(italic|oblique)\b/.test(normalizedStyle);

  let weightLabel = '';
  if (weightNum != null) {
    if (weightNum <= 250) weightLabel = 'Thin';
    else if (weightNum <= 350) weightLabel = 'Light';
    else if (weightNum <= 450) weightLabel = 'Regular';
    else if (weightNum <= 550) weightLabel = 'Medium';
    else if (weightNum <= 650) weightLabel = 'Semibold';
    else if (weightNum <= 750) weightLabel = 'Bold';
    else if (weightNum <= 850) weightLabel = 'Heavy';
    else weightLabel = 'Black';
  } else if (rawStyle) {
    weightLabel = rawStyle
      .replace(/\bitalic\b/gi, '')
      .replace(/\boblique\b/gi, '')
      .trim();
  } else {
    const hay = `${entry.fullName || ''} ${entry.postscriptName || ''}`.toLowerCase();
    if (/\bthin\b/.test(hay)) weightLabel = 'Thin';
    else if (/\blight\b/.test(hay)) weightLabel = 'Light';
    else if (/\b(regular|book|roman|normal)\b/.test(hay)) weightLabel = 'Regular';
    else if (/\bmedium\b/.test(hay)) weightLabel = 'Medium';
    else if (/\b(semibold|demi)\b/.test(hay)) weightLabel = 'Semibold';
    else if (/\bbold\b/.test(hay)) weightLabel = 'Bold';
    else if (/\b(heavy|extrabold|ultrabold)\b/.test(hay)) weightLabel = 'Heavy';
    else if (/\bblack\b/.test(hay)) weightLabel = 'Black';
  }

  if (!weightLabel) weightLabel = 'Regular';
  return hasItalic ? `${weightLabel} Italic` : weightLabel;
}

function localFontVariantSortScore(entry) {
  const weightNum = parseNumericFontWeight(entry.weight);
  const style = String(entry.styleRaw || entry.style || '').toLowerCase();
  const italicBias = /\b(italic|oblique)\b/.test(style) ? 1 : 0;
  return (weightNum ?? 400) + italicBias;
}

/**
 * @param {Array<{ family?: string, fullName?: string, postscriptName?: string, style?: string, weight?: number | string }>} fonts
 * @returns {Array<{ family: string, defaultPostscriptName: string, variants: Array<{ postscriptName: string, fullName?: string, styleLabel: string, weight: number | null, styleRaw: string }> }>}
 */
function groupLocalFontsByFamily(fonts) {
  /** @type {Map<string, { family: string, defaultPostscriptName: string, defaultRank: number, variants: Array<{ postscriptName: string, fullName?: string, styleLabel: string, weight: number | null, styleRaw: string }> }>} */
  const byFamily = new Map();
  for (const entry of fonts) {
    const key = localFontFamilyKey(entry);
    const postscriptName = entry.postscriptName || entry.fullName;
    if (!key || !postscriptName) continue;
    const rank = localFontFaceRank(entry);
    const variant = {
      postscriptName,
      fullName: entry.fullName,
      styleLabel: localFontStyleLabel(entry),
      weight: parseNumericFontWeight(entry.weight),
      styleRaw: String(entry.style || ''),
    };
    const prev = byFamily.get(key);
    if (!prev) {
      byFamily.set(key, {
        family: entry.family || entry.fullName || postscriptName,
        defaultPostscriptName: postscriptName,
        defaultRank: rank,
        variants: [variant],
      });
      continue;
    }
    if (
      rank < prev.defaultRank ||
      (rank === prev.defaultRank && postscriptName.length < prev.defaultPostscriptName.length)
    ) {
      prev.defaultPostscriptName = postscriptName;
      prev.defaultRank = rank;
    }
    prev.variants.push(variant);
  }
  const list = [...byFamily.values()].map((familyGroup) => {
    const deduped = new Map();
    for (const variant of familyGroup.variants) {
      if (!deduped.has(variant.postscriptName)) deduped.set(variant.postscriptName, variant);
    }
    const variants = [...deduped.values()].sort((a, b) => {
      const scoreA = localFontVariantSortScore(a);
      const scoreB = localFontVariantSortScore(b);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return (a.styleLabel || '').localeCompare(b.styleLabel || '', undefined, {
        sensitivity: 'base',
      });
    });
    return {
      family: familyGroup.family,
      defaultPostscriptName: familyGroup.defaultPostscriptName,
      variants,
    };
  });
  list.sort((a, b) => a.family.localeCompare(b.family, undefined, { sensitivity: 'base' }));
  return list;
}

/**
 * Typed text → opentype.js paths → THREE.Shape extrude (FontExtrudeImporter).
 */
export class FontExtrudeController {
  /**
   * @param {Object} options
   * @param {import('../EventBus.js').EventBus} options.eventBus
   * @param {import('../StateStore.js').StateStore} options.stateStore
   * @param {() => import('../SceneManager.js').SceneManager} options.getScene
   */
  constructor({ eventBus, stateStore, getScene }) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.getScene = getScene;
    this.fontExtrudeImporter = new FontExtrudeImporter();
    /** @type {import('../vendor/opentype.module.js').Font | null} */
    this.font = null;
    this.fontLabel = '';
    /** @type {THREE.Group | null} */
    this.lastGeneratedGroup = null;
    this._localFontsSupported =
      typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
    /** @type {Promise<FontData[]> | null} */
    this._localFontsQueryPromise = null;
    this.previewCache = new LocalFontPreviewCache();
  }

  get supportsLocalFonts() {
    return this._localFontsSupported;
  }

  /** Clear a failed/denied query so the user can retry from a button click. */
  resetLocalFontAccessQuery() {
    this._localFontsQueryPromise = null;
  }

  /**
   * Start `queryLocalFonts()` synchronously inside a click/key handler so Chrome can show
   * the permission prompt (transient user activation is lost after `await`).
   * @returns {boolean}
   */
  hasLocalFontAccessQueryStarted() {
    return !!this._localFontsQueryPromise;
  }

  beginLocalFontAccessQuery() {
    if (!this._localFontsSupported) return false;
    if (!this._localFontsQueryPromise) {
      this._localFontsQueryPromise = window.queryLocalFonts().catch((err) => {
        this._localFontsQueryPromise = null;
        throw err;
      });
    }
    return true;
  }

  /** @returns {Promise<'granted' | 'denied' | 'prompt' | 'unknown'>} */
  async getLocalFontsPermissionState() {
    if (!this._localFontsSupported || !navigator.permissions?.query) return 'unknown';
    try {
      const status = await navigator.permissions.query(
        /** @type {PermissionDescriptor} */ ({ name: 'local-fonts' }),
      );
      return status.state === 'granted' ||
        status.state === 'denied' ||
        status.state === 'prompt'
        ? status.state
        : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * CSS font-family for picker list/trigger previews (lazy-loaded).
   * @param {string} postscriptName
   */
  getPreviewFontFamily(postscriptName) {
    return this.previewCache.getFontFamily(postscriptName);
  }

  /**
   * @param {string} postscriptName
   * @param {string} familyName
   */
  registerSystemFontFamily(postscriptName, familyName) {
    this.previewCache.registerSystemFamily(postscriptName, familyName);
  }

  /**
   * @param {string} key
   * @param {File} file
   */
  registerFilePreview(key, file) {
    return this.previewCache.registerFile(key, file);
  }

  /**
   * @param {File | string} fontData — File (.ttf/.otf) or Local Font Access postscript name
   * @returns {Promise<import('../vendor/opentype.module.js').Font>}
   */
  async loadFont(fontData) {
    if (fontData instanceof File) {
      const buffer = await fontData.arrayBuffer();
      this.font = opentype.parse(buffer);
      this.fontLabel = fontData.name.replace(/\.[^/.]+$/, '') || 'Font';
      return this.font;
    }
    if (typeof fontData === 'string' && this._localFontsSupported) {
      const fonts = await window.queryLocalFonts({ postscriptNames: [fontData] });
      const match = fonts?.[0];
      if (!match) {
        throw new Error('Font not found on this device');
      }
      const blob = await match.blob();
      const buffer = await blob.arrayBuffer();
      this.font = opentype.parse(buffer);
      this.fontLabel = match.fullName || match.family || fontData;
      return this.font;
    }
    throw new Error('Invalid font source');
  }

  /**
   * @returns {Promise<Array<{ family: string, defaultPostscriptName: string, variants: Array<{ postscriptName: string, fullName?: string, styleLabel: string, weight: number | null, styleRaw: string }> }>>}
   */
  async getAvailableFonts() {
    if (!this._localFontsSupported || !this._localFontsQueryPromise) return [];
    try {
      const fonts = await this._localFontsQueryPromise;
      return groupLocalFontsByFamily(fonts);
    } catch (err) {
      console.warn('[Orby] Local Font Access denied or unavailable', err);
      return [];
    }
  }

  /** Arial / Helvetica / Liberation Sans — first match on this device. */
  async resolveDefaultPostscriptName() {
    return resolveDefaultFontPostscript();
  }

  /**
   * @param {string} text
   * @param {Object} options
   * @returns {Promise<THREE.Group>}
   */
  async generateMesh(text, options = {}) {
    if (!this.font) {
      throw new Error('No font loaded');
    }
    const layout = await this.layoutTextAsync(text, options);
    if (!layout.lines.length) {
      throw new Error('Text has no drawable paths');
    }
    const svgState = this.stateStore.getState()?.svgExtrude || {};
    const fontState = this.stateStore.getState()?.fontExtrude || {};
    const fillColor = normalizeGlyphFillHex(
      options.fillColor ?? fontState.fillColor ?? DEFAULT_PREVIEW_FILL,
    );
    const group = this.fontExtrudeImporter.buildFromLayout(layout, {
      sourceName: this.fontLabel || 'Text',
      depth: options.depth ?? svgState.depth ?? DEFAULT_EXTRUDE_DEPTH,
      normalAngleDeg: options.normalAngleDeg ?? svgState.normalAngle ?? DEFAULT_EXTRUDE_NORMAL_ANGLE_DEG,
      colorDepths: options.colorDepths ?? svgState.colorDepths ?? {},
      colorOffsets: options.colorOffsets ?? svgState.colorOffsets ?? {},
      flipDirection: FONT_EXTRUDE_FLIP_DIRECTION,
      detail: options.detail ?? fontState.detail ?? 'medium',
      fillColor,
      bevelAmount: options.bevelAmount ?? svgState.bevelAmount ?? DEFAULT_EXTRUDE_BEVEL_AMOUNT,
    });
    group.userData.orbyFontGenerated = true;
    group.userData.orbyFontExtrude = true;
    group.userData.orbyFontSourceText = text;
    this.lastGeneratedGroup = group;
    return group;
  }

  /**
   * Replace the active scene model with a font-generated mesh (same path as SVG import).
   * @param {THREE.Group} group
   * @param {{ skipConfirm?: boolean }} [options]
   */
  async addToScene(group, options = {}) {
    const scene = this.getScene();
    if (!scene) return null;

    const needsConfirm =
      !options.skipConfirm &&
      scene.currentModel?.userData?.orbyFontGenerated &&
      this.hasModifiedTransforms(scene);

    if (needsConfirm) {
      const confirmed = await this._confirmReplace();
      if (!confirmed) return null;
    }

    this.stateStore.set('svgExtrude.flipDirection', FONT_EXTRUDE_FLIP_DIRECTION);
    await scene.ui.ensureStudioUiReady();
    await scene.ensureStudioReady();
    scene.ui.setDropzoneVisible(false);
    await scene.syncViewportSize();
    scene.startRenderLoop();

    const assetName = this.fontLabel || 'Generated Text';
    scene.currentFile = null;
    scene.ui.updateTitle(assetName);
    scene.ui.updateTopBarDetail(`${assetName} — Idle`);

    const fillColor = normalizeGlyphFillHex(
      this.stateStore.getState()?.fontExtrude?.fillColor ?? DEFAULT_PREVIEW_FILL,
    );
    this.stateStore.set('svgExtrude.availableColors', [fillColor]);
    normalizeImportScale(group);
    scene.modelLifecycle.setModel(group, []);
    scene.modelLifecycle.applyAssetMetadata({
      gltfMetadata: {
        assetName,
        generator: 'FontExtrude',
        version: null,
        copyright: null,
      },
      svgExtrude: {
        enabled: true,
        depth: this.fontExtrudeImporter.getDepth(),
        normalAngle: this.fontExtrudeImporter.getNormalAngleDeg(),
        colorDepths: this.fontExtrudeImporter.getColorDepths(),
        colorOffsets: this.fontExtrudeImporter.getColorOffsets(),
        colors: this.fontExtrudeImporter.getAvailableColors(),
        flipDirection: this.fontExtrudeImporter.getFlipDirection(),
        bevelAmount: this.fontExtrudeImporter.getBevelAmount(),
        detail: this.fontExtrudeImporter.getDetail(),
        importer: this.fontExtrudeImporter,
      },
    });
    scene.svgExtrudeImporter = this.fontExtrudeImporter;
    scene.isSvgExtrudeModel = true;
    scene.applyFontExtrudeFillColor?.(fillColor);
    scene.updateStatsUI(null, group, scene.currentAssetMetadata);

    this.eventBus.emit('font:generated', { group });
    scene.eventBus.emit('scene:model-load-complete', { success: true, source: 'font' });
    scene.ui.showToast('Text generated', 3200, { notification: false });
    return group;
  }

  /**
   * Layout + path data for canvas preview and SVG export.
   * @param {string} text
   * @param {Object} options
   */
  async layoutTextAsync(text, options = {}) {
    const font = this.font;
    if (!font) return { lines: [], width: 0, height: 0, fontSize: DEFAULT_FONT_SIZE };

    const fontSize = DEFAULT_FONT_SIZE;
    const tracking = Number(options.tracking ?? 0);
    const kerning = normalizeFontKerningMode(options.kerning);
    const lineHeightMul = Number(options.lineHeight ?? 1);
    const fill =
      options.fillColor ??
      this.stateStore.getState()?.fontExtrude?.fillColor ??
      DEFAULT_PREVIEW_FILL;
    const lineFill = normalizeGlyphFillHex(fill);
    const align =
      options.align === 'center' || options.align === 'right' ? options.align : 'left';
    const maxWidth = Number(options.maxWidth ?? PREVIEW_LAYOUT_WIDTH);

    const rawLines = (typeof text === 'string' ? text : '').split(/\r?\n/);
    const lines = rawLines.length ? rawLines : [''];
    let y = fontSize * 0.85;
    const lineAdvance = fontSize * lineHeightMul;
    const laidOut = [];
    let contentWidth = 0;
    /** @type {{ lineText: string, y: number, segments: { glyph: object, x: number }[], inkBounds: { minX: number, maxX: number, width: number } | null }[]} */
    const lineDrafts = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const lineText = lines[lineIndex];
      const segments = [];
      let x = 0;
      /** @type {import('../vendor/opentype.module.js').Glyph | null} */
      let prevGlyph = null;
      let prevX = 0;
      const glyphs = [...lineText];
      for (let i = 0; i < glyphs.length; i += 1) {
        if (i > 0 && i % GLYPH_CHUNK_SIZE === 0) {
          await this._yieldToMain();
        }
        const char = glyphs[i];
        const glyph = font.charToGlyph(char);
        if (!glyph || glyph.unicode === undefined) continue;

        if (prevGlyph) {
          const step = this._glyphAdvance(prevGlyph, font, fontSize, tracking);
          const provisionalX = prevX + step;
          x =
            provisionalX +
            getPairKerningPx(
              kerning,
              font,
              prevGlyph,
              glyph,
              prevX,
              provisionalX,
              y,
              fontSize,
            );
        }

        segments.push({ glyph, x });
        prevGlyph = glyph;
        prevX = x;
        x += this._glyphAdvance(glyph, font, fontSize, tracking);
      }

      const probePaths = [];
      for (const seg of segments) {
        const glyphPath = seg.glyph.getPath(seg.x, y, fontSize);
        if (!opentypePathHasArea(glyphPath)) continue;
        probePaths.push({ glyphPath });
      }
      const inkBounds = this._getLineInkBounds(probePaths);
      if (inkBounds) {
        contentWidth = Math.max(contentWidth, inkBounds.width);
      }
      lineDrafts.push({ lineText, y, segments, inkBounds });
      y += lineAdvance;
    }

    let paragraphInkWidth = 0;
    for (const draft of lineDrafts) {
      if (draft.inkBounds) {
        paragraphInkWidth = Math.max(paragraphInkWidth, draft.inkBounds.width);
      }
    }
    const paragraphInkWidthSafe = Math.max(paragraphInkWidth, 1);
    const blockOffset =
      align === 'center'
        ? (maxWidth - paragraphInkWidthSafe) * 0.5
        : align === 'right'
          ? maxWidth - paragraphInkWidthSafe
          : 0;

    for (const draft of lineDrafts) {
      const { lineText, y: lineY, segments, inkBounds } = draft;
      const lineRefWidth = align === 'left' ? inkBounds?.width ?? paragraphInkWidthSafe : paragraphInkWidthSafe;
      const lineOffset = this._lineInkAlignOffset(inkBounds, align, lineRefWidth);
      const totalOffset = lineOffset + (align === 'left' ? 0 : blockOffset);

      const paths = [];
      for (let i = 0; i < segments.length; i += 1) {
        if (i > 0 && i % GLYPH_CHUNK_SIZE === 0) {
          await this._yieldToMain();
        }
        const { glyph, x: glyphX } = segments[i];
        const glyphPath = glyph.getPath(glyphX + totalOffset, lineY, fontSize);
        if (!opentypePathHasArea(glyphPath)) continue;
        const pathData = glyphPath.toPathData(2);
        paths.push({ d: pathData, fill: lineFill, glyphPath });
      }
      if (paths.length) {
        laidOut.push({ paths, y: lineY, text: lineText });
      }
    }
    const width = align === 'left' ? Math.max(contentWidth, 1) : maxWidth;
    const height = Math.max(fontSize, y + fontSize * 0.35);
    return { lines: laidOut, width, height, fontSize, align, maxWidth };
  }

  buildSvgFromLayout(layout) {
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}">`,
    ];
    for (const line of layout.lines) {
      for (const p of line.paths) {
        parts.push(`<path fill="${p.fill || DEFAULT_PREVIEW_FILL}" d="${p.d}"/>`);
      }
    }
    parts.push('</svg>');
    return parts.join('');
  }

  /**
   * Tight ink bounds for centering the 2D preview (canvas-space path boxes).
   * @param {Awaited<ReturnType<FontExtrudeController['layoutTextAsync']>>} layout
   */
  getLayoutPreviewBounds(layout) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (const line of layout?.lines || []) {
      for (const p of line.paths || []) {
        const gp = p.glyphPath;
        if (!gp?.getBoundingBox) continue;
        const bb = gp.getBoundingBox();
        if (!bb || bb.isEmpty?.()) continue;
        any = true;
        minX = Math.min(minX, bb.x1, bb.x2);
        minY = Math.min(minY, bb.y1, bb.y2);
        maxX = Math.max(maxX, bb.x1, bb.x2);
        maxY = Math.max(maxY, bb.y1, bb.y2);
      }
    }
    if (!any) {
      return {
        minX: 0,
        minY: 0,
        maxX: Math.max(layout?.width ?? 1, 1),
        maxY: Math.max(layout?.height ?? 1, 1),
      };
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {ReturnType<FontExtrudeController['layoutTextAsync']>} layout
   */
  drawPreview(ctx, layout) {
    if (!ctx || !layout) return;
    for (const line of layout.lines) {
      for (const p of line.paths) {
        const glyphPath = p.glyphPath;
        if (!glyphPath?.draw) continue;
        const prevFill = glyphPath.fill;
        glyphPath.fill = p.fill || DEFAULT_PREVIEW_FILL;
        glyphPath.draw(ctx);
        glyphPath.fill = prevFill;
      }
    }
  }

  hasModifiedTransforms(scene) {
    const state = this.stateStore.getState();
    const eps = 1e-4;
    const scale = Number(state.scale ?? 1);
    if (Math.abs(scale - 1) > eps) return true;
    if (Math.abs(state.xOffset ?? 0) > eps) return true;
    if (Math.abs(state.yOffset ?? 0) > eps) return true;
    if (Math.abs(state.zOffset ?? 0) > eps) return true;
    if (Math.abs(state.rotationX ?? 0) > eps) return true;
    if (Math.abs(state.rotationY ?? 0) > eps) return true;
    if (Math.abs(state.rotationZ ?? 0) > eps) return true;
    const root = scene.modelRoot;
    if (!root) return false;
    if (Math.abs(root.scale.x - 1) > eps || Math.abs(root.scale.y - 1) > eps || Math.abs(root.scale.z - 1) > eps) {
      return true;
    }
    if (root.position.lengthSq() > eps) return true;
    if (Math.abs(root.rotation.x) > eps || Math.abs(root.rotation.y) > eps || Math.abs(root.rotation.z) > eps) {
      return true;
    }
    return false;
  }

  _confirmReplace() {
    const scene = this.getScene();
    return new Promise((resolve) => {
      scene?.ui?.showMessageAlert(
        'Replace the current generated text mesh? Transform changes on the existing object will be lost.',
        'Generate new text?',
        {
          confirm: true,
          cancelLabel: 'Keep current',
          okLabel: 'Replace',
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        },
      );
    });
  }

  _glyphAdvance(glyph, font, fontSize, tracking) {
    const units =
      glyph.advanceWidth ??
      font.getAdvanceWidth(typeof glyph.unicode === 'number' ? String.fromCodePoint(glyph.unicode) : '', fontSize);
    const scale = fontSize / font.unitsPerEm;
    const trackPx = (tracking / 1000) * fontSize;
    return units * scale + trackPx;
  }

  _measureLineWidth(text, font, fontSize, tracking) {
    let x = 0;
    for (const char of text) {
      const glyph = font.charToGlyph(char);
      x += this._glyphAdvance(glyph, font, fontSize, tracking);
    }
    return x;
  }

  /** Ink bounds for a line's glyph paths (canvas space). */
  _getLineInkBounds(paths) {
    let minX = Infinity;
    let maxX = -Infinity;
    let any = false;
    for (const p of paths) {
      const bb = p.glyphPath?.getBoundingBox?.();
      if (!bb || bb.isEmpty?.()) continue;
      any = true;
      minX = Math.min(minX, bb.x1, bb.x2);
      maxX = Math.max(maxX, bb.x1, bb.x2);
    }
    if (!any) return null;
    return { minX, maxX, width: maxX - minX };
  }

  /**
   * Shift line ink within a reference width (uses visual bounds, not advance widths).
   * @param {{ minX: number, maxX: number, width: number }} bounds
   * @param {'left' | 'center' | 'right'} align
   * @param {number} refWidth
   */
  _lineInkAlignOffset(bounds, align, refWidth) {
    if (!bounds) return 0;
    if (align === 'right') return refWidth - bounds.maxX;
    if (align === 'center') return (refWidth - bounds.width) * 0.5 - bounds.minX;
    return -bounds.minX;
  }

  _yieldToMain() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }
}
