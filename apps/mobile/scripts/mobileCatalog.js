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

const MOBILE_SHADER_PRESETS = [
  { id: 'neon-edge', label: 'Neon Edge', thumb: 'images/creative-look-neon-edge.png' },
  { id: 'flow-field', label: 'Flow Field', thumb: 'images/creative-look-flow-field.png' },
  { id: 'plasma', label: 'Plasma', thumb: 'images/creative-look-plasma.png' },
  { id: 'holographic', label: 'Holographic', thumb: 'images/creative-look-holographic.png' },
  { id: 'voronoi', label: 'Voronoi', thumb: 'images/creative-look-voronoi.png' },
  { id: 'scanline-hologram', label: 'Scanline', thumb: 'images/creative-look-scanline-hologram.png' },
  { id: 'wire-pulse', label: 'Wire Pulse', thumb: 'images/creative-look-wire-pulse.png' },
  { id: 'vertex-points', label: 'Vertex Points', thumb: 'images/creative-look-vertex-points.png' },
  { id: 'spectral-storm', label: 'Spectral Storm', thumb: 'images/creative-look-spectral-storm.png' },
  { id: 'toon', label: 'Toon', thumb: 'images/creative-look-toon.png' },
  { id: 'ega-pixel', label: 'EGA Pixel', thumb: 'images/creative-look-ega-pixel.png' },
  { id: 'c64-pixel', label: 'C64', thumb: 'images/creative-look-c64-pixel.png' },
  { id: 'gameboy-pixel', label: 'Game Boy', thumb: 'images/creative-look-gameboy-pixel.png' },
  { id: 'gba-pixel', label: 'GBA', thumb: 'images/creative-look-gba-pixel.png' },
  { id: 'nes-pixel', label: 'NES', thumb: 'images/creative-look-nes-pixel.png' },
  { id: 'megadrive-pixel', label: 'Mega Drive', thumb: 'images/creative-look-megadrive-pixel.png' },
  { id: 'dither-neutral', label: 'Neutral', thumb: 'images/creative-look-dither-neutral.png' },
  { id: 'dither-tritone', label: 'Tritone', thumb: 'images/creative-look-dither-tritone.png' },
  { id: 'dither-crosshatch', label: 'Crosshatch', thumb: 'images/creative-look-dither-crosshatch.png' },
  { id: 'dither-raster', label: 'Raster', thumb: 'images/creative-look-dither-raster.png' },
  { id: 'ps2-crush', label: 'PS2 Crush', thumb: 'images/creative-look-ps2-crush.png' },
  { id: 'psx', label: 'PSX', thumb: 'images/creative-look-psx.png' },
  { id: 'vectrex', label: 'Vectrex', thumb: 'images/creative-look-vectrex.png' },
  { id: 'watercolour', label: 'Watercolour', thumb: 'images/creative-look-watercolour.png' },
  { id: 'sketch', label: 'Sketch', thumb: 'images/creative-look-sketch.png' },
  { id: 'sketch-colour', label: 'Sketch Colour', thumb: 'images/creative-look-sketch-colour.png' },
  { id: 'ascii-art', label: 'ASCII', thumb: 'images/creative-look-ascii-art.png' },
  { id: 'chrome', label: 'Chrome', thumb: 'images/creative-look-chrome.png' },
  { id: 'glass', label: 'Glass', thumb: 'images/creative-look-glass.png' },
];

/** Shader dock rail — None first (import PBR), then stylized presets. */
export const MOBILE_STYLE_RAIL = [MOBILE_STYLE_NONE, ...MOBILE_SHADER_PRESETS];

/** @type {{ id: string, label: string, items: typeof MOBILE_SHADER_PRESETS }[]} */
export const MOBILE_CREATIVE_LOOK_SECTIONS = [
  {
    id: 'effects',
    label: 'Effects',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['neon-edge', 'flow-field', 'plasma', 'holographic', 'voronoi', 'scanline-hologram', 'wire-pulse', 'vertex-points', 'spectral-storm', 'toon'].includes(x.id),
    ),
  },
  {
    id: 'pixels',
    label: 'Screen pixels',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['ega-pixel', 'c64-pixel', 'gameboy-pixel', 'gba-pixel', 'nes-pixel', 'megadrive-pixel'].includes(x.id),
    ),
  },
  {
    id: 'dither',
    label: 'Dither',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['dither-neutral', 'dither-tritone', 'dither-crosshatch', 'dither-raster'].includes(x.id),
    ),
  },
  {
    id: 'retro',
    label: 'Retro 3D',
    items: MOBILE_SHADER_PRESETS.filter((x) => ['ps2-crush', 'psx', 'vectrex'].includes(x.id)),
  },
  {
    id: 'artistic',
    label: 'Artistic',
    items: MOBILE_SHADER_PRESETS.filter((x) =>
      ['watercolour', 'sketch', 'sketch-colour', 'ascii-art'].includes(x.id),
    ),
  },
  {
    id: 'materials',
    label: 'Materials',
    items: MOBILE_SHADER_PRESETS.filter((x) => ['chrome', 'glass'].includes(x.id)),
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
