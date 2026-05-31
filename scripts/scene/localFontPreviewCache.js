/** @param {string} postscriptName */
function previewFamilyId(postscriptName) {
  const safe = String(postscriptName).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `OrbyPreview_${safe}`;
}

/** Browser OTS rejects web fonts above ~128MB; skip CSS preview well below that. */
const MAX_CSS_PREVIEW_FONT_BYTES = 32 * 1024 * 1024;

/**
 * FontFace runs through OpenType Sanitizer (OTS). Many installed faces fail OTS
 * (missing OS/2, legacy cmap) while opentype.js still parses them for 3D extrude.
 * @param {Blob} blob
 * @returns {Promise<boolean>}
 */
async function blobPassesCssFontFaceChecks(blob) {
  if (blob.size > MAX_CSS_PREVIEW_FONT_BYTES) return false;

  const headLen = Math.min(blob.size, 12 + 64 * 16);
  let buf;
  try {
    buf = await blob.slice(0, headLen).arrayBuffer();
  } catch {
    return false;
  }
  const view = new DataView(buf);
  if (buf.byteLength < 12) return false;

  // TrueType collections — often fail or are huge; skip CSS preview attempts.
  if (view.getUint32(0, false) === 0x74746366) return false;

  const numTables = view.getUint16(4, false);
  if (!numTables || numTables > 64) return false;

  const tableEnd = 12 + numTables * 16;
  if (buf.byteLength < tableEnd) return true;

  let hasOs2 = false;
  let hasCmap = false;
  for (let i = 0; i < numTables; i += 1) {
    const off = 12 + i * 16;
    const tag = String.fromCharCode(
      view.getUint8(off),
      view.getUint8(off + 1),
      view.getUint8(off + 2),
      view.getUint8(off + 3),
    );
    if (tag === 'OS/2') hasOs2 = true;
    if (tag === 'cmap') hasCmap = true;
  }
  return hasOs2 && hasCmap;
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
