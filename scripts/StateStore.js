import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_PODIUM_GLASS_BLUR,
  DEFAULT_PODIUM_GLASS_AMOUNT,
  DEFAULT_PODIUM_GLASS_BRIGHTNESS,
} from './constants.js';
import { defaultAberration } from './render/chromaticAberration.js';
import { normalizeToneCurve } from './math/toneCurvePchip.js';
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
        brightness: DEFAULT_MATERIAL_BRIGHTNESS,
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
        /**
         * When true, uses Three.js alpha-hash on BLEND + double-sided materials.
         * Default on — Sketchfab often packs skin + visor + gear into one BLEND mesh; without this,
         * transparent triangles sort incorrectly (see-through helmet, black visor holes). Turn off if
         * hair/cloth looks too grainy.
         */
        blendSortingMitigation: true,
        /** Transmission / window meshes: negate tangent normal Y if glazing reads inverted vs HDRI. */
        flipGlassNormalMapY: false,
        /** Transmission / window meshes: draw front faces only (single-sided shell). */
        glassFrontFacesOnly: false,
        /**
         * UV Checker overlay — tiles a checker map across mesh UVs so 3D artists can spot stretching
         * and seam issues at a glance. Renders as a translucent clone of the model so original
         * materials/shading are untouched.
         */
        uvChecker: false,
        /** Tiling multiplier for the UV checker overlay (1 = one tile per UV island). */
        uvCheckerScale: 1,
        /**
         * Checker pattern style. `vibrant` = Atlux color UV map; `monochrome` = grayscale variant
         * (better for reading shading + checker pattern together on textured meshes).
         * @type {'vibrant' | 'monochrome'}
         */
        uvCheckerStyle: 'vibrant',
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
      backdropEnabled: false,
      backdropScale: 1,
      backdropWidth: 2,
      backdropColor: '#808080',
      backdropRotation: 0,
      backdropY: 0,
      backdropTextureEnabled: false,
      backdropTextureScale: 1.8,
      groundSolidColor: '#808080',
      groundWireColor: '#c4ff00',
      clay: {
        color: '#808080',
        normalMap: true,
      },
      wireframe: {
        alwaysOn: false,
        color: '#c4ff00',
        onlyVisibleFaces: true,
        hideMesh: false,
      },
      /** Stylized ShaderMaterial overrides for imported meshes (non-glass); off restores GLB materials. */
      creativeLook: {
        enabled: false,
        preset: 'neon-edge',
        /** When true, flow-field / plasma / holographic `uTime` stops advancing. */
        pauseShaderAnimations: false,
        /** Multiplier on shader `uTime` for animated presets (0–2); same scale for flow, plasma, holographic, spectral storm. Default tuned for spectral storm pacing. */
        shaderAnimationSpeed: 0.4,
        /** World-space pattern size multiplier for Shader Lab presets. 1 = preset default. */
        patternScale: 1,
      },
      fresnel: {
        enabled: false,
        color: '#808080',
        radius: 2,
        strength: 0.3,
      },
      /** MeshPhysicalMaterial transmission — volumetric translucency (Shaded + Clay), not the older SubsurfaceScatteringShader demo. */
      subsurface: {
        enabled: false,
        translucency: 0,
        scatterTint: '#ffd4b8',
      },
      lights: {
        key: { color: '#ffdfc9', intensity: 1.28, height: 5, rotate: 0, enabled: true, castShadows: true },
        fill: { color: '#b0c7ff', intensity: 0.8, height: 3, rotate: 0, enabled: true, castShadows: true },
        rim: { color: '#a0eaf9', intensity: 0.96, height: 4, rotate: 0, enabled: true, castShadows: true },
        ambient: { color: '#7c8ca6', intensity: 0.48, enabled: true },
      },
      /** Off by default: HDRI already lights the scene; turn on for 3-point rig + directional shadows. */
      lightsEnabled: false,
      lightsMaster: 0.30,
      lightsRotation: 0,
      lightsHeight: 5,
      lightsAutoRotate: false,
      showLightIndicators: false,
      lightsCastShadows: true,
      /** 3-point light shadow map quality preset. */
      lightsShadowQuality: 'medium',
      /** Directional shadow softness radius (0 = harder edges, 4 = soft default). */
      lightsShadowSoftness: 4,
      /** Directional-light shadow bias; lower (more negative) tightens contact. */
      lightsShadowContactOffset: -0.0001,
      /** Cast shadows from both sides (useful for thin single-surface meshes). */
      lightsShadowTwoSided: false,
      lensFlare: {
        enabled: false,
        rotation: 0,
        height: 15,
        color: '#d28756',
        quality: 'maximum',
        haloIntensity: 1.0,
        anamorphicBloom: {
          enabled: false,
          quality: 'medium',
          strength: 1.0,
          spread: 0.2,
          /** Streak axis in degrees (0–180); 0 = horizontal (classic anamorphic). */
          streakAngle: 0,
          threshold: 0.7,
          soften: 0.12,
          streakTint: '#7ec8ff',
        },
      },
      dof: {
        enabled: false,
        focus: 1.5, // Very close focus for tight asset viewing
        aperture: 0.003, // Moderate aperture for subtle DOF
        quality: 'high',
      },
      bloom: {
        enabled: true,
        threshold: 1.0,
        strength: 0.2,
        radius: 0.2,
        color: '#ffe9cc',
        quality: 'medium',
      },
      lensDirt: {
        enabled: false,
        strength: 0.8,
        minLuminance: 0.55,
        maxLuminance: 0.95,
        sensitivity: 0.55,
      },
      grain: { enabled: false, intensity: 0.03, color: '#ffffff' },
      aberration: { ...defaultAberration },
      /** Screen-space AO (N8AO); off by default — GPU-heavy when enabled. */
      ambientOcclusion: {
        enabled: false,
        intensity: 5,
        radius: 5,
        quality: 'medium',
        color: '#000000',
      },
      /** Wide-angle lens distortion (de Carpentier); post-process after full grading stack. */
      fisheye: {
        enabled: false,
        horizontalFOVDeg: 131,
        strength: 0.37,
        cylindricalRatio: 4,
      },
      camera: {
        fov: 50,
        tilt: 0,
        /** Rule-of-thirds / crosshair / diagonal overlay in viewport (16×9 letterbox). */
        compositionGridEnabled: false,
        /** Dark strokes instead of light — for bright scenes. */
        compositionGuidesInverted: false,
        /** Viewport-only 21∶9 mattes (letterbox / pillarbox) for framing. */
        cinematicLetterbox219: false,
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
        vignetteEnabled: false,
        vignette: 0.5,
        vignetteColor: '#000000',
      },
      exposure: 1.0,
      autoExposure: false,
      histogramEnabled: false,
      toneCurveOpen: false,
      toneCurve: {
        blackY: 0,
        whiteY: 1,
        p1: { x: 1 / 3, y: 1 / 3 },
        p2: { x: 2 / 3, y: 2 / 3 },
      },
      antiAliasing: 'fxaa',
      renderQuality: 'medium',
      toneMapping: 'aces-filmic',
      background: '#000000',
      lookFilterPreset: 'none',
      lookFilterPresetsOpen: false,
      /** Object tab — fold-out for Shader Lab (stylized materials). */
      creativeLookSectionOpen: false,
      /** 'low' | 'medium' | 'high' — color SVG (ImageTracer) trace fidelity */
      svgColorDetail: 'high',
      /**
       * ColorChecker Classic (24 swatches) — reference sRGB from Wikipedia / manufacturer data.
       * Default placement (distance / rotate / height / scale) is a tuned “spawn” preset; `enabled` stays
       * false until the user shows the chart.
       */
      colorChecker: {
        enabled: false,
        distance: 2,
        /** Orbit azimuth in degrees (added to global Lights → Rotate). */
        rotate: 333,
        /** Vertical offset from orbit target (scene units), like Key → Height. */
        height: -0.5,
        /** Uniform scale of the chart group (1 = default built-in size). */
        scale: 0.17,
        /** Shortcut to Object → Display → Unlit (textures); restores prior display mode when turned off. */
        rawColors: false,
      },
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
    const v = path === 'toneCurve' ? normalizeToneCurve(value) : value;
    this._writePath(path, v);
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
      const val = key === 'toneCurve' ? normalizeToneCurve(partial[key]) : partial[key];
      this.state[key] = val;
    }
    this._notifyIfIdle();
  }

  reset() {
    this.state = deepClone(this.defaults);
    this._notifyIfIdle();
    return this.getState();
  }
}

