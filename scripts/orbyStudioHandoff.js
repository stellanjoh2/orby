/**
 * Stages a picked file on a static marketing subpage, then opens the studio home.
 * IndexedDB bridges the navigation — files never leave the device.
 */

const DB_NAME = 'orby-studio-handoff';
const DB_VERSION = 1;
const STORE = 'pending';
const RECORD_KEY = 'model';

export const ORBY_STUDIO_HANDOFF_QUERY = 'studioHandoff';

/** Same accept list as `#fileInput` on the studio home dropzone. */
export const ORBY_STUDIO_FILE_ACCEPT =
  '.glb,.gltf,.obj,.fbx,.stl,.usd,.usda,.usdc,.usdz,.svg,.bvh,.orby';

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

/**
 * @param {File} file
 * @returns {Promise<void>}
 */
export async function stageStudioFileHandoff(file) {
  if (!(file instanceof File)) {
    throw new Error('No file to hand off');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength) {
    throw new Error('Could not read file — try again');
  }
  const record = {
    name: file.name,
    type: file.type || 'application/octet-stream',
    bytes,
    size: file.size,
    stagedAt: Date.now(),
  };
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
  });
  db.close();
}

/** @returns {Promise<File | null>} */
export async function takeStudioFileHandoff() {
  try {
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(RECORD_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
    db.close();

    if (!record?.name) return null;
    let buffer = null;
    if (record.bytes instanceof Uint8Array && record.bytes.byteLength > 0) {
      const copy = record.bytes.slice();
      buffer = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    } else if (record.buffer instanceof ArrayBuffer && record.buffer.byteLength > 0) {
      buffer = record.buffer.slice(0);
    }
    if (!buffer?.byteLength) return null;
    return new File([buffer], record.name, {
      type: record.type || 'application/octet-stream',
    });
  } catch (err) {
    console.error('[Orby] Studio handoff read failed', err);
    return null;
  }
}
