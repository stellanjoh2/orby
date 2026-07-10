import { STUDIO_IMPORT_TARGET_MAX_DIMENSION } from '../constants.js';

/**
 * Bundled low-poly shapes for Object → Shape Library.
 */
export const SHAPE_LIBRARY_PANEL_WIDTH_PX = 760;

/** Shape-library spawn is 25% smaller than generic file imports. */
export const SHAPE_LIBRARY_SPAWN_SCALE = 0.75;

/** Max world AABB dimension after import normalization on insert (1.5 studio units). */
export const SHAPE_LIBRARY_TARGET_MAX_DIMENSION =
  STUDIO_IMPORT_TARGET_MAX_DIMENSION * SHAPE_LIBRARY_SPAWN_SCALE;

/** Object → Material defaults when inserting a shape-library GLB (absolute sliders, not import multipliers). */
export const SHAPE_LIBRARY_DEFAULT_METALNESS = 1;
export const SHAPE_LIBRARY_DEFAULT_ROUGHNESS = 0.2;
/** Bundled GLB base color — used when colour override is enabled. */
export const SHAPE_LIBRARY_DEFAULT_COLOR = '#ffffff';
/** Shape-library inserts use baked GLB albedo until the user enables colour override. */
export const SHAPE_LIBRARY_DEFAULT_COLOR_OVERRIDE = false;

/** @typedef {{ id: string, glbUrl: string, sourceId: string, label: string, empty?: boolean }} ShapeLibraryEntry */

const SHAPE_LIBRARY_ASSET_VERSION = 15;
const SHAPE_LIBRARY_THUMB_VERSION = 9;

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

/** @param {import('three').Object3D | null | undefined} model */
export function isShapeLibraryModel(model) {
  return !!model?.userData?.orbyShapeLibrary;
}
