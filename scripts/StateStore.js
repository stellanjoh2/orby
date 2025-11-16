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
      autoRotate: 0,
      showNormals: false,
      hdri: 'noir-studio',
      hdriEnabled: true,
      hdriStrength: 1,
      hdriBackground: false,
      groundSolid: false,
      groundWire: false,
      groundWireOpacity: 0.45,
      groundSolidColor: '#05070b',
      groundWireColor: '#c4cadd',
      background: '#000000',
      lights: {
        key: { color: '#ffdfc9', intensity: 4 },
        fill: { color: '#b0c7ff', intensity: 2.5 },
        rim: { color: '#a0eaf9', intensity: 3 },
        ambient: { color: '#7c8ca6', intensity: 1.5 },
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
        strength: 0.49,
        radius: 0.94,
        color: '#ffe9cc',
      },
      grain: { enabled: true, intensity: 0.1, color: '#ffffff' },
      aberration: { enabled: true, offset: 0.0025, strength: 0.24 },
      fog: { type: 'linear', color: '#10121a', near: 85.8, density: 0.462 },
      camera: { fov: 60 },
      exposure: 0.32,
    };
    this.state = clone(this.defaults);
    this.subscribers = new Set();
  }

  getState() {
    return clone(this.state);
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

