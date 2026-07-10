const DEV_TOOLS_SHORTCUT_KEY = 'd';
const DEV_TOOLS_SHORTCUT_LABEL = 'D';

/**
 * Secret dev-tools panel (npm run dev only). Toggle with D.
 * Left dock — no backdrop blur so the viewport stays visible for thumbnail bakes.
 */
export class DevToolsModal {
  /**
   * @param {import('../UIManager.js').UIManager} ui
   */
  constructor(ui) {
    this.ui = ui;
    /** @type {boolean} */
    this._open = false;
    /** @type {HTMLElement | null} */
    this.modal = null;
    /** @type {HTMLElement | null} */
    this.panel = null;
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  mount() {
    if (this.modal) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `
      <div
        id="devToolsModal"
        class="dev-tools-modal"
        style="display: none;"
        role="dialog"
        aria-labelledby="devToolsModalTitle"
        hidden
      >
        <div class="dev-tools-content">
          <div class="dev-tools-header">
            <h3 id="devToolsModalTitle">Dev tools</h3>
            <button type="button" id="closeDevToolsModal" class="close-btn" aria-label="Close"></button>
          </div>
          <p class="dev-tools-lead">
            Local dev only (<code>npm run dev</code>). These controls are not in production builds.
          </p>

          <section class="dev-tools-section">
            <h4 class="dev-tools-section-title">Thumbnail bakes</h4>
            <p class="dev-tools-section-note">Frame the shot first, then bake from the current mesh and camera.</p>
            <div class="dev-tools-action-row">
              <span class="dev-tools-action-label">Shader Lab</span>
              <div class="dev-tools-action-buttons">
                <button type="button" id="creativeLookBakeCurrentThumbBtn" class="dev-tools-btn" data-tooltip="Bake only the selected Shader Lab preset thumbnail">
                  RRC
                </button>
                <button type="button" id="creativeLookBakeThumbsBtn" class="dev-tools-btn" data-tooltip="Bake all Shader Lab preset thumbnails">
                  RRA
                </button>
              </div>
            </div>
            <div class="dev-tools-action-row">
              <span class="dev-tools-action-label">Look Filters</span>
              <div class="dev-tools-action-buttons">
                <button type="button" id="lookFilterBakeCurrentThumbBtn" class="dev-tools-btn" data-tooltip="Bake only the selected Look Filter preset thumbnail">
                  RRC
                </button>
                <button type="button" id="lookFilterBakeThumbsBtn" class="dev-tools-btn" data-tooltip="Bake all Look Filter preset thumbnails">
                  RRA
                </button>
              </div>
            </div>
          </section>

          <section class="dev-tools-section">
            <h4 class="dev-tools-section-title">Export QA</h4>
            <div class="dev-tools-stack">
              <button type="button" id="devToolsExportOverlayBtn" class="dev-tools-btn dev-tools-btn--wide">
                Preview export overlay
              </button>
              <button type="button" id="devToolsExportSpotChecksBtn" class="dev-tools-btn dev-tools-btn--wide">
                Run export dimension spot checks
              </button>
              <button type="button" id="devToolsLogCaptureMatrixBtn" class="dev-tools-btn dev-tools-btn--wide">
                Log capture size matrix
              </button>
            </div>
          </section>

          <section class="dev-tools-section">
            <h4 class="dev-tools-section-title">Debug</h4>
            <div class="dev-tools-stack">
              <a href="/?orby404Debug=1" class="dev-tools-link" target="_blank" rel="noopener noreferrer">
                Open debug 404 page
              </a>
            </div>
          </section>

          <p class="dev-tools-shortcut-hint">
            <kbd>${DEV_TOOLS_SHORTCUT_LABEL}</kbd> toggle · <kbd>Esc</kbd> close
          </p>
        </div>
      </div>
      `,
    );

    this.modal = document.getElementById('devToolsModal');
    this.panel = this.modal?.querySelector('.dev-tools-content') ?? null;
    const closeBtn = document.getElementById('closeDevToolsModal');

    closeBtn?.addEventListener('click', () => this.close());

    document.getElementById('devToolsExportOverlayBtn')?.addEventListener('click', () => {
      this.ui?.toggleOfflineExportOverlayPreview?.();
      this.ui?.showToast?.('Export overlay preview toggled', 2200, { notification: false });
    });

    document.getElementById('devToolsExportSpotChecksBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('devToolsExportSpotChecksBtn');
      if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Running…';
      try {
        const result = await window.orby?.dev?.runExportDimensionSpotChecks?.(window.orby?.scene);
        const failed = result?.failed ?? 0;
        this.ui?.showToast?.(
          failed ? `Spot checks finished with ${failed} failure(s)` : 'Export spot checks passed',
          3600,
          { notification: false, icon: failed ? 'warning' : 'success' },
        );
      } catch (err) {
        console.error('[Orby dev] Export spot checks failed', err);
        this.ui?.showToast?.(err?.message || 'Export spot checks failed', 3600, {
          notification: false,
        });
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    document.getElementById('devToolsLogCaptureMatrixBtn')?.addEventListener('click', () => {
      window.orby?.dev?.logCaptureSizeMatrix?.();
      this.ui?.showToast?.('Capture size matrix logged to console', 2400, { notification: false });
    });

    document.addEventListener('keydown', this._onKeyDown);
  }

  /** @param {KeyboardEvent} event */
  _onKeyDown(event) {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement && target.type !== 'range')
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    if (event.key === 'Escape' && this._open) {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key.toLowerCase() !== DEV_TOOLS_SHORTCUT_KEY || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    event.preventDefault();
    this.toggle();
  }

  isOpen() {
    return this._open;
  }

  open() {
    if (!this.modal || this._open) return;
    this._open = true;
    this.modal.hidden = false;
    this.modal.style.display = 'block';
  }

  close() {
    if (!this.modal || !this._open) return;
    this._open = false;
    this.modal.style.display = 'none';
    this.modal.hidden = true;
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown);
    this.modal?.remove();
    this.modal = null;
    this.panel = null;
    this._open = false;
  }
}

/**
 * @param {HTMLButtonElement | null} btn
 * @param {(options?: object) => Promise<object>} bakeFn
 * @param {() => object} resolveOptions
 * @param {import('../UIManager.js').UIManager | undefined} ui
 */
export function wireDevBakeButton(btn, bakeFn, resolveOptions, ui) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = 'baking…';
    try {
      await bakeFn(resolveOptions());
    } catch (err) {
      console.error('[Orby dev] Thumbnail bake failed', err);
      ui?.showToast?.(err?.message || 'Thumbnail bake failed', 3600, {
        notification: false,
      });
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  });
}
