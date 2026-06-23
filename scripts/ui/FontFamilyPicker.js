import { cssFontFamilyFromName } from '../scene/localFontPreviewCache.js';

const PREVIEW_FONT_SIZE = '1.05rem';

/**
 * Font family combobox with lazy typeface previews (Local Font Access + FontFace).
 */
export class FontFamilyPicker {
  /**
   * @param {HTMLElement} root
   * @param {Object} options
   * @param {(postscriptName: string) => Promise<string>} options.getPreviewFontFamily
   * @param {() => void | Promise<void>} [options.onPrepare] — before list opens (e.g. Local Font Access)
   * @param {() => void} [options.onChange]
   * @param {import('../UIManager.js').UIManager} [options.ui]
   */
  constructor(root, { getPreviewFontFamily, onPrepare, onChange, ui } = {}) {
    this.root = root;
    this.getPreviewFontFamily = getPreviewFontFamily;
    this.onPrepare = onPrepare;
    this.onChange = onChange;
    this.ui = ui;
    this._value = '';
    this._label = '— Select font —';
    this._fonts = [];
    this._open = false;
    this._opening = false;
    this._optionsBuilt = false;
    this._filter = '';
    /** @type {IntersectionObserver | null} */
    this._observer = null;
    this._docClick = this._onDocumentClick.bind(this);
    this._docKey = this._onDocumentKeydown.bind(this);

    root.innerHTML = `
      <input type="hidden" class="font-extrude-family-value" value="" />
      <button
        type="button"
        class="font-extrude-family-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span class="font-extrude-family-trigger-label">— Select font —</span>
      </button>
      <ul class="font-extrude-family-listbox" role="listbox" tabindex="-1" hidden></ul>
    `;

    this.hidden = root.querySelector('.font-extrude-family-value');
    this.trigger = root.querySelector('.font-extrude-family-trigger');
    this.triggerLabel = root.querySelector('.font-extrude-family-trigger-label');
    this.listbox = root.querySelector('.font-extrude-family-listbox');

    this.trigger?.addEventListener('click', () => {
      if (this.trigger?.disabled) return;
      if (this._open) this.close();
      else this.open();
    });
    this.trigger?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) {
        e.preventDefault();
        this.close();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !this._open) {
        e.preventDefault();
        this.open();
      }
    });
    this.listbox?.addEventListener('click', (e) => this._onListClick(e));
    this.listbox?.addEventListener('keydown', (e) => this._onListKeydown(e));
  }

  /**
   * @param {Array<{ family: string, postscriptName: string }>} fonts
   */
  populate(fonts) {
    this._fonts = fonts ?? [];
    this._optionsBuilt = false;
    if (this.listbox) this.listbox.innerHTML = '';
    if (!this._value && this._fonts.length) {
      this.setValue('', '— Select font —');
    }
  }

  /**
   * @param {string} postscriptName
   * @param {string} label
   */
  setValue(postscriptName, label) {
    this._value = postscriptName || '';
    this._label = label || '— Select font —';
    if (this.hidden) this.hidden.value = this._value;
    if (this.triggerLabel) {
      this.triggerLabel.textContent = this._label;
      const family =
        this._fonts.find((f) => f.postscriptName === this._value)?.family || label;
      if (this._value && family && family !== '— Select font —') {
        this._applyPreviewStyles(this.triggerLabel, family, { includePreviewSize: false });
      } else {
        this.triggerLabel.style.fontFamily = 'inherit';
        this.triggerLabel.style.fontSize = '';
      }
    }
    if (this._value && this.triggerLabel?.style.fontFamily === 'inherit') {
      void this._applyPreviewToElement(this.triggerLabel, this._value);
    }
    this._syncSelectedOption();
  }

  /** Single custom entry (loaded .ttf / .otf). */
  setCustomEntry(postscriptName, label, previewFontFamily) {
    this._fonts = [{ postscriptName, family: label }];
    this._optionsBuilt = false;
    if (this.listbox) this.listbox.innerHTML = '';
    this.setValue(postscriptName, label);
    if (previewFontFamily && this.triggerLabel) {
      this.triggerLabel.style.fontFamily = previewFontFamily;
    }
  }

  getValue() {
    return this._value;
  }

  setDisabled(disabled) {
    if (this.trigger) this.trigger.disabled = !!disabled;
  }

  open() {
    if (this._open || !this.listbox || !this.trigger) return;
    void this._openAsync();
  }

  async _openAsync() {
    if (this._open || !this.listbox || !this.trigger) return;
    if (this._opening) return;
    this._opening = true;
    try {
      if (typeof this.onPrepare === 'function') {
        await this.onPrepare();
      }
      if (this._open || !this.listbox || !this.trigger) return;
      this._openList();
    } finally {
      this._opening = false;
    }
  }

  _openList() {
    if (this._open || !this.listbox || !this.trigger) return;
    this._buildOptions();
    this._filter = '';
    const search = this.listbox.querySelector('.font-extrude-family-search');
    if (search instanceof HTMLInputElement) search.value = '';
    this._applyFilter('');

    this._open = true;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.listbox.hidden = false;

    const rect = this.trigger.getBoundingClientRect();
    document.body.appendChild(this.listbox);
    this.listbox.classList.add('font-extrude-family-listbox--floating');
    this.listbox.style.position = 'fixed';
    this.listbox.style.left = `${rect.left}px`;
    this.listbox.style.width = `${Math.max(rect.width, 200)}px`;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const maxH = Math.min(280, Math.max(120, spaceBelow));
    this.listbox.style.maxHeight = `${maxH}px`;
    this.listbox.style.top = `${rect.bottom + 4}px`;
    this.listbox.style.zIndex = '12000';

    this._startObserver();
    void this._applyPreviewToElement(this.triggerLabel, this._value);
    this.listbox
      .querySelector('.font-extrude-family-option.is-selected')
      ?.scrollIntoView({ block: 'nearest' });
    this.listbox.focus({ preventScroll: true });
    document.addEventListener('click', this._docClick, true);
    document.addEventListener('keydown', this._docKey, true);
  }

  close() {
    if (!this._open || !this.listbox) return;
    this._open = false;
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.listbox.hidden = true;
    this.listbox.classList.remove('font-extrude-family-listbox--floating');
    this.listbox.style.cssText = '';
    this.root?.appendChild(this.listbox);
    this._stopObserver();
    document.removeEventListener('click', this._docClick, true);
    document.removeEventListener('keydown', this._docKey, true);
  }

  destroy() {
    this.close();
    this._stopObserver();
    this.root = null;
  }

  _buildOptions() {
    if (this._optionsBuilt || !this.listbox) return;
    this._optionsBuilt = true;

    const searchItem = document.createElement('li');
    searchItem.setAttribute('role', 'presentation');
    searchItem.className = 'font-extrude-family-search-item';
    searchItem.innerHTML =
      '<input type="search" class="font-extrude-family-search" placeholder="Search fonts…" autocomplete="off" spellcheck="false" />';
    this.listbox.appendChild(searchItem);

    const search = searchItem.querySelector('.font-extrude-family-search');
    search?.addEventListener('input', () => {
      this._filter = (search instanceof HTMLInputElement ? search.value : '').trim().toLowerCase();
      this._applyFilter(this._filter);
      this._scrollToFirstVisibleOption();
      if (this._open) this._startObserver();
    });
    search?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
        this.trigger?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._firstVisibleOption()?.focus();
        return;
      }
      if (e.key === 'Enter') {
        const first = this._firstVisibleOption();
        if (first) {
          e.preventDefault();
          first.click();
        }
      }
    });

    for (const font of this._fonts) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.value = font.postscriptName;
      li.dataset.family = font.family;
      li.className = 'font-extrude-family-option';
      li.tabIndex = -1;
      const label = document.createElement('span');
      label.className = 'font-extrude-family-option-label';
      label.textContent = font.family;
      this._applyPreviewStyles(label, font.family);
      li.appendChild(label);
      this.listbox.appendChild(li);
    }
  }

  /** @param {string} filter */
  _applyFilter(filter) {
    if (!this.listbox) return;
    for (const li of this.listbox.querySelectorAll('.font-extrude-family-option')) {
      const family = (li.dataset.family || '').toLowerCase();
      const match = !filter || family.includes(filter);
      li.hidden = !match;
    }
  }

  _firstVisibleOption() {
    return this.listbox?.querySelector('.font-extrude-family-option:not([hidden])') ?? null;
  }

  _scrollToFirstVisibleOption() {
    this._firstVisibleOption()?.scrollIntoView({ block: 'nearest' });
  }

  _startObserver() {
    this._stopObserver();
    if (!this.listbox || !this.getPreviewFontFamily) return;
    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const li = entry.target;
          const ps = li.dataset?.value;
          const label = li.querySelector('.font-extrude-family-option-label');
          if (ps && label) void this._applyPreviewToElement(label, ps);
          this._observer?.unobserve(li);
        }
      },
      { root: this.listbox, rootMargin: '40px 0px', threshold: 0 },
    );
    for (const li of this.listbox.querySelectorAll('.font-extrude-family-option')) {
      if (!li.hidden) this._observer.observe(li);
    }
  }

  _stopObserver() {
    this._observer?.disconnect();
    this._observer = null;
  }

  /**
   * @param {HTMLElement | null} el
   * @param {string} familyName
   * @param {{ includePreviewSize?: boolean }} [options]
   */
  _applyPreviewStyles(el, familyName, { includePreviewSize = true } = {}) {
    if (!el || !familyName) return;
    el.style.fontFamily = cssFontFamilyFromName(familyName);
    el.style.fontSize = includePreviewSize ? PREVIEW_FONT_SIZE : '';
  }

  /**
   * @param {HTMLElement | null} el
   * @param {string} postscriptName
   */
  async _applyPreviewToElement(el, postscriptName) {
    if (!el || !postscriptName || !this.getPreviewFontFamily) return;

    const optionFamily = el.closest('.font-extrude-family-option')?.dataset?.family;
    if (optionFamily) {
      this._applyPreviewStyles(el, optionFamily);
      el.dataset.previewPs = postscriptName;
      el.dataset.previewReady = '1';
      return;
    }

    if (el.dataset.previewPs === postscriptName && el.dataset.previewReady === '1') return;
    el.dataset.previewPs = postscriptName;
    el.dataset.previewReady = '0';
    try {
      const fontFamily = await this.getPreviewFontFamily(postscriptName);
      if (el.dataset.previewPs !== postscriptName) return;
      if (fontFamily && fontFamily !== 'inherit') {
        el.style.fontFamily = fontFamily;
        if (!el.classList.contains('font-extrude-family-trigger-label')) {
          el.style.fontSize = PREVIEW_FONT_SIZE;
        } else {
          el.style.fontSize = '';
        }
      }
      el.dataset.previewReady = '1';
    } catch {
      /* keep system UI font */
    }
  }

  _syncSelectedOption() {
    if (!this.listbox) return;
    for (const li of this.listbox.querySelectorAll('.font-extrude-family-option')) {
      const on = li.dataset.value === this._value;
      li.setAttribute('aria-selected', on ? 'true' : 'false');
      li.classList.toggle('is-selected', on);
    }
  }

  /** @param {MouseEvent} e */
  _onListClick(e) {
    const li = e.target?.closest?.('.font-extrude-family-option');
    const val = li?.dataset?.value;
    if (!val) return;
    this.ui?.uiSounds?.playSelect();
    this.setValue(val, li.dataset.family || val);
    this.onChange?.();
    this.close();
    this.trigger?.focus();
  }

  /** @param {KeyboardEvent} e */
  _onListKeydown(e) {
    const options = [...(this.listbox?.querySelectorAll('.font-extrude-family-option:not([hidden])') ?? [])];
    const idx = options.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      this.trigger?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = options[Math.min(idx + 1, options.length - 1)] ?? options[0];
      next?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = options[Math.max(idx - 1, 0)] ?? options[0];
      prev?.focus();
    }
    if (e.key === 'Enter' && document.activeElement?.classList?.contains('font-extrude-family-option')) {
      e.preventDefault();
      document.activeElement?.click();
    }
  }

  /** @param {MouseEvent} e */
  _onDocumentClick(e) {
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (this.root?.contains(t) || this.listbox?.contains(t)) return;
    this.close();
  }

  /** @param {KeyboardEvent} e */
  _onDocumentKeydown(e) {
    if (e.key === 'Escape') {
      this.close();
      this.trigger?.focus();
    }
  }
}
