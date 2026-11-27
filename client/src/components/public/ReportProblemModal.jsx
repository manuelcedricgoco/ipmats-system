import { Check, Copy, ImagePlus, Megaphone, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import {
  REPORT_CATEGORY_LABELS,
  REPORT_DESCRIPTION_MAX,
  REPORT_DESCRIPTION_MIN,
  REPORT_PROOF_MAX_FILES,
  REPORT_PROOF_TYPES,
  checkProofFile,
} from '../../lib/pacc.js';
import Button from '../common/Button.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Select, Textarea } from '../common/Form.jsx';
import Modal from '../common/Modal.jsx';

/**
 * PUBLIC PORTAL — "Magsumbong / Report a problem" on one project. Anonymous: the request carries no sign-in
 * token (`anonymous: true`), nothing about the report is kept in the browser, and the tracking code exists only
 * in this component's state, so closing the dialog discards it. The server re-checks everything and strips the
 * photos' metadata; its message is what an error shows.
 * Render it only while open (the parent unmounts it on close), so every visit starts empty.
 */
let nextId = 0;

export default function ReportProblemModal({ project, onClose }) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]); // { id, file, url }
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const [code, setCode] = useState(null);
  const fileInput = useRef(null);
  const errBox = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const sendingRef = useRef(false);
  sendingRef.current = sending;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Previews are object URLs: release them when the dialog goes away.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  // The Send button is below the form; bring a new error into view (on phones the alert is off-screen).
  useEffect(() => {
    if (err) errBox.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [err]);

  const length = description.trim().length;

  const addPhotos = (e) => {
    const chosen = [...(e.target.files || [])];
    e.target.value = ''; // the same photo can be chosen again after removing it
    if (!chosen.length) return;
    const bad = chosen.map(checkProofFile).find(Boolean);
    if (bad) return setErr({ message: bad });
    if (photos.length + chosen.length > REPORT_PROOF_MAX_FILES) return setErr({ message: `Attach up to ${REPORT_PROOF_MAX_FILES} photos.` });
    setErr(null);
    const added = chosen.map((file) => ({ id: (nextId += 1), file, url: URL.createObjectURL(file) }));
    setPhotos((list) => [...list, ...added]);
  };

  const removePhoto = (id) => {
    const gone = photos.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setPhotos((list) => list.filter((p) => p.id !== id));
  };

  const localProblem = () => {
    if (!category) return 'Choose what kind of problem this is.';
    if (length < REPORT_DESCRIPTION_MIN) return `Describe the problem in at least ${REPORT_DESCRIPTION_MIN} characters.`;
    if (length > REPORT_DESCRIPTION_MAX) return `Keep the description to ${REPORT_DESCRIPTION_MAX} characters or fewer.`;
    if (!photos.length) return 'Attach at least one photo as proof.';
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = localProblem();
    if (problem) return setErr({ message: problem });
    const body = new FormData();
    body.append('category', category);
    body.append('description', description.trim());
    photos.forEach((p) => body.append('proof', p.file));
    setSending(true);
    setErr(null);
    try {
      const res = await api.post(`/public/projects/${project.id}/reports`, body, { anonymous: true });
      setCode(res.data.tracking_code);
    } catch (e2) {
      setErr(e2);
    } finally {
      setSending(false);
    }
  };

  // Stable (Modal re-focuses its first field whenever onClose changes). While sending, the dialog stays open
  // so the tracking code is not lost.
  const close = useCallback(() => !sendingRef.current && onCloseRef.current(), []);
  const subtitle = project ? `${project.project_code} · ${project.name}` : undefined;

  if (code) {
    return (
      <Modal key="sent" open onClose={close} title="Report sent" description={subtitle} footer={<Button onClick={close}>Done</Button>}>
        <TrackingCode code={code} />
      </Modal>
    );
  }

  return (
    <Modal
      key="form"
      open
      onClose={close}
      size="lg"
      title="Magsumbong / Report a problem"
      description={subtitle}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={sending}>Cancel</Button>
          <Button type="submit" form="report-problem-form" icon={Megaphone} loading={sending}>Send report</Button>
        </>
      }
    >
      <form id="report-problem-form" onSubmit={submit} className="space-y-4" noValidate>
        <Alert tone="info" title="Anonymous">
          <p>No name, account or location is saved. Photo details such as GPS are removed.</p>
          <p className="mt-1">Your report goes only to PACC and is never shown on the public portal. False reports may be dismissed.</p>
        </Alert>

        {err && (
          <div ref={errBox}>
            <Alert tone="error">{err.details?.length ? err.details.map((d) => d.message).join(' ') : err.message}</Alert>
          </div>
        )}

        <Field label="What is the problem?" required>
          {(a) => (
            <Select {...a} value={category} onChange={(e) => setCategory(e.target.value)} required>
              <option value="">Choose one</option>
              {Object.entries(REPORT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Describe what you saw"
          required
          hint={`At least ${REPORT_DESCRIPTION_MIN} characters (${length}/${REPORT_DESCRIPTION_MAX}). Do not write your name or contact details.`}
        >
          {(a) => <Textarea {...a} value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={REPORT_DESCRIPTION_MAX} required />}
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">
            Proof photos<span className="ml-0.5 text-red-600" aria-hidden>*</span>
          </legend>
          <p className="mb-2 text-xs text-slate-500">1 to {REPORT_PROOF_MAX_FILES} photos: JPEG, PNG or WebP, up to 10 MB each.</p>
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                <img src={p.url} alt={`Proof photo ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  disabled={sending}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-slate-700 shadow hover:bg-white hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                  aria-label={`Remove proof photo ${i + 1}`}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {photos.length < REPORT_PROOF_MAX_FILES && (
              <li>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={sending}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-medium text-slate-600 transition-colors hover:border-brand-500 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  <ImagePlus className="h-5 w-5" aria-hidden />
                  Add photo
                </button>
              </li>
            )}
          </ul>
          <input ref={fileInput} type="file" accept={REPORT_PROOF_TYPES.join(',')} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={addPhotos} />
        </fieldset>
      </form>
    </Modal>
  );
}

/** The tracking code, shown once. Copy uses the clipboard when the browser allows it; otherwise the code is selected for a manual copy. */
function TrackingCode({ code }) {
  const [copied, setCopied] = useState(null); // null | 'done' | 'manual'
  const box = useRef(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied('done');
    } catch {
      box.current?.focus();
      box.current?.select();
      setCopied('manual');
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Thank you. PACC will look into it. Use this tracking code to check the status of your report:</p>
      <div className="flex items-center gap-2">
        <input
          ref={box}
          readOnly
          value={code}
          onFocus={(e) => e.target.select()}
          aria-label="Tracking code"
          className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2.5 text-center font-mono text-xl font-bold tracking-widest text-slate-900 ring-1 ring-inset ring-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <Button variant="secondary" icon={copied === 'done' ? Check : Copy} onClick={copy}>
          {copied === 'done' ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {copied === 'manual' && <p className="text-xs text-slate-600">Copying is not available here. The code is selected: copy it or write it down.</p>}
      <Alert tone="warning">Save this code; it is shown only once.</Alert>
      <p className="text-sm text-slate-600">
        Check it any time on the{' '}
        <Link to="/report-status" className="font-semibold text-brand-700 underline underline-offset-2">Check a report</Link> page.
      </p>
    </div>
  );
}
