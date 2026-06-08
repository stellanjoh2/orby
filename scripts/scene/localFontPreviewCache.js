/** @param {string} postscriptName */
function previewFamilyId(postscriptName) {
  const safe = String(postscriptName).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `OrbyPreview_${safe}`;
}

/** Browser OTS rejects web fonts above ~128MB; skip CSS preview well below that. */
const MAX_CSS_PREVIEW_FONT_BYTES = 32 * 1024 * 1024;

/** OTS-accepted cmap subtable formats for Unicode faces. */
const OTS_CMAP_FORMATS = new Set([4, 6, 12, 14]);

/** @param {DataView} view @param {number} off @returns {string} */
function readSfntTag(view, off) {
  return String.fromCharCode(
    view.getUint8(off),
    view.getUint8(off + 1),
    view.getUint8(off + 2),
    view.getUint8(off + 3),
  );
}

/** @param {number} numTables */
function sfntDirectoryLooksValid(numTables, searchRange, entrySelector, rangeShift) {
  if (!numTables || numTables > 64) return false;
  const expSearchRange = (1 << Math.floor(Math.log2(numTables))) * 16;
  const expEntrySelector = Math.floor(Math.log2(numTables));
  const expRangeShift = numTables * 16 - expSearchRange;
  return (
    searchRange === expSearchRange &&
    entrySelector === expEntrySelector &&
    rangeShift === expRangeShift
  );
}

/**
 * @param {Blob} blob
 * @param {number} offset
 * @param {number} length
 * @returns {Promise<ArrayBuffer | null>}
 */
async function readBlobSlice(blob, offset, length) {
  if (!Number.isFinite(offset) || offset < 0 || length <= 0 || offset >= blob.size) return null;
  const end = Math.min(blob.size, offset + length);
  try {
    return await blob.slice(offset, end).arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * @param {Blob} blob
 * @param {number} cmapOffset
 * @param {number} cmapLength
 * @returns {Promise<boolean>}
 */
async function cmapHasOtsSupportedSubtable(blob, cmapOffset, cmapLength) {
  const readLen = Math.min(cmapLength, 4 + 32 * 8 + 64);
  const buf = await readBlobSlice(blob, cmapOffset, readLen);
  if (!buf || buf.byteLength < 4) return false;
  const view = new DataView(buf);
  if (view.getUint16(0, false) !== 0) return false;
  const numEncodings = view.getUint16(2, false);
  if (!numEncodings || numEncodings > 32) return false;
  const dirBytes = 4 + numEncodings * 8;
  if (buf.byteLength < dirBytes) return false;

  for (let i = 0; i < numEncodings; i += 1) {
    const rec = 4 + i * 8;
    const platformId = view.getUint16(rec, false);
    const encodingId = view.getUint16(rec + 2, false);
    const subOff = view.getUint32(rec + 4, false);
    const supported =
      platformId === 0 ||
      (platformId === 3 && (encodingId === 1 || encodingId === 10));
    if (!supported || subOff + 2 > cmapLength) continue;

    const subBuf = await readBlobSlice(blob, cmapOffset + subOff, Math.min(8, cmapLength - subOff));
    if (!subBuf || subBuf.byteLength < 2) continue;
    const format = new DataView(subBuf).getUint16(0, false);
    if (OTS_CMAP_FORMATS.has(format)) return true;
  }
  return false;
}

/**
 * FontFace runs through OpenType Sanitizer (OTS). Many installed faces fail OTS
 * while opentype.js still parses them for 3D extrude — reject before blob URLs.
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
async function blobPassesCssFontFaceChecks(blob) {
  if (blob.size > MAX_CSS_PREVIEW_FONT_BYTES || blob.size < 12) return false;

  const headLen = Math.min(blob.size, 12 + 64 * 16);
  const buf = await readBlobSlice(blob, 0, headLen);
  if (!buf || buf.byteLength < 12) return false;
  const view = new DataView(buf);

  const sfntVersion = view.getUint32(0, false);
  // TrueType collections — often fail or are huge.
  if (sfntVersion === 0x74746366) return false;
  const isOpenType = sfntVersion === 0x4f54544f;
  const isTrueType = sfntVersion === 0x00010000 || sfntVersion === 0x74727565;
  if (!isOpenType && !isTrueType) return false;

  const numTables = view.getUint16(4, false);
  if (
    !sfntDirectoryLooksValid(
      numTables,
      view.getUint16(6, false),
      view.getUint16(8, false),
      view.getUint16(10, false),
    )
  ) {
    return false;
  }

  const tableEnd = 12 + numTables * 16;
  if (buf.byteLength < tableEnd) return false;

  /** @type {Map<string, { offset: number, length: number }>} */
  const tables = new Map();
  for (let i = 0; i < numTables; i += 1) {
    const off = 12 + i * 16;
    const tag = readSfntTag(view, off);
    const tableOffset = view.getUint32(off + 8, false);
    const tableLength = view.getUint32(off + 12, false);
    if (!tableLength || tableOffset + tableLength > blob.size) return false;
    tables.set(tag, { offset: tableOffset, length: tableLength });
  }

  const required = ['head', 'hhea', 'maxp', 'cmap', 'OS/2'];
  for (const tag of required) {
    if (!tables.has(tag)) return false;
  }
  if (!tables.has('glyf') && !tables.has('CFF ')) return false;

  const head = tables.get('head');
  const headBuf = await readBlobSlice(blob, head.offset, Math.min(head.length, 18));
  if (!headBuf || headBuf.byteLength < 16) return false;
  if (new DataView(headBuf).getUint32(12, false) !== 0x5f0f3cf5) return false;

  const maxp = tables.get('maxp');
  const maxpBuf = await readBlobSlice(blob, maxp.offset, Math.min(maxp.length, 32));
  if (!maxpBuf || maxpBuf.byteLength < 6) return false;
  const maxpView = new DataView(maxpBuf);
  if (maxpView.getUint32(0, false) === 0x00010000 && maxpBuf.byteLength >= 18) {
    if (maxpView.getUint16(16, false) === 0) return false;
  }

  const cmap = tables.get('cmap');
  return cmapHasOtsSupportedSubtable(blob, cmap.offset, cmap.length);
}

/**
 * LRU cache of CSS FontFace instances for list/trigger previews (not opentype 3D).
 */
export class LocalFontPreviewCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEntries]
   */
  constructor({ maxEntries = 36 } = {}) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, { cssFamily: string, url: string, face: FontFace }>} */
    this._entries = new Map();
    /** @type {string[]} */
    this._lru = [];
    /** @type {Map<string, Promise<string>>} */
    this._loading = new Map();
    /** Faces that cannot be used for CSS preview (OTS / size / load failure). */
    /** @type {Set<string>} */
    this._cssPreviewBlocked = new Set();
    this._localFontsSupported =
      typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function';
  }

  /**
   * @param {string} postscriptName
   * @returns {Promise<string>} CSS font-family for preview (quoted)
   */
  async getFontFamily(postscriptName) {
    if (!postscriptName || !this._localFontsSupported) {
      return 'inherit';
    }
    if (this._cssPreviewBlocked.has(postscriptName)) {
      return 'inherit';
    }
    const cached = this._entries.get(postscriptName);
    if (cached) {
      this._touch(postscriptName);
      return `"${cached.cssFamily}", sans-serif`;
    }
    let pending = this._loading.get(postscriptName);
    if (!pending) {
      pending = this._load(postscriptName);
      this._loading.set(postscriptName, pending);
    }
    try {
      return await pending;
    } finally {
      this._loading.delete(postscriptName);
    }
  }

  /**
   * Register a preview face from a user-picked file (object URL owned by cache).
   * @param {string} key
   * @param {File} file
   */
  async registerFile(key, file) {
    this._evict(key);
    this._cssPreviewBlocked.delete(key);
    return this._registerCssPreviewFace(key, file);
  }

  dispose() {
    for (const key of [...this._entries.keys()]) {
      this._evict(key);
    }
    this._loading.clear();
    this._cssPreviewBlocked.clear();
  }

  /** @param {string} postscriptName */
  _touch(postscriptName) {
    const idx = this._lru.indexOf(postscriptName);
    if (idx >= 0) this._lru.splice(idx, 1);
    this._lru.push(postscriptName);
  }

  /** @param {string} postscriptName */
  _blockCssPreview(postscriptName) {
    this._cssPreviewBlocked.add(postscriptName);
    this._evict(postscriptName);
  }

  /**
   * @param {string} key
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  async _registerCssPreviewFace(key, blob) {
    if (!(await blobPassesCssFontFaceChecks(blob))) {
      this._blockCssPreview(key);
      return 'inherit';
    }

    const url = URL.createObjectURL(blob);
    const cssFamily = previewFamilyId(key);
    try {
      const face = new FontFace(cssFamily, `url(${url})`);
      await face.load();
      document.fonts.add(face);
      this._entries.set(key, { cssFamily, url, face });
      this._touch(key);
      this._trim();
      return `"${cssFamily}", sans-serif`;
    } catch {
      URL.revokeObjectURL(url);
      this._blockCssPreview(key);
      return 'inherit';
    }
  }

  /** @param {string} postscriptName */
  async _load(postscriptName) {
    if (this._cssPreviewBlocked.has(postscriptName)) return 'inherit';

    try {
      const fonts = await window.queryLocalFonts({ postscriptNames: [postscriptName] });
      const match = fonts?.[0];
      if (!match) return 'inherit';
      const blob = await match.blob();
      return await this._registerCssPreviewFace(postscriptName, blob);
    } catch {
      this._blockCssPreview(postscriptName);
      return 'inherit';
    }
  }

  _trim() {
    while (this._lru.length > this.maxEntries) {
      const oldest = this._lru.shift();
      if (oldest) this._evict(oldest);
    }
  }

  /** @param {string} postscriptName */
  _evict(postscriptName) {
    const entry = this._entries.get(postscriptName);
    if (!entry) return;
    document.fonts.delete(entry.face);
    URL.revokeObjectURL(entry.url);
    this._entries.delete(postscriptName);
    const idx = this._lru.indexOf(postscriptName);
    if (idx >= 0) this._lru.splice(idx, 1);
  }
}
