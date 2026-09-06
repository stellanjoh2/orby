import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isStudioBackdropExportBypass,
  isStudioBackdropTransitionLocked,
  setStudioBackdropExportBypass,
} from './orbyPageTransition.js';

test('setStudioBackdropExportBypass blocks transition lock during capture', () => {
  setStudioBackdropExportBypass(false);
  assert.equal(isStudioBackdropExportBypass(), false);

  setStudioBackdropExportBypass(true);
  assert.equal(isStudioBackdropExportBypass(), true);
  // Even if html transition class were present, bypass wins for export clears.
  assert.equal(isStudioBackdropTransitionLocked(), false);

  setStudioBackdropExportBypass(false);
  assert.equal(isStudioBackdropExportBypass(), false);
});
