/**
 * Object → Maps grid (click-pinned mesh preview) and floating 2D map preview panel.
 */
import {
  clearMapInspectThumbCache,
  collectMeshTextureMaps,
  mapInspectDefaultSlotId,
  mapInspectEntryContainsSlot,
  mapInspectEntryTooltip,
  mapInspectFindEntryForSlot,
  mapInspectPanelTabs,
  mapInspectPreviewContext,
  mapInspectSlotLabel,
  mapInspectTextureFileName,
  textureToDataUrl,
  textureToFullSizeUrl,
  textureToPreviewUrl,
  watchPendingMapTextures,
} from '../render/mapInspectTypes.js';
import { ORBY_BLACK } from '../constants.js';

export class MapInspectControls {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} uiManager
   */
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;

    /** @type {import('../render/mapInspectTypes.js').MapInspectEntry[]} */
    this._textureMaps = [];
    /** @type {string | null} Click-pinned map preview on the mesh. */
    this._pinnedSlot = null;
    /** @type {string | null} */
    this._modalSlot = null;
    /** @type {boolean} */
    this._panelOpen = false;
    /** @type {boolean} */
    this._fullsizeOpen = false;
    /** @type {boolean} */
    this._panelHiddenForFullsize = false;
    /** @type {number} */
    this._fullsizePanX = 0;
    /** @type {number} */
    this._fullsizePanY = 0;
    /** @type {number} */
    this._fullsizeDpr = 1;
    /** @type {{ vw: number, vh: number, iw: number, ih: number, minX: number, maxX: number, minY: number, maxY: number } | null} */
    this._fullsizeBounds = null;
    /** @type {number | null} */
    this._fullsizeRedrawRafId = null;
    /** @type {CanvasRenderingContext2D | null} */
    this._fullsizeCanvasCtx = null;
    /** @type {(() => void) | null} */
    this._textureWatchDispose = null;
    /** @type {number} */
    this._suppressModeToasts = 0;
  }

  bind() {
    this._block = document.getElementById('mapInspectBlock');
    this._grid = document.getElementById('mapInspectGrid');
    this._panel = document.getElementById('mapPreviewPanel');
    this._panelBody = this._panel?.querySelector('.map-preview-panel__body') ?? null;
    this._panelTabs = document.getElementById('mapPreviewPanelTabs');
    this._panelImage = document.getElementById('mapPreviewPanelImage');
    this._panelClose = document.getElementById('mapPreviewPanelClose');
    this._panelDrag = document.getElementById('mapPreviewPanelDrag');
    this._panelZoom = document.getElementById('mapPreviewPanelZoom');
    this._fullsizeView = document.getElementById('mapFullsizeView');
    this._fullsizeViewport = document.getElementById('mapFullsizeViewport');
    this._fullsizeCanvas = document.getElementById('mapFullsizeCanvas');
    this._fullsizeImage = document.getElementById('mapFullsizeImage');
    this._fullsizeCanvasCtx = this._fullsizeCanvas?.getContext('2d', { alpha: false }) ?? null;
    this._fullsizeName = document.getElementById('mapFullsizeName');
    this._fullsizeDims = document.getElementById('mapFullsizeDims');
    this._fullsizeClose = document.getElementById('mapFullsizeClose');

    this._panelClose?.addEventListener('click', () => this.closePanel());
    this._panelZoom?.addEventListener('click', () => this.openFullsize());
    this._panelImage?.addEventListener('load', () => this._fitPanelToImage());
    this._fullsizeClose?.addEventListener('click', () => this.closeFullsize());
    this._fullsizeViewport?.addEventListener('pointerdown', (event) => this._startFullsizePan(event));
    this._fullsizeImage?.addEventListener('load', () => {
      this._updateFullsizeMeta();
      this._centerFullsizeImage();
    });
    this._onFullsizeResize = () => {
      if (this._fullsizeOpen && this._cacheFullsizeLayout()) {
        this._clampFullsizePan();
      }
      if (this._panelOpen) {
        this._fitPanelToImage();
      }
    };
    window.addEventListener('resize', this._onFullsizeResize);
    this._panelDrag?.addEventListener('pointerdown', (event) => this._startPanelDrag(event));

    this._onDisplayModeClick = (event) => {
      if (!this._pinnedSlot) return;
      const modeIcon = event.target.closest('.mode-icon');
      if (!modeIcon) return;
      const nextMode = modeIcon.querySelector('input[name="shading"]')?.value;
      const currentMode = this.stateStore.getState().shading;
      if (nextMode && nextMode !== currentMode) {
        // Display mode change clears preview in mesh:shading (EventManager toast includes that).
        return;
      }
      // Re-clicking the active mode (e.g. Shaded) unpins without firing mesh:shading.
      this._unpinPreview({ toast: true });
    };
    this._displayModeIcons()?.addEventListener('click', this._onDisplayModeClick, true);

    this.eventBus.on('scene:batch-apply-start', () => {
      this._suppressModeToasts += 1;
    });
    this.eventBus.on('scene:batch-apply-end', () => {
      this._suppressModeToasts = Math.max(0, this._suppressModeToasts - 1);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (this._fullsizeOpen) {
        event.preventDefault();
        this.closeFullsize();
        return;
      }
      if (this._panelOpen) {
        event.preventDefault();
        this.closePanel();
      }
    });

    this.eventBus.on('scene:model-load-complete', (payload) => {
      if (payload?.success === false) {
        this.reset();
        return;
      }
      this.refresh();
    });
    this.eventBus.on('scene:fbx-map-applied', () => {
      clearMapInspectThumbCache();
      this._unpinPreview();
      this.refresh();
    });
    this.eventBus.on('scene:fbx-map-cleared', () => {
      clearMapInspectThumbCache();
      this._unpinPreview();
      this.refresh();
    });
    this.eventBus.on('scene:model-cleared', () => this.reset());
    this.eventBus.on('mesh:shading', () => this._unpinPreview());
  }

  /**
   * @param {() => import('three').Object3D | null} getModel
   * @param {(mesh: import('three').Mesh) => boolean} [isGlassMesh]
   * @param {() => WeakMap<import('three').Mesh, import('three').Material | import('three').Material[]> | null} [getOriginalMaterials]
   */
  setModelAccessors(getModel, isGlassMesh, getOriginalMaterials) {
    this._getModel = getModel;
    this._isGlassMesh = isGlassMesh;
    this._getOriginalMaterials = getOriginalMaterials;
  }

  refresh() {
    const model = this._getModel?.() ?? null;
    const originalMaterials = this._getOriginalMaterials?.() ?? null;
    this._textureMaps = collectMeshTextureMaps(model, this._isGlassMesh, originalMaterials ?? undefined);

    this._textureWatchDispose?.();
    this._textureWatchDispose = watchPendingMapTextures(this._textureMaps, () => this.refresh());

    if (!this._block || !this._grid) return;

    const hasMaps = this._textureMaps.length > 0;
    this._block.hidden = !hasMaps;

    if (!hasMaps) {
      this._grid.replaceChildren();
      this.closePanel();
      this._unpinPreview();
      return;
    }

    const pinnedStillValid =
      this._pinnedSlot &&
      this._textureMaps.some((entry) => mapInspectEntryContainsSlot(entry, this._pinnedSlot));
    if (!pinnedStillValid) {
      this._unpinPreview();
    }

    this._renderGrid();
    if (this._panelOpen) {
      this._renderPanelTabs();
      this._syncPanelImage();
    }
    if (this._fullsizeOpen) {
      this._syncFullsizeImage();
    }
  }

  reset() {
    this._textureWatchDispose?.();
    this._textureWatchDispose = null;
    clearMapInspectThumbCache();
    this._setDisplaySuspended(false);
    this._textureMaps = [];
    if (this._block) this._block.hidden = true;
    if (this._grid) this._grid.replaceChildren();
    this.closeFullsize();
    this.closePanel();
    this._unpinPreview();
  }

  _renderGrid() {
    if (!this._grid) return;
    this._grid.replaceChildren();

    for (const entry of this._textureMaps) {
      const pinnedChannel = entry.packed
        ? entry.packedSlots?.find((s) => s.id === this._pinnedSlot)?.channel ?? null
        : entry.channel ?? null;
      const thumb = entry.packed
        ? textureToDataUrl(entry.texture, 96, null)
        : textureToDataUrl(entry.texture, 96, entry.channel);
      this._grid.appendChild(
        this._createTile({
          entry,
          id: entry.id,
          label: entry.label,
          tooltip: mapInspectEntryTooltip(entry, this._pinnedSlot),
          thumbSrc: thumb,
          variantCount: entry.variantCount ?? 1,
          packedChannel: pinnedChannel,
          isAction: false,
        }),
      );
    }

    this._grid.appendChild(
      this._createTile({
        id: 'viewMaps',
        label: 'View Maps',
        tooltip: 'View Maps',
        thumbSrc: null,
        variantCount: 1,
        isAction: true,
      }),
    );

    this._updateTileSelection();
  }

  /**
   * @param {{
   *   entry?: import('../render/mapInspectTypes.js').MapInspectEntry,
   *   id: string,
   *   label: string,
   *   tooltip: string,
   *   thumbSrc: string | null,
   *   variantCount: number,
   *   packedChannel?: import('../render/mapInspectTypes.js').OrmChannel | null,
   *   isAction: boolean,
   * }} opts
   */
  _createTile(opts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-inspect-tile';
    btn.dataset.mapSlot = opts.id;
    btn.setAttribute('aria-label', opts.label);
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.tooltip = opts.tooltip;

    if (opts.isAction) {
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-expand';
      icon.setAttribute('aria-hidden', 'true');
      btn.classList.add('map-inspect-tile--action');
      btn.appendChild(icon);
    } else if (opts.thumbSrc) {
      const img = document.createElement('img');
      img.src = opts.thumbSrc;
      img.alt = '';
      img.draggable = false;
      btn.appendChild(img);
    } else {
      btn.classList.add('map-inspect-tile--empty');
    }

    if (!opts.isAction && opts.variantCount > 1) {
      const badge = document.createElement('span');
      badge.className = 'map-inspect-tile__variants';
      badge.textContent = String(opts.variantCount);
      badge.setAttribute('aria-hidden', 'true');
      btn.appendChild(badge);
    }

    if (!opts.isAction && opts.entry?.packed && opts.packedChannel) {
      const channelBadge = document.createElement('span');
      channelBadge.className = 'map-inspect-tile__channel';
      channelBadge.textContent = opts.packedChannel.toUpperCase();
      channelBadge.setAttribute('aria-hidden', 'true');
      btn.appendChild(channelBadge);
    }

    btn.addEventListener('click', () => {
      if (opts.id === 'viewMaps') {
        this.ui.uiSounds?.playSelect?.();
        const initial = this._pinnedSlot ?? mapInspectDefaultSlotId(this._textureMaps);
        this.openPanel(initial);
        return;
      }

      if (opts.entry?.packed) {
        this._togglePackedEntry(opts.entry);
      } else if (this._pinnedSlot === opts.id) {
        this._unpinPreview({ toast: true });
      } else {
        this._pinSlot(opts.id);
      }
      this.ui.uiSounds?.playSelect?.();
    });

    return btn;
  }

  /**
   * @param {import('../render/mapInspectTypes.js').MapInspectEntry} entry
   */
  _togglePackedEntry(entry) {
    const slots = entry.packedSlots?.map((s) => s.id) ?? [];
    if (slots.length === 0) return;

    const pinnedInPack = this._pinnedSlot && slots.includes(this._pinnedSlot);
    if (!pinnedInPack) {
      this._pinSlot(slots[0]);
      return;
    }

    const idx = slots.indexOf(this._pinnedSlot);
    if (idx === slots.length - 1) {
      this._unpinPreview({ toast: true });
    } else {
      this._pinSlot(slots[idx + 1]);
    }
  }

  /**
   * @param {string} slotId
   */
  _toastMapPreview(slotId) {
    const entry = mapInspectFindEntryForSlot(this._textureMaps, slotId);
    const sub = entry?.packed ? entry.packedSlots?.find((s) => s.id === slotId) : null;
    const label = sub?.label ?? mapInspectSlotLabel(slotId);
    if (!label) return;
    this.ui.showModeChangeToast?.('mapPreview', label);
  }

  _refreshPackedTileChrome() {
    if (!this._grid) return;
    this._grid.querySelectorAll('.map-inspect-tile[data-map-slot]').forEach((tile) => {
      const entry = this._textureMaps.find((e) => e.id === tile.dataset.mapSlot);
      if (!entry?.packed) return;

      tile.dataset.tooltip = mapInspectEntryTooltip(entry, this._pinnedSlot);

      const channel = entry.packedSlots?.find((s) => s.id === this._pinnedSlot)?.channel ?? null;
      let badge = tile.querySelector('.map-inspect-tile__channel');
      if (channel) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'map-inspect-tile__channel';
          badge.setAttribute('aria-hidden', 'true');
          tile.appendChild(badge);
        }
        badge.textContent = channel.toUpperCase();
      } else if (badge) {
        badge.remove();
      }
    });
  }

  /**
   * @param {string} slotId
   * @param {{ toast?: boolean }} [opts]
   */
  _pinSlot(slotId, opts = {}) {
    if (!slotId || slotId === 'viewMaps') return;

    const prev = this._pinnedSlot;
    const { toast = true } = opts;
    this._pinnedSlot = slotId;
    this._setDisplaySuspended(true);
    this._updateTileSelection();
    this._refreshPackedTileChrome();
    if (this._panelOpen) {
      this._modalSlot = slotId;
      this._syncModalTabActive();
      this._syncPanelImage();
    }
    if (this._fullsizeOpen) {
      this._modalSlot = slotId;
      this._syncFullsizeImage();
    }
    this.eventBus.emit('mesh:map-inspect-preview', slotId);

    if (toast && this._suppressModeToasts === 0 && slotId !== prev) {
      this._toastMapPreview(slotId);
    }
  }

  /**
   * @param {{ toast?: boolean }} [opts]
   */
  _unpinPreview(opts = {}) {
    const { toast = false } = opts;
    const hadPin = !!this._pinnedSlot;
    this._pinnedSlot = null;
    if (hadPin) {
      this._setDisplaySuspended(false);
    }
    this._updateTileSelection();
    this._refreshPackedTileChrome();
    this.eventBus.emit('mesh:map-inspect-clear');
    if (hadPin && toast && this._suppressModeToasts === 0) {
      this.ui.showModeChangeToast?.('mapPreview', 'cleared');
    }
  }

  _updateTileSelection() {
    if (!this._grid) return;
    this._grid.querySelectorAll('.map-inspect-tile[data-map-slot]').forEach((tile) => {
      const slot = tile.dataset.mapSlot;
      const entry = this._textureMaps.find((e) => e.id === slot);
      const isPinned = !!this._pinnedSlot && mapInspectEntryContainsSlot(entry ?? { id: slot }, this._pinnedSlot);
      tile.classList.toggle('is-pinned', isPinned);
      tile.setAttribute('aria-pressed', isPinned ? 'true' : 'false');
    });
  }

  openPanel(initialSlotId) {
    if (!this._panel || this._textureMaps.length === 0) return;

    this._panelOpen = true;
    this._panel.hidden = false;
    const resolved =
      initialSlotId && mapInspectFindEntryForSlot(this._textureMaps, initialSlotId)
        ? initialSlotId
        : mapInspectDefaultSlotId(this._textureMaps);
    this._modalSlot = resolved;
    this._renderPanelTabs();
    this._syncPanelImage();
    this._positionPanelDefault();
    requestAnimationFrame(() => {
      if (this._panelOpen) this._fitPanelToImage();
    });
    if (this._modalSlot) {
      this._pinSlot(this._modalSlot);
    }

    this.ui.uiSounds?.playShelfShow?.();
  }

  closePanel() {
    if (!this._panel) return;
    this.closeFullsize();
    this._panelOpen = false;
    this._panel.hidden = true;
    this._modalSlot = null;
  }

  openFullsize() {
    if (!this._fullsizeView || this._textureMaps.length === 0) return;
    const slotId = this._modalSlot ?? this._pinnedSlot ?? mapInspectDefaultSlotId(this._textureMaps);
    if (!slotId) return;

    this._fullsizeOpen = true;
    this._fullsizeView.hidden = false;
    this.ui.beginShelfOverlaySuppression?.();
    if (this._panelOpen && this._panel) {
      this._panel.hidden = true;
      this._panelHiddenForFullsize = true;
    }
    if (this._modalSlot !== slotId) {
      this._modalSlot = slotId;
      this._syncModalTabActive();
      this._syncPanelImage();
      this._pinSlot(slotId, { toast: false });
    }
    this._syncFullsizeImage();
    requestAnimationFrame(() => {
      if (!this._fullsizeOpen) return;
      if (this._cacheFullsizeLayout()) {
        this._centerFullsizeImage();
      }
    });
    this.ui.uiSounds?.playShelfShow?.();
  }

  closeFullsize() {
    if (!this._fullsizeView || !this._fullsizeOpen) return;
    this._fullsizeOpen = false;
    this._fullsizeView.hidden = true;
    this._cancelFullsizeRedraw();
    this._fullsizeBounds = null;
    this.ui.endShelfOverlaySuppression?.();
    if (this._panelHiddenForFullsize && this._panel && this._panelOpen) {
      this._panel.hidden = false;
    }
    this._panelHiddenForFullsize = false;
    if (this._fullsizeImage) {
      this._fullsizeImage.removeAttribute('src');
      this._fullsizeImage.alt = '';
    }
    if (this._fullsizeName) this._fullsizeName.textContent = 'Texture map';
    if (this._fullsizeDims) this._fullsizeDims.textContent = '';
    this._fullsizeViewport?.classList.remove('is-dragging');
  }

  _renderPanelTabs() {
    if (!this._panelTabs) return;
    this._panelTabs.replaceChildren();

    for (const tab of mapInspectPanelTabs(this._textureMaps)) {
      const thumb = textureToDataUrl(tab.entry.texture, 48, tab.channel);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-preview-panel__tab';
      btn.dataset.mapTab = tab.slotId;
      btn.setAttribute('aria-label', mapInspectEntryTooltip(tab.entry, tab.slotId));
      btn.title = mapInspectEntryTooltip(tab.entry, tab.slotId);

      if (thumb) {
        const img = document.createElement('img');
        img.src = thumb;
        img.alt = '';
        img.draggable = false;
        btn.appendChild(img);
      }

      btn.classList.toggle('is-active', tab.slotId === this._modalSlot);
      btn.addEventListener('click', () => {
        this._modalSlot = tab.slotId;
        this._syncModalTabActive();
        this._syncPanelImage();
        if (this._fullsizeOpen) this._syncFullsizeImage();
        this._pinSlot(tab.slotId);
        this.ui.uiSounds?.playSelect?.();
      });

      this._panelTabs.appendChild(btn);
    }
  }

  _syncModalTabActive() {
    if (!this._panelTabs || !this._modalSlot) return;
    this._panelTabs.querySelectorAll('.map-preview-panel__tab').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.mapTab === this._modalSlot);
    });
  }

  _syncPanelImage() {
    if (!this._panelImage) return;
    const entry = mapInspectFindEntryForSlot(this._textureMaps, this._modalSlot) ?? this._textureMaps[0];
    const slotId = this._modalSlot ?? mapInspectDefaultSlotId(this._textureMaps);
    const ctx = entry ? mapInspectPreviewContext(entry, slotId) : null;
    if (!ctx?.texture) {
      this._panelImage.removeAttribute('src');
      this._panelImage.alt = '';
      this._resetPanelBodySize();
      return;
    }

    const url = textureToPreviewUrl(entry, slotId);
    if (url) {
      this._panelImage.src = url;
    }
    this._panelImage.alt = ctx.label;
    if (this._panelImage.complete && this._panelImage.naturalWidth > 0) {
      this._fitPanelToImage();
    }
  }

  _resetPanelBodySize() {
    if (!this._panelBody) return;
    this._panelBody.style.width = '';
    this._panelBody.style.height = '';
  }

  /**
   * @returns {number}
   */
  _getShelfInsetPx() {
    const shelf = document.getElementById('shelf');
    const insetStr =
      (shelf ? getComputedStyle(shelf).getPropertyValue('--shelf-inset').trim() : '') ||
      getComputedStyle(document.documentElement).getPropertyValue('--shelf-inset').trim() ||
      '48px';
    return parseFloat(insetStr) || 48;
  }

  _fitPanelToImage() {
    if (!this._panelOpen || !this._panelImage || !this._panelBody) return;

    const iw = this._panelImage.naturalWidth;
    const ih = this._panelImage.naturalHeight;
    if (!iw || !ih) return;

    const maxDim = window.innerHeight * 0.5;
    const aspect = iw / ih;
    let bodyW = aspect >= 1 ? maxDim : maxDim * aspect;
    let bodyH = aspect >= 1 ? maxDim / aspect : maxDim;

    const chrome = this._panel?.querySelector('.map-preview-panel__chrome');
    if (chrome) {
      const style = getComputedStyle(chrome);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const inset = this._getShelfInsetPx();
      const maxBodyW = window.innerWidth - inset * 2 - padX;
      if (bodyW > maxBodyW) {
        const scale = maxBodyW / bodyW;
        bodyW *= scale;
        bodyH *= scale;
      }
    }

    this._panelBody.style.width = `${Math.round(bodyW)}px`;
    this._panelBody.style.height = `${Math.round(bodyH)}px`;
    if (this._panel) {
      this._panel.style.width = 'auto';
    }
  }

  _syncFullsizeImage() {
    if (!this._fullsizeImage) return;
    const entry = mapInspectFindEntryForSlot(this._textureMaps, this._modalSlot) ?? this._textureMaps[0];
    const slotId = this._modalSlot ?? mapInspectDefaultSlotId(this._textureMaps);
    const ctx = entry ? mapInspectPreviewContext(entry, slotId) : null;
    if (!ctx?.texture) {
      this._fullsizeImage.removeAttribute('src');
      this._fullsizeImage.alt = '';
      if (this._fullsizeName) this._fullsizeName.textContent = 'Texture map';
      if (this._fullsizeDims) this._fullsizeDims.textContent = '';
      return;
    }

    const url = textureToFullSizeUrl(entry, slotId);
    if (url) {
      this._fullsizeImage.src = url;
    }
    this._fullsizeImage.alt = ctx.label;
    this._syncFullsizeMeta(ctx.texture, slotId, ctx.label);
    if (this._fullsizeImage.complete && this._fullsizeImage.naturalWidth > 0) {
      this._updateFullsizeMeta();
      this._centerFullsizeImage();
    }
  }

  /**
   * @param {import('three').Texture} texture
   * @param {string | null | undefined} slotId
   * @param {string} fallbackLabel
   */
  _syncFullsizeMeta(texture, slotId, fallbackLabel) {
    if (!this._fullsizeName) return;
    const model = this._getModel?.() ?? null;
    const originalMaterials = this._getOriginalMaterials?.() ?? null;
    const fileName =
      mapInspectTextureFileName(texture, slotId, model, originalMaterials ?? undefined) ||
      fallbackLabel;
    this._fullsizeName.textContent = fileName;
  }

  _updateFullsizeMeta() {
    if (!this._fullsizeDims || !this._fullsizeImage) return;
    const w = this._fullsizeImage.naturalWidth;
    const h = this._fullsizeImage.naturalHeight;
    this._fullsizeDims.textContent =
      w > 0 && h > 0 ? ` · ${w} × ${h} px · 100% scale` : '';
  }

  _cancelFullsizeRedraw() {
    if (this._fullsizeRedrawRafId == null) return;
    cancelAnimationFrame(this._fullsizeRedrawRafId);
    this._fullsizeRedrawRafId = null;
  }

  _scheduleFullsizeRedraw() {
    if (this._fullsizeRedrawRafId != null) return;
    this._fullsizeRedrawRafId = requestAnimationFrame(() => {
      this._fullsizeRedrawRafId = null;
      this._drawFullsizeCanvas();
    });
  }

  /**
   * @returns {boolean}
   */
  _cacheFullsizeLayout() {
    if (!this._fullsizeViewport || !this._fullsizeCanvas || !this._fullsizeImage) return false;

    const iw = this._fullsizeImage.naturalWidth;
    const ih = this._fullsizeImage.naturalHeight;
    const vw = this._fullsizeViewport.clientWidth;
    const vh = this._fullsizeViewport.clientHeight;
    if (!vw || !vh || !iw || !ih) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._fullsizeDpr = dpr;
    const centerX = (vw - iw) / 2;
    const centerY = (vh - ih) / 2;
    this._fullsizeBounds = {
      vw,
      vh,
      iw,
      ih,
      minX: iw <= vw ? centerX : vw - iw,
      maxX: iw <= vw ? centerX : 0,
      minY: ih <= vh ? centerY : vh - ih,
      maxY: ih <= vh ? centerY : 0,
    };

    const canvas = this._fullsizeCanvas;
    const cw = Math.round(vw * dpr);
    const ch = Math.round(vh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      this._fullsizeCanvasCtx = canvas.getContext('2d', { alpha: false });
    }

    return !!this._fullsizeCanvasCtx;
  }

  _drawFullsizeCanvas() {
    const ctx = this._fullsizeCanvasCtx;
    const canvas = this._fullsizeCanvas;
    const img = this._fullsizeImage;
    const bounds = this._fullsizeBounds;
    if (!ctx || !canvas || !img?.complete || !bounds) return;

    const { vw, vh, iw, ih } = bounds;
    const panX = this._fullsizePanX;
    const panY = this._fullsizePanY;
    const dpr = this._fullsizeDpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ORBY_BLACK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const srcX = Math.max(0, -panX);
    const srcY = Math.max(0, -panY);
    const destX = panX > 0 ? panX : 0;
    const destY = panY > 0 ? panY : 0;
    const visW = Math.min(iw - srcX, vw - destX);
    const visH = Math.min(ih - srcY, vh - destY);
    if (visW <= 0 || visH <= 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, srcX, srcY, visW, visH, destX, destY, visW, visH);
  }

  _centerFullsizeImage() {
    if (!this._cacheFullsizeLayout()) return;
    const bounds = this._fullsizeBounds;
    if (!bounds) return;
    this._fullsizePanX = (bounds.vw - bounds.iw) / 2;
    this._fullsizePanY = (bounds.vh - bounds.ih) / 2;
    this._clampFullsizePan();
  }

  _clampFullsizePan() {
    const bounds = this._fullsizeBounds;
    if (!bounds) return;

    this._fullsizePanX = Math.max(bounds.minX, Math.min(bounds.maxX, this._fullsizePanX));
    this._fullsizePanY = Math.max(bounds.minY, Math.min(bounds.maxY, this._fullsizePanY));
    this._scheduleFullsizeRedraw();
  }

  /**
   * @param {PointerEvent} event
   */
  _startFullsizePan(event) {
    if (!this._fullsizeViewport || !this._fullsizeOpen || event.button !== 0) return;
    event.preventDefault();

    const viewport = this._fullsizeViewport;
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = this._fullsizePanX;
    const originY = this._fullsizePanY;

    viewport.setPointerCapture?.(event.pointerId);
    viewport.classList.add('is-dragging');

    const onMove = (moveEvent) => {
      this._fullsizePanX = originX + (moveEvent.clientX - startX);
      this._fullsizePanY = originY + (moveEvent.clientY - startY);
      this._clampFullsizePan();
    };

    const onUp = (upEvent) => {
      viewport.releasePointerCapture?.(upEvent.pointerId);
      viewport.classList.remove('is-dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  _positionPanelDefault() {
    if (!this._panel) return;

    const shelf = document.getElementById('shelf');
    const insetRaw = shelf ? getComputedStyle(shelf).getPropertyValue('--shelf-inset').trim() : '';
    const inset = insetRaw || '48px';

    this._panel.style.top = inset;
    this._panel.style.left = inset;
    this._panel.style.width = '';
  }

  /**
   * @param {PointerEvent} event
   */
  _startPanelDrag(event) {
    if (!this._panel || !this._panelDrag) return;
    event.preventDefault();

    const panel = this._panel;
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    panel.setPointerCapture?.(event.pointerId);

    const onMove = (moveEvent) => {
      const insetRaw = getComputedStyle(document.documentElement).getPropertyValue('--shelf-inset').trim();
      const shelf = document.getElementById('shelf');
      const insetStr =
        (shelf ? getComputedStyle(shelf).getPropertyValue('--shelf-inset').trim() : '') ||
        insetRaw ||
        '48px';
      const inset = parseFloat(insetStr) || 48;

      const w = panel.offsetWidth;
      const h = panel.offsetHeight;

      let left = moveEvent.clientX - offsetX;
      let top = moveEvent.clientY - offsetY;

      left = Math.max(inset, Math.min(left, window.innerWidth - w - inset));
      top = Math.max(inset, Math.min(top, window.innerHeight - h - inset));

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const onUp = (upEvent) => {
      panel.releasePointerCapture?.(upEvent.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  _displayModeIcons() {
    return document.querySelector('[data-panel="mesh"] .mode-icons');
  }

  /**
   * @param {boolean} suspended
   */
  _setDisplaySuspended(suspended) {
    this._displayModeIcons()?.classList.toggle('is-map-inspect-active', suspended);
  }
}
