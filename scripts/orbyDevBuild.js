/**
 * Dev-only tooling flag. Production builds replace this with `false` via esbuild define
 * (see build.js) so dev imports are tree-shaken from dist/scripts/entry.js.
 */
export const ORBY_DEV_BUILD = true;
