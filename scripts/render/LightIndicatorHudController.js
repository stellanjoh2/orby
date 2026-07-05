import * as THREE from 'three';

const LIGHT_IDS = ['key', 'fill', 'rim'];
const INTENSITY_MIN = 0;
const INTENSITY_MAX = 5;
const INTENSITY_STEP = 0.01;
/** Viewport inset — matches clamp + stack (margin + hit slop). */
const HUD_VIEWPORT_PAD = 20;
const HUD_STACK_GAP = 6;

/**
 * Screen-space spotlight HUD — shadow, color, power, and intensity controls.
 */
export class LightIndicatorHudController {
  /**
   * @param {{
   *   viewport: HTMLElement,
   *   getCamera: () => import('three').Camera,
   *   getLayouts: () => Record<string, {
   *     visible?: boolean,
   *     active?: boolean,
   *     lightOn?: boolean,
   *     color?: string,
   *     world: import('three').Vector3,
   *   }> | null,
   *   getActive: () => boolean,
   *   getIntensity: (lightId: string) => number,
   *   onToggleShadow: (lightId: string) => void,
   *   onToggleLight: (lightId: string) => void,
   *   onOpenColor: (lightId: string, clientX: number, clientY: number, clickTarget?: HTMLElement) => void,
   *   onSetIntensity: (lightId: string, value: number) => void,
   * }} deps
   */
  constructor({
    viewport,
    getCamera,
    getLayouts,
    getActive,
    getIntensity,
    onToggleShadow,
    onToggleLight,
    onOpenColor,
    onSetIntensity,
  }) {
    this.viewport = viewport;
    this.getCamera = getCamera;
    this.getLayouts = getLayouts;
    this.getActive = getActive;
    this.getIntensity = getIntensity;
    this.onToggleShadow = onToggleShadow;
    this.onToggleLight = onToggleLight;
    this.onOpenColor = onOpenColor;
    this.onSetIntensity = onSetIntensity;

    this._world = new THREE.Vector3();
    this._ndc = new THREE.Vector3();
    /** @type {Map<string, HTMLElement>} */
    this._huds = new Map();
    /** Keep HUD screen position stable while the pointer is over controls. */
    this._positionFrozen = false;
    this._positionFrozenByPointer = false;
    /** @type {Map<string, { x: number, y: number }>} */
    this._frozenPositions = new Map();
    /** @type {((event: PointerEvent) => void) | null} */
    this._unlockPositionForPointer = null;

    this._root = document.createElement('div');
    this._root.className = 'light-indicator-hud-layer';
    this._root.setAttribute('aria-hidden', 'true');
    this._root.hidden = true;
    viewport?.appendChild(this._root);
    this._bindPositionFreezeHandlers();

    for (const lightId of LIGHT_IDS) {
      const hud = document.createElement('div');
      hud.className = 'light-indicator-hud';
      hud.dataset.lightId = lightId;
      hud.hidden = true;

      const cluster = document.createElement('div');
      cluster.className = 'light-indicator-hud__cluster';

      const actions = document.createElement('div');
      actions.className = 'light-indicator-hud__actions';

      const shadowBtn = this._createButton({
        lightId,
        kind: 'shadow',
        icon: 'fa-circle-half-stroke',
        label: `Toggle ${lightId} light cast shadows`,
      });
      this._bindHudTap(shadowBtn, () => this.onToggleShadow?.(lightId));
      const colorBtn = this._createButton({
        lightId,
        kind: 'color',
        label: `Pick ${lightId} light color`,
      });
      this._bindHudTap(colorBtn, (event) => {
        this.onOpenColor?.(lightId, event.clientX, event.clientY, colorBtn);
      });
      const bulbBtn = this._createButton({
        lightId,
        kind: 'bulb',
        icon: 'fa-lightbulb',
        label: `Toggle ${lightId} light`,
      });
      this._bindHudTap(bulbBtn, () => this.onToggleLight?.(lightId));

      actions.append(colorBtn, bulbBtn, shadowBtn);

      const intensityPanel = document.createElement('div');
      intensityPanel.className = 'light-indicator-hud__intensity';

      const intensityInput = document.createElement('input');
      intensityInput.type = 'range';
      intensityInput.className = 'light-indicator-hud__intensity-range';
      intensityInput.min = String(INTENSITY_MIN);
      intensityInput.max = String(INTENSITY_MAX);
      intensityInput.step = String(INTENSITY_STEP);
      intensityInput.setAttribute('aria-label', `${lightId} light intensity`);
      intensityInput.addEventListener('input', () => {
        const raw = parseFloat(intensityInput.value);
        if (!Number.isFinite(raw)) return;
        this._updateIntensitySliderFill(intensityInput);
        intensityPanel.dataset.tooltip = `${lightId} intensity — ${raw.toFixed(2)}`;
        this.onSetIntensity?.(lightId, raw);
      });
      intensityInput.addEventListener('pointerdown', (event) => event.stopPropagation());
      this._updateIntensitySliderFill(intensityInput);

      intensityPanel.append(intensityInput);
      cluster.append(actions, intensityPanel);
      hud.append(cluster);
      this._root.appendChild(hud);
      this._huds.set(lightId, hud);
    }
  }

  _createButton({ lightId, kind, icon, label }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `light-indicator-hud__btn light-indicator-hud__btn--${kind}`;
    btn.dataset.lightId = lightId;
    if (icon) {
      btn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
    }
    btn.setAttribute('aria-label', label);
    return btn;
  }

  _bindPositionFreezeHandlers() {
    const interactiveSelector = '.light-indicator-hud__btn, .light-indicator-hud__intensity';

    this._root.addEventListener('pointerover', (event) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(interactiveSelector)) return;
      this._positionFrozen = true;
    });
    this._root.addEventListener('pointerout', (event) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(interactiveSelector)) return;
      if (this._positionFrozenByPointer) return;
      const related = event.relatedTarget;
      if (related instanceof Element && related.closest(interactiveSelector)) return;
      this._positionFrozen = false;
    });

    const lockForPointer = (event) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest(interactiveSelector)) return;
      this._positionFrozen = true;
      this._positionFrozenByPointer = true;
    };
    const unlockForPointer = (event) => {
      this._positionFrozenByPointer = false;
      const target = event?.target;
      if (target instanceof Element && target.closest(interactiveSelector)) {
        this._positionFrozen = true;
        return;
      }
      this._positionFrozen = false;
    };
    this._unlockPositionForPointer = unlockForPointer;

    this._root.addEventListener('pointerdown', lockForPointer, true);
    document.addEventListener('pointerup', unlockForPointer, true);
    document.addEventListener('pointercancel', unlockForPointer, true);
  }

  _bindHudTap(btn, onTap) {
    btn.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
    });
    btn.addEventListener('pointerup', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      onTap(event);
    });
  }

  /** @param {HTMLInputElement} slider */
  _updateIntensitySliderFill(slider) {
    if (!slider || slider.type !== 'range') return;
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    const range = max - min;
    const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
    slider.style.setProperty('--slider-fill-start', '0%');
    slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
  }

  _placeHud(hud, x, y, flipY, edgePinned = false) {
    hud.classList.toggle('light-indicator-hud--flip-y', !!flipY);
    hud.classList.toggle('light-indicator-hud--edge-pinned', !!edgePinned);
    hud.style.left = `${x}px`;
    hud.style.top = `${y}px`;
  }

  /**
   * @returns {{ x: number, y: number, flipY: boolean }}
   */
  _fitHudInViewport(hud, x, y, flipY, viewportRect, edgePinned = false) {
    const pad = HUD_VIEWPORT_PAD;
    this._placeHud(hud, x, y, flipY, edgePinned);

    let rect = hud.getBoundingClientRect();
    if (rect.top < viewportRect.top + pad && !flipY) {
      flipY = true;
      this._placeHud(hud, x, y, flipY, edgePinned);
    }

    for (let pass = 0; pass < 6; pass += 1) {
      rect = hud.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (rect.left < viewportRect.left + pad) {
        dx = (viewportRect.left + pad) - rect.left;
      } else if (rect.right > viewportRect.right - pad) {
        dx = (viewportRect.right - pad) - rect.right;
      }
      if (rect.top < viewportRect.top + pad) {
        dy = (viewportRect.top + pad) - rect.top;
      } else if (rect.bottom > viewportRect.bottom - pad) {
        dy = (viewportRect.bottom - pad) - rect.bottom;
      }
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
      x += dx;
      y += dy;
      this._placeHud(hud, x, y, flipY, edgePinned);
    }

    return { x, y, flipY };
  }

  /**
   * @returns {string | null}
   */
  _cornerKeyForSnap(x, y, viewportRect, pinned, pinnedEdges = null) {
    if (!pinned) return null;
    const vert = pinnedEdges?.offTop
      ? 't'
      : pinnedEdges?.offBottom
        ? 'b'
        : (y < viewportRect.height * 0.5 ? 't' : 'b');
    const horiz = pinnedEdges?.offLeft
      ? 'l'
      : pinnedEdges?.offRight
        ? 'r'
        : (x < viewportRect.width * 0.5 ? 'l' : 'r');
    return `${vert}${horiz}`;
  }

  /**
   * Bucket edge-pinned HUDs by viewport corner and stack vertically so they stay visible.
   * @param {DOMRect} viewportRect
   * @param {Array<{ lightId: string, hud: HTMLElement, snap: { x: number, y: number, pinned: boolean, flipY: boolean, cornerKey?: string | null }, frozen?: boolean }>} entries
   */
  _layoutPinnedStacks(viewportRect, entries) {
    const pinned = entries.filter((entry) => entry.snap?.pinned && !entry.frozen);
    if (!pinned.length) return;

    const pad = HUD_VIEWPORT_PAD;
    /** @type {Map<string, typeof pinned>} */
    const corners = new Map();

    for (const entry of pinned) {
      const cornerKey = entry.snap.cornerKey
        ?? this._cornerKeyForSnap(entry.snap.x, entry.snap.y, viewportRect, true);
      if (!cornerKey) continue;
      entry.snap.cornerKey = cornerKey;
      if (!corners.has(cornerKey)) corners.set(cornerKey, []);
      corners.get(cornerKey).push(entry);
    }

    for (const [cornerKey, group] of corners) {
      group.sort(
        (a, b) => LIGHT_IDS.indexOf(a.lightId) - LIGHT_IDS.indexOf(b.lightId),
      );

      const growDown = cornerKey.startsWith('t');
      const onRight = cornerKey.endsWith('r');
      const anchorX = onRight
        ? viewportRect.width - pad
        : pad;

      for (const entry of group) {
        entry.snap.x = anchorX;
      }

      if (group.length < 2) {
        const entry = group[0];
        const fitted = this._fitHudInViewport(
          entry.hud,
          entry.snap.x,
          entry.snap.y,
          entry.snap.flipY,
          viewportRect,
          true,
        );
        Object.assign(entry.snap, fitted);
        continue;
      }

      if (growDown) {
        let nextTop = pad;
        for (const entry of group) {
          entry.snap.x = anchorX;
          entry.snap.flipY = true;
          this._placeHud(entry.hud, entry.snap.x, entry.snap.y, entry.snap.flipY, true);
          let rect = entry.hud.getBoundingClientRect();
          const dy = (viewportRect.top + nextTop) - rect.top;
          entry.snap.y += dy;
          const fitted = this._fitHudInViewport(
            entry.hud,
            entry.snap.x,
            entry.snap.y,
            entry.snap.flipY,
            viewportRect,
            true,
          );
          Object.assign(entry.snap, fitted);
          rect = entry.hud.getBoundingClientRect();
          nextTop = rect.bottom - viewportRect.top + HUD_STACK_GAP;
        }
      } else {
        let nextBottom = viewportRect.height - pad;
        for (let i = group.length - 1; i >= 0; i -= 1) {
          const entry = group[i];
          entry.snap.x = anchorX;
          entry.snap.flipY = false;
          this._placeHud(entry.hud, entry.snap.x, entry.snap.y, entry.snap.flipY, true);
          let rect = entry.hud.getBoundingClientRect();
          const dy = (viewportRect.top + nextBottom) - rect.bottom;
          entry.snap.y += dy;
          const fitted = this._fitHudInViewport(
            entry.hud,
            entry.snap.x,
            entry.snap.y,
            entry.snap.flipY,
            viewportRect,
            true,
          );
          Object.assign(entry.snap, fitted);
          rect = entry.hud.getBoundingClientRect();
          nextBottom = rect.top - viewportRect.top - HUD_STACK_GAP;
        }
      }
    }
  }

  /**
   * Resolve sticky edge snap — slide along viewport edges when the light anchor is off-screen.
   * @returns {{ x: number, y: number, pinned: boolean, flipY: boolean, cornerKey: string | null }}
   */
  _resolveHudSnap(hud, rawX, rawY, viewportRect) {
    const pad = HUD_VIEWPORT_PAD;
    const w = viewportRect.width;
    const h = viewportRect.height;

    const offLeft = rawX < pad;
    const offRight = rawX > w - pad;
    const offTop = rawY < pad;
    const offBottom = rawY > h - pad;
    let pinned = offLeft || offRight || offTop || offBottom;

    let flipY = offTop && !offBottom;
    let x = rawX;
    let y = rawY;

    if (pinned) {
      if (offLeft) x = pad;
      else if (offRight) x = w - pad;
      else x = Math.max(pad, Math.min(w - pad, x));

      if (offTop) {
        flipY = true;
        y = pad;
      } else if (offBottom) {
        flipY = false;
        y = h - pad;
      } else {
        y = Math.max(pad, Math.min(h - pad, y));
      }
    }

    let fitted = this._fitHudInViewport(hud, x, y, flipY, viewportRect, pinned);

    if (!pinned) {
      const hadOverflow =
        Math.abs(fitted.x - rawX) > 0.5
        || Math.abs(fitted.y - rawY) > 0.5
        || fitted.flipY !== flipY;
      if (hadOverflow) {
        pinned = true;
        fitted = this._fitHudInViewport(hud, fitted.x, fitted.y, fitted.flipY, viewportRect, true);
      }
    }

    const cornerKey = pinned
      ? this._cornerKeyForSnap(fitted.x, fitted.y, viewportRect, true, {
        offLeft,
        offRight,
        offTop,
        offBottom,
      })
      : null;
    return {
      ...fitted,
      pinned,
      cornerKey,
      pinnedEdges: { offLeft, offRight, offTop, offBottom },
    };
  }

  /**
   * @returns {{ x: number, y: number, pinned: boolean, flipY: boolean, cornerKey: string | null }}
   */
  _clampHudPosition(hud, x, y, viewportRect) {
    return this._resolveHudSnap(hud, x, y, viewportRect);
  }

  shouldUpdate() {
    return !!this.getActive?.() && !!this.getLayouts?.();
  }

  update() {
    if (!this._root) return;

    const active = this.shouldUpdate();
    const layouts = active ? this.getLayouts?.() : null;
    const camera = this.getCamera?.();
    const viewport = this.viewport;

    if (!active || !layouts || !camera || !viewport) {
      this._root.hidden = true;
      this._root.setAttribute('aria-hidden', 'true');
      for (const hud of this._huds.values()) {
        hud.hidden = true;
      }
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    if (!(viewportRect.width > 0) || !(viewportRect.height > 0)) {
      this._root.hidden = true;
      return;
    }

    if (typeof camera.updateMatrixWorld === 'function') {
      camera.updateMatrixWorld(true);
    }

    this._root.hidden = false;
    this._root.setAttribute('aria-hidden', 'false');

    /** @type {Array<{ lightId: string, hud: HTMLElement, layout: object, snap: { x: number, y: number, pinned: boolean, flipY: boolean }, frozen: boolean }>} */
    const layoutEntries = [];

    for (const [lightId, hud] of this._huds) {
      const layout = layouts[lightId];
      if (!layout?.visible) {
        hud.hidden = true;
        continue;
      }

      this._world.copy(layout.world);
      this._ndc.copy(this._world).project(camera);
      if (this._ndc.z > 1 || this._ndc.z < -1) {
        hud.hidden = true;
        continue;
      }

      const x = (this._ndc.x * 0.5 + 0.5) * viewportRect.width;
      const y = (-this._ndc.y * 0.5 + 0.5) * viewportRect.height;

      hud.hidden = false;

      let snap;
      let frozen = false;
      if (this._positionFrozen) {
        const frozenSnap = this._frozenPositions.get(lightId);
        if (frozenSnap) {
          snap = frozenSnap;
          frozen = true;
        } else {
          snap = this._clampHudPosition(hud, x, y, viewportRect);
        }
      } else {
        snap = this._clampHudPosition(hud, x, y, viewportRect);
      }

      layoutEntries.push({ lightId, hud, layout, snap, frozen });
    }

    if (!this._positionFrozen) {
      this._layoutPinnedStacks(viewportRect, layoutEntries);
    }

    for (const { lightId, hud, layout, snap, frozen } of layoutEntries) {
      this._placeHud(hud, snap.x, snap.y, snap.flipY, snap.pinned);
      if (!frozen) {
        this._frozenPositions.set(lightId, snap);
      }

      const actions = hud.querySelector('.light-indicator-hud__actions');
      const shadowBtn = actions?.querySelector('.light-indicator-hud__btn--shadow');
      const colorBtn = actions?.querySelector('.light-indicator-hud__btn--color');
      const bulbBtn = actions?.querySelector('.light-indicator-hud__btn--bulb');
      const intensityPanel = hud.querySelector('.light-indicator-hud__intensity');
      const intensityRange = hud.querySelector('.light-indicator-hud__intensity-range');

      shadowBtn?.classList.toggle('light-indicator-hud__btn--active', layout.active === true);
      if (shadowBtn) {
        shadowBtn.dataset.tooltip = layout.active
          ? `${lightId} light — casting shadows (click to turn off)`
          : `${lightId} light — shadows off (click to turn on)`;
      }

      if (colorBtn && layout.color) {
        colorBtn.style.setProperty('--light-chip', layout.color);
        colorBtn.dataset.tooltip = `${lightId} light color — click to edit`;
      }

      bulbBtn?.classList.toggle('light-indicator-hud__btn--active', layout.lightOn === true);
      if (bulbBtn) {
        bulbBtn.dataset.tooltip = layout.lightOn
          ? `${lightId} light on — tap to turn off`
          : `${lightId} light off — tap to turn on`;
      }

      if (intensityRange instanceof HTMLInputElement && intensityPanel instanceof HTMLElement) {
        const intensity = this.getIntensity?.(lightId) ?? 1;
        if (document.activeElement !== intensityRange) {
          intensityRange.value = String(intensity);
          this._updateIntensitySliderFill(intensityRange);
        }
        intensityPanel.dataset.tooltip = `${lightId} intensity — ${Number(intensity).toFixed(2)}`;
      }
    }
  }

  dispose() {
    if (this._unlockPositionForPointer) {
      document.removeEventListener('pointerup', this._unlockPositionForPointer, true);
      document.removeEventListener('pointercancel', this._unlockPositionForPointer, true);
      this._unlockPositionForPointer = null;
    }
    this._root?.remove();
    this._root = null;
    this._huds.clear();
    this._frozenPositions.clear();
  }
}
