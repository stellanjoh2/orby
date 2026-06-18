import {
  takeMobileModelHandoff,
  waitForMobileModelHandoff,
  hasMobileHandoffPendingFlag,
} from '../../../../scripts/orbyMobileHandoff.js';
import {
  readOrbyMobileHandoffWaitMs,
  validateOrbyMobileModelFile,
} from '../../../../scripts/orbyMobileModelLimits.js';
import { urlHasHandoffFlag } from '../mobileHandoffUtils.js';
import { markMobileDebugLog } from '../mobileDebugLog.js';
import { mobileHaptic } from '../mobileHaptics.js';

/** @import { MobileScene } from '../MobileScene.js' */

/**
 * @typedef {{
 *   root: HTMLElement,
 *   scene: MobileScene,
 *   viewportEl: HTMLElement | null,
 *   showToast: (message: string) => void,
 * }} MobileModelLoaderContext
 */

export class MobileModelLoader {
  /** @param {MobileModelLoaderContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this._spinnerEl = ctx.root.querySelector('[data-viewport-load-spinner]');
    this._spinnerDepth = 0;
    this._fileInput =
      document.getElementById('orbyMobileFileInput') ??
      ctx.root.querySelector('#orbyMobileFileInput');
    /** @type {HTMLElement | null} */
    this._emptyEl = null;
  }

  async boot() {
    this.beginSpinner();
    markMobileDebugLog('shell:scene-init-start');
    const { scene, showToast } = this.ctx;
    try {
      await scene.init();
      markMobileDebugLog('shell:scene-init-done');
      const expectsHandoff = hasMobileHandoffPendingFlag() || urlHasHandoffFlag();
      if (expectsHandoff) {
        const handoffWaitMs = readOrbyMobileHandoffWaitMs();
        await waitForMobileModelHandoff(handoffWaitMs);
        const handoff = await takeMobileModelHandoff();
        if (handoff) {
          if (await this._loadHandoffPayload(handoff, 'handoff')) return;
        }
        markMobileDebugLog('shell:handoff-missing', { waitMs: handoffWaitMs });
        showToast('Model didn\'t transfer — load a sample or pick again');
      } else {
        const handoff = await takeMobileModelHandoff();
        if (handoff && (await this._loadHandoffPayload(handoff, 'handoff'))) return;
      }
      if (!scene.currentModel) {
        markMobileDebugLog('shell:no-model');
        this.showEmptyState(true);
      }
    } catch (err) {
      console.error('[Orby Mobile] Scene init failed', err);
      markMobileDebugLog('shell:scene-init-failed', { message: String(err?.message || err) });
      showToast('Viewer failed to start');
    } finally {
      this.endSpinner();
    }
  }

  bindFileInput() {
    this._fileInput?.addEventListener('change', () => {
      const file = this._fileInput?.files?.[0];
      if (!file) return;

      const check = validateOrbyMobileModelFile(file);
      if (!check.ok) {
        this.ctx.showToast(check.message);
        if (this._fileInput) this._fileInput.value = '';
        return;
      }

      const { scene, showToast } = this.ctx;
      this.beginSpinner();
      void scene.loadFile(file).then(() => {
        showToast(`Loaded ${file.name}`);
        mobileHaptic('success');
      }).catch((err) => {
        console.error('[Orby Mobile] Model load failed', err);
        markMobileDebugLog('shell:model-load-failed', {
          name: file.name,
          size: file.size,
          message: String(err?.message || err),
        });
        showToast(err instanceof Error ? err.message : 'Could not load model');
      }).finally(() => {
        this.endSpinner();
        if (this._fileInput) this._fileInput.value = '';
      });
    });
  }

  beginSpinner() {
    this._spinnerDepth += 1;
    this._syncSpinner();
  }

  endSpinner() {
    this._spinnerDepth = Math.max(0, this._spinnerDepth - 1);
    this._syncSpinner();
  }

  /** Re-evaluate chrome hiding when model state changes under an active spinner. */
  refreshLoadChrome() {
    this._syncSpinner();
  }

  /** @param {boolean} visible */
  showEmptyState(visible) {
    const { viewportEl, scene } = this.ctx;
    if (!viewportEl) return;
    if (!this._emptyEl) {
      const empty = document.createElement('div');
      empty.className = 'orby-mobile-viewport__empty';
      empty.innerHTML = `
        <span class="orby-magic-btn-host orby-mobile-browse-host">
          <button type="button" class="orby-mobile-browse-cta orby-magic-btn" aria-label="Load GLB model">
            <span class="orby-magic-btn__fill" aria-hidden="true"></span>
            <span class="orby-magic-btn__inner">
              <span class="orby-magic-btn__label">Load .glb</span>
              <span class="orby-magic-btn__arrow" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M3.5 8h9M9 4.5L12.5 8 9 11.5"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            </span>
          </button>
        </span>
      `;
      empty.querySelector('button')?.addEventListener('click', () => {
        this._fileInput?.click();
      });
      viewportEl.append(empty);
      this._emptyEl = empty;
    }
    this._emptyEl.hidden = !visible;
    if (visible) {
      viewportEl.removeAttribute('data-has-model');
    } else if (scene?.currentModel) {
      viewportEl.dataset.hasModel = 'true';
    }
  }

  /**
   * @param {{ name: string, buffer: ArrayBuffer, size: number }} payload
   * @param {string} source
   * @returns {Promise<boolean>} true when the model loaded
   */
  async _loadHandoffPayload(payload, source) {
    const { scene, showToast } = this.ctx;
    try {
      await scene.loadModelBuffer(payload.name, payload.buffer, payload.size);
      markMobileDebugLog('shell:model-loaded', {
        name: payload.name,
        size: payload.size,
        source,
      });
      showToast(`Loaded ${payload.name}`);
      return true;
    } catch (err) {
      console.error('[Orby Mobile] Model load failed', err);
      markMobileDebugLog('shell:model-load-failed', {
        name: payload.name,
        size: payload.size,
        source,
        message: String(err?.message || err),
      });
      showToast('Could not load model — pick again or try a sample');
      this.showEmptyState(true);
      return false;
    }
  }

  _syncSpinner() {
    const on = this._spinnerDepth > 0;
    const { viewportEl, root, scene } = this.ctx;
    const hideChrome = on && !scene?.currentModel;
    if (viewportEl) {
      if (on) {
        viewportEl.setAttribute('data-loading', 'true');
      } else {
        viewportEl.removeAttribute('data-loading');
      }
    }
    if (root instanceof HTMLElement) {
      if (hideChrome) {
        root.dataset.modelLoading = 'true';
      } else {
        delete root.dataset.modelLoading;
      }
    }
    if (this._spinnerEl instanceof HTMLElement) {
      this._spinnerEl.classList.toggle('is-visible', on);
      this._spinnerEl.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
  }
}
