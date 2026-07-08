/**
 * Bundled low-poly shapes for Object → Shape Library.
 */
export const SHAPE_LIBRARY_PANEL_WIDTH_PX = 760;

/** @typedef {{ id: string, glbUrl: string, sourceId: string, label: string, empty?: boolean }} ShapeLibraryEntry */

const SHAPE_LIBRARY_ASSET_VERSION = 8;
const SHAPE_LIBRARY_THUMB_VERSION = 6;

const shapeLibraryGlbUrl = (file) =>
  `./assets/3D-assets/shape-library/${file}?v=${SHAPE_LIBRARY_ASSET_VERSION}`;

/** @param {string} shapeId */
export function shapeLibraryThumbUrl(shapeId) {
  return `./assets/images/shape-library-${shapeId}.png?v=${SHAPE_LIBRARY_THUMB_VERSION}`;
}

/** Neutral orientation for library thumbs + viewport insert (radians). */
export const SHAPE_LIBRARY_PRESENTATION_TILT_RAD = Object.freeze({
  x: 0,
  y: 0,
  z: 0,
});

/** @param {import('three').Object3D | null | undefined} object3D */
export function applyShapeLibraryPresentationTilt(object3D) {
  if (!object3D) return;
  object3D.rotation.set(
    SHAPE_LIBRARY_PRESENTATION_TILT_RAD.x,
    SHAPE_LIBRARY_PRESENTATION_TILT_RAD.y,
    SHAPE_LIBRARY_PRESENTATION_TILT_RAD.z,
  );
}

/** @type {readonly Omit<ShapeLibraryEntry, 'id' | 'empty'>[]} */
const SHAPE_LIBRARY_PROTOTYPES = [
  {
    sourceId: 'cube',
    glbUrl: shapeLibraryGlbUrl('cube.glb'),
    label: 'Cube',
  },
  {
    sourceId: 'cone',
    glbUrl: shapeLibraryGlbUrl('cone.glb'),
    label: 'Cone',
  },
  {
    sourceId: 'pipe',
    glbUrl: shapeLibraryGlbUrl('pipe.glb'),
    label: 'Pipe',
  },
];

export const SHAPE_LIBRARY_SLOT_COUNT = 16;

/** @type {ShapeLibraryEntry[]} */
export const SHAPE_LIBRARY = Array.from({ length: SHAPE_LIBRARY_SLOT_COUNT }, (_, slot) => {
  const proto = SHAPE_LIBRARY_PROTOTYPES[slot];
  if (!proto) {
    return {
      id: `empty-${slot + 1}`,
      glbUrl: '',
      sourceId: '',
      label: '',
      empty: true,
    };
  }
  return {
    id: proto.sourceId,
    glbUrl: proto.glbUrl,
    sourceId: proto.sourceId,
    label: proto.label,
    empty: false,
  };
});

/** Shape ids with bundled GLBs — used by the dev thumbnail bake loop. */
export const SHAPE_LIBRARY_BAKEABLE_IDS = SHAPE_LIBRARY_PROTOTYPES.map((entry) => entry.sourceId);

export const SHAPE_LIBRARY_DRAG_MIME = 'application/x-orby-shape-id';

/**
 * @param {string} id
 * @returns {ShapeLibraryEntry | undefined}
 */
export function findShapeLibraryEntry(id) {
  return SHAPE_LIBRARY.find((entry) => entry.id === id);
}

/**
 * @param {string} id
 * @returns {ShapeLibraryEntry | undefined}
 */
export function findBakeableShapeLibraryEntry(id) {
  const entry = findShapeLibraryEntry(id);
  if (!entry || entry.empty || !entry.glbUrl) return undefined;
  return entry;
}
