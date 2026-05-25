# Assets License

## HDRI Environment Maps

The HDRI environment maps located in `assets/hdris/` are **NOT** included in the MIT license for this project.

These HDRI files are purchased assets with their own licensing terms. They are provided in this repository for demonstration purposes only and may not be redistributed, modified, or used commercially without proper licensing from the original creator.

**If you wish to use Orby with HDRI environments, you must:**

1. **Purchase your own HDRI maps** from the original creator (e.g., [Maxime Roz](https://www.maxroz.com/hdri))
2. **Place them in the `assets/hdris/` directory** with the expected filenames
3. **Ensure you have proper licensing** for any HDRI maps you use

The HDRI files in this repository are excluded from the MIT license and are subject to their original creator's terms of use.

## Marketing 3D models and renders

Homepage marketing stills, turntable frame sequences (`assets/marketing/…`), and PNG cutouts are **renders** made in Orby from **third-party 3D models** (Sketchfab, Meshy, vecarz.com, and similar sources).

Those source models are **not** owned by Orby and are **not** covered by this repository’s MIT License. Each creator’s terms apply (often CC Attribution or platform-specific licenses). See **[Credits](credits/)** on the site (or `credits/index.html`) for authors, sources, and usage notes.

Do not assume you may redistribute raw meshes or marketing captures unless your download license explicitly allows it.

## Fab / Megascans / Quixel library meshes

**Do not commit** environment or surface meshes downloaded from [Fab](https://www.fab.com/), Megascans, or Quixel to this repository. Their licenses are tied to your Epic/account download and **do not permit** redistributing the raw `.glb` / `.uasset` files in a public GitHub project.

If you need demo geometry locally, keep it outside the repo (for example under `TEMP/`, which is gitignored) or use models whose license explicitly allows redistribution (and document them on the [Credits](credits/) page).

## Other Assets

Icons, UI art, Lottie, and Orby-original imagery are included in the MIT license unless otherwise specified. Third-party marketing meshes and purchased HDRIs are excluded as described above.

## Typeface: Mattone

`assets/fonts/Mattone-Bold.ttf` and `assets/fonts/Mattone-Regular.woff2` are sourced from [Collletttivo](https://www.collletttivo.it/), and are licensed under the SIL Open Font License 1.1 (OFL).

- Upstream license copy: `assets/fonts/Mattone-LICENSE.txt`
- Original source package (local import path used): `~/Fonts/mattone-main/`

## Typeface: Geist

UI fonts `assets/fonts/Geist-Light.woff2`, `assets/fonts/Geist-Regular.woff2`, and `assets/fonts/GeistMono-Light.woff2` are from [Geist](https://vercel.com/font) by Vercel, licensed under the SIL Open Font License 1.1 (OFL).

- Upstream license copy: `assets/fonts/Geist-OFL.txt`

---

**Note**: If you are forking or cloning this repository, you should remove the HDRI files from `assets/hdris/` and replace them with your own licensed HDRI maps, or the application will not function correctly with HDRI environments.

