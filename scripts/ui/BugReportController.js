/**
 * Simple bug report modal → POST to serverless (see /api/bug-report.js).
 * API URL: meta[name="orby-bug-report-api"] content, or "/api/bug-report".
 * Turnstile: meta[name="orby-turnstile-site-key"] when using Cloudflare with server secret.
 */
export class BugReportController {
  /**
   * @param {import('./UIManager.js').UIManager} ui
   */
  constructor(ui) {
    this.ui = ui;
    /** @type {boolean} */
    this._sending = false;
    /** @type {string} */
    this._turnstileSiteKey = '';
    /** @type {string | null} */
    this._turnstileWidgetId = null;
    /** @type {Promise<void> | null} */
    this._turnstileScriptPromise = null;
  }

  init() {
    this.modal = document.querySelector('#bugReportModal');
    this.form = document.querySelector('#bugReportForm');
    if (!this.modal || !this.form) return;

    const siteRaw = document.querySelector('meta[name="orby-turnstile-site-key"]')?.getAttribute('content');
    this._turnstileSiteKey = typeof siteRaw === 'string' ? siteRaw.trim() : '';

    this.closeBtn = document.querySelector('#closeBugReport');
    this.cancelBtn = document.querySelector('#cancelBugReport');
    this.submitBtn = document.querySelector('#submitBugReport');
    this.honeypot = this.form.querySelector('input[name="honeypot"]');
    this.statusEl = this.modal.querySelector('.bug-report-status');
    this.turnstileHost = this.form.querySelector('#bug-report-turnstile');

    document.querySelectorAll('[data-bug-report-open]').forEach((el) => {
      el.addEventListener('click', () => this.open());
    });

    const messageInput = this.form.querySelector('#bugReportMessage');
    for (const ev of ['input', 'change']) {
      messageInput?.addEventListener(ev, () => this.syncSendButton());
    }
    this.form.querySelectorAll('input[name="severity"]').forEach((el) => {
      el.addEventListener('change', () => this.syncSendButton());
    });

    this.closeBtn?.addEventListener('click', () => this.close());
    this.cancelBtn?.addEventListener('click', () => this.close());
    /** Only close on backdrop if press+release both started on the dimmed overlay (not after dragging from an input). */
    this.modal.addEventListener('pointerdown', (e) => {
      this._bugBackdropDown = e.target === this.modal;
    });
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal && this._bugBackdropDown) this.close();
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    this.syncSendButton();
  }

  _ensureTurnstileScript() {
    if (typeof window.turnstile !== 'undefined') return Promise.resolve();
    if (this._turnstileScriptPromise) return this._turnstileScriptPromise;
    this._turnstileScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('turnstile script'));
      document.head.appendChild(s);
    });
    return this._turnstileScriptPromise;
  }

  _removeTurnstileWidget() {
    if (this._turnstileWidgetId != null && typeof window.turnstile !== 'undefined') {
      try {
        window.turnstile.remove(this._turnstileWidgetId);
      } catch {
        /* ignore */
      }
    }
    this._turnstileWidgetId = null;
  }

  _resetTurnstile() {
    if (this._turnstileWidgetId != null && typeof window.turnstile !== 'undefined') {
      try {
        window.turnstile.reset(this._turnstileWidgetId);
      } catch {
        /* ignore */
      }
    }
  }

  async _prepareTurnstileForOpen() {
    if (!this._turnstileSiteKey || !this.turnstileHost) return;
    try {
      await this._ensureTurnstileScript();
    } catch {
      this.setStatus('Could not load security check. Try again or refresh.', true);
      return;
    }
    this._removeTurnstileWidget();
    try {
      this._turnstileWidgetId = window.turnstile.render(this.turnstileHost, {
        sitekey: this._turnstileSiteKey,
        theme: 'auto',
      });
    } catch {
      this.setStatus('Security check failed to start. Try again.', true);
    }
  }

  syncSendButton() {
    if (!this.submitBtn || !this.form || this._sending) return;
    const message = this.form.querySelector('#bugReportMessage')?.value?.trim() ?? '';
    const valid = message.length >= 8;
    this.submitBtn.disabled = !valid;
  }

  getApiUrl() {
    const raw = document.querySelector('meta[name="orby-bug-report-api"]')?.getAttribute('content');
    const t = typeof raw === 'string' ? raw.trim() : '';
    return t || '/api/bug-report';
  }

  isOpen() {
    return this.modal?.style.display === 'flex';
  }

  open() {
    if (!this.modal) return;
    this._sending = false;
    this._bugBackdropDown = false;
    this.setStatus('');
    this.modal.style.display = 'flex';
    const messageEl = this.form?.querySelector('#bugReportMessage');
    messageEl?.focus();
    void this._prepareTurnstileForOpen();
    this.syncSendButton();
  }

  close() {
    if (!this.modal || !this.form) return;
    this.modal.style.display = 'none';
    this._removeTurnstileWidget();
    this.form.reset();
    this.setStatus('');
    this._sending = false;
    this.syncSendButton();
  }

  setStatus(text, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.style.color = isError ? 'var(--danger, #f87171)' : 'var(--text-dim)';
  }

  async submit() {
    if (!this.form || !this.submitBtn) return;

    const category = this.form.querySelector('#bugReportCategory')?.value ?? '';
    const severity =
      this.form.querySelector('input[name="severity"]:checked')?.value ?? '';
    const message = this.form.querySelector('#bugReportMessage')?.value?.trim() ?? '';

    if (!severity) {
      this.setStatus('Choose a severity level.', true);
      return;
    }
    if (message.length < 8) {
      this.setStatus('Please describe the issue in a bit more detail.', true);
      return;
    }

    let turnstileToken = '';
    if (this._turnstileSiteKey) {
      if (typeof window.turnstile === 'undefined' || this._turnstileWidgetId == null) {
        this.setStatus('Security check is still loading. Wait a moment.', true);
        return;
      }
      turnstileToken = window.turnstile.getResponse(this._turnstileWidgetId) || '';
      if (!turnstileToken) {
        this.setStatus('Complete the security check below the form.', true);
        return;
      }
    }

    this._sending = true;
    this.submitBtn.disabled = true;
    this.setStatus('Sending…');

    const apiUrl = this.getApiUrl();

    const payload = {
      category,
      severity,
      message,
      honeypot: this.honeypot?.value ?? '',
      turnstileToken,
    };

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 204) {
        this.close();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let msg;
        if (res.status === 429) {
          const sec = typeof err.retryAfter === 'number' ? err.retryAfter : null;
          msg =
            sec != null && sec > 0
              ? `${err.error || 'Too many requests.'} Retry in about ${sec}s.`
              : err.error || 'Too many requests. Try again later.';
        } else if ((res.status === 405 || res.status === 404) && apiUrl.startsWith('/')) {
          msg =
            'This site is static: add GitHub Actions variable BUG_REPORT_API_URL (your full Vercel URL ending in /api/bug-report), then redeploy.';
        } else if (res.status === 503) {
          msg = 'Reporting is not available (server not configured).';
        } else if (err.code === 'turnstile_failed' || err.code === 'turnstile_required') {
          msg = err.error || 'Security check failed. Try again.';
          this._resetTurnstile();
        } else {
          msg = err.error || 'Could not send report. Try again later.';
        }
        this.setStatus(msg, true);
        this._sending = false;
        this.syncSendButton();
        return;
      }

      this.close();
      this.ui.helpers.showToast('Thanks — report sent.');
    } catch {
      this.setStatus('Network error. Check your connection.', true);
      this._sending = false;
      this.syncSendButton();
    }
  }
}
