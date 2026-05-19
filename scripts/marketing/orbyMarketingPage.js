/**
 * Homepage marketing one-pager — mounted below the dropzone hero.
 * Kept separate from the studio runtime: lazy DOM, lazy CSS, no Three.js coupling.
 */

import { orbyMagicButtonHtml, orbyMagicButtonOnLimeHtml } from '../ui/orbyMagicButton.js';

const MARKETING_ROOT_ID = 'orby-marketing';
const STYLES_HREF = './styles/orby-marketing.css';
const SCROLL_CLASS = 'orby-home-scroll';
/** Mega sections (intro + footer) — fire when the block is actually on screen */
const MEGA_REVEAL_IO = { root: null, rootMargin: '0px 0px -22% 0px', threshold: 0.32 };
const DEFAULT_REVEAL_IO = { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.08 };

function isMegaRevealSection(section) {
  return section.classList.contains('orby-marketing__section--mega');
}

let sectionsCache = null;

function shouldSkipMarketing() {
  if (document.documentElement.classList.contains('mobile-landing')) return true;
  const path = window.location.pathname || '/';
  return path !== '/' && path !== '/index.html';
}

function isDropzoneHome() {
  return document.body.classList.contains('dropzone-visible');
}

async function loadSections() {
  if (sectionsCache) return sectionsCache;
  const mod = await import('./orbyMarketingContent.js');
  sectionsCache = mod.MARKETING_SECTIONS;
  return sectionsCache;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-orby-marketing-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLES_HREF;
  link.setAttribute('data-orby-marketing-css', '');
  document.head.appendChild(link);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MARKETING_COPY_TOAST_CLASS = 'orby-marketing__copy-toast';
const MARKETING_COPY_TOAST_MESSAGE = 'Contact email copied to clipboard';
let marketingCopyToastHideTimer = null;
let marketingCopyToastRemoveTimer = null;
/** @type {Array<{ btn: HTMLElement; handler: (event: Event) => void }>} */
let marketingCopyBoundButtons = [];

function clearMarketingCopyToastTimers() {
  if (marketingCopyToastHideTimer != null) {
    window.clearTimeout(marketingCopyToastHideTimer);
    marketingCopyToastHideTimer = null;
  }
  if (marketingCopyToastRemoveTimer != null) {
    window.clearTimeout(marketingCopyToastRemoveTimer);
    marketingCopyToastRemoveTimer = null;
  }
}

function showMarketingCopyToast(message) {
  document.querySelector(`.${MARKETING_COPY_TOAST_CLASS}`)?.remove();
  clearMarketingCopyToastTimers();

  const toast = document.createElement('div');
  toast.className = MARKETING_COPY_TOAST_CLASS;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('is-visible'));
  });

  marketingCopyToastHideTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible');
    marketingCopyToastHideTimer = null;
    marketingCopyToastRemoveTimer = window.setTimeout(() => {
      toast.remove();
      marketingCopyToastRemoveTimer = null;
    }, 320);
  }, 2200);
}

/** @param {string} message @param {{ caution?: boolean }} [options] */
function notifyMarketingCopy(message, options = {}) {
  const ui = window.orby?.ui;
  if (typeof ui?.showToast === 'function') {
    ui.showToast(message, 2600, {
      caution: options.caution === true,
      notification: options.caution !== true,
    });
    return;
  }
  showMarketingCopyToast(message);
}

function copyTextFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}

async function copyMarketingEmail(email) {
  const value = String(email || '').trim();
  if (!value) return;

  notifyMarketingCopy(MARKETING_COPY_TOAST_MESSAGE);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    if (copyTextFallback(value)) return;
    throw new Error('clipboard unavailable');
  } catch {
    notifyMarketingCopy('Could not copy email', { caution: true });
  }
}

function bindMarketingCopyEmail(root) {
  unbindMarketingCopyEmail();

  const marketingRoot = root ?? document.getElementById(MARKETING_ROOT_ID);
  if (!marketingRoot) return;

  marketingRoot.querySelectorAll('[data-orby-marketing-copy-email]').forEach((btn) => {
    if (!(btn instanceof HTMLElement)) return;
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyMarketingEmail(btn.getAttribute('data-orby-marketing-copy-email') || '');
    };
    btn.addEventListener('click', handler);
    marketingCopyBoundButtons.push({ btn, handler });
  });
}

function unbindMarketingCopyEmail() {
  for (const { btn, handler } of marketingCopyBoundButtons) {
    btn.removeEventListener('click', handler);
  }
  marketingCopyBoundButtons = [];
  document.querySelector(`.${MARKETING_COPY_TOAST_CLASS}`)?.remove();
  clearMarketingCopyToastTimers();
}

function renderBulletList(items) {
  if (!items?.length) return '';
  return `<ul class="orby-marketing__list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

function renderMagicCta(section) {
  if (!section.ctaLabel) return '';
  const actionAttr =
    section.ctaAction === 'browse'
      ? 'data-orby-marketing-browse'
      : section.ctaAction === 'load-sample'
        ? 'data-orby-marketing-load-sample'
        : 'data-orby-marketing-scroll-top';
  return `<div class="orby-marketing__split-cta">
      ${orbyMagicButtonHtml(escapeHtml(section.ctaLabel), {
        extraClass: 'orby-marketing__cta',
        attrs: actionAttr,
      })}
    </div>`;
}

function renderFigure(imageSrc, imageAlt, revealDir, videoSrc = '') {
  if (!imageSrc && !videoSrc) return '';
  const posterAttr =
    imageSrc && videoSrc ? ` poster="${escapeHtml(imageSrc)}"` : '';
  const media = videoSrc
    ? `<video class="orby-marketing__figure-media orby-marketing__figure-video" src="${escapeHtml(videoSrc)}"${posterAttr} playsinline muted loop preload="metadata" aria-label="${escapeHtml(imageAlt || 'Feature preview video')}"></video>`
    : `<img class="orby-marketing__figure-media orby-marketing__figure-img" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt || '')}" decoding="async" />`;
  return `<figure class="orby-marketing__figure">
      <div class="orby-marketing__figure-mask" data-orby-marketing-reveal="media" data-reveal-dir="${escapeHtml(revealDir)}">
        <span class="orby-marketing__media-ph" aria-hidden="true"></span>
        ${media}
      </div>
    </figure>`;
}

function renderSplitSection(section) {
  const mediaLeft = section.layout === 'media-left';
  const bleedClass = mediaLeft
    ? 'orby-marketing__split-bleed orby-marketing__split-bleed--media-left'
    : 'orby-marketing__split-bleed orby-marketing__split-bleed--media-right';
  const revealDir = mediaLeft ? 'rtl' : 'ltr';

  return `<section class="orby-marketing__section orby-marketing__section--split" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="${bleedClass}">
      <div class="orby-marketing__split-copy">
        <div class="orby-marketing__split-copy-inner">
          <p class="orby-marketing__eyebrow">${escapeHtml(section.eyebrow)}</p>
          <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title">${renderIntroHeadline(section.title)}</h2>
          <p class="orby-marketing__lede">${escapeHtml(section.lede)}</p>
          ${renderBulletList(section.bullets)}
          ${renderMagicCta(section)}
        </div>
      </div>
      <div class="orby-marketing__split-media">
        ${renderFigure(section.imageSrc, section.imageAlt, revealDir, section.videoSrc)}
      </div>
    </div>
  </section>`;
}

function renderIntroHeadline(title) {
  return String(title)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<span class="orby-marketing__title-line">${escapeHtml(line)}</span>`)
    .join('');
}

function renderIntroSection(section) {
  return `<section class="orby-marketing__section orby-marketing__section--mega orby-marketing__section--intro orby-marketing__section--intro-turntable" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__intro-stage" data-orby-marketing-float-stage aria-hidden="true">
        <div class="orby-marketing__intro-turntable-wrap orby-marketing__intro-asset orby-marketing__intro-asset--right">
          <img
            class="orby-marketing__intro-turntable-poster"
            src="./assets/marketing/intro-turntable-poster.jpg"
            alt=""
            width="2560"
            height="1440"
            decoding="async"
            fetchpriority="low"
          />
          <canvas
            class="orby-marketing__intro-turntable-canvas"
            width="1920"
            height="1080"
            aria-hidden="true"
          ></canvas>
        </div>
      </div>
      <div class="orby-marketing__intro-center">
      ${section.eyebrow ? `<p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>` : ''}
      <h2 class="orby-marketing__title orby-marketing__title--intro brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      <p class="orby-marketing__lede orby-marketing__lede--intro" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
  </section>`;
}

function getShowcaseSlides(section) {
  return section.gallery?.length
    ? section.gallery
    : section.imageSrc
      ? [{ src: section.imageSrc, alt: section.imageAlt || '' }]
      : [];
}

function renderShowcaseDots(slideCount) {
  if (slideCount < 2) return '';
  const buttons = Array.from({ length: slideCount }, (_, i) => {
    const active = i === 0 ? ' is-active' : '';
    const current = i === 0 ? ' aria-current="true"' : '';
    return `<button type="button" class="orby-marketing__showcase-dot${active}" data-orby-marketing-showcase-dot data-slide-index="${i}" aria-label="Show image ${i + 1} of ${slideCount}"${current}></button>`;
  }).join('\n          ');
  return `<nav class="orby-marketing__showcase-dots" data-orby-marketing-showcase-dots aria-label="Showcase images">${buttons}</nav>`;
}

function renderShowcaseSlides(section) {
  const slides = getShowcaseSlides(section);
  return slides
    .map((slide, index) => {
      const active = index === 0 ? ' is-active' : '';
      const lazy = index === 0 ? '' : ' loading="lazy"';
      const creditAttr = slide.credit
        ? ` data-credit="${escapeHtml(slide.credit)}"`
        : '';
      return `<img class="orby-marketing__showcase-img${active}" src="${escapeHtml(slide.src)}" alt="${escapeHtml(slide.alt)}" width="1024" height="576" decoding="async"${creditAttr}${lazy} />`;
    })
    .join('\n        ');
}

function renderPngMarqueeItems(items) {
  return items
    .map(
      (item) => `<li class="orby-marketing__png-marquee-item">
          <img
            class="orby-marketing__png-marquee-img"
            src="${escapeHtml(item.src)}"
            alt="${escapeHtml(item.alt)}"
            decoding="async"
            loading="lazy"
          />
      </li>`,
    )
    .join('\n          ');
}

function renderPngMarqueeSection(section) {
  const items = section.marquee ?? [];
  const itemHtml = renderPngMarqueeItems(items);
  const duplicateHtml = renderPngMarqueeItems(items);

  return `<section class="orby-marketing__section orby-marketing__section--marquee" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__marquee-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
    <div
      class="orby-marketing__png-marquee"
      data-orby-marketing-png-marquee
      data-orby-marketing-reveal="media"
      data-reveal-dir="ltr"
    >
      <div class="orby-marketing__png-marquee-logotype" aria-hidden="true">
        <div
          class="orby-marketing__png-marquee-logotype-inner"
          data-orby-marketing-png-marquee-logotype
        ></div>
      </div>
      <div class="orby-marketing__png-marquee-viewport">
        <div class="orby-marketing__png-marquee-track">
          <ul class="orby-marketing__png-marquee-group">
            ${itemHtml}
          </ul>
          <ul class="orby-marketing__png-marquee-group" aria-hidden="true">
            ${duplicateHtml}
          </ul>
        </div>
      </div>
    </div>
  </section>`;
}

function renderShowcaseSection(section) {
  const slides = getShowcaseSlides(section);
  const video = section.videoSrc
    ? `<video class="orby-marketing__video" src="${escapeHtml(section.videoSrc)}" poster="${escapeHtml(section.gallery?.[0]?.src || section.imageSrc || '')}" playsinline muted loop preload="none"></video>`
    : '';
  return `<section class="orby-marketing__section orby-marketing__section--showcase" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__showcase-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
    <figure class="orby-marketing__showcase-figure">
      <div class="orby-marketing__showcase-mask" data-orby-marketing-showcase-gallery data-orby-marketing-reveal="media" data-reveal-dir="ltr" tabindex="0" aria-roledescription="carousel" aria-label="Showcase gallery">
        <span class="orby-marketing__media-ph" aria-hidden="true"></span>
        ${renderShowcaseSlides(section)}
        <p class="orby-marketing__showcase-credit" data-orby-marketing-showcase-credit hidden></p>
        ${renderShowcaseDots(slides.length)}
        ${video}
      </div>
    </figure>
  </section>`;
}

const FAQ_ICON_SVG = `<svg class="orby-marketing__faq-icon-svg" width="32" height="32" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.496 6.033h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286a.237.237 0 0 0 .241.247zm2.325 6.443c.61 0 1.029-.394 1.029-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94 0 .533.425.927 1.01.927z"/></svg>`;

function renderProCard(card) {
  const media = card.imageSrc
    ? `<div class="orby-marketing__pro-card-media">
          <span class="orby-marketing__media-ph" aria-hidden="true"></span>
          <img class="orby-marketing__pro-card-img" src="${escapeHtml(card.imageSrc)}" alt="${escapeHtml(card.imageAlt || '')}" width="640" height="640" decoding="async" loading="lazy" />
        </div>`
    : `<div class="orby-marketing__pro-card-media orby-marketing__pro-card-media--empty" aria-hidden="true"></div>`;

  return `<article class="orby-marketing__pro-card" data-orby-marketing-reveal="pro-card">
      <div class="orby-marketing__pro-card-surface">
        ${media}
        <div class="orby-marketing__pro-card-copy">
          <h3 class="orby-marketing__pro-card-title brand-font-headline">${escapeHtml(card.title)}</h3>
          <p class="orby-marketing__pro-card-body">${escapeHtml(card.body)}</p>
        </div>
      </div>
    </article>`;
}

function renderProSection(section) {
  const cards = (section.cards ?? [])
    .map((card) => renderProCard(card))
    .join('\n        ');
  const ledeBlock = section.lede
    ? `<p class="orby-marketing__lede orby-marketing__pro-lede">${escapeHtml(section.lede)}</p>`
    : '';

  return `<section class="orby-marketing__section orby-marketing__section--pro" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__inner orby-marketing__pro">
      <header class="orby-marketing__pro-header">
        <p class="orby-marketing__eyebrow">${escapeHtml(section.eyebrow || 'For pros')}</p>
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title">${renderIntroHeadline(section.title)}</h2>
        ${ledeBlock}
      </header>
      <div class="orby-marketing__pro-grid">
        ${cards}
      </div>
    </div>
  </section>`;
}

function renderFaqSection(section) {
  const items = (section.faq ?? [])
    .map(
      (item) => `<article class="orby-marketing__faq-item" data-orby-marketing-reveal="faq-item">
        <div class="orby-marketing__faq-icon">${FAQ_ICON_SVG}</div>
        <div class="orby-marketing__faq-body">
          <h3 class="orby-marketing__faq-question">${escapeHtml(item.question)}</h3>
          <p class="orby-marketing__faq-answer">${escapeHtml(item.answer)}</p>
        </div>
      </article>`,
    )
    .join('\n          ');

  const ledeBlock = section.lede
    ? `<p class="orby-marketing__lede orby-marketing__faq-lede" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>`
    : '';

  return `<section class="orby-marketing__section orby-marketing__section--faq" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__inner orby-marketing__faq">
      <header class="orby-marketing__faq-header">
        <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow || 'FAQ')}</p>
        ${ledeBlock}
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
      </header>
      <div class="orby-marketing__faq-grid">
        ${items}
      </div>
    </div>
  </section>`;
}

function renderFooterSection(section) {
  return `<footer class="orby-marketing__section orby-marketing__section--mega orby-marketing__section--footer" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__footer-stage" data-orby-marketing-float-stage aria-hidden="true">
      <img
        class="orby-marketing__intro-asset orby-marketing__intro-asset--right"
        src="./assets/marketing/intro-asset-right.png"
        alt=""
        width="1300"
        height="1225"
        decoding="async"
        data-orby-marketing-intro-asset="right"
      />
    </div>
    <div class="orby-marketing__footer-center">
      <h2 class="orby-marketing__title orby-marketing__title--intro orby-marketing__title--footer brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      ${
        section.lede
          ? `<p class="orby-marketing__lede orby-marketing__lede--footer" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>`
          : ''
      }
      <div class="orby-marketing__footer-actions">
        ${orbyMagicButtonOnLimeHtml(escapeHtml(section.ctaLabel || 'Browse Files'), {
          extraClass: 'orby-marketing__cta',
          attrs: 'data-orby-marketing-browse',
          variant: 'outline',
        })}
        ${orbyMagicButtonOnLimeHtml(escapeHtml(section.secondaryCtaLabel || 'Load Sample'), {
          extraClass: 'orby-marketing__cta',
          attrs: 'data-orby-marketing-load-sample',
          variant: 'outline',
        })}
      </div>
    </div>
    ${renderFooterMeta(section)}
  </footer>`;
}

function renderFooterMeta(section) {
  const contactEmail = section.footerContactEmail?.trim();
  const privacyHref = section.footerPrivacyHref?.trim() || './legal/privacy-policy.html';
  const githubHref = section.footerGithubHref?.trim() || 'https://github.com/stellanjoh2/orby';
  const licenseHref = section.footerLicenseHref?.trim() || './LICENSE';
  const sep = '<span class="orby-marketing__footer-meta-sep" aria-hidden="true"> · </span>';

  const lead = `Orby is a free, open-source personal project released under the <a class="orby-marketing__footer-meta-link" href="${escapeHtml(licenseHref)}">MIT License</a>.`;

  const links = [
    `<a class="orby-marketing__footer-meta-link" href="${escapeHtml(privacyHref)}">Privacy Policy</a>`,
    `<a class="orby-marketing__footer-meta-link" href="${escapeHtml(githubHref)}" target="_blank" rel="noopener noreferrer">GitHub</a>`,
    contactEmail
      ? `<button type="button" class="orby-marketing__footer-meta-link orby-marketing__footer-meta-contact" data-orby-marketing-copy-email="${escapeHtml(contactEmail)}">Contact</button>`
      : '',
  ].filter(Boolean);

  return `<p class="orby-marketing__footer-meta">${lead}${sep}${links.join(sep)}</p>`;
}

function renderSection(section) {
  switch (section.type) {
    case 'intro':
      return renderIntroSection(section);
    case 'showcase':
      return renderShowcaseSection(section);
    case 'marquee':
      return renderPngMarqueeSection(section);
    case 'pro':
      return renderProSection(section);
    case 'faq':
      return renderFaqSection(section);
    case 'footer':
      return renderFooterSection(section);
    case 'split':
    default:
      return renderSplitSection(section);
  }
}

function buildMarketingMarkup(sections) {
  return `<div class="orby-marketing" data-orby-marketing>
    ${sections.map(renderSection).join('\n')}
  </div>`;
}

function setScrollMode(enabled) {
  document.documentElement.classList.toggle(SCROLL_CLASS, enabled);
}

async function scrollToMarketing(scheduleMount) {
  await scheduleMount();
  const root = document.getElementById(MARKETING_ROOT_ID);
  if (!root) return;
  root.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function bindMarketingInteractions(root) {
  root.addEventListener('click', (event) => {
    const browseBtn = event.target.closest('[data-orby-marketing-browse]');
    if (browseBtn) {
      event.preventDefault();
      document.getElementById('browseButton')?.click();
      return;
    }
    const sampleBtn = event.target.closest('[data-orby-marketing-load-sample]');
    if (sampleBtn) {
      event.preventDefault();
      document.getElementById('loadTestLink')?.click();
      return;
    }
    const topBtn = event.target.closest('[data-orby-marketing-scroll-top]');
    if (topBtn) {
      event.preventDefault();
      scrollToTop();
    }
  });
}

function createScrollCue(onExplore) {
  const cue = document.createElement('button');
  cue.type = 'button';
  cue.className = 'orby-marketing-scroll-cue';
  cue.setAttribute('data-orby-marketing-scroll-cue', '');
  cue.setAttribute('aria-label', 'Scroll to learn about Orby');
  cue.innerHTML = '<span class="orby-marketing-scroll-cue__icon" aria-hidden="true"></span>';
  cue.addEventListener('click', () => {
    onExplore();
  });
  document.body.appendChild(cue);
  return cue;
}

/** Fade the scroll cue out quickly once the user scrolls down. */
function bindScrollCueFade(cue) {
  const fadeStart = 1;
  const fadeEnd = 48;
  let ticking = false;

  const update = () => {
    ticking = false;
    if (!cue || cue.hidden) return;
    const y = window.scrollY;
    if (y <= fadeStart) {
      cue.classList.remove('orby-marketing-scroll-cue--hidden');
      cue.style.removeProperty('opacity');
      cue.style.removeProperty('pointer-events');
      return;
    }
    const t = Math.min(1, (y - fadeStart) / (fadeEnd - fadeStart));
    cue.classList.toggle('orby-marketing-scroll-cue--hidden', t >= 1);
    cue.style.opacity = String(1 - t);
    if (t >= 1) cue.style.pointerEvents = 'none';
    else cue.style.removeProperty('pointer-events');
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
  return () => window.removeEventListener('scroll', onScroll);
}

/**
 * @param {{ lazy?: boolean }} [options]
 */
export function initOrbyMarketingPage(options = {}) {
  if (shouldSkipMarketing()) {
    return { destroy() {} };
  }

  void import('./orbyMarketingIntroTurntable.js').then((mod) => {
    mod.preloadIntroTurntableFrames();
  });

  const lazy = options.lazy !== false;
  let root = null;
  let scrollCue = null;
  let teardownScrollCueFade = null;
  let mountPromise = null;
  let bodyObserver = null;
  let revealObserver = null;
  let megaRevealObserver = null;
  let revealModule = null;
  /** @type {(() => void) | null} */
  let teardownIntroFloat = null;
  /** @type {(() => void) | null} */
  let teardownIntroTurntable = null;
  let teardownShowcaseGallery = null;
  /** @type {(() => void) | null} */
  let teardownPngMarqueeLogotype = null;
  /** @type {Comment | null} Placeholder when #orby-marketing is detached during studio. */
  let marketingAnchor = null;
  let destroyed = false;

  function disconnectRevealObservers() {
    revealObserver?.disconnect();
    revealObserver = null;
    megaRevealObserver?.disconnect();
    megaRevealObserver = null;
  }

  function attachRevealObserver() {
    if (!root || revealObserver || !revealModule) return;
    const onReveal = (observer, entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        revealModule.revealMarketingSection(entry.target);
        observer.unobserve(entry.target);
      }
    };
    megaRevealObserver = new IntersectionObserver(
      (entries) => onReveal(megaRevealObserver, entries),
      MEGA_REVEAL_IO,
    );
    revealObserver = new IntersectionObserver(
      (entries) => onReveal(revealObserver, entries),
      DEFAULT_REVEAL_IO,
    );
    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      if (section.dataset.orbyMarketingRevealed === '1') return;
      const observer = isMegaRevealSection(section) ? megaRevealObserver : revealObserver;
      observer.observe(section);
    });
  }

  function detachMarketingFromDom() {
    if (!root?.parentElement || marketingAnchor) return;
    marketingAnchor = document.createComment('orby-marketing-anchor');
    root.parentElement.replaceChild(marketingAnchor, root);
  }

  function attachMarketingToDom() {
    if (!root || !marketingAnchor?.parentElement) return;
    marketingAnchor.parentElement.replaceChild(root, marketingAnchor);
    marketingAnchor = null;
  }

  function syncMarketingMedia(home) {
    if (!root) return;
    if (home) {
      revealModule?.resumeMarketingVideos?.(root);
      attachRevealObserver();
    } else {
      revealModule?.pauseMarketingVideos?.(root);
      disconnectRevealObservers();
    }
  }

  /** Each enhancer loads on its own — one failure must not block intro turntable, etc. */
  async function attachMarketingEnhancements() {
    if (!root || destroyed) return;

    teardownIntroFloat?.();
    teardownIntroFloat = null;
    teardownIntroTurntable?.();
    teardownIntroTurntable = null;
    teardownShowcaseGallery?.();
    teardownShowcaseGallery = null;
    teardownPngMarqueeLogotype?.();
    teardownPngMarqueeLogotype = null;

    try {
      const introFloat = await import('./orbyMarketingIntroFloat.js');
      teardownIntroFloat = introFloat.initIntroFloatParallax(root);
    } catch (err) {
      console.error('[orby-marketing] intro float failed to init', err);
    }

    try {
      const introTurntable = await import('./orbyMarketingIntroTurntable.js');
      teardownIntroTurntable = introTurntable.initIntroTurntable(root);
    } catch (err) {
      console.error('[orby-marketing] intro turntable failed to init', err);
    }

    try {
      const showcaseGallery = await import('./orbyMarketingShowcaseGallery.js');
      teardownShowcaseGallery = showcaseGallery.initShowcaseGallery(root);
    } catch (err) {
      console.error('[orby-marketing] showcase gallery failed to init', err);
    }

    try {
      const pngLogotype = await import('./orbyMarketingPngMarqueeLogotype.js');
      teardownPngMarqueeLogotype = pngLogotype.initPngMarqueeLogotype(root);
    } catch (err) {
      console.error('[orby-marketing] PNG marquee logotype failed to init', err);
    }
  }

  function suspendForStudio() {
    if (!root) return;
    teardownIntroFloat?.();
    teardownIntroFloat = null;
    teardownIntroTurntable?.();
    teardownIntroTurntable = null;
    teardownShowcaseGallery?.();
    teardownShowcaseGallery = null;
    teardownPngMarqueeLogotype?.();
    teardownPngMarqueeLogotype = null;
    revealModule?.cancelAllMarketingMotion?.(root);
    syncMarketingMedia(false);
    root.hidden = true;
    root.classList.add('orby-marketing--suspended');
    detachMarketingFromDom();
  }

  function resumeForHome() {
    attachMarketingToDom();
    if (!root) return;
    root.hidden = false;
    root.classList.remove('orby-marketing--suspended');
    setScrollMode(true);
    if (
      !teardownIntroFloat ||
      !teardownIntroTurntable ||
      !teardownShowcaseGallery ||
      !teardownPngMarqueeLogotype
    ) {
      void attachMarketingEnhancements();
    }
    syncMarketingMedia(true);
  }

  function syncHomeState() {
    if (destroyed) return;
    const home = isDropzoneHome();
    if (scrollCue) {
      scrollCue.hidden = !home;
    }
    if (!root) {
      if (home) setScrollMode(true);
      return;
    }
    if (home) {
      resumeForHome();
    } else {
      setScrollMode(false);
      suspendForStudio();
    }
  }

  async function mount() {
    if (destroyed || root) return;
    ensureStylesheet();
    const [sections, reveals] = await Promise.all([
      loadSections(),
      import('./orbyMarketingReveals.js'),
    ]);
    revealModule = reveals;
    const app = document.getElementById('app');
    if (!app) return;

    root = document.createElement('div');
    root.id = MARKETING_ROOT_ID;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'About Orby');
    root.innerHTML = buildMarketingMarkup(sections);
    app.appendChild(root);
    bindMarketingInteractions(root);
    bindMarketingCopyEmail(root);

    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      section.classList.add('orby-marketing__section--pending');
    });
    reveals.prepareMarketingSections(root);
    attachRevealObserver();
    void reveals.preloadMarketingImages(root);

    await attachMarketingEnhancements();

    syncHomeState();
  }

  function scheduleMount() {
    if (root) return Promise.resolve();
    if (mountPromise) return mountPromise;
    if (destroyed) return Promise.resolve();
    mountPromise = mount().finally(() => {
      mountPromise = null;
    });
    return mountPromise;
  }

  function onFirstScrollIntent() {
    if (!lazy || root) return;
    scheduleMount();
  }

  bodyObserver = new MutationObserver(syncHomeState);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener(
    'wheel',
    (event) => {
      if (!isDropzoneHome() || event.deltaY <= 0) return;
      onFirstScrollIntent();
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    () => {
      if (!isDropzoneHome()) return;
      onFirstScrollIntent();
    },
    { passive: true, once: true },
  );

  scrollCue = createScrollCue(() => {
    scrollToMarketing(scheduleMount);
  });
  teardownScrollCueFade = bindScrollCueFade(scrollCue);
  if (lazy) {
    const runMount = () => {
      if (!destroyed && isDropzoneHome()) scheduleMount();
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runMount, { timeout: 400 });
    } else {
      setTimeout(runMount, 200);
    }
  } else {
    scheduleMount();
  }

  syncHomeState();

  return {
    destroy() {
      destroyed = true;
      unbindMarketingCopyEmail();
      void import('./orbyMarketingIntroTurntable.js').then((mod) => {
        mod.clearIntroTurntablePreload();
      });
      teardownIntroFloat?.();
      teardownIntroFloat = null;
      teardownIntroTurntable?.();
      teardownIntroTurntable = null;
      teardownShowcaseGallery?.();
      teardownShowcaseGallery = null;
      teardownPngMarqueeLogotype?.();
      teardownPngMarqueeLogotype = null;
      bodyObserver?.disconnect();
      disconnectRevealObservers();
      teardownScrollCueFade?.();
      teardownScrollCueFade = null;
      scrollCue?.remove();
      attachMarketingToDom();
      root?.remove();
      root = null;
      marketingAnchor = null;
      scrollCue = null;
      revealModule = null;
      setScrollMode(false);
    },
  };
}
