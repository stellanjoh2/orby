/** @import { PresetTab } from './mobileTypes.js' */

/**
 * Shared panel dependencies from MobileShell.
 * @typedef {import('./MobileScene.js').MobileScene} MobileScene
 * @typedef {{
 *   root: HTMLElement,
 *   scene: MobileScene,
 *   selection: { light: { id: string }, style: { id: string }, filters: { id: string } },
 *   engagedPresetTabs: Set<PresetTab>,
 *   showToast: (message: string) => void,
 *   syncSelectionUi: () => void,
 *   syncPresetSheetState: () => void,
 * }} MobileUiContext
 */

export {};
