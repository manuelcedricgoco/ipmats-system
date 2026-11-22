import { useEffect, useState } from 'react';
import Button from '../common/Button.jsx';
import { FlagBadge } from '../common/Badges.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Select, Textarea } from '../common/Form.jsx';
import Modal from '../common/Modal.jsx';
import { api } from '../../lib/api.js';
import { AUDIT_STATUS, FLAG_META } from '../../lib/constants.js';
import FlagReasons from './FlagReasons.jsx';

/**
 * WEEK 3 — Auditor confirms or overrides the automatic flag (Jonalyn Pagilagan, front-end).
 * A reason (≥ 10 characters) is always required. An override also needs supporting evidence (PDF / image),
 * as the concept document requires (§4.2, §14); for a confirmation the evidence is optional.
 */
export default function ReviewFlagModal({ project, open, onClose, onSaved }) {
  const [decision, setDecision] = useState('confirm');
  const [finalFlag, setFinalFlag] = useState('');
  const [reason, setReason] = useState('');
  const [auditStatus, setAuditStatus] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDecision('confirm');
    setFinalFlag('');
    setReason('');
    setAuditStatus('');
    setFile(null);
    setErr(null);
  }, [open]);

  if (!project) return null;
  const needsEvidence = decision === 'override';
  const submit = async (e) => {
    e.preventDefault();
    if (needsEvidence && !file) {
      setErr({ message: 'Attach supporting evidence (PDF or photo) to override a flag.' });
      return;
    }
    setSaving(true);
    setErr(null);
    const fd = new FormData();
    fd.append('decision', decision);
    if (decision === 'override') fd.append('final_flag', finalFlag);
    fd.append('reason', reason.trim());
    if (auditStatus) fd.append('audit_status', auditStatus);
    if (file) fd.append('evidence', file);
    try {
      await api.post(`/projects/${project.id}/flags/review`, fd);
      onSaved(decision === 'confirm' ? 'Flag confirmed.' : 'Flag overridden.');
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
      title="Review the automatic flag"
      description={`${project.project_code} · ${project.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="review-form" loading={saving}>{decision === 'confirm' ? 'Confirm flag' : 'Override flag'}</Button>
        </>
      }
    >
      <form id="review-form" onSubmit={submit} className="space-y-4">
        {err && <Alert tone="error" title="Not saved">{err.message}</Alert>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">Automatic flag: <FlagBadge flag={project.auto_flag} size="sm" /></p>
          <FlagReasons reasons={project.auto_flag_reasons} hideInfo compact />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Decision</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              ['confirm', 'Confirm', 'The automatic flag is correct.'],
              ['override', 'Override', 'Apply a different flag after verification.'],
            ].map(([v, l, d]) => (
              <label key={v} className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${decision === v ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="decision" value={v} checked={decision === v} onChange={() => setDecision(v)} className="sr-only" />
                <span className="font-semibold text-slate-900">{l}</span>
                <span className="block text-xs text-slate-500">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {decision === 'override' && (
          <Field label="New flag" required>
            {(a) => (
              <Select {...a} value={finalFlag} onChange={(e) => setFinalFlag(e.target.value)} required>
                <option value="">Choose a flag</option>
                {Object.entries(FLAG_META).filter(([k]) => k !== project.auto_flag).map(([k, m]) => <option key={k} value={k}>{m.label} – {m.long}</option>)}
              </Select>
            )}
          </Field>
        )}
        <Field label="Reason" required hint="At least 10 characters. It is kept permanently with the decision.">
          {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} rows={3} placeholder="e.g. Site inspection on 20 Nov confirmed the revetment works are behind schedule." />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Audit status" hint="Default: Verified (Red: For investigation)">
            {(a) => (
              <Select {...a} value={auditStatus} onChange={(e) => setAuditStatus(e.target.value)}>
                <option value="">Default</option>
                {Object.entries(AUDIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            )}
          </Field>
          <Field label={needsEvidence ? 'Supporting evidence' : 'Evidence (optional)'} required={needsEvidence} hint={needsEvidence ? 'Required for an override · PDF or image, up to 20 MB' : 'PDF or image, up to 20 MB'}>
            {(a) => <input {...a} type="file" required={needsEvidence} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-800" />}
          </Field>
        </div>
      </form>
    </Modal>
  );
}
