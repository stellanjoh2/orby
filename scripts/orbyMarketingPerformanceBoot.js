/**
 * Marketing performance tier — sync head bootstrap (index.html).
 * Applies html.orby-marketing-reduced before first paint on lower-spec home loads.
 *
 * Keep scoring in sync with getMarketingPerformanceTier() in marketingPerformanceTier.js
 * (reduced tier when score >= 3).
 */
(function () {
  function marketingPerformanceScore() {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 99;
    } catch (e) {}

    if (document.documentElement.classList.contains('mobile-landing')) return 99;

    var score = 0;
    var conn =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.saveData) score += 3;
    if (conn && conn.effectiveType && /^(slow-2g|2g|3g)$/i.test(conn.effectiveType)) {
      score += 2;
    }

    var memory = navigator.deviceMemory;
    if (typeof memory === 'number') {
      if (memory <= 4) score += 3;
      else if (memory <= 8) score += 1;
    }

    var cores = navigator.hardwareConcurrency;
    if (typeof cores === 'number') {
      if (cores <= 4) score += 2;
      else if (cores <= 6) score += 1;
    }

    return score;
  }

  if (marketingPerformanceScore() >= 3) {
    document.documentElement.classList.add('orby-marketing-reduced');
  }
})();
