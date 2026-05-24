/**
 * Homepage marketing section HTML — string templates only (no DOM / lifecycle).
 */
import {
  orbyMagicButtonHtml,
  orbyMagicButtonMonoLinkHtml,
  orbyMagicButtonOnLimeHtml,
} from '../ui/orbyMagicButton.js';
import {
  escapeMarketingHtml,
  formatMarketingImageCreditHtml,
  renderMarketingBodyHtml,
} from './orbyMarketingImageCredit.js';
import { MARKETING_VIDEO_HTML_ATTRS } from './orbyMarketingVideo.js';
import { renderRoadmapSection } from './orbyMarketingRoadmapTemplates.js';

function renderBulletList(items) {
  if (!items?.length) return '';
  return `<ul class="orby-marketing__list">${items
    .map((item) => `<li>${escapeMarketingHtml(item)}</li>`)
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
      ${orbyMagicButtonHtml(escapeMarketingHtml(section.ctaLabel), {
        extraClass: 'orby-marketing__cta',
        attrs: actionAttr,
      })}
    </div>`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingImageCredit | undefined} credit
 */
function renderMarketingImageCredit(credit) {
  const body = formatMarketingImageCreditHtml(credit);
  if (!body) return '';
  return `<p class="orby-marketing__figure-credit" data-orby-marketing-figure-credit>${body}</p>`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 */
function getSplitSlides(section) {
  if (section.gallery?.length) {
    return section.gallery.map((slide) => ({
      src: slide.src,
      alt: slide.alt || '',
      credit: slide.credit,
      imageCredit: slide.imageCredit,
    }));
  }
  if (section.imageSrc) {
    return [
      {
        src: section.imageSrc,
        alt: section.imageAlt || '',
        imageCredit: section.imageCredit,
      },
    ];
  }
  return [];
}

/** @typedef {{ src: string, alt: string, credit?: string, imageCredit?: import('./orbyMarketingContent.js').MarketingImageCredit }} MarketingGallerySlide */

/**
 * @param {number} [intervalMs]
 * @param {number} [fadeMs]
 */
function renderFlipGalleryAttrs(intervalMs, fadeMs) {
  const cycle = intervalMs ?? 1000;
  const fade = fadeMs ?? 0;
  return `data-orby-marketing-showcase-gallery data-orby-marketing-gallery-simple data-orby-marketing-gallery-flip data-gallery-cycle-ms="${cycle}" data-gallery-fade-s="${fade}"`;
}

/**
 * @param {MarketingGallerySlide[]} slides
 * @param {{ square?: boolean, eager?: boolean }} [options]
 */
function renderFlipGallerySlideImages(slides, options = {}) {
  const { square = false, eager = true } = options;
  const sizeAttrs = square ? ' width="640" height="640"' : '';
  const loading = eager ? ' loading="eager"' : ' loading="lazy"';
  return slides
    .map((slide, index) => {
      const active = index === 0 ? ' is-active' : '';
      return `<img class="orby-marketing__showcase-img${active}" src="${escapeMarketingHtml(slide.src)}" alt="${escapeMarketingHtml(slide.alt)}" decoding="async"${sizeAttrs}${loading} />`;
    })
    .join('\n        ');
}

/**
 * Split feature gallery — full-res JPEGs; no width/height attrs (natural 2560×1440 from file).
 * @param {MarketingGallerySlide[]} slides
 */
function renderSplitGallerySlideImages(slides) {
  return slides
    .map((slide, index) => {
      const active = index === 0 ? ' is-active' : '';
      const lazy = index === 0 ? '' : ' loading="lazy"';
      const creditAttr = slide.credit ? ` data-credit="${escapeMarketingHtml(slide.credit)}"` : '';
      const imageCreditAttr = slide.imageCredit
        ? ` data-image-credit="${escapeMarketingHtml(JSON.stringify(slide.imageCredit))}"`
        : '';
      return `<img class="orby-marketing__showcase-img${active}" src="${escapeMarketingHtml(slide.src)}" alt="${escapeMarketingHtml(slide.alt)}" decoding="async"${creditAttr}${imageCreditAttr}${lazy} />`;
    })
    .join('\n        ');
}

/**
 * @param {{ src: string, alt: string, credit?: string }[]} slides
 */
function renderShowcaseSlideImages(slides) {
  return slides
    .map((slide, index) => {
      const active = index === 0 ? ' is-active' : '';
      const lazy = index === 0 ? '' : ' loading="lazy"';
      const creditAttr = slide.credit ? ` data-credit="${escapeMarketingHtml(slide.credit)}"` : '';
      return `<img class="orby-marketing__showcase-img${active}" src="${escapeMarketingHtml(slide.src)}" alt="${escapeMarketingHtml(slide.alt)}" width="1024" height="576" decoding="async"${creditAttr}${lazy} />`;
    })
    .join('\n        ');
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 * @param {string} revealDir
 */
function renderFigure(section, revealDir) {
  const slides = getSplitSlides(section);
  const videoSrc = section.videoSrc || '';

  if (!slides.length && !videoSrc) return '';

  if (videoSrc) {
    const posterSrc = section.videoPoster ? slides[0]?.src || '' : '';
    const posterAttr = posterSrc ? ` poster="${escapeMarketingHtml(posterSrc)}"` : '';
    const imageAlt = slides[0]?.alt || section.imageAlt || '';
    return `<figure class="orby-marketing__figure">
      <div class="orby-marketing__figure-mask" data-orby-marketing-reveal="media" data-reveal-dir="${escapeMarketingHtml(revealDir)}">
        <span class="orby-marketing__media-ph" aria-hidden="true"></span>
        <video class="orby-marketing__figure-media orby-marketing__figure-video" src="${escapeMarketingHtml(videoSrc)}"${posterAttr} ${MARKETING_VIDEO_HTML_ATTRS} aria-label="${escapeMarketingHtml(imageAlt || 'Feature preview video')}"></video>
        ${renderMarketingImageCredit(slides[0]?.imageCredit || section.imageCredit)}
      </div>
    </figure>`;
  }

  if (slides.length > 1) {
    const flipAttrs = section.galleryFlip
      ? renderFlipGalleryAttrs(section.flipGalleryIntervalMs, section.flipGalleryFadeMs)
      : 'data-orby-marketing-showcase-gallery data-orby-marketing-gallery-simple';
    const slideMarkup = section.galleryFlip
      ? renderFlipGallerySlideImages(slides)
      : renderSplitGallerySlideImages(slides);
    return `<figure class="orby-marketing__figure">
      <div class="orby-marketing__figure-mask orby-marketing__figure-mask--gallery${section.galleryFlip ? ' orby-marketing__figure-mask--flip' : ''}" ${flipAttrs} data-orby-marketing-reveal="media" data-reveal-dir="${escapeMarketingHtml(revealDir)}" aria-label="${escapeMarketingHtml(section.eyebrow || 'Feature')} previews">
        <span class="orby-marketing__media-ph" aria-hidden="true"></span>
        ${slideMarkup}
        <p class="orby-marketing__figure-credit orby-marketing__figure-credit--static" data-orby-marketing-showcase-credit hidden></p>
      </div>
    </figure>`;
  }

  const slide = slides[0];
  return `<figure class="orby-marketing__figure">
      <div class="orby-marketing__figure-mask" data-orby-marketing-reveal="media" data-reveal-dir="${escapeMarketingHtml(revealDir)}">
        <span class="orby-marketing__media-ph" aria-hidden="true"></span>
        <img class="orby-marketing__figure-media orby-marketing__figure-img" src="${escapeMarketingHtml(slide.src)}" alt="${escapeMarketingHtml(slide.alt)}" decoding="async" />
        ${renderMarketingImageCredit(slide.imageCredit)}
      </div>
    </figure>`;
}

function renderInProgressCta(section) {
  if (!section.ctaLabel || !section.ctaHref) return '';
  return `<div class="orby-marketing__split-cta">
      ${orbyMagicButtonMonoLinkHtml(escapeMarketingHtml(section.ctaLabel), escapeMarketingHtml(section.ctaHref), {
        extraClass: 'orby-marketing__cta',
      })}
    </div>`;
}

function renderInProgressSection(section, ctaSection) {
  const mediaLeft = section.layout === 'media-left';
  const bleedClass = mediaLeft
    ? 'orby-marketing__split-bleed orby-marketing__split-bleed--media-left'
    : 'orby-marketing__split-bleed orby-marketing__split-bleed--media-right';
  const revealDir = mediaLeft ? 'rtl' : 'ltr';

  return `<div class="orby-marketing__in-progress-reveal-spacer" data-orby-marketing-in-progress-spacer aria-hidden="true"></div>
  <div class="orby-marketing__in-progress-reveal" data-orby-marketing-in-progress-reveal>
    <div class="orby-marketing__in-progress-panel" data-orby-marketing-in-progress-panel>
      <section class="orby-marketing__section orby-marketing__section--in-progress" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
        <div class="${bleedClass}">
          <div class="orby-marketing__split-copy">
            <div class="orby-marketing__split-copy-inner">
              <p class="orby-marketing__eyebrow">${escapeMarketingHtml(section.eyebrow)}</p>
              <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title">${renderIntroHeadline(section.title)}</h2>
              <p class="orby-marketing__lede">${escapeMarketingHtml(section.lede)}</p>
              ${renderInProgressCta(section)}
            </div>
          </div>
          <div class="orby-marketing__split-media">
            ${renderFigure(section, revealDir)}
          </div>
        </div>
      </section>
      ${ctaSection ? renderFooterMeta(ctaSection, { onWhite: true }) : ''}
    </div>
  </div>`;
}

function renderSplitSection(section) {
  const mediaLeft = section.layout === 'media-left';
  const bleedClass = mediaLeft
    ? 'orby-marketing__split-bleed orby-marketing__split-bleed--media-left'
    : 'orby-marketing__split-bleed orby-marketing__split-bleed--media-right';
  const revealDir = mediaLeft ? 'rtl' : 'ltr';

  return `<section class="orby-marketing__section orby-marketing__section--split" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="${bleedClass}">
      <div class="orby-marketing__split-copy">
        <div class="orby-marketing__split-copy-inner">
          <p class="orby-marketing__eyebrow">${escapeMarketingHtml(section.eyebrow)}</p>
          <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title">${renderIntroHeadline(section.title)}</h2>
          <p class="orby-marketing__lede">${escapeMarketingHtml(section.lede)}</p>
          ${renderBulletList(section.bullets)}
          ${renderMagicCta(section)}
        </div>
      </div>
      <div class="orby-marketing__split-media">
        ${renderFigure(section, revealDir)}
      </div>
    </div>
  </section>`;
}

function renderIntroHeadline(title) {
  return String(title)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<span class="orby-marketing__title-line">${escapeMarketingHtml(line)}</span>`)
    .join('');
}

function renderIntroSection(section) {
  return `<section class="orby-marketing__section orby-marketing__section--mega orby-marketing__section--intro orby-marketing__section--intro-turntable" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__intro-stage" aria-hidden="true">
        <div class="orby-marketing__intro-turntable-wrap">
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
      ${section.eyebrow ? `<p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.eyebrow)}</p>` : ''}
      <h2 class="orby-marketing__title orby-marketing__title--intro brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      <p class="orby-marketing__lede orby-marketing__lede--intro" data-orby-marketing-reveal="text">${renderMarketingBodyHtml(section.lede, section.gradientPhrases)}</p>
    </div>
  </section>`;
}

function getShowcaseSlides(section) {
  return section.gallery?.length
    ? section.gallery
    : section.imageSrc
      ? [{ src: section.imageSrc, alt: section.imageAlt || '', credit: undefined }]
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
  return renderShowcaseSlideImages(getShowcaseSlides(section));
}

function pngMarqueeDeliverySrc(pngSrc) {
  if (!pngSrc || !/\.png$/i.test(pngSrc)) return { primary: pngSrc, fallback: '' };
  const webpSrc = pngSrc.replace(/\.png$/i, '.webp');
  return { primary: webpSrc, fallback: pngSrc };
}

function renderPngMarqueeItems(items) {
  return items
    .map((item) => {
      const { primary, fallback } = pngMarqueeDeliverySrc(item.src);
      const picture =
        fallback && primary !== fallback
          ? `<picture>
            <source type="image/webp" srcset="${escapeMarketingHtml(primary)}" />
            <img
              class="orby-marketing__png-marquee-img"
              src="${escapeMarketingHtml(fallback)}"
              alt="${escapeMarketingHtml(item.alt)}"
              decoding="async"
              loading="lazy"
            />
          </picture>`
          : `<img
              class="orby-marketing__png-marquee-img"
              src="${escapeMarketingHtml(primary)}"
              alt="${escapeMarketingHtml(item.alt)}"
              decoding="async"
              loading="lazy"
            />`;
      return `<li class="orby-marketing__png-marquee-item">${picture}</li>`;
    })
    .join('\n          ');
}

function renderPngMarqueeSection(section) {
  const items = section.marquee ?? [];
  const itemHtml = renderPngMarqueeItems(items);
  const duplicateHtml = renderPngMarqueeItems(items);

  return `<section class="orby-marketing__section orby-marketing__section--marquee" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__marquee-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.title)}</h2>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.lede)}</p>
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
    ? `<video class="orby-marketing__video" src="${escapeMarketingHtml(section.videoSrc)}" poster="${escapeMarketingHtml(section.gallery?.[0]?.src || section.imageSrc || '')}" ${MARKETING_VIDEO_HTML_ATTRS}></video>`
    : '';
  return `<section class="orby-marketing__section orby-marketing__section--showcase" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__showcase-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.lede)}</p>
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
  const flipSlides = card.flipGallery?.length >= 2 ? card.flipGallery : null;
  const videoSrc = card.videoSrc || '';
  const posterAttr =
    videoSrc && card.videoPoster && card.imageSrc
      ? ` poster="${escapeMarketingHtml(card.imageSrc)}"`
      : '';
  const media = flipSlides
    ? `<div class="orby-marketing__pro-card-media orby-marketing__pro-card-media--flip" ${renderFlipGalleryAttrs(card.flipGalleryIntervalMs, card.flipGalleryFadeMs)}>
          <span class="orby-marketing__media-ph" aria-hidden="true"></span>
          ${renderFlipGallerySlideImages(flipSlides, { square: true, eager: true })}
        </div>`
    : videoSrc
      ? `<div class="orby-marketing__pro-card-media">
          <span class="orby-marketing__media-ph" aria-hidden="true"></span>
          <video class="orby-marketing__pro-card-video" src="${escapeMarketingHtml(videoSrc)}"${posterAttr} ${MARKETING_VIDEO_HTML_ATTRS} aria-label="${escapeMarketingHtml(card.imageAlt || 'Feature preview video')}"></video>
        </div>`
    : card.imageSrc
      ? `<div class="orby-marketing__pro-card-media">
          <span class="orby-marketing__media-ph" aria-hidden="true"></span>
          <img class="orby-marketing__pro-card-img" src="${escapeMarketingHtml(card.imageSrc)}" alt="${escapeMarketingHtml(card.imageAlt || '')}" width="640" height="640" decoding="async" loading="lazy" />
        </div>`
      : `<div class="orby-marketing__pro-card-media orby-marketing__pro-card-media--empty" aria-hidden="true"></div>`;

  return `<article class="orby-marketing__pro-card" data-orby-marketing-reveal="pro-card">
      <div class="orby-marketing__pro-card-surface">
        ${media}
        <div class="orby-marketing__pro-card-copy">
          <h3 class="orby-marketing__pro-card-title brand-font-headline">${escapeMarketingHtml(card.title)}</h3>
          <p class="orby-marketing__pro-card-body">${escapeMarketingHtml(card.body)}</p>
        </div>
      </div>
    </article>`;
}

function renderProSection(section) {
  const cards = (section.cards ?? [])
    .map((card) => renderProCard(card))
    .join('\n        ');
  const ledeBlock = section.lede
    ? `<p class="orby-marketing__lede orby-marketing__pro-lede">${escapeMarketingHtml(section.lede)}</p>`
    : '';

  return `<section class="orby-marketing__section orby-marketing__section--pro" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__inner orby-marketing__pro">
      <header class="orby-marketing__pro-header">
        <p class="orby-marketing__eyebrow">${escapeMarketingHtml(section.eyebrow || 'For pros')}</p>
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title">${renderIntroHeadline(section.title)}</h2>
        ${ledeBlock}
      </header>
      <div class="orby-marketing__pro-grid">
        ${cards}
      </div>
    </div>
  </section>`;
}

/** FAQ: eyebrow + title only — never render a white lede above the lime headline. */
function renderFaqSection(section) {
  const items = (section.faq ?? [])
    .map(
      (item) => `<article class="orby-marketing__faq-item" data-orby-marketing-reveal="faq-item">
        <div class="orby-marketing__faq-icon">${FAQ_ICON_SVG}</div>
        <div class="orby-marketing__faq-body">
          <h3 class="orby-marketing__faq-question">${escapeMarketingHtml(item.question)}</h3>
          <p class="orby-marketing__faq-answer">${escapeMarketingHtml(item.answer)}</p>
        </div>
      </article>`,
    )
    .join('\n          ');

  return `<section class="orby-marketing__section orby-marketing__section--faq" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__inner orby-marketing__faq">
      <header class="orby-marketing__faq-header">
        <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.eyebrow || 'FAQ')}</p>
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.title)}</h2>
      </header>
      <div class="orby-marketing__faq-grid">
        ${items}
      </div>
    </div>
  </section>`;
}

function renderCtaSection(section) {
  return `<section class="orby-marketing__section orby-marketing__section--mega orby-marketing__section--cta" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__cta-stage" aria-hidden="true">
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
    <div class="orby-marketing__cta-center">
      <h2 class="orby-marketing__title orby-marketing__title--intro orby-marketing__title--cta brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      ${
        section.lede
          ? `<p class="orby-marketing__lede orby-marketing__lede--cta" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.lede)}</p>`
          : ''
      }
      <div class="orby-marketing__cta-actions">
        ${orbyMagicButtonOnLimeHtml(escapeMarketingHtml(section.ctaLabel || 'Browse Files'), {
          extraClass: 'orby-marketing__cta',
          attrs: 'data-orby-marketing-browse',
          variant: 'outline',
        })}
        ${orbyMagicButtonOnLimeHtml(escapeMarketingHtml(section.secondaryCtaLabel || 'Load Sample'), {
          extraClass: 'orby-marketing__cta',
          attrs: 'data-orby-marketing-load-sample',
          variant: 'outline',
        })}
      </div>
    </div>
  </section>`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 * @param {{ onWhite?: boolean }} [options]
 */
const FOOTER_INSTAGRAM_ICON =
  '<span class="orby-marketing__footer-social-icon orby-marketing__footer-social-icon--instagram" aria-hidden="true"></span>';

const FOOTER_GITHUB_ICON =
  '<span class="orby-marketing__footer-social-icon orby-marketing__footer-social-icon--github" aria-hidden="true"></span>';

function renderFooterMeta(section, options = {}) {
  const contactEmail = section.footerContactEmail?.trim();
  const privacyHref = section.footerPrivacyHref?.trim() || './legal/privacy-policy.html';
  const aboutHref = section.footerAboutHref?.trim() || './about/';
  const creditsHref = section.footerCreditsHref?.trim() || './credits/';
  const githubHref = section.footerGithubHref?.trim() || 'https://github.com/stellanjoh2/orby';
  const instagramHref = section.footerInstagramHref?.trim() || '';
  const licenseHref = section.footerLicenseHref?.trim() || './LICENSE';
  const sep = '<span class="orby-marketing__footer-meta-sep" aria-hidden="true"> · </span>';

  const lead = `Orby is a free, open-source personal project released under the <a class="orby-marketing__footer-meta-link" href="${escapeMarketingHtml(licenseHref)}">MIT License</a>.`;

  const links = [
    `<a class="orby-marketing__footer-meta-link" href="${escapeMarketingHtml(aboutHref)}">About</a>`,
    `<a class="orby-marketing__footer-meta-link" href="${escapeMarketingHtml(privacyHref)}">Privacy Policy</a>`,
    `<a class="orby-marketing__footer-meta-link" href="${escapeMarketingHtml(creditsHref)}">Credits</a>`,
    `<a class="orby-marketing__footer-meta-link" href="${escapeMarketingHtml(githubHref)}" target="_blank" rel="noopener noreferrer">GitHub</a>`,
    contactEmail
      ? `<button type="button" class="orby-marketing__footer-meta-link orby-marketing__footer-meta-contact" data-orby-marketing-copy-email="${escapeMarketingHtml(contactEmail)}">Contact</button>`
      : '',
  ].filter(Boolean);

  const barClass = options.onWhite
    ? 'orby-marketing__footer-bar orby-marketing__footer-bar--on-white'
    : 'orby-marketing__footer-bar';

  const brandMark =
    '<span class="orby-marketing__footer-brand-mark" aria-hidden="true"></span>';

  const socialLinks = [
    instagramHref
      ? `<a class="orby-marketing__footer-social-link" href="${escapeMarketingHtml(instagramHref)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">${FOOTER_INSTAGRAM_ICON}</a>`
      : '',
    `<a class="orby-marketing__footer-social-link" href="${escapeMarketingHtml(githubHref)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub">${FOOTER_GITHUB_ICON}</a>`,
  ]
    .filter(Boolean)
    .join('');

  return `<div class="${barClass}">
    <button type="button" class="orby-marketing__footer-brand" data-orby-marketing-scroll-top aria-label="Back to top">${brandMark}</button>
    <p class="orby-marketing__footer-meta-copy">${lead}${sep}${links.join(sep)}</p>
    <div class="orby-marketing__footer-social">${socialLinks}</div>
  </div>`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 * @param {import('./orbyMarketingContent.js').MarketingSection | undefined} ctaSection — supplies footer link fields for the legal strip
 */
function renderSection(section, ctaSection) {
  switch (section.type) {
    case 'intro':
      return renderIntroSection(section);
    case 'showcase':
      return renderShowcaseSection(section);
    case 'marquee':
      return renderPngMarqueeSection(section);
    case 'pro':
      return renderProSection(section);
    case 'roadmap':
      return renderRoadmapSection(section);
    case 'faq':
      return renderFaqSection(section);
    case 'cta':
      return renderCtaSection(section);
    case 'in-progress':
      return renderInProgressSection(section, ctaSection);
    case 'split':
    default:
      return renderSplitSection(section);
  }
}

/** @param {import('./orbyMarketingContent.js').MarketingSection[]} sections */
export function buildMarketingMarkup(sections) {
  const ctaSection = sections.find((s) => s.type === 'cta');
  return `<div class="orby-marketing" data-orby-marketing>
    ${sections.map((section) => renderSection(section, ctaSection)).join('\n')}
  </div>`;
}
