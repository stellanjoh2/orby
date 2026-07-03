/**
 * Object → Shape Library — shelf toggle + left floating panel + viewport drag-and-drop.
 */
import {
  SHAPE_LIBRARY,
  SHAPE_LIBRARY_DRAG_MIME,
  SHAPE_LIBRARY_PANEL_WIDTH_PX,
  findShapeLibraryEntry,
} from '../shapeLibrary/shapeLibraryCatalog.js';
import { renderShapeLibraryThumb } from '../shapeLibrary/shapeLibraryThumbRenderer.js';
import {
  bindFloatingPanelHeaderDrag,
  setFloatingPanelDragging,
} from './floatingPanelHeaderDrag.js';

export class ShapeLibraryUI {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {import('../UIManager.js').UIManager} uiManager
   * @param {import('../shapeLibrary/ShapeLibraryController.js').ShapeLibraryController} controller
   */
  constructor(eventBus, stateStore, uiManager, controller) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;
    this.controller = controller;
    this._panelOpen = false;
    this._bound = false;
    this._viewportDropActive = false;
    this._tileDragged = false;
    /** @type {string | null} */
    this._activeDragShapeId = null;
    this._gridBuilt = false;
    /** @type {(() => void) | null} */
    this._stateUnsub = null;
  }

  mount() {
    if (this._shelfBlock) return;

    const fontPanel = document.getElementById('fontExtrudePanel');
    const anchor = fontPanel?.parentElement;
    if (!anchor) return;

    const block = document.createElement('div');
    block.className = 'panel-block';
    block.id = 'shapeLibraryShelfBlock';
    block.innerHTML = `
      <div class="subsection" data-subsection="shape-library">
        <div class="block-title has-toggle">
          <span
            data-tooltip="Low-poly starter shapes — drag into the viewport or pick from the library grid"
          >Shape Library</span>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <label class="effect-toggle" data-tooltip="Open or close the shape library panel">
              <input type="checkbox" id="shapeLibraryPanelOpen" />
              <span class="effect-indicator" aria-hidden="true"></span>
              <span class="sr-only">Show Shape Library</span>
            </label>
          </div>
        </div>
      </div>
    `;
    anchor.insertBefore(block, fontPanel.nextSibling);
    this._shelfBlock = block;
    this._panelOpenToggle = block.querySelector('#shapeLibraryPanelOpen');

    if (this.ui.dom?.subsections) {
      this.ui.dom.subsections['shape-library'] = block.querySelector(
        '[data-subsection="shape-library"]',
      );
    }
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    this._panel = document.getElementById('shapeLibraryPanel');
    this._panelGrid = document.getElementById('shapeLibraryGrid');
    this._panelClose = document.getElementById('shapeLibraryPanelClose');
    this._panelHeader = this._panel?.querySelector('.shape-library-panel__header') ?? null;
    this._dropTarget = document.querySelector('.viewport');
    this._webgl = document.getElementById('webgl');

    this.syncFromState(this.stateStore.getState());
    this._stateUnsub = this.stateStore.subscribe((state) => this.syncFromState(state));

    this._panelOpenToggle?.addEventListener('change', (event) => {
      this.ui.uiSounds?.playSelect();
      const open = !!event.target.checked;
      this.stateStore.set('shapeLibrary.panelOpen', open);
    });
    this._panelClose?.addEventListener('click', () => {
      this.stateStore.set('shapeLibrary.panelOpen', false);
    });
    bindFloatingPanelHeaderDrag(this._panelHeader, (event) => this._startPanelDrag(event));

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this._panelOpen) return;
      event.preventDefault();
      this.stateStore.set('shapeLibrary.panelOpen', false);
    });

    document.addEventListener('dragend', () => {
      this._activeDragShapeId = null;
      this._setViewportDropActive(false);
    });

    this._bindViewportDrop();
  }

  /**
   * @param {import('../StateStore.js').AppState | undefined} state
   */
  syncFromState(state) {
    const open = !!state?.shapeLibrary?.panelOpen;
    if (this._panelOpenToggle && this._panelOpenToggle.checked !== open) {
      this._panelOpenToggle.checked = open;
    }
    if (open) this._showPanel();
    else this._hidePanel();
  }

  openPanel() {
    this.stateStore.set('shapeLibrary.panelOpen', true);
  }

  closePanel() {
    this.stateStore.set('shapeLibrary.panelOpen', false);
  }

  togglePanel() {
    const open = !this.stateStore.getState()?.shapeLibrary?.panelOpen;
    this.stateStore.set('shapeLibrary.panelOpen', open);
  }

  _showPanel() {
    if (!this._panel) return;
    this._panelOpen = true;
    this._panel.hidden = false;
    this._positionPanelDefault();
    if (!this._gridBuilt) {
      this._renderGrid();
      this._gridBuilt = true;
    }
  }

  _hidePanel() {
    if (!this._panel) return;
    this._panelOpen = false;
    this._panel.hidden = true;
  }

  _renderGrid() {
    if (!this._panelGrid) return;
    this._panelGrid.replaceChildren();

    for (const entry of SHAPE_LIBRARY) {
      const tile = document.createElement('div');
      tile.className = 'shape-library-tile';
      tile.draggable = true;
      tile.role = 'button';
      tile.tabIndex = 0;
      tile.dataset.shapeId = entry.id;
      tile.setAttribute('aria-label', 'Shape library item');
      tile.setAttribute('data-tooltip', 'Drag into the viewport or click to insert');

      const thumb = document.createElement('img');
      thumb.className = 'shape-library-tile__thumb';
      thumb.alt = '';
      thumb.draggable = false;
      tile.appendChild(thumb);

      tile.addEventListener('dragstart', (event) => this._onTileDragStart(event, entry.id));
      tile.addEventListener('dragend', () => {
        this._activeDragShapeId = null;
        this._setViewportDropActive(false);
        window.setTimeout(() => {
          this._tileDragged = false;
        }, 0);
      });
      tile.addEventListener('click', () => {
        if (this._tileDragged) return;
        void this.controller.insertShape(entry.id);
      });
      tile.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        void this.controller.insertShape(entry.id);
      });

      this._panelGrid.appendChild(tile);
      void renderShapeLibraryThumb(entry.glbUrl, 320)
        .then((url) => {
          thumb.src = url;
        })
        .catch(() => {
          tile.classList.add('shape-library-tile--pending');
        });
    }
  }

  /**
   * @param {DragEvent} event
   * @param {string} shapeId
   */
  _onTileDragStart(event, shapeId) {
    this._tileDragged = true;
    this._activeDragShapeId = shapeId;
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(SHAPE_LIBRARY_DRAG_MIME, shapeId);
    event.dataTransfer.setData('text/plain', shapeId);

    const tile = event.currentTarget;
    if (tile instanceof HTMLElement) {
      const ghost = tile.cloneNode(true);
      if (ghost instanceof HTMLElement) {
        ghost.classList.add('shape-library-drag-ghost');
        ghost.style.width = `${tile.offsetWidth}px`;
        ghost.style.height = `${tile.offsetHeight}px`;
        document.body.appendChild(ghost);
        event.dataTransfer.setDragImage(ghost, tile.offsetWidth / 2, tile.offsetHeight / 2);
        requestAnimationFrame(() => ghost.remove());
      }
    }
  }

  _bindViewportDrop() {
    const viewport = this._dropTarget;
    if (!viewport) return;

    viewport.addEventListener('dragenter', (event) => {
      if (!this._isShapeDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      this._setViewportDropActive(true);
    });
    viewport.addEventListener('dragover', (event) => {
      if (!this._isShapeDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      this._setViewportDropActive(true);
    });
    viewport.addEventListener('dragleave', (event) => {
      if (!this._isShapeDrag(event)) return;
      const next = event.relatedTarget;
      if (next instanceof Node && viewport.contains(next)) return;
      this._setViewportDropActive(false);
    });
    viewport.addEventListener(
      'drop',
      (event) => {
        const shapeId = this._readShapeDragId(event);
        this._activeDragShapeId = null;
        this._setViewportDropActive(false);
        if (!shapeId) return;
        event.preventDefault();
        event.stopPropagation();
        void this.controller.insertShape(shapeId);
      },
      true,
    );
  }

  /**
   * @param {DragEvent} event
   */
  _isShapeDrag(event) {
    if (this._activeDragShapeId) return true;
    const types = event.dataTransfer?.types;
    if (!types) return false;
    const list = Array.from(types);
    if (list.includes(SHAPE_LIBRARY_DRAG_MIME)) return true;
    if (list.includes('text/plain')) {
      const id = event.dataTransfer?.getData('text/plain')?.trim();
      return !!id && !!findShapeLibraryEntry(id);
    }
    return false;
  }

  /**
   * @param {DragEvent} event
   * @returns {string | null}
   */
  _readShapeDragId(event) {
    const fromMime = event.dataTransfer?.getData(SHAPE_LIBRARY_DRAG_MIME)?.trim();
    if (fromMime && findShapeLibraryEntry(fromMime)) return fromMime;

    const fromText = event.dataTransfer?.getData('text/plain')?.trim();
    if (fromText && findShapeLibraryEntry(fromText)) return fromText;

    const active = this._activeDragShapeId?.trim();
    if (active && findShapeLibraryEntry(active)) return active;

    return null;
  }

  /**
   * @param {boolean} active
   */
  _setViewportDropActive(active) {
    if (this._viewportDropActive === active) return;
    this._viewportDropActive = active;
    this._dropTarget?.classList.toggle('is-shape-drop-target', active);
    this._webgl?.classList.toggle('is-shape-drop-target', active);
  }

  _positionPanelDefault() {
    if (!this._panel) return;

    const shelf = document.getElementById('shelf');
    const insetRaw = shelf ? getComputedStyle(shelf).getPropertyValue('--shelf-inset').trim() : '';
    const inset = insetRaw || '48px';

    this._panel.style.top = inset;
    this._panel.style.left = inset;
  }

  /**
   * @param {PointerEvent} event
   */
  _startPanelDrag(event) {
    if (!this._panel) return;
    event.preventDefault();

    const panel = this._panel;
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
}

export { SHAPE_LIBRARY_PANEL_WIDTH_PX };
