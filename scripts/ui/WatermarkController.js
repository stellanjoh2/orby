/**
 * WatermarkController — Export-tab watermark overlay (logo + credit) in the
 * viewport corner. Built on the demo logotype foundation (same Orby Lottie
 * mark), extended to support a custom uploaded SVG, logo scale, left/right
 * placement, and a togglable credit line on the opposite side.
 */
import { ensureLottie } from './lottieLoader.js';
import { ORBY_LIME } from '../constants.js';

const DEFAULT_CREDIT = 'Lorem Ipsu';
const DEFAULT_LOGO_SCALE = 100;
const DEFAULT_CREDIT_SCALE = 100;
const MIN_SCALE = 50;
const MAX_SCALE = 200;
const DEFAULT_LOGO_COLOR = ORBY_LIME;
const DEFAULT_CREDIT_COLOR = '#ffffff';
const DEFAULT_CUSTOM_ASPECT = 1.6;
const CUSTOM_LABEL_MAX = 14;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Factory-default watermark settings — also the target for the section reset icon. */
const DEFAULT_WATERMARK = {
  logo: 'orby',
  placement: 'left',
  credit: DEFAULT_CREDIT,
  creditEnabled: false,
  logoScale: DEFAULT_LOGO_SCALE,
  creditScale: DEFAULT_CREDIT_SCALE,
  logoColor: DEFAULT_LOGO_COLOR,
  logoColorOverride: false,
  creditColor: DEFAULT_CREDIT_COLOR,
};

/** Shorten a filename for the fixed-width Custom button (keeps the extension). */
function shortenFileName(name, max = CUSTOM_LABEL_MAX) {
  if (!name) return 'Custom';
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(1, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

/** @param {string} value @param {string} fallback */
function normalizeHexColor(value, fallback) {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

/** Read width/height ratio from an SVG's viewBox (or width/height) for mask sizing. */
function parseSvgAspectRatio(svgText) {
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return DEFAULT_CUSTOM_ASPECT;
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) return parts[2] / parts[3];
    }
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w / h;
  } catch (error) {
    /* fall through to default */
  }
  return DEFAULT_CUSTOM_ASPECT;
}

export class WatermarkController {
  constructor(ui) {
    this.ui = ui;
    this.overlay = null;
    this.orbyContainer = null;
    this.customEl = null;
    this.creditEl = null;

    this.sectionToggle = null;
    this.resetBtn = null;
    this.logoButtons = [];
    this.placementButtons = [];
    this.customBtn = null;
    this.customFileInput = null;
    this.logoScaleInput = null;
    this.logoScaleValue = null;
    this.logoColorInput = null;
    this.creditToggle = null;
    this.creditFoldout = null;
    this.creditInput = null;
    this.creditScaleInput = null;
    this.creditScaleValue = null;
    this.creditColorInput = null;

    this.orbyAnimation = null;
    this.orbyLoadStarted = false;
    this.customObjectUrl = null;
    this.customFileName = '';
  }

  get settings() {
    const exportSettings = this.ui?.exportSettings;
    if (!exportSettings.watermark || typeof exportSettings.watermark !== 'object') {
      exportSettings.watermark = {};
    }
    const wm = exportSettings.watermark;
    if (wm.logo !== 'orby' && wm.logo !== 'custom') wm.logo = 'orby';
    if (wm.placement !== 'left' && wm.placement !== 'right') wm.placement = 'left';
    if (typeof wm.credit !== 'string') wm.credit = DEFAULT_CREDIT;
    if (typeof wm.creditEnabled !== 'boolean') wm.creditEnabled = false;
    if (!Number.isFinite(wm.logoScale)) wm.logoScale = DEFAULT_LOGO_SCALE;
    if (!Number.isFinite(wm.creditScale)) wm.creditScale = DEFAULT_CREDIT_SCALE;
    if (typeof wm.logoColorOverride !== 'boolean') wm.logoColorOverride = false;
    wm.logoColor = normalizeHexColor(wm.logoColor, DEFAULT_LOGO_COLOR);
    wm.creditColor = normalizeHexColor(wm.creditColor, DEFAULT_CREDIT_COLOR);
    return wm;
  }

  get enabled() {
    return !!this.ui?.exportSettings?.sections?.watermark;
  }

  /** Custom logo only counts when an SVG is actually loaded. */
  get effectiveLogo() {
    return this.settings.logo === 'custom' && this.customObjectUrl ? 'custom' : 'orby';
  }

  init() {
    this.cacheDom();
  }

  cacheDom() {
    this.overlay = document.getElementById('watermarkOverlay');
    this.orbyContainer = document.getElementById('watermarkOverlayOrby');
    this.customEl = document.getElementById('watermarkOverlayCustom');
    this.creditEl = document.getElementById('watermarkOverlayCredit');

    this.sectionToggle = document.getElementById('exportWatermarkSectionOpen');
    this.resetBtn = document.getElementById('watermarkResetBtn');
    this.logoButtons = Array.from(document.querySelectorAll('[data-watermark-logo]'));
    this.placementButtons = Array.from(document.querySelectorAll('[data-watermark-placement]'));
    this.customBtn = document.getElementById('watermarkCustomBtn');
    this.customFileInput = document.getElementById('watermarkCustomFile');
    this.logoScaleInput = document.getElementById('watermarkLogoScale');
    this.logoScaleValue = document.querySelector('[data-output="watermarkLogoScale"]');
    this.logoColorInput = document.getElementById('watermarkLogoColor');
    this.creditToggle = document.getElementById('watermarkCreditEnabled');
    this.creditFoldout = document.querySelector('[data-watermark-credit-foldout]');
    this.creditInput = document.getElementById('watermarkCredit');
    this.creditScaleInput = document.getElementById('watermarkCreditScale');
    this.creditScaleValue = document.querySelector('[data-output="watermarkCreditScale"]');
    this.creditColorInput = document.getElementById('watermarkCreditColor');
  }

  bind() {
    if (this.sectionToggle) {
      this.sectionToggle.addEventListener('change', () => {
        this.ui.exportSettings.sections.watermark = !!this.sectionToggle.checked;
        this.render();
      });
    }

    this.logoButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.watermarkLogo === 'custom' ? 'custom' : 'orby';
        if (choice === 'orby') {
          this.settings.logo = 'orby';
          this.render();
          return;
        }
        // Custom — only activate when a file is loaded; otherwise open the picker
        // and keep Orby visible until the user picks an SVG (cancel = stay on Orby).
        if (this.customObjectUrl) {
          this.settings.logo = 'custom';
          this.render();
          return;
        }
        this.openCustomPicker();
      });
    });

    this.placementButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.settings.placement = btn.dataset.watermarkPlacement === 'right' ? 'right' : 'left';
        this.render();
      });
    });

    if (this.customFileInput) {
      this.customFileInput.addEventListener('change', (event) => {
        const file = event.target?.files?.[0];
        if (file) this.loadCustomSvg(file);
      });
    }

    if (this.logoScaleInput) {
      this.logoScaleInput.addEventListener('input', () => {
        const value = Math.round(Number(this.logoScaleInput.value));
        this.settings.logoScale = Number.isFinite(value)
          ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
          : DEFAULT_LOGO_SCALE;
        this.applyLogoScale();
        this.updateResetButton();
      });
    }

    if (this.creditScaleInput) {
      this.creditScaleInput.addEventListener('input', () => {
        const value = Math.round(Number(this.creditScaleInput.value));
        this.settings.creditScale = Number.isFinite(value)
          ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
          : DEFAULT_CREDIT_SCALE;
        this.applyCreditScale();
        this.updateResetButton();
      });
    }

    if (this.logoColorInput) {
      this.logoColorInput.addEventListener('input', () => {
        this.settings.logoColor = normalizeHexColor(this.logoColorInput.value, DEFAULT_LOGO_COLOR);
        // Picking a color is an explicit opt-in to tint a custom logotype —
        // until then a custom SVG keeps its own brand colors.
        this.settings.logoColorOverride = true;
        this.render();
        this.updateResetButton();
      });
    }

    if (this.creditColorInput) {
      this.creditColorInput.addEventListener('input', () => {
        this.settings.creditColor = normalizeHexColor(
          this.creditColorInput.value,
          DEFAULT_CREDIT_COLOR,
        );
        this.applyColors();
        this.updateResetButton();
      });
    }

    if (this.creditToggle) {
      this.creditToggle.addEventListener('change', () => {
        this.settings.creditEnabled = !!this.creditToggle.checked;
        this.render();
      });
    }

    if (this.creditInput) {
      this.creditInput.addEventListener('input', () => {
        this.settings.credit = this.creditInput.value;
        this.renderCredit();
        this.updateResetButton();
      });
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        if (!this.resetBtn.classList.contains('is-dirty')) return;
        this.resetToDefaults();
      });
    }

    this.syncFromSettings();
  }

  openCustomPicker() {
    this.customFileInput?.click();
  }

  async loadCustomSvg(file) {
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    this.customObjectUrl = URL.createObjectURL(file);
    this.customFileName = file.name || '';
    this.settings.logo = 'custom';
    // Start with the uploaded artwork's own colors — never recolor a brand
    // logotype unless the user explicitly picks a Logotype Color afterwards.
    this.settings.logoColorOverride = false;

    // Tint the custom logo to the chosen color by using the SVG as a CSS mask
    // (an <img> can't be recolored). Aspect ratio comes from the SVG viewBox.
    let aspect = DEFAULT_CUSTOM_ASPECT;
    try {
      aspect = parseSvgAspectRatio(await file.text());
    } catch (error) {
      /* keep default aspect */
    }
    if (this.customEl) {
      const maskValue = `url("${this.customObjectUrl}") center / contain no-repeat`;
      this.customEl.style.setProperty('--watermark-custom-mask', maskValue);
      this.customEl.style.setProperty('--watermark-custom-aspect', String(aspect));
    }
    this.render();
  }

  /** Lazy-load the Orby Lottie mark on first reveal (mirrors DemoLogotypeController). */
  ensureOrbyLogo() {
    if (this.orbyLoadStarted || !this.orbyContainer) return;
    this.orbyLoadStarted = true;
    (async () => {
      try {
        const lottie = await ensureLottie();
        this.orbyAnimation = lottie.loadAnimation({
          container: this.orbyContainer,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: `./assets/animations/data.json?v=${Date.now()}`,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            clearCanvas: true,
            progressiveLoad: false,
            hideOnTransparent: true,
          },
        });
        this.orbyAnimation?.setSpeed?.(0.5);
        this.orbyAnimation?.addEventListener?.('DOMLoaded', () => {
          const svg = this.orbyContainer.querySelector('svg');
          if (svg) {
            svg.style.width = '100%';
            svg.style.height = 'auto';
          }
        });
      } catch (error) {
        console.error('Failed to load watermark Orby logo:', error);
      }
    })();
  }

  /** Toggle the watermark on/off (keyboard shortcut entry point). */
  toggle() {
    if (!this.sectionToggle) return;
    this.sectionToggle.checked = !this.sectionToggle.checked;
    this.sectionToggle.dispatchEvent(new Event('change', { bubbles: true }));
  }

  applyLogoScale() {
    if (!this.overlay) return;
    const scale = this.settings.logoScale / 100;
    this.overlay.style.setProperty('--watermark-logo-scale', String(scale));
    if (this.logoScaleValue) this.logoScaleValue.textContent = `${this.settings.logoScale}%`;
  }

  applyCreditScale() {
    if (!this.overlay) return;
    const scale = this.settings.creditScale / 100;
    this.overlay.style.setProperty('--watermark-credit-scale', String(scale));
    if (this.creditScaleValue) this.creditScaleValue.textContent = `${this.settings.creditScale}%`;
  }

  applyColors() {
    if (!this.overlay) return;
    this.overlay.style.setProperty('--watermark-logo-color', this.settings.logoColor);
    this.overlay.style.setProperty('--watermark-credit-color', this.settings.creditColor);
  }

  /**
   * Section reset is "dirty" whenever any watermark setting differs from the
   * factory defaults, or a custom SVG has been uploaded this session. Watermark
   * state lives in `exportSettings` (not the StateStore), so the global
   * ResetControls dirty-tracking can't see it — this controller owns it.
   */
  get isDirty() {
    const wm = this.settings;
    return (
      wm.logo !== DEFAULT_WATERMARK.logo ||
      wm.placement !== DEFAULT_WATERMARK.placement ||
      (wm.credit ?? '') !== DEFAULT_WATERMARK.credit ||
      wm.creditEnabled !== DEFAULT_WATERMARK.creditEnabled ||
      wm.logoScale !== DEFAULT_WATERMARK.logoScale ||
      wm.creditScale !== DEFAULT_WATERMARK.creditScale ||
      wm.logoColorOverride !== DEFAULT_WATERMARK.logoColorOverride ||
      wm.logoColor !== DEFAULT_WATERMARK.logoColor ||
      wm.creditColor !== DEFAULT_WATERMARK.creditColor ||
      !!this.customObjectUrl
    );
  }

  updateResetButton() {
    this.resetBtn?.classList.toggle('is-dirty', this.isDirty);
  }

  /** Restore all watermark settings to defaults and clear any uploaded SVG. */
  resetToDefaults() {
    const wm = this.settings;
    wm.logo = DEFAULT_WATERMARK.logo;
    wm.placement = DEFAULT_WATERMARK.placement;
    wm.credit = DEFAULT_WATERMARK.credit;
    wm.creditEnabled = DEFAULT_WATERMARK.creditEnabled;
    wm.logoScale = DEFAULT_WATERMARK.logoScale;
    wm.creditScale = DEFAULT_WATERMARK.creditScale;
    wm.logoColorOverride = DEFAULT_WATERMARK.logoColorOverride;
    wm.logoColor = DEFAULT_WATERMARK.logoColor;
    wm.creditColor = DEFAULT_WATERMARK.creditColor;

    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
      this.customObjectUrl = null;
    }
    this.customFileName = '';
    if (this.customFileInput) this.customFileInput.value = '';
    if (this.customEl) {
      this.customEl.style.removeProperty('--watermark-custom-mask');
      this.customEl.style.removeProperty('--watermark-custom-aspect');
    }

    this.ui?.uiSounds?.playSelect?.();
    this.syncFromSettings();
    this.ui?.helpers?.showToast?.('Watermark reset', 3200, { notification: false });
  }

  /** Push persisted settings into the controls + overlay (no event side effects). */
  syncFromSettings() {
    const settings = this.settings;

    if (this.sectionToggle) this.sectionToggle.checked = this.enabled;
    if (this.logoScaleInput) this.logoScaleInput.value = String(settings.logoScale);
    if (this.creditScaleInput) this.creditScaleInput.value = String(settings.creditScale);
    if (this.logoColorInput) this.logoColorInput.value = settings.logoColor;
    if (this.creditToggle) this.creditToggle.checked = settings.creditEnabled;
    if (this.creditInput && this.creditInput.value !== settings.credit) {
      this.creditInput.value = settings.credit ?? '';
    }
    if (this.creditColorInput) this.creditColorInput.value = settings.creditColor;
    this.applyLogoScale();
    this.applyCreditScale();
    this.applyColors();
    this.syncButtonStates();
    this.render();
  }

  renderCredit() {
    if (!this.creditEl) return;
    const text = this.settings.credit ?? '';
    const show = this.settings.creditEnabled && text.trim().length > 0;
    this.creditEl.textContent = text;
    this.creditEl.hidden = !show;
  }

  /** Reflect active logo / placement choice + Custom filename on the segmented buttons. */
  syncButtonStates() {
    const settings = this.settings;
    const logo = this.effectiveLogo;
    this.logoButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.watermarkLogo === logo);
    });
    this.placementButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.watermarkPlacement === settings.placement);
    });
    if (this.customBtn) {
      this.customBtn.textContent = this.customFileName
        ? shortenFileName(this.customFileName)
        : 'Custom';
      if (this.customFileName) this.customBtn.title = this.customFileName;
    }
  }

  /** Show exactly one logo layer — Orby Lottie or custom SVG mask, never both. */
  syncLogoVisibility() {
    const logo = this.effectiveLogo;
    const showOrby = logo === 'orby';
    const showCustom = logo === 'custom';

    if (this.overlay) {
      this.overlay.dataset.logo = logo;
      // Only a custom logotype the user has chosen to recolor gets tinted;
      // otherwise it renders in its own colors.
      this.overlay.dataset.logoTint =
        showCustom && this.settings.logoColorOverride ? 'on' : 'off';
    }

    if (this.orbyContainer) {
      this.orbyContainer.hidden = !showOrby;
      this.orbyContainer.setAttribute('aria-hidden', showOrby ? 'false' : 'true');
    }
    if (this.customEl) {
      this.customEl.hidden = !showCustom;
      this.customEl.setAttribute('aria-hidden', showCustom ? 'false' : 'true');
    }
  }

  render() {
    if (!this.overlay) return;
    const settings = this.settings;
    const enabled = this.enabled;
    const logo = this.effectiveLogo;

    // Persisted state may say "custom" without a loaded file — normalize for save/restore.
    if (settings.logo === 'custom' && !this.customObjectUrl) {
      settings.logo = 'orby';
    }

    this.overlay.dataset.placement = settings.placement;

    this.applyLogoScale();
    this.applyCreditScale();
    this.applyColors();
    this.syncButtonStates();
    this.syncLogoVisibility();

    // Credit foldout follows the toggle.
    if (this.creditFoldout) {
      this.creditFoldout.classList.toggle('effect-foldout--collapsed', !settings.creditEnabled);
      this.creditFoldout.classList.toggle('effect-foldout--expanded', settings.creditEnabled);
      this.creditFoldout.setAttribute('aria-hidden', settings.creditEnabled ? 'false' : 'true');
    }

    // Logotype Color only applies to a custom SVG — the Orby Lottie mark keeps
    // its own brand colors, so grey the picker out when Orby is active.
    if (this.logoColorInput) {
      const logoColorEnabled = logo === 'custom';
      this.logoColorInput.disabled = !logoColorEnabled;
      this.logoColorInput.classList.toggle('is-disabled-handle', !logoColorEnabled);
    }

    if (enabled && logo === 'orby') this.ensureOrbyLogo();

    this.renderCredit();

    // Legacy demo logotype (separate #demoLogotype) must not stack with the watermark.
    if (enabled) {
      this.ui?.demoLogotype?.hide?.();
    }

    // Keep the node mounted (pointer-events: none) so opacity can fade both ways.
    this.overlay.hidden = false;
    this.overlay.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    requestAnimationFrame(() => {
      this.overlay.classList.toggle('is-visible', enabled);
    });

    if (this.orbyAnimation) {
      if (enabled && logo === 'orby') this.orbyAnimation.play?.();
      else this.orbyAnimation.pause?.();
    }

    this.updateResetButton();
  }
}
