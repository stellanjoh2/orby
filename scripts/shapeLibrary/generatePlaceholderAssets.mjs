/**
 * One-off generator for bundled shape-library GLBs (Orby-original placeholders).
 * Run: node scripts/shapeLibrary/generatePlaceholderAssets.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../../assets/3D-assets/shape-library');
/** Uniform visual size in thumbs/viewport — bounding-sphere radius after centering. */
const PLACEHOLDER_TARGET_BOUNDING_RADIUS = 0.5;
/**
 * Auto-smooth threshold for custom faceted meshes (Escher solid, etc.).
 * Matches import/STL default — typical DCC hard-edge split is ~40°, not SVG curve tuning (~30°).
 */
const FACETED_MESH_CREASE_ANGLE_DEG = 40;

/** @typedef {'preserve-authored' | 'smooth-curved' | 'crease-faceted'} PlaceholderNormalPolicy */

/**
 * Center on origin and scale uniformly so bounding-sphere radius === target.
 * (Max-axis fit makes cubes read larger than rings/crystals in the library grid.)
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [targetRadius]
 */
function centerAndFitBoundingSphere(geometry, targetRadius = PLACEHOLDER_TARGET_BOUNDING_RADIUS) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;

  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);

  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? 0;
  if (Number.isFinite(radius) && radius > 0) {
    const s = targetRadius / radius;
    geometry.scale(s, s, s);
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Weld verts that share the same position (torus radial wrap, etc.).
 * mergeVertices keeps UV splits; for smooth curves we need a true position weld.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [epsilon]
 * @returns {THREE.BufferGeometry}
 */
function weldCoincidentVertices(geometry, epsilon = 1e-6) {
  const posAttr = geometry.getAttribute('position');
  const normAttr = geometry.getAttribute('normal');
  const uvAttr = geometry.getAttribute('uv');
  const indexAttr = geometry.index;
  if (!posAttr) return geometry;

  const oldToNew = new Int32Array(posAttr.count).fill(-1);
  /** @type {{ p: THREE.Vector3, normals: THREE.Vector3[], uv: THREE.Vector2 }[]} */
  const buckets = [];

  for (let i = 0; i < posAttr.count; i += 1) {
    const point = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    let bucketIndex = -1;
    for (let b = 0; b < buckets.length; b += 1) {
      if (buckets[b].p.distanceTo(point) <= epsilon) {
        bucketIndex = b;
        break;
      }
    }
    if (bucketIndex < 0) {
      bucketIndex = buckets.length;
      buckets.push({
        p: point,
        normals: [],
        uv: uvAttr
          ? new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i))
          : new THREE.Vector2(),
      });
    }
    oldToNew[i] = bucketIndex;
    if (normAttr) {
      buckets[bucketIndex].normals.push(
        new THREE.Vector3(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)),
      );
    }
  }

  if (buckets.length === posAttr.count) return geometry;

  const positions = new Float32Array(buckets.length * 3);
  const normals = new Float32Array(buckets.length * 3);
  const uvs = new Float32Array(buckets.length * 2);
  for (let b = 0; b < buckets.length; b += 1) {
    const bucket = buckets[b];
    positions[b * 3] = bucket.p.x;
    positions[b * 3 + 1] = bucket.p.y;
    positions[b * 3 + 2] = bucket.p.z;
    const avgNormal = new THREE.Vector3();
    if (bucket.normals.length) {
      for (const normal of bucket.normals) avgNormal.add(normal);
      avgNormal.divideScalar(bucket.normals.length).normalize();
    }
    normals[b * 3] = avgNormal.x;
    normals[b * 3 + 1] = avgNormal.y;
    normals[b * 3 + 2] = avgNormal.z;
    uvs[b * 2] = bucket.uv.x;
    uvs[b * 2 + 1] = bucket.uv.y;
  }

  const welded = new THREE.BufferGeometry();
  welded.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  welded.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  welded.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const indexCount = indexAttr ? indexAttr.count : posAttr.count;
  const indices = new Uint16Array(indexCount);
  for (let i = 0; i < indexCount; i += 1) {
    indices[i] = oldToNew[indexAttr ? indexAttr.getX(i) : i];
  }
  welded.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.dispose();
  return welded;
}

/**
 * Final normal pass — policy per primitive type, not one global crease angle.
 * @param {THREE.BufferGeometry} geometry
 * @param {PlaceholderNormalPolicy} policy
 * @returns {THREE.BufferGeometry}
 */
function finalizePlaceholderNormals(geometry, policy) {
  switch (policy) {
    case 'preserve-authored':
      // BoxGeometry / ConeGeometry already split verts on hard edges — do not re-smooth.
      return geometry;
    case 'smooth-curved': {
      // Torus wrap duplicates position with different UVs — weld before re-smoothing.
      let geom = weldCoincidentVertices(geometry);
      geom.computeVertexNormals();
      return geom;
    }
    case 'crease-faceted': {
      const creaseAngleRad = THREE.MathUtils.degToRad(FACETED_MESH_CREASE_ANGLE_DEG);
      const creased = toCreasedNormals(geometry, creaseAngleRad);
      if (creased !== geometry) {
        geometry.dispose();
        return creased;
      }
      return geometry;
    }
    default:
      return geometry;
  }
}

/** Low-poly Escher-style star (stellated octahedron compound). */
function buildEscherSolidGeometry() {
  const verts = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(0.72));

  const faces = [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ];

  const positions = [];
  for (const [a, b, c] of faces) {
    positions.push(...verts[a].toArray(), ...verts[b].toArray(), ...verts[c].toArray());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  assignSphericalUv(geo);
  return geo;
}

/** Spherical unwrap for custom meshes that lack parametric UVs (e.g. Escher solid). */
function assignSphericalUv(geometry) {
  const pos = geometry.getAttribute('position');
  if (!pos) return geometry;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    uvs[i * 2] = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Ensure every exported mesh carries TEXCOORD_0 for texture / UV-driven Shader Lab presets. */
function ensureGeometryUv(geometry) {
  if (geometry.getAttribute('uv')) return geometry;
  return assignSphericalUv(geometry);
}

const SHAPES = [
  {
    file: 'box.glb',
    geometry: () => new THREE.BoxGeometry(1, 1, 1),
    normalPolicy: 'preserve-authored',
  },
  {
    file: 'pyramid.glb',
    geometry: () => new THREE.ConeGeometry(0.78, 1.15, 4),
    normalPolicy: 'preserve-authored',
  },
  {
    file: 'torus.glb',
    geometry: () => new THREE.TorusGeometry(0.58, 0.2, 10, 22),
    normalPolicy: 'smooth-curved',
  },
  {
    file: 'escher.glb',
    geometry: buildEscherSolidGeometry,
    normalPolicy: 'crease-faceted',
  },
];

/**
 * Minimal binary GLB writer for indexed triangle meshes with vec3 positions, normals, and UVs.
 * @param {THREE.BufferGeometry} geometry
 * @param {string} name
 */
function geometryToGlb(geometry, name) {
  ensureGeometryUv(geometry);
  const geo = geometry.index ? geometry : geometry.toNonIndexed();
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal') ?? (() => {
    geo.computeVertexNormals();
    return geo.getAttribute('normal');
  })();
  const uv = geo.getAttribute('uv');

  const vertexCount = pos.count;
  const indexArray = geo.index
    ? new Uint16Array(geo.index.array)
    : Uint16Array.from({ length: vertexCount }, (_, i) => i);

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < vertexCount; i += 1) {
    positions[i * 3] = pos.getX(i);
    positions[i * 3 + 1] = pos.getY(i);
    positions[i * 3 + 2] = pos.getZ(i);
    normals[i * 3] = norm.getX(i);
    normals[i * 3 + 1] = norm.getY(i);
    normals[i * 3 + 2] = norm.getZ(i);
    uvs[i * 2] = uv.getX(i);
    uvs[i * 2 + 1] = uv.getY(i);
  }

  const posBytes = positions.byteLength;
  const normBytes = normals.byteLength;
  const uvBytes = uvs.byteLength;
  const idxBytes = indexArray.byteLength;
  const posOffset = 0;
  const normOffset = posOffset + posBytes;
  const uvOffset = normOffset + normBytes;
  const idxOffset = uvOffset + uvBytes;
  const binLength = idxOffset + idxBytes;

  const bin = new ArrayBuffer(binLength);
  new Float32Array(bin, posOffset, positions.length).set(positions);
  new Float32Array(bin, normOffset, normals.length).set(normals);
  new Float32Array(bin, uvOffset, uvs.length).set(uvs);
  new Uint16Array(bin, idxOffset, indexArray.length).set(indexArray);

  const json = {
    asset: { version: '2.0', generator: 'Orby Shape Library' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            indices: 3,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'Default',
        pbrMetallicRoughness: {
          baseColorFactor: [0.78, 0.78, 0.78, 1],
          metallicFactor: 0.08,
          roughnessFactor: 0.42,
        },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vertexCount,
        type: 'VEC3',
        max: [1, 1, 1],
        min: [-1, -1, -1],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: vertexCount,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: vertexCount,
        type: 'VEC2',
        max: [1, 1],
        min: [0, 0],
      },
      {
        bufferView: 3,
        componentType: 5123,
        count: indexArray.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: normOffset, byteLength: normBytes, target: 34962 },
      { buffer: 0, byteOffset: uvOffset, byteLength: uvBytes, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes, target: 34963 },
    ],
    buffers: [{ byteLength: binLength }],
  };

  const posAcc = json.accessors[0];
  posAcc.min = [Infinity, Infinity, Infinity];
  posAcc.max = [-Infinity, -Infinity, -Infinity];
  const uvAcc = json.accessors[2];
  uvAcc.min = [Infinity, Infinity];
  uvAcc.max = [-Infinity, -Infinity];
  for (let i = 0; i < vertexCount; i += 1) {
    posAcc.min[0] = Math.min(posAcc.min[0], pos.getX(i));
    posAcc.min[1] = Math.min(posAcc.min[1], pos.getY(i));
    posAcc.min[2] = Math.min(posAcc.min[2], pos.getZ(i));
    posAcc.max[0] = Math.max(posAcc.max[0], pos.getX(i));
    posAcc.max[1] = Math.max(posAcc.max[1], pos.getY(i));
    posAcc.max[2] = Math.max(posAcc.max[2], pos.getZ(i));
    uvAcc.min[0] = Math.min(uvAcc.min[0], uv.getX(i));
    uvAcc.min[1] = Math.min(uvAcc.min[1], uv.getY(i));
    uvAcc.max[0] = Math.max(uvAcc.max[0], uv.getX(i));
    uvAcc.max[1] = Math.max(uvAcc.max[1], uv.getY(i));
  }

  const jsonText = JSON.stringify(json);
  const jsonPadding = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = jsonText + ' '.repeat(jsonPadding);

  const binPadding = (4 - (binLength % 4)) % 4;
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binLength + binPadding;

  const out = Buffer.alloc(totalLength);
  let offset = 0;
  out.write('glTF', offset);
  offset += 4;
  out.writeUInt32LE(2, offset);
  offset += 4;
  out.writeUInt32LE(totalLength, offset);
  offset += 4;

  out.writeUInt32LE(jsonChunk.length, offset);
  offset += 4;
  out.write('JSON', offset);
  offset += 4;
  out.write(jsonChunk, offset);
  offset += jsonChunk.length;

  out.writeUInt32LE(binLength + binPadding, offset);
  offset += 4;
  out.write('BIN\u0000', offset);
  offset += 4;
  Buffer.from(bin).copy(out, offset);
  offset += binLength;
  if (binPadding) out.write('\0'.repeat(binPadding), offset);

  if (geo !== geometry) geo.dispose();
  return out;
}

await mkdir(OUT_DIR, { recursive: true });

for (const shape of SHAPES) {
  let geometry = shape.geometry();
  centerAndFitBoundingSphere(geometry);
  geometry = finalizePlaceholderNormals(geometry, shape.normalPolicy);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const sphereRadius = geometry.boundingSphere?.radius ?? 0;

  const buffer = geometryToGlb(geometry, shape.file.replace('.glb', ''));
  const outPath = join(OUT_DIR, shape.file);
  await writeFile(outPath, buffer);
  geometry.dispose();
  console.log(
    `Wrote ${outPath} (${buffer.length} bytes, boundingRadius=${sphereRadius.toFixed(3)})`,
  );
}

console.log('Done — shape library placeholders ready.');
