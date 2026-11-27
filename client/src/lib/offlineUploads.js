/**
 * Gap fix (concept document §10 "Weak internet connection — offline capture and later synchronization").
 *
 * When a 360° photo cannot be sent (no signal on site), it is kept in this browser's IndexedDB together with
 * its form fields and sent automatically as soon as the connection is back (see components/common/OfflineUploads.jsx).
 * The photo stays only on this device until it is uploaded; the server still checks GPS and time when it arrives.
 * Every call is wrapped so that private windows or blocked storage simply turn the queue off.
 * Each photo keeps the id of the account that queued it (`ownerId`): only that account lists, sends or retries it, so
 * a photo is never uploaded under another account signed in later on the same browser. Other accounts' photos are
 * left as they are. Photos queued before owners were recorded have none and are never sent.
 */
const DB_NAME = 'ipmats-offline';
const STORE = 'uploads';
const EVENT = 'ipmats-offline-queue';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('This browser cannot store photos offline.'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Offline storage is not available.'));
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result?.result ?? result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Offline storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}

const changed = () => {
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
};

/** True when an API error means "could not reach the server" (try again later), not "the server refused it". */
export const isNetworkError = (err) => err && (err.status === 0 || err.status === 502 || err.status === 504);

/** The photos queued by `userId`, oldest first. None without a signed-in account, and never one without an owner. */
export function ownUploads(items, userId) {
  if (!userId) return [];
  return (items || []).filter((i) => i.ownerId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function queueUpload({ projectId, projectCode, fields, file, ownerId }) {
  if (!ownerId) throw new Error('Sign in again to keep photos offline.');
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    ownerId,
    projectId,
    projectCode,
    fields,
    file,
    fileName: file?.name || 'panorama.jpg',
    createdAt: new Date().toISOString(),
    status: 'waiting', // waiting | failed
    error: null,
  };
  await tx('readwrite', (s) => s.put(item));
  changed();
  return item;
}

/** The photos waiting on this device for `userId` (see ownUploads). */
export async function listUploads(userId) {
  try {
    return ownUploads(await tx('readonly', (s) => s.getAll()), userId);
  } catch {
    return [];
  }
}

export async function removeUpload(id) {
  await tx('readwrite', (s) => s.delete(id));
  changed();
}

async function update(item) {
  await tx('readwrite', (s) => s.put(item));
  changed();
}

/**
 * Send every waiting photo of `userId` with `send(item)` (returns a promise). Stops at the first network error
 * (still offline); a refusal by the server (e.g. GPS outside the province) marks that photo as failed.
 * @returns {Promise<{ sent: object[], failed: object[], offline: boolean }>}
 */
let flushing = null;
let flushingFor = null;
export function flushUploads(send, userId) {
  if (flushing && flushingFor === userId) return flushing;
  flushingFor = userId;
  flushing = (async () => {
    const out = { sent: [], failed: [], offline: false };
    const items = (await listUploads(userId)).filter((i) => i.status === 'waiting');
    for (const item of items) {
      try {
        const result = await send(item);
        await removeUpload(item.id);
        out.sent.push({ ...item, result });
      } catch (err) {
        if (isNetworkError(err)) {
          out.offline = true;
          break;
        }
        await update({ ...item, status: 'failed', error: err?.message || 'Upload refused' });
        out.failed.push(item);
      }
    }
    return out;
  })().finally(() => {
    if (flushingFor === userId) {
      flushing = null;
      flushingFor = null;
    }
  });
  return flushing;
}

export async function retryUpload(id, userId) {
  const item = (await listUploads(userId)).find((i) => i.id === id);
  if (item) await update({ ...item, status: 'waiting', error: null });
}

export function onQueueChange(cb) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Build the multipart body the upload API expects. */
export function toFormData(item) {
  const fd = new FormData();
  fd.append('file', item.file, item.fileName);
  Object.entries(item.fields || {}).forEach(([k, v]) => v !== '' && v !== undefined && v !== null && fd.append(k, String(v)));
  return fd;
}
