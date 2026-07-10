# N8AO + HDRI + Base Glass — Official Rules

**Status:** Locked. Do not regress.

This document is the source of truth for how Ambient Occlusion, HDRI backdrop, and Base Glass must work together. It exists because this combination worked for months, broke on 2026-07-10 (`9169a32` and follow-up experiments), and took multiple bad fixes to recover.

Regression tests: `scripts/render/meshglN8aoBackdrop.test.mjs`  
Run: `npm test -- scripts/render/meshglN8aoBackdrop.test.mjs`

Cursor rule (agent guard): `.cursor/rules/n8ao-hdri-backdrop.mdc`

---

## Non-negotiable user rules

These two rules must **always** hold. Any AO change must be verified against both.

### Rule 1 — AO must not turn off HDRI

Turning on Ambient Occlusion must **never** black out, hide, or replace the HDRI / solid / gradient sky. The backdrop plate painted by `MeshglRenderPass` must survive AO compositing on sky pixels.

### Rule 2 — Base Glass must behave like the working weeks-ago build

Base Glass reflector must:

- Stay **reflective** (HDRI / scene reflections from the RenderPass plate)
- Receive a **clean AO pass on top** of those reflections (contact shadow at the rim)
- **Never** make the mesh look transparent, cut out, or masked by the glass disc

---

## What broke (do not repeat)

| Mistake | Symptom |
|---------|---------|
| `renderPass.enabled = !active` when AO is on | HDRI sky goes black; Render Backdrop toggle breaks |
| Hiding `meshglBaseGlassReflector` during beauty seed | Podium depth fills the disc; mesh looks masked/cut out by the circle |
| Restoring **pure** RenderPass colour on glass (zero AO weight) | Glass loses contact shadow; looks flat/wrong vs weeks-ago behaviour |
| Moving glass to a camera layer without enabling it on the studio camera | Glass vanishes entirely |
| Extra mask/layer/depth hacks piled on without browser verify | Horizontal seams, black glass, disappearing glass |

The working fix is **not** “revert AO.” It is: keep the HDRI backdrop composite **and** composite glass correctly.

---

## Pipeline contract (do not simplify away)

### Pass order

1. **`MeshglRenderPass`** — always enabled when AO is on  
   - Paints the full scene + backdrop to composer `readBuffer`  
   - Records `lastComposerColorBuffer` for backdrop restore

2. **`MeshglN8AOPass`** — runs after RenderPass; order inside `render()` is fixed:

   | Step | What | Why |
   |------|------|-----|
   | 1 | Copy RenderPass plate → `_backdropHoldRT` | Hold HDRI + glass reflections before N8AO clobbers buffers |
   | 2 | Seed beauty via `renderSceneBeautyToTarget` | Geometry colour/depth for N8AO; **strip `scene.background` only** |
   | 3 | `_enforceBeautyDepth` | `MeshDepthMaterial` + `colorWrite: false` for imports with `depthWrite: false` |
   | 4 | `_renderGlassMask` | White silhouette mask for base glass disc only |
   | 5 | Run N8AO | `autoRenderBeauty: false`, `transparencyAware: false`, `autoDetectTransparency: false` |
   | 6 | Composite to `readBuffer` | Sky / mesh / glass rules below |

3. **`needsSwap = false`** on `MeshglN8AOPass` — final plate stays in `readBuffer` for bloom/grading.

### Beauty seed — glass stays visible

`renderSceneBeautyToTarget` strips `scene.background` so HDRI does not write depth into the beauty buffer. That is required for the sky mask.

**Glass must remain visible** during beauty seed. Do **not** call `withN8aoExcludedMeshesHidden` (or any equivalent) around the beauty pass. Hiding glass lets the podium write depth under the disc and causes Rule 2 failures.

### Glass mask pass

`_renderGlassMask` identifies **glass disc silhouette pixels only**:

- `withOnlyN8aoExcludedMeshesVisible` — render only `meshglBaseGlassReflector` meshes
- `withN8aoExcludedMeshRenderHooksPaused` — pause Reflector `onBeforeRender` / `onAfterRender` (Reflector hooks corrupt GL viewport during auxiliary renders)
- White `MeshBasicMaterial` override into `_glassMaskRT`

The mask tags the reflector disc — not the mesh. Mesh pixels outside the mask still get full N8AO.

### Composite math (`n8aoBackdropRestoreShader.js`)

Per pixel:

```
geometry = depth < skyDepthThreshold   // 0.9995 — cleared far plane = sky
glass    = glassMask >= 0.5            // base glass disc silhouette only

geomMix   = mix(backdrop, ao, geometry)
aoFactor  = clamp(ao / max(beauty, 0.001), 0, 1)
glassColor = backdrop * aoFactor

output    = mix(geomMix, glassColor, glass)
```

| Pixel type | Result |
|------------|--------|
| **Sky** (`geometry = 0`) | Untouched RenderPass backdrop → **Rule 1** |
| **Mesh / podium** (`geometry = 1`, `glass = 0`) | Full N8AO plate |
| **Glass disc** (`glass = 1`) | RenderPass reflections × AO darkening → **Rule 2** |

`ShaderPass.render(renderer, writeBuffer, readBuffer)` — destination first, source second.

---

## Tagged meshes

Base glass reflector is tagged in `GroundController.js`:

```js
reflector.userData.meshglBaseGlassReflector = true;
```

Same exclusion pattern exists in `ShadowTint.js` and `GoboProjection.js` (they skip this mesh for unrelated passes). Do not remove the tag.

Do **not** assign base glass to a dedicated camera layer unless that layer is enabled on the studio camera.

---

## Files you must not break casually

| File | Role |
|------|------|
| `scripts/render/MeshglN8AOPass.js` | AO pass orchestration |
| `scripts/render/n8aoBackdropRestoreShader.js` | Sky / mesh / glass composite |
| `scripts/render/meshglN8aoBackdrop.js` | Shared constants + test helpers |
| `scripts/render/PostProcessingPipeline.js` | `renderPass.enabled = true` when AO on |
| `scripts/render/MeshglRenderPass.js` | `lastComposerColorBuffer` |
| `scripts/render/renderSceneBeautyToTarget.js` | Geometry-only beauty seed |
| `scripts/render/GroundController.js` | `meshglBaseGlassReflector` tag + Reflector hooks |

---

## Never do

- `renderPass.enabled = !active` when AO is on
- Disable RenderPass and rely on N8AO alone for the backdrop plate
- Hide `meshglBaseGlassReflector` during beauty seed
- Restore glass with pure `backdrop` and zero AO (flat swap)
- Restore backdrop by sampling the composer buffer **after** AO has written into it
- Use a white/colour geometry prepass as the **sole** sky mask
- Re-enable N8AO `autoDetectTransparency` with `autoRenderBeauty: false`
- Copy full composer colour into beauty without geometry-only depth first
- Move base glass to a camera layer without enabling that layer on the studio camera
- Ship AO changes without the manual verify checklist below

---

## Manual verify (required for any AO change)

1. **HDRI + AO** — Beach (or any) HDRI backdrop on, AO on (~strength 5–14) → sky visible, contact shadow on mesh + podium rim.
2. **Render Backdrop off + AO** — Solid `#202020` studio, AO still on geometry only.
3. **Import mesh** — Textured/skinned model (e.g. teddy) + shape-library primitive; AO on geometry, not corrupted.
4. **Base Glass + AO** — Reflective disc bright; AO at contact rim; **mesh not transparent or disc-masked**.
5. **Toggle AO** — Turn AO on/off repeatedly; no flash to black, no disappearing glass.

---

## Regression history

- **Months (pre-2026-07-10):** AO replaced RenderPass; single beauty pass; glass + AO worked; HDRI under AO was fragile.
- **2026-07-10 `9169a32`:** RenderPass kept enabled; HDRI fixed via backdrop composite; glass broke (geometry depth treated glass like opaque mesh).
- **2026-07-10 follow-ups:** Glass hide + flat backdrop restore → disc masking / black glass / disappearing glass.
- **2026-07-10 final fix:** Glass stays in beauty; composite `backdrop * (ao/beauty)` on disc mask only. Both user rules satisfied.

---

## Before merging any AO PR

- [ ] `npm test -- scripts/render/meshglN8aoBackdrop.test.mjs` passes
- [ ] Manual verify checklist (all 5 items) checked in browser
- [ ] Diff touches only files in the table above (or justify why not)
- [ ] No new camera layers, visibility hides, or mask passes without explicit review against this doc
