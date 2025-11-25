import * as THREE from 'three';

export class LightsController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.lightsEnabled = options.enabled ?? true;
    this.lightsMaster = options.master ?? 1;
    this.rotation = options.rotation ?? 0;
    this.lightsHeight = options.height ?? 5;
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

    // Individual light properties
    this.individualProperties = {
      key: { height: 5, rotate: 0, intensity: 1.28, enabled: true, castShadows: true },
      fill: { height: 3, rotate: 0, intensity: 0.8, enabled: true, castShadows: true },
      rim: { height: 4, rotate: 0, intensity: 0.96, enabled: true, castShadows: true },
      ambient: { intensity: 0.48, enabled: true },
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
      // Store all properties
      if (!this.individualProperties[id]) {
        this.individualProperties[id] = {};
      }
      if (config.intensity !== undefined) {
        this.individualProperties[id].intensity = config.intensity;
      }
      if (config.enabled !== undefined) {
        this.individualProperties[id].enabled = config.enabled;
      }
      if (config.castShadows !== undefined && light.isDirectionalLight) {
        this.individualProperties[id].castShadows = config.castShadows;
        if (light.shadow) {
          light.castShadow = config.castShadows;
        }
      }
      // Use individual intensity if available, otherwise use config
      const intensity = this.individualProperties[id].intensity ?? config.intensity ?? 0;
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = intensity * multiplier;
      // Clamp to max 5.0 × multiplier to prevent overexposure
      const targetIntensity = Math.min(baseIntensity * (this.lightsMaster ?? 1), 5.0 * multiplier);
      const isLightEnabled = (this.individualProperties[id].enabled !== false) && this.lightsEnabled;
      light.intensity = isLightEnabled ? targetIntensity : 0;
      
      // Apply individual height and rotate for directional lights
      if (light.isDirectionalLight) {
        if (config.height !== undefined) {
          this.individualProperties[id].height = config.height;
        }
        if (config.rotate !== undefined) {
          this.individualProperties[id].rotate = config.rotate;
        }
        this.updateLightPosition(id);
      }
    });
    this.updateIndicators();
  }

  setEnabled(enabled, lightsState = {}) {
    this.lightsEnabled = !!enabled;
    // Update all lights based on enabled state
    Object.keys(this.lights).forEach((lightId) => {
      const light = this.lights[lightId];
      if (!light) return;
      const props = this.individualProperties[lightId];
      const isLightEnabled = (props?.enabled !== false) && this.lightsEnabled;
      if (isLightEnabled) {
        const intensity = props?.intensity ?? 0;
        const multiplier = light.isAmbientLight ? 4 : 2;
        const baseIntensity = intensity * multiplier;
        // Clamp to max 5.0 × multiplier to prevent overexposure
        const targetIntensity = Math.min(baseIntensity * (this.lightsMaster ?? 1), 5.0 * multiplier);
        light.intensity = targetIntensity;
      } else {
        light.intensity = 0;
      }
    });
    if (this.lightsEnabled) {
      this.applySettings(lightsState);
    }
  }

  setMaster(value, lightsState = {}) {
    this.lightsMaster = value ?? 1;
    // Update all lights with new master value
    Object.keys(this.lights).forEach((lightId) => {
      const light = this.lights[lightId];
      if (!light) return;
      const props = this.individualProperties[lightId];
      const intensity = props?.intensity ?? 0;
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = intensity * multiplier;
      // Clamp to max 5.0 × multiplier to prevent overexposure
      const targetIntensity = Math.min(baseIntensity * this.lightsMaster, 5.0 * multiplier);
      const isLightEnabled = (props?.enabled !== false) && this.lightsEnabled;
      light.intensity = isLightEnabled ? targetIntensity : 0;
    });
    if (this.lightsEnabled) {
      this.applySettings(lightsState);
    }
    this.updateIndicators();
  }

  updateLightProperty(lightId, property, value) {
    const light = this.lights[lightId];
    if (!light) return;
    
    if (!this.individualProperties[lightId]) {
      this.individualProperties[lightId] = {};
    }
    
    if (property === 'color') {
      light.color = new THREE.Color(value);
    } else if (property === 'intensity') {
      // Store individual intensity (base value, 0-5 range)
      this.individualProperties[lightId].intensity = Math.min(value ?? 0, 5.0);
      // Apply intensity with master multiplier, clamped to max 5.0 total
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = this.individualProperties[lightId].intensity * multiplier;
      // Clamp effective intensity to prevent overexposure (max 5.0 × multiplier)
      const effectiveIntensity = Math.min(baseIntensity * (this.lightsMaster ?? 1), 5.0 * multiplier);
      const isLightEnabled = this.individualProperties[lightId].enabled !== false && this.lightsEnabled;
      light.intensity = isLightEnabled ? effectiveIntensity : 0;
    } else if (property === 'height') {
      // Store individual height
      this.individualProperties[lightId].height = value ?? 5;
      // Update light position Y
      if (light.isDirectionalLight) {
        this.updateLightPosition(lightId);
      }
    } else if (property === 'rotate') {
      // Store individual rotation
      this.individualProperties[lightId].rotate = value ?? 0;
      // Update light position
      if (light.isDirectionalLight) {
        this.updateLightPosition(lightId);
      }
    } else if (property === 'enabled') {
      // Store enabled state
      this.individualProperties[lightId].enabled = value !== false;
      // Update intensity based on enabled state
      const intensity = this.individualProperties[lightId].intensity ?? 0;
      const multiplier = light.isAmbientLight ? 4 : 2;
      const baseIntensity = intensity * multiplier;
      // Clamp to max 5.0 × multiplier to prevent overexposure
      const targetIntensity = Math.min(baseIntensity * (this.lightsMaster ?? 1), 5.0 * multiplier);
      const isLightEnabled = this.individualProperties[lightId].enabled && this.lightsEnabled;
      light.intensity = isLightEnabled ? targetIntensity : 0;
    } else if (property === 'castShadows') {
      // Store cast shadows state
      this.individualProperties[lightId].castShadows = value !== false;
      // Update shadow casting
      if (light.isDirectionalLight && light.shadow) {
        light.castShadow = this.individualProperties[lightId].castShadows;
      }
    }
    this.updateIndicators();
  }

  updateLightPosition(lightId) {
    const light = this.lights[lightId];
    const base = this.basePositions[lightId];
    const props = this.individualProperties[lightId];
    if (!light || !base || !props || !light.isDirectionalLight) return;

    // Calculate position with global rotation + individual rotation
    const globalRadians = THREE.MathUtils.degToRad(this.rotation);
    const individualRadians = THREE.MathUtils.degToRad(props.rotate ?? 0);
    const totalRotation = globalRadians + individualRadians;
    
    const cos = Math.cos(totalRotation);
    const sin = Math.sin(totalRotation);
    const rotatedX = base.x * cos + base.z * sin;
    const rotatedZ = -base.x * sin + base.z * cos;
    
    // Use individual height or global height
    const height = props.height ?? this.lightsHeight ?? base.y;
    
    light.position.set(rotatedX, height, rotatedZ);
  }

  setRotation(value) {
    const normalized = ((value % 360) + 360) % 360;
    this.rotation = normalized;
    // Update all directional light positions
    ['key', 'fill', 'rim'].forEach((id) => {
      this.updateLightPosition(id);
    });
    this.updateIndicators();
    return normalized;
  }

  setHeight(value) {
    this.lightsHeight = value ?? 5;
    // Update all directional light positions (updateLightPosition will use individual height if available, otherwise global)
    ['key', 'fill', 'rim'].forEach((id) => {
      this.updateLightPosition(id);
    });
    this.updateIndicators();
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

