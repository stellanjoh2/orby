# HDRI formats in Orby — EXR, HDR, and JPG

Reference doc for contributors and support. Covers why built-in environments are JPEGs, how custom uploads behave, and why raw EXR files (e.g. from [OpenHDRI](https://openhdri.net/)) often look worse than JPG/HDR uploads on GLB models — even though EXR support is working as designed.

**Status:** Reference only. A user-facing FAQ page and in-app links are planned; see [Future work](#future-work).

---

## TL;DR

| Question | Answer |
|----------|--------|
| Is the EXR loader broken? | **No.** Custom `.exr` files load through Three.js `EXRLoader` with the expected linear float path. |
| Why do built-in presets look “better”? | They are **pre-graded 4K JPEGs**, not raw HDR. Exposure, white balance, saturation, and ACES Filmic tone mapping are baked in. |
| Why does my OpenHDRI EXR look harsh on GLBs? | Raw scene-referred HDR has extreme sun/sky values. Orby’s defaults (especially HDRI strength ≈ 2) are tuned for graded LDR maps. |
| What should users upload for the “Orby look”? | **Tone-mapped JPG/PNG** (2:1 equirectangular), or dial EXR way down (strength ~0.3–0.8, more blur). |
| What formats are supported? | Custom upload: `.hdr`, `.hdri`, `.exr`, `.jpg`, `.png`, and other common image types. |

---

## Built-in presets are LDR JPEGs

All eight built-in Studio environments in `scripts/config/hdri.js` use `type: 'ldr'` and point at **4K JPEG** assets under `assets/hdris/`, not `.hdr` or `.exr` masters.

Example:

```js
congress: { url: './assets/hdris/MR_INT-009_NeonsLines_PalaisCongres_4k.jpg', type: 'ldr' },
```

Those JPEGs are **display-referred** environment maps: they were authored for product-viz viewing, not for linear HDR workflows.

### How they were baked

`scripts/encodeHdriPresets.py` converts HDR sources to JPEG with:

- Per-preset **exposure**, **white balance** (temperature/tint), and **saturation**
- **ACES Filmic** tone mapping (aligned with Orby’s post-processing curve)
- Output size **4000×2000**, JPEG quality **92**

So the built-ins are already “finished” skies. They compress real-world dynamic range into 0–1 sRGB values that read well on PBR GLBs.

---

## How Orby loads each format

Loading is handled in `scripts/render/EnvironmentController.js` → `_loadHdriTexture()`.

| Upload / preset type | Loader | Color handling | Notes |
|----------------------|--------|----------------|-------|
| `ldr` (JPG, PNG, …) | `TextureLoader` | `sRGBEncoding` / display-referred | Same path as built-in presets |
| `hdr` | `RGBELoader` | RGBE HDR | Full dynamic range |
| `exr` | `EXRLoader` | Linear float (HalfFloat) | No extra grading in-app |

Custom upload type is inferred from extension in `getCustomHdriUploadType()` (`scripts/config/hdri.js`):

- `.exr` → `exr`
- `.hdr` / `.hdri` → `hdr`
- everything else → `ldr`

After load, all types go through **PMREM** (`PMREMGenerator.fromEquirectangular`) for image-based lighting (IBL) on materials.

---

## Why EXR often looks worse than JPG on GLBs

This is usually a **pipeline and content mismatch**, not a loader bug.

### 1. Graded LDR vs raw HDR

Built-in and custom **JPG** uploads are already tone-mapped and clamped. **EXR** files from libraries like OpenHDRI are **scene-referred**: sun and sky can be orders of magnitude brighter than shadows, with no artistic grade for Orby’s viewer.

### 2. PBR materials respond to real HDR differently

GLBs with metalness, roughness, glass, and clearcoat:

- **JPG / baked LDR:** soft, even reflections; highlights already controlled → flattering for product shots
- **Raw EXR:** tiny blazing sun hotspots on metal/glass; very dark shadow areas; can look blown out or speckled

### 3. Default HDRI strength is tuned for JPEGs

Default `hdriStrength` in `StateStore` is **2**. That works for built-in graded JPEGs. Linear EXR at strength 2 is often **too hot**.

### 4. No mood companion for custom uploads

Built-in presets trigger **HDRI moods** (bloom tint, ground color, etc.) via `HdriMoodController`. Custom uploads call `applyNeutralHdriCompanion()` — bloom/ground styling resets to neutral.

### 5. Auto exposure (if enabled)

`AutoExposureController` samples the raw scene. A bright EXR sky can push exposure down and make the model feel flat or murky. Auto exposure defaults to **off**.

### 6. Sanity check

Export the **same** OpenHDRI scene as a tone-mapped JPG and upload it as custom HDRI. If JPG looks good and EXR looks bad for the same scene, that confirms HDR vs LDR grading — not a broken EXR path.

---

## EXR loader — what we do and don’t do

**Working as intended:**

- Three.js `EXRLoader.loadAsync()`
- Equirectangular mapping, repeat/clamp wrapping
- PMREM for `scene.environment` and material `envMap`

**Not applied to EXR (by design today):**

- No exposure bake
- No ACES pre-grade
- No sRGB encoding (linear is correct for EXR)
- No per-file color-space conversion (e.g. ACEScg → display)
- No automatic strength reduction for HDR vs LDR

There is no evidence of a broken EXR loader unless a specific file fails to parse or load.

---

## Recommendations

### For most users (Orby “sweet spot”)

Use **pre-graded LDR equirectangulars**:

- Built-in presets, or
- Custom **JPG/PNG** uploads (2:1 aspect)

### For OpenHDRI / Poly Haven EXR masters

**Bake outside Orby**, then upload JPG:

1. Load EXR in Photoshop, Affinity, or a script (same idea as `encodeHdriPresets.py`)
2. Adjust exposure and white balance on a test GLB
3. Tone-map with **ACES Filmic** (matches Orby’s look)
4. Export **4K 2:1 JPG** (~quality 90+) and upload

OpenHDRI **LDR previews** often match what Orby’s pipeline wants better than EXR masters.

### If using EXR directly in Orby

- **HDRI strength:** start **0.3–0.8** (not 2)
- **Blur:** increase slightly to soften sun discs in reflections
- **Exposure:** adjust manually; be cautious with auto exposure
- Expect **neutral** mood (no built-in bloom/ground pairing)

---

## Custom HDRI upload — other behaviors

Documented here for future FAQ overlap:

- **Aspect ratio:** 2:1 equirectangular expected
- **Session-only:** custom files use blob URLs; **re-upload after refresh** — not stored in scene JSON / Copy Scene
- **Mood presets:** custom upload resets companion styling to neutral
- **Supported extensions:** `.hdr`, `.hdri`, `.exr`, `.jpg`, `.png`, `.webp`, `.tif`, etc. (see `#hdriFileInput` `accept` in `index.html`)

Registration flow: `SceneManager.loadCustomHdri()` → `EnvironmentController.registerPreset(HDRI_CUSTOM_ID, …)`.

---

## Technical reference (code)

| Topic | Location |
|-------|----------|
| Preset definitions | `scripts/config/hdri.js` |
| Load + PMREM | `scripts/render/EnvironmentController.js` |
| Material env application | `scripts/render/MaterialController.js` → `updateMaterialsEnvironment()` |
| HDRI bake script | `scripts/encodeHdriPresets.py` |
| Custom upload UI | Studio tab → HDRI grid → upload button |
| In-app blurb (partial) | `index.html` → Info → Feature FAQ → “HDRI (Environment)” |

### Default state

- `hdriStrength`: **2** (`scripts/StateStore.js`)
- `autoExposure`: **false**
- Tone mapping: **ACES Filmic** (post-processing pass, not on renderer)

### Renderer note

Renderer uses `NoToneMapping`; ACES runs in the post stack (`PostProcessingPipeline.js`). Built-in JPEGs were baked with a matching ACES Filmic curve so environment + grade feel cohesive.

---

## Future work

Planned (not implemented in this doc):

1. **Extended FAQ page** (`/faq/` or similar) — scannable entries for HDRI formats, custom upload persistence, GLB vs other formats
2. **In-app link** on HDRI upload control → FAQ anchor `#hdri-environments`
3. **Info tab** Quick Nav → “Help & FAQ”
4. **Marketing FAQ** — one short “Why JPG presets if you support EXR?” + link to full page
5. Optional: **`bakeOpenHdri.mjs`** CLI mirroring `encodeHdriPresets.py` for batch EXR → graded JPG

---

## Support snippets (copy-paste)

**Short:** Built-in environments are pre-graded JPEGs tuned for GLB viewing. EXR loads correctly but is raw HDR — try lower HDRI strength (0.3–0.8), more blur, or upload a tone-mapped JPG instead.

**Medium:** Orby’s presets aren’t true HDR files; they’re baked 4K JPEGs with ACES tone mapping and per-scene exposure. Custom EXR from OpenHDRI is scene-referred linear HDR, so sun hotspots and default strength 2 often look harsh on PBR models. That’s a grading/intensity fit issue, not a broken loader. Pre-bake EXR → JPG or reduce intensity for best results.

---

*Last updated: 2026-05-24 — compiled from internal design review; align with product before publishing as public FAQ.*
