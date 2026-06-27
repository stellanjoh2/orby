# Export animation verification (manual pass)

Companion to [export-parity-matrix.md](./export-parity-matrix.md) → **Video × animation sources**.

Goal: confirm that timed scene animation (mesh clips, creative look `uTime`, grain, font
reveal, constant glyph motion) is **present, correctly timed, and frame-0-aligned** in
exported video — not frozen on the first frame.

**Status (2026-06-27):** Font reveal types + constant motion + export camera movements +
**creative look (Shader Lab) animated MP4** — **functionally OK** at 1080p and 1440p Ultra
(MP4 + PNG sequence). User sweep across reveal presets, cam animations, and creative
shaders; no frozen-frame or timing failures reported. Mesh clip / film grain rows still
open if needed later.

## Why this list is short

Live preview and export both pose glyphs through the same `applyAtTime` math. Export
parity therefore hinges on two shared things, not on each preset:

1. **The shared export clock** — `applyTimedExportFrameDrives` (`captureExportFrameDrives.js`)
   advancing `frameIndex / fps` each encode frame.
2. **The transform channel** reaching the encoder — position, rotation, scale, opacity.

So we verify the four channels with representative presets + the shared clock. If those
pass, the remaining presets reuse the identical path.

## Cross-cutting pass criteria (apply to every row)

- **A — Not frozen:** motion visibly progresses across the clip (the classic export bug is
  every frame stuck at t=0).
- **B — Timing matches preview:** reveal completes / loop speed looks the same as the
  studio scrub at the same duration.
- **C — Frame 0 == still:** the first video frame matches a still PNG exported at the
  reveal's start pose (same tier + resolution).

Use a short clip (2–3 s) at one tier (Max) and one resolution (1080p) unless a row says otherwise.

## Rows

| # | Setup (minimal) | Channel / source | What to look for | Result |
|---|-----------------|------------------|------------------|--------|
| 1 | Font text, reveal = **slideUp**, unit = character | Position + stagger | Letters rise in sequence; last letter lands at clip's reveal end (B); frame 0 = all-down start (C) | |
| 2 | Font text, reveal = **rotate** | Rotation | Glyphs spin into place; no frozen-flat frame 0 | |
| 3 | Font text, reveal = **scale** | Scale | Glyphs grow from small → rest size over time | |
| 4 | Font text, reveal = **fade** | Opacity (transparent mat) | Glyphs fade 0→1; frame 0 nearly invisible, not fully opaque | |
| 5 | Font text, reveal = **slideUp**, unit = **word** | Stagger grouping | Whole words move together, staggered word-by-word (not per letter) | |
| 6 | Font text, reveal = none, constant = **float** (or wave) | Looping motion | Continuous loop runs the whole clip; speed matches preview; no freeze | |
| 7 | Font text, reveal = slideUp + constant = float | Layering | Reveal plays, then ambient loop continues; both visible, not one cancelling the other | |
| 8 | GLTF with clip, "include animation in export" on | Mesh clip | Mesh animates over clip; ends where preview ends at same duration | |
| 9 | Creative look with motion (e.g. dust-field / flow) | `uTime` | Shader animates frame-to-frame; not a static field | |
| 10 | Film grain on | Grain time | Grain pattern changes each frame (shimmer), not a frozen overlay | |

## Marking

For each row record: **A / B / C** as ✅ / ❌ / n-a, plus a note on any mismatch.
Then update **Video × animation sources** in `export-parity-matrix.md`:

- All of A/B/C ✅ → mark the row ✅
- Motion present but timing/offset off → 🟡 with the note
- Frozen / wrong / crash → ❌ with repro

## If a row fails

- **Frozen (A fails):** the drive isn't being called for that source — check its
  `apply*ExportFrame` wiring in `SceneManager` (lines ~1323–1339) and that
  `VideoExporter` passes `frameIndex`/`fps` (`applyTimedExportFrameDrives`, ~line 311).
- **Timing off (B fails):** clock vs. preview elapsed mismatch — compare
  `resolveExportTimeSec` (frameIndex/fps) against the live preview's elapsed source.
- **Frame 0 differs (C fails):** export start pose not equal to live start — check the
  source's `beginExportDrive` / start-pose handling.
