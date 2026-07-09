import * as THREE from 'three';
import { lightsAutoRotateDegreesPerSecond } from '../config/lightsAutoRotate.js';
import {
  SHADOW_MAP_SIZE_BY_QUALITY,
  LIGHT_BEAM_ORTHO_PADDING,
  normalizeShadowQuality,
  shadowBlurSamplesForQuality,
  shadowCameraOrthoPaddingForQuality,
  effectiveDirectionalShadowRadius,
  DEFAULT_LIGHTS_SHADOW_SOFTNESS,
} from '../config/shadowQuality.js';
import { ORBY_LIME } from '../constants.js';
import { resolveLightCastShadowEffective } from '../lights/lightCastShadowEffective.js';
const MIN_SHADOW_BOUNDS_RADIUS = 0.5;
/** Shifts shadow comparison along surface normals — fixes terminator offset on hard edges. */
const DEFAULT_SHADOW_NORMAL_BIAS = 0.01;
/** Default shadow bias — negative pulls shadow onto the surface at contact. */
const DEFAULT_SHADOW_CONTACT_OFFSET = -0.0005;
const SHADOW_FAR_MULTIPLIER_BY_QUALITY = {
  low: 10,
  medium: 8,
  high: 6,
  ultra: 4.5,
};
/** Solid cones are a fraction of the beam frustum — same angle, smaller visual footprint. */
const LIGHT_INDICATOR_SIZE_SCALE = 0.1;
const LIGHT_INDICATOR_UNIT_CONE_RADIUS = 1;
const LIGHT_INDICATOR_UNIT_CONE_HEIGHT = 1;
/** Floor so indicators stay visible on tiny/degenerate bounds — angle preserved via ratio. */
const LIGHT_INDICATOR_MIN_CONE_RADIUS = 0.02;
const LIGHT_INDICATOR_MIN_CONE_HEIGHT = 0.04;
const LIGHT_INDICATOR_INTENSITY_SCALE_MIN = 0.5;
const LIGHT_INDICATOR_INTENSITY_SCALE_MAX = 2.5;
const LIGHT_INDICATOR_INTENSITY_REFERENCE = 10;
const LIGHT_INDICATOR_RENDER_ORDER = 1004;
const LIGHT_INDICATOR_WIRE_OPACITY = 0.88;
/** Apex of the cone — slightly back along the beam and above the frustum silhouette. */
const LIGHT_SHADOW_BADGE_BACK_SCALE = 0.12;
const LIGHT_SHADOW_BADGE_UP_SCALE = 0.42;
/** HUD anchor uses fixed cone scale so brightness drags do not shift the shelf. */
const LIGHT_SHADOW_BADGE_ANCHOR_INTENSITY_SCALE =
  (LIGHT_INDICATOR_INTENSITY_SCALE_MIN + LIGHT_INDICATOR_INTENSITY_SCALE_MAX) / 2;
const LIGHT_FALLOFF_SEGMENTS = 32;
const LIGHT_FALLOFF_LINE_OPACITY = 0.72;
/** ConeGeometry tip is +Y; beam opens toward -Y — align opening with light→target. */
const _BEAM_CONE_OPEN = new THREE.Vector3(0, -1, 0);
const _BEAM_ICON_QUAT = new THREE.Quaternion();
const _BEAM_ICON_POS = new THREE.Vector3();
const _INDICATOR_CENTER = new THREE.Vector3();
const _LIGHT_ORIGIN = new THREE.Vector3();
const _LIGHT_TARGET = new THREE.Vector3();
const DEFAULT_INDICATOR_CENTER = new THREE.Vector3(0, 1, 0);

export class LightsController {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.lightsEnabled = options.enabled ?? true;
    this.lightsMaster = options.master ?? 1;
    this.rotation = options.rotation ?? 0;
    this.lightsHeight = options.height ?? 5;
    this.rigScale = this._normalizeRigScale(options.rigScale ?? 1);
    this.autoRotateSpeed = options.autoRotateSpeed ?? lightsAutoRotateDegreesPerSecond();
    this.modelBounds = null;
    /** Orbit / scene focal point when no mesh bounds exist yet. */
    this._indicatorCenterFallback = null;
    /** Horizontal reach from shadow target center to the receive surface edge (base / catcher). */
    this.receiveSurfaceRadius = 0;
    this.showIndicators = false;
    this.lightIndicators = null;
    this.showFalloffIndicators = false;
    this.lightFalloffIndicators = null;
    /** @type {Record<string, { visible: boolean, active: boolean, world: THREE.Vector3 }> | null} */
    this._shadowBadgeLayouts = null;
    /** Shadow ortho half-extent at the target plane (matches shadow camera left/right/top/bottom). */
    this._shadowFrustumExtent = 3;
    /** Mesh-only half-extent for viewport light guides — not expanded for backdrop / HDRI catchers. */
    this._indicatorFrustumExtent = 3;
    /** @type {'key' | 'fill' | 'rim' | null} */
    this._selectedLightId = null;
    this.shadowQuality = normalizeShadowQuality(options.shadowQuality);
    this.shadowSoftness = this._normalizeShadowSoftness(options.shadowSoftness);
    this.shadowContactOffset = this._normalizeShadowContactOffset(
      options.shadowContactOffset,
    );
    this.shadowNormalBias = this._normalizeShadowNormalBias(options.shadowNormalBias);

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
        light.shadow.mapSize.set(
          SHADOW_MAP_SIZE_BY_QUALITY[this.shadowQuality],
          SHADOW_MAP_SIZE_BY_QUALITY[this.shadowQuality],
        );
        light.shadow.bias = this.shadowContactOffset;
        light.shadow.normalBias = this.shadowNormalBias;
        light.shadow.intensity = 1;
        light.castShadow = false;
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

  /** @param {() => object | undefined} getState */
  setSceneStateProvider(getState) {
    this.getSceneState = getState;
  }

  /** @param {'key' | 'fill' | 'rim' | null} lightId */
  setSelectedLightId(lightId) {
    this._selectedLightId = lightId === 'key' || lightId === 'fill' || lightId === 'rim'
      ? lightId
      : null;
    this.updateIndicators();
  }

  _normalizeShadowQuality(quality) {
    return normalizeShadowQuality(quality);
  }

  _normalizeShadowContactOffset(offset) {
    const raw = Number(offset);
    if (!Number.isFinite(raw)) return DEFAULT_SHADOW_CONTACT_OFFSET;
    return Math.min(0.0005, Math.max(-0.001, raw));
  }

  _normalizeShadowNormalBias(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return DEFAULT_SHADOW_NORMAL_BIAS;
    return Math.min(0.08, Math.max(0, raw));
  }

  _normalizeShadowSoftness(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return DEFAULT_LIGHTS_SHADOW_SOFTNESS;
    return Math.min(4, Math.max(0, raw));
  }

  _normalizeRigScale(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return 1;
    return Math.min(4, Math.max(0.25, raw));
  }

  _shadowBlurSamplesForQuality() {
    return shadowBlurSamplesForQuality(this.shadowQuality);
  }

  _applyShadowSoftnessToLights() {
    const effectiveRadius = effectiveDirectionalShadowRadius(
      this.shadowSoftness,
      this.shadowQuality,
    );
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
    const center = this.modelBounds?.center ?? this._indicatorCenterFallback;
    const meshRadius = Number.isFinite(this.modelBounds?.radius)
      ? Math.max(MIN_SHADOW_BOUNDS_RADIUS, this.modelBounds.radius)
      : 3;
    const shadowPadding = shadowCameraOrthoPaddingForQuality(this.shadowQuality);
    const farMultiplier =
      SHADOW_FAR_MULTIPLIER_BY_QUALITY[this.shadowQuality]
      ?? SHADOW_FAR_MULTIPLIER_BY_QUALITY.medium;
    const meshShadowExtent = meshRadius * shadowPadding;
    const receiveReach = Number.isFinite(this.receiveSurfaceRadius)
      ? Math.max(0, this.receiveSurfaceRadius)
      : 0;
    const extent = Math.max(meshShadowExtent, receiveReach);
    this._shadowFrustumExtent = extent;
    this._indicatorFrustumExtent = meshRadius * LIGHT_BEAM_ORTHO_PADDING;
    const farPlane = Math.max(20, Math.max(meshRadius, receiveReach) * farMultiplier);
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
    if (this.showFalloffIndicators) {
      this.updateFalloffIndicators();
    }
  }

  getLights() {
    return this.lights;
  }

  setModelBounds(bounds, options = {}) {
    this.modelBounds = bounds;
    this.receiveSurfaceRadius = Number.isFinite(options.receiveSurfaceRadius)
      ? Math.max(0, options.receiveSurfaceRadius)
      : 0;
    this._applyShadowCameraBounds();
    if (this.showIndicators) {
      this.createIndicators();
    }
    if (this.showFalloffIndicators) {
      this.createFalloffIndicators();
    }
  }

  /** Keeps viewport HUD + cones aimed when no model is loaded yet. */
  setIndicatorCenterFallback(center) {
    if (center?.isVector3) {
      if (!this._indicatorCenterFallback) {
        this._indicatorCenterFallback = new THREE.Vector3();
      }
      this._indicatorCenterFallback.copy(center);
    } else {
      this._indicatorCenterFallback = null;
    }
    this._applyShadowCameraBounds();
    if (this.showIndicators) {
      if (!this.lightIndicators) {
        this.createIndicators();
      } else {
        this.updateIndicators();
      }
    }
    if (this.showFalloffIndicators && !this.lightFalloffIndicators) {
      this.createFalloffIndicators();
    }
  }

  _getIndicatorCenter(out = _INDICATOR_CENTER) {
    if (this.modelBounds?.center) {
      return out.copy(this.modelBounds.center);
    }
    if (this._indicatorCenterFallback) {
      return out.copy(this._indicatorCenterFallback);
    }
    return out.copy(DEFAULT_INDICATOR_CENTER);
  }

  _resolveLightTargetWorld(light, center, out = _LIGHT_TARGET) {
    if (light?.target?.getWorldPosition) {
      light.target.updateMatrixWorld(true);
      return light.target.getWorldPosition(out);
    }
    return out.copy(center);
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

    // Calculate rotated position, then scale the whole rig uniformly from the origin
    const scale = this.rigScale ?? 1;
    const rotatedX = (base.x * cos + base.z * sin) * scale;
    const rotatedZ = (-base.x * sin + base.z * cos) * scale;

    // Use individual height or global height (ignore non-finite so strength/master sync never snaps Y)
    const rawY = props.height ?? this.lightsHeight ?? base.y;
    const height = (Number.isFinite(Number(rawY)) ? Number(rawY) : base.y) * scale;

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

  setRigScale(value) {
    const normalized = this._normalizeRigScale(value);
    if (normalized === this.rigScale) return normalized;
    this.rigScale = normalized;
    ['key', 'fill', 'rim'].forEach((id) => {
      this.updateLightPosition(id);
    });
    this.updateIndicators();
    return normalized;
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
    this._applyShadowCameraBounds();
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

  setShadowNormalBias(value) {
    const normalized = this._normalizeShadowNormalBias(value);
    if (normalized === this.shadowNormalBias) return;
    this.shadowNormalBias = normalized;
    ['key', 'fill', 'rim'].forEach((lightId) => {
      const light = this.lights[lightId];
      if (light?.isDirectionalLight && light.shadow) {
        light.shadow.normalBias = this.shadowNormalBias;
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
    this.updateIndicators();
  }

  setFalloffIndicatorsVisible(enabled) {
    this.showFalloffIndicators = !!enabled;
    if (this.showFalloffIndicators) {
      this.createFalloffIndicators();
    } else {
      this.clearFalloffIndicators();
    }
  }

  _createFalloffLineMaterial(color) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: LIGHT_FALLOFF_LINE_OPACITY,
      depthWrite: false,
      toneMapped: false,
    });
  }

  _resolveLightBeamBasis(origin, target, scratch) {
    const forward = scratch.forward.copy(target).sub(origin);
    const beamLength = forward.length();
    if (beamLength <= 1e-6) {
      forward.set(0, -1, 0);
      scratch.beamLength = 1;
    } else {
      forward.multiplyScalar(1 / beamLength);
      scratch.beamLength = beamLength;
    }
    const worldUp = scratch.worldUp.set(0, 1, 0);
    scratch.right.crossVectors(worldUp, forward);
    if (scratch.right.lengthSq() < 1e-8) {
      scratch.right.set(1, 0, 0);
    } else {
      scratch.right.normalize();
    }
    scratch.upInPlane.crossVectors(forward, scratch.right).normalize();
    return scratch;
  }

  _buildBeamWireGeometry(segments = LIGHT_FALLOFF_SEGMENTS) {
    const segCount = Math.max(3, segments);
    const positions = new Float32Array(segCount * 2 * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData.segmentCount = segCount;
    return geometry;
  }

  _writeBeamWireWorldPositions(geometry, origin, target, scratch, extent) {
    const segCount = geometry.userData.segmentCount ?? LIGHT_FALLOFF_SEGMENTS;
    const attr = geometry.getAttribute('position');
    const { right, upInPlane } = scratch;
    const e = Math.max(Number(extent) || 0, 1e-6);
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const tx = target.x;
    const ty = target.y;
    const tz = target.z;
    let vi = 0;
    for (let i = 0; i < segCount; i += 1) {
      const a0 = (i / segCount) * Math.PI * 2;
      const a1 = ((i + 1) / segCount) * Math.PI * 2;
      const c0 = Math.cos(a0) * e;
      const s0 = Math.sin(a0) * e;
      const c1 = Math.cos(a1) * e;
      const s1 = Math.sin(a1) * e;
      const x0 = tx + right.x * c0 + upInPlane.x * s0;
      const y0 = ty + right.y * c0 + upInPlane.y * s0;
      const z0 = tz + right.z * c0 + upInPlane.z * s0;
      const x1 = tx + right.x * c1 + upInPlane.x * s1;
      const y1 = ty + right.y * c1 + upInPlane.y * s1;
      const z1 = tz + right.z * c1 + upInPlane.z * s1;

      attr.setXYZ(vi++, ox, oy, oz);
      attr.setXYZ(vi++, x0, y0, z0);
      attr.setXYZ(vi++, x0, y0, z0);
      attr.setXYZ(vi++, x1, y1, z1);
    }
    attr.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  _beamIconQuaternion(out, scratch) {
    // Tip stays at the light; wide base opens toward the target (ConeGeometry expands -Y).
    return out.setFromUnitVectors(_BEAM_CONE_OPEN, scratch.forward);
  }

  /**
   * Cone size follows the per-light intensity slider (0–5), not runtime light.intensity.
   * Runtime intensity is clamped for exposure; using it made the cone plateau early while dragging.
   * Reference matches slider max (5 × directional multiplier) so peak cone size is unchanged.
   */
  _getBeamConeIntensityScaleForLightId(lightId) {
    const props = this.individualProperties[lightId];
    const light = this.lights[lightId];
    if (!props || !light) return LIGHT_INDICATOR_INTENSITY_SCALE_MIN;
    const multiplier = light.isAmbientLight ? 4 : 2;
    const sliderIntensity = (props.intensity ?? 0) * multiplier;
    const normalizedIntensity = sliderIntensity / LIGHT_INDICATOR_INTENSITY_REFERENCE;
    return THREE.MathUtils.lerp(
      LIGHT_INDICATOR_INTENSITY_SCALE_MIN,
      LIGHT_INDICATOR_INTENSITY_SCALE_MAX,
      normalizedIntensity,
    );
  }

  _getBeamConeIntensityScale(light) {
    for (const [lightId, candidate] of Object.entries(this.lights)) {
      if (candidate === light) {
        return this._getBeamConeIntensityScaleForLightId(lightId);
      }
    }
    const normalizedIntensity = (light?.intensity ?? 0) / LIGHT_INDICATOR_INTENSITY_REFERENCE;
    return THREE.MathUtils.lerp(
      LIGHT_INDICATOR_INTENSITY_SCALE_MIN,
      LIGHT_INDICATOR_INTENSITY_SCALE_MAX,
      normalizedIntensity,
    );
  }

  /**
   * Match solid cone frustum to beam wireframes: length light→target, radius = mesh fit.
   * Intensity scales both axes uniformly so the half-angle stays fixed.
   * Uses {@link _indicatorFrustumExtent} ({@link LIGHT_BEAM_ORTHO_PADDING}) — not shadow
   * quality tier padding or the expanded receive-surface shadow frustum.
   */
  _getBeamConeDimensions(beamLength, extent, intensityScale) {
    const safeLength = Math.max(Number(beamLength) || 0, 1e-6);
    const safeExtent = Math.max(Number(extent) || 0, 1e-6);
    const beamRatio = safeExtent / safeLength;
    let coneLength = safeLength * intensityScale * LIGHT_INDICATOR_SIZE_SCALE;
    let coneRadius = safeExtent * intensityScale * LIGHT_INDICATOR_SIZE_SCALE;

    if (coneLength < LIGHT_INDICATOR_MIN_CONE_HEIGHT) {
      coneLength = LIGHT_INDICATOR_MIN_CONE_HEIGHT;
      coneRadius = Math.max(coneRadius, coneLength * beamRatio);
    }
    coneRadius = Math.max(coneRadius, LIGHT_INDICATOR_MIN_CONE_RADIUS);

    return { coneLength, coneRadius };
  }

  createFalloffIndicators() {
    this.clearFalloffIndicators();
    if (!this.basePositions) return;

    const group = new THREE.Group();
    group.name = 'LightFalloffIndicators';

    ['key', 'fill', 'rim'].forEach((id) => {
      const light = this.lights[id];
      if (!light) return;

      const lightGroup = new THREE.Group();
      lightGroup.name = `LightFalloff_${id}`;
      lightGroup.userData.lightId = id;
      lightGroup.frustumCulled = false;

      const beamLines = new THREE.LineSegments(
        this._buildBeamWireGeometry(),
        this._createFalloffLineMaterial(light.color),
      );
      beamLines.name = 'LightFalloffBeam';
      beamLines.frustumCulled = false;
      beamLines.renderOrder = LIGHT_INDICATOR_RENDER_ORDER + 1;
      beamLines.userData.orbyLightFalloff = true;
      beamLines.userData.skipBokehDepth = true;

      lightGroup.add(beamLines);
      group.add(lightGroup);
    });

    this.lightFalloffIndicators = group;
    this._falloffScratch = this._falloffScratch ?? {
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      upInPlane: new THREE.Vector3(),
      worldUp: new THREE.Vector3(),
      beamLength: 1,
    };
    this.scene.add(group);
    this.updateFalloffIndicators();
  }

  clearFalloffIndicators() {
    if (!this.lightFalloffIndicators) return;
    this.scene.remove(this.lightFalloffIndicators);
    this.lightFalloffIndicators.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.lightFalloffIndicators = null;
  }

  updateFalloffIndicators() {
    if (!this.lightFalloffIndicators) return;
    const center = this._getIndicatorCenter(_INDICATOR_CENTER);
    const extent = this._indicatorFrustumExtent;
    const scratch = this._falloffScratch ?? {
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      upInPlane: new THREE.Vector3(),
      worldUp: new THREE.Vector3(),
      beamLength: 1,
    };
    this._falloffScratch = scratch;
    this.lightFalloffIndicators.children.forEach((lightGroup) => {
      const lightId = lightGroup.userData.lightId;
      const light = this.lights[lightId];
      if (!light) return;

      const props = this.individualProperties[lightId];
      const isLightEnabled = props?.enabled === true && this.lightsEnabled;
      lightGroup.visible = isLightEnabled;

      light.updateMatrixWorld(true);
      light.getWorldPosition(_LIGHT_ORIGIN);
      const target = this._resolveLightTargetWorld(light, center, _LIGHT_TARGET);
      this._resolveLightBeamBasis(_LIGHT_ORIGIN, target, scratch);

      const beamLines = lightGroup.getObjectByName('LightFalloffBeam');
      if (beamLines) {
        beamLines.position.set(0, 0, 0);
        beamLines.quaternion.identity();
        beamLines.scale.set(1, 1, 1);
        beamLines.updateMatrix();
        this._writeBeamWireWorldPositions(
          beamLines.geometry,
          _LIGHT_ORIGIN,
          target,
          scratch,
          extent,
        );
        beamLines.material.color.copy(light.color);
      }
    });
  }

  /** Groups composited after post when visible — viewport light guides, not scene geometry. */
  getIndicatorOverlayGroups() {
    /** @type {import('three').Group[]} */
    const groups = [];
    if (this.lightIndicators) groups.push(this.lightIndicators);
    if (this.lightFalloffIndicators) groups.push(this.lightFalloffIndicators);
    return groups;
  }

  setIndicatorsVisible(enabled) {
    this.showIndicators = !!enabled;
    if (this.showIndicators) {
      this.createIndicators();
    } else {
      this.clearIndicators();
    }
  }

  _getLightIndicatorScratch() {
    if (!this._indicatorScratch) {
      this._indicatorScratch = {
        forward: new THREE.Vector3(),
        right: new THREE.Vector3(),
        upInPlane: new THREE.Vector3(),
        worldUp: new THREE.Vector3(),
        beamLength: 1,
      };
    }
    return this._indicatorScratch;
  }

  createIndicators() {
    this.clearIndicators();
    if (!this.basePositions) return;

    const group = new THREE.Group();
    group.name = 'LightIndicators';

    ['key', 'fill', 'rim'].forEach((id) => {
      const light = this.lights[id];
      if (!light) return;

      const lightGroup = new THREE.Group();
      lightGroup.name = `LightIndicatorGroup_${id}`;
      lightGroup.frustumCulled = false;
      lightGroup.userData.lightId = id;
      lightGroup.userData.orbyLightIndicator = true;
      lightGroup.userData.skipBokehDepth = true;

      const coneGeometry = new THREE.ConeGeometry(
        LIGHT_INDICATOR_UNIT_CONE_RADIUS,
        LIGHT_INDICATOR_UNIT_CONE_HEIGHT,
        28,
        1,
      );

      const cone = new THREE.Mesh(
        coneGeometry,
        new THREE.MeshBasicMaterial({
          color: light.color,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
      );

      cone.name = `LightIndicator_${id}`;
      cone.renderOrder = LIGHT_INDICATOR_RENDER_ORDER;
      cone.userData.lightId = id;
      cone.userData.orbyLightPicker = true;

      const pickMesh = new THREE.Mesh(
        coneGeometry,
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.001,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      pickMesh.name = `LightIndicatorPick_${id}`;
      pickMesh.userData.lightId = id;
      pickMesh.userData.orbyLightPicker = true;
      pickMesh.scale.setScalar(1.2);
      pickMesh.renderOrder = LIGHT_INDICATOR_RENDER_ORDER - 1;

      const wire = new THREE.LineSegments(
        new THREE.EdgesGeometry(coneGeometry),
        new THREE.LineBasicMaterial({
          color: light.color,
          transparent: true,
          opacity: LIGHT_INDICATOR_WIRE_OPACITY,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      wire.name = `LightIndicatorWire_${id}`;
      wire.userData.orbyLightIndicatorWire = true;
      wire.userData.lightId = id;
      wire.userData.orbyLightPicker = true;
      wire.renderOrder = LIGHT_INDICATOR_RENDER_ORDER + 1;

      const selectionWire = new THREE.LineSegments(
        new THREE.EdgesGeometry(coneGeometry),
        new THREE.LineBasicMaterial({
          color: ORBY_LIME,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      selectionWire.name = `LightIndicatorSelection_${id}`;
      selectionWire.userData.orbyLightIndicatorSelection = true;
      selectionWire.userData.lightId = id;
      selectionWire.userData.orbyLightPicker = true;
      selectionWire.renderOrder = LIGHT_INDICATOR_RENDER_ORDER + 2;
      selectionWire.visible = false;
      selectionWire.scale.setScalar(1.05);

      lightGroup.add(pickMesh);
      lightGroup.add(cone);
      lightGroup.add(wire);
      lightGroup.add(selectionWire);
      group.add(lightGroup);
    });

    this.lightIndicators = group;
    this.scene.add(group);
    this._ensureShadowBadgeLayouts();
    this.updateIndicators();
  }

  _ensureShadowBadgeLayouts() {
    if (this._shadowBadgeLayouts) return;
    this._shadowBadgeLayouts = {
      key: { visible: false, active: false, lightOn: false, color: '#ffffff', world: new THREE.Vector3() },
      fill: { visible: false, active: false, lightOn: false, color: '#ffffff', world: new THREE.Vector3() },
      rim: { visible: false, active: false, lightOn: false, color: '#ffffff', world: new THREE.Vector3() },
    };
  }

  /** Screen-space HUD anchors for {@link LightIndicatorHudController}. */
  getShadowBadgeLayouts() {
    if (!this.showIndicators) return null;
    this._ensureShadowBadgeLayouts();
    return this._shadowBadgeLayouts;
  }

  clearIndicators() {
    if (!this.lightIndicators) return;
    this.scene.remove(this.lightIndicators);
    this.lightIndicators.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.lightIndicators = null;
    if (this._shadowBadgeLayouts) {
      for (const layout of Object.values(this._shadowBadgeLayouts)) {
        layout.visible = false;
        layout.active = false;
      }
    }
  }

  updateIndicators() {
    const center = this._getIndicatorCenter(_INDICATOR_CENTER);
    const extent = this._indicatorFrustumExtent;
    const scratch = this._getLightIndicatorScratch();
    this._ensureShadowBadgeLayouts();

    const rigVisible = this.lightsEnabled && this.showIndicators;

    for (const lightId of ['key', 'fill', 'rim']) {
      const light = this.lights[lightId];
      const layout = this._shadowBadgeLayouts?.[lightId];
      if (!light || !layout) continue;

      const props = this.individualProperties[lightId];
      const lightOn = props?.enabled === true && this.lightsEnabled;

      layout.visible = rigVisible;
      layout.lightOn = lightOn;
      layout.active = this.getSceneState?.()
        ? resolveLightCastShadowEffective(this.getSceneState(), lightId)
        : lightOn && light.castShadow === true;
      layout.color = `#${light.color.getHexString()}`;

      if (!rigVisible) continue;

      light.updateMatrixWorld(true);
      light.getWorldPosition(_LIGHT_ORIGIN);
      const target = this._resolveLightTargetWorld(light, center, _LIGHT_TARGET);
      this._resolveLightBeamBasis(_LIGHT_ORIGIN, target, scratch);
      const { coneLength, coneRadius } = this._getBeamConeDimensions(
        scratch.beamLength,
        extent,
        LIGHT_SHADOW_BADGE_ANCHOR_INTENSITY_SCALE,
      );
      layout.world
        .copy(_LIGHT_ORIGIN)
        .addScaledVector(scratch.forward, -coneLength * LIGHT_SHADOW_BADGE_BACK_SCALE)
        .addScaledVector(scratch.upInPlane, coneRadius * LIGHT_SHADOW_BADGE_UP_SCALE);
    }

    if (this.lightIndicators) {
      for (const lightGroup of this.lightIndicators.children) {
        const lightId = lightGroup.userData.lightId;
        const light = this.lights[lightId];
        if (!light || !lightId) continue;

        const props = this.individualProperties[lightId];
        const lightOn = props?.enabled === true && this.lightsEnabled;

        lightGroup.visible = rigVisible;
        if (!rigVisible) continue;

        light.updateMatrixWorld(true);
        light.getWorldPosition(_LIGHT_ORIGIN);
        const target = this._resolveLightTargetWorld(light, center, _LIGHT_TARGET);
        this._resolveLightBeamBasis(_LIGHT_ORIGIN, target, scratch);
        const intensityScale = this._getBeamConeIntensityScaleForLightId(lightId);
        const { coneLength, coneRadius } = this._getBeamConeDimensions(
          scratch.beamLength,
          extent,
          intensityScale,
        );

        lightGroup.quaternion.copy(this._beamIconQuaternion(_BEAM_ICON_QUAT, scratch));
        _BEAM_ICON_POS.copy(_LIGHT_ORIGIN).addScaledVector(
          scratch.forward,
          0.5 * coneLength * LIGHT_INDICATOR_UNIT_CONE_HEIGHT,
        );
        lightGroup.position.copy(_BEAM_ICON_POS);
        lightGroup.scale.set(coneRadius, coneLength, coneRadius);

        const pickMesh = lightGroup.getObjectByName(`LightIndicatorPick_${lightId}`);
        const cone = lightGroup.getObjectByName(`LightIndicator_${lightId}`);
        const wire = lightGroup.getObjectByName(`LightIndicatorWire_${lightId}`);
        const selectionWire = lightGroup.getObjectByName(`LightIndicatorSelection_${lightId}`);
        const selected = this._selectedLightId === lightId;
        if (pickMesh?.isMesh) {
          pickMesh.visible = rigVisible;
        }
        if (cone?.isMesh) {
          cone.visible = lightOn;
          cone.material.color.copy(light.color);
        }
        if (wire?.isLineSegments) {
          wire.visible = !lightOn && !selected;
          wire.material.color.copy(light.color);
        }
        if (selectionWire?.isLineSegments) {
          selectionWire.visible = selected;
        }
      }
    }

    this.updateFalloffIndicators();
  }
}

