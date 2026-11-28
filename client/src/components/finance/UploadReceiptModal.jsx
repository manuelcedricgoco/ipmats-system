import { Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../common/Button.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Input, Textarea } from '../common/Form.jsx';
import Modal from '../common/Modal.jsx';
import { api } from '../../lib/api.js';
import { RECORD_TYPES } from '../../lib/constants.js';
import { peso, todayIso } from '../../lib/format.js';
import { DESCRIPTION_PUBLIC_HINT, PRIVACY_REMINDER, RECEIPT_ACCEPT, checkReceiptForm, receiptFormData } from '../../lib/liquidation.js';

const EMPTY = { amount: '', receipt_date: '', description: '' };

/**
 * Finance liquidation (031): upload a receipt for one disbursement or expense (DPWH Personnel; a contractor on its
 * own company's projects). The receipt waits for the Auditor (Submitted); only accepted receipts count as liquidated
 * and are shown to the public, hence the privacy reminder. The API checks the file's bytes, the amount and the date
 * again; its message is shown as it comes.
 */
export default function UploadReceiptModal({ open, onClose, projectId, record, onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, receipt_date: todayIso() });
    setFile(null);
    setErrors({});
    setErr(null);
  }, [open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pick = (f) => {
    setFile(f);
    setErr(null);
    setErrors((x) => ({ ...x, file: f ? checkReceiptForm({ ...form, file: f }, todayIso()).file : undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const problems = checkReceiptForm({ ...form, file }, todayIso());
    setErrors(problems);
    setErr(null);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/finance/${record.id}/receipts`, receiptFormData(form, file));
      onDone(res?.data);
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  const details = (err?.details || []).filter((d) => d.message !== err?.message);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload receipt"
      description={record ? `${RECORD_TYPES[record.record_type]} ${record.reference_no || ''} · ${peso(record.amount)}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="receipt-form" icon={Upload} loading={saving}>Upload receipt</Button></>}
    >
      <form id="receipt-form" onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Alert tone="warning" className="sm:col-span-2">
          {PRIVACY_REMINDER}
        </Alert>
        {err && (
          <Alert tone="error" title="The receipt was not uploaded" className="sm:col-span-2">
            <p>{err.message}</p>
            {details.length > 0 && <ul className="mt-1 list-disc pl-4">{details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
          </Alert>
        )}
        <Field label="Receipt file" required hint="PDF, JPEG, PNG or WebP, up to 15 MB." error={errors.file} className="sm:col-span-2">
          {(a) => (
            <input
              {...a}
              type="file"
              accept={RECEIPT_ACCEPT}
              onChange={(e) => pick(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800 hover:file:bg-brand-100"
            />
          )}
        </Field>
        <Field label="Amount (PHP)" required error={errors.amount}>
          {(a) => <Input {...a} type="number" step="0.01" min="0.01" inputMode="decimal" value={form.amount} onChange={set('amount')} invalid={Boolean(errors.amount)} />}
        </Field>
        <Field label="Receipt date" required error={errors.receipt_date}>
          {(a) => <Input {...a} type="date" value={form.receipt_date} max={todayIso()} onChange={set('receipt_date')} />}
        </Field>
        <Field label="Description" hint="Optional: what the receipt is for (at most 500 characters)." error={errors.description} className="sm:col-span-2">
          {(a) => (
            <>
              <Textarea {...a} value={form.description} onChange={set('description')} rows={2} maxLength={500} placeholder="e.g. Cement, 40 bags" />
              <p className="mt-1 text-xs text-slate-500">{DESCRIPTION_PUBLIC_HINT}</p>
            </>
          )}
        </Field>
      </form>
    </Modal>
  );
}
