import { cssFontFamilyFromName } from '../scene/localFontPreviewCache.js';

const PREVIEW_FONT_SIZE = '1.05rem';
const PANEL_SHELF_GAP_PX = 10;
const PANEL_WIDTH_FALLBACK_PX = 320;
const OPTION_BUILD_CHUNK = 80;

/** @param {string} text */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Font family combobox with lazy typeface previews (Local Font Access + FontFace).
 * Opens a Figma-style panel to the left of the shelf — fixed search, scrollable list.
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
    this._optionsBuilding = false;
    /** @type {Promise<void> | null} */
    this._optionsBuildPromise = null;
    this._filter = '';
    /** @type {IntersectionObserver | null} */
    this._observer = null;
    /** @type {HTMLElement | null} */
    this._shelfScrollEl = null;
    /** @type {(() => void) | null} */
    this._listScrollCleanup = null;
    this._listScrollRaf = 0;
    this._listScrollHideTimer = null;
    this._docClick = this._onDocumentClick.bind(this);
    this._docKey = this._onDocumentKeydown.bind(this);
    this._reposition = this._positionPanel.bind(this);

    root.innerHTML = `
      <input type="hidden" id="fontExtrudeFamilyValue" name="fontExtrudeFamily" class="font-extrude-family-value" value="" />
      <button
        type="button"
        class="font-extrude-family-trigger"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span class="font-extrude-family-trigger-label">— Select font —</span>
      </button>
    `;

    this.hidden = root.querySelector('.font-extrude-family-value');
    this.trigger = root.querySelector('.font-extrude-family-trigger');
    this.triggerLabel = root.querySelector('.font-extrude-family-trigger-label');

    this.panel = document.createElement('div');
    this.panel.className = 'font-extrude-family-panel';
    this.panel.innerHTML = `
        <div class="font-extrude-family-panel-head">
          <span class="font-extrude-family-panel-title">Fonts</span>
          <button
            type="button"
            class="font-extrude-family-panel-close"
            aria-label="Close font list"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
        <div class="font-extrude-family-panel-search-wrap">
          <input
            type="search"
            id="fontExtrudeFamilySearch"
            name="fontExtrudeFamilySearch"
            class="font-extrude-family-search"
            placeholder="Search fonts…"
            autocomplete="off"
            spellcheck="false"
            aria-label="Search fonts"
          />
        </div>
        <div class="font-extrude-family-list-scroll">
          <ul class="font-extrude-family-listbox" role="listbox" tabindex="-1"></ul>
          <div class="font-extrude-family-scrollbar" aria-hidden="true">
            <div class="font-extrude-family-scrollbar-thumb"></div>
          </div>
        </div>
    `;
    this.search = this.panel.querySelector('.font-extrude-family-search');
    this.listbox = this.panel.querySelector('.font-extrude-family-listbox');
    this.scrollRail = this.panel.querySelector('.font-extrude-family-scrollbar');
    this.scrollThumb = this.panel.querySelector('.font-extrude-family-scrollbar-thumb');
    this.panelClose = this.panel.querySelector('.font-extrude-family-panel-close');
    this._ensurePanelPortal();
    this._setupListScrollbar();

    this.trigger?.addEventListener('click', () => {
      if (this.trigger?.disabled || this._opening) return;
      if (this._open) this.close();
      else this.open();
    });
    this.trigger?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) {
        e.preventDefault();
        this.close();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !this._open && !this._opening) {
        e.preventDefault();
        this.open();
      }
    });
    this.panelClose?.addEventListener('click', () => {
      this.close();
      this.trigger?.focus();
    });
    this.search?.addEventListener('input', () => {
      this._filter = (this.search instanceof HTMLInputElement ? this.search.value : '')
        .trim()
        .toLowerCase();
      this._applyFilter(this._filter);
      this._scrollToFilterAnchor();
      if (this._open) this._startObserver();
    });
    this.search?.addEventListener('keydown', (e) => {
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
    this.listbox?.addEventListener('click', (e) => this._onListClick(e));
    this.listbox?.addEventListener('keydown', (e) => this._onListKeydown(e));
  }

  /**
   * @param {Array<{ family: string, postscriptName: string }>} fonts
   */
  populate(fonts) {
    this._fonts = fonts ?? [];
    this._optionsBuilt = false;
    this._optionsBuildPromise = null;
    if (this.listbox) this.listbox.innerHTML = '';
    if (!this._value && this._fonts.length) {
      this.setValue('', '— Select font —');
    }
    if (this._fonts.length) {
      this._optionsBuildPromise = this._buildOptionsChunked();
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
      // Keep the selected name in the normal UI font so it reads crisp white like
      // the other dropdown triggers (the per-typeface preview stays in the list).
      this.triggerLabel.style.fontFamily = 'inherit';
      this.triggerLabel.style.fontSize = '';
    }
    this._syncSelectedOption();
  }

  /** Single custom entry (loaded .ttf / .otf). */
  setCustomEntry(postscriptName, label, previewFontFamily) {
    this._fonts = [{ postscriptName, family: label }];
    this._optionsBuilt = false;
    this._optionsBuildPromise = null;
    if (this.listbox) this.listbox.innerHTML = '';
    this._optionsBuildPromise = this._buildOptionsChunked();
    this.setValue(postscriptName, label);
  }

  getValue() {
    return this._value;
  }

  setDisabled(disabled) {
    if (this.trigger) this.trigger.disabled = !!disabled;
  }

  open() {
    if (this._open || this._opening || !this.listbox || !this.trigger || !this.panel) return;
    void this._openAsync();
  }

  async _openAsync() {
    if (this._open || this._opening || !this.listbox || !this.trigger || !this.panel) return;
    this._opening = true;
    this._setOpeningState(true);
    try {
      if (typeof this.onPrepare === 'function') {
        await this.onPrepare();
      }
      if (this._open || !this.listbox || !this.trigger || !this.panel) return;
      await this._ensureOptionsBuilt();
      if (this._open || !this.listbox || !this.trigger || !this.panel) return;
      this._openList();
    } finally {
      this._opening = false;
      this._setOpeningState(false);
    }
  }

  _openList() {
    if (this._open || !this.listbox || !this.trigger || !this.panel) return;
    this._filter = '';
    if (this.search instanceof HTMLInputElement) this.search.value = '';
    this._applyFilter('');
    this._open = true;
    this.trigger.setAttribute('aria-expanded', 'true');
    this._ensurePanelPortal();
    this._positionPanel();
    this.panel.classList.add('is-open');

    this._startObserver();
    this._scrollToFilterAnchor();
    this._syncListScrollbarThumb();
    this.search?.focus({ preventScroll: true });
    this.search?.select();

    document.addEventListener('click', this._docClick, true);
    document.addEventListener('keydown', this._docKey, true);
    window.addEventListener('resize', this._reposition, { passive: true });
    this._shelfScrollEl = document.querySelector('#shelf .panels');
    this._shelfScrollEl?.addEventListener('scroll', this._reposition, { passive: true });
  }

  _positionPanel() {
    if (!this.panel || !this.trigger) return;

    const shelf = document.getElementById('shelf');
    const shelfRect = shelf?.getBoundingClientRect();
    const triggerRect = this.trigger.getBoundingClientRect();
    const viewportPad = 8;
    const panelWidth = Math.round(shelfRect?.width ?? PANEL_WIDTH_FALLBACK_PX);

    let left = shelfRect
      ? shelfRect.left - panelWidth - PANEL_SHELF_GAP_PX
      : triggerRect.left - panelWidth - PANEL_SHELF_GAP_PX;
    if (left < viewportPad) {
      left = Math.max(viewportPad, triggerRect.left - panelWidth - PANEL_SHELF_GAP_PX);
    }

    let top = shelfRect?.top ?? triggerRect.top;
    let height = shelfRect?.height ?? Math.min(420, window.innerHeight - top - viewportPad);
    const maxBottom = window.innerHeight - viewportPad;
    if (top + height > maxBottom) {
      height = Math.max(220, maxBottom - top);
    }

    this.panel.style.width = `${panelWidth}px`;
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.height = `${Math.round(height)}px`;
  }

  _ensurePanelPortal() {
    if (!this.panel) return;
    let portal = document.getElementById('orby-font-picker-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'orby-font-picker-portal';
      document.body.appendChild(portal);
    }
    if (this.panel.parentElement !== portal) {
      portal.appendChild(this.panel);
    }
  }

  _clearPanelPosition() {
    if (!this.panel) return;
    this.panel.style.width = '';
    this.panel.style.left = '';
    this.panel.style.top = '';
    this.panel.style.height = '';
  }

  close() {
    if (!this._open || !this.panel) return;
    this._open = false;
    this.trigger?.setAttribute('aria-expanded', 'false');
    this.panel.classList.remove('is-open');
    this._clearPanelPosition();
    this._stopObserver();
    document.removeEventListener('click', this._docClick, true);
    document.removeEventListener('keydown', this._docKey, true);
    window.removeEventListener('resize', this._reposition);
    this._shelfScrollEl?.removeEventListener('scroll', this._reposition);
    this._shelfScrollEl = null;
  }

  destroy() {
    this.close();
    this._stopObserver();
    this._teardownListScrollbar();
    this.panel?.remove();
    this.panel = null;
    this.root = null;
  }

  /** @param {boolean} opening */
  _setOpeningState(opening) {
    this.trigger?.classList.toggle('font-extrude-family-trigger--opening', opening);
    this.trigger?.setAttribute('aria-busy', opening ? 'true' : 'false');
  }

  _setupListScrollbar() {
    if (!this.listbox || !this.scrollRail || !this.scrollThumb || this._listScrollCleanup) return;

    const el = this.listbox;
    const rail = this.scrollRail;
    const thumb = this.scrollThumb;
    const revealClass = 'is-revealed';

    const onScroll = () => {
      if (this._listScrollRaf !== 0) return;
      this._listScrollRaf = requestAnimationFrame(() => {
        this._listScrollRaf = 0;
        this._syncListScrollbarThumb();
        rail.classList.add(revealClass);
        clearTimeout(this._listScrollHideTimer);
        this._listScrollHideTimer = setTimeout(() => {
          rail.classList.remove(revealClass);
          this._listScrollHideTimer = null;
        }, 500);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => this._syncListScrollbarThumb();
    window.addEventListener('resize', onResize);
    /** @type {ResizeObserver | undefined} */
    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(el);
    }
    this._syncListScrollbarThumb();

    this._listScrollCleanup = () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      resizeObserver?.disconnect();
      if (this._listScrollRaf !== 0) {
        cancelAnimationFrame(this._listScrollRaf);
        this._listScrollRaf = 0;
      }
      clearTimeout(this._listScrollHideTimer);
      this._listScrollHideTimer = null;
      rail.classList.remove(revealClass);
      this._listScrollCleanup = null;
    };
  }

  _teardownListScrollbar() {
    this._listScrollCleanup?.();
  }

  _syncListScrollbarThumb() {
    const el = this.listbox;
    const thumb = this.scrollThumb;
    if (!el || !thumb) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      thumb.style.height = '0px';
      thumb.style.transform = 'translateY(0px)';
      return;
    }
    const travel = scrollHeight - clientHeight;
    const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
    const maxOffset = Math.max(0, clientHeight - thumbHeight);
    const offset = travel > 0 ? (scrollTop / travel) * maxOffset : 0;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${offset}px)`;
  }

  async _ensureOptionsBuilt() {
    if (this._optionsBuilt) return;
    if (!this._optionsBuildPromise && this._fonts.length) {
      this._optionsBuildPromise = this._buildOptionsChunked();
    }
    await this._optionsBuildPromise;
  }

  async _buildOptionsChunked() {
    if (this._optionsBuilt || this._optionsBuilding || !this.listbox) return;
    this._optionsBuilding = true;
    try {
      for (let i = 0; i < this._fonts.length; i += OPTION_BUILD_CHUNK) {
        if (!this.listbox) return;
        const slice = this._fonts.slice(i, i + OPTION_BUILD_CHUNK);
        const frag = document.createDocumentFragment();
        for (let j = 0; j < slice.length; j++) {
          frag.appendChild(this._createOptionElement(slice[j], i + j));
        }
        this.listbox.appendChild(frag);
        if (i + OPTION_BUILD_CHUNK < this._fonts.length) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      this._optionsBuilt = true;
      this._syncSelectedOption();
      this._syncListScrollbarThumb();
    } finally {
      this._optionsBuilding = false;
    }
  }

  /**
   * @param {{ family: string, postscriptName: string }} font
   * @param {number} sortIndex
   */
  _createOptionElement(font, sortIndex) {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.value = font.postscriptName;
    li.dataset.family = font.family;
    li.dataset.sortIndex = String(sortIndex);
    li.className = 'font-extrude-family-option';
    li.tabIndex = -1;

    const check = document.createElement('span');
    check.className = 'font-extrude-family-option-check';
    check.setAttribute('aria-hidden', 'true');
    check.innerHTML =
      '<span class="font-extrude-family-option-check-badge"><i class="fa-solid fa-check" aria-hidden="true"></i></span>';

    const label = document.createElement('span');
    label.className = 'font-extrude-family-option-label';
    const labelText = document.createElement('span');
    labelText.className = 'font-extrude-family-option-label-text';
    labelText.textContent = font.family;
    label.appendChild(labelText);
    this._applyPreviewStyles(label, font.family);

    li.append(check, label);
    if (font.postscriptName === this._value) {
      li.setAttribute('aria-selected', 'true');
      li.classList.add('is-selected');
    }
    return li;
  }

  /** @param {string} filter */
  _applyFilter(filter) {
    if (!this.listbox) return;
    for (const li of this.listbox.querySelectorAll('.font-extrude-family-option')) {
      const family = li.dataset.family || '';
      const match = !filter || family.toLowerCase().includes(filter);
      li.hidden = !match;
      li.classList.toggle('is-filtered-match', !!filter && match);
      li.classList.remove('is-search-lead');
      const labelText = li.querySelector('.font-extrude-family-option-label-text');
      if (labelText) this._renderLabelHighlight(labelText, family, filter);
    }
    if (filter) this._sortOptionsForFilter(filter);
    else this._restoreOptionOrder();
    if (filter) {
      this.listbox.querySelector('.font-extrude-family-option:not([hidden])')?.classList.add('is-search-lead');
    }
    this._syncListScrollbarThumb();
  }

  /** @param {string} filter */
  _sortOptionsForFilter(filter) {
    if (!this.listbox) return;
    const lowerFilter = filter.toLowerCase();
    /** @param {string} family */
    const rank = (family) => {
      const lower = family.toLowerCase();
      if (lower === lowerFilter) return 0;
      if (lower.startsWith(lowerFilter)) return 1;
      return 2;
    };

    const options = [...this.listbox.querySelectorAll('.font-extrude-family-option')];
    options.sort((a, b) => {
      const aMatch = !a.hidden;
      const bMatch = !b.hidden;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      if (!aMatch && !bMatch) {
        return Number(a.dataset.sortIndex) - Number(b.dataset.sortIndex);
      }
      const fa = a.dataset.family || '';
      const fb = b.dataset.family || '';
      const rankDiff = rank(fa) - rank(fb);
      if (rankDiff !== 0) return rankDiff;
      return fa.localeCompare(fb, undefined, { sensitivity: 'base' });
    });

    const frag = document.createDocumentFragment();
    for (const li of options) frag.appendChild(li);
    this.listbox.appendChild(frag);
  }

  _restoreOptionOrder() {
    if (!this.listbox) return;
    const options = [...this.listbox.querySelectorAll('.font-extrude-family-option')];
    options.sort((a, b) => Number(a.dataset.sortIndex) - Number(b.dataset.sortIndex));
    const frag = document.createDocumentFragment();
    for (const li of options) frag.appendChild(li);
    this.listbox.appendChild(frag);
  }

  /**
   * @param {HTMLElement} labelText
   * @param {string} family
   * @param {string} filter
   */
  _renderLabelHighlight(labelText, family, filter) {
    if (!filter) {
      labelText.textContent = family;
      return;
    }
    const lower = family.toLowerCase();
    const idx = lower.indexOf(filter);
    if (idx === -1) {
      labelText.textContent = family;
      return;
    }
    const before = family.slice(0, idx);
    const match = family.slice(idx, idx + filter.length);
    const after = family.slice(idx + filter.length);
    labelText.innerHTML = `${escapeHtml(before)}<mark class="font-extrude-family-option-mark">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
  }

  _firstVisibleOption() {
    return this.listbox?.querySelector('.font-extrude-family-option:not([hidden])') ?? null;
  }

  _scrollToFilterAnchor() {
    if (this._filter && this.listbox) {
      this.listbox.scrollTop = 0;
      return;
    }
    const selected = this.listbox?.querySelector('.font-extrude-family-option.is-selected:not([hidden])');
    (selected ?? this._firstVisibleOption())?.scrollIntoView({ block: 'nearest' });
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
      if (idx <= 0) {
        this.search?.focus();
        return;
      }
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
    if (this.root?.contains(t) || this.panel?.contains(t)) return;
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
