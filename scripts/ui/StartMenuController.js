/**
 * StartMenuController - Manages the start menu/dropzone functionality
 * Handles drag & drop, file input, visibility, and all start menu interactions
 */
import gsap from 'gsap';
import { handoffFileToMobileAppIfLanding } from '../orbyMobileHandoff.js';
import { blockTabletStudioAccess } from '../orbyTabletGate.js';
import {
  noteDropzoneHideEnded,
  noteDropzoneHideStarted,
  noteDropzoneRevealEnded,
  noteDropzoneRevealStarted,
} from './orbyPageTransition.js';
import { TEXT_REVEAL_PACE } from './bigMessageHeadlineReveal.js';
import { ensureLottie } from './lottieLoader.js';

const STAGGER_CLASS = 'orby-stagger-word';

/**
 * Wrap whitespace-delimited text nodes in spans for word stagger (recursive).
 */
function wrapWordsForStagger(paragraphRoot) {
  if (!paragraphRoot || paragraphRoot.querySelector(`.${STAGGER_CLASS}`)) return;
  const processNode = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        if (!text.trim()) continue;
        const fragment = document.createDocumentFragment();
        for (const part of text.split(/(\s+)/)) {
          if (part === '') continue;
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(part));
          } else {
            const span = document.createElement('span');
            span.className = STAGGER_CLASS;
            span.textContent = part;
            fragment.appendChild(span);
          }
        }
        node.insertBefore(fragment, child);
        node.removeChild(child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        processNode(child);
      }
    }
  };
  processNode(paragraphRoot);
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const DROPZONE_HERO_DECO_OPACITY = 0.92;

/** Corner JPGs + hero credits — desktop home (below 1920: scaled in CSS). */
function shouldShowDropzoneHeroArt() {
  if (document.documentElement.classList.contains('mobile-landing')) return false;
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(min-width: 900px)').matches
  );
}

/**
 * @param {HTMLImageElement} img
 */
function hydrateDropzoneHeroDecoImg(img) {
  if (!img || img.getAttribute('src')) return;
  const url = img.dataset.src;
  if (!url) return;
  img.src = url;
}

/**
 * @param {HTMLImageElement} img
 * @returns {Promise<void>}
 */
function whenDropzoneHeroImgReady(img) {
  if (!img) return Promise.resolve();
  hydrateDropzoneHeroDecoImg(img);
  if (!img.getAttribute('src')) return Promise.resolve();
  if (img.complete && img.naturalWidth > 0) {
    if (typeof img.decode === 'function') {
      return img.decode().catch(() => {});
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(resolve).catch(resolve);
      } else {
        resolve();
      }
    };
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
  });
}

function shouldPlayLogotypeLottie() {
  if (document.documentElement.classList.contains('safari-browser')) return false;
  if (prefersReducedMotion()) return false;
  return true;
}

function getLogotypeLottieRendererSettings() {
  return {
    preserveAspectRatio: 'xMidYMid meet',
    progressiveLoad: false,
    hideOnTransparent: true,
  };
}

/** @param {import('lottie-web').AnimationItem | null | undefined} instance */
function freezeLogotypeLottie(instance) {
  if (!instance) return;
  instance.pause();
  instance.goToAndStop(0, true);
}

/**
 * @param {HTMLElement} container
 */
function styleLogotypeMedia(container) {
  const media = container.querySelector('svg, canvas');
  if (!media) return;
  media.style.width = '100%';
  media.style.height = 'auto';
  media.style.display = 'block';
}

export class StartMenuController {
  constructor(eventBus, uiManager) {
    this.eventBus = eventBus;
    this.ui = uiManager;
    this.visible = true;

    // Cache DOM elements
    this.dropzone = null;
    this.fileInput = null;
    this.browseButton = null;
    this.blankCanvasLink = null;
    this.loadTestLink = null;
    this.debugExportOverlayLink = null;
    this.loadMeshButton = null;
    this.logotypeAnimation = null;
    this.infoLogotypeAnimation = null;
    this.animationInstance = null;
    this.infoAnimationInstance = null;

    /** Mobile splash — avoid double fire from animation + timeout */
    this._desktopDropzoneTextRevealed = false;
    /** First visit: defer dropzone fade-in until fonts settle + idle so Lottie/GSAP/main chunk can warm up */
    this._dropzoneShellReady = false;
    this._dropzoneShellPrepPromise = null;
    this._dropzoneHeroDecoPreloadPromise = null;
  }

  /**
   * Wait for first-paint-critical work to finish, then allow the dropzone opacity animation + logo reveal.
   * @param {{ fast?: boolean }} options — `fast`: skip fonts/idle (error / fallback paths). Users with reduced motion use the short path automatically.
   */
  ensureDropzoneShellReady(options = {}) {
    if (this._dropzoneShellReady) return Promise.resolve();
    if (this._dropzoneShellPrepPromise) return this._dropzoneShellPrepPromise;
    const { fast = false } = options;
    this._dropzoneShellPrepPromise = (async () => {
      if (this._dropzoneShellReady) return;
      const rush = fast || prefersReducedMotion();
      if (!rush) {
        try {
          if (document.fonts?.ready) await document.fonts.ready;
        } catch (_) {
          /* ignore */
        }
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
        await Promise.all([
          (async () => {
            if (typeof requestIdleCallback === 'function') {
              await new Promise((r) =>
                requestIdleCallback(() => r(), { timeout: 550 }),
              );
            } else {
              await new Promise((r) => setTimeout(r, 72));
            }
          })(),
          this.preloadDropzoneHeroDeco(),
        ]);
      } else {
        await Promise.all([
          this.preloadDropzoneHeroDeco(),
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
        ]);
      }
      this._dropzoneShellReady = true;
      if (this.visible && !this.ui.uiHidden) {
        this.updateVisibility();
      }
    })().finally(() => {
      this._dropzoneShellPrepPromise = null;
    });
    return this._dropzoneShellPrepPromise;
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.bindDropzoneGradientResizePause();
    this.bindDropzoneGradientScrollPause();
    this.initLogotypeAnimation();
    this.initInfoLogotypeAnimation();
    this.setVisible(this.visible);
  }

  cacheDom() {
    this.dropzone = document.querySelector('#dropzone');
    this.fileInput = document.querySelector('#fileInput');
    this.browseButton = document.querySelector('#browseButton');
    this.blankCanvasLink = document.querySelector('#blankCanvasLink');
    this.loadTestLink = document.querySelector('#loadTestLink');
    this.debugExportOverlayLink = document.querySelector('#debugExportOverlayLink');
    this.loadMeshButton = this.ui.buttons?.loadMesh;
    this.logotypeAnimation = document.querySelector('#logotypeAnimation');
    this.infoLogotypeAnimation = document.querySelector('#infoLogotypeAnimation');
    this.dropPrimary = document.querySelector('.drop-primary');
    this.dropSecondary = document.querySelector('.drop-secondary');
    this.dropzoneDisclaimer = document.querySelector('.dropzone-disclaimer');
    this.dropzoneHeroCredit = document.querySelector('.dropzone-hero-credit');
    this.dropzoneHeroDecoUrImg = document.querySelector(
      '.dropzone-hero-deco__slot--ur .dropzone-hero-deco__img',
    );
    this.dropzoneHeroDecoLlImg = document.querySelector(
      '.dropzone-hero-deco__slot--ll .dropzone-hero-deco__img',
    );
    void this.preloadDropzoneHeroDeco();
  }

  /** Preload corner hero JPGs — assign src from data-src, decode before GSAP reveal. */
  preloadDropzoneHeroDeco() {
    if (!shouldShowDropzoneHeroArt()) return Promise.resolve();
    if (this._dropzoneHeroDecoPreloadPromise) return this._dropzoneHeroDecoPreloadPromise;
    const imgs = [this.dropzoneHeroDecoUrImg, this.dropzoneHeroDecoLlImg].filter(Boolean);
    if (!imgs.length) return Promise.resolve();
    imgs.forEach(hydrateDropzoneHeroDecoImg);
    this._dropzoneHeroDecoPreloadPromise = Promise.all(
      imgs.map((img) => whenDropzoneHeroImgReady(img)),
    ).finally(() => {
      this._dropzoneHeroDecoPreloadPromise = null;
    });
    return this._dropzoneHeroDecoPreloadPromise;
  }

  bindEvents() {
    if (!this.dropzone || !this.fileInput || !this.browseButton) return;

    const emitFile = (file) => {
      if (!file) return;
      if (blockTabletStudioAccess()) return;
      void handoffFileToMobileAppIfLanding(file).then((handled) => {
        if (!handled) this.eventBus.emit('file:selected', file);
      });
    };

    // Drag and drop handlers
    ['dragenter', 'dragover'].forEach((event) => {
      this.dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'dragend', 'drop'].forEach((event) => {
      this.dropzone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-active');
      });
    });

    this.dropzone.addEventListener('drop', (event) => {
      this.handleDropEvent(event, emitFile);
    });

    // Browse button click
    this.browseButton.addEventListener('click', () => {
      this.fileInput.click();
    });

    if (this.blankCanvasLink) {
      this.blankCanvasLink.addEventListener('click', async (event) => {
        event.preventDefault();
        await this.openBlankCanvas();
      });
    }

    // Load Test Object link click
    if (this.loadTestLink) {
      this.loadTestLink.addEventListener('click', async (event) => {
        event.preventDefault();
        await this.loadTestObject();
      });
    }

    if (this.debugExportOverlayLink) {
      this.debugExportOverlayLink.addEventListener('click', (event) => {
        event.preventDefault();
        this.ui?.toggleOfflineExportOverlayPreview?.();
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.ui?._offlineExportPreviewActive) return;
      this.ui.hideOfflineExportOverlay?.();
      this.ui.showToast?.('Export overlay preview closed', 2200, { notification: false });
    });

    // File input change
    this.fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      emitFile(file);
      this.fileInput.value = '';
    });

    // "Import Object" button in sidebar
    if (this.loadMeshButton) {
      this.loadMeshButton.addEventListener('click', () => {
        this.fileInput.click();
      });
    }

    // Global drop handler (for dropping anywhere on window)
    window.addEventListener('drop', (event) => {
      this.handleDropEvent(event, emitFile);
    }, { passive: false });

    this.dropzone.addEventListener('animationend', (event) => {
      if (event.target !== this.dropzone) return;
      if (event.animationName === 'dropzoneHide') {
        this._finalizeDropzoneHidden();
        noteDropzoneHideEnded();
      }
      if (event.animationName === 'dropzoneReveal') {
        noteDropzoneRevealEnded();
      }
    });
  }

  /** Pin marketing dropzone off after hide — inline opacity:1 must not pop back when .hiding ends. */
  _finalizeDropzoneHidden() {
    if (!this.dropzone) return;
    this.dropzone.classList.remove('hiding');
    this.dropzone.style.opacity = '0';
    this.dropzone.style.pointerEvents = 'none';
    this.dropzone.style.animation = 'none';
  }

  /**
   * While the user is resizing the browser, pause the dropzone frame gradient spin
   * (see styles: html.orby-window-resizing).
   */
  bindDropzoneGradientResizePause() {
    if (typeof window === 'undefined') return;
    let endTimer = null;
    const END_MS = 140;
    const clearResizing = () => {
      document.documentElement.classList.remove('orby-window-resizing');
      endTimer = null;
    };
    window.addEventListener(
      'resize',
      () => {
        document.documentElement.classList.add('orby-window-resizing');
        if (endTimer !== null) window.clearTimeout(endTimer);
        endTimer = window.setTimeout(clearResizing, END_MS);
      },
      { passive: true },
    );
  }

  /**
   * While the home page scrolls: pause dropzone + magic-btn glow (CSS) and Lottie; resume after scroll idle.
   * @see html.orby-dropzone-glow-scrolling in styles.css
   * @see html.orby-dropzone-viewport-clipped in styles.css
   */
  bindDropzoneGradientScrollPause() {
    if (
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('mobile-landing')
    ) {
      return;
    }
    if (typeof window === 'undefined') return;
    let endTimer = null;
    let scrollRaf = 0;
    const END_MS = 160;
    const SCROLL_CLASS = 'orby-dropzone-glow-scrolling';
    const OFF_SCREEN_CLASS = 'orby-dropzone-glow-off-screen';

    const syncDropzoneScrollPerf = () => {
      const offScreen =
        document.body.classList.contains('dropzone-visible') &&
        !this.isDropzoneHeroInView();
      document.documentElement.classList.toggle(OFF_SCREEN_CLASS, offScreen);
      if (offScreen) {
        this.animationInstance?.pause();
      }
      this.syncDropzoneViewportClip();
    };

    const pauseForScroll = () => {
      if (!prefersReducedMotion()) {
        document.documentElement.classList.add(SCROLL_CLASS);
      }
      syncDropzoneScrollPerf();
      if (shouldPlayLogotypeLottie() && this.isDropzoneHeroInView()) {
        this.animationInstance?.pause();
      }
    };
    const resumeAfterScroll = () => {
      endTimer = null;
      if (document.documentElement.classList.contains(SCROLL_CLASS)) {
        document.documentElement.classList.remove(SCROLL_CLASS);
      }
      syncDropzoneScrollPerf();
      if (
        shouldPlayLogotypeLottie() &&
        document.body.classList.contains('dropzone-visible') &&
        this.isDropzoneHeroInView() &&
        this.animationInstance
      ) {
        this.animationInstance.play();
      }
    };

    const runScrollFrame = () => {
      scrollRaf = 0;
      if (!document.body.classList.contains('dropzone-visible')) {
        document.documentElement.classList.remove(OFF_SCREEN_CLASS);
        document.documentElement.classList.remove('orby-dropzone-viewport-clipped');
        if (endTimer !== null) {
          window.clearTimeout(endTimer);
          resumeAfterScroll();
        }
        return;
      }
      pauseForScroll();
      if (endTimer !== null) window.clearTimeout(endTimer);
      endTimer = window.setTimeout(resumeAfterScroll, END_MS);
    };

    window.addEventListener(
      'scroll',
      () => {
        if (scrollRaf) return;
        scrollRaf = window.requestAnimationFrame(runScrollFrame);
      },
      { passive: true },
    );

    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden';
      document.documentElement.classList.toggle(
        'orby-dropzone-glow-tab-hidden',
        hidden && document.body.classList.contains('dropzone-visible'),
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    syncDropzoneScrollPerf();
  }

  handleDropEvent(event, emitFile) {
    event.preventDefault();
    event.stopPropagation();

    // Try to extract directory entries first (for folder drops)
    const entries = this.extractEntries(event.dataTransfer);
    if (entries.length) {
      this.collectFilesFromEntries(entries).then((files) => {
        if (files.length === 1) {
          emitFile(files[0].file);
        } else if (files.length > 1) {
          this.eventBus.emit('file:bundle', files);
        }
      });
      return;
    }

    // Fallback to regular file list
    const fileList = event.dataTransfer?.files;
    if (fileList && fileList.length) {
      if (fileList.length === 1) {
        emitFile(fileList[0]);
      } else {
        const files = Array.from(fileList).map((file) => ({
          file,
          path: file.webkitRelativePath || file.name,
        }));
        this.eventBus.emit('file:bundle', files);
      }
    }
  }

  extractEntries(dataTransfer) {
    const items = dataTransfer?.items;
    if (!items) return [];
    const entries = [];
    for (const item of items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    return entries;
  }

  async collectFilesFromEntries(entries) {
    const files = [];
    const traverse = (entry, path = '') =>
      new Promise((resolve) => {
        if (entry.isFile) {
          entry.file((file) => {
            files.push({ file, path: `${path}${file.name}` });
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          reader.readEntries(async (entriesList) => {
            for (const child of entriesList) {
              await traverse(child, `${path}${entry.name}/`);
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
    for (const entry of entries) {
      await traverse(entry);
    }
    return files;
  }

  /**
   * Set dropzone visibility
   * @param {boolean} visible - Whether the dropzone should be visible (intended state, respects UI visibility)
   */
  setVisible(visible) {
    if (!this.dropzone) return;
    this.visible = visible;
    this.updateVisibility();
  }

  /**
   * Update visibility based on current state (respects both intended visibility and UI hidden state)
   */
  updateVisibility() {
    if (!this.dropzone) return;
    const shouldShow = this.visible && !this.ui.uiHidden;
    const canRevealChrome = shouldShow && this._dropzoneShellReady;

    if (shouldShow) {
      // When showing, remove hiding class and let reveal animation handle it
      this.dropzone.classList.remove('hiding');
      if (canRevealChrome) {
        noteDropzoneRevealStarted();
        this.dropzone.style.pointerEvents = 'auto';
        this.dropzone.style.opacity = '';
        this.dropzone.style.animation =
          'dropzoneReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        if (this._desktopDropzoneTextRevealed && this.dropzoneDisclaimer) {
          gsap.set(this.dropzoneDisclaimer, {
            opacity: 1,
            y: 0,
            visibility: 'visible',
            clearProps: 'transform',
          });
        }
      } else {
        this.dropzone.style.pointerEvents = 'none';
        this.dropzone.style.animation = 'none';
        this.dropzone.style.opacity = '0';
      }
    } else {
      this._animateDropzoneDisclaimerOut();
      // When hiding, first remove any existing animation and inline styles
      this.dropzone.style.animation = '';
      this.dropzone.style.opacity = '';
      // Ensure opacity is at 1 before starting hide animation
      this.dropzone.style.opacity = '1';
      // Force a reflow to ensure browser processes the changes
      this.dropzone.offsetHeight;
      // Wait for next frame before adding hiding class to ensure animation triggers
      requestAnimationFrame(() => {
        this.dropzone.style.pointerEvents = 'none';
        this.dropzone.classList.add('hiding');
        noteDropzoneHideStarted();
        if (prefersReducedMotion()) {
          this._finalizeDropzoneHidden();
          noteDropzoneHideEnded();
        }
      });
    }
    
    document.body.classList.toggle('dropzone-visible', shouldShow);
    document.documentElement.classList.toggle(
      'orby-dropzone-shell-pending',
      Boolean(shouldShow && !canRevealChrome),
    );
    this.syncDropzoneLogotypePlayback(shouldShow);
  }

  /** Early-release disclaimer — last intro beat; eases out when leaving the dropzone. */
  _animateDropzoneDisclaimerOut() {
    const disclaimer = this.dropzoneDisclaimer;
    if (!disclaimer) return;
    gsap.killTweensOf(disclaimer);
    const hideDisclaimer = () => {
      gsap.set(disclaimer, {
        opacity: 0,
        y: -8,
        visibility: 'hidden',
        clearProps: 'transform',
      });
    };
    if (prefersReducedMotion()) {
      hideDisclaimer();
      return;
    }
    gsap.to(disclaimer, {
      opacity: 0,
      y: -8,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: hideDisclaimer,
    });
  }

  /**
   * Pause dropzone Lottie when off-screen (in-game); resume on start menu.
   */
  syncDropzoneLogotypePlayback(shouldShow) {
    if (!this.animationInstance) return;
    if (!shouldPlayLogotypeLottie()) {
      freezeLogotypeLottie(this.animationInstance);
      return;
    }
    if (shouldShow) {
      this.animationInstance.play();
    } else {
      this.animationInstance.pause();
    }
  }

  /** True while the dropzone hero (logo) is still on screen — avoids scroll-jank when reading marketing below. */
  isDropzoneHeroInView() {
    if (!this.dropzone) return false;
    const rect = this.dropzone.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  /**
   * Re-enable .viewport clip once home scroll moves the hero — keeps overflow:visible at rest
   * so corner deco is not cropped; see html.orby-dropzone-viewport-clipped in styles.css.
   */
  shouldClipDropzoneViewport() {
    if (!this.dropzone || !document.documentElement.classList.contains('orby-home-scroll')) {
      return false;
    }
    if (!this.isDropzoneHeroInView()) return true;
    return this.dropzone.getBoundingClientRect().top < 0;
  }

  syncDropzoneViewportClip() {
    const clip =
      document.body.classList.contains('dropzone-visible') && this.shouldClipDropzoneViewport();
    document.documentElement.classList.toggle('orby-dropzone-viewport-clipped', clip);
  }

  /** Desktop start menu — after logo `logotypeReveal` ends. */
  scheduleDesktopDropzoneTextAfterLogo() {
    if (document.documentElement.classList.contains('mobile-landing')) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallbackTimer);
      this.logotypeAnimation.removeEventListener('animationend', onEnd);
      this.revealDesktopDropzoneIntroText();
    };

    const onEnd = (event) => {
      if (event.target !== this.logotypeAnimation) return;
      if (!String(event.animationName || '').includes('logotypeReveal')) return;
      finish();
    };

    this.logotypeAnimation.addEventListener('animationend', onEnd);
    const fallbackTimer = window.setTimeout(finish, 750);
  }

  /**
   * Desktop start menu after logo: word stagger on headline only, then legacy-style block fades.
   * Order: 1 logo (CSS) → 2 hero deco UR → 3 hero deco LL → 4 headline → 5 buttons → 6 footer → 7 credits → 8 disclaimer.
   */
  async revealDesktopDropzoneIntroText() {
    if (document.documentElement.classList.contains('mobile-landing')) return;
    if (this._desktopDropzoneTextRevealed) return;
    this._desktopDropzoneTextRevealed = true;

    const primary = this.dropPrimary;
    const secondary = this.dropSecondary;
    const disclaimer = this.dropzoneDisclaimer;
    const showHeroArt = shouldShowDropzoneHeroArt();
    const credits = showHeroArt ? this.dropzoneHeroCredit : null;
    const heroDecoUr = showHeroArt ? this.dropzoneHeroDecoUrImg : null;
    const heroDecoLl = showHeroArt ? this.dropzoneHeroDecoLlImg : null;
    const buttons = this.dropzone?.querySelectorAll('.dropzone-actions .orby-magic-btn');

    if (showHeroArt) {
      await this.preloadDropzoneHeroDeco();
    }

    const killTargets = [primary, secondary, disclaimer, credits, heroDecoUr, heroDecoLl].filter(
      Boolean,
    );
    if (buttons?.length) killTargets.push(...buttons);
    gsap.killTweensOf(killTargets);

    wrapWordsForStagger(primary);

    const w1 = primary ? [...primary.querySelectorAll(`.${STAGGER_CLASS}`)] : [];

    /** Headline stays word-staggered; lower blocks quicker and slightly overlapped so no dead air between them */
    const revealEase = 'power4.out';
    const blockDur = 0.38 * TEXT_REVEAL_PACE;
    const blockEase = 'power3.out';
    const headWordDur = 0.42 * TEXT_REVEAL_PACE;
    const headStagger = 0.035 * TEXT_REVEAL_PACE;
    const buttonStagger = 0.022 * TEXT_REVEAL_PACE;
    const decoFadeDur = 0.55;
    const decoEase = 'power2.out';
    /** Start next block tween this many seconds before the previous block tween ends (buttons / footer copy only) */
    const blockOverlap = 0.2 * TEXT_REVEAL_PACE;

    if (prefersReducedMotion()) {
      if (primary) gsap.set(primary, { opacity: 1 });
      [...w1].forEach((node) =>
        gsap.set(node, { opacity: 1, y: 0, clearProps: 'transform' }),
      );
      if (!w1.length && primary) {
        gsap.set(primary, { opacity: 1, clearProps: 'transform' });
      }
      if (buttons?.length) {
        gsap.set(buttons, { opacity: 1, y: 0, clearProps: 'transform' });
      }
      if (secondary)
        gsap.set(secondary, { opacity: 1, y: 0, clearProps: 'transform' });
      if (disclaimer) {
        gsap.set(disclaimer, { opacity: 1, y: 0, visibility: 'visible', clearProps: 'transform' });
      }
      if (heroDecoUr) {
        gsap.set(heroDecoUr, {
          opacity: DROPZONE_HERO_DECO_OPACITY,
          visibility: 'visible',
        });
      }
      if (heroDecoLl) {
        gsap.set(heroDecoLl, {
          opacity: DROPZONE_HERO_DECO_OPACITY,
          visibility: 'visible',
        });
      }
      if (credits) {
        gsap.set(credits, { opacity: 1, clearProps: 'transform' });
        const creditWords = [...credits.querySelectorAll(`.${STAGGER_CLASS}`)];
        creditWords.forEach((node) =>
          gsap.set(node, { opacity: 1, y: 0, clearProps: 'transform' }),
        );
        if (!creditWords.length) {
          gsap.set(credits, { opacity: 1, y: 0, clearProps: 'transform' });
        }
      }
      return;
    }

    if (primary) gsap.set(primary, { opacity: 1 });

    const tl = gsap.timeline({
      defaults: { ease: revealEase, overwrite: true },
    });

    if (heroDecoUr) gsap.set(heroDecoUr, { opacity: 0, visibility: 'visible' });
    if (heroDecoLl) gsap.set(heroDecoLl, { opacity: 0, visibility: 'visible' });
    if (disclaimer) gsap.set(disclaimer, { opacity: 0, y: -8, visibility: 'visible' });

    let timelineCursor = 0;
    if (heroDecoUr) {
      tl.to(
        heroDecoUr,
        { opacity: DROPZONE_HERO_DECO_OPACITY, duration: decoFadeDur, ease: decoEase },
        timelineCursor,
      );
      timelineCursor = '>';
    }
    if (heroDecoLl) {
      tl.to(
        heroDecoLl,
        { opacity: DROPZONE_HERO_DECO_OPACITY, duration: decoFadeDur, ease: decoEase },
        timelineCursor,
      );
      timelineCursor = '>';
    }

    let headRan = false;
    if (w1.length) {
      tl.fromTo(
        w1,
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: headWordDur,
          stagger: headStagger,
          ease: 'power2.out',
        },
        timelineCursor,
      );
      headRan = true;
    } else if (primary) {
      tl.fromTo(
        primary,
        { opacity: 0, y: -15 },
        { opacity: 1, y: 0, duration: blockDur },
        timelineCursor,
      );
      headRan = true;
    }

    const blockAfterHead = headRan ? '>' : timelineCursor === 0 ? 0 : timelineCursor;
    /* 3 Buttons before footer copy — matches classic dropRevealButton end state */
    if (buttons?.length) {
      tl.fromTo(
        [...buttons],
        { opacity: 0, y: -15 },
        {
          opacity: 1,
          y: 0,
          duration: blockDur,
          ease: blockEase,
          stagger: buttonStagger,
        },
        blockAfterHead,
      );
    }

    if (secondary) {
      tl.fromTo(
        secondary,
        { opacity: 0, y: -10 },
        { opacity: 1, y: 0, duration: blockDur, ease: blockEase },
        buttons?.length ? `>-=${blockOverlap}` : blockAfterHead,
      );
    }

    if (credits) {
      wrapWordsForStagger(credits);
      const creditWords = [...credits.querySelectorAll(`.${STAGGER_CLASS}`)];
      if (creditWords.length) {
        gsap.set(credits, { opacity: 1, clearProps: 'transform' });
        const creditsAfter =
          secondary != null ? '>' : buttons?.length ? `>-=${blockOverlap}` : blockAfterHead;
        tl.fromTo(
          creditWords,
          { opacity: 0, y: 14 },
          {
            opacity: 1,
            y: 0,
            duration: headWordDur,
            stagger: headStagger,
            ease: 'power2.out',
          },
          creditsAfter,
        );
      } else {
        tl.fromTo(
          credits,
          { opacity: 0, y: -10 },
          { opacity: 1, y: 0, duration: blockDur, ease: blockEase },
          secondary != null ? '>' : buttons?.length ? `>-=${blockOverlap}` : blockAfterHead,
        );
      }
    }

    if (disclaimer) {
      const disclaimerAfter =
        credits != null
          ? '>'
          : secondary != null
            ? '>'
            : buttons?.length
              ? `>-=${blockOverlap}`
              : blockAfterHead;
      tl.fromTo(
        disclaimer,
        { opacity: 0, y: -8, visibility: 'visible' },
        { opacity: 1, y: 0, visibility: 'visible', duration: blockDur, ease: blockEase },
        disclaimerAfter,
      );
    }
  }

  /**
   * Initialize Lottie animation for logotype
   */
  initLogotypeAnimation() {
    if (document.documentElement.classList.contains('mobile-landing')) return;
    if (!this.logotypeAnimation) {
      console.warn('Animation container not found');
      return;
    }

    const shellRevealWatchdog = window.setTimeout(() => {
      if (!this._dropzoneShellReady) {
        void this.ensureDropzoneShellReady({ fast: true });
      }
    }, 5200);

    // Wait for Lottie library to load
    const tryInit = async () => {
      try {
        const lottie = await ensureLottie();
        const cacheBuster = `?v=${Date.now()}`;
        this.animationInstance = lottie.loadAnimation({
          container: this.logotypeAnimation,
          renderer: 'svg',
          loop: true,
          autoplay: shouldPlayLogotypeLottie(),
          path: `./assets/animations/data.json${cacheBuster}`,
          rendererSettings: getLogotypeLottieRendererSettings(),
        });

        // Let .drop-logo CSS control width; SVG fills container so it scales with the viewport
        if (this.animationInstance) {
          this.animationInstance.addEventListener('DOMLoaded', () => {
            window.clearTimeout(shellRevealWatchdog);
            styleLogotypeMedia(this.logotypeAnimation);
            if (!shouldPlayLogotypeLottie()) {
              freezeLogotypeLottie(this.animationInstance);
            }

            void this.ensureDropzoneShellReady().then(() => {
              if (this.logotypeAnimation.querySelector('svg, canvas')) {
                // Trigger reveal when Lottie is in the DOM — after shell prep so GSAP/fonts settle
                requestAnimationFrame(() => {
                  this.logotypeAnimation.style.opacity = '0';
                  this.logotypeAnimation.style.transform = 'scale(0.85)';
                  this.logotypeAnimation.offsetHeight;
                  this.logotypeAnimation.classList.add('reveal');
                  this.scheduleDesktopDropzoneTextAfterLogo();
                });
              } else {
                requestAnimationFrame(() => this.revealDesktopDropzoneIntroText());
              }
            });

            this.syncDropzoneLogotypePlayback(
              this.visible && !this.ui.uiHidden,
            );
          });
        }
      } catch (error) {
        window.clearTimeout(shellRevealWatchdog);
        console.error('Failed to load logotype animation:', error);
        void this.ensureDropzoneShellReady({ fast: true }).then(() => {
          requestAnimationFrame(() => this.revealDesktopDropzoneIntroText());
        });
      }
    };

    tryInit();
  }

  /**
   * Initialize Lottie animation for logotype in Information tab
   */
  initInfoLogotypeAnimation() {
    if (!this.infoLogotypeAnimation) {
      return;
    }

    // Wait for Lottie library to load
    const tryInit = async () => {
      try {
        const lottie = await ensureLottie();
        const cacheBuster = `?v=${Date.now()}`;
        this.infoAnimationInstance = lottie.loadAnimation({
          container: this.infoLogotypeAnimation,
          renderer: 'svg',
          loop: false,
          autoplay: false,
          path: `./assets/animations/data.json${cacheBuster}`,
          rendererSettings: getLogotypeLottieRendererSettings(),
        });

        if (this.infoAnimationInstance) {
          this.infoAnimationInstance.addEventListener('DOMLoaded', () => {
            styleLogotypeMedia(this.infoLogotypeAnimation);
            freezeLogotypeLottie(this.infoAnimationInstance);
          });
        }
      } catch (error) {
        console.error('Failed to load info logotype animation:', error);
      }
    };

    tryInit();
  }

  /**
   * Studio without a mesh — useful for font / text tool debugging.
   */
  async openBlankCanvas() {
    if (blockTabletStudioAccess()) return;
    const scene = window.orby?.scene;
    if (!scene?.enterBlankStudio) {
      this.ui.showToast('Studio not ready');
      return;
    }
    try {
      await scene.enterBlankStudio({ skipSound: true });
    } catch (error) {
      console.error('Failed to open blank canvas', error);
      this.ui.showToast('Could not open blank canvas');
    }
  }

  /**
   * Load test object from server
   */
  async loadTestObject() {
    if (blockTabletStudioAccess()) return;
    const testFileUrl = './assets/3D-assets/Stitched_Memories_1122161936_texture.glb';
    const fileName = 'Stitched_Memories_1122161936_texture.glb';
    
    try {
      // Fetch the file from server
      const response = await fetch(testFileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch test file: ${response.statusText}`);
      }
      
      // Convert response to blob, then to File object
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: 'model/gltf-binary' });
      
      this.eventBus.emit('file:selected', {
        file,
        suppressSuccessToastSound: true,
      });
    } catch (error) {
      console.error('Failed to load test object:', error);
      this.ui.showToast('Could not load test object');
    }
  }
}

