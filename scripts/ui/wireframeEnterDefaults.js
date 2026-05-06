/**
 * When switching into wireframe display mode from another mode, enable "Only visible faces"
 * so back-facing lines stay hidden (standard wireframe preview).
 */
export function applyWireframeOnlyVisibleOnEnter(
  prevShading,
  nextShading,
  stateStore,
  eventBus,
  ui,
) {
  if (nextShading !== 'wireframe' || prevShading === 'wireframe') return;
  stateStore.set('wireframe.onlyVisibleFaces', true);
  eventBus.emit('mesh:wireframe-only-visible-faces', true);
  const input = ui?.inputs?.wireframeOnlyVisibleFaces;
  if (input) input.checked = true;
}
