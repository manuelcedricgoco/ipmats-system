/**
 * A photo chosen during sign-up is kept on this device (IndexedDB) until the
 * person confirms their email, the account is approved and they sign in, then uploaded.
 * Supabase issues no session until email confirmation, so it can't be uploaded earlier.
 */
const DB = 'dpwh360';
const STORE = 'pending-avatars';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? null);
    t.onerror = () => reject(t.error);
  });
}

/** The photo is uploaded only after an administrator approves the account; until then it stays on this device. */
export const shouldUploadPendingPhoto = (profile) => profile?.approval_status === 'approved';

export const savePendingAvatar = (userId, file) => tx('readwrite', (s) => s.put(file, userId)).catch(() => {});
export const takePendingAvatar = (userId) =>
  tx('readonly', (s) => s.get(userId))
    .then(async (file) => {
      if (!file) return null;
      await tx('readwrite', (s) => s.delete(userId));
      return file;
    })
    .catch(() => null);
