(function () {
  var SK = 'orby_sr_s';
  var CK = 'orby_sr_c';
  var EXPECTED = '__ORBY_SR_H__';
  var ACTIVE = EXPECTED.length === 64;
  var URL_KEY = 'sr';

  function ensureMarkup() {
    if (document.getElementById('orby-sr-root')) return;
    var wrap = document.createElement('div');
    wrap.id = 'orby-sr-root';
    wrap.className = 'orby-sr';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'orby-sr-title');
    wrap.innerHTML =
      '<div class="orby-sr__panel">' +
      '<h1 id="orby-sr-title" class="orby-sr__title">Orby</h1>' +
      '<form class="orby-sr__form" id="orby-sr-form" autocomplete="off">' +
      '<label class="orby-sr__label" for="orby-sr-field"><span class="orby-sr__label-text">Continue</span></label>' +
      '<input id="orby-sr-field" class="orby-sr__input" type="text" name="orby-sr-field" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
      '<p class="orby-sr__msg" id="orby-sr-msg" aria-live="polite"></p>' +
      '<button type="submit" class="orby-sr__btn accent-action-btn">Continue</button>' +
      '</form>' +
      '</div>';
    if (document.body.firstChild) {
      document.body.insertBefore(wrap, document.body.firstChild);
    } else {
      document.body.appendChild(wrap);
    }
  }

  function sessionOk() {
    try {
      return sessionStorage.getItem(SK) === '1';
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

  function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle) return Promise.resolve('');
    return window.crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(text))
      .then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) {
            return b.toString(16).padStart(2, '0');
          })
          .join('');
      });
  }

  ensureMarkup();

  var rootEl = document.getElementById('orby-sr-root');
  var formEl = document.getElementById('orby-sr-form');
  var fieldEl = document.getElementById('orby-sr-field');
  var msgEl = document.getElementById('orby-sr-msg');
  var rootObserver = null;
  var bodyObserver = null;
  var enforceTimer = null;

  function stripForgedUnlock() {
    if (!sessionOk() && document.documentElement.classList.contains('orby-sr-on')) {
      document.documentElement.classList.remove('orby-sr-on');
    }
  }

  function ensureMounted() {
    if (!rootEl || sessionOk()) return;
    stripForgedUnlock();
    if (!document.body.contains(rootEl)) {
      document.body.insertBefore(rootEl, document.body.firstChild);
    }
  }

  function enforceVeil() {
    if (sessionOk()) return;
    ensureMounted();
    if (!rootEl) return;
    rootEl.removeAttribute('hidden');
    rootEl.setAttribute('style', lockStyles());
  }

  function stopGuards() {
    if (rootObserver) {
      rootObserver.disconnect();
      rootObserver = null;
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

  function hideVeil() {
    document.documentElement.classList.add('orby-sr-on');
    if (rootEl) {
      rootEl.setAttribute('hidden', '');
      rootEl.removeAttribute('style');
    }
    stopGuards();
  }

  function unlockUI() {
    try {
      sessionStorage.setItem(SK, '1');
    } catch (e) {}
    hideVeil();
  }

  function showMismatch() {
    if (!msgEl) return;
    msgEl.textContent = 'Try again.';
  }

  function valueFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (!params.has(URL_KEY)) return null;
      return (params.get(URL_KEY) || '').trim();
    } catch (e) {
      return null;
    }
  }

  function stripUrlValue() {
    try {
      var url = new URL(window.location.href);
      if (!url.searchParams.has(URL_KEY)) return;
      url.searchParams.delete(URL_KEY);
      var next =
        url.pathname +
        (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') +
        url.hash;
      window.history.replaceState(null, '', next);
    } catch (e) {}
  }

  function tryUnlockWithValue(value) {
    if (!ACTIVE) {
      unlockUI();
      return Promise.resolve(true);
    }
    return sha256Hex(value).then(function (hash) {
      if (hash === EXPECTED) {
        if (msgEl) msgEl.textContent = '';
        stripUrlValue();
        unlockUI();
        return true;
      }
      if (value !== null && value !== '') {
        showMismatch();
        if (fieldEl) fieldEl.value = value;
      }
      return false;
    });
  }

  function initGuards() {
    if (sessionOk() || !rootEl) return;
    enforceVeil();
    rootObserver = new MutationObserver(function () {
      if (sessionOk()) return;
      enforceVeil();
    });
    rootObserver.observe(rootEl, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
    bodyObserver = new MutationObserver(function () {
      if (sessionOk()) return;
      ensureMounted();
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

  function boot() {
    if (typeof window !== 'undefined' && window.__ORBY_SR_OFF__ === true) {
      hideVeil();
      return;
    }
    if (!ACTIVE) {
      hideVeil();
      return;
    }
    var urlValue = valueFromUrl();
    if (urlValue !== null) {
      void tryUnlockWithValue(urlValue).then(function (ok) {
        if (!ok) initGuards();
      });
      return;
    }
    if (sessionOk()) {
      unlockUI();
      return;
    }
    initGuards();
    requestAnimationFrame(function () {
      if (fieldEl && !sessionOk()) fieldEl.focus();
    });
  }

  if (formEl && fieldEl) {
    formEl.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sessionOk()) {
        unlockUI();
        return;
      }
      var entered = (fieldEl.value || '').trim();
      void tryUnlockWithValue(entered).then(function (ok) {
        if (!ok) {
          showMismatch();
          fieldEl.focus();
        }
      });
    });
  }

  boot();
})();
