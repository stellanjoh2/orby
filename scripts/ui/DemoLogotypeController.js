/**
 * DemoLogotypeController - Manages the demo mode logotype in bottom-left corner
 * Toggleable branded screensaver-style logotype animation
 */
export class DemoLogotypeController {
  constructor() {
    this.container = null;
    this.animationInstance = null;
    this.visible = false;
  }

  init() {
    this.cacheDom();
    this.initAnimation();
  }

  cacheDom() {
    this.container = document.querySelector('#demoLogotype');
    if (!this.container) {
      console.warn('Demo logotype container not found');
    }
  }

  /**
   * Initialize Lottie animation for demo logotype
   */
  initAnimation() {
    if (!this.container) {
      return;
    }

    // Wait for Lottie library to load
    const tryInit = () => {
      if (typeof lottie === 'undefined') {
        // Retry after a short delay
        setTimeout(tryInit, 100);
        return;
      }

      try {
        // Add cache-busting parameter to ensure fresh file is loaded
        const cacheBuster = `?v=${Date.now()}`;
        this.animationInstance = lottie.loadAnimation({
          container: this.container,
          renderer: 'svg',
          loop: true,
          autoplay: false, // Don't autoplay, we'll control it
          path: `./assets/animations/data.json${cacheBuster}`,
          rendererSettings: {
            preserveAspectRatio: 'xMidYMid meet',
            clearCanvas: true,
            progressiveLoad: false,
            hideOnTransparent: true
          }
        });
        
        // Set frame rate to 30fps for better performance (half of original 60fps)
        if (this.animationInstance) {
          this.animationInstance.setSpeed(0.5);
        }

        // Scale animation to match the logo size (440px width)
        // The animation is 1920x830, so we maintain aspect ratio
        if (this.animationInstance) {
          this.animationInstance.addEventListener('DOMLoaded', () => {
            const svg = this.container.querySelector('svg');
            if (svg) {
              // Calculate height based on aspect ratio: 830/1920 = 0.432
              const height = 440 * (830 / 1920);
              svg.style.width = '440px';
              svg.style.height = `${height}px`;
            }
          });
        }
      } catch (error) {
        console.error('Failed to load demo logotype animation:', error);
      }
    };

    tryInit();
  }

  /**
   * Toggle demo logotype visibility
   */
  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show demo logotype with fade-in animation
   */
  show() {
    if (!this.container || this.visible) return;

    this.visible = true;
    
    // Remove hiding class if present
    this.container.classList.remove('hiding');
    
    // Ensure initial state
    this.container.style.opacity = '0';
    this.container.style.transform = 'scale(0.9)';
    
    // Force reflow
    this.container.offsetHeight;
    
    // Add visible class to trigger fade-in animation
    requestAnimationFrame(() => {
      this.container.classList.add('visible');
      
      // Start animation playback
      if (this.animationInstance) {
        this.animationInstance.play();
      }
    });
  }

  /**
   * Hide demo logotype with fade-out animation
   */
  hide() {
    if (!this.container || !this.visible) return;

    // Remove visible class
    this.container.classList.remove('visible');
    
    // Add hiding class to trigger fade-out animation
    this.container.classList.add('hiding');
    
    // Stop animation playback
    if (this.animationInstance) {
      this.animationInstance.pause();
    }
    
    // After animation completes, remove hiding class and set visible to false
    setTimeout(() => {
      this.container.classList.remove('hiding');
      this.visible = false;
    }, 400); // Match fade-out animation duration
  }
}

