import { MobileShell } from './MobileShell.js';
import {
  hasMobileAppSession,
  waitForMobileModelHandoff,
} from '../../../scripts/orbyMobileHandoff.js';
import { orbyMobileLandingUrl } from '../../../scripts/orbyMobileAppRoute.js';

async function boot() {
  const root = document.getElementById('orbyMobile');
  if (!root) return;

  const hasHandoff = await waitForMobileModelHandoff();
  if (!hasHandoff && !hasMobileAppSession()) {
    window.location.replace(orbyMobileLandingUrl());
    return;
  }

  new MobileShell(root);
}

void boot();
