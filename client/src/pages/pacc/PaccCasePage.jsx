import { ArrowLeft, CheckCircle2, Download, FileText, Gavel, Image as ImageIcon, MessageSquarePlus, Paperclip, Upload, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pill } from '../../components/common/Badges.jsx';
import ContractorName from '../../components/pacc/ContractorName.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, DetailList, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { Alert, ErrorState, PageLoader, Spinner } from '../../components/common/Feedback.jsx';
import { Field, Input, Textarea } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { date, dateTime } from '../../lib/format.js';
import { CASE_STATUS_META, REPORT_CATEGORY_LABELS, REPORT_OUTCOME_LABELS, REPORT_STATUS_LABELS, isClosedCaseStatus, nextCaseStatuses } from '../../lib/pacc.js';

const REPORT_STATUS_CLS = { received: 'bg-brand-50 text-brand-800', under_review: 'bg-amber-50 text-amber-800', closed: 'bg-slate-100 text-slate-700' };

/** The buttons for each status change, and what the confirmation says. */
const TRANSITIONS = {
  case_filed: {
    button: 'Mark as case filed',
    icon: Gavel,
    variant: 'primary',
    title: 'Mark the case as filed?',
    body: 'The case stays open. If its status is shown on the public portal, the public sees “Case filed”.',
  },
  resolved: { button: 'Close as resolved', icon: CheckCircle2, variant: 'secondary', title: 'Close the case as resolved?', outcome: 'valid' },
  dismissed: { button: 'Dismiss', icon: XCircle, variant: 'danger-outline', title: 'Dismiss the case?', outcome: 'invalid' },
};

const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';
const DOC_MAX_MB = 25;
const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * One PACC case: status and its changes (closing is final), the "show status on the public portal" switch,
 * respondents and charges, attached citizen reports, notes (append-only) and case documents.
 */
export default function PaccCasePage() {
  const { caseId } = useParams();
  const toast = useToast();
  const { data: cs, loading, error, reload } = useApi(`/pacc/cases/${caseId}`, undefined, { select: (r) => r.data });
  const [moving, setMoving] = useState(null); // the status being confirmed
  const [switching, setSwitching] = useState(false);
  const [uploading, setUploading] = useState(false);

  const back = <Button to="/pacc/cases" variant="ghost" size="sm" icon={ArrowLeft} className="mb-4">Back to cases</Button>;
  if (loading && !cs) return <PageLoader label="Loading the case…" />;
  if (error) return <>{back}<ErrorState error={error} onRetry={reload} /></>;

  const closed = isClosedCaseStatus(cs.status);
  const meta = CASE_STATUS_META[cs.status];

  const changeStatus = async () => {
    await api.patch(`/pacc/cases/${cs.id}`, { status: moving });
    toast.success(isClosedCaseStatus(moving) ? `Case closed as ${CASE_STATUS_META[moving].label.toLowerCase()}.` : `Case status: ${CASE_STATUS_META[moving].label}.`);
    setMoving(null);
    reload();
  };

  const togglePublic = async () => {
    setSwitching(true);
    try {
      await api.patch(`/pacc/cases/${cs.id}`, { show_public: !cs.show_public });
      toast.success(cs.show_public ? 'The status is no longer shown on the public portal.' : 'The status is now shown on the public portal.');
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      {back}
      <PageHeader
        eyebrow={<span className="font-mono">{cs.project_code}</span>}
        title={cs.project_name}
        description={`PACC case opened ${date(cs.created_at)}${cs.opened_by_name ? ` by ${cs.opened_by_name}` : ''}${cs.closed_at ? ` · closed ${date(cs.closed_at)}` : ''}`}
        actions={
          closed
            ? null
            : nextCaseStatuses(cs.status).map((s) => (
                <Button key={s} variant={TRANSITIONS[s].variant} icon={TRANSITIONS[s].icon} onClick={() => setMoving(s)}>{TRANSITIONS[s].button}</Button>
              ))
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Status" />
            <CardBody className="space-y-4">
              <Pill className={meta?.cls}>{meta?.label || cs.status}</Pill>
              {closed && <p className="text-sm text-slate-600">This case is closed. Closing is final; open a new case on the project if needed.</p>}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <span id="show-public-label" className="text-sm font-medium text-slate-800">Show status on the public portal</span>
                  <Switch checked={cs.show_public && !closed} disabled={closed || switching} busy={switching} onChange={togglePublic} labelledBy="show-public-label" />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {closed
                    ? 'Closed cases are never shown on the public portal.'
                    : 'DPWH staff (Admin, Personnel, Auditor) always see the case status while the case is open; this switch controls only the public portal. There, the public sees only “Under PACC investigation” or “Case filed”, nothing else.'}
                </p>
              </div>
            </CardBody>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Respondents and charges" />
            <CardBody>
              <DetailList
                items={[
                  ['Contractor', cs.contractor_name ? <ContractorName key="k" name={cs.contractor_name} removed={cs.contractor_removed} /> : 'None named'],
                  ['Other respondents', cs.other_respondents ? <span className="whitespace-pre-line">{cs.other_respondents}</span> : 'None named'],
                  ['Charges / allegations', <span key="c" className="whitespace-pre-line break-words">{cs.charges}</span>],
                  ['Project', cs.project_id ? <Link key="p" to={`/pacc/projects/${cs.project_id}`} className="font-semibold text-brand-700 hover:underline">Open the investigation page</Link> : 'The project was deleted.'],
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader title="Attached citizen reports" description="Closing the case closes its open reports. Their proof photos are on the project's investigation page." />
          {cs.reports.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No reports are attached to this case.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cs.reports.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                  <span className="font-semibold text-slate-900">{REPORT_CATEGORY_LABELS[r.category] || r.category}</span>
                  <Pill className={REPORT_STATUS_CLS[r.status]}>{REPORT_STATUS_LABELS[r.status] || r.status}{r.status === 'closed' && r.outcome ? ` · ${REPORT_OUTCOME_LABELS[r.outcome] || r.outcome}` : ''}</Pill>
                  <span className="text-xs text-slate-500">Sent {date(r.submitted_on)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <NotesCard cs={cs} onAdded={reload} />

        <Card className="overflow-hidden">
          <CardHeader
            title="Documents"
            description={closed ? 'The case is closed: no more documents can be added.' : 'PDF or images, up to 25 MB. Links open for one hour; reload the page for fresh links.'}
            actions={!closed && <Button size="sm" icon={Upload} onClick={() => setUploading(true)}>Upload document</Button>}
          />
          {cs.documents.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500"><Paperclip className="h-4 w-4" aria-hidden />No documents yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {cs.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                    {d.mime_type?.startsWith('image/') ? <ImageIcon className="h-5 w-5" aria-hidden /> : <FileText className="h-5 w-5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{d.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{d.file_name} ({sizeText(d.size_bytes)})</p>
                    <p className="mt-1 text-[11px] text-slate-400">Uploaded by {d.uploaded_by_name || '—'} · {dateTime(d.created_at)}</p>
                  </div>
                  {d.url ? (
                    <Button size="sm" variant="secondary" icon={Download} onClick={() => window.open(d.url, '_blank', 'noopener')}>Open</Button>
                  ) : (
                    <span className="text-xs text-slate-400">File not available</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        title={moving ? TRANSITIONS[moving].title : ''}
        confirmLabel={moving ? TRANSITIONS[moving].button : ''}
        confirmVariant={moving === 'case_filed' ? 'primary' : moving === 'dismissed' ? 'danger' : 'warning'}
        confirmIcon={moving ? TRANSITIONS[moving].icon : undefined}
        onConfirm={changeStatus}
      >
        {moving && isClosedCaseStatus(moving) ? (
          <>
            <Alert tone="warning">Closing is final. Attached open reports will be closed too.</Alert>
            <p className="text-xs text-slate-500">
              They are closed as {REPORT_OUTCOME_LABELS[TRANSITIONS[moving].outcome].toLowerCase()}, and the public portal stops showing a status for this case.
              Notes can still be added afterwards.
            </p>
          </>
        ) : (
          moving && <p>{TRANSITIONS[moving].body}</p>
        )}
      </ConfirmDialog>
      <UploadCaseDocumentModal
        open={uploading}
        caseId={cs.id}
        onClose={() => setUploading(false)}
        onDone={() => {
          setUploading(false);
          toast.success('Document uploaded.');
          reload();
        }}
      />
    </>
  );
}

/** On/off switch (a button with role="switch"). */
function Switch({ checked, disabled, busy, onChange, labelledBy }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-brand-700' : 'bg-slate-300'}`}
    >
      <span className={`inline-grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}>
        {busy && <Spinner className="h-3 w-3" />}
      </span>
    </button>
  );
}

/** Notes are append-only history; they can be added to a closed case too. */
function NotesCard({ cs, onAdded }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/pacc/cases/${cs.id}/notes`, { body: body.trim() });
      setBody('');
      toast.success('Note added.');
      onAdded();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Notes" description="Oldest first. Notes cannot be edited or deleted." />
      {cs.notes.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No notes yet.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {cs.notes.map((n) => (
            <li key={n.id} className="px-5 py-3 text-sm">
              <p className="whitespace-pre-line break-words text-slate-800">{n.body}</p>
              <p className="mt-1 text-xs text-slate-500">{n.author_name || 'PACC member'} · {dateTime(n.created_at)}</p>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={submit} className="space-y-3 border-t border-slate-100 px-5 py-4">
        {err && <Alert tone="error">{err.message}</Alert>}
        <Field label="Add a note">{(a) => <Textarea {...a} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} placeholder="e.g. Requested the contract documents from the district office." />}</Field>
        <Button type="submit" size="sm" icon={MessageSquarePlus} loading={saving} disabled={!body.trim()}>Add note</Button>
      </form>
    </Card>
  );
}

function UploadCaseDocumentModal({ open, caseId, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setTitle('');
    setErr(null);
  }, [open]);

  const pick = (f) => {
    setErr(null);
    if (f && f.size > DOC_MAX_MB * 1048576) {
      setErr({ message: `The file is larger than ${DOC_MAX_MB} MB.` });
      return setFile(null);
    }
    setFile(f);
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 200));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setErr({ message: 'Choose a file to upload.' });
    setSaving(true);
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', title.trim());
    try {
      await api.post(`/pacc/cases/${caseId}/documents`, fd);
      onDone();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload case document"
      description={`PDF, JPEG, PNG or WebP, up to ${DOC_MAX_MB} MB. Only PACC can open it.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="case-doc-form" icon={Upload} loading={saving}>Upload</Button></>}
    >
      <form id="case-doc-form" onSubmit={submit} className="space-y-4">
        {err && (
          <Alert tone="error" title="Not uploaded">
            {err.details?.length ? err.details.map((d) => d.message).join(' ') : err.message}
          </Alert>
        )}
        <Field label="File" required>
          {(a) => (
            <input
              {...a}
              type="file"
              accept={DOC_ACCEPT}
              onChange={(e) => pick(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800 hover:file:bg-brand-100"
            />
          )}
        </Field>
        <Field label="Title" required hint="3–200 characters">{(a) => <Input {...a} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} />}</Field>
      </form>
    </Modal>
  );
}
