# Orby Project Plan & Improvements

This document tracks planned improvements, enhancements, and technical debt for the Orby 3D model viewer project.

**Last Updated:** 2024

---

## 🎯 Current Status

The codebase has been significantly refactored with:
- ✅ Modular architecture (controllers extracted)
- ✅ Dead code removed
- ✅ Clean separation of concerns
- ✅ Post-processing pipeline organized

---

## 📋 Improvement Ideas

### Phase 1: Quick Wins (High Priority, Low Risk)
**Estimated Time:** 2-3 hours  
**Can be done together in one session**

- [ ] **Move TEMP/ to .gitignore**
  - Clean up test assets from repository
  - Keep them locally for development

- [ ] **Add README.md**
  - Project description
  - Setup instructions
  - Features list
  - Basic usage guide

- [ ] **Improve Error Handling**
  - User-friendly error messages (not just console.error)
  - Toast notifications for errors
  - Graceful degradation

- [ ] **Add Loading States**
  - Spinner/progress indicator for model loading
  - Loading state for HDRI switching
  - Visual feedback for async operations

- [ ] **Keyboard Shortcuts Help**
  - Press `?` to show keyboard shortcuts overlay
  - Document all shortcuts in help panel

- [ ] **Basic State Persistence**
  - Save settings to localStorage
  - Restore on page load
  - Export/import settings as JSON

---

### Phase 2: Documentation (Medium Priority)
**Estimated Time:** 1-2 hours

- [ ] **Complete README.md**
  - Architecture overview
  - API documentation
  - Contributing guidelines
  - Changelog

- [ ] **Add JSDoc Comments**
  - Document all public methods
  - Type hints for parameters
  - Usage examples

- [ ] **Architecture Documentation**
  - Module dependency diagram
  - Data flow documentation
  - Controller responsibilities

---

### Phase 3: Build System (High Priority, Medium Risk)
**Estimated Time:** 3-4 hours  
**Needs testing, should be done separately**

- [ ] **Set up Build System**
  - Vite or Webpack configuration
  - Module bundling
  - Code splitting

- [ ] **Asset Optimization**
  - Compress HDRI images
  - Optimize textures
  - Lazy loading for assets

- [ ] **Environment Configuration**
  - Dev/staging/prod configs
  - Environment variables
  - Build scripts

---

### Phase 4: Testing Infrastructure (Ongoing)
**Estimated Time:** Ongoing (start small)

- [ ] **Set up Test Framework**
  - Jest or Vitest
  - Test configuration
  - CI/CD integration

- [ ] **Write Tests**
  - Unit tests for controllers
  - Integration tests for critical flows
  - Visual regression tests

- [ ] **Performance Benchmarks**
  - FPS monitoring
  - Memory usage tracking
  - Load time metrics

---

### Phase 5: TypeScript Migration (Major Refactor)
**Estimated Time:** 1-2 weeks (incremental)

- [ ] **TypeScript Setup**
  - tsconfig.json
  - Type definitions
  - Migration strategy

- [ ] **Incremental Migration**
  - Convert files one by one
  - Add type definitions
  - Fix type errors

---

## 🚀 Additional Improvements (Future)

### User Experience
- [ ] Undo/redo for settings changes
- [ ] Settings presets (save/load/export/import)
- [ ] Screenshot/export functionality
- [ ] Mobile responsiveness improvements
- [ ] Touch gesture support
- [ ] Model comparison (side-by-side)
- [ ] Camera path recording/playback
- [ ] Shareable links with embedded settings

### Developer Experience
- [ ] Development mode with debug tools
- [ ] Hot module replacement
- [ ] ESLint/Prettier configuration
- [ ] Pre-commit hooks
- [ ] Debug overlay (FPS, draw calls, memory)
- [ ] State inspector panel
- [ ] Event bus monitor

### Performance
- [ ] Performance monitoring (FPS, memory, load times)
- [ ] Lazy loading for HDRI textures
- [ ] Progressive loading for large models
- [ ] Web Workers for heavy computations
- [ ] Texture compression/optimization

### Accessibility
- [ ] Full keyboard navigation
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Focus management
- [ ] Reduced motion support

### Security
- [ ] Content Security Policy (CSP) headers
- [ ] XSS protection
- [ ] File upload validation
- [ ] Sandboxed iframe option

### Analytics & Monitoring
- [ ] Usage analytics (privacy-respecting)
- [ ] Performance metrics collection
- [ ] Error tracking (Sentry or similar)
- [ ] Feature usage tracking

### Internationalization
- [ ] i18n support
- [ ] Language switcher
- [ ] Localized date/time formats

### Browser Compatibility
- [ ] Feature detection and polyfills
- [ ] Graceful degradation
- [ ] Browser-specific optimizations
- [ ] Compatibility testing matrix

---

## 📝 Notes

- **Priority:** Focus on Phase 1 first (quick wins, immediate value)
- **Risk Management:** Test each phase before moving to next
- **Incremental:** Don't try to do everything at once
- **Documentation:** Update this plan as items are completed

---

## ✅ Completed

- ✅ Modular architecture refactoring
- ✅ Dead code removal
- ✅ Post-processing pipeline extraction
- ✅ Color adjustment setters extraction
- ✅ Utility wrapper cleanup
- ✅ Asset cleanup (removed unused files)

---

## 🔄 In Progress

_None currently_

---

## 🐛 Bugs & Issues

### Depth of Field (DOF) Edge Artifacts & Ghosting
**Status:** Known Issue  
**Priority:** Medium  
**Reported:** 2024

**Problem:**
- DOF creates harsh edges and "ghost" artifacts, especially on flat backgrounds
- Background (when HDRI is disabled) shows massive ghosting effects
- Edges where mesh meets background look disconnected from realistic camera DOF
- Issue persists even with background sphere geometry implementation

**Current Implementation:**
- Using Three.js `BokehPass` for DOF
- Background sphere (radius 10000) positioned 5000 units behind camera
- Maxblur reduced to 0.01-0.04 range
- BokehPass rings/sides set to defaults (3/5)

**Potential Fixes:**
1. **Further reduce maxblur** - Try even more conservative range (0.005-0.02)
2. **Adjust focus distance** - Make focus closer to mesh so background is more consistently out of focus
3. **Exclude background from DOF** - Render background separately and apply simpler blur
4. **Custom DOF shader** - Replace BokehPass with custom implementation that handles backgrounds better
5. **Depth buffer adjustments** - Ensure background sphere writes proper depth values
6. **Post-process background separately** - Apply DOF only to mesh, use separate blur for background
7. **Reduce BokehPass samples** - Further reduce rings/sides to minimize artifacts
8. **Focus range adjustment** - Narrow the focus range to make transitions smoother

**Technical Notes:**
- Background sphere uses `MeshBasicMaterial` with `depthWrite: true` and `depthTest: true`
- Sphere follows camera at 5000 units behind
- Clear color set to background color as fallback
- Issue may be fundamental to how BokehPass handles large depth differences

### Slider Keyboard Stepping Not Working
**Status:** Known Issue  
**Priority:** Low  
**Reported:** 2024

**Problem:**
- Arrow key stepping (Left/Right) doesn't work on several sliders:
  - Clay Roughness
  - Clay Metallic
  - Podium Y Position
  - Camera Tilt
  - Temperature
  - Tint
  - Contrast
  - Highlights
  - Shadows
  - Saturation
- Sliders can receive focus, but arrow keys don't step the values
- Some sliders work (Transform controls), but most don't

**Current Implementation:**
- Document-level keyboard handler in capture phase
- Individual slider handlers via `enableSliderKeyboardStepping()`
- Sliders have `tabindex="0"` and focus handlers
- Event prevention and stopPropagation implemented

**Potential Fixes:**
1. **Debug event flow** - Check if events are being captured/stopped by other handlers
2. **Browser default behavior** - May need to prevent default more aggressively
3. **Event timing** - Try `keyup` instead of `keydown`
4. **Focus verification** - Ensure sliders actually have focus when keys are pressed
5. **Range input defaults** - Check if browser's default range input behavior is interfering
6. **Alternative approach** - Use `input` event simulation instead of direct value setting
7. **Test different browsers** - May be browser-specific behavior

**Technical Notes:**
- Handlers use capture phase (`true` parameter)
- Both document-level and individual slider handlers implemented
- Sliders are focusable and receive focus on click
- Issue persists despite multiple implementation attempts

---

## 📅 Timeline

**Phase 1 (Quick Wins):** Next session  
**Phase 2 (Documentation):** After Phase 1  
**Phase 3+ (Bigger Changes):** As needed, incrementally

---

## 💡 Ideas & Suggestions

_Add new ideas here as they come up_

