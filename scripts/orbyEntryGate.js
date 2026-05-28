/**
 * Site entry gate — access phrase + sessionStorage verification.
 * Used on index.html and about/index.html; pair with head bootstrap in each page.
 */
(function () {
  var STORAGE_KEY = 'orby_site_gate_verified';
  var EXPECTED_ACCESS_PHRASE = 'hellotest456';

  function ensureGateMarkup() {
    if (document.getElementById('orby-entry-gate')) return;
    var wrap = document.createElement('div');
    wrap.id = 'orby-entry-gate';
    wrap.className = 'orby-entry-gate';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'orby-entry-gate-title');
    wrap.innerHTML =
      '<div class="orby-entry-gate__panel">' +
      '<h1 id="orby-entry-gate-title" class="orby-entry-gate__title">Orby</h1>' +
      '<p class="orby-entry-gate__hint">Enter the access phrase to open the studio.</p>' +
      '<form class="orby-entry-gate__form" id="orby-entry-gate-form" autocomplete="off">' +
      '<label class="orby-entry-gate__label" for="orby-access-phrase-field">Access phrase</label>' +
      '<input id="orby-access-phrase-field" class="orby-entry-gate__input" type="text" name="orby-access-phrase" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
      '<p class="orby-entry-gate__error" id="orby-entry-gate-error" aria-live="polite"></p>' +
      '<button type="submit" class="orby-entry-gate__submit accent-action-btn">Continue</button>' +
      '</form>' +
      '</div>';
    if (document.body.firstChild) {
      document.body.insertBefore(wrap, document.body.firstChild);
    } else {
      document.body.appendChild(wrap);
    }
  }

  ensureGateMarkup();

  var gateEl = document.getElementById('orby-entry-gate');
  var formEl = document.getElementById('orby-entry-gate-form');
  var fieldEl = document.getElementById('orby-access-phrase-field');
  var errEl = document.getElementById('orby-entry-gate-error');
  var gateObserver = null;
  var bodyObserver = null;
  var enforceTimer = null;

  function sessionOk() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function lockStyles() {
    return [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'visibility:visible',
      'opacity:1',
      'background:#080808',
      'pointer-events:auto',
      'margin:0',
      'padding:clamp(1rem,4vw,2rem)',
      'box-sizing:border-box',
    ].join(';');
  }

  function stripForgedUnlock() {
    if (!sessionOk() && document.documentElement.classList.contains('orby-gate-unlocked')) {
      document.documentElement.classList.remove('orby-gate-unlocked');
    }
  }

  function ensureGateMounted() {
    if (!gateEl || sessionOk()) return;
    stripForgedUnlock();
    if (!document.body.contains(gateEl)) {
      document.body.insertBefore(gateEl, document.body.firstChild);
    }
  }

  function enforceVeil() {
    if (sessionOk()) return;
    ensureGateMounted();
    if (!gateEl) return;
    gateEl.removeAttribute('hidden');
    gateEl.setAttribute('style', lockStyles());
  }

  function stopGuards() {
    if (gateObserver) {
      gateObserver.disconnect();
      gateObserver = null;
    }
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }
    if (enforceTimer) {
      clearInterval(enforceTimer);
      enforceTimer = null;
    }
  }

  function unlockUI() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {}
    document.documentElement.classList.add('orby-gate-unlocked');
    if (gateEl) {
      gateEl.setAttribute('hidden', '');
      gateEl.removeAttribute('style');
    }
    stopGuards();
  }

  function showMismatch() {
    if (!errEl) return;
    errEl.textContent = 'That phrase is not valid.';
  }

  function phraseFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (!params.has('orby-access-phrase')) return null;
      return (params.get('orby-access-phrase') || '').trim();
    } catch (e) {
      return null;
    }
  }

  function stripPhraseFromUrl() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has('orby-access-phrase')) return;
      url.searchParams.delete('orby-access-phrase');
      var next =
        url.pathname +
        (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') +
        url.hash;
      window.history.replaceState(null, '', next);
    } catch (e) {}
  }

  function tryUnlockWithPhrase(phrase) {
    if (phrase === EXPECTED_ACCESS_PHRASE) {
      if (errEl) errEl.textContent = '';
      stripPhraseFromUrl();
      unlockUI();
      return true;
    }
    if (phrase !== null && phrase !== '') {
      showMismatch();
      if (fieldEl) fieldEl.value = phrase;
    }
    return false;
  }

  function initGuards() {
    if (sessionOk() || !gateEl) return;
    enforceVeil();
    gateObserver = new MutationObserver(function () {
      if (sessionOk()) return;
      enforceVeil();
    });
    gateObserver.observe(gateEl, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
    bodyObserver = new MutationObserver(function () {
      if (sessionOk()) return;
      ensureGateMounted();
      enforceVeil();
    });
    bodyObserver.observe(document.body, { childList: true });
    enforceTimer = setInterval(function () {
      if (sessionOk()) {
        stopGuards();
        return;
      }
      stripForgedUnlock();
      enforceVeil();
    }, 400);
  }

  if (formEl && fieldEl) {
    formEl.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sessionOk()) {
        unlockUI();
        return;
      }
      var entered = (fieldEl.value || '').trim();
      if (tryUnlockWithPhrase(entered)) {
        return;
      }
      showMismatch();
      fieldEl.focus();
    });
  }

  var urlPhrase = phraseFromUrl();
  if (urlPhrase !== null && tryUnlockWithPhrase(urlPhrase)) {
    /* unlocked from ?orby-access-phrase= */
  } else if (typeof window !== 'undefined' && window.__ORBY_ENTRY_GATE_ENABLED__ === false) {
    document.documentElement.classList.add('orby-gate-unlocked');
    if (gateEl) {
      gateEl.setAttribute('hidden', '');
      gateEl.removeAttribute('style');
    }
  } else if (sessionOk()) {
    unlockUI();
  } else {
    initGuards();
    requestAnimationFrame(function () {
      if (fieldEl && !sessionOk()) fieldEl.focus();
    });
  }
})();
