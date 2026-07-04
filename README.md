# Orby

<div align="center">

**A free browser-based 3D viewer and virtual studio. Drop a GLB or SVG, light it, export it — no account, no upload.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Website](https://img.shields.io/badge/Website-orby.studio-brightgreen)](https://orby.studio)
[![Browser](https://img.shields.io/badge/Browser-Chrome%20%7C%20Firefox%20%7C%20Safari%20%7C%20Edge-blue)](https://github.com/stellanjoh2/orby)
[![Version](https://img.shields.io/badge/Version-0.5.895-brightgreen)](https://github.com/stellanjoh2/orby)

</div>

---

## ✨ Overview

Orby is a free browser-based 3D viewer and virtual studio that runs in your browser. Built for **AI-generated 3D** (Meshy, Tripo, Luma, CSM, etc.), **game assets**, **product visualization**, logos, and client presentations.

**No account, no upload** — drop your file and get full studio controls: HDR environments, Look Filter presets, depth of field, selective & anamorphic bloom, film grain, tonemapping, 3-point lighting, Shader Lab, and real-time grading.

### 🎯 Key Highlights

- ⚡ **Instant drag-and-drop loading** for your local files
- 🧊 **SVG extrude** — flat vector artwork to 3D meshes with per-color depth
- 🔤 **Font extrude** — live 3D text with custom fonts, bevels, and reveal animations
- 🎬 **Full cinematic post-processing**: selective bloom, depth of field, film grain, chromatic aberration, professional tonemapping
- 🌍 **HDR environments** with blur, rotation, intensity controls, and custom `.hdr` / `.exr` upload
- 💡 **Custom 3-point studio lighting** that blends with image-based lighting
- 🎨 **Real-time material controls**: brightness (up to 3.0), metalness, roughness, emissive glow
- 📊 **Exposure histogram** with overexposure warnings
- 🎥 **Auto-orbit camera** and **turntable export** (MP4 or PNG sequence)
- 🔄 **Scene settings import/export** and **`.orby` scene files** (settings + embedded model)
- 🎭 **Multiple display modes**: Shaded, Unlit, Clay, Wireframe with overlay options
- 🎮 **Full gamepad support** for console-like experience
- 📱 **Touch-friendly [Orby Mobile](mobile/) preview** for phone workflows
- 🔒 **Your files stay local** — all 3D processing runs in your browser; nothing is uploaded
- 🚫 **No accounts**, no login, no cookies, no ad pixels, no personal identifiers

---

## 🚀 Quick Start

**Try it live:** [orby.studio](https://orby.studio) — drop a file and start customizing.

**Run from source** (no build required for local development):

1. **Clone** this repository
   ```bash
   git clone https://github.com/stellanjoh2/orby.git
   cd orby
   ```

2. **Serve** the repo root (ES modules need a local server)
   ```bash
   npm run dev
   # or: python3 -m http.server 8000
   ```

3. **Open** `http://localhost:8000` and drop a GLB, SVG, or other supported file onto the canvas.

For production builds and deployment, see [Development](#-development) and [BUILD.md](BUILD.md).

---

## 📋 Supported File Formats

- **GLB/GLTF** (`.glb`, `.gltf`) — **Primary format**. Recommended and most thoroughly tested. Supports animations, materials, and textures
- **SVG** (`.svg`) — Extrude filled paths into 3D meshes (Object → SVG Extrude)
- **Orby scene** (`.orby`) — Saved scene with settings and embedded model
- **OBJ** (`.obj`) — Wavefront 3D object format (basic support)
- **FBX** (`.fbx`) — Autodesk 3D format (basic support)
- **STL** (`.stl`) — Stereolithography format (basic support)

**Note**: Orby is built and tested around `.glb` / `.gltf` and `.svg` extrusion. OBJ, FBX, and STL load with basic support; feature coverage varies by exporter. For the best experience, export as GLB.

**Experimental**: `.usdz` may load text-USDA stages only (binary USDC — the usual Apple/exporter default — often shows up empty). Barely tested; prefer GLB.

Perfect for models exported from:
- **AI-generated 3D**: Meshy, Tripo, Luma, CSM, Rodin, etc.
- **3D Software**: Blender, Maya, 3ds Max, Cinema 4D, Houdini
- **Game Engines**: Unity, Unreal Engine, Godot
- **Any standard 3D modeling software**

---

## 🧰 Tech Stack

Orby is **vanilla ES modules** — no React/Vue framework. Full library attributions and licenses live on the **[Credits page](credits/)**.

### Runtime (browser)

| Layer | Technology |
|-------|------------|
| **Rendering** | [Three.js](https://threejs.org/) 0.167 — WebGL 2, loaders (GLB, FBX, OBJ, STL, USDZ), OrbitControls |
| **Post-processing** | [postprocessing](https://github.com/pmndrs/postprocessing) (pmndrs) — bloom, DOF, light rays, composer pipeline |
| **Ambient occlusion** | [N8AO](https://github.com/N8python/n8ao) — screen-space AO |
| **Animation** | [GSAP](https://greensock.com/gsap/) — UI motion and panel transitions |
| **Vector animation** | [Lottie Web](https://github.com/airbnb/lottie-web) — SVG logotype animations |
| **Icons** | [Font Awesome](https://fontawesome.com/) — subset build |
| **Extrude geometry** | [cdt2d](https://www.npmjs.com/package/cdt2d) + Earcut — SVG & font cap triangulation |
| **Export** | [JSZip](https://stuk.github.io/jszip/) — turntable PNG sequences; [ImageTracer.js](https://github.com/jankovicsandras/imagetracerjs) — raster utilities |
| **Typography** | Mattone (Collletttivo), Geist (Vercel) |

### Tooling & deploy

| Layer | Technology |
|-------|------------|
| **Bundler** | [esbuild](https://esbuild.github.io/) — production bundle (`npm run build` → `dist/`) |
| **Tests** | Node test runner + [Playwright](https://playwright.dev/) e2e |
| **Hosting** | [Vercel](https://vercel.com/) (primary) + [GitHub Pages](https://pages.github.com/) via GitHub Actions |
| **API** | Vercel serverless — anonymous stats, bug reports; [Upstash Redis](https://upstash.com/) for rate limiting |

---

## ⌨️ Keyboard Shortcuts

### Essential Controls

| Action | Shortcut |
|--------|----------|
| Focus camera on model | `F` |
| Toggle UI visibility | `V` |
| Cycle through tabs | `Tab` / `Shift+Tab` |
| Exit auto-orbit | `Esc` |
| Apply studio preset | `X` |

### Display Modes

| Mode | Shortcut | Description |
|------|----------|-------------|
| Shaded | `1` | Full lighting and materials |
| Unlit | `2` | Textures without lighting |
| Clay | `3` | Single-color material view |
| Wireframe | `4` | Edge-only view |

### Transform Widgets

| Action | Shortcut | Description |
|--------|----------|-------------|
| Select (exit transform tools) | `Q` | Hides move / rotate / scale gizmos |
| Move (translate) | `W` | Position gizmo |
| Rotate | `E` | Rotation gizmo |
| Scale | `R` | Scale gizmo (same as Blender) |
| Reset scale to 1 | `S` | Reset scale |
| Reset position offsets | `Y` | Reset X/Y/Z position |
| Reset all transforms | `0` | Reset scale, position, rotation |

### Animation Controls

| Action | Shortcut |
|--------|----------|
| Play/Pause animation | `Space` |
| Scrub animation backward | `←` |
| Scrub animation forward | `→` |

### Scene Controls

| Action | Shortcut |
|--------|----------|
| Toggle grid | `G` |
| Toggle 3-point lighting | `L` |
| Toggle base (solid ground) | `P` |
| Toggle render backdrop | `B` |
| Toggle turntable | `A` |
| Cycle HDRI presets | `[` / `]` |

---

## 🖱️ Mouse Controls

| Action | Control |
|--------|---------|
| Orbit camera | **Left Click** + Drag |
| Pan camera | **Right Click** + Drag |
| Zoom | **Scroll Wheel** |
| Rotate lighting/HDRI | **Alt** + **Right Click** + Drag |
| Adjust light height | **Alt** + **Right Click** + Drag (up/down) |
| Focus camera on model center | **Alt** + **Left Click** |
| Select mesh / Show rotate widget | **Click** on mesh |
| Deselect mesh / Hide widgets | **Click** outside mesh |

---

## 🎮 Gamepad Controls

Orby fully supports gamepad input for a console-like experience.

### Camera Controls

| Action | Control |
|--------|---------|
| Zoom / Dolly | **Left Stick** (vertical) |
| Precision zoom | **L2 / LT** (zoom out) · **R2 / RT** (zoom in) |
| Orbit camera | **Right Stick** |
| Pan camera | *Currently disabled* |

### Navigation

| Action | Control |
|--------|---------|
| Cycle HDRI presets | **L1 / LB** (previous) · **R1 / RB** (next) |
| Adjust exposure | **D-pad Up** (increase) · **D-pad Down** (decrease) |
| Adjust HDRI intensity | **D-pad Left** (decrease) · **D-pad Right** (increase) |

### Actions

| Action | Control |
|--------|---------|
| Toggle turntable | **Cross / A** |
| Cycle render modes (Clay / Wireframe / Unlit) | **Circle / B** |
| Reset camera framing | **Square / X** |
| Toggle UI visibility | **Triangle / Y** |
| Show HUD/UI overlay | **Options / Menu** |
| Cycle shading modes | **Share / View** |

---

## 🎨 Features in Detail

### Post-Processing Effects

#### Bloom
Selective bloom with customizable threshold, strength, radius, and tint. Highlights bright areas with a controlled glow.

#### Depth of Field
Real bokeh depth of field with focus distance, aperture, and blur controls. Blurs the background while keeping your model sharp, like a camera lens.

#### Film Grain
Customizable grain intensity and color tint. Adds texture for a cinematic feel.

#### Chromatic Aberration
RGB channel separation with offset and strength controls. Creates a stylized color separation effect.

#### Lens Dirt
Screen-space lens dirt effect that responds to scene brightness. Simulates smudges on a camera lens for atmosphere.

#### Lens Flare
Realistic light flares from bright sources with customizable rotation, height, color, and quality settings.

#### Tone Mapping
Multiple algorithms:
- **None** - No tone mapping
- **Linear** - Simple linear mapping
- **Reinhard** - Balanced tone mapping
- **ACES Filmic** - Cinematic film-like tone mapping

#### Exposure
Manual and automatic exposure control. The histogram shows brightness distribution and warns of overexposure.

#### Color Grading
Professional color correction tools:
- **Contrast** - Adjust overall contrast
- **Saturation** - Control color intensity
- **Temperature** - Warm/cool color balance
- **Tint** - Green/magenta shift
- **Highlights** - Bright area adjustment
- **Shadows** - Dark area adjustment
- **Clarity** - Local contrast
- **Fade** - Overall desaturation
- **Sharpness** - Edge enhancement  
> Copy Scene includes clarity, fade, and sharpness along with other camera settings.

### Lighting

#### HDRI Environment
Built-in environments plus custom upload (2:1 equirectangular `.hdr`, `.exr`, `.jpg`, or `.png` — session-only; re-upload after refresh):

6 built-in HDR environments with rotation, blur, and intensity controls:
- **Meadow** - Outdoor natural lighting
- **Noir Studio** - Dark studio environment
- **Luminous Sky** - Bright sky environment
- **Sunset Cove** - Warm sunset lighting
- **Steel Lab** - Industrial environment
- **Cyberpunk** - Neon futuristic setting

The HDRI acts as both a light source and a background, providing realistic lighting and reflections.

#### 3-Point Lighting
Professional lighting setup with four lights:
- **Key Light** - Main light source
- **Fill Light** - Softens shadows
- **Rim Light** - Separates object from background
- **Ambient Light** - Overall scene brightness

Each light has customizable:
- Color
- Intensity
- Height position
- Rotation angle
- Shadow casting (on/off)

Additional controls:
- **Master Intensity** - Global light multiplier
- **Light Rotation** - Synchronized rotation of all lights
- **Light Height** - Adjust all light heights together
- **Auto-Rotate** - Automatic light rotation
- **Light Indicators** - Visual 3D cone indicators showing light positions

### Materials & Shading

#### Multiple Shading Modes
- **Shaded** - Shows your model with realistic lighting and materials
- **Unlit** - Displays textures and colors without lighting effects
- **Clay** - Renders in a single color, great for focusing on shape and form
- **Wireframe** - Shows only the edges and structure

#### Material Controls
Real-time material adjustments:
- **Brightness** - Makes your model lighter or darker (0–3 range)
- **Metalness** - Controls how metallic the surface looks (0 = plastic, 1 = chrome)
- **Roughness** - Adjusts surface smoothness (0 = mirror-like, 1 = matte)
- **Emissive** - Adds glowing light to materials (0-2 range), perfect for sci-fi effects, neon signs, or any glowing elements

#### Clay Material
Customizable clay rendering:
- Color picker
- Normal map toggle (for surface detail)

#### Wireframe Overlay
Advanced wireframe options:
- **Always On** - Show wireframe overlay on all display modes
- **Only Visible Faces** - Hide wireframe lines on back-facing surfaces
- **Hide Mesh** - Hide underlying mesh while keeping wireframe visible
- **Color** - Customizable wireframe color  
> Note: Normals helpers were removed from the UI; wireframe overlay is the diagnostics view.

#### Fresnel Effect
Edge lighting effect with customizable:
- **Color** - Edge glow color
- **Radius** - Edge detection radius
- **Strength** - Effect intensity

Adds a colored glow around the edges of your model when viewed at an angle, great for making objects pop.

### Camera

#### Orbit Controls
Smooth camera orbiting with mouse and gamepad support. Click and drag to rotate around your model.

#### Focus Animation
Smooth animated camera focus on model center (F key). Automatically frames your model perfectly.

#### Field of View
Adjustable FOV slider for wide-angle or telephoto effects.

#### Auto-Exposure
Automatic exposure adjustment based on scene brightness. Can be enabled/disabled with sensitivity controls.

#### Auto-Orbit
Automatically orbits the camera around your model with smooth multi-axis movement. Perfect for screensaver-style presentations.
- **Off** - Manual camera control
- **Slow** - Gentle orbiting speed
- **Fast** - Faster orbiting speed

Press `Esc` to exit auto-orbit mode.

#### Histogram
Real-time exposure histogram showing brightness distribution:
- Visual graph of pixel brightness levels
- Orange/red warnings when overexposed
- Helps identify if render is too dark, too bright, or overexposed
- Can be toggled on/off

### Ground & Studio

#### Base
Customizable platform for product presentations:
- **Color** - Customizable base color
- **Scale** - Adjust base size
- **Position** - Vertical position control
- **Snap to Mesh** - Automatically position at mesh base

#### Grid
Ground grid for alignment and perspective:
- **Color** - Customizable grid color
- **Opacity** - Grid visibility control
- **Scale** - Grid cell size
- **Position** - Vertical position control
- **Snap to Mesh** - Automatically position at mesh base

#### Background
Render backdrop (HDRI):
- **Render Backdrop** - When on (default), the environment image is drawn behind the scene. When off, only the solid background color shows; HDRI still lights the scene (`B` toggles). Turn HDRI off to edit that background color in the Studio shelf.
- **Receive Shadows + AO** - Invisible floor at Ground Y: directional shadow maps and screen-space AO contact on the HDRI (off by default; needs Render Backdrop).
- **Color** - Background color override

### Scene Settings

#### Copy Scene
Export all your settings as JSON:
- Lighting configuration
- Camera position and angle
- Post-processing effects
- Material settings
- Object transforms (scale, position, rotation)
- HDRI settings
- All visual settings in one JSON string

Perfect for saving your favorite setups or sharing them with others.

#### Paste Scene Settings
Import scene settings from JSON (paste into the dialog):
- Paste your scene settings JSON
- Instantly apply all settings at once
- Restore complete scene configurations

#### Save / Load `.orby` Scene
Export a `.orby` file with your full settings **and** embedded model — distinct from copy/paste JSON. Drop a `.orby` file on the landing page to restore everything in one step.

### Creation & Export

#### SVG Extrude
Drop an SVG to extrude filled paths into 3D geometry. Per-color depth layers, surface presets, and GLB export. See [Support → SVG extrude](support/#svg-extrude).

#### Font Extrude
Type live 3D text via **Object → Generate from Font** — custom fonts, tracking, bevels, and reveal animations. Separate engine from SVG extrude.

#### Exports
- **Still image** — PNG/JPEG at configurable resolution
- **Turntable** — MP4 video or numbered PNG sequence (zip)
- **GLB** — export extruded SVG/font geometry

---

## 🏗️ Architecture

Orby is built with a modular, controller-based architecture for maintainability and extensibility.

### Core Components

- **`SceneManager.js`** - Main orchestrator, manages the 3D scene and coordinates all controllers
- **`UIManager.js`** - Handles all UI interactions, updates, and synchronization
- **`StateStore.js`** - Centralized state management with subscription system
- **`EventBus.js`** - Event-driven communication between components

### Render Controllers

- **`CameraController.js`** - Camera and OrbitControls management, auto-orbit functionality
- **`PostProcessingPipeline.js`** - Post-processing effects (bloom, DOF, grain, etc.)
- **`ColorAdjustController.js`** - Color grading and white balance
- **`LightsController.js`** - 3-point lighting system
- **`EnvironmentController.js`** - HDRI loading and environment mapping
- **`HdriMoodController.js`** - HDRI mood/atmosphere settings
- **`MaterialController.js`** - Material and shading system, Fresnel effects
- **`LensFlareController.js`** - Lens flare effects
- **`LensDirtController.js`** - Lens dirt post-processing
- **`AutoExposureController.js`** - Automatic exposure adjustment
- **`HistogramController.js`** - Exposure histogram visualization
- **`BackgroundController.js`** - Background rendering and controls

### Scene Controllers

- **`ModelLoader.js`** - Model loading and parsing (GLB, GLTF, OBJ, FBX, STL, USD)
- **`AnimationController.js`** - Animation playback and scrubbing
- **`TransformController.js`** - Model transforms (scale, position, rotation)
- **`GroundController.js`** - Ground plane, base platform, and grid
- **`MeshDiagnosticsController.js`** - Mesh diagnostics and helpers
- **`SceneObjectsController.js`** - Multi-object scene management

### Input Controllers

- **`GamepadController.js`** - Gamepad input handling and mapping
- **`GlobalControls.js`** - Global keyboard shortcuts and UI controls
- **`MeshControls.js`** - Mesh-specific controls and widgets
- **`StudioControls.js`** - Studio lighting and environment controls
- **`RenderControls.js`** - Camera and post-processing controls
- **`AnimationControls.js`** - Animation playback controls
- **`ResetControls.js`** - Reset functionality for all settings
- **`StartMenuController.js`** - Start screen and file loading
- **`TooltipController.js`** - Tooltip system for UI elements

### Settings & Utilities

- **`SceneSettingsManager.js`** - Scene settings import/export
- **`constants.js`** - Centralized constants and configuration
- **`config/hdri.js`** - HDRI preset definitions and moods
- **`utils/timeFormatter.js`** - Time formatting utilities
- **`utils/IconLoader.js`** - Icon loading utilities
- **`shaders/`** - GLSL shader files for custom effects

### UI Components

- **`UIHelpers.js`** - UI utility functions
- **`UIManager.js`** - Main UI orchestration and state synchronization

---

## 🔒 Privacy

Orby keeps your 3D work on your device:

- ✅ **No file uploads** — all model loading, lighting, grading, and export run in your browser
- ✅ **No accounts** — no login required
- ✅ **No cookies or ad pixels** — no personal identifiers collected
- ✅ **Close the tab** — your model is instantly and permanently gone from memory

The hosted site sends **anonymous aggregate counters** only (page visits and file-format totals — no filenames, no model data). See the [Privacy Policy](legal/privacy-policy.html) and public [Statistics](stats/) page for details. Bug reports are optional and go through a separate form.

Your 3D files never leave your device.

---

## 🌐 Browser Compatibility

Orby requires a modern browser with WebGL 2.0 support:

- ✅ **Chrome/Edge** 90+
- ✅ **Firefox** 88+
- ✅ **Safari** 14+
- ✅ **Opera** 76+

### Required Features

- WebGL 2.0
- ES6+ JavaScript
- File API
- Drag and Drop API
- Gamepad API (for gamepad support)

### Mobile Support

The full studio is designed for **desktop**. A touch-friendly **[Orby Mobile](mobile/)** preview is available for phone workflows, but the primary experience targets desktop browsers with a keyboard, mouse, or gamepad.

---

## ⚠️ Known Issues & Limitations

### Window Resizing

**Orby is not yet optimized for dynamic window resizing.** If you encounter black borders around the viewer after resizing your browser window:

1. **Refresh your browser** at its current window size:
   - **Mac**: `Cmd+R`
   - **Windows/Linux**: `Ctrl+R`

2. **For optimal experience**: Enter fullscreen mode (using the fullscreen button in the bottom-left corner or browser fullscreen), then refresh.

The canvas size is calculated on page load and doesn't automatically update when the window is resized. This is a known limitation that will be addressed in a future update.

### Performance Considerations

- **Large models** may cause performance issues. Try disabling post-processing effects or reducing HDRI resolution.
- **Multiple heavy effects** running simultaneously (Depth of Field, Bloom, Lens Dirt, Grain, Chromatic Aberration) will impact frame rate.
- **High resolution exports** (2x) require more GPU memory and processing time.

### Model Compatibility

- **Transparent materials**: Overlapping transparent surfaces can still sort imperfectly (a general real-time/WebGL constraint). Orby applies defaults for glass-like naming and exposes **Advanced → Alpha** modes when a GLB needs opaque blend, single-sided rendering, or similar tweaks.
- Some complex models with unusual material setups may not render perfectly.
- Models with very large textures may take longer to load.
- Certain GLTF extensions may not be fully supported.
- **Format support**: While multiple formats are supported, `.glb` files are the primary tested format. OBJ, FBX, and STL may have limited feature support or compatibility issues. USDZ is experimental and largely untested.

### Browser-Specific Issues

- **Safari**: Some advanced WebGL features may have limited support.
- **Firefox**: Occasional rendering differences in post-processing effects.

---

## 🛠️ Development

### Project Structure

```
orby/
├── scripts/             # ES module source — controllers, importers, UI
│   ├── import/          # GLB, SVG, font extrude importers
│   ├── render/          # Camera, post-processing, materials
│   ├── scene/           # Scene loop, animation, transforms
│   └── ui/              # Shelf panels, modals, controls
├── partials/            # HTML partials stitched into index.html
├── assets/              # HDRIs, fonts, icons, 3D test assets
├── about/               # About page
├── support/             # Support & FAQ
├── legal/               # Privacy policy, terms
├── credits/             # Open-source attributions
├── mobile/              # Orby Mobile preview
├── api/                 # Vercel serverless routes (stats, bug reports)
├── e2e/                 # Playwright tests
├── index.html           # Studio entry (source)
├── styles.css           # Studio stylesheet
├── build.js             # esbuild production bundle
├── VERSION              # Release version (canonical)
└── README.md
```

### Running Locally

```bash
git clone https://github.com/stellanjoh2/orby.git
cd orby
npm install          # first time only — hooks, test deps, build tools
npm run dev          # http://localhost:8000
```

Edit files in `scripts/`, `partials/`, and `index.html` directly — changes are instant with the dev server. No build step needed for day-to-day development.

### Production Build

```bash
npm run build        # outputs minified bundle to dist/
npm run preview      # serve dist/ locally
```

See [BUILD.md](BUILD.md) for deployment options (Vercel, GitHub Pages via Actions).

### Tests

```bash
npm test             # unit tests
npm run test:e2e:dimension   # Playwright export checks
```

### Code Style

- ES6+ JavaScript modules
- Class-based architecture
- Event-driven communication
- Modular controller pattern
- Consistent naming conventions

---

## 📝 API Documentation

### EventBus

The `EventBus` handles all inter-component communication:

```javascript
// Subscribe to an event
eventBus.on('mesh:shading', (mode) => {
  console.log('Shading changed to:', mode);
});

// Emit an event
eventBus.emit('mesh:shading', 'clay');

// Unsubscribe
const unsubscribe = eventBus.on('mesh:shading', handler);
unsubscribe();
```

### StateStore

The `StateStore` manages application state:

```javascript
// Get current state
const state = stateStore.getState();

// Set a value
stateStore.set('shading', 'clay');

// Subscribe to changes
stateStore.subscribe((newState) => {
  console.log('State updated:', newState);
});
```

### Window API

Orby exposes a global `window.orby` object for debugging:

```javascript
// Access main components
window.orby.eventBus
window.orby.stateStore
window.orby.ui
window.orby.scene
window.orby.gamepad
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b your-feature-name`)
3. Commit your changes (`git commit -m 'Add feature description'`)
4. Push to the branch (`git push origin your-feature-name`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Add comments for complex logic
- Test your changes in multiple browsers
- Update documentation as needed
- Test with various 3D model formats

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**Important**: The MIT license applies to the source code only. HDRI environment maps in `assets/hdris/` are purchased assets and are **NOT** included in the MIT license. See [ASSETS_LICENSE.md](ASSETS_LICENSE.md) for details. If you fork or clone this repository, you must provide your own licensed HDRI maps.

### Legal Disclaimer

**Personal Project**: Orby is developed independently and is not affiliated with, endorsed by, or connected to any employer or organization. It is free, open-source, and non-commercial. The views and work expressed herein are solely those of the individual author and do not represent any company, employer, or institution.

---

## 🙏 Credits

Full acknowledgements (libraries, fonts, sounds, shaders, licensed HDRIs, and more) live on the **[Credits page](credits/)**.

Highlights include Three.js, GSAP, Lottie Web, N8AO, Font Awesome, JSZip, ImageTracer.js, community lens effects, Maxime Roz HDRIs (licensed separately — see [ASSETS_LICENSE.md](ASSETS_LICENSE.md)), and open fonts from Collletttivo and Vercel.

---

## 🐛 Troubleshooting

### Model won't load

- Check that the file format is supported (`.glb`, `.gltf`, `.svg`, `.orby`, `.obj`, `.fbx`, `.stl`; `.usdz` is experimental)
- Ensure the file isn't corrupted
- Try a different model to verify the viewer is working
- Check browser console for error messages

### Performance issues

- **Large models** may cause performance issues
- Try disabling post-processing effects (especially Depth of Field, Bloom, Lens Dirt)
- Reduce HDRI resolution or disable HDRI background
- Close other browser tabs to free up GPU memory
- Lower export resolution if exporting images

### Black borders after resizing

- **Refresh your browser** at its current window size (`Cmd+R` on Mac, `Ctrl+R` on PC)
- For best results, enter fullscreen mode and then refresh
- This is a known limitation - see [Known Issues](#-known-issues--limitations)

### Gamepad not working

- Ensure your gamepad is connected **before** opening Orby
- Check browser compatibility (Gamepad API support)
- Try reconnecting the gamepad
- Some browsers require user interaction before gamepad input is enabled

### UI not responding

- Refresh the page
- Check browser console for errors
- Ensure JavaScript is enabled
- Try a different browser

### Animation not playing

- Check that your model contains animation data
- Ensure the animation timeline is not at the end
- Try scrubbing the animation manually with arrow keys

### Materials look wrong

- Some models may have unusual material setups that don't render perfectly
- **Transparency / glass**: Use **Advanced → Alpha** if windows, decals, or glass look wrong (solid, popping, or odd sorting). Try other display modes or material sliders if needed.
- Try switching to different shading modes (Shaded, Unlit, Clay)
- Adjust material brightness, metalness, and roughness sliders
- Check if the model has texture files that need to be in the same directory (for OBJ/FBX)
- **For best results**: Use `.glb` format, which has the most complete material and texture support

### Export not working

- Ensure you have a model loaded
- Check browser console for errors
- Try a different export resolution
- Some browsers may block downloads - check browser settings

---

## 📚 Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [WebGL Fundamentals](https://webglfundamentals.org/)
- [GLTF Specification](https://www.khronos.org/gltf/)
- [PBR Materials Guide](https://learnopengl.com/PBR/Theory)

---

## 🗺️ Roadmap

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for longer-term ideas.

Current priorities:
- Improved window resizing handling
- Orby Mobile polish
- Additional HDRI environments
- Performance optimizations

---

## 📧 Contact

For issues, questions, or suggestions, please open an issue on [GitHub](https://github.com/stellanjoh2/orby/issues).

---

<div align="center">

Orby is free and open source (MIT). [orby.studio](https://orby.studio)

[⭐ Star on GitHub](https://github.com/stellanjoh2/orby) · [🐛 Report Bug](https://github.com/stellanjoh2/orby/issues) · [💡 Request Feature](https://github.com/stellanjoh2/orby/issues)

</div>
