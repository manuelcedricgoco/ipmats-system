import { Trash2, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pill } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Input, PasswordInput, Textarea, fieldErrors } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import RowActions from '../../components/common/RowActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useRowBusy } from '../../hooks/useRowBusy.js';
import { api } from '../../lib/api.js';
import { date } from '../../lib/format.js';

const isSuspended = (m) => Boolean(m?.suspended_at) || m?.is_active === false;

/**
 * PACC members: PACC manages its own accounts. Any member can add, suspend, reactivate or remove another member;
 * nobody can act on their own account, and the last active member cannot be suspended or removed (the server
 * refuses, and its message is shown in the dialog).
 */
export default function PaccMembersPage() {
  const { profile } = useAuth();
  const { data, loading, error, reload } = useApi('/pacc/members', undefined, { select: (r) => r.data });
  const [adding, setAdding] = useState(false);
  const [suspending, setSuspending] = useState(null);
  const [lifting, setLifting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const rows = useRowBusy();

  const header = (
    <PageHeader
      eyebrow="PACC"
      title="Members"
      description="PACC accounts. The System Administrator can't see or manage PACC accounts: PACC members add, suspend and remove each other here."
      actions={<Button icon={UserPlus} onClick={() => setAdding(true)}>Add member</Button>}
    />
  );
  if (loading && !data) return <>{header}<PageLoader label="Loading members…" withHeader={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>;

  const actions = (m) => {
    const self = m.id === profile?.id;
    if (self) return <span className="text-xs text-slate-400">Your account</span>;
    return (
      <RowActions
        name={m.email}
        busy={rows.isBusy(m.id)}
        suspended={isSuspended(m)}
        suspendIcon={UserX}
        reactivateIcon={UserCheck}
        onSuspend={() => setSuspending(m)}
        onReactivate={() => setLifting(m)}
        onDelete={() => setRemoving(m)}
      />
    );
  };

  return (
    <>
      {header}
      <Card className={`overflow-hidden ${loading ? 'opacity-60' : ''}`}>
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Position</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Added</th>
                <th scope="col" className="w-px whitespace-nowrap px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((m) => (
                <tr key={m.id} className={isSuspended(m) ? 'bg-slate-50 text-slate-500' : ''}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">{m.full_name || '—'}</span>
                    {m.id === profile?.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}
                    <span className="block break-all text-xs text-slate-500">{m.email}</span>
                  </td>
                  <td className="px-4 py-3">{m.position || '—'}</td>
                  <td className="px-4 py-3">
                    {isSuspended(m) ? <Pill className="bg-red-50 text-red-800">Suspended</Pill> : <Pill className="bg-emerald-50 text-emerald-800">Active</Pill>}
                    {m.suspended_at && (
                      <p className="mt-1 max-w-xs break-words text-xs text-slate-500">
                        Since {date(m.suspended_at)}
                        {m.suspension_reason && <span className="block italic text-slate-600">&ldquo;{m.suspension_reason}&rdquo;</span>}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{date(m.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{actions(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddMemberModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
      <SuspendMemberDialog member={suspending} run={rows.run} onClose={() => setSuspending(null)} onDone={() => { setSuspending(null); reload(); }} />
      <LiftSuspensionDialog member={lifting} run={rows.run} onClose={() => setLifting(null)} onDone={() => { setLifting(null); reload(); }} />
      <RemoveMemberDialog
        member={removing}
        run={rows.run}
        onClose={() => setRemoving(null)}
        onDone={() => { setRemoving(null); reload(); }}
        onSuspendInstead={(m) => { setRemoving(null); setSuspending(m); }}
      />
    </>
  );
}

/** Name and email of the member an action applies to. */
function MemberSummary({ member: m }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <p className="break-words font-semibold text-slate-900">{m.full_name || '—'}</p>
      <p className="break-all text-xs text-slate-600">{m.email}</p>
    </div>
  );
}

function AddMemberModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setForm({ email: '', full_name: '', position: '', password: '' });
    setErr(null);
  }, [open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fe = fieldErrors(err);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api.post('/pacc/members', { email: form.email.trim(), full_name: form.full_name.trim(), position: form.position.trim() || null, password: form.password });
      toast.success(`${form.full_name.trim()} added. Share the temporary password privately.`);
      onSaved();
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
      title="Add member"
      description="The new PACC account can sign in right away with the temporary password."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="pacc-member-form" icon={UserPlus} loading={saving}>Add member</Button></>}
    >
      <form id="pacc-member-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && !err.details && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        <Field label="Email" required error={fe.email} className="sm:col-span-2">
          {(a) => <Input {...a} type="email" value={form.email} onChange={set('email')} required maxLength={200} autoComplete="off" />}
        </Field>
        <Field label="Full name" required error={fe.full_name}>{(a) => <Input {...a} value={form.full_name} onChange={set('full_name')} required minLength={2} maxLength={120} />}</Field>
        <Field label="Position" error={fe.position}>{(a) => <Input {...a} value={form.position} onChange={set('position')} maxLength={120} />}</Field>
        <Field
          label="Temporary password"
          required
          error={fe.password}
          hint="At least 8 characters. Share it with the new member privately, and ask them to change it in My account."
          className="sm:col-span-2"
        >
          {(a) => <PasswordInput {...a} value={form.password} onChange={set('password')} required minLength={8} maxLength={72} autoComplete="new-password" />}
        </Field>
      </form>
    </Modal>
  );
}

function SuspendMemberDialog({ member, run, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (member) setReason('');
  }, [member]);
  const len = reason.trim().length;
  return (
    <ConfirmDialog
      open={Boolean(member)}
      onClose={onClose}
      title="Suspend member?"
      confirmLabel="Suspend"
      confirmVariant="warning"
      confirmIcon={UserX}
      confirmDisabled={len < 5 || len > 500}
      onConfirm={async () => {
        await run(member.id, () => api.post(`/pacc/members/${member.id}/suspend`, { reason: reason.trim() }));
        toast.success(`${member.full_name || member.email} has been suspended.`);
        onDone();
      }}
    >
      {member && (
        <>
          <MemberSummary member={member} />
          <Alert tone="warning">The person is signed out and cannot sign in until another PACC member lifts the suspension. Their case records stay.</Alert>
          <Field label="Reason" required hint={`5–500 characters (${len}/500). Kept with the account and in the PACC activity log.`}>
            {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={500} />}
          </Field>
        </>
      )}
    </ConfirmDialog>
  );
}

function LiftSuspensionDialog({ member, run, onClose, onDone }) {
  const toast = useToast();
  return (
    <ConfirmDialog
      open={Boolean(member)}
      onClose={onClose}
      title="Reactivate member?"
      confirmLabel="Reactivate (lift suspension)"
      confirmVariant="primary"
      confirmIcon={UserCheck}
      onConfirm={async () => {
        await run(member.id, () => api.post(`/pacc/members/${member.id}/unsuspend`));
        toast.success(`The suspension of ${member.full_name || member.email} has been lifted.`);
        onDone();
      }}
    >
      {member && (
        <>
          <MemberSummary member={member} />
          <p>The person can sign in again with their existing password.</p>
        </>
      )}
    </ConfirmDialog>
  );
}

function RemoveMemberDialog({ member, run, onClose, onDone, onSuspendInstead }) {
  const toast = useToast();
  return (
    <ConfirmDialog
      open={Boolean(member)}
      onClose={onClose}
      title="Remove member?"
      confirmLabel="Remove member"
      confirmIcon={Trash2}
      onConfirm={async () => {
        await run(member.id, () => api.del(`/pacc/members/${member.id}`));
        toast.success(`${member.email} removed.`);
        onDone();
      }}
      errorActions={(err) =>
        err.status === 409 && !isSuspended(member) ? (
          <Button size="sm" variant="warning" icon={UserX} className="mt-2" onClick={() => onSuspendInstead(member)}>Suspend instead</Button>
        ) : null
      }
    >
      {member && (
        <>
          <MemberSummary member={member} />
          <p><strong>This cannot be undone.</strong> The account and its sign-in are removed permanently.</p>
          <p className="text-xs text-slate-500">Members who opened cases, wrote notes or uploaded case documents cannot be removed. Suspend them instead so the history stays intact.</p>
        </>
      )}
    </ConfirmDialog>
  );
}
