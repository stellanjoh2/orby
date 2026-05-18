/**
 * HistogramController - Visualizes exposure levels and detects overexposure
 * Reads pixel data from WebGL canvas and creates a luminance histogram
 */

/** Flat 1-bit palette: solid fills only, no per-frame getComputedStyle */
import { ORBY_BLACK } from '../constants.js';

const HIST_BG = ORBY_BLACK;
const HIST_BAR = '#c4ff00';
const HIST_BAR_WARN = '#ff9632';
const HIST_BAR_SEVERE = '#ff6464';

export class HistogramController {
  constructor(renderer, canvas, containerElement, composer = null) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.containerElement = containerElement;
    this.composer = composer; // Optional: if post-processing is used
    this.enabled = false;
    this._resizeObserver = null;

    // Create canvas — layout 16:9 in CSS (~25% shorter than 4:3); bitmap tracks DPR
    this.histogramCanvas = document.createElement('canvas');
    this.histogramCanvas.width = 320;
    this.histogramCanvas.height = 180;
    this.histogramCanvas.style.width = '100%';
    this.histogramCanvas.style.height = 'auto';
    this.histogramCanvas.style.display = 'block';
    this.histogramCtx = this.histogramCanvas.getContext('2d', { alpha: false });
    
    // Create warning elements
    this.warningElement = document.createElement('div');
    this.warningElement.className = 'histogram-warning histogram-warning--overexposed';
    this.warningElement.style.display = 'none';
    this.warningElement.textContent = 'Overexposed';
    
    this.warningCloseElement = document.createElement('div');
    this.warningCloseElement.className = 'histogram-warning histogram-warning--close';
    this.warningCloseElement.style.display = 'none';
    this.warningCloseElement.textContent = 'Close to overexposing';
    
    // Setup container
    if (this.containerElement) {
      this.containerElement.appendChild(this.histogramCanvas);
      this.containerElement.appendChild(this.warningElement);
      this.containerElement.appendChild(this.warningCloseElement);
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => {
          this._syncHistogramCanvasSize();
        });
        this._resizeObserver.observe(this.histogramCanvas);
      }
      requestAnimationFrame(() => this._syncHistogramCanvasSize());
    }
    
    // Histogram data
    this.bins = 64; // Reduced from 256 for better performance
    this.histogramData = new Array(this.bins).fill(0);
    this.overexposedBins = new Set(); // Track which bins contain overexposed pixels
    // Per-channel 0.93 alone misses tone-mapped / graded "near white" (common 220–250 sRGB) that
    // still stack in the right histogram bins. Combine with luminance and top-bin mass.
    this.channelSevereThreshold = 0.95;
    this.channelWarnThreshold = 0.88;
    this.luminanceSevereThreshold = 0.95;
    this.luminanceWarnThreshold = 0.88;
    this.overexposedThreshold = 0.93; // legacy bar tint (very hot single channel)
    this.updateInterval = 60; // Update every 60ms (~16fps)
    this.lastUpdate = 0;
    
    // Sample size for performance (read every Nth pixel)
    this.sampleRate = 8; // Increased sampling for better performance

    // Start disabled by default (UI controls when to enable)
    if (this.containerElement) {
      this.setEnabled(false);
    }
  }

  _syncHistogramCanvasSize() {
    const el = this.histogramCanvas;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let cssW = rect.width;
    let cssH = rect.height;
    if (cssW < 8) return;
    if (cssH < 4) {
      cssH = (cssW * 9) / 16;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.max(1, Math.floor(cssW * dpr));
    const bh = Math.max(1, Math.floor(cssH * dpr));
    if (el.width !== bw || el.height !== bh) {
      el.width = bw;
      el.height = bh;
    }
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (this.containerElement) {
      this.containerElement.classList.toggle('histogram-container--collapsed', !this.enabled);
      this.containerElement.classList.toggle('histogram-container--expanded', this.enabled);
    }
    if (!this.enabled && this.histogramCtx && this.histogramCanvas) {
      this.histogramCtx.clearRect(0, 0, this.histogramCanvas.width, this.histogramCanvas.height);
    } else if (this.enabled) {
      requestAnimationFrame(() => this._syncHistogramCanvasSize());
    }
  }
  
  /**
   * Calculate luminance from RGB values
   */
  getLuminance(r, g, b) {
    // Using ITU-R BT.709 luminance formula
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  
  /**
   * Read pixel data from WebGL canvas and build histogram
   */
  update() {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return;
    }
    this.lastUpdate = now;
    
    if (!this.canvas || !this.renderer) return;
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    if (width === 0 || height === 0) return;

    this._syncHistogramCanvasSize();

    // Read pixels from the WebGL canvas
    // For performance, we'll sample a smaller region
    try {
      const gl = this.renderer.getContext();
      if (!gl) return;
      
      // Sample a smaller region for performance
      const sampleWidth = Math.min(512, width);
      const sampleHeight = Math.min(512, height);
      
      // Read pixels from the center region
      // Note: WebGL readPixels has origin at bottom-left, so we need to flip Y
      const x = Math.floor((width - sampleWidth) / 2);
      const yFromTop = Math.floor((height - sampleHeight) / 2);
      // Convert from top-left origin to bottom-left origin
      const y = height - yFromTop - sampleHeight;
      
      // Bind default framebuffer through Three so internal GL state stays in sync
      // with the next EffectComposer frame (raw gl.bindFramebuffer can cause rare black flashes).
      const prevRenderTarget = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(null);

      const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
      try {
        gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      } finally {
        this.renderer.setRenderTarget(prevRenderTarget);
      }

      // Flip the pixel data vertically since readPixels returns bottom-to-top
      // but we want to process top-to-bottom
      const flippedPixels = new Uint8Array(sampleWidth * sampleHeight * 4);
      for (let row = 0; row < sampleHeight; row++) {
        const srcRow = sampleHeight - 1 - row;
        const srcOffset = srcRow * sampleWidth * 4;
        const dstOffset = row * sampleWidth * 4;
        flippedPixels.set(pixels.subarray(srcOffset, srcOffset + sampleWidth * 4), dstOffset);
      }
      
      // Reset histogram
      this.histogramData.fill(0);
      this.overexposedBins.clear();
      let overexposedCount = 0;
      let warnCount = 0;
      let inTopHighBinsCount = 0;
      let totalPixels = 0;
      
      // Process pixels with sampling (using flipped data)
      for (let i = 0; i < flippedPixels.length; i += this.sampleRate * 4) {
        const r = flippedPixels[i] / 255;
        const g = flippedPixels[i + 1] / 255;
        const b = flippedPixels[i + 2] / 255;
        
        const luminance = this.getLuminance(r, g, b);
        const bin = Math.min(
          this.bins - 1,
          Math.max(0, Math.floor(luminance * this.bins)),
        );
        const maxCh = Math.max(r, g, b);
        const isSevere = maxCh > this.channelSevereThreshold || luminance > this.luminanceSevereThreshold;
        const isWarn = maxCh > this.channelWarnThreshold || luminance > this.luminanceWarnThreshold;
        // Bar tint: near clip (legacy 0.93 channel check still marks hot bins)
        const isOverexposedBin =
          isSevere ||
          isWarn ||
          r > this.overexposedThreshold ||
          g > this.overexposedThreshold ||
          b > this.overexposedThreshold;

        if (bin >= 0 && bin < this.bins) {
          this.histogramData[bin]++;
          if (isOverexposedBin) {
            this.overexposedBins.add(bin);
          }
        }

        if (isSevere) {
          overexposedCount++;
        }
        if (isWarn) {
          warnCount++;
        }
        if (bin >= this.bins - 4) {
          inTopHighBinsCount++;
        }

        totalPixels++;
      }
      
      // Normalize histogram
      const maxCount = Math.max(...this.histogramData);
      if (maxCount > 0) {
        for (let i = 0; i < this.bins; i++) {
          this.histogramData[i] = this.histogramData[i] / maxCount;
        }
      }

      const severeRatio = totalPixels > 0 ? overexposedCount / totalPixels : 0;
      const warnRatio = totalPixels > 0 ? warnCount / totalPixels : 0;
      const topHighBinsRatio = totalPixels > 0 ? inTopHighBinsCount / totalPixels : 0;
      // Red: true clips / severe compression OR the histogram is crammed in the right edge (clipping)
      const isCatastrophicHighlights =
        severeRatio > 0.02 || (topHighBinsRatio > 0.18 && warnRatio > 0.2);
      // Orange: many pixels in highlight range without as many true severes
      const isCloseToOverexposing =
        !isCatastrophicHighlights &&
        (warnRatio > 0.04 || (topHighBinsRatio > 0.12 && warnRatio > 0.08));
      
      // Render histogram with warning level (0 = none, 1 = close, 2 = overexposed)
      const warningLevel = isCatastrophicHighlights
        ? 2
        : (isCloseToOverexposing ? 1 : 0);
      this.renderHistogram(warningLevel);
      
      // Hide warning labels (no longer needed)
      if (this.warningElement) {
        this.warningElement.style.display = 'none';
      }
      if (this.warningCloseElement) {
        this.warningCloseElement.style.display = 'none';
      }
    } catch (error) {
      // Silently fail if reading pixels fails (e.g., during initialization)
      // Histogram update failed silently
    }
  }
  
  /**
   * Render the histogram to canvas
   * @param {number} warningLevel - 0 = none, 1 = close to overexposing (orange), 2 = overexposed (red)
   */
  renderHistogram(warningLevel) {
    const ctx = this.histogramCtx;
    const width = this.histogramCanvas.width;
    const height = this.histogramCanvas.height;

    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = HIST_BG;
    ctx.fillRect(0, 0, width, height);

    let barColor = HIST_BAR;
    if (warningLevel === 2) {
      barColor = HIST_BAR_SEVERE;
    } else if (warningLevel === 1) {
      barColor = HIST_BAR_WARN;
    }
    
    // Integer column bands so bars touch edge-to-edge (no dark gaps from float fillRect)
    const padY = 2;
    const maxBarHeight = height - padY * 2;
    ctx.fillStyle = barColor;
    for (let i = 0; i < this.bins; i += 1) {
      const x0 = Math.floor((i * width) / this.bins);
      const x1 = i === this.bins - 1 ? width : Math.floor(((i + 1) * width) / this.bins);
      const barPixW = Math.max(1, x1 - x0);
      const barHeight = this.histogramData[i] * maxBarHeight;
      const y = height - barHeight - padY;
      ctx.fillRect(x0, y, barPixW, barHeight);
    }
  }
  
  /**
   * Clean up
   */
  dispose() {
    if (this._resizeObserver && this.histogramCanvas) {
      this._resizeObserver.unobserve(this.histogramCanvas);
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.histogramCanvas && this.histogramCanvas.parentNode) {
      this.histogramCanvas.parentNode.removeChild(this.histogramCanvas);
    }
    if (this.warningElement && this.warningElement.parentNode) {
      this.warningElement.parentNode.removeChild(this.warningElement);
    }
    if (this.warningCloseElement && this.warningCloseElement.parentNode) {
      this.warningCloseElement.parentNode.removeChild(this.warningCloseElement);
    }
  }
}

