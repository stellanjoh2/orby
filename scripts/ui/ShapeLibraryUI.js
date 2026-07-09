/**
 * Object → Shape Library — shelf toggle + left floating panel + viewport drag-and-drop.
 */
import gsap from 'gsap';
import {
  SHAPE_LIBRARY,
  SHAPE_LIBRARY_DRAG_MIME,
  SHAPE_LIBRARY_PANEL_WIDTH_PX,
  findBakeableShapeLibraryEntry,
  shapeLibraryThumbUrl,
} from '../shapeLibrary/shapeLibraryCatalog.js';
import {
  bindFloatingPanelHeaderDrag,
  setFloatingPanelDragging,
} from './floatingPanelHeaderDrag.js';
import {
  animateModalClose,
  animateModalOpen,
  prefersReducedMotion,
} from './modalReveal.js';

const TILE_REVEAL_DURATION = 0.36;
const TILE_REVEAL_STAGGER = 0.042;
const TILE_REVEAL_DELAY = 0.08;

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
    /** Skip reveal on first state sync (scene load / mount). */
    this._allowPanelReveal = false;
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
    this._panelChrome = this._panel?.querySelector('.shape-library-panel__chrome') ?? null;
    this._panelGrid = document.getElementById('shapeLibraryGrid');
    this._panelClose = document.getElementById('shapeLibraryPanelClose');
    this._panelHeader = this._panel?.querySelector('.shape-library-panel__header') ?? null;
    this._dropTarget = document.querySelector('.viewport');
    this._webgl = document.getElementById('webgl');

    this.syncFromState(this.stateStore.getState());
    this._allowPanelReveal = true;
    this._stateUnsub = this.stateStore.subscribe((state) => this.syncFromState(state));

    this._panelOpenToggle?.addEventListener('change', (event) => {
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

  _showPanel({ animate = this._allowPanelReveal } = {}) {
    if (!this._panel || !this._panelChrome) return;
    if (
      this._panelOpen &&
      !this._panel.hidden &&
      this._panel.style.display !== 'none' &&
      !gsap.isTweening(this._panelChrome)
    ) {
      return;
    }

    this._panelOpen = true;
    this._positionPanelDefault();
    if (!this._gridBuilt) {
      this._renderGrid();
      this._gridBuilt = true;
      this._resetGridTiles();
    }

    this._panel.removeAttribute('hidden');
    this._panel.style.display = '';

    if (animate) this.ui.uiSounds?.playShelfShow();

    if (!animate || prefersReducedMotion()) {
      this._snapPanelVisible();
      return;
    }

    this._revealGridTiles({ animate: true });
    void animateModalOpen(this._panel, this._panelChrome, { revealBackdrop: false }).then(() => {
      this._panel.style.display = '';
    });
  }

  _hidePanel({ animate = this._allowPanelReveal } = {}) {
    if (!this._panel || !this._panelChrome) return;
    const isVisible = !this._panel.hidden && this._panel.style.display !== 'none';
    if (!isVisible) {
      this._panelOpen = false;
      return;
    }

    if (animate) this.ui.uiSounds?.playShelfHide();

    this._resetGridTiles();

    if (!animate || prefersReducedMotion()) {
      this._snapPanelHidden();
      return;
    }

    animateModalClose(
      this._panel,
      this._panelChrome,
      () => {
        this._panelOpen = false;
        this._panel.setAttribute('hidden', '');
        this._panel.style.display = '';
      },
      false,
      { revealBackdrop: false },
    );
  }

  _snapPanelVisible() {
    if (!this._panel || !this._panelChrome) return;
    gsap.killTweensOf([this._panel, this._panelChrome]);
    gsap.set(this._panelChrome, { clearProps: 'clipPath,transform,--popup-chrome-shadow-alpha' });
    gsap.set(this._panel, { clearProps: 'clipPath,transform,--modal-backdrop-blur' });
    this._revealGridTiles({ animate: false });
  }

  _snapPanelHidden() {
    if (!this._panel || !this._panelChrome) return;
    gsap.killTweensOf([this._panel, this._panelChrome]);
    this._panelOpen = false;
    this._panel.setAttribute('hidden', '');
    this._panel.style.display = '';
    gsap.set(this._panelChrome, { clearProps: 'clipPath,transform,--popup-chrome-shadow-alpha' });
    gsap.set(this._panel, { clearProps: 'clipPath,transform,--modal-backdrop-blur' });
    this._resetGridTiles();
  }

  _getGridTiles() {
    return this._panelGrid ? [...this._panelGrid.querySelectorAll('.shape-library-tile')] : [];
  }

  _partitionGridTiles() {
    const tiles = this._getGridTiles();
    const live = [];
    const empty = [];
    for (const tile of tiles) {
      if (tile.classList.contains('shape-library-tile--empty')) empty.push(tile);
      else live.push(tile);
    }
    return { live, empty };
  }

  /**
   * @param {{ animate?: boolean }} [options]
   */
  _revealGridTiles({ animate = true } = {}) {
    const { live, empty } = this._partitionGridTiles();
    const targets = [...live, ...empty];
    if (!targets.length) return;

    gsap.killTweensOf(targets);

    // Coming-soon slots stay at CSS opacity — GSAP opacity causes flicker against the 0.35 rule.
    empty.forEach((tile) => gsap.set(tile, { clearProps: 'opacity' }));

    if (!live.length) return;

    if (!animate || prefersReducedMotion()) {
      gsap.set(live, { opacity: 1 });
      return;
    }

    gsap.set(live, { opacity: 0 });
    gsap.to(live, {
      opacity: 1,
      duration: TILE_REVEAL_DURATION,
      stagger: TILE_REVEAL_STAGGER,
      delay: TILE_REVEAL_DELAY,
      ease: 'power2.out',
    });
  }

  _resetGridTiles() {
    const { live, empty } = this._partitionGridTiles();
    const targets = [...live, ...empty];
    if (!targets.length) return;
    gsap.killTweensOf(targets);
    if (live.length) gsap.set(live, { opacity: 0 });
    empty.forEach((tile) => gsap.set(tile, { clearProps: 'opacity' }));
  }

  _renderGrid() {
    if (!this._panelGrid) return;
    this._panelGrid.replaceChildren();

    for (const entry of SHAPE_LIBRARY) {
      const tile = document.createElement('div');
      tile.className = 'shape-library-tile';
      tile.role = entry.empty ? 'presentation' : 'button';
      tile.tabIndex = entry.empty ? -1 : 0;
      tile.dataset.shapeId = entry.id;

      if (entry.empty) {
        tile.classList.add('shape-library-tile--empty');
        tile.setAttribute('aria-hidden', 'true');
        tile.appendChild(this._createComingSoonLabel());
        tile.addEventListener('pointerdown', (event) => event.preventDefault());
        this._panelGrid.appendChild(tile);
        continue;
      }

      tile.draggable = true;
      tile.setAttribute('aria-label', entry.label || 'Shape library item');
      tile.setAttribute(
        'data-tooltip',
        `${entry.label} — drag into the viewport or click to insert`,
      );

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
      this._loadTileThumb(tile, thumb, entry);
    }
  }

  _createComingSoonLabel() {
    const label = document.createElement('span');
    label.className = 'shape-library-tile__soon';
    label.textContent = 'Coming soon';
    return label;
  }

  /**
   * @param {HTMLElement} tile
   * @param {HTMLImageElement} thumb
   * @param {import('../shapeLibrary/shapeLibraryCatalog.js').ShapeLibraryEntry} entry
   */
  _loadTileThumb(tile, thumb, entry) {
    thumb.src = shapeLibraryThumbUrl(entry.id);
    thumb.addEventListener(
      'error',
      () => {
        tile.classList.add('shape-library-tile--pending');
      },
      { once: true },
    );
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
      return !!id && !!findBakeableShapeLibraryEntry(id);
    }
    return false;
  }

  /**
   * @param {DragEvent} event
   * @returns {string | null}
   */
  _readShapeDragId(event) {
    const fromMime = event.dataTransfer?.getData(SHAPE_LIBRARY_DRAG_MIME)?.trim();
    if (fromMime && findBakeableShapeLibraryEntry(fromMime)) return fromMime;

    const fromText = event.dataTransfer?.getData('text/plain')?.trim();
    if (fromText && findBakeableShapeLibraryEntry(fromText)) return fromText;

    const active = this._activeDragShapeId?.trim();
    if (active && findBakeableShapeLibraryEntry(active)) return active;

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
