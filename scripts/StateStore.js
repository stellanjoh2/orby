import {
  CAMERA_TEMPERATURE_NEUTRAL_K,
  COLOR_CHECKER_DEFAULT_SCALE,
  DEFAULT_MATERIAL_BRIGHTNESS,
  DEFAULT_MATERIAL_ROUGHNESS,
  DEFAULT_MATERIAL_METALNESS,
  DEFAULT_BACKDROP_METALNESS,
  DEFAULT_BACKDROP_ROUGHNESS,
  DEFAULT_BASE_GLASS_BLUR,
  DEFAULT_BASE_GLASS_AMOUNT,
  DEFAULT_BASE_GLASS_BRIGHTNESS,
  ORBY_BLACK,
  ORBY_LIME,
  APP_BACKGROUND,
  defaultDof,
} from './constants.js';
import { defaultAberration } from './render/chromaticAberration.js';
import { normalizeToneCurve } from './math/toneCurvePchip.js';
import { deepClone } from './utils/deepClone.js';
import { migrateLegacyGroundKeys } from './state/migrateLegacyGroundKeys.js';
import {
  DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
  DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
  DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
  DEFAULT_SVG_EXTRUDE_STATE,
} from './import/extrudeDefaults.js';
import { GOBO_UI_DEFAULT } from './render/GoboProjection.js';
import { DEFAULT_GOBO_SOFTNESS } from './config/gobos.js';
import { DEFAULT_LIGHTS_SHADOW_SOFTNESS } from './config/shadowQuality.js';
import {
  DEFAULT_CAMERA_POSITION,
  defaultCameraDistance,
} from './camera/cameraDefaults.js';

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
      /** @type {'forward' | 'reverse'} */
      autoRotateDirection: 'forward',
      moveWidgetEnabled: false,
      rotateWidgetEnabled: false,
      scaleWidgetEnabled: false,
      material: {
        brightness: DEFAULT_MATERIAL_BRIGHTNESS,
        metalness: 0.0,
        roughness: DEFAULT_MATERIAL_ROUGHNESS,
        emissive: 0.0,
        /** True when the loaded mesh has import metalness/roughness maps (sliders multiply textures). */
        importHasMrMaps: false,
        /** True when import carries per-material PBR factors (sliders scale authored values; 1.0 = file). */
        importUsesAuthoredPbr: false,
      },
      fbxMapSlots: {
        enabled: false,
        /** Material name group key for Map Slots (FBX often clones one material per mesh). */
        activeMaterial: '',
        /** Default tuning for new materials; per-material overrides live in `materials`. */
        defaults: {
          normalConvention: 'match-albedo',
          pbrUvChannel: 0,
          ormPacking: 'gltf',
        },
        /** @type {Record<string, { normalConvention?: string, pbrUvChannel?: number, ormPacking?: string }>} */
        materials: {},
      },
      fontExtrude: {
        panelOpen: false,
        /** @type {'left' | 'center' | 'right'} */
        align: 'center',
        tracking: 0,
        /** @type {'metrics' | 'optical' | 'none'} — metrics = font Auto / pair tables */
        kerning: 'metrics',
        lineHeight: 1,
        /** @type {'low' | 'medium' | 'high' | 'ultra'} — cap/side curve sampling for 3D extrude. */
        detail: 'high',
        /** @type {'convex' | 'straight'} — convex = rounded outset; straight = flat chamfer. */
        bevelType: 'straight',
        /** 0.15–3 — preview-only zoom (1× fills the box; higher may crop). */
        previewScale: 0.65,
        /** Letter fill for 2D preview and 3D extrude. */
        fillColor: '#808080',
        /** Total seconds until the last character finishes scale-in (0 = off). */
        revealDurationSec: 2,
        /** @type {'none' | 'scale' | 'fade' | 'slideUp' | 'slideDown' | 'drop' | 'pop' | 'rotate' | 'elastic'} */
        revealType: 'scale',
        /** @type {'character' | 'word'} — stagger per letter or per word */
        revealUnit: 'character',
        /** Preview playback mode: true loops continuously, false stops at end. */
        revealLoop: true,
        /** Freeze reveal preview + constant loop at the current pose (Resume continues from there). */
        pauseAllAnimations: false,
        /** Per-glyph Z travel distance before landing in place. */
        revealSlideDepth: 0.18,
        /** Fraction of each glyph slot for Z travel (0.1–3; above 1 overlaps later letters). */
        revealSlideTime: 1.3,
        /** Z-travel start direction for reveal slide depth. */
        revealSlideDirection: 'back',
        /** Per-letter emissive during reveal, fading to rest after each glyph lands. */
        revealEmissiveSlam: false,
        revealEmissiveStrength: 1,
        /** Seconds for emissive to decay after each letter lands. */
        revealEmissiveDecaySec: 0.35,
        revealEmissiveColor: ORBY_LIME,
        /** @type {'none' | 'float' | 'wave' | 'breathe' | 'sway' | 'spin'} */
        constantType: 'none',
        /** 0–1 amplitude for looping motion. */
        constantIntensity: 0.5,
        /** Seconds per full loop cycle. */
        constantSpeedSec: 2,
        /** 0–1 phase spread between adjacent glyphs (wave / sway). */
        constantSpread: 1,
        /** Live editor text (Generate from Font). */
        sourceText: '',
        /** Wrap text on a circular arc before extruding (first line only). */
        circularWrapEnabled: false,
        /** @type {'auto' | 'manual'} — auto fits a full 360° ring; manual uses arc span slider. */
        circularWrapMode: 'auto',
        /** Manual arc span in degrees (30–360). */
        circularWrapArcDeg: 360,
        /** Local Font Access postscript name, or `__file__` for embedded custom font. */
        postscriptName: '',
        /** Embedded .ttf/.otf when user loads a font file (not a system face). */
        customFontAsset: null,
      },
      svgExtrude: { ...DEFAULT_SVG_EXTRUDE_STATE },
      advanced: {
        reverseNormals: false,
        /** @type {'default' | 'opaqueBlend' | 'frontFace' | 'opaqueAndFrontFace'} */
        transparencyFix: 'default',
        /** Heuristic glass/window materials only (see MaterialController.isWindowMesh). */
        glassOpacity: 0.45,
        /** Multiplier on scene HDRI env intensity for those materials (1 ≈ same as non-glass). */
        glassReflection: 2,
        /** Base body tint (darker / colored glass). Default black reads better on window meshes. */
        glassTint: ORBY_BLACK,
        /** 0 = import-like; 1 = crush glTF transmission + darken (less see-through). */
        glassBody: 0,
        /**
         * When true, promotes mistaken near-opaque BLEND shells to solid draws and uses alpha-hash only
         * when cutout maps / real layering need it. Turn off if hair/cloth looks too grainy.
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
        uvCheckerScale: 5,
        /**
         * Checker pattern style. `orby` = Orby brand checker; `classic` = Atlux color UV map;
         * `monochrome` = grayscale variant (reads better on already-colored meshes).
         * @type {'orby' | 'classic' | 'monochrome'}
         */
        uvCheckerStyle: 'orby',
        /**
         * Normal / tangent diagnostic overlay — colors surface normals as RGB so artists can
         * spot flipped shading or inspect tangent-space normal maps.
         */
        normalView: false,
        /** @type {'geometry' | 'tangent'} */
        normalViewMode: 'geometry',
        /** Imported meshes: recompute vertex normals with a crease angle (see Object → Advanced). */
        stlSmoothShading: false,
        stlSmoothingAngle: 40,
      },
      hdri: 'beach',
      /** Filename when {@link hdri} is `custom` (blob URL is session-only). */
      hdriCustomName: null,
      /** Embedded custom HDRI bytes for copy / .orby round-trip. */
      hdriCustomAsset: null,
      hdriEnabled: true,
      hdriStrength: 2,
      hdriBlurriness: 0,
      hdriRotation: 0,
      hdriBackground: true,
      /** Invisible shadow/AO catcher over HDRI backdrop (see HdriShadowReceiver). */
      hdriReceiveShadowsAo: false,
      groundSolid: false,
      groundWire: false,
      groundWireOpacity: 1.0,
      groundY: 0,
      gridY: 0,
      baseScale: 1,
      gridScale: 1,
      gridLineWidth: 1,
      baseMetalness: DEFAULT_MATERIAL_METALNESS,
      baseRoughness: DEFAULT_MATERIAL_ROUGHNESS,
      baseReflection: 1,
      baseClearcoat: 0,
      baseSurfacePreset: DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
      baseSurfaceScale: DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
      baseSurfaceStrength: DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
      /** Planar glass reflection on solid base top — independent toggle; shares placement/scale with base. */
      baseGlassSurface: false,
      baseGlassBlur: DEFAULT_BASE_GLASS_BLUR,
      baseGlassAmount: DEFAULT_BASE_GLASS_AMOUNT,
      baseGlassBrightness: DEFAULT_BASE_GLASS_BRIGHTNESS,
      backdropEnabled: false,
      backdropScale: 1,
      backdropWidth: 2,
      backdropColor: '#808080',
      backdropRotation: 0,
      backdropY: 0,
      backdropMetalness: DEFAULT_BACKDROP_METALNESS,
      backdropRoughness: DEFAULT_BACKDROP_ROUGHNESS,
      backdropSurfacePreset: DEFAULT_SVG_EXTRUDE_SURFACE_PRESET,
      backdropSurfaceScale: DEFAULT_SVG_EXTRUDE_SURFACE_SCALE,
      backdropSurfaceStrength: DEFAULT_SVG_EXTRUDE_SURFACE_STRENGTH,
      groundSolidColor: '#808080',
      groundWireColor: ORBY_LIME,
      clay: {
        color: '#808080',
        normalMap: true,
      },
      wireframe: {
        alwaysOn: false,
        color: ORBY_LIME,
        onlyVisibleFaces: true,
        hideMesh: false,
        thickness: 1,
      },
      animation: {
        showBones: false,
        showJointNames: false,
        hideMesh: false,
        jointScale: 0.5,
        boneStrokeWidth: 2,
        clipPlaybackMode: 'loop',
        displayFps: 60,
        timeReferenceEnabled: false,
      },
      /** Stylized ShaderMaterial overrides for imported meshes (non-glass); off restores GLB materials. */
      creativeLook: {
        enabled: false,
        /** `null` until the user picks a Shader Lab preset (not Neon Edge by default). */
        preset: null,
        /** When true, animated Shader Lab presets stop advancing `uTime`. */
        pauseShaderAnimations: false,
        /** Multiplier on shader `uTime` for animated presets (0–2). Default tuned for spectral storm pacing. */
        shaderAnimationSpeed: 0.4,
        /** World-space pattern size multiplier for Shader Lab presets. 1 = preset default. */
        patternScale: 1,
        /** Global hue shift for all Shader Lab presets (-180…180°). Independent of Cam/FX grading. */
        masterHue: 0,
        /** Effect punch for Shader Lab presets (0–2). 1 = default; meaning varies by preset. */
        intensity: 1,
        /** Shadow lift (+) vs black crush (−) on shader preset output. True Chrome / Glass ignore. */
        liftCrush: 0,
        /** Viewport bloom shortcut (independent of Camera & FX bloom.enabled). */
        viewportBloom: false,
        /** Preset-specific sliders — e.g. sketch strokeWidth / rasterSize. */
        presetParams: {},
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
        key: { color: '#ffdfc9', intensity: 1.28, height: 5, rotate: 0, enabled: false, castShadows: false },
        fill: { color: '#b0c7ff', intensity: 0.8, height: 3, rotate: 0, enabled: false, castShadows: false },
        rim: { color: '#a0eaf9', intensity: 0.96, height: 4, rotate: 0, enabled: false, castShadows: false },
        ambient: { color: '#7c8ca6', intensity: 0.48, enabled: false },
      },
      /** Off by default: HDRI already lights the scene; turn on for 3-point rig + directional shadows. */
      lightsEnabled: false,
      lightsMaster: 0.30,
      lightsRotation: 0,
      lightsHeight: 5,
      lightsAutoRotate: false,
      showLightIndicators: false,
      lightsCastShadows: false,
      /** 3-point light shadow map quality preset. */
      lightsShadowQuality: 'medium',
      /** Directional shadow softness radius (0 = harder edges, 4 = max penumbra). */
      lightsShadowSoftness: DEFAULT_LIGHTS_SHADOW_SOFTNESS,
      /** Tint color for shadowed areas (black = darkest shadows). */
      lightsShadowColor: '#080808',
      /** How strongly the shadow tint is applied (0 = none, 1 = full). */
      lightsShadowOpacity: 0.25,
      /** Directional-light shadow bias; lower (more negative) tightens cast-shadow contact. */
      lightsShadowContactOffset: -0.0005,
      /** Shadow-map normal offset — cast shadows only (not direct side shading). */
      lightsShadowNormalBias: 0.01,
      /** Cast shadows from both sides (useful for thin single-surface meshes). */
      lightsShadowTwoSided: false,
      /** Key-light gobo projection — patterned shadow/light mask from the directional key. */
      gobo: {
        enabled: false,
        panelOpen: false,
        texture: 'palm',
        /** Gobo mask blur — independent from cast-shadow softness. */
        softness: DEFAULT_GOBO_SOFTNESS,
        /** Pattern size — UI 0–10 (higher = smaller pattern; 5 ≈ former 0.50). */
        scale: GOBO_UI_DEFAULT,
        scaleSpace: 'ui',
        /** Rotate projected pattern around its center, degrees. */
        rotation: 0,
      },
      lensFlare: {
        enabled: false,
        rotation: 0,
        height: 15,
        color: '#d28756',
        quality: 'high',
        haloIntensity: 1.0,
        streakLength: 5.0,
        sunDiscScale: 1.5,
        sunDiscBlur: 1.25,
        sunDiscColor: '#fff0c8',
        discGlowIntensity: 0,
        discGlowSize: 5,
        discGlowColor: '#ff8844',
        /** Procedural streak spin (iTime) — only while camera auto-orbit is active. */
        spinDuringOrbit: false,
        /** When true, key-light rotate/height follow lens-flare rotation/height. */
        keyLightConnected: false,
        /** Pre-connect key-light pose; set when connecting, cleared on disconnect. */
        keyLightRestore: null,
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
      /** pmndrs GodRays — sun direction follows lens flare (rotation/height). */
      godRays: {
        enabled: false,
        color: '#ffe8c4',
        lightScale: 0.4,
        opacity: 1,
        density: 0.96,
        decay: 0.92,
        weight: 0.4,
        exposure: 0.6,
        clampMax: 1,
        blur: true,
        quality: 'medium',
      },
      dof: {
        ...defaultDof,
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
        /** Multiplies lens dirt texture; #ffffff keeps the texture’s original colour. */
        tintColor: '#ffffff',
      },
      grain: { enabled: false, intensity: 0.03, color: '#ffffff' },
      aberration: { ...defaultAberration },
      /** Screen-space AO (N8AO); off by default — GPU-heavy when enabled. */
      ambientOcclusion: {
        enabled: false,
        intensity: 3,
        radius: 1,
        quality: 'medium',
        color: '#080808',
      },
      /** Wide-angle lens distortion (de Carpentier); post-process after full grading stack. */
      fisheye: {
        enabled: false,
        horizontalFOVDeg: 131,
        strength: 0.37,
        cylindricalRatio: 4,
      },
      camera: {
        fov: 45,
        /** Active focal-length preset (mm), or null when FOV was adjusted manually. */
        lensFocalMm: null,
        lensSensorId: 'aps-c',
        tilt: 0,
        /** World-space camera position (OrbitControls). Distance is camera ↔ target length. */
        worldPosition: { ...DEFAULT_CAMERA_POSITION },
        distance: defaultCameraDistance(),
        /** Active view preset button, or null after manual orbit. */
        viewPreset: null,
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
        vignetteColor: '#080808',
        /** RTS / isometric framing — optional; does not override lens FOV until used. */
        isometric: {
          enabled: false,
          presetId: 'true-isometric',
          horizontalDeg: 45,
          verticalDeg: (Math.atan(1 / Math.sqrt(2)) * 180) / Math.PI,
          panUnlocked: false,
        },
        /** Optional manual near/far override (telephoto / isometric). Off = DEFAULT_CAMERA_* . */
        clipPlanes: {
          manual: false,
          near: 0.1,
          far: 100,
        },
      },
      exposure: 1.0,
      /** Off by default; enable to adapt exposure to scene brightness automatically. */
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
      background: APP_BACKGROUND,
      /** Flat color backdrop when Render Backdrop is off (mutually exclusive with gradient / image). */
      backgroundSolidEnabled: true,
      backgroundGradient: {
        enabled: false,
        type: 'linear',
        angle: 180,
        centerX: 50,
        centerY: 50,
        stops: [
          { color: APP_BACKGROUND, position: 0 },
          { color: ORBY_LIME, position: 100 },
        ],
      },
      backgroundImage: {
        enabled: false,
        fit: 'cover',
        asset: null,
      },
      lookFilterPreset: 'none',
      lookFilterPresetsOpen: false,
      /** Object tab — fold-out for Shader Lab (stylized materials). */
      creativeLookSectionOpen: false,
      /** 'low' | 'medium' | 'high' — color SVG (ImageTracer) trace fidelity */
      svgColorDetail: 'high',
      /**
       * ColorChecker Classic (24 swatches) — reference sRGB from Wikipedia / manufacturer data.
       * Default placement (distance / rotate / height / scale) is a tuned “spawn” preset; `enabled` stays
       * false until the user shows the chart. Scale matches ~356 mm card on import-normalized (~2 m) assets.
       */
      colorChecker: {
        enabled: false,
        distance: 2,
        /** Orbit azimuth in degrees (added to global Lights → Rotate). */
        rotate: 333,
        /** Vertical offset from orbit target (scene units), like Key → Height. */
        height: -0.5,
        /** Uniform scale of the chart group (1× ≈ built-in mesh width; default ≈ physical card on normalized imports). */
        scale: COLOR_CHECKER_DEFAULT_SCALE,
        /** Shortcut to Object → Display → Unlit (textures); restores prior display mode when turned off. */
        rawColors: false,
      },
    };
    this.state = deepClone(this.defaults);
    this.subscribers = new Set();
    /** When > 0, `set` / `setTopLevelBundle` / `reset` defer `notify` until outermost batch ends. */
    this._batchDepth = 0;
    /** When > 0, slider/color scrubbing — state updates apply but UI sync waits until release. */
    this._deferNotifyDepth = 0;
  }

  getState() {
    return deepClone(this.state);
  }

  /**
   * Live state for hot paths (render loop). Read-only — do not mutate.
   * Avoids cloning embedded assets every frame.
   */
  peekState() {
    return this.state;
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
    if (this._batchDepth === 0 && this._deferNotifyDepth === 0) {
      this.notify();
    }
  }

  /** Coalesce notify while scrubbing a range slider or color chip (pointer held). */
  beginDeferredNotify() {
    this._deferNotifyDepth += 1;
  }

  endDeferredNotify() {
    if (this._deferNotifyDepth > 0) {
      this._deferNotifyDepth -= 1;
    }
    this._notifyIfIdle();
  }

  /** True while a range slider or color chip is held (notify coalesced). */
  isNotifyDeferred() {
    return this._deferNotifyDepth > 0;
  }

  /**
   * Recover when a deferred-notify scope is orphaned (tab switch mid-scrub, lost pointerup).
   * Resets depth to zero and runs one notify so applyBlockStates / syncControls catch up.
   */
  flushDeferredNotify() {
    if (this._deferNotifyDepth <= 0) return;
    this._deferNotifyDepth = 0;
    this._notifyIfIdle();
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
      if (this._batchDepth < 0) {
        this._batchDepth = 0;
      }
      this._notifyIfIdle();
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
    migrateLegacyGroundKeys(partial);
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

