# Orby

<div align="center">

**A completely free, zero-install, drag-and-drop 3D model viewer that makes any model look stunning in seconds.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Browser](https://img.shields.io/badge/Browser-Chrome%20%7C%20Firefox%20%7C%20Safari%20%7C%20Edge-blue)](https://github.com/stellanjoh2/orby)

</div>

---

## ✨ Overview

Orby is a professional-grade 3D model viewer that runs entirely in your browser. Perfect for **AI-generated 3D** (Meshy, Tripo, Luma, CSM, etc.), **game assets**, **product visualization**, and everything in between.

**No accounts, no waiting, no uploads**—just drop your file and get a full artist-grade studio with HDR environments, real depth of field, selective bloom, film grain, tonemapping, 3-point lighting, and pro controls that react instantly.

### 🎯 Key Features

- **Instant drag-and-drop loading** for your local files
- **Full cinematic post-processing**: selective bloom, depth of field, film grain, chromatic aberration, professional tonemapping
- **HDR environments** with blur, rotation, and intensity controls
- **Custom 3-point studio lighting** that blends seamlessly with image-based lighting
- **Real-time sliders** for exposure, FOV, color grading, and more
- **Supports** `.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.usd`, and `.usdz` files
- **100% client-side** – runs completely in your browser
- **Zero uploads, zero servers**, zero cloud storage
- **No accounts**, no login, no cookies, no analytics, no tracking

---

## 🚀 Quick Start

1. **Clone or download** this repository
2. **Open** `index.html` in a modern web browser
3. **Drop** your 3D model file onto the canvas
4. **Start** customizing!

No build step, no installation, no dependencies to install. Just open and use.

---

## 📋 Supported File Formats

- **GLB/GLTF** (`.glb`, `.gltf`) - Recommended format
- **OBJ** (`.obj`)
- **FBX** (`.fbx`)
- **STL** (`.stl`)
- **USD/USDZ** (`.usd`, `.usdz`)

Perfect for models exported from:
- Meshy, Tripo, Luma, CSM (AI-generated 3D)
- Blender, Maya, 3ds Max
- Unity, Unreal Engine
- Any standard 3D modeling software

---

## ⌨️ Keyboard Shortcuts

### Essential Controls

| Action | Shortcut |
|--------|----------|
| Focus camera on model | `F` |
| Toggle UI visibility | `H` or `V` |
| Cycle through tabs | `Tab` / `Shift+Tab` |
| Close modals/overlays | `Esc` |
| Show keyboard shortcuts | `?` |

### Display Modes

| Mode | Shortcut |
|------|----------|
| Shaded | `1` |
| Wireframe | `2` |
| Clay | `3` |
| Textures | `4` |

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

### Transform Shortcuts

| Action | Shortcut |
|--------|----------|
| Reset scale to 1 | `S` |
| Reset Y offset to 0 | `Y` |
| Reset all transforms | `0` |

### Studio Preset

| Action | Shortcut |
|--------|----------|
| Apply studio preset (HDRI: Meadow, Lights off, Exposure 2.0, etc.) | `X` |

---

## 🖱️ Mouse Controls

| Action | Control |
|--------|---------|
| Orbit camera | **Left Click** + Drag |
| Pan camera | **Right Click** + Drag |
| Zoom | **Scroll Wheel** |
| Rotate lighting/HDRI | **Alt** + **Right Click** + Drag |
| Orbit around focus point | **Alt** + **Left Click** + Drag |

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

## 🏗️ Architecture

Orby is built with a modular, controller-based architecture for maintainability and extensibility.

### Core Components

- **`SceneManager.js`** - Main orchestrator, manages the 3D scene and coordinates all controllers
- **`UIManager.js`** - Handles all UI interactions, updates, and synchronization
- **`StateStore.js`** - Centralized state management with subscription system
- **`EventBus.js`** - Event-driven communication between components

### Render Controllers

- **`CameraController.js`** - Camera and OrbitControls management
- **`PostProcessingPipeline.js`** - Post-processing effects (bloom, DOF, grain, etc.)
- **`ColorAdjustController.js`** - Color grading and white balance
- **`LightsController.js`** - 3-point lighting system
- **`EnvironmentController.js`** - HDRI loading and environment mapping
- **`HdriMoodController.js`** - HDRI mood/atmosphere settings
- **`MaterialController.js`** - Material and shading system
- **`LensFlareController.js`** - Lens flare effects
- **`LensDirtController.js`** - Lens dirt post-processing
- **`AutoExposureController.js`** - Automatic exposure adjustment

### Scene Controllers

- **`ModelLoader.js`** - Model loading and parsing (GLB, GLTF, OBJ, FBX, STL, USD)
- **`AnimationController.js`** - Animation playback and scrubbing
- **`TransformController.js`** - Model transforms (scale, position, rotation)
- **`GroundController.js`** - Ground plane, podium, and grid
- **`MeshDiagnosticsController.js`** - Mesh diagnostics and helpers

### Input

- **`GamepadController.js`** - Gamepad input handling and mapping

### Utilities

- **`constants.js`** - Centralized constants and configuration
- **`config/hdri.js`** - HDRI preset definitions and moods
- **`utils/timeFormatter.js`** - Time formatting utilities
- **`shaders/index.js`** - Shader definitions and exports

---

## 🎨 Features in Detail

### Post-Processing Effects

- **Bloom** - Selective bloom with customizable threshold, strength, radius, and tint
- **Depth of Field** - Real bokeh depth of field with focus, aperture, and blur controls
- **Film Grain** - Customizable grain intensity and color tint
- **Chromatic Aberration** - RGB channel separation with offset and strength
- **Lens Dirt** - Screen-space lens dirt effect that responds to scene brightness
- **Tone Mapping** - Multiple algorithms (None, Linear, Reinhard, ACES Filmic)
- **Exposure** - Manual and automatic exposure control
- **Color Grading** - Contrast, saturation, temperature, tint, highlights, shadows

### Lighting

- **HDRI Environment** - 6 built-in HDR environments with rotation, blur, and intensity
- **3-Point Lighting** - Customizable key, fill, rim, and ambient lights
- **Light Indicators** - Visual 3D cone indicators showing light positions
- **Light Rotation** - Synchronized rotation of HDRI and 3-point lights

### Materials & Shading

- **Multiple Shading Modes** - Shaded, Unlit, Clay, Wireframe
- **Clay Material** - Customizable roughness, metallic, color, and normal map
- **Wireframe Overlay** - Always-on wireframe with color and visibility controls
- **Fresnel Effect** - Edge lighting effect with customizable color, radius, and strength

### Camera

- **Orbit Controls** - Smooth camera orbiting with mouse and gamepad
- **Focus Animation** - Smooth animated camera focus on model (F key)
- **Field of View** - Adjustable FOV slider
- **Auto-Exposure** - Automatic exposure adjustment based on scene brightness

### Ground & Studio

- **Podium** - Customizable podium with color, position, scale, and snap-to-bottom
- **Grid** - Ground grid with color, opacity, scale, and snap-to-bottom
- **Background** - HDRI background with toggle and color controls

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

---

## 🛠️ Development

### Project Structure

```
orby/
├── assets/
│   ├── hdris/          # HDRI environment maps
│   ├── icons/          # Icons and logos
│   └── images/         # Texture assets
├── scripts/
│   ├── config/         # Configuration files
│   ├── input/          # Input controllers
│   ├── render/         # Render controllers
│   ├── shaders/        # GLSL shader files
│   └── utils/          # Utility functions
├── index.html          # Main HTML file
├── styles.css          # Stylesheet
└── README.md           # This file
```

### Key Technologies

- **Three.js** - 3D rendering engine
- **GSAP** - Animation library
- **Lucide Icons** - Icon library

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

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Credits

Orby is built with the help of amazing open-source projects and contributors:

- **Hendrik Mans** — Lens Dirt shader inspiration ([gist](https://gist.github.com/hmans/550390e62cd1a9678bfd2cda7b612985))
- **Anderson Mancini (ektogamat)** — Lens flare implementation ([repo](https://github.com/ektogamat/lensflare-threejs-vanilla))
- **Three.js contributors** — Core rendering, loaders, post-processing utilities
- **GSAP** — Animation library
- **Lucide** — Icon library

---

## 🐛 Troubleshooting

### Model won't load

- Check that the file format is supported (`.glb`, `.gltf`, `.obj`, `.fbx`, `.stl`, `.usd`, `.usdz`)
- Ensure the file isn't corrupted
- Try a different model to verify the viewer is working

### Performance issues

- Large models may cause performance issues
- Try disabling post-processing effects
- Reduce HDRI resolution
- Close other browser tabs

### Gamepad not working

- Ensure your gamepad is connected before opening Orby
- Check browser compatibility (Gamepad API support)
- Try reconnecting the gamepad

### UI not responding

- Refresh the page
- Check browser console for errors
- Ensure JavaScript is enabled

---

## 📚 Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [WebGL Fundamentals](https://webglfundamentals.org/)
- [GLTF Specification](https://www.khronos.org/gltf/)

---

## 🗺️ Roadmap

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for planned improvements and features.

---

## 📧 Contact

For issues, questions, or suggestions, please open an issue on [GitHub](https://github.com/stellanjoh2/orby/issues).

---

<div align="center">

**Made with ❤️ for the 3D community**

[⭐ Star on GitHub](https://github.com/stellanjoh2/orby) · [🐛 Report Bug](https://github.com/stellanjoh2/orby/issues) · [💡 Request Feature](https://github.com/stellanjoh2/orby/issues)

</div>

