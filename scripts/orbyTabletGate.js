import { isTabletDevice } from './orbyMobileLanding.js';
import { showTabletDesktopOnlyModal } from './ui/orbyTabletDesktopOnlyModal.js';

export function isTabletStudioBlocked() {
  return isTabletDevice();
}

/** @returns {boolean} True when studio access was blocked. */
export function blockTabletStudioAccess() {
  if (!isTabletStudioBlocked()) return false;
  showTabletDesktopOnlyModal();
  return true;
}
