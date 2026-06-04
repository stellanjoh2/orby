/**
 * Texture map slots for the Object → Maps inspector.
 * Only slots with an assigned texture on the loaded mesh appear in the UI.
 */

/** @typedef {'baseColor' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'emissive' | 'opacity' | 'displacement' | 'bump'} MapInspectSlotId */

/** @typedef {'r' | 'g' | 'b'} OrmChannel */

/**
 * @typedef {Object} MapInspectEntry
 * @property {MapInspectSlotId} id
 * @property {string} label
 * @property {string} prop
 * @property {import('three').Texture} texture
 * @property {OrmChannel | null} [channel] Preview one ORM channel (R=AO, G=roughness, B=metallic).
 * @property {number} [variantCount] Distinct textures for this slot across all materials.
 * @property {number} [materialCount] Materials that assign this map.
 */

export const MAP_TEXTURE_SLOT_DEFS = [
  { id: 'baseColor', label: 'Base Color', prop: 'map' },
  { id: 'normal', label: 'Normal', prop: 'normalMap' },
  { id: 'roughness', label: 'Roughness', prop: 'roughnessMap' },
  { id: 'metallic', label: 'Metallic', prop: 'metalnessMap' },
  { id: 'ao', label: 'AO', prop: 'aoMap' },
  { id: 'emissive', label: 'Emissive', prop: 'emissiveMap' },
  { id: 'opacity', label: 'Opacity', prop: 'alphaMap' },
  { id: 'displacement', label: 'Displacement', prop: 'displacementMap' },
  { id: 'bump', label: 'Bump', prop: 'bumpMap' },
];

const PREVIEW_PROP_BY_ID = Object.fromEntries(
  MAP_TEXTURE_SLOT_DEFS.map((def) => [def.id, def.prop]),
);

const ORM_CHANNEL_BY_SLOT = {
  ao: 'r',
  roughness: 'g',
  metallic: 'b',
};

/** @type {Map<string, string>} `${uuid}:${size}:${channelKey}` → data URL */
const thumbCache = new Map();

/**
 * @param {import('three').Texture | null | undefined} texture
 */
export function textureImageReady(texture) {
  const img = texture?.image;
  if (!img) return false;
  if (img instanceof HTMLVideoElement) return img.readyState >= 2;
  if (typeof img.width === 'number' && img.width > 0) return true;
  if (typeof img.videoWidth === 'number' && img.videoWidth > 0) return true;
  if (img.complete && img.naturalWidth > 0) return true;
  return false;
}

/**
 * @param {import('three').Material | null | undefined} mat
 * @param {MapInspectSlotId} slotId
 * @returns {OrmChannel | null}
 */
export function getOrmChannelForMaterialSlot(mat, slotId) {
  if (!mat || !ORM_CHANNEL_BY_SLOT[slotId]) return null;
  const prop = PREVIEW_PROP_BY_ID[slotId];
  const tex = mat[prop];
  if (!tex?.isTexture) return null;

  const ao = mat.aoMap;
  const rough = mat.roughnessMap;
  const metal = mat.metalnessMap;
  if (!ao || !rough || !metal) return null;
  if (ao.uuid !== rough.uuid || rough.uuid !== metal.uuid) return null;

  return ORM_CHANNEL_BY_SLOT[slotId];
}

/**
 * @param {import('three').Object3D | null | undefined} model
 * @param {(mesh: import('three').Mesh) => boolean} [isGlassMesh]
 * @param {WeakMap<import('three').Mesh, import('three').Material | import('three').Material[]>} [originalMaterials]
 * @returns {MapInspectEntry[]}
 */
export function collectMeshTextureMaps(model, isGlassMesh, originalMaterials) {
  /** @type {Map<MapInspectSlotId, { texture: import('three').Texture, uuids: Set<string>, materialCount: number, channel: OrmChannel | null }>} */
  const slots = new Map();
  if (!model) return [];

  model.traverse((child) => {
    if (!child.isMesh || isGlassMesh?.(child)) return;

    /** @type {import('three').Material[]} */
    let materials = [];
    const stored = originalMaterials?.get(child);
    if (stored) {
      materials = Array.isArray(stored) ? stored : [stored];
    } else {
      materials = Array.isArray(child.material) ? child.material : [child.material];
    }

    for (const mat of materials) {
      if (!mat) continue;
      for (const def of MAP_TEXTURE_SLOT_DEFS) {
        const tex = mat[def.prop];
        if (!tex?.isTexture) continue;

        const channel = getOrmChannelForMaterialSlot(mat, def.id);
        const existing = slots.get(def.id);
        if (!existing) {
          slots.set(def.id, {
            texture: tex,
            uuids: new Set([tex.uuid]),
            materialCount: 1,
            channel,
          });
          continue;
        }

        existing.uuids.add(tex.uuid);
        existing.materialCount += 1;
        if (!existing.channel && channel) existing.channel = channel;
      }
    }
  });

  return MAP_TEXTURE_SLOT_DEFS.filter((def) => slots.has(def.id)).map((def) => {
    const data = slots.get(def.id);
    return {
      id: def.id,
      label: def.label,
      prop: def.prop,
      texture: data.texture,
      channel: data.channel,
      variantCount: data.uuids.size,
      materialCount: data.materialCount,
    };
  });
}

/**
 * @param {MapInspectEntry} entry
 * @returns {string}
 */
export function mapInspectEntryTooltip(entry) {
  const parts = [entry.label];
  if (entry.channel) {
    const channelName =
      entry.channel === 'r' ? 'AO (red)' : entry.channel === 'g' ? 'Roughness (green)' : 'Metallic (blue)';
    parts.push(`ORM — ${channelName} channel`);
  }
  if ((entry.variantCount ?? 1) > 1) {
    parts.push(`${entry.variantCount} unique maps across materials`);
  } else if ((entry.materialCount ?? 1) > 1) {
    parts.push(`Shared on ${entry.materialCount} materials`);
  }
  return parts.join(' — ');
}

/**
 * @param {MapInspectSlotId | string} slotId
 * @returns {string | null}
 */
export function mapInspectPreviewProp(slotId) {
  return PREVIEW_PROP_BY_ID[slotId] ?? null;
}

export function clearMapInspectThumbCache() {
  thumbCache.clear();
}

/**
 * @param {import('three').Texture} texture
 * @param {number} size
 * @param {OrmChannel | null | undefined} channel
 */
function cacheKey(texture, size, channel) {
  return `${texture.uuid}:${size}:${channel ?? 'rgb'}`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {CanvasImageSource} img
 * @param {number} width
 * @param {number} height
 * @param {OrmChannel | null | undefined} channel
 */
function drawTextureToContext(ctx, img, width, height, channel) {
  if (!channel) {
    ctx.drawImage(img, 0, 0, width, height);
    return;
  }

  const chIndex = channel === 'r' ? 0 : channel === 'g' ? 1 : 2;
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const sctx = scratch.getContext('2d');
  if (!sctx) {
    ctx.drawImage(img, 0, 0, width, height);
    return;
  }

  sctx.drawImage(img, 0, 0, width, height);
  const imageData = sctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i + chIndex];
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * @param {import('three').Texture | null | undefined} texture
 * @param {number} [size]
 * @param {OrmChannel | null | undefined} [channel]
 * @returns {string | null} data URL
 */
export function textureToDataUrl(texture, size = 128, channel = null) {
  const img = texture?.image;
  if (!img || !Number.isFinite(size) || size <= 0 || !textureImageReady(texture)) return null;

  const key = cacheKey(texture, size, channel);
  const cached = thumbCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    drawTextureToContext(ctx, img, size, size, channel);
    const url = canvas.toDataURL('image/png');
    thumbCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Preview URL for the map modal — prefers the live image source when safe.
 * @param {MapInspectEntry} entry
 * @returns {string | null}
 */
export function textureToPreviewUrl(entry) {
  const { texture, channel } = entry;
  if (!texture) return null;

  if (!channel) {
    const img = texture.image;
    if (img instanceof HTMLImageElement && img.src && textureImageReady(texture)) {
      return img.src;
    }
  }

  const img = texture.image;
  if (!textureImageReady(texture) || !img) return null;

  const w = img.width ?? img.videoWidth ?? 0;
  const h = img.height ?? img.videoHeight ?? 0;
  if (!w || !h) return null;

  const maxDim = 2048;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));

  const key = cacheKey(texture, Math.max(tw, th), channel);
  const cached = thumbCache.get(`${key}:${tw}x${th}`);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try {
    drawTextureToContext(ctx, img, tw, th, channel);
    const url = canvas.toDataURL('image/png');
    thumbCache.set(`${key}:${tw}x${th}`, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Subscribe to Three.js texture `update` events for maps not yet image-ready.
 * @param {MapInspectEntry[]} maps
 * @param {() => void} onReady
 * @returns {() => void} dispose
 */
export function watchPendingMapTextures(maps, onReady) {
  /** @type {Map<string, () => void>} */
  const handlers = new Map();
  let debounceId = 0;

  const schedule = () => {
    if (debounceId) cancelAnimationFrame(debounceId);
    debounceId = requestAnimationFrame(() => {
      debounceId = 0;
      onReady();
    });
  };

  for (const entry of maps) {
    const tex = entry.texture;
    if (!tex || textureImageReady(tex) || handlers.has(tex.uuid)) continue;

    const onUpdate = () => {
      if (!textureImageReady(tex)) return;
      tex.removeEventListener('update', onUpdate);
      handlers.delete(tex.uuid);
      clearMapInspectThumbCache();
      schedule();
    };

    tex.addEventListener('update', onUpdate);
    handlers.set(tex.uuid, onUpdate);
  }

  return () => {
    if (debounceId) cancelAnimationFrame(debounceId);
    handlers.forEach((handler, uuid) => {
      const tex = maps.find((m) => m.texture?.uuid === uuid)?.texture;
      tex?.removeEventListener('update', handler);
    });
    handlers.clear();
  };
}
