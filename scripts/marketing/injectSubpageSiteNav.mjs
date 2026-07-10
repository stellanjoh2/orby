/**
 * Inject shared subpage top nav from renderStaticSubpageSiteNav() into HTML files.
 * Source pages use `<!-- orby:subpage-site-nav -->` or an existing generated <nav> block.
 *
 *   npm run inject:subpage-nav
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { MARKETING_SECTIONS } from './orbyMarketingContent.js';
import { renderSiteNav, renderStaticSubpageSiteNav } from './orbyMarketingTemplates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');

/** @type {ReadonlyArray<{ file: string, base: string }>} */
export const SUBPAGE_SITE_NAV_TARGETS = [
  { file: 'about/index.html', base: '../' },
  { file: 'brand/index.html', base: '../' },
  { file: 'credits/index.html', base: '../' },
  { file: 'stats/index.html', base: '../' },
  { file: 'support/index.html', base: '../' },
  { file: 'legal/privacy-policy.html', base: '../' },
];

export const SUBPAGE_SITE_NAV_MARKER = '    <!-- orby:subpage-site-nav -->';
export const SUBPAGE_MOBILE_BOOT_MARKER = '    <!-- orby:subpage-mobile-boot -->';
export const SUBPAGE_BROWSER_GATE_MARKER = '    <!-- orby:subpage-browser-gate -->';

const LEGACY_NAV_RE =
  /\n[ \t]*<nav\s[^>]*class="[^"]*orby-marketing-scroll-nav[^"]*"[^>]*>[\s\S]*?<\/nav>/;

/**
 * @param {string} base
 * @returns {string}
 */
export function formatSubpageBrowserGateBlock(base = '../') {
  return `${SUBPAGE_BROWSER_GATE_MARKER}
    <script src="${base}scripts/orbyUnsupportedBrowserBoot.js"></script>
    <link rel="stylesheet" href="${base}styles/orby-unsupported-browser-gate.css" />`;
}

/**
 * @param {string} html
 * @param {string} base
 * @returns {string}
 */
export function injectSubpageBrowserGateIntoHtml(html, base = '../') {
  const gateBlock = formatSubpageBrowserGateBlock(base);
  if (html.includes(SUBPAGE_BROWSER_GATE_MARKER)) {
    return html;
  }

  const viewportRe = /<meta name="viewport"[^>]*>/;
  if (viewportRe.test(html)) {
    return html.replace(viewportRe, (match) => `${match}\n${gateBlock}`);
  }

  throw new Error('No viewport meta found for browser gate injection');
}

/**
 * @param {string} base
 * @returns {string}
 */
export function formatSubpageMobileBootBlock(base = '../') {
  return `${SUBPAGE_MOBILE_BOOT_MARKER}
    <script src="${base}scripts/orbyMobileLandingBoot.js"></script>
    <link rel="stylesheet" href="${base}styles/orby-mobile-landing-shell.css" />
    <link rel="stylesheet" href="${base}styles/marketing/15-mobile.css" />
    <link rel="stylesheet" href="${base}styles/marketing/15-subpage-mobile-nav.css" />`;
}

/**
 * @param {string} html
 * @param {string} base
 * @returns {string}
 */
export function injectSubpageMobileBootIntoHtml(html, base = '../') {
  const subpageNavCss = `${base}styles/marketing/15-subpage-mobile-nav.css`;
  const subpageNavLink = `<link rel="stylesheet" href="${subpageNavCss}" />`;

  if (html.includes(SUBPAGE_MOBILE_BOOT_MARKER)) {
    if (!html.includes('15-subpage-mobile-nav.css')) {
      const mobileCssRe = new RegExp(
        `(<link rel="stylesheet" href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}styles/marketing/15-mobile\\.css" />)`,
      );
      if (mobileCssRe.test(html)) {
        return html.replace(mobileCssRe, `$1\n    ${subpageNavLink}`);
      }
    }
    return html;
  }

  const bootBlock = formatSubpageMobileBootBlock(base);
  const viewportRe = /<meta name="viewport"[^>]*>/;
  if (viewportRe.test(html)) {
    return html.replace(viewportRe, (match) => `${match}\n${bootBlock}`);
  }

  throw new Error('No viewport meta found for mobile boot injection');
}

/**
 * @param {string} html
 * @param {string} base
 * @returns {string}
 */
export function injectSubpageHeadIntoHtml(html, base = '../') {
  let next = injectSubpageBrowserGateIntoHtml(html, base);
  next = injectSubpageMobileBootIntoHtml(next, base);
  next = injectSubpageSiteNavIntoHtml(next, base);
  return next;
}

/**
 * @param {string} base
 * @returns {string}
 */
export function formatSubpageSiteNavBlock(base = '../') {
  const ctaSection = MARKETING_SECTIONS.find((section) => section.type === 'cta');
  if (!ctaSection) {
    throw new Error('MARKETING_SECTIONS is missing a CTA section for site nav fields');
  }

  return renderStaticSubpageSiteNav(ctaSection, base)
    .trim()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

/** Homepage — static nav in index.html; mobile CSS keeps it visible, desktop JS reveals on scroll. */
export function formatHomepageSiteNavBlock(base = './') {
  const ctaSection = MARKETING_SECTIONS.find((section) => section.type === 'cta');
  if (!ctaSection) {
    throw new Error('MARKETING_SECTIONS is missing a CTA section for site nav fields');
  }

  return renderSiteNav(ctaSection, base)
    .trim()
    .replace(
      'class="orby-marketing-scroll-nav"',
      'class="orby-marketing-scroll-nav orby-marketing-scroll-nav--mobile-fixed"',
    )
    .replace(' aria-hidden="true"', '')
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

/**
 * @param {string} html
 * @param {string} base
 * @returns {string}
 */
export function injectSubpageSiteNavIntoHtml(html, base = '../') {
  const navBlock = formatSubpageSiteNavBlock(base);

  if (html.includes(SUBPAGE_SITE_NAV_MARKER)) {
    return html.replace(SUBPAGE_SITE_NAV_MARKER, navBlock);
  }

  if (LEGACY_NAV_RE.test(html)) {
    return html.replace(LEGACY_NAV_RE, `\n${navBlock}`);
  }

  throw new Error('No subpage site nav marker or legacy <nav> block found');
}

/**
 * @param {string} filePath
 * @param {{ base?: string }} [options]
 * @returns {{ changed: boolean, bytes: number }}
 */
export function injectSubpageSiteNavFile(filePath, options = {}) {
  const base = options.base ?? '../';
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Missing HTML file: ${absPath}`);
  }

  const before = readFileSync(absPath, 'utf8');
  const after = injectSubpageHeadIntoHtml(before, base);
  const changed = after !== before;
  if (changed) {
    writeFileSync(absPath, after);
  }
  return { changed, bytes: Buffer.byteLength(after, 'utf8') };
}

/**
 * @param {{ root?: string, targets?: typeof SUBPAGE_SITE_NAV_TARGETS, dryRun?: boolean }} [options]
 */
export function injectAllSubpageSiteNav(options = {}) {
  const root = options.root ?? repoRoot;
  const targets = options.targets ?? SUBPAGE_SITE_NAV_TARGETS;
  const dryRun = options.dryRun === true;
  let updated = 0;

  for (const target of targets) {
    const filePath = join(root, target.file);
    if (!existsSync(filePath)) continue;

    const before = readFileSync(filePath, 'utf8');
    const after = injectSubpageHeadIntoHtml(before, target.base);
    if (after === before) continue;

    if (!dryRun) {
      writeFileSync(filePath, after);
    }
    updated += 1;
  }

  return { updated, total: targets.length };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const dryRun = process.argv.includes('--dry-run');
  const { updated, total } = injectAllSubpageSiteNav({ dryRun });
  const verb = dryRun ? 'Would update' : 'Updated';
  console.log(`${verb} ${updated}/${total} subpage nav HTML files`);
  if (updated > 0 && !dryRun) {
    for (const target of SUBPAGE_SITE_NAV_TARGETS) {
      console.log(`  ${relative(repoRoot, join(repoRoot, target.file))}`);
    }
  }
}
