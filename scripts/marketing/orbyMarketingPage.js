/**
 * Homepage marketing one-pager — mounted below the dropzone hero.
 * Kept separate from the studio runtime: lazy DOM, lazy CSS, no Three.js coupling.
 */

const MARKETING_ROOT_ID = 'orby-marketing';
const STYLES_HREF = './styles/orby-marketing.css';
const SCROLL_CLASS = 'orby-home-scroll';

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

function renderBulletList(items) {
  if (!items?.length) return '';
  return `<ul class="orby-marketing__list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
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
          <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title">${escapeHtml(section.title)}</h2>
          <div class="orby-marketing__title-spacer" aria-hidden="true"></div>
          <p class="orby-marketing__lede">${escapeHtml(section.lede)}</p>
          ${renderBulletList(section.bullets)}
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
    .map((line) => escapeHtml(line.trim()))
    .filter(Boolean)
    .join('<br />');
}

function renderIntroSection(section) {
  return `<section class="orby-marketing__section orby-marketing__section--intro" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__intro-stage" data-orby-marketing-float-stage aria-hidden="true">
      <img
        class="orby-marketing__intro-asset orby-marketing__intro-asset--left"
        src="./assets/marketing/intro-asset-left.png"
        alt=""
        width="1300"
        height="1225"
        decoding="async"
        data-orby-marketing-intro-asset="left"
      />
    </div>
    <div class="orby-marketing__intro-center">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title orby-marketing__title--intro brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${renderIntroHeadline(section.title)}</h2>
      <p class="orby-marketing__lede orby-marketing__lede--intro" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
  </section>`;
}

function renderShowcaseSlides(section) {
  const slides = section.gallery?.length
    ? section.gallery
    : section.imageSrc
      ? [{ src: section.imageSrc, alt: section.imageAlt || '' }]
      : [];
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

function renderShowcaseSection(section) {
  const video = section.videoSrc
    ? `<video class="orby-marketing__video" src="${escapeHtml(section.videoSrc)}" poster="${escapeHtml(section.gallery?.[0]?.src || section.imageSrc || '')}" playsinline muted loop preload="none"></video>`
    : '';
  return `<section class="orby-marketing__section orby-marketing__section--showcase" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__showcase-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
      <div class="orby-marketing__title-spacer" aria-hidden="true"></div>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
    <figure class="orby-marketing__showcase-figure">
      <div class="orby-marketing__showcase-mask" data-orby-marketing-showcase-gallery data-orby-marketing-reveal="media" data-reveal-dir="ltr">
        ${renderShowcaseSlides(section)}
        <p class="orby-marketing__showcase-credit" data-orby-marketing-showcase-credit hidden></p>
        ${video}
      </div>
    </figure>
  </section>`;
}

const FAQ_ICON_SVG = `<svg class="orby-marketing__faq-icon-svg" width="32" height="32" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.496 6.033h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286a.237.237 0 0 0 .241.247zm2.325 6.443c.61 0 1.029-.394 1.029-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94 0 .533.425.927 1.01.927z"/></svg>`;

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
        <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
        ${ledeBlock}
      </header>
      <div class="orby-marketing__faq-grid">
        ${items}
      </div>
    </div>
  </section>`;
}

function renderFooterSection(section) {
  return `<footer class="orby-marketing__section orby-marketing__section--footer" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
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
        <button type="button" class="orby-marketing__cta orby-marketing__cta--primary orby-marketing__cta--on-lime dropzone-btn" data-orby-marketing-browse>${escapeHtml(section.ctaLabel || 'Browse Files')}</button>
        <button type="button" class="orby-marketing__cta orby-marketing__cta--outline dropzone-btn" data-orby-marketing-load-sample>${escapeHtml(section.secondaryCtaLabel || 'Load Sample')}</button>
      </div>
    </div>
  </footer>`;
}

function renderSection(section) {
  switch (section.type) {
    case 'intro':
      return renderIntroSection(section);
    case 'showcase':
      return renderShowcaseSection(section);
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
  cue.innerHTML =
    '<span class="orby-marketing-scroll-cue__label">Explore Orby</span><span class="orby-marketing-scroll-cue__icon" aria-hidden="true"></span>';
  cue.addEventListener('click', () => {
    onExplore();
  });
  document.body.appendChild(cue);
  return cue;
}

/** Fade the home scroll cue once the user starts scrolling. */
function bindScrollCueFade(cue) {
  const fadeStart = 12;
  const fadeEnd = 140;
  let ticking = false;

  const update = () => {
    ticking = false;
    if (!cue || cue.hidden) return;
    const y = window.scrollY;
    if (y <= fadeStart) {
      cue.classList.remove('orby-marketing-scroll-cue--scrolled');
      cue.style.removeProperty('opacity');
      return;
    }
    const t = Math.min(1, (y - fadeStart) / (fadeEnd - fadeStart));
    cue.classList.toggle('orby-marketing-scroll-cue--scrolled', t >= 1);
    cue.style.opacity = String(0.72 * (1 - t));
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

  const lazy = options.lazy !== false;
  let root = null;
  let scrollCue = null;
  let teardownScrollCueFade = null;
  let mountPromise = null;
  let bodyObserver = null;
  let revealObserver = null;
  let revealModule = null;
  /** @type {(() => void) | null} */
  let teardownIntroFloat = null;
  let teardownShowcaseGallery = null;
  /** @type {Comment | null} Placeholder when #orby-marketing is detached during studio. */
  let marketingAnchor = null;
  let destroyed = false;

  function attachRevealObserver() {
    if (!root || revealObserver || !revealModule) return;
    revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          revealModule.revealMarketingSection(entry.target);
          revealObserver.unobserve(entry.target);
        }
      },
      { root: null, rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    );
    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      if (section.dataset.orbyMarketingRevealed !== '1') {
        revealObserver.observe(section);
      }
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
      if (revealObserver) {
        revealObserver.disconnect();
        revealObserver = null;
      }
    }
  }

  function suspendForStudio() {
    if (!root) return;
    teardownIntroFloat?.();
    teardownIntroFloat = null;
    teardownShowcaseGallery?.();
    teardownShowcaseGallery = null;
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
    if (!teardownIntroFloat) {
      import('./orbyMarketingIntroFloat.js').then((introFloat) => {
        if (!root || destroyed) return;
        teardownIntroFloat = introFloat.initIntroFloatParallax(root);
      });
    }
    if (!teardownShowcaseGallery) {
      import('./orbyMarketingShowcaseGallery.js').then((showcaseGallery) => {
        if (!root || destroyed) return;
        teardownShowcaseGallery = showcaseGallery.initShowcaseGallery(root);
      });
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

    root.querySelectorAll('.orby-marketing__section').forEach((section) => {
      section.classList.add('orby-marketing__section--pending');
    });
    reveals.prepareMarketingSections(root);
    attachRevealObserver();
    void reveals.preloadMarketingImages(root);

    const [introFloat, showcaseGallery] = await Promise.all([
      import('./orbyMarketingIntroFloat.js'),
      import('./orbyMarketingShowcaseGallery.js'),
    ]);
    teardownIntroFloat?.();
    teardownIntroFloat = introFloat.initIntroFloatParallax(root);
    teardownShowcaseGallery?.();
    teardownShowcaseGallery = showcaseGallery.initShowcaseGallery(root);

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
      teardownIntroFloat?.();
      teardownIntroFloat = null;
      teardownShowcaseGallery?.();
      teardownShowcaseGallery = null;
      bodyObserver?.disconnect();
      revealObserver?.disconnect();
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
