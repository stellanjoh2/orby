/**
 * UIHelpers - Utility methods for UI management
 * Provides helper functions for sliders, labels, controls, and UI state
 */
export class UIHelpers {
  constructor(eventBus, stateStore, uiManager) {
    this.eventBus = eventBus;
    this.stateStore = stateStore;
    this.ui = uiManager; // Reference to UIManager for accessing inputs/dom
  }

  /**
   * Format slider value with appropriate unit and decimals
   * @param {number} value - The numeric value
   * @param {string} type - Format type: 'angle', 'distance', 'multiplier', 'decimal', 'integer'
   * @param {number} decimals - Optional override for decimal places
   * @returns {string} Formatted string
   */
  formatSliderValue(value, type = 'decimal', decimals = null) {
    if (!Number.isFinite(value)) return '—';
    
    if (type === 'kelvin') {
      const rounded = Math.round(value);
      return `${rounded}K`;
    }

    const formatMap = {
      angle: { decimals: 0, unit: '°' },
      distance: { decimals: 2, unit: 'm' },
      multiplier: { decimals: 2, unit: '×' },
      decimal: { decimals: 2, unit: '' },
      integer: { decimals: 0, unit: '' },
    };
    
    const config = formatMap[type] || formatMap.decimal;
    const dec = decimals !== null ? decimals : config.decimals;
    const formatted = dec === 0 ? Math.round(value).toString() : value.toFixed(dec);
    return config.unit ? `${formatted}${config.unit}` : formatted;
  }

  /**
   * Update value label for a slider
   * @param {string} key - The data-output key
   * @param {string|number} value - The value to display (or formatted string)
   * @param {string} type - Format type if value is number
   * @param {number} decimals - Optional override for decimal places
   */
  updateValueLabel(key, value, type = null, decimals = null) {
    const label = document.querySelector(`[data-output="${key}"]`);
    if (!label) return;
    
    if (typeof value === 'number' && type) {
      label.textContent = this.formatSliderValue(value, type, decimals);
    } else {
      label.textContent = String(value);
    }
  }

  /**
   * Setup global slider fill updates for all range inputs
   * This ensures all sliders get the fill effect automatically
   */
  setupSliderFillUpdates() {
    // Add global listener for all slider inputs
    document.addEventListener('input', (event) => {
      if (event.target.type === 'range') {
        this.updateSliderFill(event.target);
      }
    }, true); // Use capture phase to catch all events
    
    // Initialize fill for all existing sliders
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      this.updateSliderFill(slider);
    });
  }

  /**
   * Update slider fill effect using CSS variable
   * Calculates fill percentage based on slider value, min, and max
   * Supports both left-to-right fill and center-outward fill for centered sliders
   * @param {HTMLInputElement} slider - The slider input element
   */
  updateSliderFill(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Skip temperature and tint sliders (they have custom gradients)
    const sliderLine = slider.closest('.slider-line');
    if (sliderLine?.classList.contains('slider-line--temperature') || 
        sliderLine?.classList.contains('slider-line--tint')) {
      return;
    }
    
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    const value = parseFloat(slider.value) || 0;
    
    // Detect if this is a centered slider (min < 0 and max > 0)
    const isCentered = min < 0 && max > 0;
    
    if (isCentered) {
      // Center-outward fill: fill from center point outward
      const center = 0;
      const range = max - min;
      const centerPercent = ((center - min) / range) * 100; // Position of center on track
      
      if (value === center) {
        // At center: no fill
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      } else if (value > center) {
        // Positive value: fill from center to value (right side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${centerPercent}%`);
        slider.style.setProperty('--slider-fill-end', `${valuePercent}%`);
      } else {
        // Negative value: fill from value to center (left side)
        const valuePercent = ((value - min) / range) * 100;
        slider.style.setProperty('--slider-fill-start', `${valuePercent}%`);
        slider.style.setProperty('--slider-fill-end', `${centerPercent}%`);
      }
    } else {
      // Left-to-right fill: fill from 0% to value percentage
      const range = max - min;
      const fillPercent = range > 0 ? ((value - min) / range) * 100 : 0;
      slider.style.setProperty('--slider-fill-start', '0%');
      slider.style.setProperty('--slider-fill-end', `${fillPercent}%`);
    }
  }

  /**
   * Apply snap-to-center for sliders with center default values
   * @param {HTMLInputElement} slider - The slider input element
   * @param {number} min - Minimum slider value
   * @param {number} max - Maximum slider value
   * @param {number} centerValue - The center/default value to snap to
   * @param {number} thresholdPercent - Threshold as percentage of range (default: 3%)
   * @returns {number} - The value (snapped if within threshold, otherwise original)
   */
  applySnapToCenter(slider, min, max, centerValue, thresholdPercent = 3) {
    if (!slider) return parseFloat(slider.value);
    
    const currentValue = parseFloat(slider.value);
    const range = max - min;
    const threshold = (range * thresholdPercent) / 100;
    const distanceFromCenter = Math.abs(currentValue - centerValue);
    
    // If within threshold, snap to center
    if (distanceFromCenter <= threshold) {
      slider.value = centerValue;
      return centerValue;
    }
    
    return currentValue;
  }

  /**
   * Setup keyboard support for all range inputs
   */
  setupSliderKeyboardSupport() {
    // Find all range inputs and ensure they're focusable
    const allSliders = document.querySelectorAll('input[type="range"]');
    allSliders.forEach((slider) => {
      // Ensure focusable
      if (!slider.hasAttribute('tabindex')) {
        slider.setAttribute('tabindex', '0');
      }
      
      // Ensure focus on click
      slider.addEventListener('click', () => {
        slider.focus();
      }, { passive: true });
    });
  }

  /**
   * Enable keyboard arrow key stepping for a slider
   * @param {HTMLInputElement} slider - The slider input element
   * @deprecated - Keyboard stepping is now handled at document level for all sliders
   */
  enableSliderKeyboardStepping(slider) {
    if (!slider || slider.type !== 'range') return;
    
    // Just ensure slider is focusable - keyboard handling is done at document level
    slider.setAttribute('tabindex', '0');
    
    // Ensure slider gets focus on click
    slider.addEventListener('click', (event) => {
      if (event.target === slider) {
        slider.focus();
      }
    });
  }

  /**
   * Unified method to set control disabled state
   * @param {string|string[]} inputIds - Single ID or array of IDs
   * @param {boolean} disabled - Whether to disable
   * @param {object} options - Additional options
   */
  setControlDisabled(inputIds, disabled, options = {}) {
    const ids = Array.isArray(inputIds) ? inputIds : [inputIds];
    const { applyBlockMute = false, blockKey = null } = options;
    
    ids.forEach((id) => {
      const input = this.ui.inputs[id];
      if (!input) return;
      
      input.disabled = disabled;
      // Use consistent class name
      input.classList.toggle('is-disabled-handle', disabled);
    });
    
    // Optionally apply block muting
    if (applyBlockMute && blockKey) {
      this.ui.setBlockMuted(blockKey, disabled);
    }
  }

  /**
   * Unified color input handler
   * @param {string} inputId - The color input ID
   * @param {string} statePath - StateStore path (e.g., 'clay.color', 'lensFlare.color')
   * @param {string} eventName - Event bus event name
   */
  bindColorInput(inputId, statePath, eventName) {
    const input = this.ui.inputs[inputId];
    if (!input) return;
    
    input.addEventListener('input', (event) => {
      const value = event.target.value;
      this.stateStore.set(statePath, value);
      this.eventBus.emit(eventName, value);
    });
  }

  /**
   * Show toast notification
   * @param {string} message - Toast message
   */
  showToast(message) {
    const template = this.ui.dom.toastTemplate?.content?.firstElementChild;
    if (!template) return;
    const toast = template.cloneNode(true);
    toast.querySelector('.toast-message').textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  /**
   * Set block muted state (for visual feedback)
   * @param {string} blockKey - Block identifier
   * @param {boolean} muted - Whether block is muted
   */
  setBlockMuted(blockKey, muted) {
    // First try to find a subsection (for merged blocks)
    const subsection = this.ui.dom?.subsections?.[blockKey];
    if (subsection) {
      subsection.classList.toggle('is-muted', muted);
      return;
    }
    // Fall back to regular block
    const block = this.ui.dom?.blocks?.[blockKey];
    if (!block) {
      // Silently fail - block might not exist yet or key might be wrong
      return;
    }
    // Only toggle the class - don't affect other blocks
    block.classList.toggle('is-muted', muted);
  }
}

