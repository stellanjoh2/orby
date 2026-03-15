import * as THREE from 'three';
import { GLTFExporter } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/exporters/GLTFExporter.js';
import { toCreasedNormals } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js';

const sanitizeBaseName = (name) => {
  const raw = String(name || 'svg-extrude')
    .replace(/\.[^/.]+$/, '')
    .trim();
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'svg-extrude';
};

const resolveSvgNormalAngleDeg = (node, fallback = 45) => {
  let current = node;
  while (current) {
    if (current.userData?.orbySvgNormalAngleDeg !== undefined) {
      const value = Number(current.userData.orbySvgNormalAngleDeg);
      if (Number.isFinite(value)) return value;
    }
    current = current.parent || null;
  }
  return fallback;
};

const flipGeometryNormals = (geometry) => {
  const normalAttr = geometry?.attributes?.normal;
  if (!normalAttr) return;
  for (let i = 0; i < normalAttr.count; i += 1) {
    normalAttr.setXYZ(
      i,
      -normalAttr.getX(i),
      -normalAttr.getY(i),
      -normalAttr.getZ(i),
    );
  }
  normalAttr.needsUpdate = true;
};

const alignNormalDirectionToSource = (sourceGeometry, targetGeometry) => {
  const sourceNormals = sourceGeometry?.attributes?.normal;
  const targetNormals = targetGeometry?.attributes?.normal;
  if (!sourceNormals || !targetNormals) return;
  const count = Math.min(sourceNormals.count, targetNormals.count);
  for (let i = 0; i < count; i += 1) {
    const sx = sourceNormals.getX(i);
    const sy = sourceNormals.getY(i);
    const sz = sourceNormals.getZ(i);
    const tx = targetNormals.getX(i);
    const ty = targetNormals.getY(i);
    const tz = targetNormals.getZ(i);
    const sourceLenSq = sx * sx + sy * sy + sz * sz;
    const targetLenSq = tx * tx + ty * ty + tz * tz;
    if (sourceLenSq < 1e-8 || targetLenSq < 1e-8) continue;
    const dot = sx * tx + sy * ty + sz * tz;
    if (dot < 0) {
      flipGeometryNormals(targetGeometry);
    }
    return;
  }
};

const forceOpaqueMaterialForExport = (material) => {
  if (!material) return;
  // Avoid baking transient viewer fade/transparency state into exported GLB.
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.depthTest = true;
  material.needsUpdate = true;
};

const cloneExportNode = (object3d) => {
  const clone = object3d.clone(true);

  const sourceMeshes = [];
  const clonedMeshes = [];
  object3d.traverse((node) => {
    if (node.isMesh) sourceMeshes.push(node);
  });
  clone.traverse((node) => {
    if (node.isMesh) clonedMeshes.push(node);
  });

  for (let i = 0; i < sourceMeshes.length; i += 1) {
    const sourceMesh = sourceMeshes[i];
    const clonedMesh = clonedMeshes[i];
    if (!sourceMesh || !clonedMesh) continue;
    clonedMesh.geometry = sourceMesh.geometry?.clone?.() ?? sourceMesh.geometry;
    if (Array.isArray(sourceMesh.material)) {
      clonedMesh.material = sourceMesh.material.map((mat) => mat?.clone?.() ?? mat);
    } else {
      clonedMesh.material = sourceMesh.material?.clone?.() ?? sourceMesh.material;
    }

    if (sourceMesh.userData?.orbySvgExtrude) {
      const angleDeg = resolveSvgNormalAngleDeg(sourceMesh);
      const angleRad = THREE.MathUtils.degToRad(angleDeg);
      const creased = toCreasedNormals(clonedMesh.geometry, angleRad);
      if (creased !== clonedMesh.geometry) {
        clonedMesh.geometry?.dispose?.();
        clonedMesh.geometry = creased;
      }
      alignNormalDirectionToSource(sourceMesh.geometry, clonedMesh.geometry);
      const applyDoubleSided = (mat) => {
        if (!mat) return;
        mat.side = THREE.DoubleSide;
        forceOpaqueMaterialForExport(mat);
        mat.needsUpdate = true;
      };
      if (Array.isArray(clonedMesh.material)) {
        clonedMesh.material.forEach(applyDoubleSided);
      } else {
        applyDoubleSided(clonedMesh.material);
      }
    }
  }

  return clone;
};

const downloadBinary = (arrayBuffer, fileName) => {
  const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export class SvgGlbExporter {
  constructor() {
    this.exporter = new GLTFExporter();
  }

  async exportFromModelRoot(modelRoot, sourceName) {
    if (!modelRoot) {
      throw new Error('No model root available for GLB export');
    }
    const exportNode = cloneExportNode(modelRoot);
    const baseName = sanitizeBaseName(sourceName);
    const fileName = `${baseName}.glb`;

    const result = await new Promise((resolve, reject) => {
      this.exporter.parse(
        exportNode,
        resolve,
        reject,
        {
          binary: true,
          onlyVisible: true,
          maxTextureSize: 4096,
          trs: false,
        },
      );
    });

    // GLTFExporter returns ArrayBuffer when binary=true.
    if (!(result instanceof ArrayBuffer)) {
      throw new Error('Unexpected GLB export result');
    }
    downloadBinary(result, fileName);

    // Dispose cloned resources created for export.
    exportNode.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) {
        node.material.forEach((mat) => mat?.dispose?.());
      } else {
        node.material?.dispose?.();
      }
    });
  }
}
