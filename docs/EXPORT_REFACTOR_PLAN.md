# Export refactor plan

**Status:** In progress — Chunks 0–3 P0/P1 + gradient composite + dimension size probes shipped; Chunk 6 lite partial (visual WYSIWYG open).  
**Related:** `POST_PROCESSING_EXPORT_ANALYSIS.md` (older post-processing notes), `scripts/render/ImageExporter.js` (~3k lines), `ComposerLifecycle.renderComposerPassForExport`.

## Problem

Viewport and export share one WebGL renderer, composer, and scene state. Export temporarily resizes the framebuffer, renders offline, readbacks pixels, then restores. As features accumulate (creative looks, gradient bg, HDRI live rotation, video movements, transparent crop, lens distortion), capture paths drift from the live loop.

**Common symptoms**

| Symptom | Likely cause |
|---------|----------------|
| Visuals scaled up | Composer buffer ≠ export size → silent `_resampleRgba` stretch |
| Gradient bg covers ~¼ of frame | Partial GL viewport after post passes; **fixed 2026-06-27** via CPU composite (`captureGradientComposite.js`) — do not rely on `scene.background` during offline capture |
| HDRI rotated in file, fine in viewport | Dual rotation models (baked PMREM vs `setRotationLive`); export-only HDRI spin toggles |
| “Random” after export | Failed or partial restore of renderer/camera/composer state |

**Preview ≠ capture:** `ExportMovementPreview` drives the live viewport; PNG/video encode uses offline capture (`renderComposerPassForExport` + readback). Preview looking correct does not guarantee the file.

---

## Product goals

These are the outcomes this refactor is for — not “export works on my machine once.”

### Video (and stills) match the viewport ~1:1

- **WYSIWYG:** A exported video frame at time *t* should match what you would see in the studio viewport at the same moment — same framing, lighting, post stack, background, creative look, and motion state.
- **Preview = capture:** Movement preview and the final encode must use the **same** offline capture path (not live viewport drive for preview + separate readback for encode).
- **Frame 0 = still PNG:** Video frame 0 at a given resolution/settings must match an opaque PNG exported at those same settings.

### Seamless dimension switching

You should be able to change any of these **without exports breaking or silently drifting** — mid-session, between preview and encode, and when combining options:

| Dimension | Examples today |
|-----------|----------------|
| **Render quality tier** | Medium / Ultra (preview DPR, bloom scale, FXAA, shadow resolution) |
| **Export resolution** | PNG 1× / 2×; video 1080p / 1440p / 4K |
| **Aspect ratio** | Viewport shape vs video 16∶9 / 9∶16 (camera reframe) |

Tier, resolution, and aspect are **independent knobs**. Changing one must re-sync composer RTs, gradient/HDR/backdrop, post pass uniforms, and camera projection — not leave stale viewport-sized buffers or resampled stretch.

### All animation presets — asset + typography

Export must stay in sync for **every** animation path, not just turntable/orbit:

| Source | Scope |
|--------|--------|
| **Asset (mesh)** | GLTF clip playback, export mesh-animation include, creative-look time |
| **Typography (font extrude)** | Per-glyph reveal presets (`scale`, `fade`, `slideUp`, `slideDown`, `drop`, `pop`, `rotate`, `elastic`, …), character/word stagger, constant/ambient glyph motion (`FontTextConstantController`) |
| **Export movement** | Turntable, camera orbit/dolly/tilt, FOV/pitch, HDRI rotation over duration, lights auto-rotate |

Preview scrub, video encode, and “Pause all” during export must agree on animation clock and restored state after export. Font extrude animation hooks stay separate from SVG extrude logic (see workspace policy).

### Definition of done (product)

- [ ] Pick any combo: quality tier × resolution × aspect × (asset animation | typography reveal | export movement) → first and last video frames match viewport-driven expectations.
- [ ] Switch tier or resolution, export again — no quarter-frame gradient, scale-up, or HDRI surprise.
- [ ] After any export, live studio returns to the pre-export viewport unchanged.

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
2. **WYSIWYG is the default** — export-only behavior (e.g. HDRI spin over duration) must be explicit in UI; everything else matches viewport.
3. Size mismatch is a bug — no silent resample in strict mode.
4. **Dimension changes are transactional** — tier / resolution / aspect each run through one sync path before capture.
5. All GL/scene mutations during export go through session with guaranteed `finally` restore.
6. Features implement `prepareForCapture(ctx)` — not special cases in `ImageExporter`.
7. Do not merge live + export composer prep until regression tests exist.
8. Font extrude ≠ SVG extrude — capture hooks must not cross those pipelines.

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

- [x] **Local backup before refactor** — `../meshgl-backup-pre-export-refactor-2026-06-26/` (source + `.git`; excludes `node_modules/`, `dist/`). See `BACKUP_README.txt` inside. Keep `meshgl/` as the working copy.
- [x] Add `docs/export-parity-matrix.md` — features × export modes (opaque PNG, transparent PNG, video frame); mark verified / broken / unknown / export-only. **Rows must include:** each render quality tier; PNG 1×/2×; video 1080p/1440p/4K × 16∶9/9∶16; mesh GLTF animation; each font reveal type + constant motion; export movement combos.
- [x] Dev-only capture debug log per export: `{ requestedW, requestedH, drawingBufferW, composerRTW, viewportLogical }` — `logCaptureDebug()` in session + readback; enable via `LOG_CAPTURE_DEBUG = true`.
- [x] Manual smoke checklist (5 min after any export PR): load mesh → orbit → bloom → export PNG → viewport still correct — see `export-parity-matrix.md`.
- [ ] (Optional) Playwright golden captures for 3 fixtures: opaque PNG, gradient bg, transparent PNG — defer if setup cost > 1 day.
- [x] **Dimension switch size probes (2026-06-27)** — unit + Playwright + dev console; not pixel golden yet. See [export-dimension-switch-tests.md](./export-dimension-switch-tests.md).

**Exit:** Matrix exists; size tuple logged on every capture. Dimension **size contract** regressions caught by `npm run test:all`.

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

- [x] `OfflineCaptureSession`: snapshot renderer, camera, composer, clear alpha, scene bg, HDRI flags; optional `setSuppressResizeForExport`; restore in `finally`. (Animation drive snapshot deferred — VideoExporter still owns begin/end export drives.)
- [x] `CaptureSizePolicy`: single place for tier + resolution + aspect → `{ width, height, pixelRatio, cameraAspect }`.
- [x] `renderFrameForCapture`: consolidate order from `ComposerLifecycle._runComposerWithCreativeLookPrep` — buffer match, viewport reset, gradient sync, clear, composer render, overlays, final viewport reset.
- [x] Route `ImageExporter.exportImage` through session first (feature flag `USE_CAPTURE_SESSION` until stable).
- [x] Point `VideoExporter._renderComposerFrameForCapture` and `bakeCreativeLookThumbnails` at same entry.

**Exit:** Opaque PNG uses session; viewport restores after 50 consecutive exports.

**Do not:** Merge live `renderComposerPass()` with export prep in this chunk.

---

## Chunk 2 — Strict size contract (~2–3 days)

**Goal:** Eliminate “scaled up” silent stretch.

- [x] `captureReadback.js`: read at exact `ctx.width × ctx.height`.
- [x] On mismatch: retry sync once (`ensureComposerMatchesDrawingBuffer({ strict: true })` + re-render); then throw `CaptureSizeMismatchError` with debug tuple.
- [x] Remove default silent `_resampleRgba`; legacy fallback behind `allowResample: true` (`ALLOW_CAPTURE_RESAMPLE` in constants).
- [x] Toast when GPU clamp reduces requested export size (not only `console.warn`).

**Exit:** Zero silent resamples in strict mode; golden/manual passes for Ultra DPR + 2× PNG + gradient ✅ (gradient CPU composite verified 2026-06-27).

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
| P1 | Creative look passes (ASCII pin, gouache/watercolour/sketch) — ✅ `captureArtisticLookPrep.js` |
| P1 | Lens distortion export pin |
| P1 | `AnimationController` + `FontTextRevealController` + `FontTextConstantController` — export frame/time drives match preview |
| P1 | `syncPostProcessingForLogicalSize` / render quality tier — composer + bloom scale follow tier on every resize |
| P2 | BackgroundController / transparent edges |

**Product decision (once):** Pixel-art / ASCII on 2× export — keep viewport grid density (matches screen, looks “zoomed”) **or** scale grid with export (sharper, differs from viewport). Document in export UI.

**Exit:** ImageExporter has no direct gradient sync or per-preset ASCII pin lists; HDRI frame 0 matches static viewport at same angle.

**P0 shipped (2026-06-26):**

- [x] `captureFeatureHooks.js` — `CaptureFeatureSession`, `prepareCaptureFeatures` / `restoreCaptureFeatures`
- [x] `BackgroundGradientController.prepareForCapture` / `restoreAfterCapture` — sync gradient canvas at export size; CPU composite during readback (not GL `scene.background`)
- [x] `EnvironmentController.prepareForCapture` / `restoreAfterCapture` — always `setRotationLive` baseline during capture; restore baked vs live model
- [x] Wired in `renderFrameForCapture`, `OfflineCaptureSession`, `VideoExporter`, legacy/dev paths
- [x] Removed direct `gradientController.syncToDrawingBuffer` from `ImageExporter._setExportFramebufferSize`

**P0 gradient composite (2026-06-27):**

- [x] `captureGradientComposite.js` — CPU merge: composer post RGB + scene alpha pass + 2D gradient canvas at export size (same pattern as transparent export)
- [x] `BackgroundGradientController.getCaptureGradientRgba()` / `shouldBlitForCapture()` — capture session uses CPU composite, not GL `scene.background`
- [x] `MeshglEffectComposer.setExportCaptureViewportPin()` — all passes pinned to export resolution during capture
- [x] Wired in `ImageExporter`, `VideoExporter`, `MeshglRenderPass`, `ComposerLifecycle.renderComposerPassForExport`
- [x] Manual verify: gradient still PNG + video encode + capture preview at Max/Medium/Low × 1080p/4K

**P1 shipped (2026-06-26):**

- [x] `capturePostPipelinePins.js` — ASCII reference pin (viewport grid density on 2×) + lens distortion RT pin
- [x] `captureExportFrameDrives.js` — shared mesh / creative look / grain / font typography clock (`applyTimedExportFrameDrives`)
- [x] `CaptureFeatureSession` — ASCII pin lifecycle + HDRI/gradient (session begin/restore)
- [x] `renderFrameForCaptureWithPins` — lens pin via shared module (not ImageExporter-only)
- [x] Video encode + capture preview — timed frame drives deduped; lens pin on `_renderComposerFrameForCapture`
- [x] Render quality tier — composer/bloom scale follow tier on every export resize via `syncPostProcessingForLogicalSize` in `_setExportFramebufferSize` (unchanged contract, documented)
- [x] `captureArtisticLookPrep.js` — Gouache / Watercolour / Sketch per-frame uniforms on capture + live loop

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

- [x] Split encode/download from capture (`TransparentCapture.js`, `encodeExportBlob.js`).
- [x] Consolidate transparent paths — standard still + video transparent on `TransparentCapture` + session; artistic paper key stays legacy.
- [ ] Target: `ImageExporter.js` orchestration only (~400–500 lines).

**Shipped (2026-06-26):**

- [x] `TransparentCapture.js` — setup/restore, RGB+alpha merge, tight crop, mesh AABB crop
- [x] `encodeExportBlob.js` — shared canvas → blob + download hook
- [x] Still transparent PNG via `OfflineCaptureSession` when `USE_CAPTURE_SESSION`
- [x] `VideoExporter._captureTransparentFramePngDataUrl` deduped to shared readback/crop

**Shipped (2026-06-27):**

- [x] Removed dead deprecated shims from `ImageExporter` (`_resampleRgba`, `exportPng`, `exportTransparentPng`).
- [x] `SvgVectorizer.js` — extracted the full image-data → SVG tracing pipeline (silhouette / color / pixel-grid + ImageTracer load) out of `ImageExporter`. Pure (no renderer/scene/composer); `ImageExporter` delegates via `this.svgVectorizer`. `ImageExporter.js` 3343 → ~2050 lines.

---

## Chunk 6 — Video WYSIWYG + dimension matrix + UX

**Goal:** Video capture ≈ viewport 1:1; tier / resolution / aspect switches never break.

- [ ] VideoExporter: frame scheduler + drives only; dedupe `beforeComposerRender` copy from SceneManager.
- [ ] **Preview uses capture path (full WYSIWYG)** — replace live viewport during scrub/play with `renderFrameForCapture` at export size (or full-size capture tiles).
- [x] **Preview capture lite** — Capture preview frame button + debounced scrub thumb (`USE_CAPTURE_PREVIEW_ON_SCRUB = true`, `SCRUB_CAPTURE_DEBOUNCE_MS = 450`); live play/drag unchanged; preview session restore + in-flight guard in `SceneManager.captureExportPreviewFrame`.
- [ ] Video frame 0 pixel-equal to still PNG at same tier + resolution + aspect (automated or manual golden). **Shared encode path shipped** — manual golden still open.
- [x] **Dimension switch tests (size contract)** — automated probes for tier × PNG scale × video resolution; manual visual WYSIWYG still open.
- [ ] **Dimension switch tests (visual + animation)** — manual matrix rows: typography preset, mesh clip, 9∶16 when UI returns. **Font reveal + cam animation @ 1080p/1440p ✅** 2026-06-27.
- [x] **Animation hooks (font typography + creative look `uTime`)** — `applyTimedExportFrameDrives`; font reveal / constant motion + Shader Lab animated MP4 manually verified OK 2026-06-27. Mesh clip / film grain still ❓ in parity matrix.
- [ ] Mobile: `apps/mobile/scripts/mobileExportImage.js` → shared session (keep `MOBILE_EXPORT_MAX_PX` in size policy).
- [x] **Capture preview frame** button — one offline frame at export resolution before long encode.
- [x] **Pre-export summary** — still PNG/JPEG/WebP shows tier + scale + export-only transforms via offline overlay; video PNG sequence already had summary.

**Dimension switch tests shipped (2026-06-27):**

| Layer | Command / entry | What it verifies |
|-------|-----------------|------------------|
| Unit | `npm test` | Video preset sizes (1080p/1440p/4K), PNG 1×/2×, bloom RT per tier, pixel/GPU clamp (`exportDimensionSync.test.mjs`) |
| E2E | `npm run test:e2e:dimension` | Playwright loads `404.glb`, runs probes across Max/Medium/Low × PNG 1× × video 1080p/1440p (`e2e/export-dimension-spot-checks.spec.mjs`) |
| All | `npm run test:all` | Unit then E2E (starts/reuses dev server on `:8000`) |
| Dev console | `await orby.dev.runExportDimensionSpotChecks()` | Same probes as E2E; optional `{ gradient: true }`; requires mesh loaded |
| Dev console | `orby.dev.logCaptureSizeMatrix()` | Size table only, no GL capture |

Modules: `scripts/dev/exportDimensionSpotChecks.js`, `playwright.config.mjs`. Protocol + manual visual checklist: [export-dimension-switch-tests.md](./export-dimension-switch-tests.md). Parity matrix **Dimension switching** rows updated (size contract ✅, visual 🟡).

---

## 1-day emergency sprint (if exports are on fire)

No architecture — export-scoped patches only:

1. Capture debug logging (30 min)
2. Gradient: ~~`syncToDrawingBuffer(exportW, exportH, forceRedraw)` + full viewport reset~~ → **CPU composite** (`captureGradientComposite.js`) shipped 2026-06-27
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
| Gradient capture composite | `scripts/render/capture/captureGradientComposite.js` |
| Export preview scrub | `scripts/ui/ExportPreviewControls.js` |
| HDRI rotation | `scripts/render/EnvironmentController.js` |
| Mobile export | `apps/mobile/scripts/mobileExportImage.js` |
| Export wiring | `scripts/SceneManager.js` (`setupComposer`, export handlers) |
| Mesh animation export | `scripts/render/AnimationController.js` |
| Font reveal / typography animation | `scripts/scene/FontTextRevealController.js`, `FontTextConstantController.js`, `fontTextRevealTypes.js` |
| Render quality tier | `scripts/ui/RenderControls.js`, `SceneManager.syncPostProcessingForLogicalSize` |
| Video aspect / resolution | `scripts/render/exportVideoResolution.js`, `exportVideoMovements.js` |
| Dimension switch unit tests | `scripts/render/capture/exportDimensionSync.test.mjs` |
| Dimension switch dev probes | `scripts/dev/exportDimensionSpotChecks.js` |
| Dimension switch E2E | `e2e/export-dimension-spot-checks.spec.mjs`, `playwright.config.mjs` |
| Test protocol doc | `docs/export-dimension-switch-tests.md` |

---

## Suggested order

**Minimum (stop bleeding):** Chunk 0 → 1-day sprint items → Chunk 2 → Chunk 3 P0 only.

**Trust export again:** + Chunk 1 fully + Chunk 6 lite (capture preview frame + frame 0 = PNG + scrub capture thumb).

- [x] **Capture preview frame** button — one offline frame at export resolution before long encode (`VideoExporter.capturePreviewFrame`, shared `captureVideoExportFrame.js`).
- [x] **Scrub capture preview lite** — debounced offline thumb on scrub settle (`ExportPreviewControls`, `USE_CAPTURE_PREVIEW_ON_SCRUB`).
- [x] **Gradient export** — CPU composite path; quarter-frame GL bug fixed (2026-06-27).
- [x] **Frame 0 = PNG** — PNG sequence loop and capture preview share `captureVideoExportFrameBlob` → `_renderComposerFrameForCapture` (same as still PNG). Manual golden still open.
- [x] **Dimension switch size probes** — `npm run test:all` (unit + Playwright); dev `orby.dev.runExportDimensionSpotChecks()`.

**Never worry again:** + Chunk 4B + 5 + 6 (full preview WYSIWYG, visual dimension matrix, mobile session).

Track progress by checking boxes in this doc and linking PRs in the GitHub issue.
