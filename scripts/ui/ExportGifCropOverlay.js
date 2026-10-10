/**
 * Draggable horizontal crop width on the export capture preview (GIF + transparent + crop).
 * Width is centered on content; never narrower than the current frame's opaque bounds.
 */

import { normalizeGifManualCropWidth } from '../render/gif/gifCropUnion.js';

export class ExportGifCropOverlay {
  /**
   * @param {import('../UIManager.js').UIManager} ui
   */
  constructor(ui) {
    this.ui = ui;
    /** @type {{ frameWidth: number, frameHeight: number, contentMinCol: number, contentMaxCol: number, contentMinRow: number, contentMaxRow: number } | null} */
    this._meta = null;
    this._dragging = null;
    this._onPointerMove = (event) => this._handlePointerMove(event);
    this._onPointerUp = () => this._endDrag();
  }

  bind() {
    const overlay = this.ui.dom.exportGifCropOverlay;
    if (!overlay) return;
    overlay.querySelectorAll('[data-gif-crop-handle]').forEach((handle) => {
      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const side = handle.getAttribute('data-gif-crop-handle');
        if (side !== 'left' && side !== 'right') return;
        this._beginDrag(side, event);
      });
    });
    this.ui.dom.exportGifCropReset?.addEventListener('click', () => {
      this.ui.uiSounds?.playSelect?.();
      if (this.ui.exportSettings?.video) {
        this.ui.exportSettings.video.gifManualCropWidth = null;
      }
      this._render();
    });
  }

  /**
   * @param {{
   *   enabled?: boolean,
   *   frameWidth?: number,
   *   frameHeight?: number,
   *   contentBounds?: { minCol: number, minRow: number, maxCol: number, maxRow: number } | null,
   * }} meta
   */
  sync(meta = {}) {
    const overlay = this.ui.dom.exportGifCropOverlay;
    const hint = this.ui.dom.exportGifCropWidthHint;
    const resetBtn = this.ui.dom.exportGifCropReset;
    if (!overlay) return;

    const enabled = !!meta.enabled && !!meta.contentBounds && meta.frameWidth > 0;
    if (!enabled) {
      this._meta = null;
      overlay.hidden = true;
      if (hint) hint.hidden = true;
      if (resetBtn) resetBtn.hidden = true;
      return;
    }

    const b = meta.contentBounds;
    this._meta = {
      frameWidth: Math.round(meta.frameWidth),
      frameHeight: Math.round(meta.frameHeight || 1),
      contentMinCol: b.minCol,
      contentMaxCol: b.maxCol,
      contentMinRow: b.minRow,
      contentMaxRow: b.maxRow,
    };

    // Never keep a manual width narrower than this frame's content.
    const contentW = b.maxCol - b.minCol + 1;
    const video = this.ui.exportSettings?.video;
    if (video) {
      const current = normalizeGifManualCropWidth(
        video.gifManualCropWidth,
        this._meta.frameWidth,
      );
      if (current != null && current < contentW) {
        video.gifManualCropWidth = contentW;
      }
    }

    overlay.hidden = false;
    if (resetBtn) resetBtn.hidden = false;
    this._render();
  }

  hide() {
    this.sync({ enabled: false });
  }

  _contentWidth() {
    if (!this._meta) return 1;
    return this._meta.contentMaxCol - this._meta.contentMinCol + 1;
  }

  _resolvedWidth() {
    if (!this._meta) return 1;
    const contentW = this._contentWidth();
    const manual = normalizeGifManualCropWidth(
      this.ui.exportSettings?.video?.gifManualCropWidth,
      this._meta.frameWidth,
    );
    return manual != null ? Math.max(contentW, manual) : contentW;
  }

  _cropCols() {
    if (!this._meta) return { minCol: 0, maxCol: 0 };
    const { frameWidth, contentMinCol, contentMaxCol } = this._meta;
    const contentW = contentMaxCol - contentMinCol + 1;
    const width = this._resolvedWidth();
    const center = (contentMinCol + contentMaxCol) / 2;
    let minCol = Math.round(center - (width - 1) / 2);
    let maxCol = minCol + width - 1;
    if (minCol < 0) {
      maxCol -= minCol;
      minCol = 0;
    }
    if (maxCol > frameWidth - 1) {
      minCol -= maxCol - (frameWidth - 1);
      maxCol = frameWidth - 1;
    }
    // Keep content fully inside.
    if (minCol > contentMinCol) {
      maxCol += contentMinCol - minCol;
      minCol = contentMinCol;
    }
    if (maxCol < contentMaxCol) {
      minCol -= contentMaxCol - maxCol;
      maxCol = contentMaxCol;
    }
    minCol = Math.max(0, minCol);
    maxCol = Math.min(frameWidth - 1, maxCol);
    if (maxCol - minCol + 1 < contentW) {
      return { minCol: contentMinCol, maxCol: contentMaxCol };
    }
    return { minCol, maxCol };
  }

  _render() {
    const overlay = this.ui.dom.exportGifCropOverlay;
    const hint = this.ui.dom.exportGifCropWidthHint;
    if (!overlay || !this._meta) return;

    const {
      frameWidth,
      frameHeight,
      contentMinRow,
      contentMaxRow,
    } = this._meta;
    const { minCol, maxCol } = this._cropCols();
    const width = maxCol - minCol + 1;
    const height = contentMaxRow - contentMinRow + 1;
    const leftPct = (minCol / frameWidth) * 100;
    const topPct = (contentMinRow / frameHeight) * 100;
    const widthPct = (width / frameWidth) * 100;
    const heightPct = (height / frameHeight) * 100;

    const windowEl = overlay.querySelector('.export-gif-crop-overlay__window');
    if (windowEl) {
      // Match encode crop: content-tight height × (manual or content) width.
      windowEl.style.left = `${leftPct}%`;
      windowEl.style.top = `${topPct}%`;
      windowEl.style.width = `${widthPct}%`;
      windowEl.style.height = `${heightPct}%`;
    }

    const manual = normalizeGifManualCropWidth(
      this.ui.exportSettings?.video?.gifManualCropWidth,
      frameWidth,
    );
    if (hint) {
      hint.hidden = false;
      const auto = manual == null;
      hint.textContent = auto
        ? `GIF ${width}×${height}px · drag edges for width · scrub to check widest pose`
        : `GIF ${width}×${height}px (width manual) · min content ${this._contentWidth()}px wide`;
    }
  }

  _beginDrag(side, event) {
    if (!this._meta) return;
    const stage = this.ui.dom.exportCapturePreviewStage;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!(rect.width > 0)) return;
    this._dragging = {
      side,
      rectLeft: rect.left,
      rectWidth: rect.width,
      pointerId: event.pointerId,
    };
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    this._applyDrag(event.clientX);
  }

  _handlePointerMove(event) {
    if (!this._dragging) return;
    this._applyDrag(event.clientX);
  }

  _applyDrag(clientX) {
    if (!this._dragging || !this._meta || !this.ui.exportSettings?.video) return;
    const { side, rectLeft, rectWidth } = this._dragging;
    const { frameWidth, contentMinCol, contentMaxCol } = this._meta;
    const contentW = contentMaxCol - contentMinCol + 1;
    const xImg = ((clientX - rectLeft) / rectWidth) * frameWidth;
    const center = (contentMinCol + contentMaxCol) / 2;

    let width;
    if (side === 'left') {
      width = Math.round((center - xImg) * 2 + 1);
    } else {
      width = Math.round((xImg - center) * 2 + 1);
    }
    width = Math.max(contentW, Math.min(frameWidth, width));
    this.ui.exportSettings.video.gifManualCropWidth = width;
    this._render();
  }

  _endDrag() {
    if (!this._dragging) return;
    this._dragging = null;
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  }
}
