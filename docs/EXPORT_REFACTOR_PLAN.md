# Export refactor plan

**Status:** Planned — work in chunks; do not big-bang.  
**Related:** `POST_PROCESSING_EXPORT_ANALYSIS.md` (older post-processing notes), `scripts/render/ImageExporter.js` (~3k lines), `ComposerLifecycle.renderComposerPassForExport`.

## Problem

Viewport and export share one WebGL renderer, composer, and scene state. Export temporarily resizes the framebuffer, renders offline, readbacks pixels, then restores. As features accumulate (creative looks, gradient bg, HDRI live rotation, video movements, transparent crop, lens distortion), capture paths drift from the live loop.

**Common symptoms**

| Symptom | Likely cause |
|---------|----------------|
| Visuals scaled up | Composer buffer ≠ export size → silent `_resampleRgba` stretch |
| Gradient bg covers ~¼ of frame | Partial GL viewport after post passes; background drawn before full viewport repair |
| HDRI rotated in file, fine in viewport | Dual rotation models (baked PMREM vs `setRotationLive`); export-only HDRI spin toggles |
| “Random” after export | Failed or partial restore of renderer/camera/composer state |

**Preview ≠ capture:** `ExportMovementPreview` drives the live viewport; PNG/video encode uses offline capture (`renderComposerPassForExport` + readback). Preview looking correct does not guarantee the file.

---

## North star

One canonical raster capture path:

```
Export UI / VideoExporter / Mobile / dev bake
  → OfflineCaptureSession (save · resize · restore · suppress resize)
  → renderFrameForCapture (single GL sequence)
  → captureReadback (strict size match)
  → encode / crop / download
```

**Non-goals:** SVG silhouette/color/screen-pixel export and GLB export — separate geometry pipelines.

**Principles**

1. One render path for raster capture; viewport loop stays for interaction only.
2. Size mismatch is a bug — no silent resample in strict mode.
3. All GL/scene mutations during export go through session with guaranteed `finally` restore.
4. Features implement `prepareForCapture(ctx)` — not special cases in `ImageExporter`.
5. Do not merge live + export composer prep until regression tests exist.
6. Font extrude ≠ SVG extrude — capture hooks must not cross those pipelines.

---

## Risk to main studio experience

| Work | Live viewport risk |
|------|-------------------|
| 1-day export-scoped patches (logging, no resample, gradient/HDRI on capture only) | **Low** |
| `OfflineCaptureSession` + better restore | **Low**; may fix post-export glitches |
| Unifying `renderComposerPass` and `renderComposerPassForExport` | **Medium — highest regression risk** |
| Offscreen / second renderer for capture | **Lowest** for live; best long-term isolation |

**Rule:** Touch export entry/exit and readback first; do not change `ComposerLifecycle.renderComposerPass()` until tests catch regressions.

---

## Chunk 0 — Safety net (~2–4 days)

**Goal:** Know what’s broken; stop flying blind.

- [ ] Add `docs/export-parity-matrix.md` — features × export modes (opaque PNG, transparent PNG, video frame); mark verified / broken / unknown / export-only.
- [ ] Dev-only capture debug log per export: `{ requestedW, requestedH, drawingBufferW, composerRTW, viewportLogical }`.
- [ ] Manual smoke checklist (5 min after any export PR): load mesh → orbit → bloom → export PNG → viewport still correct.
- [ ] (Optional) Playwright golden captures for 3 fixtures: opaque PNG, gradient bg, transparent PNG — defer if setup cost > 1 day.

**Exit:** Matrix exists; size tuple logged on every capture.

---

## Chunk 1 — Session + canonical render (~1 week)

**Goal:** One front door for raster render; behavior matches today.

New modules (target):

```
scripts/render/capture/
  OfflineCaptureSession.js
  renderFrameForCapture.js
  CaptureSizePolicy.js
  captureContext.js
```

- [ ] `OfflineCaptureSession`: snapshot renderer, camera, composer, clear alpha, scene bg, HDRI flags; set `SceneManager._suppressResizeForExport`; restore in `finally`.
- [ ] `renderFrameForCapture`: consolidate order from `ComposerLifecycle._runComposerWithCreativeLookPrep` — buffer match, viewport reset, gradient sync, clear, composer render, overlays, final viewport reset.
- [ ] Route `ImageExporter.exportImage` through session first (feature flag `USE_CAPTURE_SESSION` until stable).
- [ ] Point `VideoExporter._renderComposerFrameForCapture` and `bakeCreativeLookThumbnails` at same entry.

**Exit:** Opaque PNG uses session; viewport restores after 50 consecutive exports.

**Do not:** Merge live `renderComposerPass()` with export prep in this chunk.

---

## Chunk 2 — Strict size contract (~2–3 days)

**Goal:** Eliminate “scaled up” silent stretch.

- [ ] `captureReadback.js`: read at exact `ctx.width × ctx.height`.
- [ ] On mismatch: retry sync once (`ensureComposerMatchesDrawingBuffer({ strict: true })` + re-render); then throw `CaptureSizeMismatchError` with debug tuple.
- [ ] Remove default silent `_resampleRgba`; legacy fallback behind `allowResample: true` until matrix is green.
- [ ] Toast when GPU clamp reduces requested export size (not only `console.warn`).

**Exit:** Zero silent resamples in strict mode; golden/manual passes for Ultra DPR + 2× PNG + gradient.

---

## Chunk 3 — Feature capture hooks (~1 week)

**Goal:** Fix gradient quarter-frame and HDRI surprises; stop ImageExporter knowing feature internals.

Hook interface:

```
prepareForCapture(ctx)
validateCapture(ctx)?     // optional
restoreAfterCapture(ctx)  // if ephemeral state changed
```

Priority:

| P | Module |
|---|--------|
| P0 | `BackgroundGradientController` |
| P0 | `EnvironmentController` — pick one HDRI rotation model for export (recommend: always `setRotationLive` baseline; no PMREM pre-rotation + live euler combined) |
| P1 | Creative look passes (ASCII pin, gouache/watercolour/sketch) |
| P1 | Lens distortion export pin |
| P2 | BackgroundController / transparent edges |

**Product decision (once):** Pixel-art / ASCII on 2× export — keep viewport grid density (matches screen, looks “zoomed”) **or** scale grid with export (sharper, differs from viewport). Document in export UI.

**Exit:** ImageExporter has no direct gradient sync or per-preset ASCII pin lists; HDRI frame 0 matches static viewport at same angle.

---

## Chunk 4 — Isolate capture from live renderer (optional, ~2–4 weeks)

**4A — Freeze viewport (smaller change)**

- [ ] Pause rAF during export; no interleaved live frames.
- [ ] Still resize backing store in place.

**4B — Offscreen renderer (recommended long-term)**

- [ ] Lazy second `WebGLRenderer`; share scene/camera; live canvas never resized for export.

Ship 4A first if needed; 4B when matrix is mostly green.

**Exit:** Export never leaves viewport corrupted (automated or manual: export → interactive frame matches pre-export).

---

## Chunk 5 — Decompose ImageExporter (~1 week)

- [ ] Split encode/download from capture (`TransparentCapture.js`, `encodeExportBlob.js`).
- [ ] Consolidate transparent paths (standard crop, artistic paper key, video transparent) onto `renderFrameForCapture`.
- [ ] Target: `ImageExporter.js` orchestration only (~400–500 lines).

---

## Chunk 6 — Video + mobile + UX (as needed)

- [ ] VideoExporter: frame scheduler + drives only; dedupe `beforeComposerRender` copy from SceneManager.
- [ ] Video frame 0 pixel-equal to still PNG at same settings (test).
- [ ] Mobile: `apps/mobile/scripts/mobileExportImage.js` → shared session (keep `MOBILE_EXPORT_MAX_PX` in size policy).
- [ ] **Capture preview frame** button — one offline frame at export resolution before long encode.
- [ ] **Pre-export summary** — list export-only transforms (HDRI spin, aspect reframe, 2× semantics).

---

## 1-day emergency sprint (if exports are on fire)

No architecture — export-scoped patches only:

1. Capture debug logging (30 min)
2. Gradient: `syncToDrawingBuffer(exportW, exportH, forceRedraw)` + full viewport reset on every capture path (1–2 hr)
3. Stop silent resample; retry once then fail (1–2 hr)
4. HDRI: normalize rotation mode at export start + restore (1 hr)
5. Manual smoke: opaque PNG, gradient, HDRI rotated, 2×, transparent, video frame 0 (1 hr)

Skips: session module, offscreen renderer, CI goldens, ImageExporter split.

---

## Key files today

| Role | Location |
|------|----------|
| Opaque / transparent PNG | `scripts/render/ImageExporter.js` |
| Video frames | `scripts/render/VideoExporter.js` |
| Shared composer export pass | `scripts/scene/ComposerLifecycle.js` → `renderComposerPassForExport` |
| Viewport repair | `scripts/render/resetRendererFullViewport.js`, `MeshglEffectComposer.js` |
| Gradient | `scripts/render/backgroundGradient/BackgroundGradientController.js` |
| HDRI rotation | `scripts/render/EnvironmentController.js` |
| Mobile export | `apps/mobile/scripts/mobileExportImage.js` |
| Export wiring | `scripts/SceneManager.js` (`setupComposer`, export handlers) |

---

## Suggested order

**Minimum (stop bleeding):** Chunk 0 → 1-day sprint items → Chunk 2 → Chunk 3 P0 only.

**Trust export again:** + Chunk 1 fully + Chunk 7 lite (capture preview frame).

**Never worry again:** + Chunk 4B + 5 + 6.

Track progress by checking boxes in this doc and linking PRs in the GitHub issue.
