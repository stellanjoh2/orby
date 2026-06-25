import { createAnimationDefaults } from './animationDefaults.js';
import { createCameraDefaults } from './cameraDefaults.js';
import { createImportDefaults } from './importDefaults.js';
import { createLightsDefaults } from './lightsDefaults.js';
import { createMaterialDefaults } from './materialDefaults.js';
import { createMeshDefaults } from './meshDefaults.js';
import { createRenderDefaults } from './renderDefaults.js';
import { createStudioDefaults } from './studioDefaults.js';

export { createAnimationDefaults } from './animationDefaults.js';
export { createCameraDefaults } from './cameraDefaults.js';
export { createImportDefaults } from './importDefaults.js';
export { createLightsDefaults } from './lightsDefaults.js';
export { createMaterialDefaults } from './materialDefaults.js';
export { createMeshDefaults } from './meshDefaults.js';
export { createRenderDefaults } from './renderDefaults.js';
export { createStudioDefaults } from './studioDefaults.js';

/** Compose the full default studio state from domain slices. */
export function createDefaultState() {
  return {
    ...createMeshDefaults(),
    ...createMaterialDefaults(),
    ...createImportDefaults(),
    ...createStudioDefaults(),
    ...createLightsDefaults(),
    ...createRenderDefaults(),
    ...createCameraDefaults(),
    ...createAnimationDefaults(),
  };
}
