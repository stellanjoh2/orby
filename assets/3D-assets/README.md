# Bundled 3D assets

Only place **redistribution-safe** geometry here (Orby-original work, or models whose license explicitly allows shipping in a public repo).

**Do not add** Fab, Megascans, or Quixel library downloads—their terms forbid committing meshes to GitHub. Keep those files in `TEMP/` or on your machine only.

Document anything shipped in [Credits](../../credits/).

## Shape library (`shape-library/`)

Low-poly Orby-original shapes for **Object → Shape Library**. Each GLB ships **POSITION**, **NORMAL**, and **TEXCOORD_0**.

Grid thumbnails live in `assets/images/shape-library-{id}.png`.

**Recommended:** drop viewport screenshots into `assets/images/shape-library-sources/` as `cube.png`, `cone.png`, `pipe.png`, then:

```bash
npm run import:shape-library-thumbs
```

The import script center-crops to square and resizes to 128px.
