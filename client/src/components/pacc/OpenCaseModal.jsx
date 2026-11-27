import { FolderPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useReference } from '../../hooks/useReference.js';
import { api } from '../../lib/api.js';
import { date } from '../../lib/format.js';
import { REPORT_CATEGORY_LABELS } from '../../lib/pacc.js';
import Button from '../common/Button.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Checkbox, Field, Select, Textarea, fieldErrors } from '../common/Form.jsx';
import Modal from '../common/Modal.jsx';

/**
 * Open a PACC case on a project: respondents (a contractor from the contractor list and/or officials named
 * as free text), the charges, and which of the project's open reports to attach (all ticked by default).
 * `reports` are the project's open reports that are not in a case. `onCreated(case)` runs after the case is saved.
 */
const FORM_FIELDS = ['contractor_id', 'other_respondents', 'charges'];
/** Validation errors of the fields on this form are shown under the fields; anything else goes in the alert. */
const shownOnField = (err) => err.details?.length > 0 && err.details.every((d) => FORM_FIELDS.includes(d.field));

export default function OpenCaseModal({ open, onClose, project, reports = [], onCreated }) {
  const { ref } = useReference();
  const contractors = ref?.contractors || [];
  const [form, setForm] = useState({ contractor_id: '', other_respondents: '', charges: '' });
  const [picked, setPicked] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({ contractor_id: project?.contractor_id || '', other_respondents: '', charges: '' });
    setPicked(new Set(reports.map((r) => r.id)));
    setErr(null);
    // Reset only when the modal opens, not when the parent re-renders with a new array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const fe = fieldErrors(err);
  // Without the contractor list there is no contractor field, so no contractor is sent.
  const contractorId = contractors.length ? form.contractor_id : '';
  const noRespondent = !contractorId && !form.other_respondents.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (noRespondent) return setErr({ message: 'Name at least one respondent: a contractor or the officials involved.' });
    setSaving(true);
    setErr(null);
    try {
      const res = await api.post(`/pacc/projects/${project.id}/cases`, {
        contractor_id: contractorId || null,
        other_respondents: form.other_respondents.trim() || null,
        charges: form.charges.trim(),
        report_ids: reports.filter((r) => picked.has(r.id)).map((r) => r.id),
      });
      onCreated(res.data);
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
      title="Open a case"
      description={project ? `${project.project_code} · ${project.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="open-case-form" icon={FolderPlus} loading={saving}>Open case</Button>
        </>
      }
    >
      <form id="open-case-form" onSubmit={submit} className="space-y-4">
        {err && !shownOnField(err) && <Alert tone="error">{err.details?.length ? err.details.map((d) => d.message).join(' ') : err.message}</Alert>}
        <p className="text-sm text-slate-600">Name at least one respondent: the contractor, the officials involved, or both.</p>
        {contractors.length > 0 ? (
          <Field label="Contractor" error={fe.contractor_id} hint={project?.contractor_name ? `This project's contractor: ${project.contractor_name}` : undefined}>
            {(a) => (
              <Select {...a} value={form.contractor_id} onChange={set('contractor_id')}>
                <option value="">No contractor</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active === false ? ' (inactive)' : ''}</option>)}
              </Select>
            )}
          </Field>
        ) : (
          <p className="text-xs text-slate-500">The contractor list is not available. Name the respondents below.</p>
        )}
        <Field
          label={contractors.length ? 'Other respondents' : 'Respondents'}
          error={fe.other_respondents}
          hint="Officials or other people involved, with their position, e.g. “Juan Dela Cruz, District Engineer”."
        >
          {(a) => <Textarea {...a} value={form.other_respondents} onChange={set('other_respondents')} rows={2} maxLength={1000} />}
        </Field>
        <Field label="Charges / allegations" required error={fe.charges} hint={`At least 10 characters (${form.charges.trim().length}/4000).`}>
          {(a) => <Textarea {...a} value={form.charges} onChange={set('charges')} rows={4} required minLength={10} maxLength={4000} />}
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Attach open citizen reports</legend>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-500">This project has no open reports that are not in a case.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-slate-500">
                {picked.size} of {reports.length} selected. Attached reports are closed together with the case.
              </p>
              <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Checkbox
                      checked={picked.has(r.id)}
                      onChange={() => toggle(r.id)}
                      label={REPORT_CATEGORY_LABELS[r.category] || r.category}
                      description={`Sent ${date(r.submitted_on)} · ${r.description?.length > 90 ? `${r.description.slice(0, 90)}…` : r.description || ''}`}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
