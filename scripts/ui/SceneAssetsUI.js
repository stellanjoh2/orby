import { animateModalClose, animateModalOpen } from './modalReveal.js';

/**
 * Object → Scene: Outliner modal and Export asset focus.
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
    this.modal = document.querySelector('#outlinerModal');
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
      this.openOutliner();
    });

    this.closeButton?.addEventListener('click', () => this.closeOutliner());
    this.modal?.addEventListener('click', (event) => {
      if (event.target === this.modal) this.closeOutliner();
    });
    this.list?.addEventListener('click', (event) => {
      const row = event.target?.closest?.('[data-asset-id]');
      if (!row) return;
      const id = Number(row.dataset.assetId);
      if (!Number.isFinite(id)) return;
      this.ui.uiSounds?.playSelect?.();
      window.orby?.scene?.selectSceneAsset?.(id);
      this.closeOutliner();
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

    this._renderList(assets, payload.activeId);
    this._syncExport(assets, payload.activeId, multi);
  }

  openOutliner() {
    if (!this.modal || this._open) return;
    const scene = window.orby?.scene;
    if (scene?.sceneObjects?.getSnapshot) this.sync(scene.sceneObjects.getSnapshot());
    this._open = true;
    document.addEventListener('keydown', this._onKeyDown, true);
    this.ui.uiSounds?.playShelfShow?.();
    void animateModalOpen(this.modal, this.modal.querySelector('.load-settings-content'), {
      revealBackdrop: false,
    });
  }

  closeOutliner() {
    if (!this.modal || !this._open) return;
    this._open = false;
    document.removeEventListener('keydown', this._onKeyDown, true);
    animateModalClose(this.modal, this.modal.querySelector('.load-settings-content'));
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
