import { deepClone } from '../utils/deepClone.js';

/** Max scene-settings undo steps held in memory. */
export const UNDO_STACK_LIMIT = 3;

/**
 * Camera orbit / viewport framing — excluded from undo so Cmd/Ctrl+Z restores scene
 * settings without jumping the view (DCC-style: navigation stays, edits revert).
 */
const CAMERA_NAV_KEYS = ['worldPosition', 'distance', 'viewPreset', 'position', 'target'];

/**
 * Keeps up to {@link UNDO_STACK_LIMIT} in-memory undo snapshots for scene settings.
 * Cmd/Ctrl+Z restores settings; live camera orbit pose is preserved.
 */
export class UndoStateController {
  /**
   * @param {import('../EventBus.js').EventBus} eventBus
   * @param {import('../StateStore.js').StateStore} stateStore
   * @param {{ showToast?: (message: string, duration?: number, options?: object) => void, syncControls?: (state: object) => void, restoreFontExtrudeSettings?: (fontExtrude: object) => Promise<void> | void }} uiHelper
   */
  constructor(eventBus, stateStore, uiHelper) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.uiHelper = uiHelper;
    /** @type {object[]} newest at end — each entry is state before one edit gesture */
    this._undoStack = [];
    this._restoring = false;
    this._batchApplyDepth = 0;
    this._boundPointerDown = this._onPointerDown.bind(this);
    this._boundKeyDown = this._onKeyDown.bind(this);
  }

  bind() {
    document.addEventListener('pointerdown', this._boundPointerDown, true);
    document.addEventListener('keydown', this._boundKeyDown, true);

    this.eventBus.on('undo:prepare', () => this.prepareUndo());
    this.eventBus.on('scene:batch-apply-start', () => {
      this._batchApplyDepth += 1;
    });
    this.eventBus.on('scene:batch-apply-end', () => {
      this._batchApplyDepth = Math.max(0, this._batchApplyDepth - 1);
    });
    this.eventBus.on('app:reset', () => this.clearUndo());
    this.eventBus.on('scene:settings-restored', () => this.clearUndo());
    this.eventBus.on('scene:model-load-complete', (payload) => {
      if (payload?.success) this.clearUndo();
    });
  }

  /** @returns {boolean} */
  canUndo() {
    return this._undoStack.length > 0;
  }

  clearUndo() {
    this._undoStack.length = 0;
  }

  /** Push current scene settings onto the undo stack (drops oldest when over limit). */
  prepareUndo() {
    if (this._restoring || this._batchApplyDepth > 0) return;
    this._undoStack.push(this._captureSnapshot());
    if (this._undoStack.length > UNDO_STACK_LIMIT) {
      this._undoStack.shift();
    }
  }

  async undo() {
    const snapshot = this._undoStack.pop();
    if (!snapshot) {
      this.uiHelper.showToast?.('Nothing to undo', 2200, { notification: false });
      return false;
    }
    this._restoring = true;

    try {
      this.eventBus.emit('scene:batch-apply-start');
      const liveNav = this._readLiveCameraNav();
      const restoreState = this._mergeLiveCameraNav(snapshot, liveNav);
      this.stateStore.replaceState(restoreState);
      await window.orby?.scene?.applyStateSnapshot?.(restoreState);
      this.uiHelper.syncControls?.(restoreState);
      await this.uiHelper.restoreFontExtrudeSettings?.(restoreState.fontExtrude);
      this.uiHelper.showToast?.('Undid last change', 2200, { notification: false });
      return true;
    } finally {
      this._restoring = false;
      this.eventBus.emit('scene:batch-apply-end');
    }
  }

  _captureSnapshot() {
    return deepClone(this.stateStore.getState());
  }

  /** Live viewport orbit pose + persisted nav fields — kept across undo. */
  _readLiveCameraNav() {
    const nav = {};
    const cam = this.stateStore.peekState()?.camera;
    if (cam?.worldPosition) {
      nav.worldPosition = { ...cam.worldPosition };
    }
    if (cam?.distance != null) {
      nav.distance = cam.distance;
    }
    if ('viewPreset' in (cam ?? {})) {
      nav.viewPreset = cam.viewPreset;
    }

    const scene = window.orby?.scene;
    if (scene?.camera && scene?.controls) {
      nav.position = {
        x: scene.camera.position.x,
        y: scene.camera.position.y,
        z: scene.camera.position.z,
      };
      nav.target = {
        x: scene.controls.target.x,
        y: scene.controls.target.y,
        z: scene.controls.target.z,
      };
    }
    return nav;
  }

  /** Overlay current viewport navigation onto a settings snapshot before restore. */
  _mergeLiveCameraNav(snapshot, nav) {
    const next = deepClone(snapshot);
    next.camera = { ...(next.camera ?? {}) };
    for (const key of CAMERA_NAV_KEYS) {
      if (nav[key] !== undefined) {
        next.camera[key] = deepClone(nav[key]);
      } else {
        delete next.camera[key];
      }
    }
    return next;
  }

  /** @param {PointerEvent} event */
  _onPointerDown(event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!this._isUndoableTarget(target)) return;
    this.prepareUndo();
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!this._isUndoableTarget(target)) return;
    if (event.key !== ' ' && event.key !== 'Enter') return;
    this.prepareUndo();
  }

  /** @param {Element} el */
  _isUndoableTarget(el) {
    if (this._restoring || this._batchApplyDepth > 0) return false;
    if (this._isTextEntry(el)) return false;
    if (this._isExcludedControl(el)) return false;
    if (el.closest('summary')) return false;
    const toggleInput = el.closest('.effect-toggle input[type="checkbox"], .effect-toggle input[type="radio"]');
    if (toggleInput instanceof HTMLInputElement) {
      const row = toggleInput.closest('.slider-line');
      if (row?.matches(':has(+ .effect-foldout)')) return false;
    }
    if (el.closest('#shelf, .panels, .panel-block, .orby-color-picker, .tone-curve-canvas-wrap')) {
      return true;
    }
    return false;
  }

  /** @param {Element} el */
  _isTextEntry(el) {
    if (el.isContentEditable) return true;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
      const type = el.type;
      return type !== 'range'
        && type !== 'color'
        && type !== 'checkbox'
        && type !== 'radio';
    }
    return false;
  }

  /** @param {Element} el */
  _isExcludedControl(el) {
    if (el.closest('[data-tab], .tabs, .tab-bar')) return true;
    if (el.closest('.copy-scene-settings, .load-scene-settings, .save-orby-scene, .load-orby-scene, .reset-scene')) {
      return true;
    }
    if (el.closest('.load-settings-modal, .bug-report-overlay, .dev-tools-modal, #start-menu, .start-menu')) return true;
    return false;
  }
}
