/** Mesh transform, display mode, turntable, and transform gizmo defaults. */
export function createMeshDefaults() {
  return {
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
    /** Hide the loaded mesh from viewport and exports (background-only renders). */
    objectHidden: false,
  };
}
