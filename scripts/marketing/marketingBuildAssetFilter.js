/**
 * Production asset copy filter — keeps source trees intact for encode tooling,
 * strips heavy unused marketing files + raw HDRIs from `dist/`.
 *
 * Marketing denylist: paths under `assets/marketing/` with no runtime reference
 * in HTML/CSS/JS (verified by repo-wide path scan). Do not add paths that appear
 * in orbyMarketingContent.js, templates, credits, brand, mobile landing, or
 * intro turntable / png-loop delivery.
 */

/** @type {ReadonlySet<string>} Relative to `assets/marketing/` */
export const MARKETING_BUILD_EXCLUDE = new Set([
  'Comp-1_00000.jpg',
  'custom-hdri-placeholder.png',
  'export-golden-look.png',
  'feature-ui-placeholder.png',
  'import-orbit-placeholder.mp4',
  'intro-asset-left.png',
  'intro-asset-right.png',
  'model_47a_-_loggerhead_sea_turtle-transparent.png',
  'orby-feature-3dlogo.mp4',
  'orby-feature-lensflare-backup.mp4',
  'orby-marketing-colorchecker.jpg',
  'orby-marketing-microreel.mp4',
  'orby-marketing-trailer-koala.jpg',
  'orby-section-pro-meshdiagnostics01.jpg',
  'pro-feature1-shoes-UV.jpg',
  'pro-feature1-shoes.jpg',
  'pro-feature1-shoes01.jpg',
  'pro-feature1-shoes02.jpg',
  'pro-feature1-shoes03.jpg',
  'pro-feature2-export.jpg',
  'pro-feature4-color-checker.jpg',
  'pro-feature5-isometric.jpg',
  'rfrct.png',
  'showcase/showcase-01-etron-gt.jpg',
  'showcase/showcase-02-etron-detail.jpg',
  'showcase/showcase-03-jeep-rubicon.jpg',
  'showcase/showcase-04-new-balance.jpg',
  'skull_salazar_downloadable-transparent (1).png',
  'skull_salazar_downloadable-transparent.png',
  'used_new_balance_574_classic______free-transparent (2).png',
]);

/**
 * @param {string} src Absolute or relative path passed to `fs.cpSync` filter
 * @returns {boolean} Whether to copy this path into dist
 */
export function shouldCopyAssetToDist(src) {
  const normalized = src.split(/[/\\]/).join('/');

  if (
    normalized.includes('/hdris/Source/') ||
    normalized.endsWith('/hdris/Source') ||
    /(^|\/)assets\/hdris\/Source(\/|$)/.test(normalized)
  ) {
    return false;
  }
  if (normalized.toLowerCase().endsWith('.hdr')) {
    return false;
  }

  const marketingMatch = normalized.match(/(?:^|\/)assets\/marketing\/(.*)$/);
  if (marketingMatch) {
    const rel = marketingMatch[1];
    if (!rel) return true;
    if (rel === 'showcase' || rel.startsWith('showcase/')) {
      return false;
    }
    if (MARKETING_BUILD_EXCLUDE.has(rel)) {
      return false;
    }
  }

  return true;
}
