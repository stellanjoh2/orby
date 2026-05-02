import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_PODIUM_GLASS_BLUR,
  DEFAULT_PODIUM_GLASS_AMOUNT,
  DEFAULT_PODIUM_GLASS_BRIGHTNESS,
} from './constants.js';
import { deepClone } from './utils/deepClone.js';

export class StateStore {
  constructor() {
    this.defaults = {
      shading: 'shaded',
      scale: 1,
      xOffset: 0,
      yOffset: 0,
      zOffset: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      autoRotate: 0,
      moveWidgetEnabled: false,
      rotateWidgetEnabled: false,
      scaleWidgetEnabled: false,
      material: {
        brightness: 1.0,
        metalness: 0.0,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
        emissive: 0.0,
      },
      /** Shown when the loaded source file is `.fbx` — manual texture slot assignment. */
      fbxMapSlots: {
        enabled: false,
        /** DirectX-style normal maps vs OpenGL — toggles tangent Y via normalScale. */
        invertNormalY: false,
        /** 0 = first UV (`uv`), 1 = second (`uv2`) — Three.js Texture.channel for detail maps only; base color stays on `uv`. */
        pbrUvChannel: 0,
      },
      svgExtrude: {
        enabled: false,
        depth: 0.2,
        normalAngle: 45,
        availableColors: [],
        colorDepths: {},
        colorOffsets: {},
        flipDirection: false,
        colorOverride: false,
        overrideColor: '#7ed321',
        surfacePreset: 'none',
        surfaceScale: 1.0,
      },
      advanced: {
        reverseNormals: false,
        /** @type {'default' | 'opaqueBlend' | 'frontFace' | 'opaqueAndFrontFace'} */
        transparencyFix: 'default',
        /** Heuristic glass/window materials only (see MaterialController.isWindowMesh). */
        glassOpacity: 0.45,
        /** Multiplier on scene HDRI env intensity for those materials (1 ≈ same as non-glass). */
        glassReflection: 2,
        /** Base body tint (darker / colored glass). #ffffff = neutral. */
        glassTint: '#ffffff',
        /** 0 = import-like; 1 = crush glTF transmission + darken (less see-through). */
        glassBody: 0,
      },
      hdri: 'beach',
      hdriEnabled: true,
      hdriStrength: 2,
      hdriBlurriness: 0,
      hdriRotation: 0,
      hdriBackground: true,
      groundSolid: false,
      groundWire: false,
      groundWireOpacity: 1.0,
      groundY: 0,
      gridY: 0,
      podiumScale: 1,
      gridScale: 1,
      podiumMetalness: DEFAULT_MATERIAL_METALNESS,
      podiumRoughness: DEFAULT_MATERIAL_ROUGHNESS,
      podiumReflection: 1,
      podiumClearcoat: 0,
      /** Planar glass reflection on podium top — off until user enables Glass (requires podium). */
      podiumGlassSurface: false,
      podiumGlassBlur: DEFAULT_PODIUM_GLASS_BLUR,
      podiumGlassAmount: DEFAULT_PODIUM_GLASS_AMOUNT,
      podiumGlassBrightness: DEFAULT_PODIUM_GLASS_BRIGHTNESS,
      groundSolidColor: '#808080',
      groundWireColor: '#e1e1e1',
      clay: {
        color: '#808080',
        normalMap: true,
      },
      wireframe: {
        alwaysOn: false,
        color: '#c8c8c8',
        onlyVisibleFaces: false,
        hideMesh: false,
      },
      fresnel: {
        enabled: false,
        color: '#808080',
        radius: 2,
        strength: 0.3,
      },
      lights: {
        key: { color: '#ffdfc9', intensity: 1.28, height: 5, rotate: 0, enabled: true, castShadows: true },
        fill: { color: '#b0c7ff', intensity: 0.8, height: 3, rotate: 0, enabled: true, castShadows: true },
        rim: { color: '#a0eaf9', intensity: 0.96, height: 4, rotate: 0, enabled: true, castShadows: true },
        ambient: { color: '#7c8ca6', intensity: 0.48, enabled: true },
      },
      lightsEnabled: true,
      lightsMaster: 0.30,
      lightsRotation: 0,
      lightsHeight: 5,
      lightsAutoRotate: false,
      showLightIndicators: false,
      lightsCastShadows: true,
      lensFlare: {
        enabled: false,
        rotation: 0,
        height: 15,
        color: '#d28756',
        quality: 'maximum',
      },
      dof: {
        enabled: false,
        focus: 1.5, // Very close focus for tight asset viewing
        aperture: 0.003, // Moderate aperture for subtle DOF
      },
      bloom: {
        enabled: true,
        threshold: 1,
        strength: 0.2,
        radius: 0.75,
        color: '#ffe9cc',
      },
      lensDirt: {
        enabled: false,
        strength: 0.8,
        minLuminance: 0.55,
        maxLuminance: 0.95,
        sensitivity: 0.55,
      },
      grain: { enabled: false, intensity: 0.03, color: '#ffffff' },
      aberration: { enabled: false, offset: 0.0025, strength: 0.24 },
      /** Screen-space AO (N8AO); off by default — GPU-heavy when enabled. */
      ambientOcclusion: {
        enabled: false,
        intensity: 5,
        radius: 5,
        quality: 'medium',
        color: '#000000',
      },
      camera: {
        fov: 50,
        tilt: 0,
        autoOrbit: 'off',
        handheld: 'off',
        contrast: 1.0,
        temperature: CAMERA_TEMPERATURE_NEUTRAL_K,
        tint: 0,
        highlights: 0,
        shadows: 0,
        saturation: 1.0,
        clarity: 0,
        fade: 0,
        sharpness: 0,
        vignette: 0,
        vignetteColor: '#000000',
      },
      exposure: 1.0,
      autoExposure: false,
      histogramEnabled: false,
      toneCurveOpen: false,
      toneCurve: {
        p1: { x: 0.25, y: 0.25 },
        p2: { x: 0.75, y: 0.75 },
      },
      antiAliasing: 'fxaa',
      renderQuality: 'medium',
      toneMapping: 'aces-filmic',
      background: '#000000',
      lookFilterPreset: 'none',
      lookFilterPresetsOpen: false,
      /** 'low' | 'medium' | 'high' — color SVG (ImageTracer) trace fidelity */
      svgColorDetail: 'high',
    };
    this.state = deepClone(this.defaults);
    this.subscribers = new Set();
    /** When > 0, `set` / `setTopLevelBundle` / `reset` defer `notify` until outermost batch ends. */
    this._batchDepth = 0;
  }

  getState() {
    return deepClone(this.state);
  }

  getDefaults() {
    return deepClone(this.defaults);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const snapshot = this.getState();
    for (const callback of this.subscribers) {
      try {
        callback(snapshot);
      } catch (error) {
        console.error('[StateStore] subscriber failed', error);
      }
    }
  }

  _notifyIfIdle() {
    if (this._batchDepth === 0) {
      this.notify();
    }
  }

  /**
   * @param {string} path - Dot path, same as `set`
   * @param {unknown} value
   */
  _writePath(path, value) {
    const segments = path.split('.');
    let target = this.state;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      target[key] = target[key] ?? {};
      target = target[key];
    }
    target[segments.at(-1)] = value;
  }

  set(path, value) {
    this._writePath(path, value);
    this._notifyIfIdle();
  }

  /**
   * Run `fn` with batching: commits many `set`/`setTopLevelBundle`/`reset` mutations,
   * then a single `notify` when the outermost batch completes. Nested batches collapse
   * to one notification.
   * @param {() => void} fn
   */
  batch(fn) {
    this._batchDepth += 1;
    try {
      fn();
    } finally {
      this._batchDepth -= 1;
      if (this._batchDepth === 0) {
        this.notify();
      }
      if (this._batchDepth < 0) {
        this._batchDepth = 0;
      }
    }
  }

  /**
   * Replace many top-level state keys in one go (single notify + one getState() clone
   * for subscribers). Use for look-filter apply and similar bulk updates — avoids
   * N× full UI sync, GC churn, and stacked rAF slider-fill passes.
   * @param {Record<string, unknown>} partial — top-level keys only, e.g. { camera, bloom, … }
   */
  setTopLevelBundle(partial) {
    if (!partial || typeof partial !== 'object') return;
    const keys = Object.keys(partial);
    if (keys.length === 0) return;
    for (const key of keys) {
      this.state[key] = partial[key];
    }
    this._notifyIfIdle();
  }

  reset() {
    this.state = deepClone(this.defaults);
    this._notifyIfIdle();
    return this.getState();
  }
}

