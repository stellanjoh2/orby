/**
 * Bundled low-poly shapes for Object → Shape Library.
 * GLBs are Orby-original placeholders; swap URLs when hosting optimized assets.
 */
export const SHAPE_LIBRARY_PANEL_WIDTH_PX = 760;

/** @typedef {{ id: string, glbUrl: string, sourceId: string, label: string }} ShapeLibraryEntry */

const SHAPE_LIBRARY_ASSET_VERSION = 3;
const shapeLibraryGlbUrl = (file) =>
  `./assets/3D-assets/shape-library/${file}?v=${SHAPE_LIBRARY_ASSET_VERSION}`;

/** @type {readonly ShapeLibraryEntry[]} */
const SHAPE_LIBRARY_PROTOTYPES = [
  {
    sourceId: 'box',
    glbUrl: shapeLibraryGlbUrl('box.glb'),
    label: 'Box',
  },
  {
    sourceId: 'pyramid',
    glbUrl: shapeLibraryGlbUrl('pyramid.glb'),
    label: 'Pyramid',
  },
  {
    sourceId: 'torus',
    glbUrl: shapeLibraryGlbUrl('torus.glb'),
    label: 'Torus',
  },
  {
    sourceId: 'escher',
    glbUrl: shapeLibraryGlbUrl('escher.glb'),
    label: 'Escher solid',
  },
];

const SHAPE_LIBRARY_SLOT_COUNT = 16;

/** @type {ShapeLibraryEntry[]} */
export const SHAPE_LIBRARY = Array.from({ length: SHAPE_LIBRARY_SLOT_COUNT }, (_, slot) => {
  const proto = SHAPE_LIBRARY_PROTOTYPES[slot % SHAPE_LIBRARY_PROTOTYPES.length];
  const copy = Math.floor(slot / SHAPE_LIBRARY_PROTOTYPES.length) + 1;
  return {
    id: copy === 1 ? proto.sourceId : `${proto.sourceId}-${copy}`,
    glbUrl: proto.glbUrl,
    sourceId: proto.sourceId,
    label: proto.label,
  };
});

export const SHAPE_LIBRARY_DRAG_MIME = 'application/x-orby-shape-id';

/**
 * @param {string} id
 * @returns {ShapeLibraryEntry | undefined}
 */
export function findShapeLibraryEntry(id) {
  return SHAPE_LIBRARY.find((entry) => entry.id === id);
}
