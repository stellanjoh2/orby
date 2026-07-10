/**
 * Issue report modal → POST /api/bug-report.
 * API URL: meta[name="orby-bug-report-api"] or "/api/bug-report"; Turnstile: meta orby-turnstile-site-key + server secret.
 */
import gsap from 'gsap';
import { bindBugReportListbox } from './bugReportListbox.js';
import { createBigMessageRevealTimeline, killBigMessageRevealTweens } from './bigMessageHeadlineReveal.js';
import { animateModalClose, animateModalOpen, prefersReducedMotion } from './modalReveal.js';

/** Minimum usable detail — keep in sync with api/bug-report.js */
const MIN_BUG_MESSAGE_WORDS = 5;

/** Keys that insert text or a newline in the bug message field (typewriter taps). */
function bugReportTypingKeyForTap(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key === 'Enter') return true;
  return e.key.length === 1;
}

function bugReportMessagePassesDetailBar(trimmed) {
  if (!trimmed) return false;
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

/** Fixed top-right Turnstile — eases in after widget render; out with modal close */
const TURNSTILE_HOST_REVEAL_FROM = { opacity: 0, y: -10, scale: 0.97 };
const TURNSTILE_HOST_REVEAL_DURATION = 0.38;
const TURNSTILE_HOST_EXIT_DURATION = 0.28;
const TURNSTILE_HOST_EXIT_AFTER_VERIFY_DELAY = 0.45;

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
    /** @type {gsap.core.Tween | null} */
    this._turnstileVerifyDelay = null;
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
    this.wordMeter = this.form.querySelector('#bugReportWordMeter');
    this.wordMeterFill = this.form.querySelector('#bugReportWordMeterFill');
    this.submitSendWrap = this.form.querySelector('#bugReportSubmitWrap');
    this.turnstileHost = document.getElementById('orby-turnstile-host');
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
    messageInput?.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (!bugReportTypingKeyForTap(e)) return;
      this.ui.uiSounds?.playBugReportTap();
    });
    this.severityCombo = this.form.querySelector('#bugReportSeverityCombo');
    this.severityTrigger = this.form.querySelector('#bugReportSeverityTrigger');
    this.severityListbox = this.form.querySelector('#bugReportSeverityListbox');
    this.severityHidden = this.form.querySelector('#bugReportSeverity');
    this.categoryCombo = this.form.querySelector('#bugReportCategoryCombo');
    this.categoryTrigger = this.form.querySelector('#bugReportCategoryTrigger');
    this.categoryListbox = this.form.querySelector('#bugReportCategoryListbox');
    this.categoryHidden = this.form.querySelector('#bugReportCategory');
    this._categoryListbox = bindBugReportListbox({
      comboEl: this.categoryCombo,
      triggerEl: this.categoryTrigger,
      listboxEl: this.categoryListbox,
      hiddenEl: this.categoryHidden,
      onOpen: () => this._closeSeverityListbox(),
      onChange: (value, prev) => {
        if (value !== prev) this.ui.uiSounds?.playSelect();
      },
      syncTrigger: (value) => {
        const opt = this.categoryListbox?.querySelector(
          `[role="option"][data-value="${CSS.escape(value)}"]`,
        );
        const textEl = this.categoryTrigger?.querySelector('.bug-report-combo-trigger-text');
        if (textEl && opt) textEl.textContent = opt.textContent?.replace(/\s+/g, ' ')?.trim() ?? '';
      },
    });
    this._severityListbox = bindBugReportListbox({
      comboEl: this.severityCombo,
      triggerEl: this.severityTrigger,
      listboxEl: this.severityListbox,
      hiddenEl: this.severityHidden,
      onOpen: () => this._categoryListbox.close(),
      onChange: (value, prev) => {
        if (value !== prev) this.ui.uiSounds?.playSelect();
        this.syncSendButton();
      },
      syncTrigger: (value) => this._syncSeverityTrigger(value),
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

    this.setStatus('');
    this.wordMeter?.setAttribute('aria-valuemax', String(MIN_BUG_MESSAGE_WORDS));
    this.syncSendButton();
  }

  _closeSeverityListbox() {
    this._severityListbox?.close();
  }

  _closeCategoryListbox() {
    this._categoryListbox?.close();
  }

  _closeBugReportListboxes() {
    this._closeSeverityListbox();
    this._closeCategoryListbox();
  }

  /** @param {string} value */
  _syncSeverityTrigger(value) {
    if (!value || !this.severityListbox) return;
    const opt = this.severityListbox.querySelector(`[role="option"][data-value="${CSS.escape(value)}"]`);
    const labelEl = opt?.querySelector('.bug-report-severity-label');
    const labelPlain = opt?.textContent?.replace(/\s+/g, ' ')?.trim() ?? '';
    if (this.severityTrigger) {
      const dot = this.severityTrigger.querySelector('.bug-report-severity-dot');
      if (dot) dot.setAttribute('data-severity', value);
      const textEl = this.severityTrigger.querySelector('.bug-report-severity-trigger-text');
      if (textEl) {
        if (labelEl) textEl.innerHTML = labelEl.innerHTML;
        else if (labelPlain) textEl.textContent = labelPlain;
      }
    }
  }

  syncSeverityFromHidden() {
    this._severityListbox?.sync();
  }

  syncCategoryFromHidden() {
    this._categoryListbox?.sync();
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

  _clearTurnstileVerifyDelay() {
    this._turnstileVerifyDelay?.kill();
    this._turnstileVerifyDelay = null;
  }

  _showTurnstileHost() {
    if (!this.turnstileHost) return;
    this._clearTurnstileVerifyDelay();
    gsap.killTweensOf(this.turnstileHost);
    this.turnstileHost.removeAttribute('hidden');
    this.turnstileHost.setAttribute('aria-hidden', 'false');
    gsap.set(this.turnstileHost, TURNSTILE_HOST_REVEAL_FROM);
  }

  _revealTurnstileHost() {
    const host = this.turnstileHost;
    if (!host || host.hasAttribute('hidden')) return;
    gsap.killTweensOf(host);
    if (prefersReducedMotion()) {
      gsap.set(host, { opacity: 1, y: 0, scale: 1, clearProps: 'transform' });
      host.style.pointerEvents = 'auto';
      return;
    }
    host.style.pointerEvents = 'auto';
    gsap.to(host, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: TURNSTILE_HOST_REVEAL_DURATION,
      ease: 'power2.out',
      clearProps: 'transform',
    });
  }

  _animateTurnstileHostOut() {
    const host = this.turnstileHost;
    if (!host || host.hasAttribute('hidden')) return;
    gsap.killTweensOf(host);
    if (prefersReducedMotion()) {
      gsap.set(host, { opacity: 0 });
      return;
    }
    gsap.to(host, {
      opacity: 0,
      y: -8,
      scale: 0.97,
      duration: TURNSTILE_HOST_EXIT_DURATION,
      ease: 'power2.in',
      onComplete: () => {
        host.style.pointerEvents = 'none';
      },
    });
  }

  _onTurnstileVerified() {
    this._clearTurnstileVerifyDelay();
    const delay = prefersReducedMotion() ? 0 : TURNSTILE_HOST_EXIT_AFTER_VERIFY_DELAY;
    this._turnstileVerifyDelay = gsap.delayedCall(delay, () => {
      this._turnstileVerifyDelay = null;
      this._animateTurnstileHostOut();
    });
  }

  _onTurnstileExpired() {
    this._revealTurnstileHost();
  }

  _turnstileRenderOptions() {
    return {
      sitekey: this._turnstileSiteKey,
      theme: 'auto',
      callback: () => this._onTurnstileVerified(),
      'expired-callback': () => this._onTurnstileExpired(),
    };
  }

  _hideTurnstileHost() {
    if (!this.turnstileHost) return;
    this._clearTurnstileVerifyDelay();
    gsap.killTweensOf(this.turnstileHost);
    this.turnstileHost.style.pointerEvents = '';
    this.turnstileHost.setAttribute('hidden', '');
    this.turnstileHost.setAttribute('aria-hidden', 'true');
    gsap.set(this.turnstileHost, { clearProps: 'opacity,transform' });
  }

  _clearTurnstileWidget() {
    if (this._turnstileWidgetId != null && typeof window.turnstile !== 'undefined') {
      try {
        window.turnstile.remove(this._turnstileWidgetId);
      } catch {
        /* ignore */
      }
    }
    this._turnstileWidgetId = null;
  }

  _removeTurnstileWidget() {
    this._clearTurnstileWidget();
    this._hideTurnstileHost();
  }

  _resetTurnstile() {
    if (this._turnstileWidgetId != null && typeof window.turnstile !== 'undefined') {
      try {
        window.turnstile.reset(this._turnstileWidgetId);
      } catch {
        /* ignore */
      }
    }
    this._revealTurnstileHost();
  }

  async _prepareTurnstileForOpen() {
    if (!this._turnstileSiteKey || !this.turnstileHost) return;
    this._showTurnstileHost();
    try {
      await this._ensureTurnstileScript();
    } catch {
      this.setStatus('Could not load security check. Try again or refresh.', true);
      return;
    }
    this._clearTurnstileWidget();
    try {
      this._turnstileWidgetId = window.turnstile.render(this.turnstileHost, this._turnstileRenderOptions());
      this._revealTurnstileHost();
    } catch {
      this.setStatus('Security check failed to start. Try again.', true);
    }
  }

  _syncBugReportWordMeter() {
    const track = this.wordMeter;
    const fill = this.wordMeterFill;
    if (!track || !fill || !this.form) return;
    const raw = this.form.querySelector('#bugReportMessage')?.value ?? '';
    const t = raw.trim();
    const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
    const denom = Math.max(MIN_BUG_MESSAGE_WORDS, 1);
    const p = Math.min(words / denom, 1);
    fill.style.width = `${p * 100}%`;
    const ready = words >= MIN_BUG_MESSAGE_WORDS;
    fill.classList.toggle('bug-report-word-meter-fill--complete', ready);
    track.setAttribute('aria-valuenow', String(Math.min(words, MIN_BUG_MESSAGE_WORDS)));
  }

  syncSendButton() {
    this._syncBugReportWordMeter();
    if (!this.submitBtn || !this.form) return;
    if (this._sending) {
      this.submitBtn.disabled = true;
      this.submitSendWrap?.removeAttribute('title');
      return;
    }
    const message = this.form.querySelector('#bugReportMessage')?.value?.trim() ?? '';
    const severity = this.form.querySelector('input[name="severity"]')?.value?.trim() ?? '';
    const detailOk = bugReportMessagePassesDetailBar(message);
    const valid = detailOk && Boolean(severity);
    this.submitBtn.disabled = !valid;
    if (this.submitSendWrap) {
      if (this.submitBtn.disabled && !detailOk) {
        this.submitSendWrap.title = 'Please write some more!';
      } else {
        this.submitSendWrap.removeAttribute('title');
      }
    }
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
    this.syncCategoryFromHidden();
    this.setStatus('');
    this._sending = false;
    this.syncSendButton();
  }

  /** Hide bug modal without wipe animation (runs after thank-you fade when the form was left open underneath). */
  _quietHideBugModal() {
    if (!this.modal || !this.form) return;
    if (!this.isOpen()) return;
    const panel = this.modal.querySelector('.load-settings-content');
    this._closeBugReportListboxes();
    gsap.killTweensOf([this.modal, panel].filter(Boolean));
    this.modal.style.display = 'none';
    if (panel) gsap.set(panel, { clearProps: 'clipPath,transform' });
    gsap.set(this.modal, { clearProps: 'clipPath,transform' });
    this._resetBugModalAfterClose();
  }

  open() {
    if (!this.modal) return;
    /* Blur eases in with the panel — same as message / replace-asset confirm (no backdrop wipe). */
    this.ui?.uiSounds?.playShelfShow();
    this._teardownBugReportThankYouQuiet();
    this.ui?.beginShelfOverlaySuppression?.();
    this._sending = false;
    this._bugBackdropDown = false;
    this.setStatus('');
    this._closeBugReportListboxes();
    const panel = this.modal.querySelector('.load-settings-content');
    void animateModalOpen(this.modal, panel, { revealBackdrop: false }).then(() => {
      const messageEl = this.form?.querySelector('#bugReportMessage');
      messageEl?.focus();
    });
    void this._prepareTurnstileForOpen();
    this.syncSendButton();
  }

  /**
   * @param {() => void} [onAfterCleanup] runs after modal is hidden
   * @param {{ preserveViewportBackdrop?: boolean, skipShelfHideSound?: boolean }} [opts] keep full-modal dim scrim until hidden (thank-you path); skip shelf-hide SFX when transitioning to thank-you (tap + notification only)
   */
  close(onAfterCleanup, opts = {}) {
    if (!this.modal || !this.form) return;
    if (this.modal.style.display === 'none') return;
    /* Same “down” clip as podium / shelf hide — omit on success→thank-you so we don’t stack with notification. */
    if (!opts.skipShelfHideSound) this.ui?.uiSounds?.playShelfHide();
    this._closeBugReportListboxes();
    this._animateTurnstileHostOut();
    const panel = this.modal.querySelector('.load-settings-content');
    const preserveBackdrop = opts.preserveViewportBackdrop === true;
    animateModalClose(
      this.modal,
      panel,
      () => {
        this._resetBugModalAfterClose();
        this.ui?.endShelfOverlaySuppression?.();
        if (typeof onAfterCleanup === 'function') queueMicrotask(() => onAfterCleanup());
      },
      preserveBackdrop,
      { revealBackdrop: false },
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
    killBigMessageRevealTweens(this.thankYouMessageEl, [this.thankYouOkBtn]);
    this.thankYouLayer.removeAttribute('aria-label');
    this.thankYouMessageEl.textContent = '';
    this.thankYouMessageEl.removeAttribute('aria-hidden');
    this.thankYouLayer.setAttribute('hidden', '');
    this.thankYouLayer.style.display = '';
    this.thankYouLayer.setAttribute('aria-hidden', 'true');
    gsap.set(this.thankYouMessageEl, { clearProps: 'all' });
    gsap.set(this.thankYouLayer, { clearProps: 'opacity' });
    if (this.thankYouOkBtn) gsap.set(this.thankYouOkBtn, { clearProps: 'opacity,transform' });
    this.ui.endShelfOverlaySuppression?.();
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
    killBigMessageRevealTweens(msg, [ok]);
    if (!skipBackdropReveal) gsap.killTweensOf(layer);

    msg.innerHTML = `${escapeHtmlMinimal(BUG_REPORT_THANK_YOU_PREFIX)}<span class="brand-highlight">${escapeHtmlMinimal(BUG_REPORT_THANK_YOU_ACCENT_TAIL)}</span>`;
    msg.removeAttribute('aria-hidden');
    layer.setAttribute('aria-label', BUG_REPORT_THANK_YOU_FULL_TEXT);

    layer.removeAttribute('hidden');
    layer.style.display = 'flex';
    layer.setAttribute('aria-hidden', 'false');

    this.ui.beginShelfOverlaySuppression?.();

    if (prefersReducedMotion()) {
      gsap.killTweensOf(layer);
      gsap.set(layer, { opacity: 1 });
      createBigMessageRevealTimeline(msg, [ok]);
      return;
    }

    if (skipBackdropReveal) {
      gsap.set(layer, { opacity: 1 });
      createBigMessageRevealTimeline(msg, [ok]);
      return;
    }

    gsap.set(layer, { opacity: 0 });
    const contentTl = createBigMessageRevealTimeline(msg, [ok]);
    gsap
      .timeline()
      .to(layer, { opacity: 1, duration: THANK_YOU_SCRIM_IN, ease: 'power2.out' })
      .add(contentTl, `-=${Math.min(0.1, THANK_YOU_SCRIM_IN * 0.45)}`);
  }

  _dismissBugReportThankYou() {
    const layer = this.thankYouLayer;
    const msg = this.thankYouMessageEl;
    const ok = this.thankYouOkBtn;
    if (!layer?.isConnected) return;

    gsap.killTweensOf([layer, msg, ok]);
    killBigMessageRevealTweens(msg, [ok]);

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
      this.ui.endShelfOverlaySuppression?.();
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
        `Add a bit more detail — at least ${MIN_BUG_MESSAGE_WORDS} words. Steps to reproduce and browser/OS really help.`,
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
        this.setStatus('Complete the security check in the top-right corner.', true);
        return;
      }
    }

    this._sending = true;
    this.syncSendButton();
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
        { preserveViewportBackdrop: true, skipShelfHideSound: true },
      );
    } catch {
      this.setStatus('Network error. Check your connection.', true);
      this._sending = false;
      this.syncSendButton();
    }
  }
}
