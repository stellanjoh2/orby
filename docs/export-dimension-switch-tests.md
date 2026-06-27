# Export dimension switch — spot tests

**Related:** [export-parity-matrix.md](./export-parity-matrix.md), [EXPORT_REFACTOR_PLAN.md](./EXPORT_REFACTOR_PLAN.md) Chunk 6.

Verify that changing render quality tier, PNG scale, or video resolution does not leave stale composer buffers, silent resample, or a corrupted live viewport after capture.

---

## Automated (no browser)

Pure size / tier math — run anytime:

```bash
npm test              # unit tests only (fast, no browser)
npm run test:e2e:dimension   # Playwright + dev server (needs Chromium)
npm run test:all      # both, in order
```

Covers:

- Video preset sizes (1080p / 1440p / 4K)
- 9∶16 forced to 16∶9 (portrait export UI disabled)
- PNG 1× ↔ 2× aspect preservation
- Bloom RT scale per tier (mirrors `SceneManager.syncPostProcessingForLogicalSize`)
- GPU / pixel-area clamp helpers

---

## Automated (browser, dev)

Requires studio loaded with a mesh (any GLB/OBJ).

1. Start dev server: `npm run dev`
2. Load a model
3. DevTools console:

```js
// Size table only (no capture)
orby.dev.logCaptureSizeMatrix()

// Full probe: tier × PNG 1×/2× × video 1080p/1440p/4K
await orby.dev.runExportDimensionSpotChecks()

// Include gradient bg (CPU composite path)
await orby.dev.runExportDimensionSpotChecks({ gradient: true })
```

Each probe:

1. Sets render quality tier
2. Runs `OfflineCaptureSession` → `renderFrameForCapture` → strict `captureReadback`
3. Asserts drawing buffer, composer RT, and readback all match requested export size
4. Restores viewport; final row checks logical size + DPR unchanged

**Pass:** console shows `{ passed: true, failed: [] }`.

**Playwright (optional):**

```bash
npm run dev   # terminal 1
npm run test:e2e:dimension   # terminal 2 — loads 404.glb and runs probes
```

---

## Manual visual spot checks (~15 min)

Use the same scene for all rows so comparisons are fair. Recommended fixture:

- PBR mesh (not font/SVG)
- **Gradient background** enabled (covers CPU composite)
- Bloom on, Medium tier baseline
- Optional: HDRI rotated ~45° for static-angle row

Record pass/fail in [export-parity-matrix.md](./export-parity-matrix.md) **Dimension switching** section.

### A — Render quality tier

| Step | Action | Pass if |
|------|--------|---------|
| A1 | Medium → export PNG 1× | File matches viewport; no scale-up |
| A2 | Switch **Max** → export PNG 1× | Same framing; bloom/FXAA OK |
| A3 | Switch **Low** → export PNG 1× | Export succeeds; viewport restores |
| A4 | Max → Medium → Low → export PNG 1× each | No quarter-frame gradient; no toast unless GPU cap |
| A5 | After A4, orbit viewport | Live studio unchanged |

### B — PNG scale

| Step | Action | Pass if |
|------|--------|---------|
| B1 | Medium, PNG **1×** → export | Baseline |
| B2 | Same session, PNG **2×** → export | ~2× pixels; no stretch artifact |
| B3 | Back to **1×** → export | Matches A1 again |

### C — Video resolution (16∶9)

Enable turntable or static frame; use **Capture preview frame** + short encode spot-check.

| Step | Action | Pass if |
|------|--------|---------|
| C1 | 1080p → capture preview frame | Thumb matches encode path (no gradient box) |
| C2 | Switch **1440p** → capture preview frame | Full frame; size label correct |
| C3 | Switch **4K** → capture preview frame | Full frame (or cap toast if GPU limits) |
| C4 | 1080p → 4K → 1080p preview sequence | No stale 4K buffer on final 1080p |

### D — Combined switches (smoke)

| Step | Action | Pass if |
|------|--------|---------|
| D1 | Max + 4K video preview | OK |
| D2 | Low + 1080p PNG 1× | OK |
| D3 | Medium + PNG 2× after D2 | OK; viewport restore |

### E — Animation sources (one each)

| Source | Minimal check |
|--------|----------------|
| GLTF clip | Include in export → 1080p frame 0 vs scrub |
| Font reveal (e.g. fade) | Generate text → export PNG 1× mid-reveal |
| Export movement | Turntable 1080p → frame 0 vs still PNG same settings |

### F — 9∶16 aspect

Portrait export UI is **disabled** (`normalizeExportVideoAspectRatio` → 16∶9). Skip until UI returns; code path tested in `npm test`.

---

## Matrix update template

After a manual row passes, edit **Dimension switching** in `export-parity-matrix.md`:

| Switch | Opaque PNG | Video frame | Notes |
|--------|------------|-------------|-------|
| Max ↔ Medium ↔ Low | ✅ / 🟡 / ❌ | ✅ / 🟡 / ❌ | date + fixture |
| 1080p ↔ 1440p ↔ 4K | — | ✅ / 🟡 / ❌ | capture preview + encode |
| After export → live studio | ✅ | ✅ | orbit + gradient sync |

Set **Last updated** at top of parity matrix.

---

## Known limits

- Dev probes verify **size contract** and viewport restore — not pixel-perfect WYSIWYG vs live viewport.
- Frame 0 = still PNG golden is a separate check (Chunk 6).
- Full preview = capture on scrub/play remains open; scrub **thumb on settle** is lite coverage only.
