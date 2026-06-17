/** Mobile-only catalog — paths under repo `assets/`. */

export const MOBILE_HDRI = [
  { id: 'beach', label: 'Beach', thumb: 'images/hdri-thumbnail-beach.png', tint: '#5a7fb5' },
  { id: 'congress', label: 'Congress', thumb: 'images/hdri-thumbnail-congress.png', tint: '#e8e8e8' },
  { id: 'luminous-sky', label: 'Forest', thumb: 'images/hdri-thumbnail-forest.png', tint: '#3a4a2f' },
  { id: 'sunset', label: 'Sunset', thumb: 'images/hdri-thumbnail-sunset.png', tint: '#4a3a2a' },
  { id: 'meadow', label: 'Meadow', thumb: 'images/hdri-thumbnail-meadow.png', tint: '#6b7a4a' },
  { id: 'abandoned', label: 'Abandoned', thumb: 'images/hdri-thumbnail-abandoned.png', tint: '#4a4540' },
  { id: 'blue-hour', label: 'Blue hour', thumb: 'images/hdri-thumbnail-blue-hour.png', tint: '#2a3a5a' },
  { id: 'sunny-parking', label: 'Parking', thumb: 'images/hdri-thumbnail-sunny-parking.png', tint: '#8a9098' },
];

/**
 * Shader Lab creative looks — ids match desktop `data-creative-look` / MaterialController presets.
 * @type {{ id: string, label: string, thumb: string }[]}
 */
/** Pinned reset — restores import PBR materials. */
export const MOBILE_STYLE_NONE = {
  id: 'none',
  label: 'None',
  thumb: 'images/look-filters/none.png',
};

/** Desktop Shader Lab presets not shipped on mobile (see MOBILE_SHADER_PRESETS_CUT). */
export const MOBILE_SHADER_PRESETS_CUT = [
  { id: 'flow-field', label: 'Flow Field' },
  { id: 'voronoi', label: 'Voronoi' },
  { id: 'wire-pulse', label: 'Wire Pulse' },
  { id: 'vertex-points', label: 'Vertex Points' },
  { id: 'spectral-storm', label: 'Spectral Storm' },
  { id: 'dither-crosshatch', label: 'Crosshatch' },
  { id: 'dither-raster', label: 'Raster' },
  { id: 'ps2-crush', label: 'PS2 Crush' },
  { id: 'psx', label: 'PSX' },
  { id: 'vectrex', label: 'Vectrex' },
  { id: 'ascii-art', label: 'ASCII' },
  { id: 'glass', label: 'Glass' },
  { id: 'c64-pixel', label: 'C64' },
  { id: 'gameboy-pixel', label: 'Game Boy' },
  { id: 'nes-pixel', label: 'NES' },
];

const MOBILE_SHADER_PRESETS = [
  { id: 'neon-edge', label: 'Neon Edge', thumb: 'images/creative-look-neon-edge.png' },
  { id: 'holographic', label: 'Holographic', thumb: 'images/creative-look-holographic.png' },
  { id: 'plasma', label: 'Plasma', thumb: 'images/creative-look-plasma.png' },
  { id: 'scanline-hologram', label: 'Scanline', thumb: 'images/creative-look-scanline-hologram.png' },
  { id: 'toon', label: 'Toon', thumb: 'images/creative-look-toon.png' },
  { id: 'ega-pixel', label: 'EGA Pixel', thumb: 'images/creative-look-ega-pixel.png' },
  { id: 'gba-pixel', label: 'GBA', thumb: 'images/creative-look-gba-pixel.png' },
  { id: 'megadrive-pixel', label: 'Mega Drive', thumb: 'images/creative-look-megadrive-pixel.png' },
  { id: 'dither-neutral', label: 'Neutral', thumb: 'images/creative-look-dither-neutral.png' },
  { id: 'dither-tritone', label: 'Tritone', thumb: 'images/creative-look-dither-tritone.png' },
  { id: 'watercolour', label: 'Watercolour', thumb: 'images/creative-look-watercolour.png' },
  { id: 'sketch', label: 'Sketch', thumb: 'images/creative-look-sketch.png' },
  { id: 'sketch-colour', label: 'Sketch Colour', thumb: 'images/creative-look-sketch-colour.png' },
  { id: 'chrome', label: 'Chrome', thumb: 'images/creative-look-chrome.png' },
];

/** Shader dock rail — None first (import PBR), then stylized presets. */
export const MOBILE_STYLE_RAIL = [MOBILE_STYLE_NONE, ...MOBILE_SHADER_PRESETS];

/** @type {{ id: string, label: string, items: typeof MOBILE_SHADER_PRESETS }[]} */
export const MOBILE_CREATIVE_LOOK_SECTIONS = [
  {
    id: 'effects',
    label: 'Effects',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['neon-edge', 'holographic', 'plasma', 'scanline-hologram', 'toon'].includes(x.id),
    ),
  },
  {
    id: 'pixels',
    label: 'Screen pixels',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['ega-pixel', 'gba-pixel', 'megadrive-pixel'].includes(x.id),
    ),
  },
  {
    id: 'dither',
    label: 'Dither',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['dither-neutral', 'dither-tritone'].includes(x.id),
    ),
  },
  {
    id: 'artistic',
    label: 'Artistic',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['watercolour', 'sketch', 'sketch-colour'].includes(x.id),
    ),
  },
  {
    id: 'materials',
    label: 'Materials',
    items: MOBILE_SHADER_PRESETS.filter((x) => ['chrome'].includes(x.id)),
  },
];

/** Flat list for selection lookup (includes None). */
export const MOBILE_CREATIVE_LOOKS = MOBILE_STYLE_RAIL;

export const MOBILE_FX = [
  { id: 'none', label: 'None', thumb: 'images/look-filters/none.png' },
  { id: 'studio', label: 'Studio', thumb: 'images/look-filters/studio.png' },
  { id: 'noir', label: 'Noir', thumb: 'images/look-filters/noir.png' },
  { id: 'mood', label: 'Mood', thumb: 'images/look-filters/mood.png' },
  { id: 'vintage', label: 'Vintage', thumb: 'images/look-filters/vintage.png' },
  { id: 'cinema', label: 'Cinema', thumb: 'images/look-filters/cinema.png' },
  { id: 'frost', label: 'Frost', thumb: 'images/look-filters/frost.png' },
  { id: 'golden', label: 'Golden', thumb: 'images/look-filters/golden.png' },
  { id: 'dream', label: 'Dream', thumb: 'images/look-filters/dream.png' },
  { id: 'neon', label: 'Neon', thumb: 'images/look-filters/neon.png' },
];

/** @param {string} relPath under assets/ */
export function mobileAssetUrl(relPath) {
  const base =
    document.querySelector('meta[name="orby-mobile-asset-base"]')?.getAttribute('content') ??
    '/assets/';
  const normalized = relPath.replace(/^\.\//, '').replace(/^assets\//, '');
  return `${base}${normalized}`;
}

/** @param {string} id */
export function findCreativeLook(id) {
  if (id === 'standard') return MOBILE_STYLE_NONE;
  return MOBILE_CREATIVE_LOOKS.find((x) => x.id === id) ?? MOBILE_STYLE_NONE;
}
