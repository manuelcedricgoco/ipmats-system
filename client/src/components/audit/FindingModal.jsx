import { useEffect, useState } from 'react';
import Button from '../common/Button.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Input, Select, Textarea } from '../common/Form.jsx';
import Modal from '../common/Modal.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { ACTION_STATUS, SEVERITY_META } from '../../lib/constants.js';

const EMPTY = { title: '', description: '', severity: 'medium', recommendation: '', corrective_action: '', action_status: 'open', due_date: '', phase_id: '', assigned_to: '' };

/**
 * WEEK 3 — Record or update an audit finding with optional evidence (Jonalyn Pagilagan, front-end).
 * Gap fix: the corrective action can be assigned to a DPWH personnel account, who then reports on it.
 */
export default function FindingModal({ open, onClose, projectId, phases = [], finding, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setForm(finding ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, finding[k] ?? ''])) : EMPTY);
    setFile(null);
    setErr(null);
  }, [open, finding]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const people = useApi(open ? '/audit/assignees' : null, undefined, { select: (r) => r.data });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (file) fd.append('evidence', file);
    try {
      if (finding) await api.patch(`/findings/${finding.id}`, fd);
      else await api.post(`/projects/${projectId}/findings`, fd);
      onSaved(finding ? 'Finding updated.' : 'Finding recorded.');
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
      title={finding ? 'Update audit finding' : 'Record audit finding'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="finding-form" loading={saving}>Save finding</Button></>}
    >
      <form id="finding-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && (
          <Alert tone="error" title="Not saved" className="sm:col-span-2">
            {err.message}
            {err.details?.length > 0 && <ul className="mt-1 list-disc pl-4">{err.details.map((d, i) => <li key={i}>{d.field}: {d.message}</li>)}</ul>}
          </Alert>
        )}
        <Field label="Title" required className="sm:col-span-2">{(a) => <Input {...a} value={form.title} onChange={set('title')} required minLength={5} maxLength={200} />}</Field>
        <Field label="What was found" required className="sm:col-span-2">{(a) => <Textarea {...a} value={form.description} onChange={set('description')} required minLength={10} rows={3} />}</Field>
        <Field label="Severity">{(a) => <Select {...a} value={form.severity} onChange={set('severity')}>{Object.entries(SEVERITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select>}</Field>
        <Field label="Construction phase">
          {(a) => (
            <Select {...a} value={form.phase_id} onChange={set('phase_id')}>
              <option value="">Whole project</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.sequence_no}. {p.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Recommendation" className="sm:col-span-2">{(a) => <Textarea {...a} value={form.recommendation} onChange={set('recommendation')} rows={2} />}</Field>
        <Field label="Corrective action" className="sm:col-span-2">{(a) => <Textarea {...a} value={form.corrective_action} onChange={set('corrective_action')} rows={2} />}</Field>
        <Field label="Assign corrective action to" hint="The person sees it under “Findings assigned to you” and reports progress." className="sm:col-span-2">
          {(a) => (
            <Select {...a} value={form.assigned_to} onChange={set('assigned_to')}>
              <option value="">Not assigned</option>
              {(people.data || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}{p.position ? ` · ${p.position}` : ''}{p.agency_name ? ` (${p.agency_name})` : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Action status">{(a) => <Select {...a} value={form.action_status} onChange={set('action_status')}>{Object.entries(ACTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        <Field label="Due date">{(a) => <Input {...a} type="date" value={form.due_date} onChange={set('due_date')} />}</Field>
        <Field label={finding?.evidence_path ? 'Replace evidence (optional)' : 'Evidence (optional)'} hint="PDF or image, up to 20 MB" className="sm:col-span-2">
          {(a) => <input {...a} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800" />}
        </Field>
      </form>
    </Modal>
  );
}
