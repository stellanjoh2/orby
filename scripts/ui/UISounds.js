/**
 * Optional UI feedback sounds (e.g. studio shelf show/hide).
 * Place WAV assets under assets/sounds/ui/ — missing files fail silently.
 */
const STORAGE_KEY = 'orby_ui_sounds_enabled';
const STORAGE_KEY_VOLUME = 'orby_ui_sounds_volume';

/** Linear gain for toggle-on/off (stepped down twice ~25% from full scale). */
const TOGGLE_VOLUME = 0.75 * 0.75;

export class UISounds {
  constructor() {
    this.enabled = UISounds.readEnabled();
    /** Master multiplier 0–1 (persisted). Per-clip base gain is stored in `_clipBase`. */
    this.masterVolume = UISounds.readMasterVolume();
    /** @type {WeakMap<HTMLAudioElement, number>} */
    this._clipBase = new WeakMap();
    /** @type {HTMLAudioElement | null} */
    this._shelfShow = null;
    /** @type {HTMLAudioElement | null} */
    this._shelfHide = null;
    /** Random tap clips — shelf tabs, segmented controls, export option buttons. */
    /** @type {HTMLAudioElement[] | null} */
    this._tapVariants = null;
    /** Typewriter clips — bug-report message field only. */
    /** @type {HTMLAudioElement[] | null} */
    this._typeVariants = null;
    /** @type {HTMLAudioElement | null} */
    this._caution = null;
    /** @type {HTMLAudioElement | null} */
    this._notification = null;
    /** @type {HTMLAudioElement | null} */
    this._toggleOn = null;
    /** @type {HTMLAudioElement | null} */
    this._toggleOff = null;
    /** Coalesce multiple hide sounds in one animation frame (e.g. podium + glass hiding together). */
    /** @type {number | null} */
    this._shelfHideRaf = null;
  }

  static readEnabled() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === null) return true;
      return v === '1' || v === 'true';
    } catch {
      return true;
    }
  }

  static persistEnabled(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* ignore quota / private mode */
    }
  }

  static readMasterVolume() {
    try {
      const v = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (v === null) return 1;
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)) return 1;
      return Math.min(1, Math.max(0, n / 100));
    } catch {
      return 1;
    }
  }

  static persistMasterVolume(value01) {
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(Math.round(value01 * 100)));
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled = !!on;
    UISounds.persistEnabled(this.enabled);
  }

  /**
   * @param {number} value01 — 0–1
   */
  setMasterVolume(value01) {
    const v = Number(value01);
    this.masterVolume =
      Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    UISounds.persistMasterVolume(this.masterVolume);
  }

  getMasterVolume() {
    return this.masterVolume;
  }

  /**
   * @param {HTMLAudioElement} audio
   * @param {number} [base=1] linear gain before master volume
   */
  _registerClip(audio, base = 1) {
    this._clipBase.set(audio, base);
  }

  playShelfShow() {
    if (!this.enabled) return;
    this._play(this._audioShow());
  }

  playShelfHide() {
    if (!this.enabled) return;
    if (this._shelfHideRaf != null) return;
    this._shelfHideRaf = requestAnimationFrame(() => {
      this._shelfHideRaf = null;
      this._play(this._audioHide());
    });
  }

  /** Play show sound regardless of preference — for explicit “test” UX. */
  playShelfShowPreview() {
    this._play(this._audioShow());
  }

  /** Warnings / errors (unsupported file type, load failures, etc.). */
  playCaution() {
    if (!this.enabled) return;
    if (!this._caution) {
      this._caution = new Audio('./assets/sounds/ui/caution.wav');
      this._caution.preload = 'auto';
      this._registerClip(this._caution, 1);
    }
    this._play(this._caution);
  }

  /** Success / informational modals and positive toasts. */
  playNotification() {
    if (!this.enabled) return;
    if (!this._notification) {
      this._notification = new Audio('./assets/sounds/ui/notification.wav');
      this._notification.preload = 'auto';
      this._registerClip(this._notification, 1);
    }
    this._play(this._notification);
  }

  /** AE-style cue when a render / export pipeline completes successfully (same clip as notification). */
  playRenderFinished() {
    this.playNotification();
  }

  /** Shelf tabs, segmented controls, export option buttons — random tap clips. */
  playSelect() {
    if (!this.enabled) return;
    const variants = this._ensureTapVariants();
    const idx = Math.floor(Math.random() * variants.length);
    this._play(variants[idx]);
  }

  /** `.effect-toggle` checkboxes — SND toggle on/off (not tap kit). */
  playEffectToggle(on) {
    if (!this.enabled) return;
    this._play(on ? this._audioToggleOn() : this._audioToggleOff());
  }

  /** Bug-report textarea — SND “type” kit (randomized). */
  playBugReportTap() {
    if (!this.enabled) return;
    const variants = this._ensureTypeVariants();
    const idx = Math.floor(Math.random() * variants.length);
    this._play(variants[idx]);
  }

  _ensureTapVariants() {
    if (!this._tapVariants) {
      this._tapVariants = [];
      for (let i = 1; i <= 5; i++) {
        const n = String(i).padStart(2, '0');
        const a = new Audio(`./assets/sounds/ui/tap-${n}.wav`);
        a.preload = 'auto';
        this._registerClip(a, 1);
        this._tapVariants.push(a);
      }
    }
    return this._tapVariants;
  }

  _ensureTypeVariants() {
    if (!this._typeVariants) {
      this._typeVariants = [];
      for (let i = 1; i <= 5; i++) {
        const n = String(i).padStart(2, '0');
        const a = new Audio(`./assets/sounds/ui/type-${n}.wav`);
        a.preload = 'auto';
        this._registerClip(a, 1);
        this._typeVariants.push(a);
      }
    }
    return this._typeVariants;
  }

  _audioShow() {
    if (!this._shelfShow) {
      this._shelfShow = new Audio('./assets/sounds/ui/shelf-show.wav');
      this._shelfShow.preload = 'auto';
      this._registerClip(this._shelfShow, 1);
    }
    return this._shelfShow;
  }

  _audioHide() {
    if (!this._shelfHide) {
      this._shelfHide = new Audio('./assets/sounds/ui/shelf-hide.wav');
      this._shelfHide.preload = 'auto';
      this._registerClip(this._shelfHide, 1);
    }
    return this._shelfHide;
  }

  _audioToggleOn() {
    if (!this._toggleOn) {
      this._toggleOn = new Audio('./assets/sounds/ui/toggle-on.wav');
      this._toggleOn.preload = 'auto';
      this._registerClip(this._toggleOn, TOGGLE_VOLUME);
    }
    return this._toggleOn;
  }

  _audioToggleOff() {
    if (!this._toggleOff) {
      this._toggleOff = new Audio('./assets/sounds/ui/toggle-off.wav');
      this._toggleOff.preload = 'auto';
      this._registerClip(this._toggleOff, TOGGLE_VOLUME);
    }
    return this._toggleOff;
  }

  /**
   * @param {HTMLAudioElement | null} audio
   */
  _play(audio) {
    if (!audio) return;
    try {
      const base = this._clipBase.get(audio) ?? 1;
      audio.volume = Math.min(1, Math.max(0, base * this.masterVolume));
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      /* decode / autoplay policy */
    }
  }
}
