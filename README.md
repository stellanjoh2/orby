# Orby

<div align="center">

**A completely free, zero-install, drag-and-drop 3D model viewer that makes any model look stunning in seconds.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Browser](https://img.shields.io/badge/Browser-Chrome%20%7C%20Firefox%20%7C%20Safari%20%7C%20Edge-blue)](https://github.com/stellanjoh2/orby)
[![Version](https://img.shields.io/badge/Version-0.5.62-brightgreen)](https://github.com/stellanjoh2/orby)

</div>

---

## ✨ Overview

Orby is a professional-grade 3D model viewer that runs entirely in your browser. Perfect for **AI-generated 3D** (Meshy, Tripo, Luma, CSM, etc.), **game assets**, **product visualization**, and everything in between.

**No accounts, no waiting, no uploads**—just drop your file and get a full artist-grade studio with HDR environments, real depth of field, selective bloom, film grain, tonemapping, 3-point lighting, and pro controls that react instantly.

### 🎯 Key Highlights

- ⚡ **Instant drag-and-drop loading** for your local files
- 🎬 **Full cinematic post-processing**: selective bloom, depth of field, film grain, chromatic aberration, professional tonemapping
- 🌍 **HDR environments** with blur, rotation, and intensity controls
- 💡 **Custom 3-point studio lighting** that blends seamlessly with image-based lighting
- 🎨 **Real-time material controls**: brightness, metalness, roughness, emissive glow
- 📊 **Exposure histogram** with overexposure warnings
- 🎥 **Auto-orbit camera** for screensaver-style presentations
- 🔄 **Scene settings import/export** - save and share your setups
- 🎭 **Multiple display modes**: Shaded, Unlit, Clay, Wireframe with overlay options
- 🎮 **Full gamepad support** for console-like experience
- 📱 **100% client-side** – runs completely in your browser
- 🔒 **Zero uploads, zero servers**, zero cloud storage
- 🚫 **No accounts**, no login, no cookies, no analytics, no tracking

---

## 🚀 Quick Start

1. **Clone or download** this repository
   ```bash
   git clone https://github.com/stellanjoh2/orby.git
   cd orby
   ```

2. **Open** `index.html` in a modern web browser
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve
   
   # Or simply open index.html directly
   ```

3. **Drop** your 3D model file onto the canvas

4. **Start** customizing!

No build step, no installation, no dependencies to install. Just open and use.

---

## 📋 Supported File Formats

- **GLB/GLTF** (`.glb`, `.gltf`) - **Primary format** - Recommended and most thoroughly tested. Supports animations, materials, and textures
- **OBJ** (`.obj`) - Wavefront 3D object format (basic support)
- **FBX** (`.fbx`) - Autodesk 3D format (basic support)
- **STL** (`.stl`) - Stereolithography format (basic support)
- **USD/USDZ** (`.usd`, `.usdz`) - Universal Scene Description format (basic support)

**Note**: While other formats can be loaded, Orby is primarily tested and optimized for `.glb` files. For the best experience and feature support, use GLB/GLTF format.

Perfect for models exported from:
- **AI-generated 3D**: Meshy, Tripo, Luma, CSM, Rodin, etc.
- **3D Software**: Blender, Maya, 3ds Max, Cinema 4D, Houdini
- **Game Engines**: Unity, Unreal Engine, Godot
- **Any standard 3D modeling software**

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
| Toggle Move widget | `W` | Position gizmo |
| Toggle Rotate widget | `E` | Rotation gizmo |
| Toggle Scale widget | `Q` | Scale gizmo |
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
| Toggle podium | `P` |
| Toggle HDRI background | `B` |
| Toggle auto-rotate | `A` |
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
| Toggle auto-rotate | **Cross / A** |
| Cycle render modes (Clay / Wireframe / Unlit) | **Circle / B** |
| Reset camera framing | **Square / X** |
| Toggle UI visibility | **Triangle / Y** |
| Show HUD/UI overlay | **Options / Menu** |
| Cycle shading modes | **Share / View** |

---

## 🎨 Features in Detail

### Post-Processing Effects

#### Bloom
Selective bloom with customizable threshold, strength, radius, and tint. Adds a glowing, dreamy effect to bright areas.

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

### Lighting

#### HDRI Environment
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
- **Brightness** - Makes your model lighter or darker
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

#### Podium
Customizable platform for product presentations:
- **Color** - Customizable podium color
- **Scale** - Adjust podium size
- **Position** - Vertical position control
- **Snap to Bottom** - Automatically position at model bottom

#### Grid
Ground grid for alignment and perspective:
- **Color** - Customizable grid color
- **Opacity** - Grid visibility control
- **Scale** - Grid cell size
- **Position** - Vertical position control
- **Snap to Bottom** - Automatically position at model bottom

#### Background
HDRI background controls:
- **Toggle** - Show/hide HDRI background
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

#### Load Scene
Import scene settings from JSON:
- Paste your scene settings JSON
- Instantly apply all settings at once
- Restore complete scene configurations

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
- **`GroundController.js`** - Ground plane, podium, and grid
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

Orby is **100% client-side** and **completely private**:

- ✅ **Zero uploads** - All processing happens in your browser
- ✅ **Zero servers** - No backend, no cloud storage
- ✅ **No accounts** - No login required
- ✅ **No tracking** - No analytics, no cookies
- ✅ **No data collection** - Your files never leave your device
- ✅ **Close the tab** - Your model is instantly and permanently gone

Your privacy is guaranteed. No one can ever access your files.

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

⚠️ **Orby is not optimized for mobile devices.** While it may work on some mobile browsers, the experience is designed for desktop use. For the best experience, please use a desktop browser.

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

- **Transparency issues**: Some models with transparent materials may have rendering or sorting issues. This is a known limitation being worked on.
- Some complex models with unusual material setups may not render perfectly.
- Models with very large textures may take longer to load.
- Certain GLTF extensions may not be fully supported.
- **Format support**: While multiple formats are supported, `.glb` files are the primary tested format. Other formats (OBJ, FBX, STL, USD) may have limited feature support or compatibility issues.

### Browser-Specific Issues

- **Safari**: Some advanced WebGL features may have limited support.
- **Firefox**: Occasional rendering differences in post-processing effects.

---

## 🛠️ Development

### Project Structure

```
orby/
├── assets/
│   ├── animations/      # Lottie animation files
│   ├── hdris/           # HDRI environment maps
│   ├── icons/           # Icons and logos
│   ├── images/          # Texture assets and logotypes
│   └── 3D-assets/       # Test 3D models
├── scripts/
│   ├── config/          # Configuration files
│   ├── input/           # Input controllers
│   ├── render/          # Render controllers
│   ├── scene/           # Scene management
│   ├── settings/        # Settings management
│   ├── shaders/         # GLSL shader files
│   ├── ui/              # UI controllers
│   └── utils/           # Utility functions
├── index.html           # Main HTML file
├── styles.css           # Stylesheet
├── VERSION              # Version file
└── README.md            # This file
```

### Key Technologies

- **Three.js** - 3D rendering engine
- **GSAP** - Animation library
- **Font Awesome** - Icon library
- **Lottie Web** - SVG animation library

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/stellanjoh2/orby.git
   cd orby
   ```

2. Open `index.html` in a web browser:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve
   
   # Or simply open index.html directly
   ```

3. Navigate to `http://localhost:8000` (if using a server)

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
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
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

---

## 🙏 Credits

Orby is built with the help of amazing open-source projects and contributors:

- **Hendrik Mans** — Lens Dirt shader inspiration ([gist](https://gist.github.com/hmans/550390e62cd1a9678bfd2cda7b612985))
- **Anderson Mancini (ektogamat)** — Lens flare implementation ([repo](https://github.com/ektogamat/lensflare-threejs-vanilla))
- **Maxime Roz** — HDRI maps ([website](https://www.maxroz.com/hdri))
- **Three.js contributors** — Core rendering, loaders, post-processing utilities
- **GSAP** — Animation library ([website](https://greensock.com/gsap/))
- **Font Awesome** — Icon library ([website](https://fontawesome.com/))
- **Lottie Web** — SVG animation library

---

## 🐛 Troubleshooting

### Model won't load

- Check that the file format is supported (`.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.usd`, `.usdz`)
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
- **Transparency issues**: If transparent materials aren't rendering correctly, this is a known limitation. Try switching display modes or adjusting material settings.
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

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for planned improvements and features.

Current priorities:
- Improved window resizing handling
- Enhanced mobile support
- Additional HDRI environments
- More post-processing effects
- Performance optimizations

---

## 📧 Contact

For issues, questions, or suggestions, please open an issue on [GitHub](https://github.com/stellanjoh2/orby/issues).

---

<div align="center">

**Made with ❤️ for the 3D community**

[⭐ Star on GitHub](https://github.com/stellanjoh2/orby) · [🐛 Report Bug](https://github.com/stellanjoh2/orby/issues) · [💡 Request Feature](https://github.com/stellanjoh2/orby/issues)

</div>
