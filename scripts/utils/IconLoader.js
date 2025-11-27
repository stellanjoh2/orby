/**
 * Heroicons Icon Loader using Iconify API
 * Replaces data-heroicon attributes with Heroicons SVGs
 */

// Map Lucide icon names to Heroicons (Iconify format)
const ICON_MAP = {
  // Tab icons
  'box': 'heroicons-outline:cube',
  'lightbulb': 'heroicons-outline:light-bulb',
  'camera': 'heroicons-outline:camera',
  'info': 'heroicons-outline:information-circle',
  
  // Action icons
  'rotate-ccw': 'heroicons-outline:arrow-path',
  'download': 'heroicons-outline:arrow-down-tray',
  'copy': 'heroicons-outline:document-duplicate',
  'upload': 'heroicons-outline:arrow-up-tray',
  'x': 'heroicons-outline:x-mark',
  'keyboard': 'heroicons-outline:keyboard',
  'mouse-pointer-2': 'heroicons-outline:cursor-arrow-rays',
  'gamepad-2': 'heroicons-outline:device-phone-mobile',
  'sparkles': 'heroicons-outline:sparkles',
  'shield': 'heroicons-outline:shield-check',
  'heart': 'heroicons-outline:heart',
};

// Cache for loaded SVGs
const svgCache = new Map();

async function loadIcon(iconName) {
  const iconifyId = ICON_MAP[iconName];
  if (!iconifyId) {
    console.warn(`Icon "${iconName}" not found in icon map`);
    return null;
  }

  if (svgCache.has(iconifyId)) {
    return svgCache.get(iconifyId);
  }

  try {
    // Use Iconify API to get SVG
    const response = await fetch(`https://api.iconify.design/${iconifyId}.svg`);
    if (response.ok) {
      const svgText = await response.text();
      svgCache.set(iconifyId, svgText);
      return svgText;
    }
  } catch (error) {
    console.warn(`Failed to load icon "${iconName}":`, error);
  }

  return null;
}

export function createIcons() {
  const iconElements = document.querySelectorAll('[data-heroicon]');
  
  return Promise.all(Array.from(iconElements).map(async (element) => {
    const iconName = element.getAttribute('data-heroicon');
    const size = element.getAttribute('size') || '24';
    
    const svgText = await loadIcon(iconName);
    if (svgText) {
      // Parse SVG and set size
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
      const svg = svgDoc.querySelector('svg');
      
      if (svg) {
        // Set size attributes
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.style.width = `${size}px`;
        svg.style.height = `${size}px`;
        
        // Ensure all path elements have consistent stroke - normalize everything
        const paths = svg.querySelectorAll('path');
        paths.forEach((path) => {
          // Remove any existing stroke-width that might differ
          path.removeAttribute('stroke-width');
          path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '1.5');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.setAttribute('fill', 'none');
        });
        
        // Also normalize any other shape elements (circles, rects, etc.)
        const shapes = svg.querySelectorAll('circle, rect, line, polyline, polygon');
        shapes.forEach((shape) => {
          shape.setAttribute('stroke', 'currentColor');
          shape.setAttribute('stroke-width', '1.5');
          shape.setAttribute('stroke-linecap', 'round');
          shape.setAttribute('stroke-linejoin', 'round');
          if (!shape.hasAttribute('fill') || shape.getAttribute('fill') !== 'none') {
            shape.setAttribute('fill', 'none');
          }
        });
        
        // Clear element and append SVG
        element.innerHTML = '';
        element.appendChild(svg);
      }
    }
  }));
}

