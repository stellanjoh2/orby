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
    this._cursorMode = false;
    /** @type {Array<{ el: EventTarget, handler: (e: Event) => void }>} */
    this._scrollListeners = [];

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
    
    // Global mouse move to check if we're still over a tooltip element
    document.addEventListener('mousemove', this.handleMouseMove.bind(this), true);
    
    // Hide tooltip on click anywhere
    document.addEventListener('click', this.handleClick.bind(this), true);

    this._bindScrollHide();

    // Touch support for mobile
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
  }

  /**
   * Handle mouse enter on elements with data-tooltip
   */
  handleMouseEnter(event) {
    if (this._cursorMode) {
      this.hide();
    }

    // Handle cases where event.target might not have closest (e.g., SVG elements)
    let target = null;
    if (event.target && typeof event.target.closest === 'function') {
      target = event.target.closest('[data-tooltip]');
    } else if (event.target && event.target.parentElement) {
      // Fallback: traverse up the DOM tree manually
      let element = event.target.parentElement;
      while (element && element !== document.body) {
        if (element.hasAttribute && element.hasAttribute('data-tooltip')) {
          target = element;
          break;
        }
        element = element.parentElement;
      }
    }
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
    // Handle cases where event.target might not have closest (e.g., SVG elements)
    let target = null;
    if (event.target && typeof event.target.closest === 'function') {
      target = event.target.closest('[data-tooltip]');
    } else if (event.target && event.target.parentElement) {
      // Fallback: traverse up the DOM tree manually
      let element = event.target.parentElement;
      while (element && element !== document.body) {
        if (element.hasAttribute && element.hasAttribute('data-tooltip')) {
          target = element;
          break;
        }
        element = element.parentElement;
      }
    }
    
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
    
    // Also check if we're leaving the tooltip itself
    if (event.relatedTarget === this.tooltip || this.tooltip.contains(event.relatedTarget)) {
      // Mouse is moving to tooltip, don't hide yet
      return;
    }
    
    // If we're not moving to another tooltip element, hide
    if (!target && this.isVisible) {
      this.hide();
    }
  }
  
  /**
   * Handle mouse move - check if we're still over a tooltip element
   * Only runs occasionally to avoid performance issues
   */
  handleMouseMove(event) {
    // Only check if tooltip is visible and throttle checks
    if (!this.isVisible || !this.currentTarget) return;
    
    // Throttle: only check every 100ms to avoid performance issues
    if (!this.lastMouseMoveCheck) {
      this.lastMouseMoveCheck = 0;
    }
    const now = performance.now();
    if (now - this.lastMouseMoveCheck < 100) return;
    this.lastMouseMoveCheck = now;
    
    // Check if current target still exists in DOM (might have been removed)
    if (!document.body.contains(this.currentTarget)) {
      this.hide();
      return;
    }
    
    // Check if mouse is still over the current target or the tooltip itself
    const isOverTarget = this.currentTarget.contains(event.target) || this.currentTarget === event.target;
    const isOverTooltip = this.tooltip.contains(event.target) || this.tooltip === event.target;
    
    // If mouse is not over target or tooltip, check if we're moving to another tooltip
    if (!isOverTarget && !isOverTooltip) {
      let newTarget = null;
      if (event.target && typeof event.target.closest === 'function') {
        newTarget = event.target.closest('[data-tooltip]');
      }
      
      // If not moving to another tooltip, hide
      if (!newTarget) {
        this.hide();
      }
    }
  }
  
  /**
   * Handle click - hide tooltip on any click
   */
  handleClick(event) {
    // Don't hide if clicking on the tooltip itself
    if (this.tooltip.contains(event.target)) return;
    
    // Hide tooltip on any click
    if (this.isVisible) {
      this.hide();
    }
  }
  
  /**
   * Shelf `.panels` scroll only (not document capture — avoids work on every page scroll).
   * Window scroll hides tooltips outside the fixed shelf (e.g. dropzone).
   */
  _bindScrollHide() {
    const onScroll = (event) => this.handleScroll(event);
    const panels = document.querySelector('.panels');
    if (panels) {
      panels.addEventListener('scroll', onScroll, { passive: true });
      this._scrollListeners.push({ el: panels, handler: onScroll });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    this._scrollListeners.push({ el: window, handler: onScroll });
  }

  /**
   * Hide when scroll would desync tooltip from its target.
   */
  handleScroll(event) {
    if (!this.isVisible) return;
    if (this._cursorMode) {
      this.hide();
      return;
    }
    if (!this.currentTarget) return;
    const root = event.currentTarget;
    const inShelf = !!this.currentTarget.closest('#shelf');
    if (root instanceof Element && root.classList.contains('panels')) {
      if (inShelf) this.hide();
      return;
    }
    if (root === window && !inShelf) {
      this.hide();
    }
  }

  /**
   * Handle focus (keyboard navigation)
   */
  handleFocus(event) {
    // Handle cases where event.target might not have closest
    let target = null;
    if (event.target && typeof event.target.closest === 'function') {
      target = event.target.closest('[data-tooltip]');
    } else if (event.target && event.target.parentElement) {
      let element = event.target.parentElement;
      while (element && element !== document.body) {
        if (element.hasAttribute && element.hasAttribute('data-tooltip')) {
          target = element;
          break;
        }
        element = element.parentElement;
      }
    }
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
    // Handle cases where event.target might not have closest
    let target = null;
    if (event.target && typeof event.target.closest === 'function') {
      target = event.target.closest('[data-tooltip]');
    } else if (event.target && event.target.parentElement) {
      let element = event.target.parentElement;
      while (element && element !== document.body) {
        if (element.hasAttribute && element.hasAttribute('data-tooltip')) {
          target = element;
          break;
        }
        element = element.parentElement;
      }
    }
    if (!target || target === this.currentTarget) return;
    
    this.hide();
  }

  /**
   * Handle touch (mobile)
   */
  handleTouchStart(event) {
    // Handle cases where event.target might not have closest
    let target = null;
    if (event.target && typeof event.target.closest === 'function') {
      target = event.target.closest('[data-tooltip]');
    } else if (event.target && event.target.parentElement) {
      let element = event.target.parentElement;
      while (element && element !== document.body) {
        if (element.hasAttribute && element.hasAttribute('data-tooltip')) {
          target = element;
          break;
        }
        element = element.parentElement;
      }
    }
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

    this.tooltip.classList.remove('tooltip--viewport');
    
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
    
    // Always hide if called, even if state seems inconsistent
    if (!this.isVisible && !this.currentTarget && !this._cursorMode) {
      // Force cleanup anyway
      this.tooltip.classList.remove('tooltip--visible', 'tooltip--viewport');
      this.tooltip.setAttribute('aria-hidden', 'true');
      return;
    }
    
    this.tooltip.classList.remove('tooltip--visible', 'tooltip--viewport');
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.isVisible = false;
    this.currentTarget = null;
    this._cursorMode = false;
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
   * Show tooltip anchored above a screen point (e.g. 3D viewport bone hover).
   * @param {number} clientX
   * @param {number} clientY
   * @param {string} text
   */
  showAtPoint(clientX, clientY, text) {
    if (!text) return;

    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }

    this.currentTarget = null;
    this._cursorMode = true;
    this.tooltip.classList.add('tooltip--viewport');
    this.tooltip.textContent = text;
    this.tooltip.setAttribute('aria-hidden', 'false');
    this.updatePositionAtPoint(clientX, clientY);
    this.tooltip.classList.add('tooltip--visible');
    this.isVisible = true;
  }

  /**
   * Reposition cursor-anchored tooltip (call on pointermove while visible).
   * @param {number} clientX
   * @param {number} clientY
   */
  updatePositionAtPoint(clientX, clientY) {
    const cursorOffset = 12;
    const padding = 8;
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const wasVisible = this.tooltip.classList.contains('tooltip--visible');
    if (!wasVisible) {
      this.tooltip.style.visibility = 'hidden';
      this.tooltip.style.display = 'block';
      this.tooltip.style.opacity = '0';
    }

    const tooltipRect = this.tooltip.getBoundingClientRect();

    if (!wasVisible) {
      this.tooltip.style.visibility = '';
      this.tooltip.style.display = '';
      this.tooltip.style.opacity = '';
    }

    let left = clientX + scrollX - tooltipRect.width / 2;
    let top = clientY + scrollY - tooltipRect.height - cursorOffset;

    const maxLeft = scrollX + window.innerWidth - tooltipRect.width - padding;
    const maxTop = scrollY + window.innerHeight - tooltipRect.height - padding;

    left = Math.max(scrollX + padding, Math.min(left, maxLeft));
    top = Math.max(scrollY + padding, Math.min(top, maxTop));

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.setAttribute('data-position', 'top');
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    if (this.showTimeout) clearTimeout(this.showTimeout);
    for (const { el, handler } of this._scrollListeners) {
      el.removeEventListener('scroll', handler);
    }
    this._scrollListeners.length = 0;
    if (this.tooltip) this.tooltip.remove();
    // Note: Other listeners are on document; fine for app lifetime
  }
}

