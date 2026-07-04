import { ORBY_LIME } from '../../constants.js';
import { DEFAULT_SVG_EXTRUDE_STATE } from '../../import/extrudeDefaults.js';

/** FBX map slots, font extrude, and SVG extrude import session state. */
export function createImportDefaults() {
  return {
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
      align: 'left',
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
      /** Letter fill for 2D preview and 3D extrude front faces / bevels. */
      fillColor: '#808080',
      /** Side walls and extruded depth — dramatic two-tone when different from fillColor. */
      extrudeColor: '#808080',
      /** Total seconds until the last character finishes scale-in (0 = off). */
      revealDurationSec: 2,
      /** @type {'none' | 'scale' | 'fade' | 'slideUp' | 'slideDown' | 'drop' | 'dropSmooth' | 'pop' | 'rotate' | 'elastic'} */
      revealType: 'scale',
      /** @type {'character' | 'word'} — stagger per letter or per word */
      revealUnit: 'character',
      /** Preview playback mode: true loops continuously, false stops at end. */
      revealLoop: true,
      /** Post-generation letter-spacing settle animation (not available with circular wrap). */
      trackingAnimatorEnabled: false,
      /** Extra tracking at animation start, as percent of master letter-spacing. */
      trackingAnimatorAmountPercent: 0,
      /** Seconds to settle from widened spacing back to generated spacing. */
      trackingAnimatorTimeSec: 1.5,
      /** Easing curve for tracking expand (export movement easing id). */
      trackingAnimatorEasing: 'linear',
      /** Easing curve for reveal stagger across the full duration (export movement easing id). */
      revealStaggerEasing: 'linear',
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
      /** Live editor text (Type Creator). */
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
    shapeLibrary: {
      panelOpen: false,
    },
  };
}
