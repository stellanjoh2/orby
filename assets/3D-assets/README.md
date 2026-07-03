# Bundled 3D assets

Only place **redistribution-safe** geometry here (Orby-original work, or models whose license explicitly allows shipping in a public repo).

**Do not add** Fab, Megascans, or Quixel library downloads—their terms forbid committing meshes to GitHub. Keep those files in `TEMP/` or on your machine only.

Document anything shipped in [Credits](../../credits/).

## Shape library (`shape-library/`)

Low-poly Orby-original placeholders for **Object → Shape Library**. Each GLB ships **POSITION**, **NORMAL**, and **TEXCOORD_0**. Regenerate with:

```bash
node scripts/shapeLibrary/generatePlaceholderAssets.mjs
```
