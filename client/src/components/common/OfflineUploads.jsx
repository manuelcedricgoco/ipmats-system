import { CloudOff, CloudUpload, RotateCcw, Trash2, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { flushUploads, listUploads, onQueueChange, removeUpload, retryUpload, toFormData } from '../../lib/offlineUploads.js';
import { dateTime } from '../../lib/format.js';
import Button from './Button.jsx';
import Modal from './Modal.jsx';

/**
 * Gap fix — offline capture: shows how many 360° photos are waiting on this device and sends them
 * automatically when the connection comes back (and every minute while there is a connection).
 * Only the signed-in account's own photos are listed and sent (lib/offlineUploads.js ownUploads).
 */
export default function OfflineUploads() {
  const toast = useToast();
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  // The account signed in right now: a send that started for another account stops instead of using this one's sign-in.
  const userRef = useRef(userId);
  useEffect(() => {
    userRef.current = userId;
    return () => {
      userRef.current = null;
    };
  }, [userId]);
  const [items, setItems] = useState([]);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setItems(await listUploads(userId)), [userId]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    try {
      const r = await flushUploads((item) => {
        // status 0 = "try again later": the photo stays queued, untouched.
        if (!userId || item.ownerId !== userRef.current) return Promise.reject(Object.assign(new Error('Signed out'), { status: 0 }));
        return api.post(`/projects/${item.projectId}/images`, toFormData(item));
      }, userId);
      if (r.sent.length) toast.success(`${r.sent.length} offline 360° photo(s) uploaded (${[...new Set(r.sent.map((i) => i.projectCode))].join(', ')}).`);
      if (r.failed.length) toast.error(`${r.failed.length} offline photo(s) were refused by the server. Open "Waiting uploads" to see why.`);
    } finally {
      setBusy(false);
      refresh();
    }
  }, [refresh, toast, userId]);

  useEffect(() => {
    refresh();
    sync();
    const goOnline = () => {
      setOnline(true);
      sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const off = onQueueChange(refresh);
    const timer = setInterval(() => navigator.onLine && sync(), 60_000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      off();
      clearInterval(timer);
    };
  }, [refresh, sync]);

  if (!items.length && online) return null;
  const failed = items.filter((i) => i.status === 'failed').length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          failed ? 'bg-red-50 text-red-800 hover:bg-red-100' : online ? 'bg-amber-50 text-amber-800 hover:bg-amber-100' : 'bg-slate-800 text-white'
        }`}
        aria-label={`${items.length} photo(s) waiting to upload${online ? '' : ', you are offline'}`}
      >
        {online ? <CloudUpload className={`h-4 w-4 ${busy ? 'animate-pulse' : ''}`} aria-hidden /> : <WifiOff className="h-4 w-4" aria-hidden />}
        <span className="hidden sm:inline">{online ? `${items.length} waiting upload(s)` : `Offline${items.length ? ` · ${items.length} waiting` : ''}`}</span>
        <span className="sm:hidden">{items.length || '!'}</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Photos waiting to upload"
        description="Saved on this device while there was no connection. They are sent automatically when you are back online."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>
            <Button icon={CloudUpload} loading={busy} disabled={!online || !items.some((i) => i.status === 'waiting')} onClick={sync}>Upload now</Button>
          </>
        }
      >
        {!online && <p className="mb-3 flex items-center gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700"><CloudOff className="h-4 w-4" /> You are offline. Keep this page open; uploads start when the connection returns.</p>}
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing is waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{i.projectCode} · {i.fileName}</p>
                  <p className="text-xs text-slate-500">Inspection {i.fields?.inspection_date} · saved {dateTime(i.createdAt)}</p>
                  {i.status === 'failed' && <p className="mt-1 text-xs font-medium text-red-700">Refused: {i.error}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {i.status === 'failed' && (
                    <button type="button" onClick={() => retryUpload(i.id, userId)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-700" aria-label="Try again">
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.confirm('Remove this photo from the waiting list? It is deleted from this device.') && removeUpload(i.id)}
                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    aria-label="Discard"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
