/**
 * Texture map slots for the Object → Maps inspector.
 * Only slots with an assigned texture on the loaded mesh appear in the UI.
 */

/** @typedef {'baseColor' | 'normal' | 'roughness' | 'metallic' | 'ao' | 'emissive' | 'opacity' | 'displacement' | 'bump'} MapInspectSlotId */

/** @typedef {'r' | 'g' | 'b'} OrmChannel */

/** @typedef {'orm' | 'mr' | 'or' | 'ao-metal'} OrmPackType */

/**
 * @typedef {Object} MapInspectPackedSlot
 * @property {MapInspectSlotId} id
 * @property {string} label
 * @property {string} prop
 * @property {OrmChannel} channel
 */

/**
 * @typedef {Object} MapInspectEntry
 * @property {string} id
 * @property {string} label
 * @property {string} prop
 * @property {import('three').Texture} texture
 * @property {OrmChannel | null} [channel] Preview one ORM channel (R=AO, G=roughness, B=metallic).
 * @property {number} [variantCount] Distinct textures for this slot across all materials.
 * @property {number} [materialCount] Materials that assign this map.
 * @property {boolean} [packed] Multiple ORM slots share this texture — one grid tile.
 * @property {OrmPackType} [packType]
 * @property {MapInspectPackedSlot[]} [packedSlots]
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

const ORM_SLOT_IDS = ['ao', 'roughness', 'metallic'];

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
 * @param {import('three').Texture | null | undefined} a
 * @param {import('three').Texture | null | undefined} b
 */
function sameTexture(a, b) {
  return !!a?.isTexture && !!b?.isTexture && a.uuid === b.uuid;
}

/**
 * Detect glTF-style channel packing on a material (full ORM or partial MR/OR).
 * @param {import('three').Material | null | undefined} mat
 * @returns {{ texture: import('three').Texture, packType: OrmPackType, slots: MapInspectPackedSlot[] } | null}
 */
export function getOrmPackForMaterial(mat) {
  if (!mat) return null;

  const ao = mat.aoMap;
  const rough = mat.roughnessMap;
  const metal = mat.metalnessMap;

  if (sameTexture(ao, rough) && sameTexture(rough, metal)) {
    return {
      texture: ao,
      packType: 'orm',
      slots: [
        { id: 'ao', label: 'AO', prop: 'aoMap', channel: 'r' },
        { id: 'roughness', label: 'Roughness', prop: 'roughnessMap', channel: 'g' },
        { id: 'metallic', label: 'Metallic', prop: 'metalnessMap', channel: 'b' },
      ],
    };
  }

  if (sameTexture(rough, metal)) {
    return {
      texture: rough,
      packType: 'mr',
      slots: [
        { id: 'roughness', label: 'Roughness', prop: 'roughnessMap', channel: 'g' },
        { id: 'metallic', label: 'Metallic', prop: 'metalnessMap', channel: 'b' },
      ],
    };
  }

  if (sameTexture(ao, rough)) {
    return {
      texture: ao,
      packType: 'or',
      slots: [
        { id: 'ao', label: 'AO', prop: 'aoMap', channel: 'r' },
        { id: 'roughness', label: 'Roughness', prop: 'roughnessMap', channel: 'g' },
      ],
    };
  }

  if (sameTexture(ao, metal)) {
    return {
      texture: ao,
      packType: 'ao-metal',
      slots: [
        { id: 'ao', label: 'AO', prop: 'aoMap', channel: 'r' },
        { id: 'metallic', label: 'Metallic', prop: 'metalnessMap', channel: 'b' },
      ],
    };
  }

  return null;
}

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

  const pack = getOrmPackForMaterial(mat);
  if (!pack) return null;

  const slot = pack.slots.find((s) => s.id === slotId);
  if (!slot || pack.texture.uuid !== tex.uuid) return null;

  return slot.channel;
}

/**
 * @param {OrmPackType} packType
 * @returns {string}
 */
function ormPackTypeLabel(packType) {
  switch (packType) {
    case 'orm':
      return 'ORM';
    case 'mr':
      return 'MR';
    case 'or':
      return 'OR';
    case 'ao-metal':
      return 'AO / Metallic';
    default:
      return 'Packed';
  }
}

/**
 * @param {OrmChannel} channel
 * @returns {string}
 */
export function ormChannelLabel(channel) {
  if (channel === 'r') return 'AO (red)';
  if (channel === 'g') return 'Roughness (green)';
  return 'Metallic (blue)';
}

/**
 * Collapse ORM-family slots that share one texture into a single grid entry.
 * @param {MapInspectEntry[]} entries
 * @returns {MapInspectEntry[]}
 */
function collapsePackedOrmEntries(entries) {
  /** @type {Map<string, MapInspectEntry[]>} */
  const byTexture = new Map();

  for (const entry of entries) {
    if (!ORM_SLOT_IDS.includes(entry.id)) continue;
    const uuid = entry.texture.uuid;
    if (!byTexture.has(uuid)) byTexture.set(uuid, []);
    byTexture.get(uuid).push(entry);
  }

  /** @type {Set<string>} */
  const removeIds = new Set();
  /** @type {Map<string, MapInspectEntry>} */
  const packedByFirstSlot = new Map();

  for (const group of byTexture.values()) {
    if (group.length < 2) continue;

    const order = ORM_SLOT_IDS;
    group.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    const texture = group[0].texture;
    /** @type {MapInspectPackedSlot[]} */
    const packedSlots = group.map((entry) => ({
      id: entry.id,
      label: entry.label,
      prop: entry.prop,
      channel: entry.channel ?? ORM_CHANNEL_BY_SLOT[entry.id],
    }));

    const packType =
      packedSlots.length === 3
        ? 'orm'
        : packedSlots.some((s) => s.id === 'ao') && packedSlots.some((s) => s.id === 'metallic')
          ? 'ao-metal'
          : packedSlots.some((s) => s.id === 'ao')
            ? 'or'
            : 'mr';

    const packed = {
      id: `packed:${texture.uuid}`,
      label: group.map((e) => e.label).join(' / '),
      prop: group[0].prop,
      texture,
      channel: null,
      packed: true,
      packType,
      packedSlots,
      variantCount: Math.max(...group.map((g) => g.variantCount ?? 1)),
      materialCount: Math.max(...group.map((g) => g.materialCount ?? 1)),
    };

    packedByFirstSlot.set(packedSlots[0].id, packed);
    group.forEach((entry) => removeIds.add(entry.id));
  }

  if (removeIds.size === 0) return entries;

  /** @type {MapInspectEntry[]} */
  const result = [];
  /** @type {Set<string>} */
  const inserted = new Set();

  for (const def of MAP_TEXTURE_SLOT_DEFS) {
    const packed = packedByFirstSlot.get(def.id);
    if (packed && !inserted.has(packed.id)) {
      result.push(packed);
      inserted.add(packed.id);
      continue;
    }
    if (removeIds.has(def.id)) continue;
    const entry = entries.find((e) => e.id === def.id);
    if (entry) result.push(entry);
  }

  return result;
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

  return collapsePackedOrmEntries(
    MAP_TEXTURE_SLOT_DEFS.filter((def) => slots.has(def.id)).map((def) => {
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
    }),
  );
}

/**
 * @param {MapInspectEntry} entry
 * @param {MapInspectSlotId | string} [slotId]
 * @returns {{ texture: import('three').Texture, channel: OrmChannel | null, label: string }}
 */
export function mapInspectPreviewContext(entry, slotId) {
  if (entry.packed && slotId) {
    const sub = entry.packedSlots?.find((s) => s.id === slotId);
    if (sub) {
      return { texture: entry.texture, channel: sub.channel, label: sub.label };
    }
  }
  return {
    texture: entry.texture,
    channel: entry.channel ?? null,
    label: entry.label,
  };
}

/**
 * @param {MapInspectEntry[]} maps
 * @param {string | null | undefined} slotId
 * @returns {MapInspectEntry | null}
 */
export function mapInspectFindEntryForSlot(maps, slotId) {
  if (!slotId) return null;
  for (const entry of maps) {
    if (entry.packed) {
      if (entry.packedSlots?.some((s) => s.id === slotId)) return entry;
    } else if (entry.id === slotId) {
      return entry;
    }
  }
  return null;
}

/**
 * @param {MapInspectEntry} entry
 * @param {string | null | undefined} slotId
 */
export function mapInspectEntryContainsSlot(entry, slotId) {
  if (!slotId) return false;
  if (entry.packed) return entry.packedSlots?.some((s) => s.id === slotId) ?? false;
  return entry.id === slotId;
}

/**
 * Default pin / panel slot for the first grid entry.
 * @param {MapInspectEntry[]} maps
 * @returns {string | null}
 */
export function mapInspectDefaultSlotId(maps) {
  const first = maps[0];
  if (!first) return null;
  if (first.packed) return first.packedSlots?.[0]?.id ?? null;
  return first.id;
}

/**
 * Flat list of panel tab targets (packed entries expand to one tab per channel).
 * @param {MapInspectEntry[]} maps
 * @returns {Array<{ entry: MapInspectEntry, slotId: string, label: string, channel: OrmChannel | null }>}
 */
export function mapInspectPanelTabs(maps) {
  /** @type {Array<{ entry: MapInspectEntry, slotId: string, label: string, channel: OrmChannel | null }>} */
  const tabs = [];
  for (const entry of maps) {
    if (entry.packed && entry.packedSlots?.length) {
      for (const sub of entry.packedSlots) {
        tabs.push({
          entry,
          slotId: sub.id,
          label: sub.label,
          channel: sub.channel,
        });
      }
    } else {
      tabs.push({
        entry,
        slotId: entry.id,
        label: entry.label,
        channel: entry.channel ?? null,
      });
    }
  }
  return tabs;
}

/**
 * @param {MapInspectEntry} entry
 * @returns {string}
 */
export function mapInspectEntryTooltip(entry, slotId) {
  if (entry.packed) {
    const parts = [entry.label, `${ormPackTypeLabel(entry.packType)} packed map`];
    if (slotId) {
      const sub = entry.packedSlots?.find((s) => s.id === slotId);
      if (sub) parts.push(ormChannelLabel(sub.channel));
    } else {
      parts.push('Click to preview — click again to cycle channels');
    }
    if ((entry.variantCount ?? 1) > 1) {
      parts.push(`${entry.variantCount} unique maps across materials`);
    }
    return parts.join(' — ');
  }

  const parts = [entry.label];
  if (entry.channel) {
    parts.push(`ORM — ${ormChannelLabel(entry.channel)} channel`);
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

/**
 * @param {MapInspectSlotId | string | null | undefined} slotId
 * @returns {string | null}
 */
export function mapInspectSlotLabel(slotId) {
  if (!slotId) return null;
  const def = MAP_TEXTURE_SLOT_DEFS.find((d) => d.id === slotId);
  return def?.label ?? null;
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
export function textureToPreviewUrl(entry, slotId) {
  const { texture, channel } = mapInspectPreviewContext(entry, slotId);
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
