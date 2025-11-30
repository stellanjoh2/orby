/**
 * HistogramController - Visualizes exposure levels and detects overexposure
 * Reads pixel data from WebGL canvas and creates a luminance histogram
 */
export class HistogramController {
  constructor(renderer, canvas, containerElement, composer = null) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.containerElement = containerElement;
    this.composer = composer; // Optional: if post-processing is used
    
    // Create canvas for histogram rendering
    this.histogramCanvas = document.createElement('canvas');
    this.histogramCanvas.width = 256;
    this.histogramCanvas.height = 80;
    this.histogramCanvas.style.width = '100%';
    this.histogramCanvas.style.height = '80px';
    this.histogramCanvas.style.display = 'block';
    this.histogramCtx = this.histogramCanvas.getContext('2d');
    
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
    }
    
    // Histogram data
    this.bins = 64; // Reduced from 256 for better performance
    this.histogramData = new Array(this.bins).fill(0);
    this.overexposedBins = new Set(); // Track which bins contain overexposed pixels
    this.overexposedThreshold = 0.93; // 93% brightness considered overexposed (less sensitive)
    this.updateInterval = 60; // Update every 60ms (~16fps)
    this.lastUpdate = 0;
    
    // Sample size for performance (read every Nth pixel)
    this.sampleRate = 8; // Increased sampling for better performance
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
    const now = performance.now();
    if (now - this.lastUpdate < this.updateInterval) {
      return;
    }
    this.lastUpdate = now;
    
    if (!this.canvas || !this.renderer) return;
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    if (width === 0 || height === 0) return;
    
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
      
      // Ensure we're reading from the default framebuffer (the canvas)
      // The composer should have rendered to screen by now
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      
      // Read pixels - WebGL returns data in bottom-to-top order
      const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
      gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      
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
      let totalPixels = 0;
      
      // Process pixels with sampling (using flipped data)
      for (let i = 0; i < flippedPixels.length; i += this.sampleRate * 4) {
        const r = flippedPixels[i] / 255;
        const g = flippedPixels[i + 1] / 255;
        const b = flippedPixels[i + 2] / 255;
        
        const luminance = this.getLuminance(r, g, b);
        const bin = Math.floor(luminance * (this.bins - 1));
        
        // Check for overexposure (any channel > threshold)
        const isOverexposed = r > this.overexposedThreshold || g > this.overexposedThreshold || b > this.overexposedThreshold;
        
        if (bin >= 0 && bin < this.bins) {
          this.histogramData[bin]++;
          // Mark this bin as containing overexposed pixels
          if (isOverexposed) {
            this.overexposedBins.add(bin);
          }
        }
        
        if (isOverexposed) {
          overexposedCount++;
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
      
      // Check if overexposed (>2% of pixels) or close to overexposing (>1% of pixels)
      const overexposedRatio = overexposedCount / totalPixels;
      const isOverexposed = overexposedRatio > 0.02; // 2% threshold (less sensitive)
      const isCloseToOverexposing = overexposedRatio > 0.01 && !isOverexposed; // 1% threshold (less sensitive)
      
      // Render histogram with warning level (0 = none, 1 = close, 2 = overexposed)
      const warningLevel = isOverexposed ? 2 : (isCloseToOverexposing ? 1 : 0);
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
      console.debug('Histogram update failed:', error);
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
    
    // Clear canvas with a subtle dark background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);
    
    // Determine bar color based on warning level
    let barColor;
    if (warningLevel === 2) {
      // Overexposed - red
      barColor = 'rgba(255, 100, 100, 0.8)';
    } else if (warningLevel === 1) {
      // Close to overexposing - orange
      barColor = 'rgba(255, 150, 50, 0.8)';
    } else {
      // Normal - white
      barColor = 'rgba(255, 255, 255, 0.6)';
    }
    
    // Draw histogram bars
    const barWidth = width / this.bins;
    const maxBarHeight = height - 4; // Leave some padding
    
    ctx.fillStyle = barColor;
    
    for (let i = 0; i < this.bins; i++) {
      const barHeight = this.histogramData[i] * maxBarHeight;
      const x = i * barWidth;
      const y = height - barHeight - 2;
      
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }
  
  /**
   * Clean up
   */
  dispose() {
    if (this.histogramCanvas && this.histogramCanvas.parentNode) {
      this.histogramCanvas.parentNode.removeChild(this.histogramCanvas);
    }
    if (this.warningElement && this.warningElement.parentNode) {
      this.warningElement.parentNode.removeChild(this.warningElement);
    }
  }
}

