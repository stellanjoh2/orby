/**
 * Viewport right-click context menus (object hit vs empty void).
 * Click-without-drag opens the menu; drag keeps OrbitControls pan.
 */
import * as THREE from 'three';
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

const DRAG_THRESHOLD_PX = 6;
const OPEN_DURATION = 0.18;
const CLOSE_DURATION = 0.12;
/** Temporary: void right-click menu stays implemented, but does not open while the UX is reworked. */
const VOID_CONTEXT_MENU_ENABLED = false;

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export class ViewportContextMenu {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager;

    this.root = null;
    this.list = null;
    this.open = false;
    this._press = null;
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPointerDownOutside = this._onPointerDownOutside.bind(this);
    this._onWindowBlur = this._onWindowBlur.bind(this);
    this._onResize = this._onResize.bind(this);
  }

  bind() {
    if (this.root) return;

    this._viewport =
      this.ui?.dom?.canvas?.closest?.('.viewport') ??
      document.querySelector('.viewport');
    if (!this._viewport) return;

    this.root = document.createElement('div');
    this.root.className = 'orby-context-menu';
    this.root.setAttribute('role', 'menu');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.hidden = true;

    this.list = document.createElement('ul');
    this.list.className = 'orby-context-menu__list';
    this.root.appendChild(this.list);
    document.body.appendChild(this.root);

    // Bind on stable .viewport — #webgl can be replaced on GPU refresh.
    this._viewport.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    this._viewport.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('pointerdown', this._onPointerDownOutside, true);
    window.addEventListener('blur', this._onWindowBlur);
    window.addEventListener('resize', this._onResize);
  }

  destroy() {
    this._viewport?.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this._viewport?.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('pointerdown', this._onPointerDownOutside, true);
    window.removeEventListener('blur', this._onWindowBlur);
    window.removeEventListener('resize', this._onResize);
    gsap.killTweensOf(this.root);
    this.root?.remove();
    this.root = null;
    this.list = null;
    this._viewport = null;
    this.open = false;
  }

  close({ animate = true } = {}) {
    if (!this.root || !this.open) {
      if (this.root) {
        this.root.hidden = true;
        this.root.setAttribute('aria-hidden', 'true');
      }
      this.open = false;
      return;
    }

    this.open = false;
    this.root.setAttribute('aria-hidden', 'true');

    if (!animate || prefersReducedMotion()) {
      gsap.killTweensOf(this.root);
      this.root.hidden = true;
      gsap.set(this.root, { clearProps: 'opacity,transform' });
      return;
    }

    gsap.killTweensOf(this.root);
    gsap.to(this.root, {
      opacity: 0,
      y: -4,
      scale: 0.98,
      duration: CLOSE_DURATION,
      ease: 'power2.in',
      onComplete: () => {
        if (!this.root || this.open) return;
        this.root.hidden = true;
        gsap.set(this.root, { clearProps: 'opacity,transform' });
      },
    });
  }

  _canvas() {
    // Always resolve live #webgl (may be swapped on GPU teardown / refresh).
    const live = document.querySelector('#webgl');
    if (live && this.ui?.dom) this.ui.dom.canvas = live;
    return live;
  }

  _isCanvasEvent(event) {
    const canvas = this._canvas();
    return !!canvas && (event.target === canvas || canvas.contains(event.target));
  }

  _onPointerDown(event) {
    if (event.button !== 2) return;
    if (!this._isCanvasEvent(event)) return;

    if (event.altKey || event.shiftKey) {
      this._press = null;
      return;
    }

    this._press = {
      x: event.clientX,
      y: event.clientY,
      dragged: false,
    };
  }

  _onPointerMove(event) {
    if (!this._press || this._press.dragged) return;
    const dx = event.clientX - this._press.x;
    const dy = event.clientY - this._press.y;
    if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      this._press.dragged = true;
    }
  }

  _onPointerUp() {
    // contextmenu usually follows; clear stale press if it never fired
    queueMicrotask(() => {
      if (this._press?.dragged) this._press = null;
    });
  }

  _onContextMenu(event) {
    if (!this._isCanvasEvent(event)) return;
    event.preventDefault();

    const press = this._press;
    this._press = null;

    if (event.altKey || event.shiftKey) return;
    if (!press || press.dragged) return;

    // Object menu only when a mesh is selected (transform widgets on) — not while
    // casually right-clicking / panning with nothing picked.
    if (!this._hasObjectSelection()) return;

    const hitObject = this._hitsCurrentModel(press.x, press.y);
    if (!hitObject && !VOID_CONTEXT_MENU_ENABLED) return;
    const items = hitObject ? this._objectItems() : this._voidItems();
    if (!items.length) return;

    this._show(press.x, press.y, items);
  }

  /** True when the user has picked a mesh (move / rotate / scale widget active). */
  _hasObjectSelection() {
    const state = this.stateStore?.getState?.() ?? {};
    return !!(
      state.moveWidgetEnabled ||
      state.rotateWidgetEnabled ||
      state.scaleWidgetEnabled
    );
  }

  _onPointerDownOutside(event) {
    if (!this.open || !this.root) return;
    if (this.root.contains(event.target)) return;
    this.close();
  }

  _onKeyDown(event) {
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.close();
    }
  }

  _onWindowBlur() {
    this.close({ animate: false });
  }

  _onResize() {
    this.close({ animate: false });
  }

  _hitsCurrentModel(clientX, clientY) {
    const scene = window.orby?.scene;
    const camera = scene?.camera;
    const canvas = this._canvas();
    if (!camera || !canvas) return false;

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, camera);

    const roots = scene.sceneObjects?.getPickRoots?.() ?? [];
    const targets = roots.length
      ? roots
      : (scene.currentModel ? [scene.currentModel] : []);
    if (!targets.length) return false;

    const hits = this._raycaster.intersectObjects(targets, true);
    if (!hits.length) return false;

    const assetId = scene.sceneObjects?.findAssetIdFromObject?.(hits[0].object);
    if (assetId != null && assetId !== scene.sceneObjects.activeId) {
      scene.selectSceneAsset?.(assetId);
    }
    return true;
  }

  _objectItems() {
    const state = this.stateStore.getState();
    const hidden = !!state.objectHidden;
    const rotating = (state.autoRotate ?? 0) > 0;
    return [
      { id: 'focus', label: 'Focus', action: () => this._focusObject() },
      { id: 'reset-orientation', label: 'Reset orientation', action: () => this._resetOrientation() },
      { id: 'reset-transform', label: 'Reset transform', action: () => this._resetTransform() },
      { id: 'duplicate-object', label: 'Duplicate Object', action: () => this._duplicateObject() },
      {
        id: 'hide-object',
        label: hidden ? 'Show object' : 'Hide object',
        action: () => this._toggleObjectHidden(),
      },
      { id: 'recenter-pivot', label: 'Recenter pivot', action: () => this._recenterPivot() },
      {
        id: 'auto-rotate',
        label: rotating ? 'Stop auto-rotate' : 'Auto-rotate',
        checked: rotating,
        action: () => this._toggleAutoRotate(),
      },
      {
        id: 'quick-export-png-1x',
        label: 'Quick export 1×',
        action: () => this._quickExportPng(1),
      },
      {
        id: 'quick-export-png-2x',
        label: 'Quick export 2×',
        action: () => this._quickExportPng(2),
      },
      { id: 'import-object', label: 'Import new object', action: () => this._importNewObject() },
      { id: 'delete-sep', separator: true },
      { id: 'delete-object', label: 'Delete Object', action: () => this._deleteObject() },
    ];
  }

  _voidItems() {
    const state = this.stateStore.getState();
    const hdriOn = !!state.hdriEnabled;
    const backdropOn = !!state.hdriBackground;
    const lightsOn = state.lightsEnabled !== false;
    const gridOn = !!state.groundWire;
    const podiumOn = !!state.groundSolid;

    return [
      { id: 'reset-camera', label: 'Reset camera', action: () => this._resetCamera() },
      {
        id: 'toggle-hdri',
        label: hdriOn ? 'Turn off HDRI' : 'Turn on HDRI',
        checked: hdriOn,
        action: () => this._toggleHdri(),
      },
      {
        id: 'toggle-backdrop',
        label: backdropOn ? 'Hide render backdrop' : 'Show render backdrop',
        checked: backdropOn,
        action: () => this._toggleBackdrop(),
      },
      {
        id: 'toggle-lights',
        label: lightsOn ? 'Turn off 3-point lights' : 'Turn on 3-point lights',
        checked: lightsOn,
        action: () => this._toggleLights(),
      },
      {
        id: 'toggle-grid',
        label: gridOn ? 'Hide ground grid' : 'Show ground grid',
        checked: gridOn,
        action: () => this._toggleGroundGrid(),
      },
      {
        id: 'toggle-podium',
        label: podiumOn ? 'Hide podium' : 'Show podium',
        checked: podiumOn,
        action: () => this._togglePodium(),
      },
      { id: 'import-object', label: 'Import new object', action: () => this._importNewObject() },
    ];
  }

  _show(clientX, clientY, items) {
    if (!this.root || !this.list) return;

    this.list.replaceChildren();
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('li');
        sep.className = 'orby-context-menu__sep';
        sep.setAttribute('role', 'separator');
        this.list.appendChild(sep);
        continue;
      }

      const li = document.createElement('li');
      li.className = 'orby-context-menu__item';
      li.setAttribute('role', 'none');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'orby-context-menu__btn';
      btn.setAttribute('role', 'menuitem');
      if (item.checked != null) {
        btn.setAttribute('aria-checked', item.checked ? 'true' : 'false');
        btn.classList.toggle('is-checked', !!item.checked);
      }

      const label = document.createElement('span');
      label.className = 'orby-context-menu__label';
      label.textContent = item.label;
      btn.appendChild(label);

      if (item.checked != null) {
        const mark = document.createElement('span');
        mark.className = 'orby-context-menu__check';
        mark.setAttribute('aria-hidden', 'true');
        btn.appendChild(mark);
      }

      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.ui.uiSounds?.playSelect?.();
        this.close();
        try {
          item.action?.();
        } catch (err) {
          console.warn('[ViewportContextMenu]', item.id, err);
        }
      });

      li.appendChild(btn);
      this.list.appendChild(li);
    }

    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.open = true;

    // Measure after paint so clamp uses real size
    this.root.style.left = '0px';
    this.root.style.top = '0px';
    const rect = this.root.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(
      Math.max(pad, clientX),
      window.innerWidth - rect.width - pad,
    );
    const top = Math.min(
      Math.max(pad, clientY),
      window.innerHeight - rect.height - pad,
    );
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;

    gsap.killTweensOf(this.root);
    if (prefersReducedMotion()) {
      gsap.set(this.root, { opacity: 1, x: 0, y: 0, scale: 1 });
      return;
    }

    gsap.fromTo(
      this.root,
      { opacity: 0, y: 6, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: OPEN_DURATION,
        ease: 'power2.out',
        overwrite: 'auto',
      },
    );
  }

  _focusObject() {
    this.eventBus.emit('camera:focus');
  }

  _resetOrientation() {
    const state = this.stateStore.getState();
    this.stateStore.batch(() => {
      this.stateStore.set('rotationX', 0);
      this.stateStore.set('rotationY', 0);
      this.stateStore.set('rotationZ', 0);
    });
    this.eventBus.emit('mesh:rotationX', 0);
    this.eventBus.emit('mesh:rotationY', 0);
    this.eventBus.emit('mesh:rotationZ', 0);
    this.ui.meshControls?.syncTransformSliders?.({
      scale: state.scale,
      scaleY: state.scaleY ?? state.scale ?? 1,
      scaleZ: state.scaleZ ?? state.scale ?? 1,
      xOffset: state.xOffset ?? 0,
      yOffset: state.yOffset ?? 0,
      zOffset: state.zOffset ?? 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    });
  }

  _resetTransform() {
    this.stateStore.batch(() => {
      this.stateStore.set('scale', 1);
      this.stateStore.set('scaleY', 1);
      this.stateStore.set('scaleZ', 1);
      this.stateStore.set('xOffset', 0);
      this.stateStore.set('yOffset', 0);
      this.stateStore.set('zOffset', 0);
      this.stateStore.set('rotationX', 0);
      this.stateStore.set('rotationY', 0);
      this.stateStore.set('rotationZ', 0);
    });
    this.eventBus.emit('mesh:scale', 1);
    this.eventBus.emit('mesh:scale-y', 1);
    this.eventBus.emit('mesh:scale-z', 1);
    this.eventBus.emit('mesh:xOffset', 0);
    this.eventBus.emit('mesh:yOffset', 0);
    this.eventBus.emit('mesh:zOffset', 0);
    this.eventBus.emit('mesh:rotationX', 0);
    this.eventBus.emit('mesh:rotationY', 0);
    this.eventBus.emit('mesh:rotationZ', 0);
    this.ui.meshControls?.syncTransformSliders?.({
      scale: 1,
      scaleY: 1,
      scaleZ: 1,
      xOffset: 0,
      yOffset: 0,
      zOffset: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
    });
  }

  _toggleObjectHidden() {
    const next = !this.stateStore.getState().objectHidden;
    this.stateStore.set('objectHidden', next);
    this.eventBus.emit('mesh:object-hidden', next);
    this.ui.meshControls?.syncHideObjectButton?.({ hidden: next });
  }

  _recenterPivot() {
    this.eventBus.emit('mesh:recenter-pivot');
  }

  _resetCamera() {
    this.eventBus.emit('camera:reset');
  }

  _toggleHdri() {
    const next = !this.stateStore.getState().hdriEnabled;
    this.stateStore.set('hdriEnabled', next);
    this.eventBus.emit('studio:hdri-enabled', next);
    if (this.ui.inputs?.hdriEnabled) this.ui.inputs.hdriEnabled.checked = next;
    this.ui.toggleHdriControls?.(next);
  }

  _toggleBackdrop() {
    const next = !this.stateStore.getState().hdriBackground;
    this.stateStore.set('hdriBackground', next);
    this.eventBus.emit('studio:hdri-background', next);
    this.ui.syncHdriBackgroundCheckboxes?.(next);
    this.ui.updateHdriBackgroundFallbackVisibility?.();
    this.ui.updateHdriReceiveShadowsAoDisabled?.();
  }

  _toggleLights() {
    const input = this.ui.inputs?.lightsEnabled;
    if (input) {
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const next = this.stateStore.getState().lightsEnabled === false;
    this.stateStore.set('lightsEnabled', next);
    this.eventBus.emit('lights:enabled', next);
  }

  _toggleGroundGrid() {
    const next = !this.stateStore.getState().groundWire;
    this.stateStore.set('groundWire', next);
    this.eventBus.emit('studio:ground-wire', next);
    if (this.ui.inputs?.groundWire) this.ui.inputs.groundWire.checked = next;
  }

  _togglePodium() {
    const next = !this.stateStore.getState().groundSolid;
    if (next) this.ui.uiSounds?.playShelfShow?.();
    else this.ui.uiSounds?.playShelfHide?.();
    this.stateStore.set('groundSolid', next);
    this.eventBus.emit('studio:ground-solid', next);
    if (this.ui.inputs?.groundSolid) this.ui.inputs.groundSolid.checked = next;
  }

  _duplicateObject() {
    window.orby?.scene?.sceneObjects?.duplicateActive?.();
  }

  _deleteObject() {
    window.orby?.scene?.sceneObjects?.deleteActive?.();
  }

  _importNewObject() {
    const input =
      this.ui.buttons?.fileInput ??
      this.ui.startMenuController?.fileInput ??
      document.querySelector('#fileInput');
    input?.click();
  }

  _toggleAutoRotate() {
    const current = this.stateStore.getState().autoRotate ?? 0;
    const next = current > 0 ? 0 : 0.2;
    this.stateStore.set('autoRotate', next);
    this.eventBus.emit('mesh:auto-rotate', next);
    this.ui.inputs?.autoRotate?.forEach?.((input) => {
      input.checked = parseFloat(input.value) === next;
    });
  }

  /** Transparent PNG, crop-to-asset — ignores Export panel toggles. @param {1|2} size */
  _quickExportPng(size = 1) {
    const scale = size === 2 ? 2 : 1;
    this.eventBus.emit('export:png', {
      transparent: true,
      transparentFraming: 'crop',
      size: scale,
    });
  }
}
