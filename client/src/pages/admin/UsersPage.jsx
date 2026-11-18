import { Check, Clock3, Pencil, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pill } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Checkbox, Field, Input, Select, Textarea, fieldErrors } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useReference } from '../../hooks/useReference.js';
import { api } from '../../lib/api.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { date, dateTime } from '../../lib/format.js';

/** WEEK 1 — User accounts and role-based access (admin). Approves sign-ups from the Register page. */
export default function UsersPage() {
  const { profile } = useAuth();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi('/users', { role, search: q, page, pageSize: 50 });
  const [editing, setEditing] = useState(null);
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
      <PageHeader eyebrow="User Management" title="Accounts, roles and access" description="Approve access requests from the Register page, and create, update or deactivate staff accounts (role-based access)." actions={<Button icon={UserPlus} onClick={() => setEditing({})}>Create account</Button>} />
      {pending.length > 0 && (
        <Card className="mb-6 overflow-hidden border-amber-200">
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3">
            <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />
            <h2 className="text-sm font-semibold text-amber-900">Access requests</h2>
            <span className="rounded-full bg-amber-200 px-2 text-xs font-semibold text-amber-900">{pending.length}</span>
            <span className="ml-auto hidden text-xs text-amber-800 sm:block">New sign-ups have no staff access until approved.</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{u.full_name || u.email}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Requests <strong>{ROLE_LABELS[u.requested_role] || '—'}</strong>
                    {u.agency?.name ? ` · ${u.agency.name}` : ''}
                    {u.position ? ` · ${u.position}` : ''} · {dateTime(u.requested_at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" icon={Check} onClick={() => setApproving(u)}>Approve</Button>
                  <Button size="sm" variant="secondary" icon={X} onClick={() => setDeclining(u)}>Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input type="search" aria-label="Search users" placeholder="Search by name or email" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select aria-label="Role" className="sm:w-56" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </Card>
      {loading && !data && <PageLoader withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Office</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Created</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((u) => (
                  <tr key={u.id} className={u.is_active ? '' : 'bg-slate-50 text-slate-500'}>
                    <td className="px-4 py-3"><span className="font-semibold text-slate-900">{u.full_name || '—'}</span>{u.id === profile.id && <span className="ml-1 text-xs text-slate-500">(you)</span>}<span className="block text-xs text-slate-500">{u.email}</span></td>
                    <td className="px-4 py-3">{ROLE_LABELS[u.role]}<span className="block text-xs text-slate-500">{u.position}</span></td>
                    <td className="px-4 py-3 text-xs">{u.agency?.name || '—'}</td>
                    <td className="px-4 py-3">
                      {!u.is_active ? (
                        <Pill className="bg-slate-800 text-white">Deactivated</Pill>
                      ) : u.approval_status === 'pending' ? (
                        <Pill className="bg-amber-50 text-amber-800">Awaiting approval</Pill>
                      ) : u.approval_status === 'rejected' ? (
                        <Pill className="bg-red-50 text-red-800">Declined</Pill>
                      ) : (
                        <Pill className="bg-emerald-50 text-emerald-800">Active</Pill>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs">{date(u.created_at)}</td>
                    <td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditing(u)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${u.email}`}><Pencil className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}
      <UserModal value={editing} self={profile} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reloadAll(); }} />
      <ApproveModal user={approving} onClose={() => setApproving(null)} onSaved={() => { setApproving(null); reloadAll(); }} />
      <DeclineModal user={declining} onClose={() => setDeclining(null)} onSaved={() => { setDeclining(null); reloadAll(); }} />
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
      setForm({ email: value.email || '', password: '', full_name: value.full_name || '', role: value.role || 'dpwh_personnel', agency_id: value.agency_id || '', position: value.position || '', is_active: value.is_active ?? true });
      setErr(null);
    }
  }, [open, value]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fe = fieldErrors(err);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (editing) {
        await api.patch(`/users/${value.id}`, { full_name: form.full_name, role: form.role, agency_id: form.agency_id || null, position: form.position || null, is_active: form.is_active });
      } else {
        await api.post('/users', { email: form.email, password: form.password, full_name: form.full_name, role: form.role, agency_id: form.agency_id || null, position: form.position || null });
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
      <form id="user-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {err && !err.details && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        {!editing && (
          <>
            <Field label="Email" required error={fe.email}>{(a) => <Input {...a} type="email" value={form.email} onChange={set('email')} required autoComplete="off" />}</Field>
            <Field label="Temporary password" required error={fe.password} hint="At least 8 characters">{(a) => <Input {...a} type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />}</Field>
          </>
        )}
        <Field label="Full name" required error={fe.full_name} className="sm:col-span-2">{(a) => <Input {...a} value={form.full_name} onChange={set('full_name')} required minLength={2} />}</Field>
        <Field label="Role" required hint={isSelf ? 'You cannot change your own role.' : undefined}>
          {(a) => (
            <Select {...a} value={form.role} onChange={set('role')} disabled={isSelf}>
              {Object.entries(ROLE_LABELS)
                .filter(([k]) => k !== 'public' || value?.role === 'public')
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Office">{(a) => <Select {...a} value={form.agency_id} onChange={set('agency_id')}><option value="">None</option>{ref?.agencies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
        <Field label="Position" className="sm:col-span-2">{(a) => <Input {...a} value={form.position} onChange={set('position')} />}</Field>
        {editing && !isSelf && <div className="sm:col-span-2"><Checkbox label="Account active" description="Deactivated users cannot sign in or use the API." checked={Boolean(form.is_active)} onChange={set('is_active')} /></div>}
      </form>
    </Modal>
  );
}

function ApproveModal({ user, onClose, onSaved }) {
  const toast = useToast();
  const { ref } = useReference();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (user) {
      setForm({ role: user.requested_role || 'dpwh_personnel', agency_id: user.agency_id || '', position: user.position || '' });
      setErr(null);
    }
  }, [user]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/approve`, { role: form.role, agency_id: form.agency_id || null, position: form.position || null });
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
      <form id="approve-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {err && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        <Field label="Role to grant" required hint={user?.requested_role ? `Requested: ${ROLE_LABELS[user.requested_role]}` : undefined}>
          {(a) => (
            <Select {...a} value={form.role} onChange={set('role')}>
              <option value="dpwh_personnel">DPWH Personnel</option>
              <option value="auditor">Auditor</option>
              <option value="admin">System Administrator</option>
            </Select>
          )}
        </Field>
        <Field label="Office">
          {(a) => <Select {...a} value={form.agency_id} onChange={set('agency_id')}><option value="">None</option>{ref?.agencies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}
        </Field>
        <Field label="Position" className="sm:col-span-2">{(a) => <Input {...a} value={form.position} onChange={set('position')} />}</Field>
        <Alert className="sm:col-span-2">Verify the person&rsquo;s identity and designation with their DPWH office before granting access.</Alert>
      </form>
    </Modal>
  );
}

function DeclineModal({ user, onClose, onSaved }) {
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
      await api.post(`/users/${user.id}/reject`, { note: note || null });
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
