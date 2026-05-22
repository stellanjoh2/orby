/**
 * One-off CLI: load FBX, set mesh materials to a solid color, export GLB (with animations).
 *
 * Usage:
 *   node scripts/tools/recolorFbxToGlb.mjs <input.fbx> [output.glb] [--color=#c4ff00]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const BRAND_LIME = '#c4ff00';

/** GLTFExporter binary mode uses FileReader (browser-only). */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class NodeFileReader {
    result = null;
    onloadend = null;
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}

const disposeTexture = (tex) => tex?.dispose?.();

const promoteToStandard = (material) => {
  if (!material) return material;
  if (material.isMeshStandardMaterial || material.isMeshBasicMaterial) return material;

  const std = new THREE.MeshStandardMaterial({
    name: material.name || '',
    color: material.color?.clone?.() ?? new THREE.Color(BRAND_LIME),
    roughness: 0.55,
    metalness: 0.08,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
  });
  material.dispose?.();
  return std;
};

const applySolidColor = (root, hex) => {
  const color = new THREE.Color(hex);
  root.traverse((node) => {
    if (!node.isMesh) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const next = materials.map((mat) => {
      const std = promoteToStandard(mat);
      std.color.copy(color);
      std.emissive.set(0x000000);
      std.emissiveIntensity = 0;
      for (const key of [
        'map',
        'normalMap',
        'emissiveMap',
        'roughnessMap',
        'metalnessMap',
        'aoMap',
        'alphaMap',
        'bumpMap',
        'displacementMap',
        'lightMap',
        'envMap',
      ]) {
        if (std[key]) {
          disposeTexture(std[key]);
          std[key] = null;
        }
      }
      std.vertexColors = false;
      std.transparent = false;
      std.opacity = 1;
      std.needsUpdate = true;
      return std;
    });
    node.material = next.length === 1 ? next[0] : next;
    const colorAttr = node.geometry?.getAttribute?.('color');
    if (colorAttr) node.geometry.deleteAttribute('color');
  });
};

const parseArgs = (argv) => {
  let color = BRAND_LIME;
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith('--color=')) {
      color = arg.slice('--color='.length);
    } else {
      positional.push(arg);
    }
  }
  return { positional, color };
};

const loadFbx = async (inputPath) => {
  const buffer = await fs.readFile(inputPath);
  const loader = new FBXLoader();
  return loader.parse(buffer.buffer, path.dirname(inputPath));
};

const exportGlb = (object3d, animations) =>
  new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      object3d,
      (result) => resolve(result),
      reject,
      {
        binary: true,
        onlyVisible: true,
        maxTextureSize: 4096,
        trs: false,
        // GLTFExporter does not auto-pick clips from FBXLoader — pass them explicitly.
        animations,
      },
    );
  });

const main = async () => {
  const { positional, color } = parseArgs(process.argv.slice(2));
  const inputPath = positional[0];
  if (!inputPath) {
    console.error('Usage: node scripts/tools/recolorFbxToGlb.mjs <input.fbx> [output.glb] [--color=#c4ff00]');
    process.exit(1);
  }

  const resolvedIn = path.resolve(inputPath);
  const base = path.basename(resolvedIn, path.extname(resolvedIn));
  const outputPath =
    positional[1] != null
      ? path.resolve(positional[1])
      : path.join(path.dirname(resolvedIn), `${base}-lime.glb`);

  const root = await loadFbx(resolvedIn);
  const animations = (root.animations ?? []).filter((clip) => clip.tracks?.length > 0);

  applySolidColor(root, color);

  const glb = await exportGlb(root, animations);
  if (!(glb instanceof ArrayBuffer)) {
    throw new Error('GLTFExporter did not return ArrayBuffer');
  }

  await fs.writeFile(outputPath, Buffer.from(glb));
  const clipSummary = animations.map((c) => `${c.name} (${c.tracks.length} tracks)`).join(', ');
  console.log(
    `Wrote ${outputPath} (${(glb.byteLength / 1024).toFixed(1)} KB, color ${color}, animations: ${clipSummary || 'none'})`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
