/**
 * Embedded issue report on the Support page — POST /api/bug-report.
 * API: meta[name="orby-bug-report-api"]; Turnstile: meta orby-turnstile-site-key.
 */
import { bindBugReportListbox } from '../scripts/ui/bugReportListbox.js';

const MIN_BUG_MESSAGE_WORDS = 5;

function messagePassesDetailBar(trimmed) {
  if (!trimmed) return false;
  return trimmed.split(/\s+/).filter(Boolean).length >= MIN_BUG_MESSAGE_WORDS;
}

function getApiUrl() {
  const raw = document.querySelector('meta[name="orby-bug-report-api"]')?.getAttribute('content');
  const t = typeof raw === 'string' ? raw.trim() : '';
  return t || '/api/bug-report';
}

function initSupportBugReport() {
  const root = document.querySelector('[data-support-bug-report]');
  const form = document.querySelector('#supportBugReportForm');
  if (!root || !form) return;

  const siteRaw = document.querySelector('meta[name="orby-turnstile-site-key"]')?.getAttribute('content');
  const turnstileSiteKey = typeof siteRaw === 'string' ? siteRaw.trim() : '';

  const submitBtn = document.querySelector('#supportSubmitBugReport');
  const honeypot = form.querySelector('input[name="honeypot"]');
  const statusEl = root.querySelector('.bug-report-status');
  const statusTextEl = root.querySelector('.bug-report-status-text');
  const messageStage = form.querySelector('.bug-report-message-stage');
  const messageOverlay = form.querySelector('.bug-report-message-sending-overlay');
  const wordMeter = form.querySelector('#supportBugReportWordMeter');
  const wordMeterFill = form.querySelector('#supportBugReportWordMeterFill');
  const submitWrap = form.querySelector('#supportBugReportSubmitWrap');
  const turnstileHost = document.getElementById('orby-turnstile-host');
  const thankYouEl = document.querySelector('#supportBugReportThankYou');
  const formPanel = document.querySelector('#supportBugReportPanel');

  const categoryCombo = form.querySelector('#supportBugReportCategoryCombo');
  const categoryTrigger = form.querySelector('#supportBugReportCategoryTrigger');
  const categoryListbox = form.querySelector('#supportBugReportCategoryListbox');
  const categoryHidden = form.querySelector('#supportBugReportCategory');

  const severityCombo = form.querySelector('#supportBugReportSeverityCombo');
  const severityTrigger = form.querySelector('#supportBugReportSeverityTrigger');
  const severityListbox = form.querySelector('#supportBugReportSeverityListbox');
  const severityHidden = form.querySelector('#supportBugReportSeverity');

  let sending = false;
  let turnstileWidgetId = null;
  let turnstileScriptPromise = null;
  let categoryListboxApi = null;
  let severityListboxApi = null;

  function setStatus(text, isError = false, options = {}) {
    const sendingNow = options.sending === true;
    if (statusTextEl) statusTextEl.textContent = text;
    else if (statusEl) statusEl.textContent = text;

    if (messageStage && messageOverlay) {
      if (sendingNow) {
        messageStage.classList.add('bug-report-message-stage--sending');
        messageOverlay.removeAttribute('hidden');
        messageOverlay.setAttribute('aria-hidden', 'false');
      } else {
        messageStage.classList.remove('bug-report-message-stage--sending');
        messageOverlay.setAttribute('hidden', '');
        messageOverlay.setAttribute('aria-hidden', 'true');
      }
    }

    if (sendingNow) form.setAttribute('aria-busy', 'true');
    else form.removeAttribute('aria-busy');

    if (statusEl) {
      statusEl.style.color = sendingNow ? '' : isError ? '#f87171' : 'var(--legal-muted)';
    }
  }

  function syncWordMeter() {
    if (!wordMeter || !wordMeterFill) return;
    const raw = form.querySelector('#supportBugReportMessage')?.value ?? '';
    const words = raw.trim() ? raw.trim().split(/\s+/).filter(Boolean).length : 0;
    const p = Math.min(words / MIN_BUG_MESSAGE_WORDS, 1);
    wordMeterFill.style.width = `${p * 100}%`;
    wordMeterFill.classList.toggle('bug-report-word-meter-fill--complete', words >= MIN_BUG_MESSAGE_WORDS);
    wordMeter.setAttribute('aria-valuenow', String(Math.min(words, MIN_BUG_MESSAGE_WORDS)));
  }

  function syncSendButton() {
    syncWordMeter();
    if (!submitBtn) return;
    if (sending) {
      submitBtn.disabled = true;
      submitWrap?.removeAttribute('title');
      return;
    }
    const message = form.querySelector('#supportBugReportMessage')?.value?.trim() ?? '';
    const severity = form.querySelector('input[name="severity"]')?.value?.trim() ?? '';
    const detailOk = messagePassesDetailBar(message);
    submitBtn.disabled = !(detailOk && severity);
    if (submitWrap) {
      if (submitBtn.disabled && !detailOk) submitWrap.title = 'Please write some more!';
      else submitWrap.removeAttribute('title');
    }
  }

  function closeBugReportListboxes() {
    categoryListboxApi?.close();
    severityListboxApi?.close();
  }

  function syncCategoryFromHidden(value) {
    const opt = categoryListbox?.querySelector(`[role="option"][data-value="${CSS.escape(value)}"]`);
    const textEl = categoryTrigger?.querySelector('.bug-report-combo-trigger-text');
    if (textEl) textEl.textContent = opt?.textContent?.replace(/\s+/g, ' ')?.trim() ?? value;
  }

  function syncSeverityFromHidden(value) {
    const opt = severityListbox?.querySelector(`[role="option"][data-value="${CSS.escape(value)}"]`);
    const labelEl = opt?.querySelector('.bug-report-severity-label');
    if (severityTrigger) {
      const dot = severityTrigger.querySelector('.bug-report-severity-dot');
      if (dot) dot.setAttribute('data-severity', value);
      const textEl = severityTrigger.querySelector('.bug-report-severity-trigger-text');
      if (textEl) {
        if (labelEl) textEl.innerHTML = labelEl.innerHTML;
        else textEl.textContent = opt?.textContent?.replace(/\s+/g, ' ')?.trim() ?? value;
      }
    }
  }

  function bindBugReportCombos() {
    categoryListboxApi = bindBugReportListbox({
      comboEl: categoryCombo,
      triggerEl: categoryTrigger,
      listboxEl: categoryListbox,
      hiddenEl: categoryHidden,
      syncTrigger: syncCategoryFromHidden,
      onOpen: () => severityListboxApi?.close(),
    });

    severityListboxApi = bindBugReportListbox({
      comboEl: severityCombo,
      triggerEl: severityTrigger,
      listboxEl: severityListbox,
      hiddenEl: severityHidden,
      syncTrigger: syncSeverityFromHidden,
      onChange: () => syncSendButton(),
      onOpen: () => categoryListboxApi?.close(),
    });

    categoryListboxApi.sync();
    severityListboxApi.sync();
  }

  async function ensureTurnstileScript() {
    if (typeof window.turnstile !== 'undefined') return Promise.resolve();
    if (turnstileScriptPromise) return turnstileScriptPromise;
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('turnstile script'));
      document.head.appendChild(s);
    });
    return turnstileScriptPromise;
  }

  function removeTurnstileWidget() {
    if (turnstileWidgetId != null && typeof window.turnstile !== 'undefined') {
      try {
        window.turnstile.remove(turnstileWidgetId);
      } catch {
        /* ignore */
      }
    }
    turnstileWidgetId = null;
  }

  function fadeTurnstileHostOut() {
    if (!turnstileHost) return;
    window.setTimeout(
      () => turnstileHost?.classList.add('orby-turnstile-host--faded'),
      2450,
    );
  }

  function revealTurnstileHost() {
    turnstileHost?.classList.remove('orby-turnstile-host--faded');
  }

  function resetTurnstile() {
    if (turnstileWidgetId != null && typeof window.turnstile !== 'undefined') {
      try {
        window.turnstile.reset(turnstileWidgetId);
      } catch {
        /* ignore */
      }
    }
    revealTurnstileHost();
  }

  async function prepareTurnstile() {
    if (!turnstileSiteKey || !turnstileHost) return;
    revealTurnstileHost();
    try {
      await ensureTurnstileScript();
    } catch {
      setStatus('Could not load security check. Try again or refresh.', true);
      return;
    }
    removeTurnstileWidget();
    try {
      turnstileWidgetId = window.turnstile.render(turnstileHost, {
        sitekey: turnstileSiteKey,
        theme: 'auto',
        callback: () => fadeTurnstileHostOut(),
        'expired-callback': () => revealTurnstileHost(),
      });
    } catch {
      setStatus('Security check failed to start. Try again.', true);
    }
  }

  function showThankYou() {
    thankYouEl?.removeAttribute('hidden');
    formPanel?.setAttribute('hidden', '');
    thankYouEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function submit() {
    const category = form.querySelector('#supportBugReportCategory')?.value ?? '';
    const severity = form.querySelector('input[name="severity"]')?.value?.trim() ?? '';
    const message = form.querySelector('#supportBugReportMessage')?.value?.trim() ?? '';

    if (!severity) {
      setStatus('Choose a severity level.', true);
      return;
    }
    if (!messagePassesDetailBar(message)) {
      setStatus(
        `Add a bit more detail — at least ${MIN_BUG_MESSAGE_WORDS} words. Steps to reproduce and browser/OS really help.`,
        true,
      );
      return;
    }

    let turnstileToken = '';
    if (turnstileSiteKey) {
      if (typeof window.turnstile === 'undefined' || turnstileWidgetId == null) {
        setStatus('Security check is still loading. Wait a moment.', true);
        return;
      }
      turnstileToken = window.turnstile.getResponse(turnstileWidgetId) || '';
      if (!turnstileToken) {
        setStatus('Complete the security check in the top-right corner.', true);
        return;
      }
    }

    sending = true;
    syncSendButton();
    setStatus('', false, { sending: true });

    const apiUrl = getApiUrl();
    const payload = {
      category,
      severity,
      message,
      honeypot: honeypot?.value ?? '',
      turnstileToken,
      source: 'support-page',
    };

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 204 || res.ok) {
        showThankYou();
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
          msg =
            sec != null && sec > 0
              ? `You're submitting a little too often. Wait about ${sec}s.`
              : "You're submitting a little too often. Wait a bit before trying again.";
        } else if ((res.status === 405 || res.status === 404) && apiUrl.startsWith('/')) {
          msg =
            'This site is static: add GitHub Actions variable BUG_REPORT_API_URL (your full Vercel URL ending in /api/bug-report), then redeploy.';
        } else if (res.status === 503) {
          msg = "Issue reporting isn't available (server not configured).";
        } else if (err.code === 'turnstile_failed' || err.code === 'turnstile_required') {
          msg = err.error || 'Security check failed. Try again.';
          resetTurnstile();
        } else if (typeof err.error === 'string' && err.error.trim() !== '') {
          msg = err.error.trim();
        } else {
          msg = 'Could not submit. Try again later.';
        }
        setStatus(msg, true);
        sending = false;
        syncSendButton();
        return;
      }
    } catch {
      setStatus('Network error. Check your connection.', true);
      sending = false;
      syncSendButton();
    }
  }

  const messageInput = form.querySelector('#supportBugReportMessage');
  for (const ev of ['input', 'change']) {
    messageInput?.addEventListener(ev, () => syncSendButton());
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  bindBugReportCombos();
  wordMeter?.setAttribute('aria-valuemax', String(MIN_BUG_MESSAGE_WORDS));
  syncSendButton();
  void prepareTurnstile();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSupportBugReport);
} else {
  initSupportBugReport();
}
