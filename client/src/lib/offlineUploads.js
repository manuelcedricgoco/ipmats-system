/**
 * Gap fix (concept document §10 "Weak internet connection — offline capture and later synchronization").
 *
 * When a 360° photo cannot be sent (no signal on site), it is kept in this browser's IndexedDB together with
 * its form fields and sent automatically as soon as the connection is back (see components/common/OfflineUploads.jsx).
 * The photo stays only on this device until it is uploaded; the server still checks GPS and time when it arrives.
 * Every call is wrapped so that private windows or blocked storage simply turn the queue off.
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

export async function queueUpload({ projectId, projectCode, fields, file }) {
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
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

export async function listUploads() {
  try {
    const rows = await tx('readonly', (s) => s.getAll());
    return (rows || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
 * Send every waiting photo with `send(item)` (returns a promise). Stops at the first network error
 * (still offline); a refusal by the server (e.g. GPS outside the province) marks that photo as failed.
 * @returns {Promise<{ sent: object[], failed: object[], offline: boolean }>}
 */
let flushing = null;
export function flushUploads(send) {
  if (flushing) return flushing;
  flushing = (async () => {
    const out = { sent: [], failed: [], offline: false };
    const items = (await listUploads()).filter((i) => i.status === 'waiting');
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
    flushing = null;
  });
  return flushing;
}

export async function retryUpload(id) {
  const item = (await listUploads()).find((i) => i.id === id);
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
