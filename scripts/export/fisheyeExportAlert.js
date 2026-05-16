export const FISHEYE_PNG_EXPORT_ALERT_TITLE = 'Fisheye lens — PNG export';

export const FISHEYE_PNG_EXPORT_ALERT_BODY =
  'Fisheye looks fine in the viewport, but saving PNG files is not supported yet while this effect is on. ' +
  'Exports can show missing geometry, black patches, or a broken frame.\n\n' +
  'Turn off Fisheye Lens in the Render panel, export your PNG, then turn fisheye back on if you want. ' +
  'MP4 video export still works. A proper fisheye PNG path is in progress.';

/**
 * @param {{ getState: () => object }} stateStore
 */
export function isFisheyeEnabledInState(stateStore) {
  return !!stateStore?.getState()?.fisheye?.enabled;
}

/**
 * @param {{ showMessageAlert?: (body: string, title: string, options?: object) => void }} ui
 */
export function showFisheyePngExportBlockedAlert(ui) {
  ui?.showMessageAlert?.(FISHEYE_PNG_EXPORT_ALERT_BODY, FISHEYE_PNG_EXPORT_ALERT_TITLE, {
    modalTone: 'caution',
  });
}
