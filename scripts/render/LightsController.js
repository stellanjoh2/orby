import * as THREE from 'three';
import {
  SHADOW_MAP_SIZE_BY_QUALITY,
  normalizeShadowQuality,
  shadowBlurSamplesForQuality,
} from '../config/shadowQuality.js';

const SHADOW_SOFTNESS_REFERENCE_QUALITY = 'low';
const MIN_SHADOW_BOUNDS_RADIUS = 0.5;
const SHADOW_BOUNDS_PADDING_BY_QUALITY = {
  low: 2.4,
  medium: 2.0,
  high: 1.6,
  ultra: 1.2,
};
const SHADOW_FAR_MULTIPLIER_BY_QUALITY = {
  low: 10,
  medium: 8,
  high: 6,
  ultra: 4.5,
};
/** Viewport gizmos scale with the loaded mesh so tiny models don't get huge cones. */
const LIGHT_INDICATOR_DISTANCE_FACTOR = 2.5;
const LIGHT_INDICATOR_RADIUS_FACTOR = 0.15;
const LIGHT_INDICATOR_HEIGHT_FACTOR = 0.3;
const LIGHT_INDICATOR_UNIT_CONE_RADIUS = 1;
const LIGHT_INDICATOR_UNIT_CONE_HEIGHT = 1;

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
    this.shadowQuality = normalizeShadowQuality(options.shadowQuality);
    this.shadowSoftness = this._normalizeShadowSoftness(options.shadowSoftness);
    this.shadowContactOffset = this._normalizeShadowContactOffset(
      options.shadowContactOffset,
    );

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
      key: { height: 5, rotate: 0, intensity: 1.28, enabled: false, castShadows: false },
      fill: { height: 3, rotate: 0, intensity: 0.8, enabled: false, castShadows: false },
      rim: { height: 4, rotate: 0, intensity: 0.96, enabled: false, castShadows: false },
      ambient: { intensity: 0.48, enabled: false },
    };

    Object.values(this.lights).forEach((light) => {
      if (!light) return;
      if ('castShadow' in light && light.shadow) {
        light.castShadow = true;
        light.shadow.mapSize.set(
          SHADOW_MAP_SIZE_BY_QUALITY[this.shadowQuality],
          SHADOW_MAP_SIZE_BY_QUALITY[this.shadowQuality],
        );
        light.shadow.bias = this.shadowContactOffset;
        light.shadow.normalBias = 0.015;
        light.shadow.intensity = 1;
      } else {
        light.castShadow = false;
      }
      if (light.isDirectionalLight && light.target && !light.target.parent) {
        this.scene.add(light.target);
      }
      this.scene.add(light);
    });
    this._applyShadowCameraBounds();
    this._applyShadowSoftnessToLights();
  }

  _normalizeShadowQuality(quality) {
    return normalizeShadowQuality(quality);
  }

  _normalizeShadowContactOffset(offset) {
    const raw = Number(offset);
    if (!Number.isFinite(raw)) return -0.0001;
    return Math.min(0.0005, Math.max(-0.001, raw));
  }

  _normalizeShadowSoftness(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return 4;
    return Math.min(4, Math.max(0, raw));
  }

  _shadowBlurSamplesForQuality() {
    return shadowBlurSamplesForQuality(this.shadowQuality);
  }

  _applyShadowSoftnessToLights() {
    const currentSize =
      SHADOW_MAP_SIZE_BY_QUALITY[this.shadowQuality] ?? SHADOW_MAP_SIZE_BY_QUALITY.medium;
    const referenceSize = SHADOW_MAP_SIZE_BY_QUALITY[SHADOW_SOFTNESS_REFERENCE_QUALITY];
    // Radius is in shadow texels; scale it with map resolution to preserve visual softness.
    const effectiveRadius = this.shadowSoftness * (currentSize / referenceSize);
    const blurSamples = this._shadowBlurSamplesForQuality();
    ['key', 'fill', 'rim'].forEach((lightId) => {
      const light = this.lights[lightId];
      if (light?.isDirectionalLight && light.shadow) {
        light.shadow.radius = effectiveRadius;
        if ('blurSamples' in light.shadow) {
          light.shadow.blurSamples = blurSamples;
        }
      }
    });
  }

  _applyShadowCameraBounds() {
    const center = this.modelBounds?.center;
    const radius = Number.isFinite(this.modelBounds?.radius)
      ? Math.max(MIN_SHADOW_BOUNDS_RADIUS, this.modelBounds.radius)
      : 3;
    const padding =
      SHADOW_BOUNDS_PADDING_BY_QUALITY[this.shadowQuality]
      ?? SHADOW_BOUNDS_PADDING_BY_QUALITY.medium;
    const farMultiplier =
      SHADOW_FAR_MULTIPLIER_BY_QUALITY[this.shadowQuality]
      ?? SHADOW_FAR_MULTIPLIER_BY_QUALITY.medium;
    const extent = radius * padding;
    const farPlane = Math.max(20, radius * farMultiplier);
    ['key', 'fill', 'rim'].forEach((lightId) => {
      const light = this.lights[lightId];
      if (!light?.isDirectionalLight || !light.shadow?.camera) return;
      if (center && light.target) {
        light.target.position.copy(center);
        light.target.updateMatrixWorld();
      }
      const cam = light.shadow.camera;
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.near = 0.1;
      cam.far = farPlane;
      cam.updateProjectionMatrix();
    });
  }

  getLights() {
    return this.lights;
  }

  setModelBounds(bounds) {
    this.modelBounds = bounds;
    this._applyShadowCameraBounds();
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
      const isLightEnabled = this.individualProperties[id].enabled === true && this.lightsEnabled;
      light.intensity = isLightEnabled ? targetIntensity : 0;
      
      // Apply individual height and rotate for directional lights
      if (light.isDirectionalLight) {
        if (config.height !== undefined) {
          const h = Number(config.height);
          if (Number.isFinite(h)) {
            this.individualProperties[id].height = h;
          }
        }
        if (config.rotate !== undefined) {
          const r = Number(config.rotate);
          if (Number.isFinite(r)) {
            this.individualProperties[id].rotate = r;
          }
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
      const isLightEnabled = props?.enabled === true && this.lightsEnabled;
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
      const isLightEnabled = props?.enabled === true && this.lightsEnabled;
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
      const isLightEnabled = this.individualProperties[lightId].enabled === true && this.lightsEnabled;
      light.intensity = isLightEnabled ? effectiveIntensity : 0;
    } else if (property === 'height') {
      // Store individual height
      const h = Number(value);
      this.individualProperties[lightId].height = Number.isFinite(h) ? h : 5;
      // Update light position Y
      if (light.isDirectionalLight) {
        this.updateLightPosition(lightId);
      }
    } else if (property === 'rotate') {
      // Store individual rotation
      const r = Number(value);
      this.individualProperties[lightId].rotate = Number.isFinite(r) ? r : 0;
      // Update light position
      if (light.isDirectionalLight) {
        this.updateLightPosition(lightId);
      }
    } else if (property === 'enabled') {
      // Store enabled state
      this.individualProperties[lightId].enabled = value === true;
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
      this.individualProperties[lightId].castShadows = value === true;
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

    // Calculate rotated position
    const rotatedX = base.x * cos + base.z * sin;
    const rotatedZ = -base.x * sin + base.z * cos;

    // Use individual height or global height (ignore non-finite so strength/master sync never snaps Y)
    const rawY = props.height ?? this.lightsHeight ?? base.y;
    const height = Number.isFinite(Number(rawY)) ? Number(rawY) : base.y;

    // Set final position
    light.position.set(rotatedX, height, rotatedZ);
  }

  setRotation(value) {
    const normalized = ((value % 360) + 360) % 360;
    this.rotation = normalized;
    // Update all directional light positions
    ['key', 'fill', 'rim'].forEach((id) => {
      this.updateLightPosition(id);
    });
    this._applyShadowCameraBounds();
    this.updateIndicators();
    return normalized;
  }

  setHeight(value) {
    const previousHeight = this.lightsHeight ?? 5;
    this.lightsHeight = value ?? 5;

    // Calculate delta so we can move all lights together while preserving their relative offsets
    const delta = this.lightsHeight - previousHeight;

    ['key', 'fill', 'rim'].forEach((id) => {
      const props = this.individualProperties[id];
      const base = this.basePositions[id];
      if (!props || !base) return;

      const currentHeight = props.height ?? base.y;
      props.height = currentHeight + delta;

      this.updateLightPosition(id);
    });

    this._applyShadowCameraBounds();
    this.updateIndicators();
  }

  /**
   * @param {number} size - Shadow map width/height (square, e.g. 1024)
   */
  setShadowMapResolution(size) {
    const safe = Math.max(128, Math.round(Number(size) || 1024));
    ['key', 'fill', 'rim'].forEach((lightId) => {
      const light = this.lights[lightId];
      if (light?.isDirectionalLight && light.shadow) {
        light.shadow.mapSize.set(safe, safe);
        if (light.shadow.map) {
          light.shadow.map.dispose();
          light.shadow.map = null;
        }
      }
    });
    this._applyShadowSoftnessToLights();
  }

  setShadowQuality(quality) {
    const normalized = this._normalizeShadowQuality(quality);
    if (normalized === this.shadowQuality) return;
    this.shadowQuality = normalized;
    this.setShadowMapResolution(SHADOW_MAP_SIZE_BY_QUALITY[this.shadowQuality]);
    this._applyShadowSoftnessToLights();
  }

  setShadowSoftness(value) {
    const normalized = this._normalizeShadowSoftness(value);
    if (normalized === this.shadowSoftness) return;
    this.shadowSoftness = normalized;
    this._applyShadowSoftnessToLights();
  }

  setShadowContactOffset(offset) {
    const normalized = this._normalizeShadowContactOffset(offset);
    if (normalized === this.shadowContactOffset) return;
    this.shadowContactOffset = normalized;
    ['key', 'fill', 'rim'].forEach((lightId) => {
      const light = this.lights[lightId];
      if (light?.isDirectionalLight && light.shadow) {
        light.shadow.bias = this.shadowContactOffset;
      }
    });
  }

  setCastShadows(enabled) {
    const target = !!enabled;
    // Apply to all directional lights (key, fill, rim)
    ['key', 'fill', 'rim'].forEach((lightId) => {
      const light = this.lights[lightId];
      if (light && light.isDirectionalLight && light.shadow) {
        if (light.castShadow === target) return;
        light.castShadow = target;
        // Also update individual property to keep in sync
        if (!this.individualProperties[lightId]) {
          this.individualProperties[lightId] = {};
        }
        this.individualProperties[lightId].castShadows = target;
      }
    });
  }

  setIndicatorsVisible(enabled) {
    this.showIndicators = !!enabled;
    if (this.showIndicators) {
      this.createIndicators();
    } else {
      this.clearIndicators();
    }
  }

  _getIndicatorMetrics(radius) {
    const r = Math.max(Number(radius) || 0, 1e-6);
    return {
      baseDistance: r * LIGHT_INDICATOR_DISTANCE_FACTOR,
      coneRadius: r * LIGHT_INDICATOR_RADIUS_FACTOR,
      coneHeight: r * LIGHT_INDICATOR_HEIGHT_FACTOR,
    };
  }

  createIndicators() {
    this.clearIndicators();
    if (!this.modelBounds || !this.basePositions) return;

    const group = new THREE.Group();
    const { center, radius } = this.modelBounds;

    ['key', 'fill', 'rim'].forEach((id) => {
      const light = this.lights[id];
      if (!light) return;

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(
          LIGHT_INDICATOR_UNIT_CONE_RADIUS,
          LIGHT_INDICATOR_UNIT_CONE_HEIGHT,
          28,
          1,
        ),
        new THREE.MeshBasicMaterial({
          color: light.color,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        }),
      );

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
    const { baseDistance, coneRadius, coneHeight } = this._getIndicatorMetrics(radius);
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
      const intensityScale = 0.5 + normalizedIntensity * 2.0;
      child.scale.set(
        coneRadius * intensityScale,
        coneHeight * intensityScale,
        coneRadius * intensityScale,
      );
      const dirToCenter = center.clone().sub(newPosition).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion();
      quaternion.setFromUnitVectors(up.clone().negate(), dirToCenter);
      child.quaternion.copy(quaternion);
    });
  }
}

