# Brand Color System Guide

## Quick Theme Change

Orby brand colors are defined once in `styles/orby-brand-tokens.css` and mirrored in `scripts/constants.js`:

```css
--orby-lime: #94ff1d;         /* Orby Lime — logotype, primary actions */
--orby-purple: #6b00e2;       /* Orby Purple — inverted lime; UI accents */
--orby-purple-bright: #b580f1;  /* Orby Purple Bright — 50% brighter (50% mix with white) */
--orby-pink: #ff1d76;         /* Orby Pink — official red; warnings, severity */
--orby-pink-muted: #ff8ebb;    /* Softer Orby Pink — inline errors (50% mix with white) */
```

```js
export const ORBY_LIME = '#94ff1d';
export const ORBY_PURPLE = '#6b00e2';
export const ORBY_PURPLE_BRIGHT = '#b580f1';
export const ORBY_PINK = '#ff1d76';
export const ORBY_PINK_MUTED = '#ff8ebb';
```

`styles.css` maps these to theme tokens:

```css
--brand-primary: var(--orby-lime);
--brand-primary-inverted: var(--orby-purple);
--text-link: var(--orby-purple-bright);
--warning: var(--orby-pink);
--danger: var(--orby-pink-muted);
```

**Secondary accent** (`--brand-secondary`, currently orange `#ff4500`) is still set per theme in `styles.css`.

All other brand-related colors automatically derive from lime/purple using CSS `color-mix()`.

## What Gets Updated Automatically

✅ **CSS Variables (Automatic):**
- `--accent` → Uses `--brand-primary`
- `--accent-strong` → Uses `--brand-secondary`
- `--accent-border`, `--accent-shadow`, `--accent-muted` → Derived from `--brand-primary`
- `--accent-glow` → Derived from `--brand-secondary`
- `--brand-glow` → Derived from `--brand-primary`
- `--drop-outline`, `--drop-fill` → Derived from brand colors
- Text selection color → Uses `--text-link` (purple)
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

⚠️ **Static SVGs & raster assets:**
- **Locations:** `assets/images/`, `assets/3D-assets/`, tab icons
- **Note:** Update fill colors in design software or source files

## JavaScript Helper for Logotype Recoloring

If you want to dynamically recolor the logotype SVG via JavaScript, you can use this helper:

```javascript
/**
 * Recolor logotype SVG to match brand primary color
 * @param {string} brandColor - Hex color (e.g., '#94ff1d')
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
// recolorLogotype('#94ff1d'); // Call after Lottie animation loads
```

## Orby Purple

The official purple is the inverted Orby Lime:
- **CSS:** `--orby-purple` / `--brand-primary-inverted`
- **JS:** `ORBY_PURPLE`
- **Current:** `#6b00e2` (inverted from `#94ff1d`)

**Orby Purple Bright** (`--orby-purple-bright` / `ORBY_PURPLE_BRIGHT`) is 50% brighter — for inline text links on dark UI. Base purple is used for inverted brand accents, gradients, and selection where noted.

Used for inline links, text selection, and gradient accents alongside Orby Lime.

## Orby Pink

The official red — use for warnings, blocker severity, under-construction notices, export warnings, and critical alerts:
- **CSS:** `--orby-pink` / `--warning`
- **JS:** `ORBY_PINK`
- **Current:** `#ff1d76`

**Softer Orby Pink** (`--orby-pink-muted` / `ORBY_PINK_MUTED`) is 50% mixed with white — for inline errors and destructive hints via `--danger`.

## Brand Text Color

The `--brand-text` variable determines text color on brand-colored backgrounds:
- **Current:** `var(--orby-black)` (`#080808`, dark text on bright lime)
- **Update if needed:** Change to `#fff` or light color if your brand color is dark

## Testing Your Changes

After updating brand colors:
1. Check start screen (dropzone)
2. Check UI panels (headers, buttons, links)
3. Check hover states
4. Check text selection color
5. Check logotype animation (may need manual update)
6. Check tab icons (may need manual update)
