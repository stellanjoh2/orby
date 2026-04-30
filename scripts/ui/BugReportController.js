/**
 * Simple bug report modal → POST to serverless (see /api/bug-report.js).
 * API URL: meta[name="orby-bug-report-api"] content, or "/api/bug-report".
 */
export class BugReportController {
  /**
   * @param {import('./UIManager.js').UIManager} ui
   */
  constructor(ui) {
    this.ui = ui;
  }

  init() {
    this.modal = document.querySelector('#bugReportModal');
    this.form = document.querySelector('#bugReportForm');
    if (!this.modal || !this.form) return;

    this.openBtn = document.querySelector('#openBugReport');
    this.closeBtn = document.querySelector('#closeBugReport');
    this.cancelBtn = document.querySelector('#cancelBugReport');
    this.submitBtn = document.querySelector('#submitBugReport');
    this.honeypot = this.form.querySelector('input[name="honeypot"]');
    this.statusEl = this.modal.querySelector('.bug-report-status');

    this.openBtn?.addEventListener('click', () => this.open());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.cancelBtn?.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
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
    this.setStatus('');
    this.modal.style.display = 'flex';
    const subject = this.form?.querySelector('#bugReportSubject');
    subject?.focus();
  }

  close() {
    if (!this.modal || !this.form) return;
    this.modal.style.display = 'none';
    this.form.reset();
    this.setStatus('');
    if (this.submitBtn) this.submitBtn.disabled = false;
  }

  setStatus(text, isError = false) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.style.color = isError ? 'var(--danger, #f87171)' : 'var(--text-dim)';
  }

  async submit() {
    if (!this.form || !this.submitBtn) return;

    const subject = this.form.querySelector('#bugReportSubject')?.value?.trim() ?? '';
    const category = this.form.querySelector('#bugReportCategory')?.value ?? '';
    const message = this.form.querySelector('#bugReportMessage')?.value?.trim() ?? '';

    if (!subject) {
      this.setStatus('Please add a short subject.', true);
      return;
    }
    if (message.length < 8) {
      this.setStatus('Please describe the issue in a bit more detail.', true);
      return;
    }

    this.submitBtn.disabled = true;
    this.setStatus('Sending…');

    const apiUrl = this.getApiUrl();

    const payload = {
      subject,
      category,
      message,
      honeypot: this.honeypot?.value ?? '',
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
        if ((res.status === 405 || res.status === 404) && apiUrl.startsWith('/')) {
          msg =
            'This site is static: add GitHub Actions variable BUG_REPORT_API_URL (your full Vercel URL ending in /api/bug-report), then redeploy.';
        } else if (res.status === 503) {
          msg = 'Reporting is not available (server not configured).';
        } else {
          msg = err.error || 'Could not send report. Try again later.';
        }
        this.setStatus(msg, true);
        this.submitBtn.disabled = false;
        return;
      }

      this.close();
      this.ui.helpers.showToast('Thanks — report sent.');
    } catch {
      this.setStatus('Network error. Check your connection.', true);
      this.submitBtn.disabled = false;
    }
  }
}
