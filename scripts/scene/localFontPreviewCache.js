/** @param {string} postscriptName */
function previewFamilyId(postscriptName) {
  const safe = String(postscriptName).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `OrbyPreview_${safe}`;
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
    const url = URL.createObjectURL(file);
    const cssFamily = previewFamilyId(key);
    const face = new FontFace(cssFamily, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    this._entries.set(key, { cssFamily, url, face });
    this._touch(key);
    this._trim();
    return `"${cssFamily}", sans-serif`;
  }

  dispose() {
    for (const key of [...this._entries.keys()]) {
      this._evict(key);
    }
    this._loading.clear();
  }

  /** @param {string} postscriptName */
  _touch(postscriptName) {
    const idx = this._lru.indexOf(postscriptName);
    if (idx >= 0) this._lru.splice(idx, 1);
    this._lru.push(postscriptName);
  }

  /** @param {string} postscriptName */
  async _load(postscriptName) {
    const fonts = await window.queryLocalFonts({ postscriptNames: [postscriptName] });
    const match = fonts?.[0];
    if (!match) return 'inherit';
    const blob = await match.blob();
    const url = URL.createObjectURL(blob);
    const cssFamily = previewFamilyId(postscriptName);
    const face = new FontFace(cssFamily, `url(${url})`);
    await face.load();
    document.fonts.add(face);
    this._entries.set(postscriptName, { cssFamily, url, face });
    this._touch(postscriptName);
    this._trim();
    return `"${cssFamily}", sans-serif`;
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
