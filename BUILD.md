# Build & Deployment Guide

## Development Workflow

**Work normally with source files** - no build step needed for development!

```bash
# Install dependencies (first time only)
npm install

# Start local dev server
npm run dev
# Or use: python3 -m http.server 8000
```

Edit files in `scripts/` and `index.html` directly. Changes are instant.

## Production Build

When ready to deploy:

```bash
# Build minified production bundle
npm run build
```

This will:
- ✅ Bundle all JavaScript into a single minified file
- ✅ Copy HTML, CSS, and assets to `dist/` folder
- ✅ Keep Three.js external (loaded from CDN)
- ✅ Output ready-to-deploy files in `dist/`

## Deployment Options

### Option 1: Deploy dist/ folder (Recommended)

1. Build: `npm run build`
2. Update GitHub Pages settings to serve from `/dist` folder
3. Push `dist/` folder to repository
4. GitHub Pages will serve from `dist/` automatically

### Option 2: Use GitHub Actions (Automatic)

The `.github/workflows/deploy.yml` workflow will:
- Automatically build on every push to `main`
- Deploy `dist/` folder to GitHub Pages
- No manual build step needed!

### Option 3: Manual Deploy

1. Build: `npm run build`
2. Copy contents of `dist/` to root (or commit `dist/` separately)
3. Push to GitHub

## File Structure

```
meshgl/
├── scripts/          # Source files (unminified) - edit these!
├── index.html        # Source HTML - edit this!
├── styles.css        # Source CSS - edit this!
├── dist/             # Built files (minified) - don't edit!
│   ├── scripts/
│   │   └── main.js   # Minified bundle
│   ├── index.html
│   ├── styles.css
│   └── assets/
└── package.json
```

## Important Notes

- **Development**: Always edit files in root (`scripts/`, `index.html`, etc.)
- **Production**: Build creates `dist/` folder with minified files
- **Three.js**: Kept external (loaded from CDN) to reduce bundle size
- **Git**: `dist/` folder is ignored by default (add to `.gitignore`)

## Troubleshooting

**Build fails?**
- Make sure you ran `npm install` first
- Check Node.js version (needs Node 18+)

**Changes not showing?**
- Make sure you're editing source files, not `dist/`
- Rebuild after changes: `npm run build`
- Clear browser cache
