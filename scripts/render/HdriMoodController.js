import * as THREE from 'three';
export class HdriMoodController {
  constructor({
    renderer,
    groundController,
    getState,
    updateBloom,
    updateGrain,
    setBloomState,
    fallbackBackgroundColor = '#000000',
  }) {
    this.renderer = renderer;
    this.groundController = groundController;
    this.getState = getState;
    this.updateBloom = updateBloom;
    this.updateGrain = updateGrain;
    this.setBloomState = setBloomState;
    this.fallbackBackgroundColor = fallbackBackgroundColor;
  }

  setFallbackBackgroundColor(color) {
    if (!color) return;
    this.fallbackBackgroundColor = color;
  }

  apply(style, { hdriBackgroundEnabled, hdriEnabled }) {
    const state = this.getState?.() ?? {};
    if (!style) {
      this.groundController?.setSolidColor(state.groundSolidColor);
      if (!hdriBackgroundEnabled || !hdriEnabled) {
        this.renderer.setClearColor(
          new THREE.Color(this.fallbackBackgroundColor),
          1,
        );
      }
      if (state.bloom) this.updateBloom?.(state.bloom);
      if (state.grain) this.updateGrain?.(state.grain);
      return;
    }

    if (style.baseColor ?? style.podiumColor) {
      this.groundController?.setSolidColor(style.baseColor ?? style.podiumColor);
    }

    if (style.background && (!hdriBackgroundEnabled || !hdriEnabled)) {
      this.renderer.setClearColor(new THREE.Color(style.background), 1);
      this.fallbackBackgroundColor = style.background;
    }

    if (style.bloomTint && state.bloom) {
      const bloomState = {
        ...state.bloom,
        enabled: true,
        color: style.bloomTint,
        strength: state.bloom.strength,
        radius: state.bloom.radius,
      };
      this.setBloomState?.(bloomState);
      this.updateBloom?.(bloomState);
    }
  }
}

