/**
 * Object → Maps grid (click-pinned mesh preview) and floating 2D map preview panel.
 */
import {
  clearMapInspectThumbCache,
  collectMeshTextureMaps,
  mapInspectEntryTooltip,
  textureToDataUrl,
  textureToPreviewUrl,
  watchPendingMapTextures,
} from '../render/mapInspectTypes.js';

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
    /** @type {(() => void) | null} */
    this._textureWatchDispose = null;
  }

  bind() {
    this._block = document.getElementById('mapInspectBlock');
    this._grid = document.getElementById('mapInspectGrid');
    this._panel = document.getElementById('mapPreviewPanel');
    this._panelTabs = document.getElementById('mapPreviewPanelTabs');
    this._panelImage = document.getElementById('mapPreviewPanelImage');
    this._panelClose = document.getElementById('mapPreviewPanelClose');
    this._panelDrag = document.getElementById('mapPreviewPanelDrag');

    this._panelClose?.addEventListener('click', () => this.closePanel());
    this._panelDrag?.addEventListener('pointerdown', (event) => this._startPanelDrag(event));

    this._onDisplayModeClick = (event) => {
      if (!this._pinnedSlot) return;
      if (!event.target.closest('.mode-icon')) return;
      // Capture before radio change — also handles re-clicking the already-selected mode
      // (e.g. Shaded) which does not fire `change` while a map preview is pinned.
      this._unpinPreview();
    };
    this._displayModeIcons()?.addEventListener('click', this._onDisplayModeClick, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this._panelOpen) {
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
    this.eventBus.on('scene:fbx-map-applied', () => this.refresh());
    this.eventBus.on('scene:model-cleared', () => this.reset());
    this.eventBus.on('mesh:shading', () => this._unpinPreview({ toastOnShading: true }));
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
      this._pinnedSlot && this._textureMaps.some((entry) => entry.id === this._pinnedSlot);
    if (!pinnedStillValid) {
      this._unpinPreview();
    }

    this._renderGrid();
    if (this._panelOpen) {
      this._renderPanelTabs();
      this._syncPanelImage();
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
    this.closePanel();
    this._unpinPreview();
  }

  _renderGrid() {
    if (!this._grid) return;
    this._grid.replaceChildren();

    for (const entry of this._textureMaps) {
      const thumb = textureToDataUrl(entry.texture, 96, entry.channel);
      this._grid.appendChild(
        this._createTile({
          id: entry.id,
          label: entry.label,
          tooltip: mapInspectEntryTooltip(entry),
          thumbSrc: thumb,
          variantCount: entry.variantCount ?? 1,
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
   * @param {{ id: string, label: string, tooltip: string, thumbSrc: string | null, variantCount: number, isAction: boolean }} opts
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

    btn.addEventListener('click', () => {
      if (opts.id === 'viewMaps') {
        this.ui.uiSounds?.playSelect?.();
        const initial = this._pinnedSlot ?? this._textureMaps[0]?.id ?? null;
        this.openPanel(initial);
        return;
      }

      if (this._pinnedSlot === opts.id) {
        this._unpinPreview();
      } else {
        this._pinSlot(opts.id);
      }
      this.ui.uiSounds?.playSelect?.();
    });

    return btn;
  }

  /**
   * @param {string} slotId
   */
  _pinSlot(slotId) {
    if (!slotId || slotId === 'viewMaps') return;
    this._pinnedSlot = slotId;
    this._setDisplaySuspended(true);
    this._updateTileSelection();
    if (this._panelOpen) {
      this._modalSlot = slotId;
      this._syncModalTabActive();
      this._syncPanelImage();
    }
    this.eventBus.emit('mesh:map-inspect-preview', slotId);
  }

  /**
   * @param {{ toastOnShading?: boolean }} [opts]
   */
  _unpinPreview(opts = {}) {
    const hadPin = !!this._pinnedSlot;
    this._pinnedSlot = null;
    if (hadPin) {
      this._setDisplaySuspended(false);
    }
    this._updateTileSelection();
    this.eventBus.emit('mesh:map-inspect-clear');
    if (hadPin && opts.toastOnShading) {
      this.ui.showToast?.('Map preview cleared — display mode changed', 2800, {
        notification: false,
      });
    }
  }

  _updateTileSelection() {
    if (!this._grid) return;
    this._grid.querySelectorAll('.map-inspect-tile[data-map-slot]').forEach((tile) => {
      const slot = tile.dataset.mapSlot;
      tile.classList.toggle('is-pinned', !!this._pinnedSlot && slot === this._pinnedSlot);
      tile.setAttribute('aria-pressed', tile.classList.contains('is-pinned') ? 'true' : 'false');
    });
  }

  openPanel(initialSlotId) {
    if (!this._panel || this._textureMaps.length === 0) return;

    this._panelOpen = true;
    this._panel.hidden = false;
    this._modalSlot = initialSlotId ?? this._textureMaps[0]?.id ?? null;
    this._renderPanelTabs();
    this._syncPanelImage();
    this._positionPanelDefault();
    if (this._modalSlot) {
      this._pinSlot(this._modalSlot);
    }

    this.ui.uiSounds?.playShelfShow?.();
  }

  closePanel() {
    if (!this._panel) return;
    this._panelOpen = false;
    this._panel.hidden = true;
    this._modalSlot = null;
  }

  _renderPanelTabs() {
    if (!this._panelTabs) return;
    this._panelTabs.replaceChildren();

    for (const entry of this._textureMaps) {
      const thumb = textureToDataUrl(entry.texture, 48, entry.channel);
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'map-preview-panel__tab';
      tab.dataset.mapTab = entry.id;
      tab.setAttribute('aria-label', mapInspectEntryTooltip(entry));
      tab.title = mapInspectEntryTooltip(entry);

      if (thumb) {
        const img = document.createElement('img');
        img.src = thumb;
        img.alt = '';
        img.draggable = false;
        tab.appendChild(img);
      }

      tab.classList.toggle('is-active', entry.id === this._modalSlot);
      tab.addEventListener('click', () => {
        this._modalSlot = entry.id;
        this._syncModalTabActive();
        this._syncPanelImage();
        this._pinSlot(entry.id);
        this.ui.uiSounds?.playSelect?.();
      });

      this._panelTabs.appendChild(tab);
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
    const entry = this._textureMaps.find((m) => m.id === this._modalSlot) ?? this._textureMaps[0];
    if (!entry?.texture) {
      this._panelImage.removeAttribute('src');
      this._panelImage.alt = '';
      return;
    }

    const url = textureToPreviewUrl(entry);
    if (url) {
      this._panelImage.src = url;
    }
    this._panelImage.alt = entry.label;
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
