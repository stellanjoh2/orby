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

function renderIntroSection(section) {
  return `<section class="orby-marketing__section orby-marketing__section--intro" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__intro-stage" data-orby-marketing-float-stage aria-hidden="true"></div>
    <div class="orby-marketing__intro-center">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title orby-marketing__title--intro brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
      <p class="orby-marketing__lede orby-marketing__lede--intro" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
  </section>`;
}

function renderShowcaseSection(section) {
  const video = section.videoSrc
    ? `<video class="orby-marketing__video" src="${escapeHtml(section.videoSrc)}" poster="${escapeHtml(section.imageSrc)}" playsinline muted loop preload="none"></video>`
    : '';
  return `<section class="orby-marketing__section orby-marketing__section--showcase" id="${escapeHtml(section.id)}" aria-labelledby="${escapeHtml(section.id)}-title">
    <div class="orby-marketing__showcase-copy">
      <p class="orby-marketing__eyebrow" data-orby-marketing-reveal="text">${escapeHtml(section.eyebrow)}</p>
      <h2 class="orby-marketing__title brand-font-headline" id="${escapeHtml(section.id)}-title" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
    </div>
    <figure class="orby-marketing__showcase-figure">
      <div class="orby-marketing__showcase-mask" data-orby-marketing-reveal="media" data-reveal-dir="ltr">
        <img class="orby-marketing__showcase-img" src="${escapeHtml(section.imageSrc)}" alt="${escapeHtml(section.imageAlt || '')}" width="1920" height="1080" decoding="async" />
        ${video}
      </div>
    </figure>
  </section>`;
}

function renderFooterSection(section) {
  return `<footer class="orby-marketing__section orby-marketing__section--footer" id="${escapeHtml(section.id)}">
    <div class="orby-marketing__inner orby-marketing__footer">
      <h2 class="orby-marketing__title orby-marketing__title--footer brand-font-headline" data-orby-marketing-reveal="text">${escapeHtml(section.title)}</h2>
      <p class="orby-marketing__lede" data-orby-marketing-reveal="text">${escapeHtml(section.lede)}</p>
      <button type="button" class="orby-marketing__cta accent-action-btn" data-orby-marketing-scroll-top>${escapeHtml(section.ctaLabel || 'Back to studio')}</button>
    </div>
  </footer>`;
}

function renderSection(section) {
  switch (section.type) {
    case 'intro':
      return renderIntroSection(section);
    case 'showcase':
      return renderShowcaseSection(section);
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
  let mountPromise = null;
  let bodyObserver = null;
  let revealObserver = null;
  let revealModule = null;
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
    root.querySelectorAll('video').forEach((video) => {
      if (home) return;
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* seek unsupported on partial buffers */
      }
    });
    if (home) {
      attachRevealObserver();
    } else if (revealObserver) {
      revealObserver.disconnect();
      revealObserver = null;
    }
  }

  function suspendForStudio() {
    if (!root) return;
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
    await reveals.preloadMarketingImages(root);

    attachRevealObserver();

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

  if (lazy) {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1200));
    idle(() => {
      if (!destroyed && isDropzoneHome()) scheduleMount();
    });
  } else {
    scheduleMount();
  }

  syncHomeState();

  return {
    destroy() {
      destroyed = true;
      bodyObserver?.disconnect();
      revealObserver?.disconnect();
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
