import { CAMERA_TEMPERATURE_NEUTRAL_K } from './constants.js';

const clone = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export class StateStore {
  constructor() {
    this.defaults = {
      shading: 'shaded',
      scale: 1,
      yOffset: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      autoRotate: 0,
      showNormals: false,
      diffuseBrightness: 1.0,
      hdri: 'meadow',
      hdriEnabled: true,
      hdriStrength: 1.50,
      hdriBlurriness: 0,
      hdriRotation: 0,
      hdriBackground: true,
      groundSolid: false,
      groundWire: false,
      groundWireOpacity: 1.0,
      groundY: 0,
      gridY: 0,
      podiumScale: 1,
      gridScale: 1,
      groundSolidColor: '#808080',
      groundWireColor: '#e1e1e1',
      clay: {
        color: '#808080',
        roughness: 0.5,
        specular: 0.5,
        normalMap: true,
      },
      wireframe: {
        alwaysOn: false,
        color: '#c8c8c8',
        onlyVisibleFaces: false,
      },
      fresnel: {
        enabled: false,
        color: '#808080',
        radius: 2,
        strength: 0.3,
      },
      lights: {
        key: { color: '#ffdfc9', intensity: 1.28 },
        fill: { color: '#b0c7ff', intensity: 0.8 },
        rim: { color: '#a0eaf9', intensity: 0.96 },
        ambient: { color: '#7c8ca6', intensity: 0.48 },
      },
      lightsEnabled: true,
      lightsMaster: 0.30,
      lightsRotation: 0,
      lightsAutoRotate: false,
      showLightIndicators: false,
      lensFlare: {
        enabled: false,
        rotation: 0,
        height: 15,
        color: '#d28756',
        quality: 'maximum',
      },
      dof: {
        enabled: false,
        focus: 1.5, // Very close focus for tight asset viewing
        aperture: 0.003, // Moderate aperture for subtle DOF
      },
      bloom: {
        enabled: true,
        threshold: 1,
        strength: 0.2,
        radius: 0.75,
        color: '#ffe9cc',
      },
      lensDirt: {
        enabled: false,
        strength: 0.8,
        minLuminance: 0.55,
        maxLuminance: 0.95,
        sensitivity: 0.55,
      },
      grain: { enabled: false, intensity: 0.03, color: '#ffffff' },
      aberration: { enabled: false, offset: 0.0025, strength: 0.24 },
      camera: {
        fov: 50,
        tilt: 0,
        contrast: 1.0,
        temperature: CAMERA_TEMPERATURE_NEUTRAL_K,
        tint: 0,
        highlights: 0,
        shadows: 0,
        saturation: 1.0,
        vignette: 0,
        vignetteColor: '#000000',
      },
      exposure: 1.0,
      autoExposure: false,
      antiAliasing: 'fxaa',
      toneMapping: 'aces-filmic',
      background: '#000000',
    };
    this.state = clone(this.defaults);
    this.subscribers = new Set();
  }

  getState() {
    return clone(this.state);
  }

  getDefaults() {
    return clone(this.defaults);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    const snapshot = this.getState();
    for (const callback of this.subscribers) {
      try {
        callback(snapshot);
      } catch (error) {
        console.error('[StateStore] subscriber failed', error);
      }
    }
  }

  set(path, value) {
    const segments = path.split('.');
    let target = this.state;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      target[key] = target[key] ?? {};
      target = target[key];
    }
    target[segments.at(-1)] = value;
    this.notify();
  }

  reset() {
    this.state = clone(this.defaults);
    this.notify();
    return this.getState();
  }
}

