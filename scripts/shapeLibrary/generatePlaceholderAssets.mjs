/**
 * One-off generator for bundled shape-library GLBs (Orby-original placeholders).
 * Run: node scripts/shapeLibrary/generatePlaceholderAssets.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../../assets/3D-assets/shape-library');
/** Authoring target — every placeholder GLB is centered with this max axis length. */
const PLACEHOLDER_TARGET_MAX_DIMENSION = 1;

/**
 * Center geometry on the origin and uniformly scale so max(x,y,z) === target.
 * @param {THREE.BufferGeometry} geometry
 * @param {number} [target]
 */
function centerAndFitMaxDimension(geometry, target = PLACEHOLDER_TARGET_MAX_DIMENSION) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);

  const maxDim = Math.max(size.x, size.y, size.z);
  if (Number.isFinite(maxDim) && maxDim > 0) {
    geometry.scale(target / maxDim, target / maxDim, target / maxDim);
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Shared presentation tilt baked into vertex positions for the library thumbs. */
function bakePresentationTilt(geometry) {
  const mesh = new THREE.Mesh(geometry);
  mesh.rotation.set(-0.18, 0.42, 0);
  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
  geo.computeVertexNormals();
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
  { file: 'box.glb', geometry: () => new THREE.BoxGeometry(1, 1, 1) },
  { file: 'pyramid.glb', geometry: () => new THREE.ConeGeometry(0.78, 1.15, 4) },
  { file: 'torus.glb', geometry: () => new THREE.TorusGeometry(0.58, 0.2, 10, 22) },
  { file: 'escher.glb', geometry: buildEscherSolidGeometry },
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
  const geometry = shape.geometry();
  geometry.computeVertexNormals();
  centerAndFitMaxDimension(geometry);
  bakePresentationTilt(geometry);
  centerAndFitMaxDimension(geometry);

  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);

  const buffer = geometryToGlb(geometry, shape.file.replace('.glb', ''));
  const outPath = join(OUT_DIR, shape.file);
  await writeFile(outPath, buffer);
  geometry.dispose();
  console.log(
    `Wrote ${outPath} (${buffer.length} bytes, maxDim=${maxDim.toFixed(3)})`,
  );
}

console.log('Done — shape library placeholders ready.');
