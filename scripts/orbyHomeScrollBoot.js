/**
 * Desktop homepage scroll shell — sync head bootstrap (index.html).
 * Applies html.orby-home-scroll + shell-pending before first paint so marketing
 * black backgrounds win over studio gray tokens in styles.css (Safari is slow to
 * parse ES modules, so deferring this to main.js caused a long gray flash).
 *
 * Keep path detection in sync with isOrbyHomePath() in scripts/orbyRoute.js.
 * Mobile home uses orbyMobileLandingBoot.js (adds the same scroll class there).
 */
(function () {
  function isOrbyHomePath() {
    try {
      var path = (location.pathname || '/').replace(/\/$/, '') || '/';
      return path === '/' || path === '/index.html';
    } catch (e) {
      return false;
    }
  }

  function shouldApplyHomeScrollBoot() {
    if (typeof document === 'undefined') return false;
    if (!isOrbyHomePath()) return false;
    if (document.documentElement.classList.contains('mobile-landing')) return false;
    return true;
  }

  function applyHomeScrollBoot() {
    if (!shouldApplyHomeScrollBoot()) return false;
    document.documentElement.classList.add('orby-home-scroll', 'orby-dropzone-shell-pending');
    return true;
  }

  applyHomeScrollBoot();
})();
