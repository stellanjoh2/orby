/**
 * Apply bundled shape-library chrome PBR to raw GLB exports.
 *
 * Matches SHAPE_LIBRARY_DEFAULT_* in shapeLibraryCatalog.js:
 *   baseColor #ffffff, metalness 1, roughness 0.2
 *
 * Usage:
 *   node scripts/dev/processShapeLibraryGlbs.mjs /path/to/cube.glb /path/to/cone.glb ...
 *   node scripts/dev/processShapeLibraryGlbs.mjs   # reads assets/3D-assets/shape-library-sources/
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHAPE_LIBRARY_BAKEABLE_IDS } from '../shapeLibrary/shapeLibraryCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const defaultSourcesDir = path.join(root, 'assets', '3D-assets', 'shape-library-sources');
const outDir = path.join(root, 'assets', '3D-assets', 'shape-library');

/** Chrome defaults baked into bundled GLBs (runtime sliders read these on insert). */
const SHAPE_LIBRARY_BAKED_PBR = Object.freeze({
  baseColorFactor: [1, 1, 1, 1],
  metallicFactor: 1,
  roughnessFactor: 0.2,
});

/**
 * @param {Buffer} buffer
 * @returns {Buffer}
 */
function applyShapeLibraryChromePbr(buffer) {
  const jsonLen = buffer.readUInt32LE(12);
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLen;
  const gltf = JSON.parse(buffer.slice(jsonStart, jsonEnd).toString());

  if (!Array.isArray(gltf.materials) || gltf.materials.length === 0) {
    throw new Error('GLB has no materials to patch');
  }

  for (const material of gltf.materials) {
    material.pbrMetallicRoughness = {
      ...material.pbrMetallicRoughness,
      baseColorFactor: [...SHAPE_LIBRARY_BAKED_PBR.baseColorFactor],
      metallicFactor: SHAPE_LIBRARY_BAKED_PBR.metallicFactor,
      roughnessFactor: SHAPE_LIBRARY_BAKED_PBR.roughnessFactor,
    };
  }

  const jsonChunk = Buffer.from(JSON.stringify(gltf));
  const binChunkStart = jsonEnd;
  const binChunkLen = buffer.readUInt32LE(binChunkStart);
  const binChunk = buffer.slice(binChunkStart, binChunkStart + 8 + binChunkLen);

  const totalLen = 12 + 8 + jsonChunk.length + binChunk.length;
  const out = Buffer.alloc(totalLen);
  let offset = 0;

  out.write('glTF', offset);
  offset += 4;
  out.writeUInt32LE(2, offset);
  offset += 4;
  out.writeUInt32LE(totalLen, offset);
  offset += 4;

  out.writeUInt32LE(jsonChunk.length, offset);
  offset += 4;
  out.writeUInt32LE(0x4e4f534a, offset); // JSON
  offset += 4;
  jsonChunk.copy(out, offset);
  offset += jsonChunk.length;

  binChunk.copy(out, offset);
  return out;
}

/**
 * @param {string} sourcePath
 * @returns {Promise<string | null>} shape id when written
 */
async function processOne(sourcePath) {
  const base = path.basename(sourcePath, path.extname(sourcePath));
  const shapeId = base.replace(/-\d+$/, '');
  if (!SHAPE_LIBRARY_BAKEABLE_IDS.includes(shapeId)) {
    console.warn(`[Orby] Skipping ${base} — unknown shape id (expected ${SHAPE_LIBRARY_BAKEABLE_IDS.join(', ')})`);
    return null;
  }

  const raw = await fs.readFile(sourcePath);
  const treated = applyShapeLibraryChromePbr(raw);
  const outPath = path.join(outDir, `${shapeId}.glb`);
  await fs.writeFile(outPath, treated);
  console.log(`[Orby] Wrote ${path.relative(root, outPath)} (${treated.length} bytes)`);
  return shapeId;
}

async function resolveSourcePaths(argv) {
  const args = argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (args.length > 0) return args.map((p) => path.resolve(p));

  const entries = await fs.readdir(defaultSourcesDir).catch(() => []);
  return entries
    .filter((name) => name.endsWith('.glb'))
    .map((name) => path.join(defaultSourcesDir, name));
}

const sources = await resolveSourcePaths(process.argv);
if (sources.length === 0) {
  console.error(
    '[Orby] No GLB sources. Pass paths or drop files in assets/3D-assets/shape-library-sources/',
  );
  process.exit(1);
}

let wrote = 0;
for (const source of sources) {
  const id = await processOne(source);
  if (id) wrote += 1;
}

console.log(`[Orby] Processed ${wrote}/${sources.length} shape-library GLBs.`);
