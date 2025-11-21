import * as THREE from 'three';

export class LightsController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.lightsEnabled = options.enabled ?? true;
    this.lightsMaster = options.master ?? 1;
    this.rotation = options.rotation ?? 0;
    this.autoRotateSpeed = options.autoRotateSpeed ?? 30;
    this.modelBounds = null;
    this.showIndicators = false;
    this.lightIndicators = null;

    this.lights = {
      key: new THREE.DirectionalLight('#ffffff', 4),
      fill: new THREE.DirectionalLight('#ffffff', 2.5),
      rim: new THREE.DirectionalLight('#ffffff', 3),
      ambient: new THREE.AmbientLight('#7c8ca6', 1.5),
    };

    this.lights.key.position.set(5, 5, 5);
    this.lights.fill.position.set(-4, 3, 3);
    this.lights.rim.position.set(-2, 4, -4);

    this.basePositions = {
      key: this.lights.key.position.clone(),
      fill: this.lights.fill.position.clone(),
      rim: this.lights.rim.position.clone(),
    };

    Object.values(this.lights).forEach((light) => {
      if (!light) return;
      if ('castShadow' in light && light.shadow) {
        light.castShadow = true;
        light.shadow.radius = 4;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.bias = -0.0001;
      } else {
        light.castShadow = false;
      }
      this.scene.add(light);
    });
  }

  getLights() {
    return this.lights;
  }

  setModelBounds(bounds) {
    this.modelBounds = bounds;
    if (this.showIndicators) {
      this.createIndicators();
    }
  }

  applySettings(lightsState = {}) {
    Object.entries(lightsState).forEach(([id, config]) => {
      const light = this.lights[id];
      if (!light) return;
      if (config.color) {
        light.color = new THREE.Color(config.color);
      }
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = (config.intensity ?? 0) * multiplier;
      const targetIntensity = baseIntensity * (this.lightsMaster ?? 1);
      light.intensity = this.lightsEnabled ? targetIntensity : 0;
    });
    this.updateIndicators();
  }

  setEnabled(enabled, lightsState = {}) {
    this.lightsEnabled = !!enabled;
    if (this.lightsEnabled) {
      this.applySettings(lightsState);
    } else {
      Object.values(this.lights).forEach((light) => {
        if (!light) return;
        light.intensity = 0;
      });
    }
  }

  setMaster(value, lightsState = {}) {
    this.lightsMaster = value ?? 1;
    if (this.lightsEnabled) {
      this.applySettings(lightsState);
    }
    this.updateIndicators();
  }

  updateLightProperty(lightId, property, value) {
    const light = this.lights[lightId];
    if (!light) return;
    if (property === 'color') {
      light.color = new THREE.Color(value);
    } else if (property === 'intensity') {
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = (value ?? 0) * multiplier;
      const targetIntensity = baseIntensity * (this.lightsMaster ?? 1);
      light.intensity = this.lightsEnabled ? targetIntensity : 0;
    }
    this.updateIndicators();
  }

  setRotation(value) {
    const normalized = ((value % 360) + 360) % 360;
    this.rotation = normalized;
    if (!this.basePositions) return normalized;
    const radians = THREE.MathUtils.degToRad(normalized);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    ['key', 'fill', 'rim'].forEach((id) => {
      const base = this.basePositions[id];
      const light = this.lights[id];
      if (!base || !light) return;
      const rotatedX = base.x * cos + base.z * sin;
      const rotatedZ = -base.x * sin + base.z * cos;
      light.position.set(rotatedX, base.y, rotatedZ);
    });
    this.updateIndicators();
    return normalized;
  }

  setIndicatorsVisible(enabled) {
    this.showIndicators = !!enabled;
    if (this.showIndicators) {
      this.createIndicators();
    } else {
      this.clearIndicators();
    }
  }

  createIndicators() {
    this.clearIndicators();
    if (!this.modelBounds || !this.basePositions) return;

    const group = new THREE.Group();
    const { center, radius } = this.modelBounds;
    const baseDistance = radius * 2.5;

    ['key', 'fill', 'rim'].forEach((id) => {
      const light = this.lights[id];
      if (!light) return;

      const lightPos = light.position.clone();
      const direction = lightPos.clone().sub(center).normalize();
      const position = center.clone().add(direction.multiplyScalar(baseDistance));

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.3, 8),
        new THREE.MeshBasicMaterial({
          color: light.color,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        }),
      );

      cone.position.copy(position);
      const dirToCenter = center.clone().sub(position).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up.clone().negate(), dirToCenter);
      cone.quaternion.copy(quaternion);
      cone.userData.lightId = id;
      group.add(cone);
    });

    this.lightIndicators = group;
    this.scene.add(group);
    this.updateIndicators();
  }

  clearIndicators() {
    if (!this.lightIndicators) return;
    this.scene.remove(this.lightIndicators);
    this.lightIndicators.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.lightIndicators = null;
  }

  updateIndicators() {
    if (!this.lightIndicators || !this.modelBounds) return;
    const { center, radius } = this.modelBounds;
    const baseDistance = radius * 2.5;
    this.lightIndicators.traverse((child) => {
      if (!child.isMesh || !child.userData.lightId) return;
      const lightId = child.userData.lightId;
      const light = this.lights[lightId];
      if (!light) return;
      const lightPos = light.position.clone();
      const direction = lightPos.clone().sub(center).normalize();
      const newPosition = center.clone().add(direction.multiplyScalar(baseDistance));
      child.position.copy(newPosition);
      child.material.color.copy(light.color);
      const maxIntensity = 10;
      const normalizedIntensity = Math.min(light.intensity / maxIntensity, 1);
      const scale = 0.5 + normalizedIntensity * 2.0;
      child.scale.set(scale, scale, scale);
      const dirToCenter = center.clone().sub(newPosition).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up.clone().negate(), dirToCenter);
      child.quaternion.copy(quaternion);
    });
  }
}

