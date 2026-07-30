import {
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
} from '../camera/cameraDefaults.js';
import { SCENE_SETTINGS_SCHEMA_VERSION } from '../constants.js';
import { deepClone } from '../utils/deepClone.js';
import { createDefaultState } from './defaults/index.js';

/**
 * "Blank canvas" preset — homepage / Reset Scene snapshot.
 *
 * Same as a default studio load, except:
 * - HDRI panorama hidden (`hdriBackground: false`) → solid backdrop
 * - ground grid on (`groundWire: true`)
 *
 * Built from {@link createDefaultState} so material / bloom / camera grading
 * cannot drift from live defaults. Includes {@link SCENE_SETTINGS_SCHEMA_VERSION}
 * so {@link SceneSettingsManager#loadFromText} does not run legacy migrations.
 *
 * @returns {object}
 */
export function createBlankCanvasPreset() {
  const state = deepClone(createDefaultState());
  state.schemaVersion = SCENE_SETTINGS_SCHEMA_VERSION;
  state.hdriBackground = false;
  state.groundWire = true;
  // loadFromText restores orbit pose only when position/target are present
  state.camera = {
    ...state.camera,
    position: { ...DEFAULT_CAMERA_POSITION },
    target: { ...DEFAULT_CAMERA_TARGET },
  };
  return state;
}
