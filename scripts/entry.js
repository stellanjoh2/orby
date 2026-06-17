import { resolveOrbyStaticMobileRedirect, isOrbyMobileLearnRoute } from './orbyMobileAppRoute.js';
import { isOrbyNotFoundRoute } from './orbyRoute.js';

const mobileRedirect = resolveOrbyStaticMobileRedirect();
if (mobileRedirect) {
  window.location.replace(mobileRedirect);
} else if (isOrbyMobileLearnRoute()) {
  import('./mobileLearnBoot.js');
} else if (isOrbyNotFoundRoute()) {
  import('./notFoundPage.js');
} else {
  import('./main.js');
}
