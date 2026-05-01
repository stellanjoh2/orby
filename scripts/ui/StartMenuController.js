/**
 * StartMenuController - Manages the start menu/dropzone functionality
 * Handles drag & drop, file input, visibility, and all start menu interactions
 */
import gsap from 'gsap';

/**
 * Wrap whitespace-delimited text nodes in span.mobile-splash-word (recursive).
 */
function wrapWordsForStagger(paragraphRoot) {
  if (paragraphRoot.querySelector('.mobile-splash-word')) return;
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
            span.className = 'mobile-splash-word';
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
  }

  init() {
    this.cacheDom();
    this.bindEvents();
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
    
    if (shouldShow) {
      // When showing, remove hiding class and let reveal animation handle it
      this.dropzone.classList.remove('hiding');
      this.dropzone.style.pointerEvents = 'auto';
      this.dropzone.style.animation = 'dropzoneReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    } else {
      // When hiding, first remove any existing animation and inline styles
      this.dropzone.style.animation = '';
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
    const words = [...p.querySelectorAll('.mobile-splash-word')];
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        duration: 0.42,
        stagger: 0.035,
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
            const isMobileSplash =
              document.documentElement.classList.contains('mobile-landing');
            const svg = this.logotypeAnimation.querySelector('svg');
            if (svg) {
              svg.style.width = '100%';
              svg.style.height = 'auto';

              // Trigger reveal animation when Lottie animation finishes loading
              // This creates a subtle scale-up and fade-in effect
              requestAnimationFrame(() => {
                this.logotypeAnimation.style.opacity = '0';
                this.logotypeAnimation.style.transform = 'scale(0.85)';
                this.logotypeAnimation.offsetHeight;
                this.logotypeAnimation.classList.add('reveal');
                if (isMobileSplash) {
                  this.scheduleMobileSplashAfterLogoReveal();
                }
              });
            } else if (isMobileSplash) {
              requestAnimationFrame(() => this.revealMobileSplashMessage());
            }
            this.syncDropzoneLogotypePlayback(
              this.visible && !this.ui.uiHidden,
            );
          });
        }
      } catch (error) {
        console.error('Failed to load logotype animation:', error);
        if (document.documentElement.classList.contains('mobile-landing')) {
          requestAnimationFrame(() => this.revealMobileSplashMessage());
        }
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
      
      // Emit file:selected event to load it
      this.eventBus.emit('file:selected', file);
    } catch (error) {
      console.error('Failed to load test object:', error);
      this.ui.showToast('Could not load test object');
    }
  }
}

