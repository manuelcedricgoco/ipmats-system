import { Landmark, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Pill } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { Alert, EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Input, Select, fieldErrors } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import RowActions from '../../components/common/RowActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { invalidateReference } from '../../hooks/useReference.js';
import { useRowBusy } from '../../hooks/useRowBusy.js';
import { api } from '../../lib/api.js';
import { pesoCompact } from '../../lib/format.js';
import { OFFICE_TYPES } from '../../lib/constants.js';


/** Implementing offices / agencies: view all, add and edit (System Administrator). */
/** WEEK 1 — Office / agency management: add, edit and view (Jonalyn Pagilagan, front-end). */
export default function AgenciesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin');
  const toast = useToast();
  const ref = useApi('/reference', undefined, { select: (r) => r.data.agencies });
  const projects = useApi('/projects', { pageSize: 100 }, { select: (r) => r.data });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const rows = useRowBusy();
  const isActive = (a) => a.is_active !== false;
  const rowActions = (a) => (
    <RowActions
      name={a.name}
      busy={rows.isBusy(a.id)}
      onEdit={() => setEditing(a)}
      onDelete={() => setDeleting(a)}
    />
  );

  // Projects and contract totals per office (only projects the user may see).
  const stats = useMemo(() => {
    const m = new Map();
    for (const p of projects.data || []) {
      const s = m.get(p.agency_id) || { count: 0, total: 0 };
      s.count += 1;
      s.total += Number(p.contract_amount || 0);
      m.set(p.agency_id, s);
    }
    return m;
  }, [projects.data]);

  return (
    <>
      <PageHeader
        eyebrow="Agency Management"
        title="Offices and agencies"
        description="Implementing offices responsible for infrastructure projects in Occidental Mindoro."
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Add office</Button>}
      />
      {ref.loading && !ref.data && <PageLoader withHeader={false} />}
      {ref.error && <ErrorState error={ref.error} onRetry={ref.reload} />}
      {ref.data && ref.data.length === 0 && <EmptyState icon={Landmark} title="No offices yet" action={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Add office</Button>} />}
      {ref.data && ref.data.length > 0 && (
        <Card className="overflow-hidden">
          {/* Phones: one card per office. */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {ref.data.map((a) => {
              const s = stats.get(a.id) || { count: 0, total: 0 };
              return (
                <li key={a.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{a.name}</p>
                      <p className="font-mono text-xs text-brand-700">{a.code}</p>
                      {!isActive(a) && <Pill className="mt-1 bg-slate-800 text-white">Inactive</Pill>}
                    </div>
                    {canEdit && <div className="-mr-2 shrink-0">{rowActions(a)}</div>}
                  </div>
                  <Pill className="mt-2 bg-brand-50 text-brand-800">{OFFICE_TYPES[a.office_type] || a.office_type}</Pill>
                  {a.address && <p className="mt-2 text-xs text-slate-600">{a.address}</p>}
                  <p className="mt-2 text-xs tabular-nums text-slate-700">{s.count} project(s) · {pesoCompact(s.total)} total contracts</p>
                </li>
              );
            })}
          </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Office</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3">Address</th>
                  <th scope="col" className="px-4 py-3 text-right">Projects</th>
                  <th scope="col" className="px-4 py-3 text-right">Total contracts</th>
                  {canEdit && <th scope="col" className="w-px whitespace-nowrap px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ref.data.map((a) => {
                  const s = stats.get(a.id) || { count: 0, total: 0 };
                  return (
                    <tr key={a.id} className={`hover:bg-brand-50/40 ${isActive(a) ? '' : 'bg-slate-50 text-slate-500'}`}>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-slate-900">{a.name}</span>
                        <span className="font-mono text-xs text-brand-700">{a.code}</span>
                        {!isActive(a) && <Pill className="ml-2 bg-slate-800 text-white">Inactive</Pill>}
                      </td>
                      <td className="px-4 py-3"><Pill className="bg-brand-50 text-brand-800">{OFFICE_TYPES[a.office_type] || a.office_type}</Pill></td>
                      <td className="px-4 py-3 text-slate-600">{a.address || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.count}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pesoCompact(s.total)}</td>
                      {canEdit && <td className="whitespace-nowrap px-4 py-3 text-right">{rowActions(a)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {!canEdit && ref.data && <p className="mt-3 text-xs text-slate-500">Only the System Administrator can add, edit, suspend or delete offices.</p>}
      <AgencyModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          invalidateReference();
          ref.reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete office?"
        confirmLabel="Delete office"
        confirmIcon={Trash2}
        onConfirm={async () => {
          const a = deleting;
          await rows.run(a.id, () => api.del(`/agencies/${a.id}`));
          toast.success(`Office "${a.name}" deleted.`);
          setDeleting(null);
          invalidateReference();
          ref.reload();
        }}
      >
        {deleting && (
          <>
            <dl className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="sr-only">Office</dt>
              <dd className="break-words font-semibold text-slate-900">{deleting.name}</dd>
              <dt className="sr-only">Code</dt>
              <dd className="font-mono text-xs text-brand-700">{deleting.code}</dd>
            </dl>
            <p><strong>This cannot be undone.</strong> An office that is used by projects or has user accounts cannot be deleted; move them to another office first.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function AgencyModal({ value, onClose, onSaved }) {
  const toast = useToast();
  const open = value !== null;
  const editing = Boolean(value?.id);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setForm({ code: value.code || '', name: value.name || '', office_type: value.office_type || 'district_engineering_office', address: value.address || '' });
      setErr(null);
    }
  }, [open, value]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fe = fieldErrors(err);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const body = { code: form.code.trim().toUpperCase(), name: form.name.trim(), office_type: form.office_type, address: form.address.trim() || null };
    try {
      if (editing) await api.patch(`/agencies/${value.id}`, body);
      else await api.post('/agencies', body);
      toast.success(editing ? 'Office updated.' : 'Office added.');
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
      title={editing ? 'Edit office' : 'Add office'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="agency-form" loading={saving}>Save</Button></>}
    >
      <form id="agency-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && !err.details && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        <Field label="Code" required error={fe.code} hint="Letters, digits and dashes, e.g. DPWH-OMDEO">
          {(a) => <Input {...a} value={form.code || ''} onChange={set('code')} required minLength={2} maxLength={30} pattern="[A-Za-z0-9-]+" />}
        </Field>
        <Field label="Office type" required>
          {(a) => (
            <Select {...a} value={form.office_type} onChange={set('office_type')}>
              {Object.entries(OFFICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Office name" required error={fe.name} className="sm:col-span-2">
          {(a) => <Input {...a} value={form.name || ''} onChange={set('name')} required minLength={3} maxLength={200} />}
        </Field>
        <Field label="Address" className="sm:col-span-2">{(a) => <Input {...a} value={form.address || ''} onChange={set('address')} maxLength={300} />}</Field>
      </form>
    </Modal>
  );
}
