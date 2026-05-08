const isHomePath = (() => {
  const path = window.location.pathname || '/';
  return path === '/' || path === '/index.html';
})();

const forceNotFoundDebug = (() => {
  const params = new URLSearchParams(window.location.search);
  return params.get('orby404Debug') === '1';
})();

if (isHomePath && !forceNotFoundDebug) {
  import('./main.js');
} else {
  import('./notFoundPage.js');
}
