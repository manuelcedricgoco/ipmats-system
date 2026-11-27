import { Ban, Check, Clock3, Search, Trash2, UserCheck, UserPlus, UserX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pill } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Input, Select, Textarea, fieldErrors, PasswordInput } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import RowActions from '../../components/common/RowActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useReference } from '../../hooks/useReference.js';
import { useRowBusy } from '../../hooks/useRowBusy.js';
import { api } from '../../lib/api.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { ASSIGNABLE_ROLES, isContractor, licenceCheck, userAccountPayload } from '../../lib/contractor.js';
import { date, dateTime } from '../../lib/format.js';

/**
 * WEEK 1 — User accounts and role-based access (admin). Approves sign-ups from the Register page.
 * 029: contractor accounts too, each linked to one contractor company (required for the Contractor role).
 */
export default function UsersPage() {
  const { profile } = useAuth();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState(''); // '' = all accounts, 'suspended' = suspended only
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi('/users', { role, status, search: q, page, pageSize: 50 });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [suspending, setSuspending] = useState(null);
  const [lifting, setLifting] = useState(null);
  const rows = useRowBusy();
  /** Edit for every account; Suspend / Reactivate and Delete for everyone but yourself. */
  const rowActions = (u) => {
    const self = u.id === profile.id;
    return (
      <RowActions
        name={u.email}
        busy={rows.isBusy(u.id)}
        suspended={isSuspended(u)}
        suspendIcon={UserX}
        reactivateIcon={UserCheck}
        onEdit={() => setEditing(u)}
        onSuspend={self ? undefined : () => setSuspending(u)}
        onReactivate={self ? undefined : () => setLifting(u)}
        onDelete={self ? undefined : () => setDeleting(u)}
      />
    );
  };
  const requests = useApi('/users', { approval_status: 'pending', pageSize: 100 });
  const [approving, setApproving] = useState(null);
  const [declining, setDeclining] = useState(null);
  const reloadAll = () => {
    reload();
    requests.reload();
  };
  const pending = requests.data?.data || [];

  return (
    <>
      <PageHeader eyebrow="User Management" title="Accounts, roles and access" description="Approve access requests from the Register page, and create, update, suspend or delete accounts (role-based access)." actions={<Button icon={UserPlus} onClick={() => setEditing({})}>Create account</Button>} />
      {pending.length > 0 && (
        <Card className="mb-6 overflow-hidden border-amber-200">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3">
            <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />
            <h2 className="text-sm font-semibold text-amber-900">Access requests</h2>
            <span className="rounded-full bg-amber-200 px-2 text-xs font-semibold text-amber-900">{pending.length}</span>
            <span className="ml-auto hidden text-xs text-amber-800 sm:block">New sign-ups have no staff access until approved.</span>
          </div>
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Requested role</th>
                  <th scope="col" className="px-4 py-3">Requested</th>
                  <th scope="col" className="w-px whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-900">{u.full_name || '—'}</span>
                      <span className="block text-xs text-slate-500">{[u.agency?.name, u.position].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="break-all px-4 py-3 text-xs text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      {ROLE_LABELS[u.requested_role] || '—'}
                      {isContractor(u.requested_role) && (
                        <span className="block text-xs text-slate-500">
                          {u.requested_contractor?.name || 'Company not found'}
                          {u.requested_contractor_license_matches === false && <span className="ml-1 font-semibold text-amber-700">· licence does not match</span>}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{dateTime(u.requested_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <RowActions name={u.email} busy={rows.isBusy(u.id)} onApprove={() => setApproving(u)} onReject={() => setDeclining(u)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input type="search" aria-label="Search users" placeholder="Search by name or email" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select aria-label="Role" className="sm:w-56" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {ASSIGNABLE_ROLES.map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
        </Select>
        <button
          type="button"
          aria-pressed={status === 'suspended'}
          onClick={() => { setStatus((x) => (x === 'suspended' ? '' : 'suspended')); setPage(1); }}
          className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 ${status === 'suspended' ? 'bg-amber-100 text-amber-900 ring-amber-300' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
        >
          <Ban className="h-4 w-4" aria-hidden />
          Suspended only
        </button>
      </Card>
      {loading && !data && <PageLoader withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <Card className="overflow-hidden">
          {/* Phones: one card per account. */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {data.data.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">No accounts found.</li>}
            {data.data.map((u) => (
              <li key={u.id} className={`px-4 py-4 ${u.is_active ? '' : 'bg-slate-50 text-slate-500'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{u.full_name || '—'}{u.id === profile.id && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}</p>
                    <p className="break-all text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="-mr-2 shrink-0">{rowActions(u)}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <AccountStatus user={u} />
                  <span className="text-slate-700">{ROLE_LABELS[u.role] || 'No role'}{u.position ? ` · ${u.position}` : ''}</span>
                  {u.contractor && <span className="text-slate-500">{u.contractor.name}</span>}
                </div>
                <SuspensionNote user={u} />
                <p className="mt-1 text-xs text-slate-500">{u.agency?.name || 'No office'} · Created {date(u.created_at)}</p>
              </li>
            ))}
          </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Office</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Created</th>
                  <th scope="col" className="w-px whitespace-nowrap px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No accounts found.</td>
                  </tr>
                )}
                {data.data.map((u) => (
                  <tr key={u.id} className={u.is_active ? '' : 'bg-slate-50 text-slate-500'}>
                    <td className="px-4 py-3"><span className="font-semibold text-slate-900">{u.full_name || '—'}</span>{u.id === profile.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}<span className="block text-xs text-slate-500">{u.email}</span></td>
                    <td className="px-4 py-3">
                      {ROLE_LABELS[u.role] || 'No role'}
                      {u.contractor && <span className="block text-xs font-medium text-slate-700">{u.contractor.name}{u.contractor.is_active === false ? ' (inactive company)' : ''}</span>}
                      <span className="block text-xs text-slate-500">{u.position}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">{u.agency?.name || '—'}</td>
                    <td className="px-4 py-3"><AccountStatus user={u} /><SuspensionNote user={u} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{date(u.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{rowActions(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}
      <UserModal value={editing} self={profile} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadAll(); }} />
      <ApproveModal user={approving} run={rows.run} onClose={() => setApproving(null)} onSaved={() => { setApproving(null); reloadAll(); }} />
      <DeclineModal user={declining} run={rows.run} onClose={() => setDeclining(null)} onSaved={() => { setDeclining(null); reloadAll(); }} />
      <DeleteUserModal
        user={deleting}
        run={rows.run}
        onClose={() => setDeleting(null)}
        onDeleted={() => { setDeleting(null); reloadAll(); }}
        onSuspendInstead={(u) => { setDeleting(null); setSuspending(u); }}
      />
      <SuspendModal user={suspending} run={rows.run} onClose={() => setSuspending(null)} onDone={() => { setSuspending(null); reloadAll(); }} />
      <LiftSuspensionModal user={lifting} run={rows.run} onClose={() => setLifting(null)} onDone={() => { setLifting(null); reloadAll(); }} />
    </>
  );
}

function UserModal({ value, self, onClose, onSaved }) {
  const toast = useToast();
  const { ref } = useReference();
  const open = value !== null;
  const editing = Boolean(value?.id);
  const isSelf = value?.id === self?.id;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setForm({
        email: value.email || '',
        password: '',
        full_name: value.full_name || '',
        role: value.role || 'dpwh_personnel',
        agency_id: value.agency_id || '',
        position: value.position || '',
        contractor_id: value.contractor_id || value.requested_contractor_id || '',
      });
      setErr(null);
    }
  }, [open, value]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fe = fieldErrors(err);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      // Role, company (Contractor only), office and position.
      const { role, contractor_id, ...rest } = userAccountPayload(form);
      const company = contractor_id !== undefined ? { contractor_id } : {};
      if (editing) {
        // Suspension is done only with the Suspend / Lift suspension buttons, not from this form.
        await api.patch(`/users/${value.id}`, { full_name: form.full_name, ...(value.approval_status === 'approved' ? { role, ...company } : {}), ...rest });
      } else {
        await api.post('/users', { email: form.email, password: form.password, full_name: form.full_name, role, ...company, ...rest });
      }
      toast.success(editing ? 'Account updated.' : 'Account created.');
      onSaved();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit account' : 'Create account'} description={editing ? value.email : 'The account is confirmed immediately; share the temporary password securely.'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="user-form" loading={saving}>Save</Button></>}>
      <form id="user-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && (!err.details || err.details.some((d) => !SHOWN_FIELDS.includes(d.field))) && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        {!editing && (
          <>
            <Field label="Email" required error={fe.email}>{(a) => <Input {...a} type="email" value={form.email} onChange={set('email')} required autoComplete="off" />}</Field>
            <Field label="Temporary password" required error={fe.password} hint="At least 8 characters">{(a) => <PasswordInput {...a} value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />}</Field>
          </>
        )}
        <Field label="Full name" required error={fe.full_name} className="sm:col-span-2">{(a) => <Input {...a} value={form.full_name} onChange={set('full_name')} required minLength={2} />}</Field>
        <Field label="Role" required hint={isSelf ? 'You cannot change your own role.' : editing && value.approval_status !== 'approved' ? 'Approve the access request to grant a role.' : undefined}>
          {(a) => (
            <Select {...a} value={form.role} onChange={set('role')} disabled={isSelf || (editing && value.approval_status !== 'approved')}>
              {ASSIGNABLE_ROLES.map((k) => <option key={k} value={k}>{ROLE_LABELS[k]}</option>)}
            </Select>
          )}
        </Field>
        {isContractor(form.role) && (
          <CompanyField
            className="sm:col-span-2"
            value={form.contractor_id}
            onChange={set('contractor_id')}
            error={fe.contractor_id}
            disabled={editing && value.approval_status !== 'approved'}
            hint="The contractor company this account represents. It sees only this company's projects."
          />
        )}
        <Field label="Office">{(a) => <Select {...a} value={form.agency_id} onChange={set('agency_id')}><option value="">None</option>{ref?.agencies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        <Field label="Position" className="sm:col-span-2">{(a) => <Input {...a} value={form.position} onChange={set('position')} />}</Field>
      </form>
    </Modal>
  );
}

function ApproveModal({ user, run, onClose, onSaved }) {
  const toast = useToast();
  const { ref } = useReference();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (user) {
      setForm({ role: user.requested_role || 'dpwh_personnel', agency_id: user.agency_id || '', position: user.position || '', contractor_id: user.requested_contractor_id || '' });
      setErr(null);
    }
  }, [user]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await run(user.id, () => api.post(`/users/${user.id}/approve`, userAccountPayload(form)));
      toast.success(`${user.full_name || user.email} approved as ${ROLE_LABELS[form.role]}.`);
      onSaved();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title="Approve access request"
      description={user ? `${user.full_name || ''} · ${user.email}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="approve-form" icon={Check} loading={saving}>Approve and grant access</Button></>}
    >
      <form id="approve-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        <Field label="Role to grant" required hint={user?.requested_role ? `Requested: ${ROLE_LABELS[user.requested_role]}` : undefined}>
          {(a) => (
            <Select {...a} value={form.role} onChange={set('role')}>
              <option value="dpwh_personnel">DPWH Personnel</option>
              <option value="auditor">Auditor</option>
              <option value="contractor">Contractor</option>
              <option value="admin">System Administrator</option>
            </Select>
          )}
        </Field>
        {user && isContractor(user.requested_role) && <ContractorRequest user={user} />}
        {isContractor(form.role) && (
          <CompanyField
            className="sm:col-span-2"
            value={form.contractor_id}
            onChange={set('contractor_id')}
            error={fieldErrors(err).contractor_id}
            hint="Confirm the company asked for, or choose the right one. The account sees only this company's projects."
          />
        )}
        <Field label="Office">
          {(a) => <Select {...a} value={form.agency_id} onChange={set('agency_id')}><option value="">None</option>{ref?.agencies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}
        </Field>
        <Field label="Position" className="sm:col-span-2">{(a) => <Input {...a} value={form.position} onChange={set('position')} />}</Field>
        <Alert className="sm:col-span-2">
          {isContractor(form.role)
            ? 'Verify with the contractor company that this person represents it before granting access.'
            : <>Verify the person&rsquo;s identity and designation with their DPWH office before granting access.</>}
        </Alert>
      </form>
    </Modal>
  );
}

/** Fields of the account form the page shows a field error under; other errors are shown at the top. */
const SHOWN_FIELDS = ['email', 'password', 'full_name', 'contractor_id'];

/** The contractor company of a Contractor account (029): required, from the contractor list (inactive ones marked). */
function CompanyField({ value, onChange, error, hint, disabled, className }) {
  const { ref } = useReference();
  return (
    <Field label="Contractor company" required error={error} hint={hint} className={className}>
      {(a) => (
        <Select {...a} value={value} onChange={onChange} required disabled={disabled}>
          <option value="">Select the company</option>
          {(ref?.contractors || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.is_active === false ? ' (inactive)' : ''}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

/** What a contractor applicant asked for: the company, the licence typed, and whether it matches the company's. */
function ContractorRequest({ user: u }) {
  const check = licenceCheck(u.requested_contractor_license_matches);
  const cls = { success: 'text-emerald-800', warning: 'text-amber-800', info: 'text-slate-600' }[check.tone];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm sm:col-span-2">
      <dt className="text-slate-500">Requested company</dt>
      <dd className="font-semibold text-slate-900">
        {u.requested_contractor?.name || 'Not found'}
        {u.requested_contractor?.is_active === false && <span className="ml-1 font-normal text-amber-700">(inactive company)</span>}
      </dd>
      <dt className="text-slate-500">PCAB licence typed</dt>
      <dd className="font-mono text-xs leading-5 text-slate-900">{u.requested_contractor_license || '—'}</dd>
      <dt className="text-slate-500">On file</dt>
      <dd className="font-mono text-xs leading-5 text-slate-900">{u.requested_contractor?.pcab_license_no || '—'}</dd>
      <dd className={`col-span-2 text-xs font-medium ${cls}`}>{check.text}</dd>
    </dl>
  );
}

function DeclineModal({ user, run, onClose, onSaved }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (user) {
      setNote('');
      setErr(null);
    }
  }, [user]);
  const submit = async () => {
    setSaving(true);
    try {
      await run(user.id, () => api.post(`/users/${user.id}/reject`, { note: note || null }));
      toast.success('Access request declined.');
      onSaved();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      size="sm"
      title="Decline access request?"
      description={user ? `${user.full_name || ''} · ${user.email}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" icon={X} loading={saving} onClick={submit}>Decline request</Button></>}
    >
      {err && <Alert tone="error" className="mb-3">{err.message}</Alert>}
      <Field label="Reason (shown to the applicant)">{(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Not listed as staff of the Occidental Mindoro DEO" />}</Field>
      <p className="mt-2 text-xs text-slate-500">The account keeps public, read-only access and can be approved later.</p>
    </Modal>
  );
}

/** Suspended (new) or deactivated with the old "Account active" switch: both are lifted the same way. */
const isSuspended = (u) => Boolean(u?.suspended_at) || u?.is_active === false;

/** Name, email and role of the account an action applies to. */
function UserSummary({ user: u }) {
  return (
    <dl className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="sr-only">Name</dt>
      <dd className="break-words font-semibold text-slate-900">{u.full_name || '—'}</dd>
      <dt className="sr-only">Email</dt>
      <dd className="break-all text-xs text-slate-600">{u.email}</dd>
      <dt className="sr-only">Role</dt>
      <dd className="text-xs text-slate-600">{ROLE_LABELS[u.role] || u.role}{u.contractor ? ` · ${u.contractor.name}` : ''}</dd>
    </dl>
  );
}

/** "Since 22 Nov 2026 by … · reason" under the Suspended badge. */
function SuspensionNote({ user: u }) {
  if (!u.suspended_at) return null;
  const by = u.suspender ? ` by ${u.suspender.full_name || u.suspender.email}` : '';
  return (
    <p className="mt-1 max-w-xs break-words text-xs text-slate-500" title={u.suspension_reason || undefined}>
      Since {date(u.suspended_at)}{by}
      {u.suspension_reason && <span className="block italic text-slate-600">&ldquo;{u.suspension_reason}&rdquo;</span>}
    </p>
  );
}

function DeleteUserModal({ user, run, onClose, onDeleted, onSuspendInstead }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (user) setTyped('');
  }, [user]);
  const matches = Boolean(user) && typed.trim().toLowerCase() === String(user.email || '').toLowerCase();
  return (
    <ConfirmDialog
      open={Boolean(user)}
      onClose={onClose}
      title="Delete account?"
      confirmLabel="Delete account"
      confirmIcon={Trash2}
      confirmDisabled={!matches}
      onConfirm={async () => {
        await run(user.id, () => api.del(`/users/${user.id}`));
        toast.success(`Account ${user.email} deleted.`);
        onDeleted();
      }}
      errorActions={(err) =>
        err.status === 409 && !isSuspended(user) ? (
          <Button size="sm" variant="warning" icon={UserX} className="mt-2" onClick={() => onSuspendInstead(user)}>Suspend instead</Button>
        ) : null
      }
    >
      {user && (
        <>
          <UserSummary user={user} />
          <p><strong>This cannot be undone.</strong> The account and its sign-in are removed permanently.</p>
          <p className="text-xs text-slate-500">Accounts that have records in the system (projects, progress updates, finances, photos, documents, findings or activity log entries) cannot be deleted. Suspend them instead so the history stays intact.</p>
          <Field label="Type the email address to confirm" required>
            {(a) => <Input {...a} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={user.email} autoComplete="off" autoCapitalize="none" spellCheck={false} />}
          </Field>
        </>
      )}
    </ConfirmDialog>
  );
}

function SuspendModal({ user, run, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (user) setReason('');
  }, [user]);
  const len = reason.trim().length;
  return (
    <ConfirmDialog
      open={Boolean(user)}
      onClose={onClose}
      title="Suspend account?"
      confirmLabel="Suspend"
      confirmVariant="warning"
      confirmIcon={UserX}
      confirmDisabled={len < 5 || len > 500}
      onConfirm={async () => {
        await run(user.id, () => api.post(`/users/${user.id}/suspend`, { reason: reason.trim() }));
        toast.success(`${user.full_name || user.email} has been suspended.`);
        onDone();
      }}
    >
      {user && (
        <>
          <UserSummary user={user} />
          <Alert tone="warning">The person is signed out and cannot sign in until a System Administrator lifts the suspension. Their records stay in the system.</Alert>
          <Field label="Reason" required hint={`5–500 characters (${len}/500). Kept with the account and in the activity log.`}>
            {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} maxLength={500} placeholder="e.g. Transferred to another district office" />}
          </Field>
        </>
      )}
    </ConfirmDialog>
  );
}

function LiftSuspensionModal({ user, run, onClose, onDone }) {
  const toast = useToast();
  return (
    <ConfirmDialog
      open={Boolean(user)}
      onClose={onClose}
      title="Reactivate account?"
      confirmLabel="Reactivate (lift suspension)"
      confirmVariant="primary"
      confirmIcon={UserCheck}
      onConfirm={async () => {
        await run(user.id, () => api.post(`/users/${user.id}/unsuspend`));
        toast.success(`The suspension of ${user.full_name || user.email} has been lifted.`);
        onDone();
      }}
    >
      {user && (
        <>
          <UserSummary user={user} />
          <SuspensionNote user={user} />
          <p>The person can sign in again with their existing password and gets back the access of their role.</p>
        </>
      )}
    </ConfirmDialog>
  );
}

function AccountStatus({ user: u }) {
  if (u.suspended_at) return <Pill className="bg-red-50 text-red-800">Suspended</Pill>;
  if (!u.is_active) return <Pill className="bg-slate-800 text-white">Deactivated</Pill>;
  if (u.approval_status === 'pending') return <Pill className="bg-amber-50 text-amber-800">Awaiting approval</Pill>;
  if (u.approval_status === 'rejected') return <Pill className="bg-red-50 text-red-800">Declined</Pill>;
  return <Pill className="bg-emerald-50 text-emerald-800">Active</Pill>;
}
