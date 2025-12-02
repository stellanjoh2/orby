/**
 * TooltipController - Smart, reusable tooltip system
 * 
 * Features:
 * - Automatic positioning (avoids viewport edges)
 * - Smooth animations
 * - Data attribute support: data-tooltip="text"
 * - Programmatic API
 * - Single tooltip instance (performant)
 * - Mobile-friendly (touch support)
 */
export class TooltipController {
  constructor() {
    this.tooltip = null;
    this.currentTarget = null;
    this.hideTimeout = null;
    this.showTimeout = null;
    this.isVisible = false;
    this.position = 'top'; // top, bottom, left, right, auto
    this.offset = 8; // Distance from target element
    
    this.init();
  }

  init() {
    // Create single tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.tooltip);

    // Use event delegation for data-tooltip attributes
    document.addEventListener('mouseenter', this.handleMouseEnter.bind(this), true);
    document.addEventListener('mouseleave', this.handleMouseLeave.bind(this), true);
    document.addEventListener('focus', this.handleFocus.bind(this), true);
    document.addEventListener('blur', this.handleBlur.bind(this), true);
    
    // Touch support for mobile
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
  }

  /**
   * Handle mouse enter on elements with data-tooltip
   */
  handleMouseEnter(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target || target.disabled) return;
    
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    // Clear any pending hide (allows smooth transition between tooltips)
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // If we're already showing a tooltip for this target, do nothing
    if (target === this.currentTarget && this.isVisible) return;

    // Clear any pending show
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    // If moving to a different tooltip element, hide current immediately
    if (this.currentTarget && this.currentTarget !== target && this.isVisible) {
      this.hide();
    }

    this.currentTarget = target;

    // Small delay before showing (prevents tooltip spam on hover)
    this.showTimeout = setTimeout(() => {
      if (this.currentTarget === target) {
        this.show(target, text);
      }
    }, 300);
  }

  /**
   * Handle mouse leave
   */
  handleMouseLeave(event) {
    const target = event.target.closest('[data-tooltip]');
    
    // If we're leaving the current target, hide the tooltip
    if (target === this.currentTarget) {
      // Clear any pending show
      if (this.showTimeout) {
        clearTimeout(this.showTimeout);
        this.showTimeout = null;
      }
      
      // Hide immediately
      this.hide();
    }
  }

  /**
   * Handle focus (keyboard navigation)
   */
  handleFocus(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target || target.disabled) return;
    
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    this.currentTarget = target;
    this.show(target, text);
  }

  /**
   * Handle blur (keyboard navigation)
   */
  handleBlur(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target || target === this.currentTarget) return;
    
    this.hide();
  }

  /**
   * Handle touch (mobile)
   */
  handleTouchStart(event) {
    const target = event.target.closest('[data-tooltip]');
    if (!target || target.disabled) return;
    
    const text = target.getAttribute('data-tooltip');
    if (!text) return;

    // On mobile, show immediately on tap
    this.currentTarget = target;
    this.show(target, text);
    
    // Hide after 3 seconds or on next touch
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, 3000);
  }

  /**
   * Show tooltip
   * @param {HTMLElement} target - Target element
   * @param {string} text - Tooltip text
   * @param {string} position - Optional position override
   */
  show(target, text, position = null) {
    if (!target || !text) return;
    
    // Get position preference from data attribute or use default
    const preferredPosition = position || target.getAttribute('data-tooltip-position') || 'auto';
    
    this.tooltip.textContent = text;
    this.tooltip.setAttribute('aria-hidden', 'false');
    
    // Calculate position
    const finalPosition = preferredPosition === 'auto' 
      ? this.calculateAutoPosition(target)
      : preferredPosition;
    
    this.updatePosition(target, finalPosition);
    
    // Show with animation
    this.tooltip.classList.add('tooltip--visible');
    this.isVisible = true;
  }

  /**
   * Hide tooltip
   */
  hide() {
    // Clear any pending show timeout
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    
    // Clear any pending hide timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    if (!this.isVisible && !this.currentTarget) return;
    
    this.tooltip.classList.remove('tooltip--visible');
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.isVisible = false;
    this.currentTarget = null;
  }

  /**
   * Calculate best position automatically (avoids viewport edges)
   */
  calculateAutoPosition(target) {
    const rect = target.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    
    // Temporarily make tooltip visible to measure it
    const wasVisible = this.tooltip.classList.contains('tooltip--visible');
    if (!wasVisible) {
      this.tooltip.style.visibility = 'hidden';
      this.tooltip.style.display = 'block';
    }
    const tooltipRect = this.tooltip.getBoundingClientRect();
    if (!wasVisible) {
      this.tooltip.style.visibility = '';
      this.tooltip.style.display = '';
    }
    
    const space = {
      top: rect.top,
      bottom: viewport.height - rect.bottom,
      left: rect.left,
      right: viewport.width - rect.right
    };
    
    // Prefer top, but check if there's enough space
    if (space.top >= tooltipRect.height + this.offset) {
      return 'top';
    }
    // Prefer bottom
    if (space.bottom >= tooltipRect.height + this.offset) {
      return 'bottom';
    }
    // Prefer right
    if (space.right >= tooltipRect.width + this.offset) {
      return 'right';
    }
    // Prefer left
    if (space.left >= tooltipRect.width + this.offset) {
      return 'left';
    }
    
    // Fallback to top
    return 'top';
  }

  /**
   * Update tooltip position relative to target
   */
  updatePosition(target, position) {
    // Make tooltip visible temporarily to measure it
    const wasVisible = this.tooltip.classList.contains('tooltip--visible');
    if (!wasVisible) {
      this.tooltip.style.visibility = 'hidden';
      this.tooltip.style.display = 'block';
      this.tooltip.style.opacity = '0';
    }
    
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    let top = 0;
    let left = 0;
    
    switch (position) {
      case 'top':
        top = targetRect.top + scrollY - tooltipRect.height - this.offset;
        left = targetRect.left + scrollX + (targetRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'bottom':
        top = targetRect.bottom + scrollY + this.offset;
        left = targetRect.left + scrollX + (targetRect.width / 2) - (tooltipRect.width / 2);
        break;
      case 'left':
        top = targetRect.top + scrollY + (targetRect.height / 2) - (tooltipRect.height / 2);
        left = targetRect.left + scrollX - tooltipRect.width - this.offset;
        break;
      case 'right':
        top = targetRect.top + scrollY + (targetRect.height / 2) - (tooltipRect.height / 2);
        left = targetRect.right + scrollX + this.offset;
        break;
    }
    
    // Ensure tooltip stays within viewport (with padding)
    const padding = 8;
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    const maxLeft = scrollX + viewport.width - tooltipRect.width - padding;
    const maxTop = scrollY + viewport.height - tooltipRect.height - padding;
    
    left = Math.max(scrollX + padding, Math.min(left, maxLeft));
    top = Math.max(scrollY + padding, Math.min(top, maxTop));
    
    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.setAttribute('data-position', position);
    
    // Restore visibility state
    if (!wasVisible) {
      this.tooltip.style.visibility = '';
      this.tooltip.style.display = '';
      this.tooltip.style.opacity = '';
    }
  }

  /**
   * Programmatic API: Show tooltip on element
   * @param {HTMLElement|string} element - Element or selector
   * @param {string} text - Tooltip text
   * @param {string} position - Optional position
   */
  showTooltip(element, text, position = null) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return;
    this.show(el, text, position);
  }

  /**
   * Programmatic API: Hide tooltip
   */
  hideTooltip() {
    this.hide();
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    if (this.showTimeout) clearTimeout(this.showTimeout);
    if (this.tooltip) this.tooltip.remove();
    // Note: Event listeners are on document, so we'd need to track them to remove
    // For now, this is fine as the tooltip controller lives for the app lifetime
  }
}

