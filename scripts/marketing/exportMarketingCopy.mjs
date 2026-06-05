/**
 * Regenerate marketingCopyExport.json from live copy sources (no drift).
 *
 *   npm run export:marketing-copy
 *
 * Sources:
 *   - scripts/marketing/orbyMarketingContent.js (sections)
 *   - index.html (dropzone hero)
 *   - scripts/ui/UIManagerModalOverlays.js (return-home modal)
 *   - scripts/marketing/orbyMarketingConstants.js (scroll cue aria-label)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETING_SECTIONS } from './orbyMarketingContent.js';
import { MARKETING_SCROLL_CUE_ARIA_LABEL } from './orbyMarketingConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const outPath = path.join(__dirname, 'marketingCopyExport.json');

function stripHtml(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleLines(title) {
  return String(title)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function sectionCta(section) {
  if (section.type === 'cta') {
    return {
      primary: { label: section.ctaLabel || 'Browse Files', action: 'browse' },
      secondary: { label: section.secondaryCtaLabel || 'Load Sample', action: 'load-sample' },
    };
  }
  if (section.type === 'in-progress' && section.ctaLabel) {
    return { label: section.ctaLabel, href: section.ctaHref ?? null };
  }
  if (!section.ctaLabel) return null;
  return { label: section.ctaLabel, action: section.ctaAction ?? 'scroll-top' };
}

function sectionToExport(section, order) {
  /** @type {Record<string, unknown>} */
  const row = {
    order,
    type: section.type,
    id: section.id,
    eyebrow: section.eyebrow ?? null,
    title: section.title,
    titleLines: titleLines(section.title),
    lede: section.lede ?? '',
    bullets: section.bullets ?? null,
    cta: sectionCta(section),
  };

  if (section.type === 'cta') {
    row.eyebrow = null;
  }

  if (section.type === 'showcase' && section.gallery?.length) {
    row.galleryCredits = section.gallery
      .map((slide) => slide.credit)
      .filter(Boolean);
  }

  if (section.imageCredit) {
    row.imageCredit = section.imageCredit;
  }

  if (section.type === 'split' && section.gallery?.length) {
    row.galleryCount = section.gallery.length;
  }

  if (section.type === 'marquee' && section.marquee?.length) {
    row.marqueeAlts = section.marquee.map((item) => item.alt);
  }

  if (section.type === 'pro' && section.cards?.length) {
    row.cards = section.cards.map(({ title, body }) => ({ title, body }));
  }

  if (section.type === 'faq' && section.faq?.length) {
    row.faq = section.faq.map(({ question, answer }) => ({ question, answer }));
  }

  return row;
}

async function readHeroDropzone(indexHtml) {
  const primaryBlock = indexHtml.match(/<p class="drop-primary">([\s\S]*?)<\/p>/);
  const primaryHtml = primaryBlock?.[1] ?? '';
  const line1 = stripHtml(
    primaryHtml.match(
      /class="drop-primary-line">([\s\S]*?)<span class="drop-primary-line drop-primary-line--second"/,
    )?.[1] ?? '',
  );
  const line2 = stripHtml(
    primaryHtml.match(/class="drop-primary-line drop-primary-line--second">([\s\S]*)$/)?.[1] ??
      '',
  );

  const browseTooltip = indexHtml.match(/id="browseButton"[^>]*data-tooltip="([^"]*)"/)?.[1] ?? '';
  const browseLabel =
    indexHtml.match(/id="browseButton"[\s\S]*?orby-magic-btn__label">([^<]+)</)?.[1]?.trim() ??
    'Browse';

  const secondaryBlock = indexHtml.match(/<p class="drop-secondary">([\s\S]*?)<\/p>/);
  const secondaryHtml = secondaryBlock?.[1] ?? '';
  let secondaryPlain = secondaryHtml.replace(/<span class="drop-shortcuts-row">[\s\S]*/i, '');
  secondaryPlain = secondaryPlain.replace(/<a\b[^>]*>([^<]*)<\/a>/gi, '$1');
  const secondaryBody = stripHtml(secondaryPlain);

  const secondaryLinks = [...secondaryHtml.matchAll(/<a\s+([^>]+)>([^<]*)<\/a>/gi)].map((match) => {
    const attrs = match[1];
    const label = match[2].trim();
    const href = attrs.match(/href="([^"]*)"/)?.[1] ?? '#';
    const id = attrs.match(/id="([^"]*)"/)?.[1] ?? '';
    let type = 'link';
    if (href.includes('privacy-policy')) type = 'policy';
    else if (id === 'loadTestLink' || id === 'debug404Link') type = 'dev';
    return { label, href, type };
  });

  const shortcutsMatch = secondaryHtml.match(/class="drop-shortcuts-inline">([\s\S]*?)<\/span>/);
  const keyboardShortcuts = shortcutsMatch ? stripHtml(shortcutsMatch[1]) : '';

  return {
    headline: {
      line1,
      line2,
      highlightedTerms: ['GLB', 'SVG'],
    },
    primaryCta: {
      label: browseLabel,
      tooltip: browseTooltip,
    },
    secondaryBody,
    secondaryLinks,
    highlightedTermsInSecondary: ['glTF', 'GLB', 'SVG'],
    underConstructionLabel: 'under construction',
    keyboardShortcuts,
  };
}

async function readStudioOnly(overlaysJs) {
  const block = overlaysJs.match(/showFullscreenPrompt\(\{([\s\S]*?)\}\);/);
  const inner = block?.[1] ?? '';
  const messageHtml = inner.match(/messageHtml:\s*\n\s*'([^']+)'/)?.[1] ?? '';
  const cancelLabel = inner.match(/cancelLabel:\s*'([^']+)'/)?.[1] ?? '';
  const confirmLabel = inner.match(/confirmLabel:\s*'([^']+)'/)?.[1] ?? '';
  return {
    returnHomeModal: {
      messageHtml,
      cancelLabel,
      confirmLabel,
    },
  };
}

async function main() {
  const [indexHtml, overlaysJs] = await Promise.all([
    fs.readFile(path.join(repoRoot, 'index.html'), 'utf8'),
    fs.readFile(path.join(repoRoot, 'scripts/ui/UIManagerModalOverlays.js'), 'utf8'),
  ]);

  const sections = MARKETING_SECTIONS.map((section, index) =>
    sectionToExport(section, index + 1),
  );

  const payload = {
    meta: {
      product: 'Orby',
      page: 'Homepage landing (dropzone hero + marketing one-pager)',
      generatedAt: new Date().toISOString(),
      generator: 'scripts/marketing/exportMarketingCopy.mjs',
      sourceFiles: [
        'index.html',
        'scripts/marketing/orbyMarketingContent.js',
        'scripts/marketing/orbyMarketingConstants.js',
        'scripts/ui/UIManagerModalOverlays.js',
      ],
      exportedFor: 'copy review',
      notes: [
        'Regenerate after copy edits: npm run export:marketing-copy',
        'brand-highlight in UI renders as lime accent, not necessarily bold',
        "Hero links 'Load test object' and 'Debug 404 (temp)' are dev-only",
        'Return-home modal copy is studio-triggered, not part of scroll landing',
      ],
    },
    heroDropzone: await readHeroDropzone(indexHtml),
    scrollCue: {
      ariaLabel: MARKETING_SCROLL_CUE_ARIA_LABEL,
    },
    sections,
    studioOnly: await readStudioOnly(overlaysJs),
  };

  await fs.writeFile(`${outPath}`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(repoRoot, outPath)} (${sections.length} sections)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
