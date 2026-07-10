import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * @param {number} amount — slider value -100…100
 * @returns {number} strength -1…1
 */
export function modifierAmountToStrength(amount) {
  return Math.max(-1, Math.min(1, (Number(amount) || 0) / 100));
}

/**
 * @typedef {{ min: THREE.Vector3, max: THREE.Vector3, center: THREE.Vector3, size: THREE.Vector3 }} ModifierBounds
 */

/**
 * @param {THREE.Vector3} out
 * @param {THREE.Vector3} p — model-space position
 * @param {ModifierBounds} bounds
 * @param {Record<string, { enabled?: boolean, amount?: number }>} modifiers
 */
export function applyModifierStack(out, p, bounds, modifiers) {
  _v.copy(p);
  const order = ['bend', 'twist', 'taper', 'skew', 'ffd'];
  for (const id of order) {
    const mod = modifiers?.[id];
    const strength = modifierAmountToStrength(mod?.amount);
    if (Math.abs(strength) < 1e-6) continue;
    switch (id) {
      case 'bend':
        applyBend(_v, bounds, strength);
        break;
      case 'twist':
        applyTwist(_v, bounds, strength);
        break;
      case 'taper':
        applyTaper(_v, bounds, strength);
        break;
      case 'skew':
        applySkew(_v, bounds, strength);
        break;
      case 'ffd':
        applySimpleFfd(_v, bounds, strength);
        break;
      default:
        break;
    }
  }
  out.copy(_v);
}

/**
 * @param {THREE.Vector3} p
 * @param {ModifierBounds} bounds
 * @param {number} strength
 */
function toNormalized(p, bounds) {
  const sx = bounds.size.x || 1;
  const sy = bounds.size.y || 1;
  const sz = bounds.size.z || 1;
  return {
    x: (p.x - bounds.center.x) / sx,
    y: (p.y - bounds.center.y) / sy,
    z: (p.z - bounds.center.z) / sz,
  };
}

/** Bend around X — curves Y/Z (classic arch). */
function applyBend(p, bounds, strength) {
  const angle = strength * Math.PI * 0.5;
  if (Math.abs(angle) < 1e-6) return;
  const n = toNormalized(p, bounds);
  const theta = n.y * angle;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const y0 = p.y - bounds.center.y;
  const z0 = p.z - bounds.center.z;
  p.y = bounds.center.y + y0 * cos - z0 * sin;
  p.z = bounds.center.z + y0 * sin + z0 * cos;
}

/** Twist around Y. */
function applyTwist(p, bounds, strength) {
  const angle = strength * Math.PI;
  if (Math.abs(angle) < 1e-6) return;
  const n = toNormalized(p, bounds);
  const twist = (n.y + 0.5) * angle;
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  const x0 = p.x - bounds.center.x;
  const z0 = p.z - bounds.center.z;
  p.x = bounds.center.x + x0 * cos - z0 * sin;
  p.z = bounds.center.z + x0 * sin + z0 * cos;
}

/** Taper X/Z along Y. */
function applyTaper(p, bounds, strength) {
  const n = toNormalized(p, bounds);
  const t = n.y + 0.5;
  const scale = 1 + strength * (t - 0.5) * 1.25;
  p.x = bounds.center.x + (p.x - bounds.center.x) * scale;
  p.z = bounds.center.z + (p.z - bounds.center.z) * scale;
}

/** Skew X along Y. */
function applySkew(p, bounds, strength) {
  const n = toNormalized(p, bounds);
  p.x += strength * n.y * (bounds.size.x || 1) * 0.65;
}

/** Simple 2×2×2 FFD — bulge/squeeze from bbox center. */
function applySimpleFfd(p, bounds, strength) {
  const n = toNormalized(p, bounds);
  const dist = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
  const factor = 1 + strength * (1 - Math.min(1, dist * 1.35)) * 0.55;
  p.x = bounds.center.x + (p.x - bounds.center.x) * factor;
  p.y = bounds.center.y + (p.y - bounds.center.y) * factor;
  p.z = bounds.center.z + (p.z - bounds.center.z) * factor;
}

/**
 * @param {THREE.Vector3} n — model-space normal (mutated)
 * @param {THREE.Vector3} p — model-space base position (for angle weights)
 * @param {ModifierBounds} bounds
 * @param {Record<string, { enabled?: boolean, amount?: number }>} modifiers
 */
export function applyModifierNormalStack(n, p, bounds, modifiers) {
  const order = ['bend', 'twist', 'taper', 'skew', 'ffd'];
  for (const id of order) {
    const mod = modifiers?.[id];
    const strength = modifierAmountToStrength(mod?.amount);
    if (Math.abs(strength) < 1e-6) continue;
    switch (id) {
      case 'bend':
        applyBendNormal(n, p, bounds, strength);
        break;
      case 'twist':
        applyTwistNormal(n, p, bounds, strength);
        break;
      case 'taper':
        applyTaperNormal(n, p, bounds, strength);
        break;
      case 'skew':
        applySkewNormal(n, bounds, strength);
        break;
      case 'ffd':
        break;
      default:
        break;
    }
  }
}

/** @param {THREE.Vector3} n @param {THREE.Vector3} p @param {ModifierBounds} bounds @param {number} strength */
function applyBendNormal(n, p, bounds, strength) {
  const angle = strength * Math.PI * 0.5;
  if (Math.abs(angle) < 1e-6) return;
  const norm = toNormalized(p, bounds);
  const theta = norm.y * angle;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const ny = n.y;
  const nz = n.z;
  n.y = ny * cos - nz * sin;
  n.z = ny * sin + nz * cos;
  n.normalize();
}

/** @param {THREE.Vector3} n @param {THREE.Vector3} p @param {ModifierBounds} bounds @param {number} strength */
function applyTwistNormal(n, p, bounds, strength) {
  const angle = strength * Math.PI;
  if (Math.abs(angle) < 1e-6) return;
  const norm = toNormalized(p, bounds);
  const twist = (norm.y + 0.5) * angle;
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  const nx = n.x;
  const nz = n.z;
  n.x = nx * cos - nz * sin;
  n.z = nx * sin + nz * cos;
  n.normalize();
}

/** @param {THREE.Vector3} n @param {THREE.Vector3} p @param {ModifierBounds} bounds @param {number} strength */
function applyTaperNormal(n, p, bounds, strength) {
  const norm = toNormalized(p, bounds);
  const t = norm.y + 0.5;
  const scale = 1 + strength * (t - 0.5) * 1.25;
  if (Math.abs(scale) < 1e-6) return;
  n.x /= scale;
  n.z /= scale;
  n.normalize();
}

/** @param {THREE.Vector3} n @param {ModifierBounds} bounds @param {number} strength */
function applySkewNormal(n, bounds, strength) {
  const sy = bounds.size.y || 1;
  const k = (strength * (bounds.size.x || 1) * 0.65) / sy;
  n.x -= k * n.y;
  n.normalize();
}

/**
 * @param {THREE.Box3} box
 * @returns {ModifierBounds}
 */
export function modifierBoundsFromBox(box) {
  const min = box.min.clone();
  const max = box.max.clone();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { min, max, center, size };
}
