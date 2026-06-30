# Export parity matrix

**Last updated:** 2026-06-27 (creative shaders + MP4 animation verified; font reveals @ 1080p/1440p)  
**Capture stack:** Chunks 1–3 P0 shipped (`OfflineCaptureSession`, `renderFrameForCapture`, `captureReadback`, strict size contract, `captureGradientComposite.js`, composer viewport pin during capture). **Dimension tests:** [export-dimension-switch-tests.md](./export-dimension-switch-tests.md).  
**Related:** [EXPORT_REFACTOR_PLAN.md](./EXPORT_REFACTOR_PLAN.md)

Track whether exported pixels match studio viewport expectations. Update this doc after manual smoke or when fixing a row.

---

## Legend

| Mark | Meaning |
|------|---------|
| ✅ | **Verified** — manually tested; matches viewport (or documented export-only behavior is correct) |
| 🟡 | **Partial** — works with caveats (see notes) |
| ❓ | **Unknown** — not tested since capture refactor |
| ❌ | **Broken** — known mismatch or failure |
| 🔧 | **Export-only** — intentional difference from live viewport (must be listed in pre-export summary, Chunk 6) |

---

## Capture path coverage

| Entry | Uses canonical path | Status |
|-------|---------------------|--------|
| Opaque PNG / JPEG / WebP (`exportImage`, `USE_CAPTURE_SESSION`) | Session → `renderFrameForCapture` → `captureReadback` | ✅ |
| Opaque PNG legacy (`USE_CAPTURE_SESSION = false`) | Inline resize + `renderComposerPassForExport` | 🟡 Rollback only |
| Video frame encode (`VideoExporter._renderComposerFrameForCapture`) | `renderFrameForCapture` → `captureReadback` | ✅ |
| Dev creative-look thumbnails (`bakeCreativeLookThumbnails`) | `renderFrameForCaptureWithPins` → `captureReadback` | ✅ |
| Transparent PNG (standard crop) | Session → `TransparentCapture` + `OfflineCaptureSession` | ✅ 1× verified 2026-06-26 |
| Transparent PNG (artistic paper key) | Session → `OfflineCaptureSession` + `keyArtisticPaperBackdrop.js` | ✅ 1×/2× verified 2026-06-27 |
| Transparent video PNG sequence | `VideoExporter` + transparent setup + HDRI hook | ✅ 1080p / 4K verified 2026-06-26 |
| Mobile export (`mobileExportImage.js`) | Own resize/readback | ❓ |
| Export movement **preview** (live viewport scrub) | Live loop while dragging; debounced offline thumb on settle (`USE_CAPTURE_PREVIEW_ON_SCRUB`) | 🟡 Play + drag still live; encode path verified via **Capture preview frame** + scrub thumb ✅ |
| Gradient bg offline composite | `captureGradientComposite.js` — post RGB + scene alpha merged under 2D gradient canvas | ✅ Still PNG, video frame, capture preview — Max/Medium/Low + 1080p/4K verified 2026-06-27 |

---

## Render quality tier × PNG still

Preview DPR / bloom scale / FXAA / shadows differ by tier. Opaque export uses preview backing store × scale (not a separate “export Ultra” tier).

| Tier | PNG 1× | PNG 2× | Notes |
|------|--------|--------|-------|
| **Max (Ultra)** | ✅ | ✅ | 2× on very large viewports may hit **browser pixel budget** → capped size + toast (e.g. 10240×5760 → 7680×4320). Gradient export ✅ 2026-06-27. |
| **Medium** | ✅ | ❓ | Opaque PNG smoke-tested 2026-06-26 — beach HDRI bg, bloom, FXAA, PBR mesh; gradient export ✅ 2026-06-27. 2× not re-tested on Medium yet. |
| **Low** | ❓ | ❓ | Gradient export ✅ 2026-06-27; opaque PNG not re-tested post-refactor |

**Post-export viewport restore:** ✅ (opaque PNG, repeated exports)

---

## PNG still × scene features (opaque)

| Feature | PNG 1× | PNG 2× | Notes |
|---------|--------|--------|-------|
| Solid / HDRI background | ✅ | ✅ | Medium tier + beach HDRI verified opaque 2026-06-26 |
| **Gradient background** | ✅ | ✅ | CPU composite (`captureGradientComposite.js`) — full-frame gradient at export size; quarter-frame GL bug fixed 2026-06-27 |
| Bloom + grading stack | ✅ | ✅ | Smoke-tested |
| Lens distortion | ✅ | 🟡 | Fisheye + ASCII stack verified opaque still 2026-06-26 (`capturePostPipelinePins`); 2× lens RT pin covered by unit tests |
| Fisheye | ✅ | 🟡 | Opaque still verified 2026-06-26 (combined with ASCII creative look); 2× via session + lens pin |
| Creative look (Shader Lab) | ✅ | ✅ | Gouache / Watercolour / Sketch opaque + transparent @ 1×/2× verified 2026-06-27 (`captureArtisticLookPrep.js`, paper key) |
| ASCII / pixel presets | ✅ | ✅ | Reference pin + grid composite on byte RT; linewidth scales with export scale — verified 2026-06-27 |
| Cinematic 21∶9 letterbox overlay | ✅ | ✅ | CPU mattes in `_captureComposerOutputAsCanvas` (`cinematicLetterbox219.js`); geometry matches CSS overlay — unit tests. **Video: MP4 via GL scissor mattes (`fillCinematicLetterbox219MattesGl`), PNG sequence + gradient via CPU mattes — fixed 2026-06-27** |
| Ground grid / gizmos | ✅ | ✅ | ASCII/flat-post: grid composited on byte readback RT (`capturePostStackOverlays.js`); linewidth from slider × export scale |

---

## Transparent PNG

| Variant | PNG 1× | PNG 2× | Notes |
|---------|--------|--------|-------|
| Standard (mesh crop + alpha) | ✅ | ❓ | Session path verified 2026-06-26 — tight crop, clean alpha, viewport restore OK |
| Artistic (gouache / watercolour / sketch paper key) | ✅ | ✅ | Session + `keyArtisticPaperBackdrop.js` — manual verify 2026-06-27 |
| Fisheye + transparent | 🔧 | 🔧 | Blocked in UI (`shouldBlockFisheyePngExport`) |

---

## Video export

Movement preview uses **live viewport** for scrub/play; on scrub settle (`USE_CAPTURE_PREVIEW_ON_SCRUB`, 450ms debounce) an offline thumb renders at export resolution (same `captureVideoExportFrameBlob` path as encode). **Capture preview frame** button uses the same path. Frame 0 shares encode path with still PNG — manual golden not run yet. Gradient bg verified at 1080p + 4K encode/preview 2026-06-27. **Creative look (Shader Lab) animated MP4** — functionally OK 2026-06-27 (`applyCreativeLookExportFrame` / `uTime`).

### Resolution × aspect (movement enabled)

Portrait **9∶16** UI is disabled (`normalizeExportVideoAspectRatio` → always 16∶9).

| Resolution | 16∶9 MP4 | 16∶9 PNG opaque | 16∶9 PNG transparent | Notes |
|------------|----------|-----------------|----------------------|-------|
| 1080p | ✅ | ✅ | ✅ | PNG opaque + transparent verified 2026-06-26; gradient bg encode + preview ✅ 2026-06-27 |
| 1440p | ✅ | ✅ | ❓ | **MP4 + PNG sequence @ Ultra (Max) ✅** 2026-06-27; transparent sequence not re-tested |
| 2160p (4K) | 🟡 | ✅ | ✅ | PNG opaque + transparent verified 2026-06-26; gradient bg encode + preview ✅ 2026-06-27; MP4 may use fallback encoding. **4K MP4 clamps to drawing-buffer budget on ≤1440p hardware** — encode succeeds at coerced max (expected, `_setExportFramebufferSize` + capped toast); MP4 ceiling = canvas drawing buffer (captureStream), so can't exceed what the GPU grants the canvas |

### Export movements (mesh / camera)

| Movement | Video | Preview vs encode | Notes |
|----------|-------|---------------------|-------|
| Turntable | ✅ | 🟡 | Encode offline ✅; scrub thumb + capture preview frame ✅; live play/drag still ≠ encode — Chunk 6 full WYSIWYG open |
| Orbit | ❓ | 🔧 | |
| Zoom in / out | ❓ | 🔧 | |
| Roll left / right | ❓ | 🔧 | |
| FOV offset | ❓ | 🔧 | |
| Pitch offset | ❓ | 🔧 | |
| HDRI rotation over duration | ❓ | 🔧 | Export-only spin (disabled in UI); encode uses `live: true` |
| **HDRI slider (static angle)** | 🟡 | 🟡 | Capture normalizes to `setRotationLive` — verify PNG matches viewport |
| Lights auto-rotate | ❓ | 🔧 | |
| Subtle spin (22.5° / 45° / 90°) | ❓ | 🔧 | |

### Video × animation sources

| Source | Status | Notes |
|--------|--------|-------|
| GLTF mesh clip (include in export) | ❓ | `AnimationController` export drive |
| Creative look `uTime` | ✅ | Animated Shader Lab looks in MP4 — functionally OK 2026-06-27 (`applyCreativeLookExportFrame`) |
| Film grain time | ❓ | `applyGrainExportFrame` |
| Font reveal — **scale** | ✅ | 1080p/1440p — functionally OK 2026-06-27 (broad reveal + cam animation sweep) |
| Font reveal — **fade** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — **slideUp** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — **slideDown** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — **drop** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — **pop** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — **rotate** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — **elastic** | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font reveal — word stagger | ✅ | 1080p/1440p — functionally OK 2026-06-27 |
| Font constant / ambient motion | ✅ | `FontTextConstantController` — 1080p/1440p functionally OK 2026-06-27 |

---

## Dimension switching (tier / resolution / aspect)

| Switch | Opaque PNG | Video frame | Notes |
|--------|------------|-------------|-------|
| Max ↔ Medium ↔ Low, then export | 🟡 | 🟡 | **Size contract ✅** — `npm test` + Playwright/`orby.dev.runExportDimensionSpotChecks()` (tier × PNG 1× × video 1080p/1440p). Manual visual WYSIWYG open — [export-dimension-switch-tests.md](./export-dimension-switch-tests.md) |
| PNG 1× ↔ 2× | ✅ | — | Includes GPU budget learn + pre-clamp (`_maxExportPixelArea`); 1×↔2× aspect math in `npm test` |
| 1080p ↔ 1440p ↔ 4K video | — | 🟡 | 1080p animated reveals ✅ 2026-06-27; **1440p MP4 + PNG sequence @ Ultra ✅** 2026-06-27; 4K animated video + mid-session switch sequence still open |
| 16∶9 studio viewport → 16∶9 video reframe | ❓ | ❓ | Horizontal FOV preserved on wide viewports |
| After export → live studio unchanged | ✅ | ❓ | Opaque PNG ✅; long video encode ❓ |

---

## Strict size contract (Chunk 2)

| Check | Status |
|-------|--------|
| No silent `_resampleRgba` (`ALLOW_CAPTURE_RESAMPLE = false`) | ✅ |
| Mismatch → retry re-render once → `CaptureSizeMismatchError` | ✅ (not triggered in happy path) |
| GPU / canvas clamp → toast + console warn | ✅ |
| Browser clamp → coerce Three.js to actual backing store (no `glCopySubTexture` flood) | ✅ |
| Debug tuple on mismatch (`buildCaptureDebugTuple`) | ✅ |
| Debug log every capture (`LOG_CAPTURE_DEBUG = true`) | ✅ Session + readback |

---

## Non-raster export (out of refactor scope)

| Export | Parity tracked here? |
|--------|----------------------|
| SVG silhouette / color / screen-pixel | No — geometry / vector pipelines |
| GLB | No |

---

## 5-minute smoke checklist

Run after any export PR touching capture:

1. [ ] Load mesh → orbit → enable bloom
2. [ ] Export opaque PNG 1× → file looks correct
3. [ ] Export opaque PNG 2× (Max tier if available) → no scale-up stretch; toast only if GPU caps
4. [ ] Live viewport unchanged after export (orbit, gradient/HDR if enabled)
5. [x] Optional: gradient bg + 2× PNG — CPU composite path verified 2026-06-27
6. [ ] Optional: rotate HDRI in studio → export PNG → same angle in file
7. [ ] Optional: video turntable 1080p short clip → frame 0 vs still PNG same settings

---

## How to update

1. Run smoke checklist (or targeted row).
2. Change cell to ✅ / 🟡 / ❌ / ❓ / 🔧 and add a note column or footnote if 🟡.
3. Set **Last updated** at top.
4. Check off matrix item in [EXPORT_REFACTOR_PLAN.md](./EXPORT_REFACTOR_PLAN.md) Chunk 0 if not already.

---

## Open gaps → plan chunks

| Symptom in matrix | Next chunk |
|-------------------|------------|
| HDRI angle 🟡 | Manual verify (rotate slider → export PNG) → mark ✅ |
| Transparent PNG ❓ | 2× still transparent on session path |
| Preview ≠ encode 🟡 | Chunk 6 lite shipped (scrub thumb + capture preview frame); full scrub/play → capture path still open |
| Dimension switch rows 🟡 | Automated size probes ✅ (`npm test`, `npm run test:e2e:dimension`); manual visual — [export-dimension-switch-tests.md](./export-dimension-switch-tests.md) |
| Font / mesh animation rows ❓ | Chunk 3 P1 + Chunk 6 animation clock |
