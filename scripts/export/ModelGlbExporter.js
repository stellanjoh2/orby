import * as THREE from 'three';
import { GLTFExporter } from 'https://cdn.jsdelivr.net/npm/three@0.167.0/examples/jsm/exporters/GLTFExporter.js';
import { isVoxelCreativeLookPreset } from '../render/CreativeLookMaterials.js';
import { downloadBlob } from '../utils/downloadBlob.js';

const sanitizeBaseName = (name) => {
  const raw = String(name || 'model')
    .replace(/\.[^/.]+$/, '')
    .trim();
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'model';
};

const findFontExtrudeSourceText = (modelRoot) => {
  if (!modelRoot) return '';
  const direct = modelRoot.userData?.orbyFontSourceText;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  let found = '';
  modelRoot.traverse((node) => {
    if (found) return;
    const raw = node.userData?.orbyFontSourceText;
    if (typeof raw === 'string' && raw.trim()) found = raw.trim();
  });
  return found;
};

const buildExportBaseName = (sourceName, modelRoot) => {
  const fontText = findFontExtrudeSourceText(modelRoot);
  if (!fontText) return sanitizeBaseName(sourceName);

  const fontPart = sanitizeBaseName(sourceName || 'Text');
  const textPart = sanitizeBaseName(fontText);
  if (!textPart || textPart === fontPart) return fontPart;
  return `${fontPart}-${textPart}`;
};

const forceOpaqueMaterialForExport = (material) => {
  if (!material) return;
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthWrite = true;
  material.depthTest = true;
  material.needsUpdate = true;
};

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} origMat
 */
const resolveDiffuseFromImportMaterial = (origMat) => {
  const mat = Array.isArray(origMat) ? origMat[0] : origMat;
  if (!mat) {
    return { map: null, color: new THREE.Color(0xffffff) };
  }

  const map = mat.map?.isTexture ? mat.map : null;
  const color = mat.color?.isColor ? mat.color.clone() : new THREE.Color(0xffffff);
  if (map && color.r < 0.04 && color.g < 0.04 && color.b < 0.04) {
    color.setRGB(1, 1, 1);
  }
  return { map, color };
};

/**
 * @param {THREE.Material | THREE.Material[] | null | undefined} origMat
 * @param {'voxel' | 'retro'} family
 */
const createShaderLabExportMaterial = (origMat, family) => {
  const source = Array.isArray(origMat) ? origMat[0] : origMat;
  const side = source?.side ?? THREE.FrontSide;

  if (family === 'voxel') {
    return new THREE.MeshStandardMaterial({
      name: source?.name ? `${source.name}-voxel` : 'voxel',
      vertexColors: true,
      metalness: 0,
      roughness: 0.85,
      side,
    });
  }

  const { map, color } = resolveDiffuseFromImportMaterial(origMat);
  return new THREE.MeshStandardMaterial({
    name: source?.name ? `${source.name}-decimated` : 'decimated',
    map,
    color,
    metalness: 0,
    roughness: 0.92,
    flatShading: true,
    side,
  });
};

const prepareShaderLabExportGeometry = (geometry, family) => {
  const geo = geometry?.clone?.();
  if (!geo) return null;

  if (family === 'voxel') {
    if (!geo.attributes?.color?.count) return null;
  }

  if (!geo.attributes?.normal) {
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  return geo;
};

/** Preserve import-time creased/bevel/cap normals — only fill in if missing. */
const prepareSvgExportGeometry = (geometry) => {
  const geo = geometry?.clone?.();
  if (!geo) return null;

  if (!geo.attributes?.normal) {
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  return geo;
};

const cloneSvgExportNode = (object3d) => {
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
    const prepared = prepareSvgExportGeometry(sourceMesh.geometry);
    if (!prepared) continue;
    clonedMesh.geometry = prepared;
    if (Array.isArray(sourceMesh.material)) {
      clonedMesh.material = sourceMesh.material.map((mat) => mat?.clone?.() ?? mat);
    } else {
      clonedMesh.material = sourceMesh.material?.clone?.() ?? sourceMesh.material;
    }

    if (sourceMesh.userData?.orbySvgExtrude) {
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

/**
 * @param {THREE.Object3D} object3d
 * @param {import('./resolveGlbExportKind.js').ShaderLabGlbExportKind} exportKind
 * @param {(mesh: THREE.Mesh) => THREE.Material | THREE.Material[] | undefined} getOriginalMaterial
 */
const cloneShaderLabExportNode = (object3d, exportKind, getOriginalMaterial) => {
  const clone = object3d.clone(true);
  const isVoxel = isVoxelCreativeLookPreset(exportKind.preset);

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

    if (sourceMesh.userData?.isWireframeOverlay) {
      clonedMesh.visible = false;
      continue;
    }

    if (isVoxel) {
      if (
        !sourceMesh.visible
        || !sourceMesh.userData?.orbyVoxelPreparedGeometry
        || !sourceMesh.geometry?.attributes?.color?.count
      ) {
        clonedMesh.visible = false;
        continue;
      }
    } else if (!getOriginalMaterial?.(sourceMesh)) {
      clonedMesh.visible = false;
      continue;
    }

    const prepared = prepareShaderLabExportGeometry(sourceMesh.geometry, exportKind.family);
    if (!prepared) {
      clonedMesh.visible = false;
      continue;
    }

    clonedMesh.geometry = prepared;
    clonedMesh.material = createShaderLabExportMaterial(
      getOriginalMaterial?.(sourceMesh),
      exportKind.family,
    );
    forceOpaqueMaterialForExport(
      Array.isArray(clonedMesh.material) ? clonedMesh.material[0] : clonedMesh.material,
    );
  }

  return clone;
};

const downloadBinary = (arrayBuffer, fileName) => {
  downloadBlob(new Blob([arrayBuffer], { type: 'model/gltf-binary' }), fileName);
};

const disposeExportNode = (exportNode) => {
  exportNode.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) {
      node.material.forEach((mat) => mat?.dispose?.());
    } else {
      node.material?.dispose?.();
    }
  });
};

export class ModelGlbExporter {
  constructor() {
    this.exporter = new GLTFExporter();
  }

  /**
   * @param {{
   *   modelRoot: THREE.Object3D,
   *   sourceName?: string,
   *   exportKind: import('./resolveGlbExportKind.js').GlbExportKind,
   *   getOriginalMaterial?: (mesh: THREE.Mesh) => THREE.Material | THREE.Material[] | undefined,
   * }} params
   */
  async export({
    modelRoot,
    sourceName,
    exportKind,
    getOriginalMaterial,
  }) {
    if (!modelRoot) {
      throw new Error('No model root available for GLB export');
    }

    const exportNode = exportKind.mode === 'svg'
      ? cloneSvgExportNode(modelRoot)
      : cloneShaderLabExportNode(modelRoot, exportKind, getOriginalMaterial);

    const baseName = buildExportBaseName(sourceName, modelRoot);
    const fileName = exportKind.mode === 'svg'
      ? `${baseName}.glb`
      : `${baseName}-${exportKind.preset}.glb`;

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

    if (!(result instanceof ArrayBuffer)) {
      throw new Error('Unexpected GLB export result');
    }

    downloadBinary(result, fileName);
    disposeExportNode(exportNode);
  }
}
