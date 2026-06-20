export const FISHEYE_PNG_EXPORT_ALERT_TITLE = 'Fisheye lens — transparent PNG export';

export const FISHEYE_TRANSPARENT_PNG_EXPORT_ALERT_BODY =
  'Fisheye looks fine in the viewport, but transparent PNG export is not supported yet while this effect is on. ' +
  'Alpha readback can show missing geometry, black patches, or a broken frame.\n\n' +
  'Turn off Fisheye Lens or export without transparency (opaque PNG / MP4 still include fisheye). ' +
  'A proper transparent fisheye PNG path is in progress.';

/** @deprecated use FISHEYE_TRANSPARENT_PNG_EXPORT_ALERT_BODY */
export const FISHEYE_PNG_EXPORT_ALERT_BODY = FISHEYE_TRANSPARENT_PNG_EXPORT_ALERT_BODY;

/**
 * @param {{ getState: () => object }} stateStore
 */
export function isFisheyeEnabledInState(stateStore) {
  return !!stateStore?.getState()?.fisheye?.enabled;
}

/**
 * Block PNG export only when alpha readback + fisheye is unsafe (opaque PNG is OK).
 * @param {{ getState: () => object }} stateStore
 * @param {{ transparent?: boolean }} [options]
 */
export function shouldBlockFisheyePngExport(stateStore, { transparent = false } = {}) {
  return !!transparent && isFisheyeEnabledInState(stateStore);
}

/**
 * @param {{ showMessageAlert?: (body: string, title: string, options?: object) => void }} ui
 */
export function showFisheyeTransparentPngExportBlockedAlert(ui) {
  ui?.showMessageAlert?.(
    FISHEYE_TRANSPARENT_PNG_EXPORT_ALERT_BODY,
    FISHEYE_PNG_EXPORT_ALERT_TITLE,
    { modalTone: 'caution' },
  );
}

/** @deprecated use showFisheyeTransparentPngExportBlockedAlert */
export function showFisheyePngExportBlockedAlert(ui) {
  showFisheyeTransparentPngExportBlockedAlert(ui);
}
