/**
 * Shared Category / Severity combobox for bug-report forms.
 * @param {{
 *   comboEl: HTMLElement | null;
 *   triggerEl: HTMLButtonElement | null;
 *   listboxEl: HTMLElement | null;
 *   hiddenEl: HTMLInputElement | null;
 *   syncTrigger: (value: string) => void;
 *   onChange?: (value: string, prev: string) => void;
 *   onOpen?: () => void;
 * }} opts
 */
export function bindBugReportListbox(opts) {
  const { comboEl, triggerEl, listboxEl, hiddenEl, syncTrigger, onChange, onOpen } = opts;
  if (!comboEl || !triggerEl || !listboxEl || !hiddenEl) return { close: () => {}, sync: () => {} };

  let docCapture = false;

  function syncFromHidden() {
    const v = hiddenEl.value?.trim() ?? '';
    if (!v) return;
    syncTrigger(v);
    listboxEl.querySelectorAll('[role="option"]').forEach((el) => {
      el.setAttribute('aria-selected', el.getAttribute('data-value') === v ? 'true' : 'false');
    });
  }

  function closeListbox() {
    listboxEl.hidden = true;
    triggerEl.setAttribute('aria-expanded', 'false');
    if (docCapture) {
      document.removeEventListener('pointerdown', onDocPointer, true);
      docCapture = false;
    }
  }

  function openListbox() {
    onOpen?.();
    listboxEl.hidden = false;
    triggerEl.setAttribute('aria-expanded', 'true');
    if (!docCapture) {
      document.addEventListener('pointerdown', onDocPointer, true);
      docCapture = true;
    }
    queueMicrotask(() => listboxEl.focus());
  }

  /** @param {Event} e */
  function onDocPointer(e) {
    if (!(e.target instanceof Node)) return;
    if (comboEl.contains(e.target)) return;
    closeListbox();
  }

  function setValue(value) {
    if (!value) return;
    const prev = hiddenEl.value;
    if (value !== prev) onChange?.(value, prev);
    hiddenEl.value = value;
    syncFromHidden();
  }

  triggerEl.addEventListener('click', () => {
    const open = triggerEl.getAttribute('aria-expanded') === 'true';
    if (open) closeListbox();
    else openListbox();
  });

  triggerEl.addEventListener('keydown', (e) => {
    const open = triggerEl.getAttribute('aria-expanded') === 'true';
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      closeListbox();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !open) {
      e.preventDefault();
      openListbox();
    }
  });

  listboxEl.addEventListener('click', (e) => {
    const li = e.target?.closest?.('[role="option"]');
    const val = li?.getAttribute?.('data-value');
    if (!val) return;
    setValue(val);
    closeListbox();
    triggerEl.focus();
  });

  listboxEl.addEventListener('keydown', (e) => {
    const opts = [...listboxEl.querySelectorAll('[role="option"]')];
    let ix = opts.findIndex((o) => o.getAttribute('data-value') === hiddenEl.value);
    if (ix < 0) ix = 0;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeListbox();
      triggerEl.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setValue(opts[Math.min(opts.length - 1, ix + 1)].getAttribute('data-value') ?? '');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setValue(opts[Math.max(0, ix - 1)].getAttribute('data-value') ?? '');
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      closeListbox();
      triggerEl.focus();
    }
  });

  syncFromHidden();

  return { close: closeListbox, sync: syncFromHidden };
}
