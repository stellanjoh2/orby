import * as THREE from 'three';

/** Max instanced billboard particles (Dreams default pool). */
export const AMBIENT_DUST_MAX_PARTICLES = 160;

/** Default active count when enabled. */
export const AMBIENT_DUST_DEFAULT_AMOUNT = 70;

/** World quad base size at {@link PARTICLE_SCREEN_REF_DISTANCE}. */
export const AMBIENT_DUST_DEFAULT_SCALE = 0.04;

/** Default additive tint (Dreams cyan haze). */
export const AMBIENT_DUST_DEFAULT_COLOR = '#b9fff4';

/**
 * Quad scale is multiplied by (distance / this) so specks keep ~constant screen thickness.
 * Ported from Dreams {@link AmbientDustSystem}.
 */
const PARTICLE_SCREEN_REF_DISTANCE = 9;

const DEFAULT_HALF_EXTENTS = new THREE.Vector3(4, 3, 4);

function createDustSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Orby could not create the ambient dust sprite.');
  }

  const gradient = context.createRadialGradient(32, 32, 8, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.62, 'rgba(255,255,255,0.32)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * World-space instanced billboard dust — ported from Dreams Candy Lands.
 * Additive quads with distance-scaled size for screen-space-like thickness.
 */
export class AmbientDustController {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   stateStore: import('../state/StateStore.js').StateStore,
   *   getCamera: () => THREE.Camera | null | undefined,
   *   getOrbitTarget: () => THREE.Vector3 | null | undefined,
   *   getModelBounds: () => { center: THREE.Vector3, size: THREE.Vector3 } | null | undefined,
   * }} deps
   */
  constructor({ scene, stateStore, getCamera, getOrbitTarget, getModelBounds }) {
    this.scene = scene;
    this.stateStore = stateStore;
    this.getCamera = getCamera;
    this.getOrbitTarget = getOrbitTarget;
    this.getModelBounds = getModelBounds;

    this.sprite = createDustSpriteTexture();
    this.maxParticles = AMBIENT_DUST_MAX_PARTICLES;
    this.settings = null;
    this.quadWorldSize = AMBIENT_DUST_DEFAULT_SCALE;
    this.volumeCenter = new THREE.Vector3();
    this.volumeHalfExtents = DEFAULT_HALF_EXTENTS.clone();

    this.positions = new Float32Array(this.maxParticles * 3);
    this.origins = new Float32Array(this.maxParticles * 3);
    this.horizontalAmplitude = new Float32Array(this.maxParticles);
    this.verticalAmplitude = new Float32Array(this.maxParticles);
    this.driftSpeed = new Float32Array(this.maxParticles);
    this.phase = new Float32Array(this.maxParticles);

    this.dummy = new THREE.Object3D();
    this.worldPos = new THREE.Vector3();
    this.toCamera = new THREE.Vector3();
    this.billboardQuat = new THREE.Quaternion();
    this.planeNormal = new THREE.Vector3(0, 0, 1);

    this.material = new THREE.MeshBasicMaterial({
      map: this.sprite,
      color: new THREE.Color(AMBIENT_DUST_DEFAULT_COLOR),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geometry, this.material, this.maxParticles);
    this.mesh.name = 'AmbientDust';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    this.mesh.count = 0;
  }

  /** @param {object} initialState */
  init(initialState) {
    const defaults = this.stateStore.getDefaults().ambientDust ?? {};
    this.settings = {
      ...defaults,
      ...(initialState.ambientDust ?? {}),
    };
    this.scene.add(this.mesh);
    this.reseedVolumeFromScene();
    this.updateSettings(this.settings);
  }

  /** Recompute the dust volume from orbit target and model bounds. */
  reseedVolumeFromScene() {
    const target = this.getOrbitTarget?.();
    const bounds = this.getModelBounds?.();

    if (target) {
      this.volumeCenter.copy(target);
    } else {
      this.volumeCenter.set(0, 1, 0);
    }

    if (bounds?.size && bounds?.center) {
      this.volumeCenter.copy(bounds.center);
      this.volumeHalfExtents.set(
        Math.max(bounds.size.x * 0.65, 2),
        Math.max(bounds.size.y * 0.55, 1.5),
        Math.max(bounds.size.z * 0.65, 2),
      );
    } else {
      this.volumeHalfExtents.copy(DEFAULT_HALF_EXTENTS);
    }

    this._seedParticleOrigins();
  }

  _seedParticleOrigins() {
    const center = this.volumeCenter;
    const half = this.volumeHalfExtents;

    for (let index = 0; index < this.maxParticles; index += 1) {
      const i3 = index * 3;
      const originX = center.x + (Math.random() - 0.5) * half.x * 2;
      const originY = center.y + (Math.random() * 0.85 + 0.05) * half.y * 2;
      const originZ = center.z + (Math.random() - 0.42) * half.z * 2;

      this.origins[i3] = originX;
      this.origins[i3 + 1] = originY;
      this.origins[i3 + 2] = originZ;

      this.positions[i3] = originX;
      this.positions[i3 + 1] = originY;
      this.positions[i3 + 2] = originZ;

      this.horizontalAmplitude[index] = 0.3 + Math.random() * 1.5;
      this.verticalAmplitude[index] = 0.12 + Math.random() * 0.9;
      this.driftSpeed[index] = 0.05 + Math.random() * 0.12;
      this.phase[index] = Math.random() * Math.PI * 2;
    }
  }

  /**
   * @param {Partial<{
   *   enabled: boolean,
   *   amount: number,
   *   scale: number,
   *   color: string,
   * }> | null} [settings]
   */
  updateSettings(settings = null) {
    if (settings) {
      const defaults = this.stateStore.getDefaults().ambientDust ?? {};
      this.settings = {
        ...(this.settings ?? defaults),
        ...settings,
      };
    }

    const defaults = this.stateStore.getDefaults().ambientDust ?? {};
    const currentState = this.stateStore.getState();
    const merged = {
      ...defaults,
      ...(this.settings ?? {}),
      ...(currentState.ambientDust ?? {}),
    };

    this.settings = merged;
    const enabled = !!merged.enabled;
    const count = enabled
      ? THREE.MathUtils.clamp(Math.round(merged.amount ?? AMBIENT_DUST_DEFAULT_AMOUNT), 0, this.maxParticles)
      : 0;
    const particleSize = THREE.MathUtils.clamp(
      Number.isFinite(merged.scale) ? merged.scale : AMBIENT_DUST_DEFAULT_SCALE,
      0.04,
      14,
    );

    this.mesh.count = count;
    this.quadWorldSize = particleSize;
    this.material.color.set(merged.color ?? AMBIENT_DUST_DEFAULT_COLOR);
    this.material.opacity = count > 0 ? 0.92 : 0;
    this.mesh.visible = count > 0;
  }

  /**
   * @param {number} elapsed
   * @param {THREE.Camera} [camera]
   */
  update(elapsed, camera = this.getCamera?.()) {
    const count = this.mesh.count;
    if (count === 0 || !camera) return;

    const camPos = camera.position;

    for (let index = 0; index < count; index += 1) {
      const i3 = index * 3;
      const phase = this.phase[index];
      const speed = this.driftSpeed[index];
      const horizontalAmplitude = this.horizontalAmplitude[index];
      const verticalAmplitude = this.verticalAmplitude[index];
      const sway = elapsed * speed + phase;

      this.positions[i3] = this.origins[i3] + Math.sin(sway) * horizontalAmplitude;
      this.positions[i3 + 1] =
        this.origins[i3 + 1] +
        Math.sin(sway * 0.65 + index * 0.17) * verticalAmplitude +
        Math.cos(elapsed * 0.06 + phase) * 0.12;
      this.positions[i3 + 2] = this.origins[i3 + 2] + Math.cos(sway * 0.8 + phase) * horizontalAmplitude;

      this.worldPos.set(this.positions[i3], this.positions[i3 + 1], this.positions[i3 + 2]);

      this.dummy.position.copy(this.worldPos);
      this.toCamera.subVectors(camPos, this.worldPos);
      if (this.toCamera.lengthSq() < 1e-8) {
        this.toCamera.set(0, 0, 1);
      } else {
        this.toCamera.normalize();
      }
      this.billboardQuat.setFromUnitVectors(this.planeNormal, this.toCamera);
      this.dummy.quaternion.copy(this.billboardQuat);

      const dist = Math.max(0.35, this.worldPos.distanceTo(camPos));
      const screenSpaceScale = this.quadWorldSize * (dist / PARTICLE_SCREEN_REF_DISTANCE);
      this.dummy.scale.set(screenSpaceScale, screenSpaceScale, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(index, this.dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene?.remove(this.mesh);
    this.mesh.geometry?.dispose?.();
    this.material?.dispose?.();
    this.sprite?.dispose?.();
  }
}
