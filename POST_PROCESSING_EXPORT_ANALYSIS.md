# Post-Processing Export Analysis

## Current Status
✅ **Basic export works**: Scene renders directly to render target, transparent background, mesh visible
❌ **Post-processing breaks**: When applying FXAA, tone mapping, or other passes, export becomes empty/black

## Root Cause Analysis

### Why Post-Processing Fails

1. **EffectComposer Render Target Management**
   - EffectComposer creates and manages its own internal render targets
   - When we try to replace `composer.renderTarget1` and `renderTarget2`, the composer may:
     - Recreate them internally on `setSize()`
     - Not use them correctly if format/size doesn't match
     - Have internal state that conflicts with our replacements

2. **Alpha Channel Preservation**
   - Post-processing passes may not preserve alpha correctly
   - Many passes (bloom, FXAA, etc.) operate on RGB only
   - When passes ping-pong between render targets, alpha can be lost
   - Our render targets have `alpha: true`, but passes might not respect it

3. **Render Target Format Mismatches**
   - EffectComposer's default render targets may use different formats
   - When we create our own with `alpha: true`, passes might expect different formats
   - Some passes might create their own render targets (like bloom) that don't have alpha

4. **Ping-Pong Rendering Issues**
   - EffectComposer alternates between renderTarget1 and renderTarget2
   - Determining which target has the final output is unreliable
   - The final pass (tone mapping) writes to screen by default, not to our targets

5. **Pass State/Configuration**
   - Passes may have internal state tied to the main composer
   - Uniforms might be configured for the main viewport size, not export size
   - Some passes (like bloom) create their own render targets internally

## Alternative Approaches

### Option 1: Canvas Capture (Recommended)
**How it works:**
1. Render composer normally to canvas (viewport)
2. Read pixels from canvas using `getImageData()` or `readPixels()`
3. Apply to our render target

**Pros:**
- Composer works exactly as it does in viewport (we know this works)
- No need to intercept render targets
- All post-processing automatically included
- Simple and reliable

**Cons:**
- Requires rendering at export size (might be slow for large exports)
- Canvas might not preserve alpha if WebGL context doesn't have it
- Need to ensure canvas has alpha enabled

**Implementation:**
```javascript
// Resize renderer/composer to export size
this.renderer.setSize(exportWidth, exportHeight);
this.composer.setSize(exportWidth, exportHeight);

// Render to canvas (composer does this normally)
this.composer.render();

// Read from canvas
const canvas = this.renderer.domElement;
const ctx = canvas.getContext('2d');
const imageData = ctx.getImageData(0, 0, exportWidth, exportHeight);

// Apply to our render target with alpha
```

### Option 2: Manual Pass Application (Current Attempt - Failed)
**How it works:**
1. Render scene to our render target
2. Create temporary composer
3. Apply passes one by one to our render target

**Why it failed:**
- Passes expect certain render target formats
- Ping-pong rendering doesn't work correctly
- Alpha gets lost in the process
- Passes have internal state that conflicts

**Could work if:**
- We create passes fresh for each export (not reuse existing ones)
- We ensure all render targets have matching formats
- We manually handle alpha preservation in each pass

### Option 3: Two-Pass Rendering
**How it works:**
1. Render scene to render target (get alpha)
2. Render composer to canvas (get post-processing)
3. Composite: Use RGB from canvas, alpha from render target

**Pros:**
- Separates concerns (alpha vs post-processing)
- More control over each aspect

**Cons:**
- Complex compositing
- Need to ensure pixel-perfect alignment
- Two renders (slower)

### Option 4: Custom Export Composer
**How it works:**
1. Create a separate EffectComposer just for export
2. Add all passes fresh (not reuse existing ones)
3. Configure passes specifically for export (alpha-aware)

**Pros:**
- Isolated from main composer
- Can configure passes specifically for export
- Full control over render targets

**Cons:**
- Need to duplicate pass configuration
- More complex setup
- Still need to ensure alpha preservation

### Option 5: Offscreen Canvas
**How it works:**
1. Create an offscreen canvas with WebGL context (alpha enabled)
2. Create renderer for offscreen canvas
3. Render composer to offscreen canvas
4. Read pixels from offscreen canvas

**Pros:**
- Doesn't affect main viewport
- Can ensure alpha is enabled from start
- Clean separation

**Cons:**
- Need to duplicate scene/camera/composer setup
- More memory usage
- Still need to handle alpha correctly

## Recommended Solution: Canvas Capture with Alpha Verification

**✅ Good News:** Renderer already has `alpha: true` and `preserveDrawingBuffer: true` in SceneManager constructor. This means canvas capture should preserve alpha!

**Step-by-step:**
1. ✅ Renderer WebGL context has alpha enabled (verified in SceneManager)
2. Resize renderer/composer to export size
3. Set transparent clear color (`setClearColor(0x000000, 0)`)
4. Render composer normally (to canvas) - this is what works in viewport
5. Read pixels from canvas using `canvas.getContext('2d').getImageData()` or `renderer.readRenderTargetPixels(null, ...)`
6. Apply pixels to our render target for cropping
7. If alpha is lost, fall back to two-pass rendering (RGB from canvas, alpha from direct render)

**Key Implementation Details:**
- Check `renderer.getContext().getParameter(renderer.getContext().ALPHA_BITS)` to verify alpha support
- Use `canvas.getContext('2d').getImageData()` which should preserve alpha
- Or use `renderer.readRenderTargetPixels(null, ...)` to read from default framebuffer
- Test with a simple scene first to verify alpha preservation

## Testing Strategy

1. **Test basic export** (already works ✅)
2. **Test canvas capture** - render composer, read from canvas, verify content
3. **Test alpha preservation** - check if alpha channel is preserved in canvas read
4. **If alpha lost** - implement two-pass rendering (RGB from canvas, alpha from direct render)
5. **Add post-processing incrementally** - start with FXAA only, then tone mapping, then bloom

## Next Steps

1. Implement canvas capture approach
2. Verify alpha preservation
3. If alpha is lost, implement two-pass rendering
4. Test with all post-processing enabled
5. Optimize for performance if needed

