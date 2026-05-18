/**
 * StartMenuController - Manages the start menu/dropzone functionality
 * Handles drag & drop, file input, visibility, and all start menu interactions
 */
import gsap from 'gsap';

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

export class StartMenuController {
  constructor(eventBus, uiManager) {
    this.eventBus = eventBus;
    this.ui = uiManager;
    this.visible = true;

    // Cache DOM elements
    this.dropzone = null;
    this.fileInput = null;
    this.browseButton = null;
    this.loadTestLink = null;
    this.loadMeshButton = null;
    this.logotypeAnimation = null;
    this.infoLogotypeAnimation = null;
    this.animationInstance = null;
    this.infoAnimationInstance = null;

    /** Mobile splash — avoid double fire from animation + timeout */
    this._mobileSplashMessageDone = false;
    this._desktopDropzoneTextRevealed = false;
    /** First visit: defer dropzone fade-in until fonts settle + idle so Lottie/GSAP/main chunk can warm up */
    this._dropzoneShellReady = false;
    this._dropzoneShellPrepPromise = null;
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
        if (typeof requestIdleCallback === 'function') {
          await new Promise((r) =>
            requestIdleCallback(() => r(), { timeout: 550 }),
          );
        } else {
          await new Promise((r) => setTimeout(r, 72));
        }
      } else {
        await new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        );
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
    this.loadTestLink = document.querySelector('#loadTestLink');
    this.loadMeshButton = this.ui.buttons?.loadMesh;
    this.logotypeAnimation = document.querySelector('#logotypeAnimation');
    this.infoLogotypeAnimation = document.querySelector('#infoLogotypeAnimation');
    this.mobileWarning = document.querySelector('#mobileWarning');
    this.dropPrimary = document.querySelector('.drop-primary');
    this.dropSecondary = document.querySelector('.drop-secondary');
  }

  bindEvents() {
    if (!this.dropzone || !this.fileInput || !this.browseButton) return;

    const emitFile = (file) => {
      if (!file) return;
      this.eventBus.emit('file:selected', file);
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

    // Load Test Object link click
    if (this.loadTestLink) {
      this.loadTestLink.addEventListener('click', async (event) => {
        event.preventDefault();
        await this.loadTestObject();
      });
    }

    // File input change
    this.fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      emitFile(file);
      this.fileInput.value = '';
    });

    // "Import New Mesh" button in sidebar
    if (this.loadMeshButton) {
      this.loadMeshButton.addEventListener('click', () => {
        this.fileInput.click();
      });
    }

    // Global drop handler (for dropping anywhere on window)
    window.addEventListener('drop', (event) => {
      this.handleDropEvent(event, emitFile);
    }, { passive: false });
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
   */
  bindDropzoneGradientScrollPause() {
    if (typeof window === 'undefined') return;
    let endTimer = null;
    const END_MS = 160;
    const SCROLL_CLASS = 'orby-dropzone-glow-scrolling';
    const pauseForScroll = () => {
      if (!prefersReducedMotion()) {
        document.documentElement.classList.add(SCROLL_CLASS);
      }
      this.animationInstance?.pause();
    };
    const resumeAfterScroll = () => {
      document.documentElement.classList.remove(SCROLL_CLASS);
      endTimer = null;
      if (
        document.body.classList.contains('dropzone-visible') &&
        this.animationInstance
      ) {
        this.animationInstance.play();
      }
    };
    window.addEventListener(
      'scroll',
      () => {
        if (!document.body.classList.contains('dropzone-visible')) {
          if (endTimer !== null) {
            window.clearTimeout(endTimer);
            resumeAfterScroll();
          }
          return;
        }
        pauseForScroll();
        if (endTimer !== null) window.clearTimeout(endTimer);
        endTimer = window.setTimeout(resumeAfterScroll, END_MS);
      },
      { passive: true },
    );
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
        this.dropzone.style.pointerEvents = 'auto';
        this.dropzone.style.opacity = '';
        this.dropzone.style.animation =
          'dropzoneReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      } else {
        this.dropzone.style.pointerEvents = 'none';
        this.dropzone.style.animation = 'none';
        this.dropzone.style.opacity = '0';
      }
    } else {
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
      });
    }
    
    document.body.classList.toggle('dropzone-visible', shouldShow);
    document.documentElement.classList.toggle(
      'orby-dropzone-shell-pending',
      Boolean(shouldShow && !canRevealChrome),
    );
    this.syncDropzoneLogotypePlayback(shouldShow);
  }

  /**
   * Pause dropzone Lottie when off-screen (in-game); resume on start menu.
   */
  syncDropzoneLogotypePlayback(shouldShow) {
    if (!this.animationInstance) return;
    if (shouldShow) {
      this.animationInstance.play();
    } else {
      this.animationInstance.pause();
    }
  }

  /** After `.drop-logo` CSS `logotypeReveal` completes (fallback timeout ~750ms). */
  scheduleMobileSplashAfterLogoReveal() {
    if (!document.documentElement.classList.contains('mobile-landing')) return;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallbackTimer);
      this.logotypeAnimation.removeEventListener('animationend', onEnd);
      this.revealMobileSplashMessage();
    };

    const onEnd = (event) => {
      if (event.target !== this.logotypeAnimation) return;
      if (!String(event.animationName || '').includes('logotypeReveal')) return;
      finish();
    };

    this.logotypeAnimation.addEventListener('animationend', onEnd);
    const fallbackTimer = window.setTimeout(finish, 750);
  }

  /** Desktop start menu — same cue as mobile: after logo `logotypeReveal` ends. */
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
   * Order: 1 logo (CSS before this) → 2 headline → 3 buttons → 4 footer copy (shortcuts + info).
   */
  revealDesktopDropzoneIntroText() {
    if (document.documentElement.classList.contains('mobile-landing')) return;
    if (this._desktopDropzoneTextRevealed) return;
    this._desktopDropzoneTextRevealed = true;

    const primary = this.dropPrimary;
    const secondary = this.dropSecondary;
    const buttons = this.dropzone?.querySelectorAll('.dropzone-actions .orby-magic-btn');

    const killTargets = [primary, secondary].filter(Boolean);
    if (buttons?.length) killTargets.push(...buttons);
    gsap.killTweensOf(killTargets);

    wrapWordsForStagger(primary);

    const w1 = primary ? [...primary.querySelectorAll(`.${STAGGER_CLASS}`)] : [];

    /** Headline stays word-staggered; lower blocks quicker and slightly overlapped so no dead air between them */
    const revealEase = 'power4.out';
    const blockDur = 0.38;
    const blockEase = 'power3.out';
    const headWordDur = 0.42;
    const headStagger = 0.035;
    /** Start next block tween this many seconds before the previous block tween ends (buttons / footer copy only) */
    const blockOverlap = 0.2;

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
      return;
    }

    if (primary) gsap.set(primary, { opacity: 1 });

    const tl = gsap.timeline({
      defaults: { ease: revealEase, overwrite: true },
    });

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
      );
      headRan = true;
    } else if (primary) {
      tl.fromTo(
        primary,
        { opacity: 0, y: -15 },
        { opacity: 1, y: 0, duration: blockDur },
      );
      headRan = true;
    }

    const blockAfterHead = headRan ? '>' : 0;
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
          stagger: 0.022,
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
  }

  /**
   * Mobile splash message: waits for logo timing from schedule/reveal callers.
   * Stagger-in words with GSAP after wrapping copy in spans.
   */
  revealMobileSplashMessage() {
    if (!document.documentElement.classList.contains('mobile-landing')) return;
    if (this._mobileSplashMessageDone || !this.mobileWarning) return;
    this._mobileSplashMessageDone = true;

    const p = this.mobileWarning.querySelector('p');
    gsap.killTweensOf(this.mobileWarning);

    if (!p) {
      gsap.set(this.mobileWarning, {
        visibility: 'visible',
        opacity: 1,
        pointerEvents: 'auto',
      });
      this.mobileWarning.setAttribute('aria-hidden', 'false');
      return;
    }

    wrapWordsForStagger(p);
    const words = [...p.querySelectorAll(`.${STAGGER_CLASS}`)];
    const reduced = prefersReducedMotion();

    if (words.length) gsap.killTweensOf(words);

    this.mobileWarning.setAttribute('aria-hidden', 'false');
    gsap.set(this.mobileWarning, {
      visibility: 'visible',
      opacity: 1,
      pointerEvents: 'auto',
    });

    if (reduced) {
      gsap.set(p, { opacity: 1 });
      if (words.length) gsap.set(words, { opacity: 1, y: 0 });
      return;
    }

    const targets = words.length ? words : [p];
    gsap.fromTo(
      targets,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.28,
        stagger: 0.022,
        ease: 'power2.out',
        overwrite: true,
      },
    );
  }

  /**
   * Initialize Lottie animation for logotype
   */
  initLogotypeAnimation() {
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
    const tryInit = () => {
      if (typeof lottie === 'undefined') {
        // Retry after a short delay
        setTimeout(tryInit, 100);
        return;
      }

      try {
        // Add cache-busting parameter to ensure fresh file is loaded
        const cacheBuster = `?v=${Date.now()}`;
        this.animationInstance = lottie.loadAnimation({
          container: this.logotypeAnimation,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: `./assets/animations/data.json${cacheBuster}`,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet'
          }
        });

        // Let .drop-logo CSS control width; SVG fills container so it scales with the viewport
        if (this.animationInstance) {
          this.animationInstance.addEventListener('DOMLoaded', () => {
            window.clearTimeout(shellRevealWatchdog);
            const isMobileSplash =
              document.documentElement.classList.contains('mobile-landing');
            const svg = this.logotypeAnimation.querySelector('svg');

            void this.ensureDropzoneShellReady().then(() => {
              if (svg) {
                svg.style.width = '100%';
                svg.style.height = 'auto';

                // Trigger reveal when Lottie is in the DOM — after shell prep so GSAP/fonts settle
                requestAnimationFrame(() => {
                  this.logotypeAnimation.style.opacity = '0';
                  this.logotypeAnimation.style.transform = 'scale(0.85)';
                  this.logotypeAnimation.offsetHeight;
                  this.logotypeAnimation.classList.add('reveal');
                  if (isMobileSplash) {
                    this.scheduleMobileSplashAfterLogoReveal();
                  } else {
                    this.scheduleDesktopDropzoneTextAfterLogo();
                  }
                });
              } else if (isMobileSplash) {
                requestAnimationFrame(() => this.revealMobileSplashMessage());
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
          if (
            document.documentElement.classList.contains('mobile-landing')
          ) {
            requestAnimationFrame(() => this.revealMobileSplashMessage());
          } else {
            requestAnimationFrame(() =>
              this.revealDesktopDropzoneIntroText(),
            );
          }
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
    const tryInit = () => {
      if (typeof lottie === 'undefined') {
        // Retry after a short delay
        setTimeout(tryInit, 100);
        return;
      }

      try {
        // Add cache-busting parameter to ensure fresh file is loaded
        const cacheBuster = `?v=${Date.now()}`;
        this.infoAnimationInstance = lottie.loadAnimation({
          container: this.infoLogotypeAnimation,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: `./assets/animations/data.json${cacheBuster}`,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet'
          }
        });

        if (this.infoAnimationInstance) {
          this.infoAnimationInstance.addEventListener('DOMLoaded', () => {
            const svg = this.infoLogotypeAnimation.querySelector('svg');
            if (svg) {
              svg.style.width = '100%';
              svg.style.height = 'auto';
            }
          });
        }
      } catch (error) {
        console.error('Failed to load info logotype animation:', error);
      }
    };

    tryInit();
  }

  /**
   * Load test object from server
   */
  async loadTestObject() {
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

