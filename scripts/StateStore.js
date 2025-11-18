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
      hdri: 'congress',
      hdriEnabled: true,
      hdriStrength: 0.4,
      hdriBlurriness: 0,
      hdriRotation: 0,
      hdriBackground: false,
      groundSolid: false,
      groundWire: false,
      groundWireOpacity: 0.45,
      groundY: 0,
      groundSolidColor: '#31363f',
      groundWireColor: '#c4cadd',
      clay: {
        color: '#808080',
        roughness: 0.6,
        specular: 0.08,
      },
      fresnel: {
        enabled: false,
        color: '#ffffff',
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
      lightsMaster: 1,
      lightsRotation: 0,
      lightsAutoRotate: false,
      lensFlare: {
        enabled: false,
        rotation: 0,
        height: 15,
        color: '#da541b',
        quality: 'maximum',
      },
      dof: {
        enabled: false,
        focus: 10,
        aperture: 0.003,
        strength: 0,
      },
      bloom: {
        enabled: true,
        threshold: 1,
        strength: 0.4,
        radius: 0.75,
        color: '#ffe9cc',
      },
      grain: { enabled: true, intensity: 0.03, color: '#ffffff' },
      aberration: { enabled: true, offset: 0.0025, strength: 0.24 },
      camera: { fov: 50 },
      exposure: 1.0,
      antiAliasing: 'none',
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

