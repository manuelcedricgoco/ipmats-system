import { Download, FileSpreadsheet, FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pill } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { Card, CardHeader } from '../../../components/common/Card.jsx';
import { Alert, EmptyState, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Field, Input, Select, Textarea } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { date, dateTime } from '../../../lib/format.js';

export const DOCUMENT_TYPES = {
  contract: 'Contract',
  program_of_work: 'Program of work',
  progress_report: 'Progress report',
  inspection_report: 'Inspection report',
  variation_order: 'Variation order',
  payment_document: 'Payment document',
  as_built_plan: 'As-built plan',
  other: 'Other',
};
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';
const MAX_MB = 25;

const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function FileIcon({ mime }) {
  if (mime?.startsWith('image/')) return <ImageIcon className="h-5 w-5" aria-hidden />;
  if (mime?.includes('sheet') || mime?.includes('excel')) return <FileSpreadsheet className="h-5 w-5" aria-hidden />;
  return <FileText className="h-5 w-5" aria-hidden />;
}

/**
 * Gap fix (concept document §7.2, workflow step 3): DPWH personnel upload supporting project documents —
 * contracts, programs of work, progress and inspection reports, variation orders, payment documents, plans.
 * Staff can open them; personnel and admins upload; the uploader or an admin can delete.
 */
export default function DocumentsTab() {
  const { project, canEdit } = useOutletContext();
  const { profile, hasRole } = useAuth();
  const toast = useToast();
  const docs = useApi(`/projects/${project.id}/documents`, undefined, { select: (r) => r.data });
  const phases = useApi(`/projects/${project.id}/phases`, undefined, { select: (r) => r.data.phases });
  const [uploading, setUploading] = useState(false);
  const [type, setType] = useState('');

  if (docs.loading && !docs.data) return <PageLoader label="Loading documents…" withHeader={false} />;
  if (docs.error) return <ErrorState error={docs.error} onRetry={docs.reload} />;
  const list = (docs.data || []).filter((d) => !type || d.doc_type === type);

  const remove = async (d) => {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return;
    try {
      await api.del(`/projects/${project.id}/documents/${d.id}`);
      toast.success('Document deleted.');
      docs.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const modal = (
    <UploadDocumentModal
      open={uploading}
      onClose={() => setUploading(false)}
      project={project}
      phases={phases.data || []}
      onDone={() => {
        setUploading(false);
        toast.success('Document uploaded.');
        docs.reload();
      }}
    />
  );

  if (!docs.data?.length) {
    return (
      <>
        <EmptyState
          icon={Paperclip}
          title="No supporting documents yet"
          description="Contracts, programs of work, progress and inspection reports, variation orders and payment documents of this project."
          action={canEdit && <Button icon={Upload} onClick={() => setUploading(true)}>Upload a document</Button>}
        />
        {modal}
      </>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Supporting documents"
        description={`${docs.data.length} document(s). Links open for one hour; open the tab again for fresh links.`}
        actions={
          <>
            <Select aria-label="Document type" value={type} onChange={(e) => setType(e.target.value)} className="w-44">
              <option value="">All types</option>
              {Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            {canEdit && <Button size="sm" icon={Upload} onClick={() => setUploading(true)}>Upload document</Button>}
          </>
        }
      />
      <ul className="stagger divide-y divide-slate-100">
        {list.map((d) => (
          <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><FileIcon mime={d.mime_type} /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{d.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <Pill className="bg-brand-50 text-brand-800">{d.type_label}</Pill>
                {d.document_date && <span>Dated {date(d.document_date)}</span>}
                {d.phase_name && <span>· {d.phase_name}</span>}
                <span>· {d.file_name} ({sizeText(d.size_bytes)})</span>
              </p>
              {d.description && <p className="mt-1 text-sm text-slate-600">{d.description}</p>}
              <p className="mt-1 text-[11px] text-slate-400">Uploaded by {d.uploaded_by_name || '—'} · {dateTime(d.created_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {d.url ? (
                <Button size="sm" variant="secondary" icon={Download} to={undefined} onClick={() => window.open(d.url, '_blank', 'noopener')}>Open</Button>
              ) : (
                <span className="text-xs text-slate-400">File not available</span>
              )}
              {(hasRole('admin') || (canEdit && d.uploaded_by === profile?.id)) && (
                <button type="button" onClick={() => remove(d)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${d.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No documents of this type.</li>}
      </ul>
      {modal}
    </Card>
  );
}

function UploadDocumentModal({ open, onClose, project, phases, onDone }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setErr(null);
    setForm({ title: '', doc_type: 'progress_report', description: '', document_date: '', phase_id: '' });
  }, [open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = (f) => {
    setErr(null);
    if (f && f.size > MAX_MB * 1048576) {
      setErr({ message: `The file is larger than ${MAX_MB} MB.` });
      return setFile(null);
    }
    setFile(f);
    if (f && !form.title) setForm((x) => ({ ...x, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 200) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setErr({ message: 'Choose a file to upload.' });
    setSaving(true);
    setErr(null);
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(form).forEach(([k, v]) => v !== '' && fd.append(k, v));
    try {
      await api.post(`/projects/${project.id}/documents`, fd);
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
      size="lg"
      title="Upload supporting document"
      description={`${project.project_code} · PDF, image, Word or Excel, up to ${MAX_MB} MB.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="doc-form" icon={Upload} loading={saving}>Upload</Button></>}
    >
      <form id="doc-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && (
          <Alert tone="error" title="Not uploaded" className="sm:col-span-2">
            {err.message}
            {err.details?.length > 0 && <ul className="mt-1 list-disc pl-4">{err.details.map((d, i) => <li key={i}>{d.field}: {d.message}</li>)}</ul>}
          </Alert>
        )}
        <Field label="File" required className="sm:col-span-2">
          {(a) => (
            <input
              {...a}
              type="file"
              accept={ACCEPT}
              onChange={(e) => pick(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800 hover:file:bg-brand-100"
            />
          )}
        </Field>
        <Field label="Title" required className="sm:col-span-2">{(a) => <Input {...a} value={form.title || ''} onChange={set('title')} required minLength={3} maxLength={200} />}</Field>
        <Field label="Type" required>
          {(a) => <Select {...a} value={form.doc_type || ''} onChange={set('doc_type')}>{Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        </Field>
        <Field label="Document date">{(a) => <Input {...a} type="date" value={form.document_date || ''} onChange={set('document_date')} />}</Field>
        <Field label="Construction phase" className="sm:col-span-2">
          {(a) => (
            <Select {...a} value={form.phase_id || ''} onChange={set('phase_id')}>
              <option value="">Whole project</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.sequence_no}. {p.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Notes" className="sm:col-span-2">{(a) => <Textarea {...a} value={form.description || ''} onChange={set('description')} rows={2} maxLength={2000} />}</Field>
      </form>
    </Modal>
  );
}
