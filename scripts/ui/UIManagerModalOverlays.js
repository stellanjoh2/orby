/**
 * Message modal (#messageAlertModal), fullscreen confirm (#orbyFullscreenPrompt), and related bindings.
 * Keeps DOM wiring out of UIManager.
 */
import { gsap } from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

import { animateModalOpen, prefersReducedMotion, snapModalHidden } from './modalReveal.js';
import {
  createBigMessageRevealTimeline,
  killBigMessageRevealTweens,
} from './bigMessageHeadlineReveal.js';
import { setOrbyPillButtonLabel, setOrbyPillButtonVariant } from './orbyPillButton.js';

/** Full-screen prompt — match BugReportController thank-you scrim */
const ORBY_FULLSCREEN_SCRIM_IN = 0.22;

export class UIManagerModalOverlays {
  /**
   * @param {import('./UIManager.js').UIManager} ui
   */
  constructor(ui) {
    this._ui = ui;
    this._messageAlertKeydownHandler = null;
    this._messageAlertPendingConfirm = false;
    this._messageAlertOnConfirm = null;
    this._messageAlertOnCancel = null;
    this._fullscreenPromptKeydownHandler = null;
    this._fullscreenPromptOnConfirm = null;
    this._fullscreenPromptOnCancel = null;
  }

  bind() {
    this._bindMessageAlert();
    this._bindFullscreenPrompt();
    this._bindHomeOrbyMark();
    this._bindModalTapSounds();
  }

  getMessageAlertPanel() {
    return this._ui.dom.messageAlertModal?.querySelector('.message-alert-content');
  }

  /**
   * Modal with OK — for long errors/warnings that need time to read.
   * @param {{ okLabel?: string, confirm?: boolean, cancelLabel?: string, onConfirm?: () => void, onCancel?: () => void }} [options]
   */
  showMessageAlert(message, title = 'Message', options = {}) {
    if (!this._ui.dom.messageAlertModal || !this._ui.dom.messageAlertBody) return;

    this._ui.uiSounds?.playShelfShow();

    const text = typeof message === 'string' ? message : String(message ?? '');
    const confirm = !!options?.confirm;
    this._messageAlertPendingConfirm = confirm;
    this._messageAlertOnConfirm = typeof options?.onConfirm === 'function' ? options.onConfirm : null;
    this._messageAlertOnCancel = typeof options?.onCancel === 'function' ? options.onCancel : null;

    const okLabel = confirm
      ? typeof options?.okLabel === 'string' && options.okLabel.trim()
        ? options.okLabel.trim()
        : 'Yes'
      : typeof options?.okLabel === 'string' && options.okLabel.trim()
        ? options.okLabel.trim()
        : 'OK';

    const cancelLabel =
      typeof options?.cancelLabel === 'string' && options.cancelLabel.trim()
        ? options.cancelLabel.trim()
        : 'No';

    if (this._ui.dom.messageAlertTitle) {
      this._ui.dom.messageAlertTitle.textContent = title;
    }
    this._ui.dom.messageAlertBody.textContent = text;

    if (this._ui.dom.messageAlertOk) {
      this._ui.dom.messageAlertOk.textContent = okLabel;
    }
    if (this._ui.dom.messageAlertCancel) {
      this._ui.dom.messageAlertCancel.hidden = !confirm;
      this._ui.dom.messageAlertCancel.textContent = cancelLabel;
    }

    const wide = !confirm && okLabel !== 'OK';
    this._ui.dom.messageAlertActions?.classList.toggle('message-alert-actions--wide', wide);

    if (this._messageAlertKeydownHandler) {
      document.removeEventListener('keydown', this._messageAlertKeydownHandler, true);
      this._messageAlertKeydownHandler = null;
    }
    this._messageAlertKeydownHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this._messageAlertBackdropClose();
      }
    };
    document.addEventListener('keydown', this._messageAlertKeydownHandler, true);

    void animateModalOpen(this._ui.dom.messageAlertModal, this.getMessageAlertPanel(), {
      revealBackdrop: false,
    }).then(() => {
      if (confirm) {
        this._ui.dom.messageAlertCancel?.focus();
      } else {
        this._ui.dom.messageAlertOk?.focus();
      }
    });
  }

  /**
   * Full-screen confirm — same visual language as bug-report thank-you.
   * @param {{ messageHtml: string, cancelLabel?: string, confirmLabel?: string, confirmVariant?: 'ghost' | 'accent' | 'glow', onConfirm?: () => void, onCancel?: () => void }} opts
   */
  showFullscreenPrompt(opts) {
    const layer = this._ui.dom.fullscreenPrompt;
    const msg = this._ui.dom.fullscreenPromptMessage;
    const noBtn = this._ui.dom.fullscreenPromptNo;
    const yesBtn = this._ui.dom.fullscreenPromptYes;
    if (!layer || !msg || !noBtn || !yesBtn) return;

    this._ui.uiSounds?.playShelfShow();

    const messageHtml = typeof opts?.messageHtml === 'string' ? opts.messageHtml : '';
    const cancelLabel =
      typeof opts?.cancelLabel === 'string' && opts.cancelLabel.trim() ? opts.cancelLabel.trim() : 'No';
    const confirmLabel =
      typeof opts?.confirmLabel === 'string' && opts.confirmLabel.trim()
        ? opts.confirmLabel.trim()
        : 'Yes';

    this._fullscreenPromptOnConfirm = typeof opts?.onConfirm === 'function' ? opts.onConfirm : null;
    this._fullscreenPromptOnCancel = typeof opts?.onCancel === 'function' ? opts.onCancel : null;

    this._removeFullscreenPromptKeydown();
    this._fullscreenPromptKeydownHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this._dismissFullscreenPrompt('cancel');
      }
    };
    document.addEventListener('keydown', this._fullscreenPromptKeydownHandler, true);

    msg.innerHTML = messageHtml;
    msg.removeAttribute('aria-hidden');
    setOrbyPillButtonLabel(noBtn, cancelLabel);
    setOrbyPillButtonLabel(yesBtn, confirmLabel);
    const confirmAccent = opts?.confirmVariant !== 'ghost';
    setOrbyPillButtonVariant(yesBtn, confirmAccent ? 'accent' : 'ghost');

    const plain = msg.textContent?.trim() ?? '';
    if (plain) layer.setAttribute('aria-label', plain);

    this._ui.beginShelfOverlaySuppression();
    this._openFullscreenPromptAnimate();

    requestAnimationFrame(() => {
      const focusTarget =
        getComputedStyle(noBtn).display === 'none' || noBtn.hidden ? yesBtn : noBtn;
      focusTarget?.focus();
    });
  }

  _bindMessageAlert() {
    const modal = this._ui.dom.messageAlertModal;
    if (!modal) return;

    this._ui.dom.messageAlertOk?.addEventListener('click', () => this._messageAlertPrimaryClose());
    this._ui.dom.messageAlertCancel?.addEventListener('click', () => this._messageAlertCancelClose());
    this._ui.dom.messageAlertClose?.addEventListener('click', () => this._messageAlertHeaderClose());
    modal.addEventListener('click', (event) => {
      if (event.target !== modal) return;
      this._messageAlertBackdropClose();
    });
  }

  _messageAlertPrimaryClose() {
    this._messageAlertOnConfirm?.();
    this._messageAlertCleanupAndClose();
  }

  _messageAlertCancelClose() {
    this._messageAlertOnCancel?.();
    this._messageAlertCleanupAndClose();
  }

  _messageAlertHeaderClose() {
    if (this._messageAlertPendingConfirm) {
      this._messageAlertOnCancel?.();
    }
    this._messageAlertCleanupAndClose();
  }

  _messageAlertBackdropClose() {
    this._messageAlertHeaderClose();
  }

  _messageAlertCleanupAndClose() {
    if (this._messageAlertKeydownHandler) {
      document.removeEventListener('keydown', this._messageAlertKeydownHandler, true);
      this._messageAlertKeydownHandler = null;
    }
    this._messageAlertPendingConfirm = false;
    this._messageAlertOnConfirm = null;
    this._messageAlertOnCancel = null;
    const modal = this._ui.dom.messageAlertModal;
    if (modal) snapModalHidden(modal, this.getMessageAlertPanel());
  }

  _bindFullscreenPrompt() {
    const layer = this._ui.dom.fullscreenPrompt;
    const stack = this._ui.dom.fullscreenPromptStack;
    if (!layer) return;

    stack?.addEventListener('click', (e) => e.stopPropagation());
    layer.addEventListener('click', () => this._dismissFullscreenPrompt('cancel'));
    this._ui.dom.fullscreenPromptNo?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dismissFullscreenPrompt('cancel');
    });
    this._ui.dom.fullscreenPromptYes?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dismissFullscreenPrompt('confirm');
    });
  }

  _removeFullscreenPromptKeydown() {
    if (this._fullscreenPromptKeydownHandler) {
      document.removeEventListener('keydown', this._fullscreenPromptKeydownHandler, true);
      this._fullscreenPromptKeydownHandler = null;
    }
  }

  _openFullscreenPromptAnimate() {
    const layer = this._ui.dom.fullscreenPrompt;
    const msg = this._ui.dom.fullscreenPromptMessage;
    const noBtn = this._ui.dom.fullscreenPromptNo;
    const yesBtn = this._ui.dom.fullscreenPromptYes;
    if (!layer || !msg || !noBtn || !yesBtn) return;

    gsap.killTweensOf([layer, msg, noBtn, yesBtn]);
    killBigMessageRevealTweens(msg, [noBtn, yesBtn]);

    layer.removeAttribute('hidden');
    layer.style.display = 'flex';
    layer.setAttribute('aria-hidden', 'false');

    if (prefersReducedMotion()) {
      gsap.killTweensOf(layer);
      gsap.set(layer, { opacity: 1 });
      createBigMessageRevealTimeline(msg, [noBtn, yesBtn]);
      return;
    }

    gsap.set(layer, { opacity: 0 });
    const contentTl = createBigMessageRevealTimeline(msg, [noBtn, yesBtn]);
    gsap
      .timeline()
      .to(layer, { opacity: 1, duration: ORBY_FULLSCREEN_SCRIM_IN, ease: 'power2.out' })
      .add(contentTl, `-=${Math.min(0.1, ORBY_FULLSCREEN_SCRIM_IN * 0.45)}`);
  }

  /**
   * @param {'confirm' | 'cancel'} result
   */
  _dismissFullscreenPrompt(result) {
    const layer = this._ui.dom.fullscreenPrompt;
    const msg = this._ui.dom.fullscreenPromptMessage;
    const noBtn = this._ui.dom.fullscreenPromptNo;
    const yesBtn = this._ui.dom.fullscreenPromptYes;
    if (!layer?.isConnected) return;

    this._ui.uiSounds?.playShelfHide();

    gsap.killTweensOf([layer, msg, noBtn, yesBtn].filter(Boolean));
    killBigMessageRevealTweens(msg, [noBtn, yesBtn]);

    const fast = prefersReducedMotion();
    const done = () => {
      this._removeFullscreenPromptKeydown();
      if (result === 'confirm') {
        this._fullscreenPromptOnConfirm?.();
      } else {
        this._fullscreenPromptOnCancel?.();
      }
      this._fullscreenPromptOnConfirm = null;
      this._fullscreenPromptOnCancel = null;

      layer.removeAttribute('aria-label');
      layer.setAttribute('hidden', '');
      layer.style.display = '';
      layer.setAttribute('aria-hidden', 'true');
      msg.innerHTML = '';
      msg.removeAttribute('aria-hidden');
      gsap.set(msg, { clearProps: 'all' });
      gsap.set(layer, { clearProps: 'opacity' });
      if (noBtn) gsap.set(noBtn, { clearProps: 'opacity,transform' });
      if (yesBtn) {
        gsap.set(yesBtn, { clearProps: 'opacity,transform' });
        setOrbyPillButtonVariant(yesBtn, 'ghost');
      }
      this._ui.endShelfOverlaySuppression();
    };

    gsap.to(layer, {
      opacity: 0,
      duration: fast ? 0.14 : 0.34,
      ease: fast ? 'power1.in' : 'power2.inOut',
      onComplete: done,
    });
  }

  /** Random tap clips on primary buttons inside clip-path / fullscreen-style modals. */
  _bindModalTapSounds() {
    const selectors = [
      '#messageAlertModal',
      '#loadSceneSettingsModal',
      '#bugReportModal',
      '#orbyFullscreenPrompt',
    ];
    for (const sel of selectors) {
      const modal = document.querySelector(sel);
      if (!modal) continue;
      modal.addEventListener(
        'click',
        (e) => {
          const t = e.target;
          if (!(t instanceof Element)) return;
          const btn = t.closest('button');
          if (!btn || !modal.contains(btn)) return;
          if (btn.disabled || btn.hasAttribute('disabled')) return;
          this._ui.uiSounds?.playSelect();
        },
        true,
      );
    }
  }

  _bindHomeOrbyMark() {
    this._ui.dom.shelf?.addEventListener('click', (event) => {
      const trigger = event.target.closest('.info-orby-mark');
      if (!trigger) return;
      event.preventDefault();
      this._ui.showFullscreenPrompt({
        messageHtml:
          '<span class="brand-highlight">Return home?</span> This ends your session and resets the studio.',
        cancelLabel: 'Stay',
        confirmLabel: 'Go Home',
        onConfirm: () => {
          void this._ui.returnToHome();
        },
      });
    });
  }
}
