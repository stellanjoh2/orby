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
      hdriBackground: true,
      groundPlane: false,
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
        enabled: false,
        threshold: 0.92,
        strength: 0,
        radius: 0.2,
        color: '#ffe9cc',
      },
      grain: { enabled: false, intensity: 0, color: '#ffffff' },
      aberration: { enabled: false, offset: 0, strength: 0 },
      fog: { type: 'none', color: '#10121a', near: 10, density: 0.02 },
      camera: { fov: 60 },
      exposure: 0.85,
      background: '#05070b',
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

