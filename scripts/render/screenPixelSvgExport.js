import {
  A2_CELL_PX,
  A2_REF_LOGICAL_HEIGHT,
  A2_REF_LOGICAL_WIDTH,
} from './creativeLookApple2Art.js';
import {
  C64_CELL_PX,
  C64_REF_LOGICAL_HEIGHT,
  C64_REF_LOGICAL_WIDTH,
} from './creativeLookC64Art.js';
import {
  EGA_CELL_PX,
  EGA_REF_LOGICAL_HEIGHT,
  EGA_REF_LOGICAL_WIDTH,
} from './creativeLookEgaArt.js';
import {
  GB_CELL_PX,
  GB_REF_LOGICAL_HEIGHT,
  GB_REF_LOGICAL_WIDTH,
} from './creativeLookGameBoyArt.js';
import {
  GBA_CELL_PX,
  GBA_REF_LOGICAL_HEIGHT,
  GBA_REF_LOGICAL_WIDTH,
} from './creativeLookGbaArt.js';
import {
  INTV_CELL_PX,
  INTV_REF_LOGICAL_HEIGHT,
  INTV_REF_LOGICAL_WIDTH,
} from './creativeLookIntellivisionArt.js';
import {
  MD_CELL_PX,
  MD_REF_LOGICAL_HEIGHT,
  MD_REF_LOGICAL_WIDTH,
} from './creativeLookMegaDriveArt.js';
import {
  NES_CELL_PX,
  NES_REF_LOGICAL_HEIGHT,
  NES_REF_LOGICAL_WIDTH,
} from './creativeLookNesArt.js';
import { APP_BACKGROUND } from '../constants.js';

/** Flat fill used by all Screen pixels post passes (`uBgColor`). */
export const SCREEN_PIXEL_BG_FILL = APP_BACKGROUND;

/** @typedef {{ refLogicalWidth: number, refLogicalHeight: number, cellPx: number }} ScreenPixelGridMeta */

/** @type {Record<string, ScreenPixelGridMeta>} */
const PRESET_GRID_META = {
  'ega-pixel': {
    refLogicalWidth: EGA_REF_LOGICAL_WIDTH,
    refLogicalHeight: EGA_REF_LOGICAL_HEIGHT,
    cellPx: EGA_CELL_PX,
  },
  'c64-pixel': {
    refLogicalWidth: C64_REF_LOGICAL_WIDTH,
    refLogicalHeight: C64_REF_LOGICAL_HEIGHT,
    cellPx: C64_CELL_PX,
  },
  'gameboy-pixel': {
    refLogicalWidth: GB_REF_LOGICAL_WIDTH,
    refLogicalHeight: GB_REF_LOGICAL_HEIGHT,
    cellPx: GB_CELL_PX,
  },
  'gba-pixel': {
    refLogicalWidth: GBA_REF_LOGICAL_WIDTH,
    refLogicalHeight: GBA_REF_LOGICAL_HEIGHT,
    cellPx: GBA_CELL_PX,
  },
  'nes-pixel': {
    refLogicalWidth: NES_REF_LOGICAL_WIDTH,
    refLogicalHeight: NES_REF_LOGICAL_HEIGHT,
    cellPx: NES_CELL_PX,
  },
  'megadrive-pixel': {
    refLogicalWidth: MD_REF_LOGICAL_WIDTH,
    refLogicalHeight: MD_REF_LOGICAL_HEIGHT,
    cellPx: MD_CELL_PX,
  },
  'intellivision-pixel': {
    refLogicalWidth: INTV_REF_LOGICAL_WIDTH,
    refLogicalHeight: INTV_REF_LOGICAL_HEIGHT,
    cellPx: INTV_CELL_PX,
  },
  'apple2-pixel': {
    refLogicalWidth: A2_REF_LOGICAL_WIDTH,
    refLogicalHeight: A2_REF_LOGICAL_HEIGHT,
    cellPx: A2_CELL_PX,
  },
};

/**
 * Macro-cell layout matching flat-post shaders (`floor(gl_FragCoord / cellPx)`).
 * @param {string} presetId
 * @param {number} width — backing-store pixels
 * @param {number} height
 */
export function resolveScreenPixelGridLayout(presetId, width, height) {
  const meta = PRESET_GRID_META[presetId];
  if (!meta) {
    throw new Error(`Unknown screen pixel preset: ${presetId}`);
  }
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const cellW = meta.cellPx * (w / meta.refLogicalWidth);
  const cellH = meta.cellPx * (h / meta.refLogicalHeight);
  const cellPxW = Math.max(1, Math.floor(cellW + 0.5));
  const cellPxH = Math.max(1, Math.floor(cellH + 0.5));
  const cols = Math.max(1, Math.floor((w - 1) / cellPxW) + 1);
  const rows = Math.max(1, Math.floor((h - 1) / cellPxH) + 1);
  return { cols, rows, cellPxW, cellPxH };
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
function rgbToHex(r, g, b) {
  const ri = Math.max(0, Math.min(255, r | 0));
  const gi = Math.max(0, Math.min(255, g | 0));
  const bi = Math.max(0, Math.min(255, b | 0));
  return `#${((1 << 24) + (ri << 16) + (gi << 8) + bi).toString(16).slice(1)}`;
}

/** @param {string} hex */
function parseHexColor(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Background / empty macro-cells — exact shader fill plus small readback tolerance. */
export function isScreenPixelBackgroundFill(hex, bgFill = SCREEN_PIXEL_BG_FILL) {
  if (hex === 'transparent') return true;
  const bg = parseHexColor(bgFill);
  const fill = parseHexColor(hex);
  return (
    Math.abs(fill.r - bg.r) <= 3
    && Math.abs(fill.g - bg.g) <= 3
    && Math.abs(fill.b - bg.b) <= 3
  );
}

/**
 * Sample one color per macro-cell from GL bottom-left RGBA bytes (composer readback).
 * Returned grid is row-major with row 0 = SVG top.
 * @param {Uint8Array} pixels
 * @param {number} width
 * @param {number} height
 * @param {{ cols: number, rows: number, cellPxW: number, cellPxH: number }} layout
 * @returns {string[]} hex fill per cell, length cols * rows
 */
export function sampleScreenPixelGridFromGlPixels(pixels, width, height, layout) {
  const { cols, rows, cellPxW, cellPxH } = layout;
  const cells = new Array(cols * rows);
  for (let cy = 0; cy < rows; cy += 1) {
    const centerPxY = cy * cellPxH + Math.floor(cellPxH * 0.5);
    const svgRow = rows - 1 - cy;
    for (let cx = 0; cx < cols; cx += 1) {
      const centerPxX = cx * cellPxW + Math.floor(cellPxW * 0.5);
      const x = Math.min(width - 1, Math.max(0, centerPxX));
      const y = Math.min(height - 1, Math.max(0, centerPxY));
      const idx = (y * width + x) * 4;
      const a = pixels[idx + 3];
      const hex = a < 1
        ? 'transparent'
        : rgbToHex(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
      cells[svgRow * cols + cx] = hex;
    }
  }
  return cells;
}

/**
 * Sample from top-left ImageData (canvas 2D fallback).
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @param {{ cols: number, rows: number, cellPxW: number, cellPxH: number }} layout
 * @returns {string[]}
 */
export function sampleScreenPixelGridFromCanvasData(data, width, height, layout) {
  const { cols, rows, cellPxW, cellPxH } = layout;
  const cells = new Array(cols * rows);
  for (let cy = 0; cy < rows; cy += 1) {
    const centerPxYGl = cy * cellPxH + Math.floor(cellPxH * 0.5);
    const centerPxYCanvas = height - 1 - centerPxYGl;
    const svgRow = rows - 1 - cy;
    for (let cx = 0; cx < cols; cx += 1) {
      const centerPxX = cx * cellPxW + Math.floor(cellPxW * 0.5);
      const x = Math.min(width - 1, Math.max(0, centerPxX));
      const y = Math.min(height - 1, Math.max(0, centerPxYCanvas));
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      const hex = a < 1
        ? 'transparent'
        : rgbToHex(data[idx], data[idx + 1], data[idx + 2]);
      cells[svgRow * cols + cx] = hex;
    }
  }
  return cells;
}

/**
 * Horizontal runs per row, merged vertically when x/width/color match the row above.
 * @param {string[]} cells
 * @param {number} cols
 * @param {number} rows
 * @param {string} bgFill
 * @param {number} cellPxW
 * @param {number} cellPxH
 * @returns {{ px: number, py: number, w: number, h: number, fill: string }[]}
 */
export function mergeScreenPixelRects(cells, cols, rows, bgFill, cellPxW, cellPxH) {
  const cw = Math.max(1, cellPxW);
  const ch = Math.max(1, cellPxH);
  /** @type {{ px: number, py: number, w: number, h: number, fill: string }[]} */
  const output = [];
  /** @type {Map<string, number>} */
  let active = new Map();

  for (let y = 0; y < rows; y += 1) {
    /** @type {Map<string, number>} */
    const nextActive = new Map();
    let x = 0;
    while (x < cols) {
      const fill = cells[y * cols + x];
      if (isScreenPixelBackgroundFill(fill, bgFill)) {
        x += 1;
        continue;
      }
      let run = 1;
      while (
        x + run < cols
        && cells[y * cols + x + run] === fill
        && !isScreenPixelBackgroundFill(cells[y * cols + x + run], bgFill)
      ) {
        run += 1;
      }
      const key = `${x},${run},${fill}`;
      const prevIdx = active.get(key);
      if (prevIdx !== undefined) {
        output[prevIdx].h += ch;
        nextActive.set(key, prevIdx);
      } else {
        const idx = output.length;
        output.push({
          px: x * cw,
          py: y * ch,
          w: run * cw,
          h: ch,
          fill,
        });
        nextActive.set(key, idx);
      }
      x += run;
    }
    active = nextActive;
  }

  return output;
}

/**
 * Build hard-edged SVG from a macro-cell color grid (merged horizontal + vertical runs).
 * Rects are placed in backing-store pixel space so viewBox aspect matches width/height
 * (avoids pillarboxing when macro-cells are non-square on screen).
 * @param {string[]} cells — row-major, row 0 = top
 * @param {number} cols
 * @param {number} rows
 * @param {{ bgFill?: string, pixelWidth?: number, pixelHeight?: number, cellPxW?: number, cellPxH?: number, transparent?: boolean }} [opts]
 */
export function buildScreenPixelSvg(cells, cols, rows, {
  bgFill = SCREEN_PIXEL_BG_FILL,
  pixelWidth = cols,
  pixelHeight = rows,
  cellPxW = 1,
  cellPxH = 1,
  transparent = false,
} = {}) {
  const svgW = Math.max(1, Math.round(pixelWidth));
  const svgH = Math.max(1, Math.round(pixelHeight));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" shape-rendering="crispEdges">`,
  ];
  if (!transparent) {
    parts.push(`<rect width="${svgW}" height="${svgH}" fill="${bgFill}"/>`);
  }

  const rects = mergeScreenPixelRects(cells, cols, rows, bgFill, cellPxW, cellPxH);
  for (const { px, py, w, h, fill } of rects) {
    parts.push(`<rect x="${px}" y="${py}" width="${w}" height="${h}" fill="${fill}"/>`);
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * @param {Uint8Array} pixels — GL bottom-left RGBA
 * @param {number} width
 * @param {number} height
 * @param {string} presetId
 * @param {{ transparent?: boolean }} [opts]
 */
export function buildScreenPixelSvgFromGlPixels(pixels, width, height, presetId, opts = {}) {
  if (!PRESET_GRID_META[presetId]) {
    throw new Error(`Unsupported screen pixel preset: ${presetId}`);
  }
  const layout = resolveScreenPixelGridLayout(presetId, width, height);
  const cells = sampleScreenPixelGridFromGlPixels(pixels, width, height, layout);
  return buildScreenPixelSvg(cells, layout.cols, layout.rows, {
    pixelWidth: width,
    pixelHeight: height,
    cellPxW: layout.cellPxW,
    cellPxH: layout.cellPxH,
    transparent: opts.transparent === true,
  });
}
