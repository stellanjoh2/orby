# Brand Color System Guide

## Quick Theme Change

To change the main brand color throughout the application, update these two CSS variables in `styles.css`:

```css
--brand-primary: #c4ff00;    /* Main brand color (currently neon yellow) */
--brand-secondary: #ff4500;  /* Secondary accent color (currently orange) */
```

**Location:** Lines 37-38 in `styles.css` (for `body[data-theme='violet']`)

All other brand-related colors automatically derive from these using CSS `color-mix()`.

## What Gets Updated Automatically

✅ **CSS Variables (Automatic):**
- `--accent` → Uses `--brand-primary`
- `--accent-strong` → Uses `--brand-secondary`
- `--accent-border`, `--accent-shadow`, `--accent-muted` → Derived from `--brand-primary`
- `--accent-glow` → Derived from `--brand-secondary`
- `--brand-glow` → Derived from `--brand-primary`
- `--drop-outline`, `--drop-fill` → Derived from brand colors
- Text selection color → Uses `--brand-primary-inverted`
- `.brand-highlight` text → Uses `--brand-primary`

✅ **UI Elements (Automatic via CSS variables):**
- Button hover states
- Link colors
- Accent borders and shadows
- Panel headers
- Block titles
- Dropzone gradients
- All interactive elements using `var(--accent)`

## What Needs Manual Updates

⚠️ **Logotype SVG Animation:**
- **File:** `assets/animations/data.json`
- **Issue:** Lottie animation has embedded fill colors
- **Solution Options:**
  1. **Manual:** Edit the JSON file and update fill color values (search for `"c":{"a":0,"k":[0.768627510819,1,0,1]` and replace with your brand color in RGB 0-1 format)
  2. **JavaScript:** Use the `recolorLogotype()` helper function (see below)

⚠️ **Tab Icons (Rasterized Images):**
- **Location:** `assets/icons/` or similar
- **Note:** These are rasterized images and need to be manually updated in design software

## JavaScript Helper for Logotype Recoloring

If you want to dynamically recolor the logotype SVG via JavaScript, you can use this helper:

```javascript
/**
 * Recolor logotype SVG to match brand primary color
 * @param {string} brandColor - Hex color (e.g., '#c4ff00')
 */
function recolorLogotype(brandColor) {
  const logotypes = document.querySelectorAll('#logotypeAnimation svg, #demoLogotype svg, #infoLogotypeAnimation svg');
  
  logotypes.forEach(svg => {
    const paths = svg.querySelectorAll('path');
    paths.forEach(path => {
      // Convert hex to RGB
      const hex = brandColor.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;
      
      // Update fill color
      path.setAttribute('fill', `rgb(${Math.round(r*255)}, ${Math.round(g*255)}, ${Math.round(b*255)})`);
    });
  });
}

// Usage:
// recolorLogotype('#c4ff00'); // Call after Lottie animation loads
```

## Inverted Brand Color

The text selection color uses the inverted brand primary color (1:1 inversion):
- **Variable:** `--brand-primary-inverted`
- **Current:** `#3b00ff` (purple, inverted from `#c4ff00`)
- **Auto-calculation:** When you change `--brand-primary`, manually update `--brand-primary-inverted` to the inverted value

**Inversion formula:** 
- R: 255 - original_R
- G: 255 - original_G  
- B: 255 - original_B

## Brand Text Color

The `--brand-text` variable determines text color on brand-colored backgrounds:
- **Current:** `#02030a` (dark text for bright yellow)
- **Update if needed:** Change to `#fff` or light color if your brand color is dark

## Testing Your Changes

After updating brand colors:
1. Check start screen (dropzone)
2. Check UI panels (headers, buttons, links)
3. Check hover states
4. Check text selection color
5. Check logotype animation (may need manual update)
6. Check tab icons (may need manual update)

