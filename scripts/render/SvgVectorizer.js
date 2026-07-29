import {
  buildScreenPixelSvg,
  resolveScreenPixelBgFill,
  resolveScreenPixelGridLayout,
  sampleScreenPixelGridFromCanvasData,
} from './screenPixelSvgExport.js';

/**
 * SvgVectorizer
 *
 * Pure image-data → SVG vectorization pipeline extracted from ImageExporter.
 * Operates on canvas data URLs / ImageData / SVG strings via ImageTracer; holds
 * no renderer, scene, or composer state. The only instance state is the
 * ImageTracer load cache, so a single shared instance is safe to reuse.
 */
export class SvgVectorizer {
  constructor() {
    this._imageTracerLoaded = false;
  }

  /**
   * Map UI detail level to ImageTracer options (colors, path coarsening, small-path culling).
   * @param {'low'|'medium'|'high'} detail
   */
  getSvgColorVectorizeOptions(detail) {
    const level = detail === 'low' || detail === 'medium' ? detail : 'high';
    if (level === 'low') {
      // Very few colors alone creates jagged “busy” banding; blur before quantize
      // and aggressive pathomit / ltres keep Low visibly simpler than Medium.
      return {
        options: {
          colorsampling: 1,
          numberofcolors: 10,
          colorquantcycles: 1,
          mincolorratio: 0.008,
          pathomit: 22,
          ltres: 5,
          qtres: 5,
          blurradius: 3,
          blurdelta: 64,
          linefilter: false,
          roundcoords: 2,
          // Fill-only paths: ImageTracer's default stroke-width 1 reads as bold outlines at edges.
          strokewidth: 0,
        },
        preserveHighlights: false,
      };
    }
    if (level === 'medium') {
      return {
        options: {
          colorsampling: 1,
          numberofcolors: 32,
          colorquantcycles: 3,
          mincolorratio: 0.0005,
          pathomit: 4,
          ltres: 1.9,
          qtres: 1.9,
          blurradius: 0,
          blurdelta: 20,
          linefilter: false,
          // -1: full float path coords; fewer integer-rounding steps → fewer vector microgaps
          roundcoords: -1,
          strokewidth: 0,
        },
        preserveHighlights: true,
      };
    }
    // high — maximum palette and trace fidelity (previous default)
    return {
      options: {
        colorsampling: 1,
        numberofcolors: 64,
        colorquantcycles: 5,
        mincolorratio: 0,
        pathomit: 0,
        ltres: 1,
        qtres: 1,
        blurradius: 0,
        blurdelta: 20,
        linefilter: false,
        roundcoords: -1,
        strokewidth: 0,
      },
      preserveHighlights: true,
    };
  }

  buildScreenPixelSvgFromCanvasDataUrl(dataUrl, width, height, presetId, opts = {}) {
    const transparent = opts.transparent === true;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = width;
          offscreen.height = height;
          const ctx = offscreen.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const layout = resolveScreenPixelGridLayout(presetId, width, height);
          const cells = sampleScreenPixelGridFromCanvasData(
            imageData.data,
            width,
            height,
            layout,
          );
          resolve(buildScreenPixelSvg(cells, layout.cols, layout.rows, {
            pixelWidth: width,
            pixelHeight: height,
            cellPxW: layout.cellPxW,
            cellPxH: layout.cellPxH,
            transparent,
            bgFill: resolveScreenPixelBgFill(opts.bgFill),
          }));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Pixel capture failed'));
      img.src = dataUrl;
    });
  }

  async vectorizeSilhouette(dataUrl) {
    await this._ensureImageTracer();
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

          // Hard black/white threshold from the rendered silhouette image.
          // Keep this isolated from color export processing.
          const threshold = 240;
          for (let i = 0; i < imageData.data.length; i += 4) {
            const lum =
              0.2126 * imageData.data[i] +
              0.7152 * imageData.data[i + 1] +
              0.0722 * imageData.data[i + 2];
            const isBg = lum >= threshold;
            imageData.data[i] = isBg ? 255 : 0;
            imageData.data[i + 1] = isBg ? 255 : 0;
            imageData.data[i + 2] = isBg ? 255 : 0;
            imageData.data[i + 3] = 255;
          }

          const options = {
            colorsampling: 0,
            numberofcolors: 2,
            pathomit: 0,
            ltres: 1,
            qtres: 1,
            blur: 0,
            linefilter: false,
          };

          const svgstr = window.ImageTracer?.imagedataToSVG
            ? window.ImageTracer.imagedataToSVG(imageData, options)
            : null;
          resolve(svgstr);
        } catch (err) {
          console.error('ImageTracer silhouette vectorization error', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  async vectorizeWithOptions(dataUrl, options, processing = {}) {
    await this._ensureImageTracer();
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const offscreen = document.createElement('canvas');
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext('2d');
          ctx.drawImage(img, 0, 0);
          let imageData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);

          if (processing.preserveHighlights) {
            this._boostHighlights(imageData.data);
          }

          // Use alpha as ground truth for mesh/background separation.
          // Transparent pixels are replaced with a key color, then stripped from SVG.
          const bgKey = [1, 255, 1];
          if (processing.silhouetteBinaryLuma) {
            this._applyLuminanceBinaryMask(imageData.data, 245, bgKey);
            this._fillTinyBackgroundHoles(imageData, bgKey, 6);
          } else if (processing.alphaMask) {
            if (processing.silhouetteBinary) {
              this._applySilhouetteBinaryMask(imageData.data, 1, bgKey);
            } else {
              this._applyAlphaMaskForVector(imageData.data, bgKey);
              this._morphCloseMask(imageData, bgKey, 1);
            }
            this._fillTinyBackgroundHoles(imageData, bgKey, 24);
            if (!processing.silhouetteBinary) {
              this._healLuminanceSeamFringe(imageData, bgKey, {
                centerLumMin: 235,
                neighborLumMax: 215,
                minVotes: 2,
              });
              // Second pass: slightly looser (more mid tones as anchors) for stubborn microgaps.
              // Skipped for color SVG — it often paints a bright fringe band at silhouettes.
              if (!processing.singleSeamFringePass) {
                this._healLuminanceSeamFringe(imageData, bgKey, {
                  centerLumMin: 218,
                  neighborLumMax: 232,
                  minVotes: 3,
                });
              }
            }
            const seamIt = Number(processing.rasterSeamHealIterations) || 0;
            if (seamIt > 0 && !processing.silhouetteBinary) {
              this._majoritySqueezeImageData(imageData, bgKey, seamIt);
            }
            if (!processing.silhouetteBinary) {
              this._microSnapBrightOutliersToNeighborConsensus(imageData, bgKey, 2);
            }
          }

          if (processing.alphaMask || processing.silhouetteBinaryLuma) {
            imageData = this._cropImageDataByKeyColor(imageData, bgKey, 2);
          }

          let svgstr = window.ImageTracer?.imagedataToSVG
            ? window.ImageTracer.imagedataToSVG(imageData, options)
            : null;
          if (svgstr && (processing.alphaMask || processing.silhouetteBinaryLuma)) {
            svgstr = this._removeKeyColorPaths(svgstr, bgKey);
            if (processing.alphaMask) {
              svgstr = this._removeNearKeyColorPaths(svgstr, bgKey, 52);
            }
            if (processing.hairlineSeamStroke && processing.alphaMask && !processing.silhouetteBinary) {
              svgstr = this._addHairlineSeamStrokesToSvg(svgstr);
            }
            if (processing.stripPathStrokes) {
              svgstr = this._stripSvgPathStrokes(svgstr);
            }
          }
          if (svgstr && processing.removeWhiteBackground) {
            svgstr = this._removeWhitePaths(svgstr);
          }
          resolve(svgstr);
        } catch (err) {
          console.error('ImageTracer vectorization error', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  _boostHighlights(data) {
    // Targeted tonal lift before quantization:
    // stronger on already bright pixels to preserve specular details.
    const gamma = 0.86;
    const lift = 6;
    const highlightStart = 0.72;
    const extraHighlightGain = 0.35;
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const highlightT = Math.max(0, (luminance - highlightStart) / (1 - highlightStart));
      for (let c = 0; c < 3; c += 1) {
        const normalized = data[i + c] / 255;
        let corrected = Math.pow(normalized, gamma) * 255 + lift;
        if (highlightT > 0) {
          corrected *= 1 + extraHighlightGain * highlightT;
        }
        data[i + c] = Math.min(255, Math.max(0, Math.round(corrected)));
      }
    }
  }

  /**
   * Opaque Pixels: un-premultiply. Fully transparent: key (stripped from SVG after trace).
   * Do NOT key low-alpha **edge** pixels: those are mesh AA; keying and removing their paths
   * is what created hairline “see-through” holes between color fields.
   */
  _applyAlphaMaskForVector(data, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 1) {
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
        data[i + 3] = 255;
      } else {
        const inv = 255 / a;
        data[i] = Math.min(255, Math.round(data[i] * inv));
        data[i + 1] = Math.min(255, Math.round(data[i + 1] * inv));
        data[i + 2] = Math.min(255, Math.round(data[i + 2] * inv));
        data[i + 3] = 255;
      }
    }
  }

  _applySilhouetteBinaryMask(data, alphaCutoff = 1, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < alphaCutoff) {
        // Background key
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
      } else {
        // Force solid silhouette foreground
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
      data[i + 3] = 255;
    }
  }

  _applyLuminanceBinaryMask(data, whiteThreshold = 245, bgKey = [1, 255, 1]) {
    const [kr, kg, kb] = bgKey;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (lum >= whiteThreshold) {
        data[i] = kr;
        data[i + 1] = kg;
        data[i + 2] = kb;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
      data[i + 3] = 255;
    }
  }

  /**
   * Merge bright seam pixels into dominant darker 3×3 neighbor color (k-means + trace
   * otherwise leave 1px “third” colors or no fill → white microgaps). Params tune aggressiveness.
   * @param {{ centerLumMin: number, neighborLumMax: number, minVotes: number }} opts
   */
  _healLuminanceSeamFringe(imageData, keyRgb, opts) {
    const { centerLumMin, neighborLumMax, minVotes } = opts;
    const [kr, kg, kb] = keyRgb;
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;
    const isKey = (j) => src[j] === kr && src[j + 1] === kg && src[j + 2] === kb;
    const lumAt = (buf, j) => 0.2126 * buf[j] + 0.7152 * buf[j + 1] + 0.0722 * buf[j + 2];
    const buf = new Uint8ClampedArray(src);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const o = (y * w + x) * 4;
        if (isKey(o)) continue;
        if (lumAt(src, o) < centerLumMin) continue;
        const counts = new Map();
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = (ny * w + nx) * 4;
            if (isKey(j)) continue;
            if (lumAt(src, j) > neighborLumMax) continue;
            const k = `${src[j]},${src[j + 1]},${src[j + 2]}`;
            counts.set(k, (counts.get(k) || 0) + 1);
          }
        }
        if (counts.size === 0) continue;
        let bestK = null;
        let bestN = 0;
        for (const [k, n] of counts) {
          if (n > bestN) {
            bestN = n;
            bestK = k;
          }
        }
        if (bestN < minVotes) continue;
        const [r, g, b] = bestK.split(',').map(Number);
        buf[o] = r;
        buf[o + 1] = g;
        buf[o + 2] = b;
        buf[o + 3] = 255;
      }
    }
    imageData.data.set(buf);
  }

  /**
   * 3×3 majority vote of opaque colors (skips key). Collapses 1px AA speckle so imagetracer
   * does not leave tiny "third color" slivers that pathomit can drop → holes.
   */
  _majoritySqueezeImageData(imageData, keyRgb, iterations = 1) {
    const [kr, kg, kb] = keyRgb;
    const w = imageData.width;
    const h = imageData.height;
    const isKey = (b, j) => b[j] === kr && b[j + 1] === kg && b[j + 2] === kb;
    const buf = new Uint8ClampedArray(imageData.data);
    const next = new Uint8ClampedArray(buf.length);

    for (let it = 0; it < iterations; it += 1) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const counts = new Map();
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const j = (ny * w + nx) * 4;
              if (isKey(buf, j)) continue;
              const k = `${buf[j]},${buf[j + 1]},${buf[j + 2]}`;
              counts.set(k, (counts.get(k) || 0) + 1);
            }
          }
          const o = (y * w + x) * 4;
          if (counts.size === 0) {
            next[o] = buf[o];
            next[o + 1] = buf[o + 1];
            next[o + 2] = buf[o + 2];
            next[o + 3] = buf[o + 3];
            continue;
          }
          let bestK = null;
          let bestN = -1;
          for (const [k, n] of counts) {
            if (n > bestN) {
              bestN = n;
              bestK = k;
            }
          }
          const [r, g, b] = bestK.split(',').map(Number);
          next[o] = r;
          next[o + 1] = g;
          next[o + 2] = b;
          next[o + 3] = 255;
        }
      }
      buf.set(next);
    }
    imageData.data.set(buf);
  }

  /**
   * Last raster pass: 1px “sparkle” holes are often L≈255 while 5–6 8-neighbors are the
   * same mid/dark k-means color. Real bright regions (e.g. large white shapes) do not
   * get 5+ identical neighbors, so we leave them alone.
   */
  _microSnapBrightOutliersToNeighborConsensus(imageData, keyRgb, iterations = 2) {
    const [kr, kg, kb] = keyRgb;
    const w = imageData.width;
    const h = imageData.height;
    const isKey = (b, o) => b[o] === kr && b[o + 1] === kg && b[o + 2] === kb;
    const lumAt = (b, o) => 0.2126 * b[o] + 0.7152 * b[o + 1] + 0.0722 * b[o + 2];
    const minNeighborAlign = 5;
    const centerLumMin = 241;

    for (let pass = 0; pass < iterations; pass += 1) {
      const src = imageData.data;
      const out = new Uint8ClampedArray(src.length);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const o = (y * w + x) * 4;
          if (isKey(src, o)) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          if (lumAt(src, o) < centerLumMin) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          const counts = new Map();
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const j = (ny * w + nx) * 4;
              if (isKey(src, j)) continue;
              const k = `${src[j]},${src[j + 1]},${src[j + 2]}`;
              counts.set(k, (counts.get(k) || 0) + 1);
            }
          }
          if (counts.size === 0) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          let bestK = null;
          let bestN = 0;
          for (const [k, n] of counts) {
            if (n > bestN) {
              bestN = n;
              bestK = k;
            }
          }
          if (bestN < minNeighborAlign) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = src[o + 3];
            continue;
          }
          const [r, g, b] = bestK.split(',').map(Number);
          if (r === src[o] && g === src[o + 1] && b === src[o + 2]) {
            out[o] = src[o];
            out[o + 1] = src[o + 1];
            out[o + 2] = src[o + 2];
            out[o + 3] = 255;
            continue;
          }
          out[o] = r;
          out[o + 1] = g;
          out[o + 2] = b;
          out[o + 3] = 255;
        }
      }
      imageData.data.set(out);
    }
  }

  /**
   * Remove same-color outline strokes ImageTracer emits (and any leftover seam-stroke attrs).
   * Fill-only paths avoid the bold “double edge” look at color boundaries and silhouettes.
   */
  _stripSvgPathStrokes(svgString) {
    if (typeof window === 'undefined' || !window.DOMParser) return svgString;
    try {
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      const parseErr = doc.querySelector('parsererror');
      if (parseErr) return svgString;
      const root = doc.documentElement;
      if (!root || root.localName.toLowerCase() !== 'svg') return svgString;

      const strip = (el) => {
        el.setAttribute('stroke', 'none');
        el.removeAttribute('stroke-width');
        el.removeAttribute('stroke-linejoin');
        el.removeAttribute('stroke-linecap');
        el.removeAttribute('stroke-miterlimit');
        el.removeAttribute('paint-order');
        el.removeAttribute('vector-effect');
        const st = el.getAttribute('style');
        if (st) {
          const next = st
            .replace(/stroke[^;]*/gi, '')
            .replace(/stroke-width[^;]*/gi, '')
            .replace(/paint-order[^;]*/gi, '')
            .replace(/;+/g, ';')
            .replace(/^;|;$/g, '')
            .trim();
          if (next) {
            el.setAttribute('style', next);
          } else {
            el.removeAttribute('style');
          }
        }
      };

      root.querySelectorAll('path, rect, polygon, polyline, circle, ellipse').forEach(strip);
      if (window.XMLSerializer) {
        return new window.XMLSerializer().serializeToString(root);
      }
    } catch (e) {
      console.warn('strip path strokes failed', e);
    }
    return svgString;
  }

  /**
   * Slight same-color under-stroke to bridge hairline gaps. ImageTracer already uses
   * stroke-width 1; we nudge a little by view size but stay near 1 so dense traces do
   * not look like pebbles (thick stroke + round caps on tiny paths reads as "dots").
   */
  _addHairlineSeamStrokesToSvg(svgString) {
    if (typeof window === 'undefined' || !window.DOMParser) return svgString;
    try {
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      const parseErr = doc.querySelector('parsererror');
      if (parseErr) return svgString;
      const root = doc.documentElement;
      if (!root || root.localName.toLowerCase() !== 'svg') return svgString;

      let w = 800;
      let h = 600;
      const vb = root.getAttribute('viewBox');
      if (vb) {
        const p = vb.trim().split(/[\s,]+/).map(parseFloat);
        if (p.length >= 4) {
          w = Math.max(1, p[2] || w);
          h = Math.max(1, p[3] || h);
        }
      } else {
        const wAttr = root.getAttribute('width');
        const hAttr = root.getAttribute('height');
        if (wAttr) w = Math.max(1, parseFloat(wAttr) || w);
        if (hAttr) h = Math.max(1, parseFloat(hAttr) || h);
      }
      const m = Math.min(w, h);
      // Slight nudge over 1.0: seal remaining vector gaps without the old “pebble” width.
      const sw = Math.max(0.85, Math.min(1.52, 0.92 + m * 0.00035));

      const getFill = (el) => {
        let f = el.getAttribute('fill');
        if (f && f !== 'none') return f;
        const st = el.getAttribute('style');
        if (!st) return null;
        const mFill = st.match(/fill:\s*([^;]+)/i);
        return mFill ? mFill[1].trim() : null;
      };

      const apply = (el) => {
        const fill = getFill(el);
        if (!fill || fill === 'none' || /^\s*url\(/i.test(fill)) return;
        el.setAttribute('fill', fill);
        el.setAttribute('stroke', fill);
        el.setAttribute('stroke-width', String(sw));
        el.setAttribute('stroke-linejoin', 'miter');
        el.setAttribute('stroke-miterlimit', '2');
        el.setAttribute('stroke-linecap', 'butt');
        el.setAttribute('paint-order', 'stroke fill');
        if (el.hasAttribute('vector-effect')) {
          el.removeAttribute('vector-effect');
        }
        const st = el.getAttribute('style');
        if (st) {
          const next = st
            .replace(/stroke[^;]*/gi, '')
            .replace(/stroke-width[^;]*/gi, '')
            .replace(/fill[^;]*/gi, '')
            .replace(/;+/g, ';')
            .replace(/^;|;$/g, '')
            .trim();
          if (next) {
            el.setAttribute('style', next);
          } else {
            el.removeAttribute('style');
          }
        }
      };
      root.querySelectorAll('path, rect, polygon, polyline, circle, ellipse').forEach(apply);
      if (window.XMLSerializer) {
        return new window.XMLSerializer().serializeToString(root);
      }
    } catch (e) {
      console.warn('hairline seam stroke pass failed', e);
    }
    return svgString;
  }

  _fillTinyBackgroundHoles(imageData, keyRgb, maxHoleArea = 6) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    const visited = new Uint8Array(width * height);
    const neighbors4 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const neighbors8 = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    const isBg = (x, y) => {
      const i = (y * width + x) * 4;
      return data[i] === kr && data[i + 1] === kg && data[i + 2] === kb;
    };

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (visited[idx] || !isBg(x, y)) continue;

        // BFS background component
        const queue = [[x, y]];
        const pixels = [];
        visited[idx] = 1;
        let touchesBorder = false;

        for (let q = 0; q < queue.length; q += 1) {
          const [cx, cy] = queue[q];
          pixels.push([cx, cy]);
          if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) {
            touchesBorder = true;
          }
          for (const [dx, dy] of neighbors4) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nIdx = ny * width + nx;
            if (visited[nIdx] || !isBg(nx, ny)) continue;
            visited[nIdx] = 1;
            queue.push([nx, ny]);
          }
        }

        // Fill only tiny enclosed holes
        if (touchesBorder || pixels.length > maxHoleArea) continue;

        // Pick a representative neighboring foreground color
        let fillR = null;
        let fillG = null;
        let fillB = null;
        outer: for (const [px, py] of pixels) {
          for (const [dx, dy] of neighbors8) {
            const nx = px + dx;
            const ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (isBg(nx, ny)) continue;
            const i = (ny * width + nx) * 4;
            fillR = data[i];
            fillG = data[i + 1];
            fillB = data[i + 2];
            break outer;
          }
        }
        if (fillR === null) continue;

        for (const [px, py] of pixels) {
          const i = (py * width + px) * 4;
          data[i] = fillR;
          data[i + 1] = fillG;
          data[i + 2] = fillB;
          data[i + 3] = 255;
        }
      }
    }
  }

  _morphCloseMask(imageData, keyRgb, iterations = 1) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    const isBgAt = (arr, x, y) => {
      const i = (y * width + x) * 4;
      return arr[i] === kr && arr[i + 1] === kg && arr[i + 2] === kb;
    };

    // Convert to binary mask: 1 = foreground, 0 = background
    const base = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        base[y * width + x] = isBgAt(data, x, y) ? 0 : 1;
      }
    }

    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],  [0, 0],  [1, 0],
      [-1, 1],  [0, 1],  [1, 1],
    ];

    let mask = base;
    for (let it = 0; it < iterations; it += 1) {
      // Dilation
      const dilated = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let on = 0;
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (mask[ny * width + nx]) {
              on = 1;
              break;
            }
          }
          dilated[y * width + x] = on;
        }
      }

      // Erosion
      const eroded = new Uint8Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let on = 1;
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
              on = 0;
              break;
            }
            if (!dilated[ny * width + nx]) {
              on = 0;
              break;
            }
          }
          eroded[y * width + x] = on;
        }
      }
      mask = eroded;
    }

    // Apply closed mask back to imageData (keep original FG color, key BG color)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (!mask[y * width + x]) {
          data[i] = kr;
          data[i + 1] = kg;
          data[i + 2] = kb;
          data[i + 3] = 255;
        } else {
          data[i + 3] = 255;
        }
      }
    }
  }

  _removeKeyColorPaths(svg, keyRgb) {
    const [r, g, b] = keyRgb;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const rgb = `rgb(${r},${g},${b})`;
    const escapedHex = hex.replace('#', '\\#');
    const escapedRgb = rgb.replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    let output = svg.replace(
      new RegExp(`<path[^>]*fill=["'](?:${escapedHex}|${escapedRgb})["'][^>]*/?>`, 'gi'),
      '',
    );
    output = output.replace(
      new RegExp(`<rect[^>]*fill=["'](?:${escapedHex}|${escapedRgb})["'][^>]*/?>`, 'gi'),
      '',
    );
    // Remove any full-canvas background rectangles ImageTracer may emit.
    output = output.replace(/<rect[^>]*>/gi, (tag) => {
      const hasOrigin = /x=["']0(?:\.0+)?["']/.test(tag) || !/x=/.test(tag);
      const hasYOrigin = /y=["']0(?:\.0+)?["']/.test(tag) || !/y=/.test(tag);
      const fullW = /width=["'](?:100%|[0-9.]+)["']/.test(tag);
      const fullH = /height=["'](?:100%|[0-9.]+)["']/.test(tag);
      return hasOrigin && hasYOrigin && fullW && fullH ? '' : tag;
    });
    return output;
  }

  _removeNearKeyColorPaths(svg, keyRgb, tolerance = 52) {
    const toRgb = (fill) => {
      const lower = fill.toLowerCase().trim();
      if (lower.startsWith('#')) {
        let hex = lower.slice(1);
        if (hex.length === 3) {
          hex = hex.split('').map((c) => c + c).join('');
        }
        if (hex.length !== 6) return null;
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      }
      const m = lower.match(/^rgb\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\)$/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    };

    const colorDist = (a, b) => {
      const dr = a[0] - b[0];
      const dg = a[1] - b[1];
      const db = a[2] - b[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const [kr, kg, kb] = keyRgb;
    const key = [kr, kg, kb];

    return svg.replace(/<(path|rect)\b([^>]*?)\/?>/gi, (tag, el, attrs) => {
      const fillMatch = attrs.match(/\bfill=["']([^"']+)["']/i);
      if (!fillMatch) return tag;
      const rgb = toRgb(fillMatch[1]);
      if (!rgb) return tag;
      if (colorDist(rgb, key) <= tolerance) {
        return '';
      }
      return tag;
    });
  }

  _removeWhitePaths(svg) {
    // Remove white background geometry from strict silhouette traces.
    // Includes common white encodings emitted by imagetracer.
    let output = svg.replace(
      /<path[^>]*fill=["'](?:#fff(?:fff)?|rgb\(255,\s*255,\s*255\)|white)["'][^>]*\/?>/gi,
      '',
    );
    output = output.replace(
      /<rect[^>]*fill=["'](?:#fff(?:fff)?|rgb\(255,\s*255,\s*255\)|white)["'][^>]*\/?>/gi,
      '',
    );
    return output;
  }

  _cropImageDataByKeyColor(imageData, keyRgb, padding = 2) {
    const [kr, kg, kb] = keyRgb;
    const { data, width, height } = imageData;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const isBg = r === kr && g === kg && b === kb;
        if (!isBg) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    // If nothing found, return original
    if (maxX < minX || maxY < minY) {
      return imageData;
    }

    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(width - 1, maxX + padding);
    maxY = Math.min(height - 1, maxY + padding);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const cropped = new ImageData(cropW, cropH);

    for (let y = 0; y < cropH; y += 1) {
      for (let x = 0; x < cropW; x += 1) {
        const srcI = ((minY + y) * width + (minX + x)) * 4;
        const dstI = (y * cropW + x) * 4;
        cropped.data[dstI] = data[srcI];
        cropped.data[dstI + 1] = data[srcI + 1];
        cropped.data[dstI + 2] = data[srcI + 2];
        cropped.data[dstI + 3] = data[srcI + 3];
      }
    }

    return cropped;
  }

  async _ensureImageTracer() {
    if (this._imageTracerLoaded) return;
    if (typeof window !== 'undefined' && window.ImageTracer) {
      this._imageTracerLoaded = true;
      return;
    }
    // Prefer local copy, fall back to CDN
    await new Promise((resolve, reject) => {
      const tryLoad = (src, onfail) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
          this._imageTracerLoaded = true;
          resolve();
        };
        script.onerror = () => {
          script.remove();
          onfail?.();
        };
        document.head.appendChild(script);
      };
      tryLoad('./scripts/vendor/imagetracer_v1.2.6.js', () => {
        tryLoad('https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js', () => reject(new Error('ImageTracer load failed')));
      });
    });
  }
}
