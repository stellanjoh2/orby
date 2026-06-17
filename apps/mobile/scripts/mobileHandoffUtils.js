/** True when landing redirected here with `?handoff=1`. */
export function urlHasHandoffFlag() {
  try {
    return new URLSearchParams(window.location.search).get('handoff') === '1';
  } catch {
    return false;
  }
}
