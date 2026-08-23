import { arrayBufferToBase64 } from '../utils/binaryAsset.js';
import { fbxMaterialGroupKey } from '../import/fbxMaterialReport.js';

export const FBX_MAP_SLOT_PROPS = {
  albedo: 'map',
  normal: 'normalMap',
  orm: 'aoMap',
  roughness: 'roughnessMap',
  metallic: 'metalnessMap',
  occlusion: 'aoMap',
  displacement: 'displacementMap',
  emissive: 'emissiveMap',
  opacity: 'alphaMap',
};

const TEXTURE_NAME_RE = /\.(png|jpe?g|webp|tga|tiff?|bmp|exr|hdr)$/i;

/**
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function isFbxSidecarTextureName(name) {
  return TEXTURE_NAME_RE.test(String(name || ''));
}

/**
 * @param {import('three').Material | null | undefined} material
 * @param {string} slot
 * @returns {import('three').Texture | null}
 */
export function textureForFbxMapSlot(material, slot) {
  const prop = FBX_MAP_SLOT_PROPS[slot];
  if (!prop || !material) return null;
  const tex = material[prop];
  return tex?.isTexture ? tex : null;
}

/**
 * @param {unknown} bundle
 * @returns {Promise<Array<{ name: string, type: string, path: string, lastModified: number, dataBase64: string }>>}
 */
export async function embedFbxSidecars(bundle) {
  if (!Array.isArray(bundle)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of bundle) {
    const file = entry instanceof File ? entry : entry?.file;
    if (!(file instanceof File)) continue;
    const path = String(entry?.path || file.webkitRelativePath || file.name || '');
    if (!isFbxSidecarTextureName(file.name) && !isFbxSidecarTextureName(path)) continue;
    const key = `${path}::${file.size}::${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const buffer = await file.arrayBuffer();
    out.push({
      name: file.name || 'texture.png',
      type: file.type || '',
      path,
      lastModified: file.lastModified || Date.now(),
      dataBase64: arrayBufferToBase64(buffer),
    });
  }
  return out;
}

/**
 * @param {import('three').Object3D | null | undefined} model
 * @param {Map<import('three').Object3D, import('three').Material | import('three').Material[]> | null | undefined} originalMaterials
 * @returns {Array<{ material: import('three').Material, materialKey: string, slot: string, texture: import('three').Texture, fileName: string }>}
 */
export function collectAppliedFbxMapSlots(model, originalMaterials) {
  if (!model) return [];
  const found = [];
  const seen = new Set();

  const visitMaterial = (material) => {
    if (!material) return;
    const names = material.userData?.orbyFbxSlotFileNames;
    if (!names || typeof names !== 'object') return;
    const materialKey = fbxMaterialGroupKey(material);
    for (const slot of Object.keys(names)) {
      if (!FBX_MAP_SLOT_PROPS[slot]) continue;
      const texture = textureForFbxMapSlot(material, slot);
      if (!texture?.userData?.orbyFbxUserTexture) continue;
      const key = `${materialKey}::${slot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        material,
        materialKey,
        slot,
        texture,
        fileName: String(names[slot] || texture.userData?.orbyFbxFileName || `${slot}.png`),
      });
    }
  };

  model.traverse((child) => {
    if (!child.isMesh) return;
    const orig = originalMaterials?.get?.(child);
    const list = orig
      ? (Array.isArray(orig) ? orig : [orig])
      : (Array.isArray(child.material) ? child.material : [child.material]);
    for (const material of list) visitMaterial(material);
  });

  return found;
}

/**
 * @param {CanvasImageSource | ImageBitmap | HTMLImageElement | HTMLCanvasElement | ImageData | null | undefined} image
 * @returns {Promise<ArrayBuffer | null>}
 */
async function encodeImageSourceToPng(image) {
  if (!image) return null;
  const width = Number(image.width || image.videoWidth || 0);
  const height = Number(image.height || image.videoHeight || 0);
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (image instanceof ImageData) {
    ctx.putImageData(image, 0, 0);
  } else {
    ctx.drawImage(image, 0, 0, width, height);
  }
  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/png');
  });
  return blob ? blob.arrayBuffer() : null;
}

/**
 * @param {import('three').Texture} texture
 * @param {string} fileName
 * @returns {Promise<{ name: string, type: string, dataBase64: string } | null>}
 */
export async function embedFbxTextureAsset(texture, fileName) {
  const name = fileName || 'texture.png';
  const blobUrl = texture?.userData?.orbyFbxBlobUrl;
  if (blobUrl) {
    try {
      const response = await fetch(blobUrl);
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return {
          name,
          type: response.headers.get('content-type') || texture.type || 'image/png',
          dataBase64: arrayBufferToBase64(buffer),
        };
      }
    } catch {
      /* fall through to canvas encode */
    }
  }

  const buffer = await encodeImageSourceToPng(texture?.image);
  if (!buffer) return null;
  const base = String(name).replace(/\.[^/.]+$/, '');
  return {
    name: `${base}.png`,
    type: 'image/png',
    dataBase64: arrayBufferToBase64(buffer),
  };
}

/**
 * @param {import('three').Object3D | null | undefined} model
 * @param {Map<import('three').Object3D, import('three').Material | import('three').Material[]> | null | undefined} originalMaterials
 * @returns {Promise<Array<{ materialKey: string, slot: string, name: string, type: string, dataBase64: string }>>}
 */
export async function embedFbxMapAssignments(model, originalMaterials) {
  const slots = collectAppliedFbxMapSlots(model, originalMaterials);
  const out = [];
  for (const item of slots) {
    const asset = await embedFbxTextureAsset(item.texture, item.fileName);
    if (!asset?.dataBase64) continue;
    out.push({
      materialKey: item.materialKey,
      slot: item.slot,
      name: asset.name,
      type: asset.type,
      dataBase64: asset.dataBase64,
    });
  }
  return out;
}
