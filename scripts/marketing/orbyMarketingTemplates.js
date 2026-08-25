/**
 * Homepage marketing section HTML — string templates only (no DOM / lifecycle).
 */
import {
  formatMarketingButtonLabel,
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

/** @param {string} label */
function escapeMarketingButtonLabel(label) {
  return escapeMarketingHtml(formatMarketingButtonLabel(label));
}

/**
 * Product lockup: Name™ — rest. Uses Mattone’s trademark glyph (U+2122).
 * @param {string} title
 * @param {string[]} [gradientPhrases]
 */
function renderInProgressTitleHtml(title, gradientPhrases) {
  const raw = String(title ?? '');
  const separator = ' — ';
  const dashIndex = raw.indexOf(separator);
  if (dashIndex <= 0) {
    return renderMarketingBodyHtml(raw, gradientPhrases);
  }
  const name = raw.slice(0, dashIndex);
  const rest = raw.slice(dashIndex);
  return `${escapeMarketingHtml(name)}<span class="orby-marketing__tm" aria-hidden="true">\u2122</span>${renderMarketingBodyHtml(rest, gradientPhrases)}`;
}

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
      ${orbyMagicButtonHtml(escapeMarketingButtonLabel(section.ctaLabel), {
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
 * @param {{ square?: boolean }} [options]
 */
function renderFlipGallerySlideImages(slides, options = {}) {
  const { square = false } = options;
  const sizeAttrs = square ? ' width="640" height="640"' : '';
  return slides
    .map((slide, index) => {
      const active = index === 0 ? ' is-active' : '';
      const lazy = index === 0 ? '' : ' loading="lazy"';
      return `<img class="orby-marketing__showcase-img${active}" src="${escapeMarketingHtml(slide.src)}" alt="${escapeMarketingHtml(slide.alt)}" decoding="async"${sizeAttrs}${lazy} />`;
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
 * @param {MarketingGallerySlide[]} slides
 */
function renderShowcaseSlideImages(slides) {
  return slides
    .map((slide, index) => {
      const active = index === 0 ? ' is-active' : '';
      const lazy = index === 0 ? '' : ' loading="lazy"';
      const creditAttr = slide.credit ? ` data-credit="${escapeMarketingHtml(slide.credit)}"` : '';
      const imageCreditAttr = slide.imageCredit
        ? ` data-image-credit="${escapeMarketingHtml(JSON.stringify(slide.imageCredit))}"`
        : '';
      return `<img class="orby-marketing__showcase-img${active}" src="${escapeMarketingHtml(slide.src)}" alt="${escapeMarketingHtml(slide.alt)}" width="1024" height="576" decoding="async"${creditAttr}${imageCreditAttr}${lazy} />`;
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
    const playVideo = section.playVideo === true;
    const playHref = typeof section.playVideoHref === 'string' ? section.playVideoHref.trim() : '';
    const playSrcExplicit =
      typeof section.playVideoSrc === 'string' ? section.playVideoSrc.trim() : '';
    // Embed href wins for the lightbox; keep local playSrc only when no embed (or an explicit full trailer).
    const playSrc = playSrcExplicit || (!playHref ? videoSrc : '') || '';
    const playHrefAttr = playHref ? ` data-play-href="${escapeMarketingHtml(playHref)}"` : '';
    const playSrcAttr = playSrc ? ` data-play-src="${escapeMarketingHtml(playSrc)}"` : '';
    const playOverlay = playVideo
      ? `<button type="button" class="orby-marketing__play-hit" data-orby-marketing-play-video${playSrcAttr}${playHrefAttr} aria-label="Play video">
          <span class="orby-marketing__play-icon" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
        </button>`
      : '';
    const playMaskClass = playVideo ? ' orby-marketing__figure-mask--play' : '';
    return `<figure class="orby-marketing__figure">
      <div class="orby-marketing__figure-mask${playMaskClass}" data-orby-marketing-reveal="media" data-reveal-dir="${escapeMarketingHtml(revealDir)}">
        <span class="orby-marketing__media-ph" aria-hidden="true"></span>
        <video class="orby-marketing__figure-media orby-marketing__figure-video" src="${escapeMarketingHtml(videoSrc)}"${posterAttr} ${MARKETING_VIDEO_HTML_ATTRS} aria-label="${escapeMarketingHtml(imageAlt || 'Feature preview video')}"></video>
        ${playOverlay}
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

function renderInProgressCta(project) {
  if (!project.ctaLabel || !project.ctaHref) return '';
  const isExternal = /^https?:\/\//i.test(project.ctaHref);
  return `<div class="orby-marketing__split-cta">
      ${orbyMagicButtonMonoLinkHtml(escapeMarketingButtonLabel(project.ctaLabel), escapeMarketingHtml(project.ctaHref), {
        extraClass: 'orby-marketing__cta',
        attrs: isExternal ? 'target="_blank" rel="noopener noreferrer"' : '',
      })}
    </div>`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingInProgressProject} project
 * @param {{ isLast: boolean }} options
 */
function renderInProgressProject(project, { isLast }) {
  const mediaLeft = project.layout === 'media-left';
  const bleedClass = mediaLeft
    ? 'orby-marketing__split-bleed orby-marketing__split-bleed--media-left'
    : 'orby-marketing__split-bleed orby-marketing__split-bleed--media-right';
  const revealDir = mediaLeft ? 'rtl' : 'ltr';
  const lastClass = isLast ? ' orby-marketing__section--in-progress-last' : '';

  return `<section class="orby-marketing__section orby-marketing__section--in-progress${lastClass}" id="${escapeMarketingHtml(project.id)}" aria-labelledby="${escapeMarketingHtml(project.id)}-title">
        <div class="${bleedClass}">
          <div class="orby-marketing__split-copy">
            <div class="orby-marketing__split-copy-inner">
              <p class="orby-marketing__eyebrow">${escapeMarketingHtml(project.eyebrow)}</p>
              <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(project.id)}-title"><span class="orby-marketing__title-line">${renderInProgressTitleHtml(project.title, project.gradientPhrases)}</span></h2>
              <p class="orby-marketing__lede">${escapeMarketingHtml(project.lede)}</p>
              ${renderInProgressCta(project)}
            </div>
          </div>
          <div class="orby-marketing__split-media">
            ${renderFigure(project, revealDir)}
          </div>
        </div>
      </section>`;
}

function renderInProgressSection(section, ctaSection) {
  const projects = Array.isArray(section.projects) ? section.projects : [];
  const projectMarkup = projects
    .map((project, index) =>
      renderInProgressProject(project, { isLast: index === projects.length - 1 }),
    )
    .join('\n');

  return `<div class="orby-marketing__in-progress-reveal" id="${escapeMarketingHtml(section.id)}" data-orby-marketing-in-progress-reveal>
    <div class="orby-marketing__in-progress-panel" data-orby-marketing-in-progress-panel>
      ${projectMarkup}
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
      <p class="orby-marketing__intro-mobile-notice">On a phone? Browse a GLB below to style and export — or open the full studio on desktop.</p>
      <div class="orby-marketing__intro-center-stack">
      ${section.eyebrow ? `<p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.eyebrow)}</p>` : ''}
      <h2 class="orby-marketing__title orby-marketing__title--intro brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      <p class="orby-marketing__lede orby-marketing__lede--intro" data-orby-marketing-reveal="text">${renderMarketingBodyHtml(section.lede, section.gradientPhrases)}</p>
      <div class="orby-marketing__intro-actions">
        ${orbyMagicButtonHtml(escapeMarketingButtonLabel('Browse files'), {
          extraClass: 'orby-marketing__intro-browse',
          attrs: 'data-orby-marketing-browse',
        })}
      </div>
      </div>
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
  if (!pngSrc) return { primary: pngSrc, fallback: '' };
  const match = pngSrc.match(/^(.+\.png)(\?.*)?$/i);
  if (!match) return { primary: pngSrc, fallback: '' };
  const [, pngPath, query = ''] = match;
  const webpSrc = `${pngPath.replace(/\.png$/i, '.webp')}${query}`;
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
    <div class="orby-marketing__centered-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeMarketingHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
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
        ><span class="orby-marketing__png-marquee-logotype-mark" role="img" aria-label="Orby"></span></div>
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
    <div class="orby-marketing__centered-copy">
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
          ${renderFlipGallerySlideImages(flipSlides, { square: true })}
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
          <h3 class="orby-marketing__pro-card-title">${escapeMarketingHtml(card.title)}</h3>
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
        <p class="orby-marketing__eyebrow">${escapeMarketingHtml(section.eyebrow || 'More tools')}</p>
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeMarketingHtml(section.id)}-title">${renderIntroHeadline(section.title)}</h2>
        ${ledeBlock}
      </header>
      <div class="orby-marketing__pro-grid">
        ${cards}
      </div>
    </div>
  </section>`;
}

/** FAQ: lime headline only — never render eyebrow or white lede above it. */
function renderFaqSection(section) {
  const items = (section.faq ?? [])
    .map(
      (item) => `<article class="orby-marketing__faq-item" data-orby-marketing-reveal="faq-item">
        <div class="orby-marketing__faq-body">
          <div class="orby-marketing__faq-question-row">
            <div class="orby-marketing__faq-icon">${FAQ_ICON_SVG}</div>
            <h3 class="orby-marketing__faq-question">${escapeMarketingHtml(item.question)}</h3>
          </div>
          <p class="orby-marketing__faq-answer">${escapeMarketingHtml(item.answer)}</p>
        </div>
      </article>`,
    )
    .join('\n          ');

  return `<section class="orby-marketing__section orby-marketing__section--faq" id="${escapeMarketingHtml(section.id)}" aria-labelledby="${escapeMarketingHtml(section.id)}-title">
    <div class="orby-marketing__inner orby-marketing__faq">
      <header class="orby-marketing__faq-header">
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
        src="./assets/marketing/intro-asset-right-cta.png"
        alt=""
        width="1440"
        height="1041"
        decoding="async"
        aria-hidden="true"
        data-orby-marketing-intro-asset="right"
      />
    </div>
    <div class="orby-marketing__cta-center">
      <h2 class="orby-marketing__title orby-marketing__title--intro brand-font-headline" id="${escapeMarketingHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      ${
        section.lede
          ? `<p class="orby-marketing__lede orby-marketing__lede--intro" data-orby-marketing-reveal="text">${renderMarketingBodyHtml(section.lede, section.gradientPhrases)}</p>`
          : ''
      }
      <div class="orby-marketing__cta-actions">
        ${orbyMagicButtonOnLimeHtml(escapeMarketingButtonLabel(section.ctaLabel || 'Browse files'), {
          extraClass: 'orby-marketing__cta',
          attrs: 'data-orby-marketing-browse',
          variant: 'outline',
        })}
        ${orbyMagicButtonOnLimeHtml(escapeMarketingButtonLabel(section.secondaryCtaLabel || 'Load sample'), {
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

const FOOTER_X_ICON =
  '<span class="orby-marketing__footer-social-icon orby-marketing__footer-social-icon--x" aria-hidden="true"></span>';

const FOOTER_GITHUB_ICON =
  '<span class="orby-marketing__footer-social-icon orby-marketing__footer-social-icon--github" aria-hidden="true"></span>';

/**
 * @typedef {Object} MarketingSiteNavFields
 * @property {string} contactEmail
 * @property {string} privacyHref
 * @property {string} aboutHref
 * @property {string} creditsHref
 * @property {string} supportHref
 * @property {string} statsHref
 * @property {string} brandHref
 * @property {string} githubHref
 * @property {string} instagramHref
 * @property {string} xHref
 * @property {string} licenseHref
 */

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 * @returns {MarketingSiteNavFields}
 */
export function getMarketingFooterFields(section) {
  return {
    contactEmail: section.footerContactEmail?.trim() || '',
    privacyHref: section.footerPrivacyHref?.trim() || './legal/privacy-policy.html',
    aboutHref: section.footerAboutHref?.trim() || './about/',
    creditsHref: section.footerCreditsHref?.trim() || './credits/',
    supportHref: section.footerSupportHref?.trim() || './support/',
    statsHref: section.footerStatsHref?.trim() || './stats/',
    brandHref: section.footerBrandHref?.trim() || './brand/',
    githubHref: section.footerGithubHref?.trim() || 'https://github.com/stellanjoh2/orby',
    instagramHref: section.footerInstagramHref?.trim() || '',
    xHref: section.footerXHref?.trim() || '',
    licenseHref: section.footerLicenseHref?.trim() || './LICENSE',
  };
}

/**
 * Prefix site-root-relative hrefs for standalone pages (legal, about, support, …).
 * @param {string} href
 * @param {string} [base='./'] — e.g. `../` from `/about/index.html`
 */
export function prefixMarketingSiteHref(href, base = './') {
  const trimmed = href?.trim() || '';
  if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith('mailto:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) return trimmed;
  const root = base.endsWith('/') ? base : `${base}/`;
  if (trimmed.startsWith('./')) return `${root}${trimmed.slice(2)}`;
  return `${root}${trimmed}`;
}

/**
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 * @param {string} [base='./']
 * @returns {MarketingSiteNavFields}
 */
export function resolveMarketingSiteNavFields(section, base = './') {
  const fields = getMarketingFooterFields(section);
  return {
    contactEmail: fields.contactEmail,
    privacyHref: prefixMarketingSiteHref(fields.privacyHref, base),
    aboutHref: prefixMarketingSiteHref(fields.aboutHref, base),
    creditsHref: prefixMarketingSiteHref(fields.creditsHref, base),
    supportHref: prefixMarketingSiteHref(fields.supportHref, base),
    statsHref: prefixMarketingSiteHref(fields.statsHref, base),
    brandHref: prefixMarketingSiteHref(fields.brandHref, base),
    githubHref: fields.githubHref,
    instagramHref: fields.instagramHref,
    xHref: fields.xHref,
    licenseHref: prefixMarketingSiteHref(fields.licenseHref, base),
  };
}

/**
 * @param {string} base
 */
export function resolveMarketingHomeHref(base = './') {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}index.html`;
}

/** Shared top-nav link set — same on the marketing homepage and all subpages. */
const SITE_NAV_LINK_OPTIONS = {
  includeContact: false,
  includeBonusPages: false,
  includeStats: true,
  includeGithub: false,
};

/**
 * @param {MarketingSiteNavFields} fields
 */
function renderMarketingSiteNavMenuSocial(fields) {
  const links = [
    fields.instagramHref
      ? `<a class="orby-marketing-scroll-nav__menu-social-link" href="${escapeMarketingHtml(fields.instagramHref)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><span class="orby-marketing-scroll-nav__menu-social-icon orby-marketing-scroll-nav__menu-social-icon--instagram" aria-hidden="true"></span></a>`
      : '',
    `<a class="orby-marketing-scroll-nav__menu-social-link" href="${escapeMarketingHtml(fields.githubHref)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><span class="orby-marketing-scroll-nav__menu-social-icon orby-marketing-scroll-nav__menu-social-icon--github" aria-hidden="true"></span></a>`,
  ]
    .filter(Boolean)
    .join('');

  return `<div class="orby-marketing-scroll-nav__menu-social">${links}</div>`;
}

/**
 * @param {MarketingSiteNavFields} fields
 * @param {{ homeHref: string, brandScrollTop?: boolean }} options
 */
function renderMarketingSiteNavHtml(fields, options) {
  const { homeHref, brandScrollTop = false } = options;
  const links = renderMarketingSiteNavLinks(
    fields,
    {
      linkClass: 'orby-marketing-scroll-nav__link',
      contactClass: 'orby-marketing-scroll-nav__contact',
    },
    SITE_NAV_LINK_OPTIONS,
  );

  const brandActionAttr = brandScrollTop ? ' data-orby-marketing-scroll-top' : '';
  const brandAria = brandScrollTop ? 'Back to top' : 'Orby home';
  const brand = `<a class="orby-marketing-scroll-nav__brand" href="${escapeMarketingHtml(homeHref)}"${brandActionAttr} aria-label="${brandAria}">
        <span class="orby-marketing-scroll-nav__brand-mark" aria-hidden="true"></span>
      </a>`;

  const browseCta = orbyMagicButtonHtml(escapeMarketingButtonLabel('Browse files'), {
    extraClass: 'orby-magic-btn--nav-outline orby-marketing-scroll-nav__browse',
    attrs: 'data-orby-marketing-browse',
  });

  const menuToggle = `<button type="button" class="orby-marketing-scroll-nav__menu-toggle" data-orby-marketing-nav-toggle aria-expanded="false" aria-controls="orby-site-nav-menu" aria-label="Open menu">
        <span class="orby-marketing-scroll-nav__menu-bar" aria-hidden="true"></span>
        <span class="orby-marketing-scroll-nav__menu-bar" aria-hidden="true"></span>
        <span class="orby-marketing-scroll-nav__menu-bar" aria-hidden="true"></span>
      </button>`;

  return `<nav class="orby-marketing-scroll-nav" data-orby-marketing-scroll-nav aria-label="Site" aria-hidden="true">
    <div class="orby-marketing-scroll-nav__bar">
      ${brand}
      <div class="orby-marketing-scroll-nav__links orby-marketing-scroll-nav__links--inline">${links.join('')}</div>
      ${menuToggle}
      <div class="orby-marketing-scroll-nav__cta">${browseCta}</div>
    </div>
    <div class="orby-marketing-scroll-nav__menu" id="orby-site-nav-menu" data-orby-marketing-nav-menu aria-hidden="true">
      <div class="orby-marketing-scroll-nav__links orby-marketing-scroll-nav__links--overlay">${links.join('')}</div>
      ${renderMarketingSiteNavMenuSocial(fields)}
    </div>
  </nav>`;
}

/**
 * @param {ReturnType<typeof getMarketingFooterFields>} fields
 * @param {{ linkClass: string, contactClass: string }} classes
 * @param {{ includeContact?: boolean }} [options]
 */
function renderMarketingSiteNavLinks(fields, classes, options = {}) {
  const { linkClass, contactClass } = classes;
  const {
    includeContact = true,
    includeStats = false,
    includeBonusPages = true,
    includeGithub = true,
  } = options;
  const items = [
    `<a class="${linkClass}" href="${escapeMarketingHtml(fields.aboutHref)}">About</a>`,
    `<a class="${linkClass}" href="${escapeMarketingHtml(fields.supportHref)}">Support</a>`,
    ...(includeBonusPages
      ? [
          `<a class="${linkClass}" href="${escapeMarketingHtml(fields.privacyHref)}">Privacy Policy</a>`,
          `<a class="${linkClass}" href="${escapeMarketingHtml(fields.creditsHref)}">Credits</a>`,
          `<a class="${linkClass}" href="${escapeMarketingHtml(fields.brandHref)}">Brand</a>`,
        ]
      : []),
    includeStats
      ? `<a class="${linkClass}" href="${escapeMarketingHtml(fields.statsHref)}">Statistics</a>`
      : '',
    includeGithub
      ? `<a class="${linkClass}" href="${escapeMarketingHtml(fields.githubHref)}" target="_blank" rel="noopener noreferrer">GitHub</a>`
      : '',
    includeContact && fields.contactEmail
      ? `<button type="button" class="${linkClass} ${contactClass}" data-orby-marketing-copy-email="${escapeMarketingHtml(fields.contactEmail)}">Contact</button>`
      : '',
  ].filter(Boolean);
  return items;
}

/**
 * Site top nav — one template for the marketing homepage and all subpages.
 * @param {import('./orbyMarketingContent.js').MarketingSection} section
 * @param {string} [base='./'] — e.g. `../` from `/about/index.html`
 */
export function renderSiteNav(section, base = './') {
  const fields =
    base === './' ? getMarketingFooterFields(section) : resolveMarketingSiteNavFields(section, base);
  return renderMarketingSiteNavHtml(fields, {
    homeHref: resolveMarketingHomeHref(base),
    brandScrollTop: base === './',
  });
}

/** Static HTML for subpages — embed via `npm run inject:subpage-site-nav` (see injectSubpageSiteNav.mjs). */
export function renderStaticSubpageSiteNav(section, base = '../') {
  return renderSiteNav(section, base)
    .replace(
      'class="orby-marketing-scroll-nav"',
      'class="orby-marketing-scroll-nav orby-marketing-scroll-nav--visible"',
    )
    .replace(' aria-hidden="true"', '');
}

function renderFooterMeta(section, options = {}) {
  const fields = getMarketingFooterFields(section);
  const sep = '<span class="orby-marketing__footer-meta-sep" aria-hidden="true"> · </span>';

  const lead = `<span class="orby-marketing__footer-meta-lead">Orby is a free, open-source personal project released under the <a class="orby-marketing__footer-meta-link" href="${escapeMarketingHtml(fields.licenseHref)}">MIT License</a>.</span>`;

  const links = renderMarketingSiteNavLinks(fields, {
    linkClass: 'orby-marketing__footer-meta-link',
    contactClass: 'orby-marketing__footer-meta-contact',
  }, { includeStats: true });

  const barClass = options.onWhite
    ? 'orby-marketing__footer-bar orby-marketing__footer-bar--on-white'
    : 'orby-marketing__footer-bar';

  const brandMark =
    '<span class="orby-marketing__footer-brand-mark" aria-hidden="true"></span>';

  const socialLinks = [
    fields.instagramHref
      ? `<a class="orby-marketing__footer-social-link" href="${escapeMarketingHtml(fields.instagramHref)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram">${FOOTER_INSTAGRAM_ICON}</a>`
      : '',
    fields.xHref
      ? `<a class="orby-marketing__footer-social-link" href="${escapeMarketingHtml(fields.xHref)}" target="_blank" rel="noopener noreferrer" aria-label="X">${FOOTER_X_ICON}</a>`
      : '',
    `<a class="orby-marketing__footer-social-link" href="${escapeMarketingHtml(fields.githubHref)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub">${FOOTER_GITHUB_ICON}</a>`,
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
