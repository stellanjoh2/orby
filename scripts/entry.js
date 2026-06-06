import { isOrbyNotFoundRoute } from './orbyRoute.js';

if (isOrbyNotFoundRoute()) {
  import('./notFoundPage.js');
} else {
  import('./main.js');
}
