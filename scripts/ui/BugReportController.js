/**
 * Issue report modal → POST /api/bug-report.
 * API URL: meta[name="orby-bug-report-api"] or "/api/bug-report"; Turnstile: meta orby-turnstile-site-key + server secret.
 */
import gsap from 'gsap';
import { animateModalClose, animateModalOpen, prefersReducedMotion } from './modalReveal.js';

/** Minimum usable detail — keep in sync with api/bug-report.js */
const MIN_BUG_MESSAGE_CHARS = 50;
const MIN_BUG_MESSAGE_WORDS = 10;

function bugReportMessagePassesDetailBar(trimmed) {
  if (trimmed.length < MIN_BUG_MESSAGE_CHARS) return false;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  return words >= MIN_BUG_MESSAGE_WORDS;
}

function escapeHtmlMinimal(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Plain copy + lime tail (landing `.brand-highlight` / `--brand-primary`) */
const BUG_REPORT_THANK_YOU_PREFIX =
  'Thanks for letting us know — we really appreciate you taking the time. ';
const BUG_REPORT_THANK_YOU_ACCENT_TAIL = 'We\u2019ll look into it shortly.';

const BUG_REPORT_THANK_YOU_FULL_TEXT = BUG_REPORT_THANK_YOU_PREFIX + BUG_REPORT_THANK_YOU_ACCENT_TAIL;

/** Backdrop fades in briefly before content (matches prior feel vs full 1s line reveal) */
const THANK_YOU_SCRIM_IN = 0.22;

const ORBY_DROP_FADE_UP_PLAYING_CLASS = 'orby-drop-fade-up-playing';

export class BugReportController {
  /**
   * @param {import('./UIManager.js').UIManager} ui
   */
  constructor(ui) {
    /** @type {boolean} */
    this._sending = false;
    /** @type {string} */
    this._turnstileSiteKey = '';
    /** @type {string | null} */
    this._turnstileWidgetId = null;
    /** @type {Promise<void> | null} */
    this._turnstileScriptPromise = null;
    /** @type {boolean} set when opaque thank-you backdrop is layered under modal (success path only) */
    this._thankYouBackdropPrimed = false;
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
    this.statusTextEl = this.modal.querySelector('.bug-report-status-text');
    this.messageStage = this.form.querySelector('.bug-report-message-stage');
    this.messageOverlay = this.form.querySelector('.bug-report-message-sending-overlay');
    this.turnstileHost = this.form.querySelector('#bug-report-turnstile');
    this.thankYouLayer = document.querySelector('#bugReportThankYouLayer');
    this.thankYouMessageEl = document.querySelector('#bugReportThankYouMessage');
    this.thankYouOkBtn = document.querySelector('#bugReportThankYouOk');

    this.thankYouLayer?.addEventListener('click', (e) => {
      if (e.target === this.thankYouLayer) this._dismissBugReportThankYou();
    });
    document.querySelector('#bugReportThankYouStack')?.addEventListener('click', (e) => e.stopPropagation());
    this.thankYouOkBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dismissBugReportThankYou();
    });

    document.querySelectorAll('[data-bug-report-open]').forEach((el) => {
      el.addEventListener('click', () => this.open());
    });

    const messageInput = this.form.querySelector('#bugReportMessage');
    for (const ev of ['input', 'change']) {
      messageInput?.addEventListener(ev, () => this.syncSendButton());
    }
    this.severityCombo = this.form.querySelector('#bugReportSeverityCombo');
    this.severityTrigger = this.form.querySelector('#bugReportSeverityTrigger');
    this.severityListbox = this.form.querySelector('#bugReportSeverityListbox');
    this.severityHidden = this.form.querySelector('#bugReportSeverity');
    this._severityDocCapture = false;
    this._bindSeverityCombo();

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

    this.setStatus('');
    this.syncSendButton();
  }

  _closeSeverityListbox() {
    if (!this.severityListbox || !this.severityTrigger) return;
    this.severityListbox.hidden = true;
    this.severityTrigger.setAttribute('aria-expanded', 'false');
    if (this._severityDocCapture) {
      document.removeEventListener('pointerdown', this._onSeverityDocPointer, true);
      this._severityDocCapture = false;
    }
  }

  _openSeverityListbox() {
    if (!this.severityListbox || !this.severityTrigger) return;
    this.severityListbox.hidden = false;
    this.severityTrigger.setAttribute('aria-expanded', 'true');
    if (!this._severityDocCapture) {
      document.addEventListener('pointerdown', this._onSeverityDocPointer, true);
      this._severityDocCapture = true;
    }
    queueMicrotask(() => this.severityListbox?.focus());
  }

  /** @param {Event} e */
  _onSeverityDocPointer = (e) => {
    if (!this.severityCombo || !(e.target instanceof Node)) return;
    if (this.severityCombo.contains(e.target)) return;
    this._closeSeverityListbox();
  };

  syncSeverityFromHidden() {
    const v = this.severityHidden?.value?.trim() ?? '';
    if (!v || !this.severityListbox) return;
    const opt = this.severityListbox.querySelector(`[role="option"][data-value="${CSS.escape(v)}"]`);
    const label = opt?.textContent?.replace(/\s+/g, ' ')?.trim() ?? '';
    if (this.severityTrigger) {
      const dot = this.severityTrigger.querySelector('.bug-report-severity-dot');
      if (dot) dot.setAttribute('data-severity', v);
      const textEl = this.severityTrigger.querySelector('.bug-report-severity-trigger-text');
      if (textEl && label) textEl.textContent = label;
    }
    this.severityListbox.querySelectorAll('[role="option"]').forEach((el) => {
      const sel = el.getAttribute('data-value') === v;
      el.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
    this.syncSendButton();
  }

  _setBugReportSeverity(value) {
    if (!this.severityHidden || !value) return;
    this.severityHidden.value = value;
    this.syncSeverityFromHidden();
  }

  _bindSeverityCombo() {
    if (!this.severityCombo || !this.severityTrigger || !this.severityListbox || !this.severityHidden) return;

    this.severityTrigger.addEventListener('click', () => {
      const open = this.severityTrigger?.getAttribute('aria-expanded') === 'true';
      if (open) this._closeSeverityListbox();
      else this._openSeverityListbox();
    });

    this.severityTrigger.addEventListener('keydown', (e) => {
      const open = this.severityTrigger?.getAttribute('aria-expanded') === 'true';
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        this._closeSeverityListbox();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !open) {
        e.preventDefault();
        this._openSeverityListbox();
      }
    });

    this.severityListbox.addEventListener('click', (e) => {
      const li = e.target?.closest?.('[role="option"]');
      const val = li?.getAttribute?.('data-value');
      if (!val) return;
      this._setBugReportSeverity(val);
      this._closeSeverityListbox();
      this.severityTrigger?.focus();
    });

    this.severityListbox.addEventListener('keydown', (e) => {
      const opts = [...this.severityListbox.querySelectorAll('[role="option"]')];
      const cur = this.severityHidden.value;
      let ix = opts.findIndex((o) => o.getAttribute('data-value') === cur);
      if (ix < 0) ix = 0;

      if (e.key === 'Escape') {
        e.preventDefault();
        this._closeSeverityListbox();
        this.severityTrigger?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const n = Math.min(opts.length - 1, ix + 1);
        this._setBugReportSeverity(opts[n].getAttribute('data-value') ?? '');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const n = Math.max(0, ix - 1);
        this._setBugReportSeverity(opts[n].getAttribute('data-value') ?? '');
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._closeSeverityListbox();
        this.severityTrigger?.focus();
      }
    });

    this.syncSeverityFromHidden();
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
    const severity = this.form.querySelector('input[name="severity"]')?.value?.trim() ?? '';
    const valid = bugReportMessagePassesDetailBar(message) && Boolean(severity);
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

  /** Form / Turnstile / status reset after modal is no longer visible. */
  _resetBugModalAfterClose() {
    if (!this.form) return;
    this._removeTurnstileWidget();
    this.form.reset();
    this.syncSeverityFromHidden();
    this.setStatus('');
    this._sending = false;
    this.syncSendButton();
  }

  /** Hide bug modal without wipe animation (runs after thank-you fade when the form was left open underneath). */
  _quietHideBugModal() {
    if (!this.modal || !this.form) return;
    if (!this.isOpen()) return;
    const panel = this.modal.querySelector('.load-settings-content');
    this._closeSeverityListbox();
    gsap.killTweensOf([this.modal, panel].filter(Boolean));
    this.modal.style.display = 'none';
    if (panel) gsap.set(panel, { clearProps: 'clipPath,transform' });
    gsap.set(this.modal, { clearProps: 'clipPath,transform' });
    this._resetBugModalAfterClose();
  }

  open() {
    if (!this.modal) return;
    this._teardownBugReportThankYouQuiet();
    this._sending = false;
    this._bugBackdropDown = false;
    this.setStatus('');
    this._closeSeverityListbox();
    const panel = this.modal.querySelector('.load-settings-content');
    void animateModalOpen(this.modal, panel).then(() => {
      const messageEl = this.form?.querySelector('#bugReportMessage');
      messageEl?.focus();
    });
    void this._prepareTurnstileForOpen();
    this.syncSendButton();
  }

  /**
   * @param {() => void} [onAfterCleanup] runs after modal is hidden
   * @param {{ preserveViewportBackdrop?: boolean }} [opts] keep full-modal dim scrim until hidden (thank-you path)
   */
  close(onAfterCleanup, opts = {}) {
    if (!this.modal || !this.form) return;
    if (this.modal.style.display === 'none') return;
    this._closeSeverityListbox();
    const panel = this.modal.querySelector('.load-settings-content');
    const preserveBackdrop = opts.preserveViewportBackdrop === true;
    animateModalClose(
      this.modal,
      panel,
      () => {
        this._resetBugModalAfterClose();
        if (typeof onAfterCleanup === 'function') queueMicrotask(() => onAfterCleanup());
      },
      preserveBackdrop,
    );
  }

  _maskBugModalBehindThankYou() {
    if (!this.modal || this.modal.style.display === 'none') return;
    this.modal.classList.add('bug-report-modal--thank-you-mask');
  }

  _unmaskBugModalBehindThankYou() {
    this.modal?.classList.remove('bug-report-modal--thank-you-mask');
  }

  /** Opaque scrim beneath bug modal — avoids canvas flash during close wipe. Success path only. */
  _primeThankYouBackdropBehindModal() {
    const layer = this.thankYouLayer;
    if (!layer) return;
    gsap.killTweensOf(layer);
    this._thankYouBackdropPrimed = true;
    layer.classList.add('bug-report-thank-you-layer--under-modal');
    layer.removeAttribute('hidden');
    layer.style.display = 'flex';
    layer.removeAttribute('aria-label');
    layer.setAttribute('aria-hidden', 'true');
    gsap.set(layer, { opacity: 1 });
  }

  _teardownBugReportThankYouQuiet() {
    this._unmaskBugModalBehindThankYou();
    this._thankYouBackdropPrimed = false;
    this.thankYouLayer?.classList.remove('bug-report-thank-you-layer--under-modal');
    if (!this.thankYouLayer || !this.thankYouMessageEl) return;
    gsap.killTweensOf([this.thankYouLayer, this.thankYouMessageEl, this.thankYouOkBtn]);
    this.thankYouMessageEl.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
    this.thankYouOkBtn?.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
    this.thankYouLayer.removeAttribute('aria-label');
    this.thankYouMessageEl.textContent = '';
    this.thankYouMessageEl.removeAttribute('aria-hidden');
    this.thankYouLayer.setAttribute('hidden', '');
    this.thankYouLayer.style.display = '';
    this.thankYouLayer.setAttribute('aria-hidden', 'true');
    gsap.set(this.thankYouMessageEl, { clearProps: 'all' });
    gsap.set(this.thankYouLayer, { clearProps: 'opacity' });
    if (this.thankYouOkBtn) gsap.set(this.thankYouOkBtn, { clearProps: 'opacity,transform' });
  }

  /**
   * Full-screen thank-you (after successful send).
   * Backdrop click closes; “Keep Orbing” is the primary OK.
   */
  _playBugReportThankYou() {
    const layer = this.thankYouLayer;
    const msg = this.thankYouMessageEl;
    const ok = this.thankYouOkBtn;
    if (!layer || !msg || !ok) return;

    const bridgedBackdrop = this._thankYouBackdropPrimed;
    if (bridgedBackdrop) this._thankYouBackdropPrimed = false;

    const skipBackdropReveal =
      bridgedBackdrop || (!layer.hasAttribute('hidden') && layer.style.display === 'flex');

    this._maskBugModalBehindThankYou();

    gsap.killTweensOf([msg, ok]);
    if (!skipBackdropReveal) gsap.killTweensOf(layer);

    msg.innerHTML = `${escapeHtmlMinimal(BUG_REPORT_THANK_YOU_PREFIX)}<span class="brand-highlight">${escapeHtmlMinimal(BUG_REPORT_THANK_YOU_ACCENT_TAIL)}</span>`;
    msg.removeAttribute('aria-hidden');
    layer.setAttribute('aria-label', BUG_REPORT_THANK_YOU_FULL_TEXT);

    layer.removeAttribute('hidden');
    layer.style.display = 'flex';
    layer.setAttribute('aria-hidden', 'false');

    if (prefersReducedMotion()) {
      gsap.killTweensOf(layer);
      gsap.set(layer, { opacity: 1 });
      gsap.set([msg, ok], { opacity: 1, y: 0, clearProps: 'transform' });
      msg.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
      ok.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
      return;
    }

    if (skipBackdropReveal) {
      gsap.set(layer, { opacity: 1 });
    } else {
      gsap.set(layer, { opacity: 0 });
      gsap.to(layer, { opacity: 1, duration: THANK_YOU_SCRIM_IN, ease: 'power2.out' });
    }

    msg.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
    ok.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
    void msg.offsetWidth;
    msg.classList.add(ORBY_DROP_FADE_UP_PLAYING_CLASS);
    ok.classList.add(ORBY_DROP_FADE_UP_PLAYING_CLASS);
  }

  _dismissBugReportThankYou() {
    const layer = this.thankYouLayer;
    const msg = this.thankYouMessageEl;
    const ok = this.thankYouOkBtn;
    if (!layer?.isConnected) return;

    gsap.killTweensOf([layer, msg, ok]);

    msg.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);
    ok?.classList.remove(ORBY_DROP_FADE_UP_PLAYING_CLASS);

    const fast = prefersReducedMotion();
    const done = () => {
      this._thankYouBackdropPrimed = false;
      if (this.isOpen()) {
        this._quietHideBugModal();
      }
      layer.classList.remove('bug-report-thank-you-layer--under-modal');
      layer.removeAttribute('aria-label');
      layer.setAttribute('hidden', '');
      layer.style.display = '';
      layer.setAttribute('aria-hidden', 'true');
      msg.textContent = '';
      msg.removeAttribute('aria-hidden');
      gsap.set(msg, { clearProps: 'all' });
      gsap.set(layer, { clearProps: 'opacity' });
      if (ok) gsap.set(ok, { clearProps: 'opacity,transform' });
      this._unmaskBugModalBehindThankYou();
    };

    gsap.to(layer, {
      opacity: 0,
      duration: fast ? 0.14 : 0.34,
      ease: fast ? 'power1.in' : 'power2.inOut',
      onComplete: done,
    });
  }

  /**
   * @param {string} text
   * @param {boolean} [isError]
   * @param {{ sending?: boolean }} [options]
   */
  setStatus(text, isError = false, options = {}) {
    const sending = options.sending === true;
    if (!this.statusEl) return;

    if (this.statusTextEl) {
      this.statusTextEl.textContent = text;
    } else {
      this.statusEl.textContent = text;
    }

    if (this.messageStage && this.messageOverlay) {
      if (sending) {
        this.messageStage.classList.add('bug-report-message-stage--sending');
        this.messageOverlay.removeAttribute('hidden');
        this.messageOverlay.setAttribute('aria-hidden', 'false');
      } else {
        this.messageStage.classList.remove('bug-report-message-stage--sending');
        this.messageOverlay.setAttribute('hidden', '');
        this.messageOverlay.setAttribute('aria-hidden', 'true');
      }
    }

    if (this.form) {
      if (sending) this.form.setAttribute('aria-busy', 'true');
      else this.form.removeAttribute('aria-busy');
    }

    if (sending) {
      this.statusEl.style.color = '';
    } else {
      this.statusEl.style.color = isError ? 'var(--danger, #f87171)' : 'var(--text-dim)';
    }
  }

  async submit() {
    if (!this.form || !this.submitBtn) return;

    const category = this.form.querySelector('#bugReportCategory')?.value ?? '';
    const severity = this.form.querySelector('input[name="severity"]')?.value?.trim() ?? '';
    const message = this.form.querySelector('#bugReportMessage')?.value?.trim() ?? '';

    if (!severity) {
      this.setStatus('Choose a severity level.', true);
      return;
    }
    if (!bugReportMessagePassesDetailBar(message)) {
      this.setStatus(
        `Add a bit more detail — at least ${MIN_BUG_MESSAGE_WORDS} words and ${MIN_BUG_MESSAGE_CHARS} characters. Steps to reproduce and browser/OS really help.`,
        true,
      );
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
    this.setStatus('', false, { sending: true });

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
        const raw = await res.text();
        let err = {};
        try {
          err = raw ? JSON.parse(raw) : {};
        } catch {
          err = {};
        }
        const detail = typeof err.detail === 'string' ? err.detail.trim() : '';
        let msg;
        if (detail) {
          msg = detail;
        } else if (res.status === 429) {
          const sec = typeof err.retryAfter === 'number' ? err.retryAfter : null;
          const short =
            sec != null && sec > 0
              ? `Wait a bit before trying again (about ${sec}s).`
              : 'Wait a bit before trying again.';
          msg = `You're submitting a little too often. ${short}`;
          this.ui.helpers.showToast(short, 5500);
        } else if ((res.status === 405 || res.status === 404) && apiUrl.startsWith('/')) {
          msg =
            'This site is static: add GitHub Actions variable BUG_REPORT_API_URL (your full Vercel URL ending in /api/bug-report), then redeploy.';
        } else if (res.status === 503) {
          msg = 'Issue reporting isn’t available (server not configured).';
        } else if (err.code === 'turnstile_failed' || err.code === 'turnstile_required') {
          msg = err.error || 'Security check failed. Try again.';
          this._resetTurnstile();
        } else if (typeof err.error === 'string' && err.error.trim() !== '') {
          msg = err.error.trim();
        } else if (raw && raw.length > 0 && raw.length < 500 && !raw.trim().startsWith('<')) {
          msg = raw.trim();
        } else if (res.status === 502) {
          msg =
            'Email send failed (502). In Vercel set RESEND_FROM to an address on a domain verified in Resend (not @proton.me), and ensure BUG_REPORT_TO / API key env vars apply to this deployment (Preview vs Production). Check Vercel → Logs for “Resend error”.';
        } else {
          msg = 'Could not submit. Try again later.';
        }
        this.setStatus(msg, true);
        this._sending = false;
        this.syncSendButton();
        return;
      }

      this._primeThankYouBackdropBehindModal();
      this.close(
        () => {
          this.thankYouLayer?.classList.remove('bug-report-thank-you-layer--under-modal');
          void this._playBugReportThankYou();
        },
        { preserveViewportBackdrop: true },
      );
    } catch {
      this.setStatus('Network error. Check your connection.', true);
      this._sending = false;
      this.syncSendButton();
    }
  }
}
