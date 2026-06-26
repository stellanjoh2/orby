# Export parity matrix

**Last updated:** 2026-06-26 (Gouache/Watercolour/Sketch @ 1× verified; fisheye + ASCII; transparent @ 1×)  
**Capture stack:** Chunks 1–2 shipped (`OfflineCaptureSession`, `renderFrameForCapture`, `captureReadback`, strict size contract, GPU clamp coerce + toast).  
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
| Transparent PNG (artistic paper key) | Legacy path | ❓ |
| Transparent video PNG sequence | `VideoExporter` + transparent setup + HDRI hook | ✅ 1080p / 4K verified 2026-06-26 |
| Mobile export (`mobileExportImage.js`) | Own resize/readback | ❓ |
| Export movement **preview** (live viewport scrub) | Live loop; verify via **Capture preview frame** button | 🟡 Live scrub ≠ encode; offline preview frame at export resolution ✅ |

---

## Render quality tier × PNG still

Preview DPR / bloom scale / FXAA / shadows differ by tier. Opaque export uses preview backing store × scale (not a separate “export Ultra” tier).

| Tier | PNG 1× | PNG 2× | Notes |
|------|--------|--------|-------|
| **Max (Ultra)** | ✅ | ✅ | 2× on very large viewports may hit **browser pixel budget** → capped size + toast (e.g. 10240×5760 → 7680×4320). No WebGL copy overflow after clamp coerce fix. |
| **Medium** | ✅ | ❓ | Opaque PNG smoke-tested 2026-06-26 — beach HDRI bg, bloom, FXAA, PBR mesh; viewport restore OK. 2× not re-tested on Medium yet. |
| **Low** | ❓ | ❓ | Same capture path; not re-tested post-refactor |

**Post-export viewport restore:** ✅ (opaque PNG, repeated exports)

---

## PNG still × scene features (opaque)

| Feature | PNG 1× | PNG 2× | Notes |
|---------|--------|--------|-------|
| Solid / HDRI background | ✅ | ✅ | Medium tier + beach HDRI verified opaque 2026-06-26 |
| **Gradient background** | 🟡 | 🟡 | `prepareForCapture` after export viewport — verify quarter-frame fixed |
| Bloom + grading stack | ✅ | ✅ | Smoke-tested |
| Lens distortion | ✅ | ❓ | Fisheye + ASCII stack verified opaque still 2026-06-26 (`capturePostPipelinePins`) |
| Fisheye | ✅ | ❓ | Opaque still verified 2026-06-26 (combined with ASCII creative look) |
| Creative look (Shader Lab) | ✅ | ❓ | Gouache / Watercolour / Sketch @ 1× verified 2026-06-26 (`captureArtisticLookPrep.js`); ASCII ✅ |
| ASCII / pixel presets | ✅ | ❓ | Reference pin via `CaptureFeatureSession`; 2× grid semantics unchanged (viewport density) |
| Cinematic 21∶9 letterbox overlay | ❓ | ❓ | |
| Ground grid / gizmos | ❓ | ❓ | Gizmos typically off during export |

---

## Transparent PNG

| Variant | PNG 1× | PNG 2× | Notes |
|---------|--------|--------|-------|
| Standard (mesh crop + alpha) | ✅ | ❓ | Session path verified 2026-06-26 — tight crop, clean alpha, viewport restore OK |
| Artistic (gouache / watercolour / sketch paper key) | ❓ | ❓ | Strict readback + retry; not session-wrapped |
| Fisheye + transparent | 🔧 | 🔧 | Blocked in UI (`shouldBlockFisheyePngExport`) |

---

## Video export

Movement preview uses **live viewport** for scrub/play; **Capture preview frame** renders offline at export resolution (same `captureVideoExportFrameBlob` path as PNG sequence). Frame 0 shares encode path with still PNG — manual golden not run yet.

### Resolution × aspect (movement enabled)

Portrait **9∶16** UI is disabled (`normalizeExportVideoAspectRatio` → always 16∶9).

| Resolution | 16∶9 MP4 | 16∶9 PNG opaque | 16∶9 PNG transparent | Notes |
|------------|----------|-----------------|----------------------|-------|
| 1080p | ✅ | ✅ | ✅ | PNG opaque + transparent verified 2026-06-26 (Medium tier, beach HDRI) |
| 1440p | ❓ | ❓ | ❓ | |
| 2160p (4K) | 🟡 | ✅ | ✅ | PNG opaque + transparent verified 2026-06-26; MP4 may use fallback encoding |

### Export movements (mesh / camera)

| Movement | Video | Preview vs encode | Notes |
|----------|-------|---------------------|-------|
| Turntable | ✅ | 🔧 | Preview live; encode offline — Chunk 6 |
| Orbit | ❓ | 🔧 | |
| Zoom in / out | ❓ | 🔧 | |
| Tilt left / right | ❓ | 🔧 | |
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
| Creative look `uTime` | ❓ | `applyCreativeLookExportFrame` |
| Film grain time | ❓ | `applyGrainExportFrame` |
| Font reveal — **scale** | ❓ | |
| Font reveal — **fade** | ❓ | |
| Font reveal — **slideUp** | ❓ | |
| Font reveal — **slideDown** | ❓ | |
| Font reveal — **drop** | ❓ | |
| Font reveal — **pop** | ❓ | |
| Font reveal — **rotate** | ❓ | |
| Font reveal — **elastic** | ❓ | |
| Font reveal — word stagger | ❓ | |
| Font constant / ambient motion | ❓ | `FontTextConstantController` |

---

## Dimension switching (tier / resolution / aspect)

| Switch | Opaque PNG | Video frame | Notes |
|--------|------------|-------------|-------|
| Max ↔ Medium ↔ Low, then export | ❓ | ❓ | `syncPostProcessingForLogicalSize` on resize |
| PNG 1× ↔ 2× | ✅ | — | Includes GPU budget learn + pre-clamp (`_maxExportPixelArea`) |
| 1080p ↔ 1440p ↔ 4K video | — | ✅ | PNG opaque + transparent at 1080p and 4K verified 2026-06-26 |
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
5. [ ] Optional: gradient bg + 2× PNG (watch for quarter-frame — flag matrix if broken)
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
| Gradient quarter-frame 🟡 | Manual verify → mark ✅ |
| HDRI angle 🟡 | Manual verify (rotate slider → export PNG) → mark ✅ |
| Transparent PNG ❓ | 2× still transparent on session path |
| Preview ≠ encode 🔧 | Chunk 6 — preview uses `renderFrameForCapture` |
| Font / mesh animation rows ❓ | Chunk 3 P1 + Chunk 6 animation clock |
