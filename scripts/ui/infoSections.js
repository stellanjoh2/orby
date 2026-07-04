/**
 * Information tab — collapse long prose blocks by default; deep links open the target section.
 */

/** Always-visible blocks (no foldout arrow / collapse). */
const INFO_STATIC_BLOCK_IDS = new Set(['info-bug-report', 'info-sounds']);

/**
 * @param {HTMLAnchorElement} anchor
 */
function isInfoPanelLeaveStudioLink(anchor) {
  const href = anchor.getAttribute('href');
  if (!href || href === '#') return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('javascript:')) return false;
  if (href.startsWith('./') || href.startsWith('../') || href.startsWith('/')) return true;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
      return true;
    }
  } catch {
    /* ignore malformed href */
  }
  return false;
}

/**
 * Site links in the Information tab must not unload the Studio tab.
 * @param {ParentNode} panel
 */
export function bindInfoPanelNavLinks(panel) {
  panel.querySelectorAll('a[href]').forEach((anchor) => {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (!isInfoPanelLeaveStudioLink(anchor)) return;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  });
}

/**
 * Capture-phase guard — works even when cached prose HTML lacks target="_blank".
 */
export function initInfoPanelNavGuard() {
  const panel = document.querySelector('.panel[data-panel="info"]');
  if (!panel) return;

  bindInfoPanelNavLinks(panel);

  if (panel.dataset.infoNavGuard === '1') return;
  panel.dataset.infoNavGuard = '1';

  panel.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isInfoPanelLeaveStudioLink(anchor)) return;
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      window.open(anchor.href, '_blank', 'noopener,noreferrer');
    },
    true,
  );

  new MutationObserver(() => {
    bindInfoPanelNavLinks(panel);
  }).observe(panel, { childList: true, subtree: true });
}

/**
 * @param {Element | null | undefined} el
 */
export function openInfoSectionTarget(el) {
  if (!el) return;

  if (el instanceof HTMLDetailsElement && el.classList.contains('info-section')) {
    el.open = true;
    return;
  }

  const details = el.closest('details.info-section');
  if (details) {
    details.open = true;
  }
}

/**
 * @param {HTMLElement} stack
 */
function flattenInfoPanelStack(stack) {
  const blocks = [...stack.querySelectorAll(':scope > .panel-block')];
  if (!blocks.length) return;

  const first = blocks[0];
  const details = document.createElement('details');
  details.className = `${first.className} info-section`.trim();
  if (first.id) {
    details.id = first.id;
  }

  const summary = document.createElement('summary');
  summary.className = 'info-section__summary';
  const titleEl = first.querySelector(':scope > .block-title');
  if (titleEl) {
    summary.appendChild(titleEl);
  }

  const body = document.createElement('div');
  body.className = 'info-section__body';

  blocks.forEach((block) => {
    [...block.children].forEach((child) => {
      if (child instanceof Element && child.classList.contains('block-title')) return;
      body.appendChild(child);
    });
  });

  details.append(summary, body);
  stack.replaceWith(details);
}

/**
 * @param {HTMLElement} block
 */
function wrapInfoPanelBlock(block) {
  if (block.classList.contains('info-section')) return;
  if (block.id && INFO_STATIC_BLOCK_IDS.has(block.id)) return;

  const details = document.createElement('details');
  details.className = `${block.className} info-section`.trim();
  if (block.id) {
    details.id = block.id;
  }

  const summary = document.createElement('summary');
  summary.className = 'info-section__summary';
  const titleEl = block.querySelector(':scope > .block-title');
  if (titleEl) {
    summary.appendChild(titleEl);
  }

  const body = document.createElement('div');
  body.className = 'info-section__body';
  [...block.children].forEach((child) => {
    if (child instanceof Element && child.classList.contains('block-title')) return;
    body.appendChild(child);
  });

  details.append(summary, body);
  block.replaceWith(details);
}

/** Collapse Information tab prose sections by default. */
export function initInfoSections() {
  const panel = document.querySelector('.panel[data-panel="info"]');
  if (!panel || panel.dataset.infoSectionsInit === '1') return;
  panel.dataset.infoSectionsInit = '1';

  panel.querySelectorAll(':scope > .info-panel-stack').forEach(flattenInfoPanelStack);
  panel.querySelectorAll(':scope > .panel-block.info-panel-block').forEach(wrapInfoPanelBlock);

  bindInfoPanelNavLinks(panel);

  // Clicks on controls inside <summary> must not toggle the section open/closed.
  // Do not use preventDefault here — it blocks checkbox / button activation (e.g. UI Sounds).
  panel.querySelectorAll('details.info-section').forEach((details) => {
    const stopToggle = (event) => {
      event.stopPropagation();
    };
    details.querySelectorAll(
      '.info-section__summary input, .info-section__summary button, .info-section__summary a, .info-section__summary select, .info-section__summary textarea, .info-section__summary label.effect-toggle',
    ).forEach((el) => {
      el.addEventListener('click', stopToggle);
      el.addEventListener('pointerdown', stopToggle);
    });
  });
}
