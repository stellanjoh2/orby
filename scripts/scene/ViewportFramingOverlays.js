/**
 * DOM overlays stacked on the WebGL viewport: composition guides (16×9) and 21∶9 letterbox mattes.
 * Keeps element refs, visibility, and letterbox enter/exit animation out of SceneManager.
 */

/** Largest duration token from `getComputedStyle(...).transitionDuration` (e.g. `"0.25s, 0s"`). */
function parseCssTransitionDurationMs(value) {
  if (!value || typeof value !== 'string') return 0;
  let maxMs = 0;
  for (const part of value.split(',')) {
    const s = part.trim();
    const m = s.match(/^([\d.]+)(ms|s)$/i);
    if (!m) continue;
    const n = parseFloat(m[1]);
    const ms = m[2].toLowerCase() === 's' ? n * 1000 : n;
    if (ms > maxMs) maxMs = ms;
  }
  return Math.ceil(maxMs);
}

const COMPOSITION_GRID_FADE_FALLBACK_MS = 100;

export class ViewportFramingOverlays {
  constructor() {
    this._compositionGridOverlayEl = null;
    this._cinematicLetterbox219El = null;
    this._cinematicLetterbox219HideTimeout = null;
    this._cinematicLetterbox219EnterRaf = null;
    this._compositionGridHideTimeout = null;
    this._compositionGridEnterRaf = null;
  }

  /** Apply visibility from the persisted `camera` slice (`state.camera`). */
  syncFromCamera(
    camera,
    { letterboxAnimate = false, compositionGridAnimate = false } = {},
  ) {
    const cam = camera && typeof camera === 'object' ? camera : {};
    this.setCompositionGridOverlayVisible(!!cam.compositionGridEnabled, {
      animate: compositionGridAnimate,
    });
    this.setCompositionGuidesInverted(!!cam.compositionGuidesInverted);
    this.setCinematicLetterbox219Visible(!!cam.cinematicLetterbox219, {
      animate: letterboxAnimate,
    });
  }

  /** Composition guides: quick opacity fade (see `--composition-grid-fade-duration` in CSS). */
  setCompositionGridOverlayVisible(enabled, { animate = false } = {}) {
    const el =
      this._compositionGridOverlayEl ??
      document.getElementById('compositionGridOverlay');
    if (!el) return;
    this._compositionGridOverlayEl = el;

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const useAnimate = animate && !prefersReducedMotion;

    if (this._compositionGridHideTimeout != null) {
      clearTimeout(this._compositionGridHideTimeout);
      this._compositionGridHideTimeout = null;
    }
    if (this._compositionGridEnterRaf != null) {
      cancelAnimationFrame(this._compositionGridEnterRaf);
      this._compositionGridEnterRaf = null;
    }

    const finishInstantOff = () => {
      el.classList.remove(
        'composition-grid-overlay--fade-in',
        'composition-grid-overlay--instant',
      );
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    };

    const applyInstantOn = () => {
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      el.classList.add(
        'composition-grid-overlay--fade-in',
        'composition-grid-overlay--instant',
      );
      requestAnimationFrame(() => {
        el.classList.remove('composition-grid-overlay--instant');
      });
    };

    if (!useAnimate) {
      if (enabled) {
        applyInstantOn();
      } else {
        finishInstantOff();
      }
      return;
    }

    if (enabled) {
      el.classList.remove('composition-grid-overlay--instant');
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      el.classList.remove('composition-grid-overlay--fade-in');
      this._compositionGridEnterRaf = requestAnimationFrame(() => {
        this._compositionGridEnterRaf = null;
        el.classList.add('composition-grid-overlay--fade-in');
      });
    } else {
      if (el.hidden) {
        finishInstantOff();
        return;
      }
      el.classList.remove('composition-grid-overlay--fade-in');
      const outMsRaw = parseCssTransitionDurationMs(
        window.getComputedStyle(el).transitionDuration,
      );
      const outMs =
        outMsRaw > 0 ? outMsRaw : COMPOSITION_GRID_FADE_FALLBACK_MS;
      this._compositionGridHideTimeout = window.setTimeout(() => {
        this._compositionGridHideTimeout = null;
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
      }, outMs);
    }
  }

  /** Light vs dark guide strokes (Camera → Composition Guides → colour). */
  setCompositionGuidesInverted(inverted) {
    const el =
      this._compositionGridOverlayEl ??
      document.getElementById('compositionGridOverlay');
    if (!el) return;
    this._compositionGridOverlayEl = el;
    el.classList.toggle('composition-grid-overlay--inverted', !!inverted);
  }

  /** Viewport-only 21∶9 mattes (Camera → 21∶9 letterbox). */
  setCinematicLetterbox219Visible(enabled, { animate = false } = {}) {
    const el =
      this._cinematicLetterbox219El ??
      document.getElementById('viewportLetterbox219');
    if (!el) return;
    this._cinematicLetterbox219El = el;

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const useAnimate = animate && !prefersReducedMotion;

    if (this._cinematicLetterbox219HideTimeout != null) {
      clearTimeout(this._cinematicLetterbox219HideTimeout);
      this._cinematicLetterbox219HideTimeout = null;
    }
    if (this._cinematicLetterbox219EnterRaf != null) {
      cancelAnimationFrame(this._cinematicLetterbox219EnterRaf);
      this._cinematicLetterbox219EnterRaf = null;
    }

    if (!useAnimate) {
      el.hidden = !enabled;
      el.setAttribute('aria-hidden', enabled ? 'false' : 'true');
      el.classList.remove('viewport-letterbox--exiting');
      el.classList.toggle('viewport-letterbox--shown', !!enabled);
      return;
    }

    const LETTERBOX_IN_MS = 250;
    const letterboxOutFallbackMs = Math.ceil(LETTERBOX_IN_MS / 1.5);

    if (enabled) {
      el.classList.remove('viewport-letterbox--exiting');
      el.hidden = false;
      el.setAttribute('aria-hidden', 'false');
      el.classList.remove('viewport-letterbox--shown');
      this._cinematicLetterbox219EnterRaf = requestAnimationFrame(() => {
        this._cinematicLetterbox219EnterRaf = requestAnimationFrame(() => {
          this._cinematicLetterbox219EnterRaf = null;
          el.classList.add('viewport-letterbox--shown');
        });
      });
    } else {
      el.classList.add('viewport-letterbox--exiting');
      // Double rAF: apply `--exiting` exit duration before dropping `--shown`, so all bars
      // (including left/right) run the shorter transition; then match `hidden` to computed duration.
      this._cinematicLetterbox219EnterRaf = requestAnimationFrame(() => {
        this._cinematicLetterbox219EnterRaf = requestAnimationFrame(() => {
          this._cinematicLetterbox219EnterRaf = null;
          el.classList.remove('viewport-letterbox--shown');
          const probe =
            el.querySelector('.viewport-letterbox__bar--left') ??
            el.querySelector('.viewport-letterbox__bar--top');
          const outMsRaw = probe
            ? parseCssTransitionDurationMs(
                window.getComputedStyle(probe).transitionDuration,
              )
            : 0;
          const outMs =
            outMsRaw > 0 ? outMsRaw : letterboxOutFallbackMs;
          this._cinematicLetterbox219HideTimeout = window.setTimeout(() => {
            this._cinematicLetterbox219HideTimeout = null;
            el.classList.remove('viewport-letterbox--exiting');
            el.hidden = true;
            el.setAttribute('aria-hidden', 'true');
          }, outMs);
        });
      });
    }
  }
}
