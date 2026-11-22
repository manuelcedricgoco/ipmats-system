import { useEffect, useState } from 'react';
import Button from '../common/Button.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Select, Textarea } from '../common/Form.jsx';
import Modal from '../common/Modal.jsx';
import { api } from '../../lib/api.js';
import { SEVERITY_META } from '../../lib/constants.js';
import { Pill } from '../common/Badges.jsx';

/**
 * Gap fix (concept document §4.6, §7.3 "Monitor corrective actions"): the DPWH personnel account a finding is
 * assigned to reports what was done and marks it In progress or Resolved. Only the Auditor / Admin can close it.
 */
export default function CorrectiveActionModal({ finding, open, onClose, onSaved }) {
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('in_progress');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open || !finding) return;
    setAction(finding.corrective_action || '');
    setStatus(finding.action_status === 'resolved' ? 'resolved' : 'in_progress');
    setErr(null);
  }, [open, finding]);

  if (!finding) return null;
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api.patch(`/findings/${finding.id}/action`, { corrective_action: action.trim() || null, action_status: status });
      onSaved(status === 'resolved' ? 'Marked as resolved. The auditor will verify and close it.' : 'Corrective action updated.');
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
      title="Update corrective action"
      description={`${finding.project_code ? `${finding.project_code} · ` : ''}${finding.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="action-form" loading={saving}>Save update</Button>
        </>
      }
    >
      <form id="action-form" onSubmit={submit} className="space-y-4">
        {err && <Alert tone="error" title="Not saved">{err.message}</Alert>}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-slate-800">
            Finding <Pill className={SEVERITY_META[finding.severity]?.cls}>{SEVERITY_META[finding.severity]?.label}</Pill>
          </p>
          <p className="mt-1 text-slate-700">{finding.description}</p>
          {finding.recommendation && <p className="mt-1 text-xs text-slate-600"><strong>Recommendation:</strong> {finding.recommendation}</p>}
        </div>
        <Field label="What was done" hint="Describe the corrective action taken on site (it is shown to the auditor).">
          {(a) => <Textarea {...a} value={action} onChange={(e) => setAction(e.target.value)} rows={4} maxLength={2000} placeholder="e.g. Contractor re-took the 360° photo at the dike alignment with the site engineer on 25 Nov." />}
        </Field>
        <Field label="Status">
          {(a) => (
            <Select {...a} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved — ready for the auditor to verify</option>
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}
