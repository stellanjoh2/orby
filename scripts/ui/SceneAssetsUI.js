import { animateModalClose, animateModalOpen, prefersReducedMotion } from './modalReveal.js';
import {
  bindFloatingPanelHeaderDrag,
  setFloatingPanelDragging,
} from './floatingPanelHeaderDrag.js';

/**
 * Object → Scene: Outliner floating panel and Export asset focus.
 * Import Object lives on StartMenuController (prompts replace vs add when needed).
 * Selection swaps the Object menu onto that asset. Studio and Camera stay put.
 */
export class SceneAssetsUI {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../UIManager.js').UIManager} ui
   */
  constructor(eventBus, ui) {
    this.eventBus = eventBus;
    this.ui = ui;
    this._open = false;
    this._syncingFocus = false;
    this._onKeyDown = (event) => {
      if (event.key !== 'Escape' || !this._open) return;
      event.preventDefault();
      this.closeOutliner();
    };
  }

  bind() {
    this.outlinerButton = document.querySelector('#openOutlinerButton');
    this.panel = document.querySelector('#outlinerPanel');
    this.panelChrome = this.panel?.querySelector('.outliner-panel__chrome') ?? null;
    this.panelHeader = this.panel?.querySelector('.outliner-panel__header') ?? null;
    this.list = document.querySelector('#outlinerList');
    this.empty = document.querySelector('#outlinerEmpty');
    this.closeButton = document.querySelector('#closeOutliner');
    this.exportFocusLine = document.querySelector('#exportAssetFocusLine');
    this.exportFocus = document.querySelector('#exportAssetFocus');
    this.exportObjectGroup = document.querySelector('#exportVideoObjectGroup');
    this.exportMultiNote = document.querySelector('#exportMultiAssetNote');

    this.outlinerButton?.addEventListener('click', () => {
      if (this.outlinerButton?.disabled) return;
      this.ui.uiSounds?.playSelect?.();
      if (this._open) this.closeOutliner();
      else this.openOutliner();
    });

    this.closeButton?.addEventListener('click', () => this.closeOutliner());
    bindFloatingPanelHeaderDrag(this.panelHeader, (event) => this._startPanelDrag(event));
    this.list?.addEventListener('click', (event) => {
      const row = event.target?.closest?.('[data-asset-id]');
      if (!row) return;
      const id = Number(row.dataset.assetId);
      if (!Number.isFinite(id)) return;
      this.ui.uiSounds?.playSelect?.();
      const selected = window.orby?.scene?.selectSceneAsset?.(id);
      if (!selected) return;
      const name = row.textContent?.trim() || 'Object';
      this.ui.showToast?.(`${name} Selected`, 2200, { notification: false });
    });
    this.exportFocus?.addEventListener('change', () => {
      if (this._syncingFocus) return;
      const id = Number(this.exportFocus.value);
      if (!Number.isFinite(id)) return;
      window.orby?.scene?.selectSceneAsset?.(id);
    });

    this.eventBus.on('scene:assets-changed', (payload) => this.sync(payload));
    this.eventBus.on('scene:model-cleared', () => {
      this.sync({ count: 0, activeId: null, assets: [] });
    });
    this.eventBus.on('scene:model-load-complete', (payload) => {
      if (payload?.success === false) return;
      const scene = window.orby?.scene;
      if (scene?.sceneObjects?.getSnapshot) {
        this.sync(scene.sceneObjects.getSnapshot());
        return;
      }
      this.sync({
        count: scene?.currentModel ? 1 : 0,
        activeId: null,
        assets: [],
      });
    });

    const scene = window.orby?.scene;
    if (scene?.sceneObjects?.getSnapshot) this.sync(scene.sceneObjects.getSnapshot());
    else this.sync({ count: scene?.currentModel ? 1 : 0, activeId: null, assets: [] });
  }

  /**
   * @param {{ count?: number, activeId?: number | null, assets?: { id: number, name: string }[] }} [payload]
   */
  sync(payload = {}) {
    const assets = Array.isArray(payload.assets) ? payload.assets : [];
    const count = Number.isFinite(payload.count) ? payload.count : assets.length;
    const multi = count > 1;

    if (this.outlinerButton) this.outlinerButton.disabled = !multi;
    if (!multi && this._open) this.closeOutliner({ animate: false });

    this._renderList(assets, payload.activeId);
    this._syncExport(assets, payload.activeId, multi);
  }

  openOutliner() {
    if (!this.panel || !this.panelChrome || this._open) return;
    const snap = window.orby?.scene?.sceneObjects?.getSnapshot?.();
    if (snap) this.sync(snap);
    if ((snap?.count ?? 0) < 2) return;

    this._open = true;
    document.addEventListener('keydown', this._onKeyDown, true);
    this._positionPanelDefault();
    this.panel.removeAttribute('hidden');
    this.panel.style.display = '';
    this.ui.uiSounds?.playShelfShow?.();

    if (prefersReducedMotion()) {
      this._snapPanelVisible();
      return;
    }

    void animateModalOpen(this.panel, this.panelChrome, { revealBackdrop: false }).then(() => {
      this.panel.style.display = '';
    });
  }

  /**
   * @param {{ animate?: boolean }} [options]
   */
  closeOutliner(options = {}) {
    if (!this.panel || !this.panelChrome || !this._open) return;
    const animate = options.animate !== false;
    this._open = false;
    document.removeEventListener('keydown', this._onKeyDown, true);

    if (animate) this.ui.uiSounds?.playShelfHide?.();

    if (!animate || prefersReducedMotion()) {
      this._snapPanelHidden();
      return;
    }

    animateModalClose(
      this.panel,
      this.panelChrome,
      () => {
        this.panel.setAttribute('hidden', '');
        this.panel.style.display = '';
      },
      false,
      { revealBackdrop: false },
    );
  }

  _snapPanelVisible() {
    if (!this.panel || !this.panelChrome) return;
    this.panel.removeAttribute('hidden');
    this.panel.style.display = '';
  }

  _snapPanelHidden() {
    if (!this.panel || !this.panelChrome) return;
    this.panel.setAttribute('hidden', '');
    this.panel.style.display = '';
  }

  _positionPanelDefault() {
    if (!this.panel) return;
    const shelf = document.getElementById('shelf');
    const insetRaw = shelf ? getComputedStyle(shelf).getPropertyValue('--shelf-inset').trim() : '';
    const inset = insetRaw || '48px';
    this.panel.style.top = inset;
    this.panel.style.left = inset;
  }

  /**
   * @param {PointerEvent} event
   */
  _startPanelDrag(event) {
    if (!this.panel) return;
    event.preventDefault();

    const panel = this.panel;
    setFloatingPanelDragging(panel, true);
    const rect = panel.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    panel.setPointerCapture?.(event.pointerId);

    const onMove = (moveEvent) => {
      const inset = this._getShelfInsetPx();
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
      setFloatingPanelDragging(panel, false);
      panel.releasePointerCapture?.(upEvent.pointerId);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  _getShelfInsetPx() {
    const shelf = document.getElementById('shelf');
    const insetStr =
      (shelf ? getComputedStyle(shelf).getPropertyValue('--shelf-inset').trim() : '') ||
      getComputedStyle(document.documentElement).getPropertyValue('--shelf-inset').trim() ||
      '48px';
    return parseFloat(insetStr) || 48;
  }

  /**
   * @param {{ id: number, name: string }[]} assets
   * @param {number | null | undefined} activeId
   */
  _renderList(assets, activeId) {
    if (!this.list) return;
    this.list.replaceChildren();
    const show = assets.length > 1;
    if (this.empty) this.empty.hidden = show;
    if (!show) return;
    for (const asset of assets) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'outliner-row';
      button.dataset.assetId = String(asset.id);
      button.textContent = asset.name;
      const active = asset.id === activeId;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'true');
      item.appendChild(button);
      this.list.appendChild(item);
    }
  }

  /**
   * @param {{ id: number, name: string }[]} assets
   * @param {number | null | undefined} activeId
   * @param {boolean} multi
   */
  _syncExport(assets, activeId, multi) {
    if (this.exportFocusLine) this.exportFocusLine.hidden = !multi;
    if (this.exportMultiNote) this.exportMultiNote.hidden = !multi;
    if (this.exportObjectGroup) {
      this.exportObjectGroup.classList.toggle('is-muted', multi);
      this.exportObjectGroup.querySelectorAll('button, input, select').forEach((el) => {
        el.disabled = multi;
      });
    }
    if (!this.exportFocus) return;
    this._syncingFocus = true;
    this.exportFocus.replaceChildren();
    for (const asset of assets) {
      const option = document.createElement('option');
      option.value = String(asset.id);
      option.textContent = asset.name;
      this.exportFocus.appendChild(option);
    }
    if (activeId != null) this.exportFocus.value = String(activeId);
    this._syncingFocus = false;
  }
}
