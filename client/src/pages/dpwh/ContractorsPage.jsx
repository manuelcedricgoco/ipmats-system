import { Plus, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Checkbox, Field, Input, fieldErrors } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import RowActions from '../../components/common/RowActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { invalidateReference } from '../../hooks/useReference.js';
import { useRowBusy } from '../../hooks/useRowBusy.js';
import { api } from '../../lib/api.js';
import { pesoCompact } from '../../lib/format.js';

/** WEEK 1 — Contractor management: add, edit and view (Jonalyn Pagilagan, front-end). */
export default function ContractorsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('dpwh_personnel', 'admin');
  const canDelete = hasRole('admin');
  const toast = useToast();
  const { data, loading, error, reload } = useApi('/contractors', undefined, { select: (r) => r.data });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const detail = useApi(expanded ? `/contractors/${expanded}` : null, undefined, { select: (r) => r.data });
  const rows = useRowBusy();
  const colCount = canEdit ? 7 : 6;
  const rowActions = (c) => (
    <RowActions
      name={c.name}
      busy={rows.isBusy(c.id)}
      onEdit={canEdit ? () => setEditing(c) : undefined}
      onDelete={canDelete ? () => setDeleting(c) : undefined}
    />
  );

  return (
    <>
      <PageHeader
        eyebrow="Contractor Management"
        title="Contractors and project assignments"
        description="Contractor profiles (PCAB licence, contact details) with their assigned projects and total contract amount."
        actions={canEdit && <Button icon={Plus} onClick={() => setEditing({})}>Add contractor</Button>}
      />
      {loading && !data && <PageLoader withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <Card className="overflow-hidden">
          {/* Phones: one card per contractor (a directory is read top to bottom, not compared across columns). */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {data.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">No contractors found.</li>}
            {data.map((c) => (
              <li key={c.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} aria-expanded={expanded === c.id} className="text-left font-semibold text-slate-900 hover:text-brand-700 hover:underline">{c.name}</button>
                    {c.address && <p className="text-xs text-slate-500">{c.address}</p>}
                    {!c.is_active && <Pill className="mt-1 bg-slate-800 text-white">Inactive</Pill>}
                  </div>
                  {canEdit && <div className="-mr-2 shrink-0">{rowActions(c)}</div>}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><dt className="text-slate-500">PCAB licence</dt><dd className="font-mono text-slate-800">{c.pcab_license_no || '—'}{c.classification && <span className="font-sans text-slate-500"> · Cat. {c.classification}</span>}</dd></div>
                  <div><dt className="text-slate-500">Projects</dt><dd className="tabular-nums text-slate-800">{c.project_count} · {pesoCompact(c.total_contract)}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Contact</dt><dd className="break-words text-slate-700">{[c.contact_person, c.contact_number].filter(Boolean).join(' · ') || '—'}{c.email && <span className="block break-all">{c.email}</span>}</dd></div>
                  <div className="col-span-2"><dt className="sr-only">Status</dt><dd className="flex gap-3 tabular-nums"><span className="text-brand-700">{c.ongoing} on-going</span><span className="text-emerald-700">{c.completed} completed</span></dd></div>
                </dl>
                {expanded === c.id && (
                  <div className="mt-3 rounded-md bg-slate-50 p-2">
                    {detail.loading ? <p className="text-sm text-slate-500">Loading projects…</p> : detail.data?.projects.length ? (
                      <ul className="space-y-2">
                        {detail.data.projects.map((p) => (
                          <li key={p.id}><Link to={`/app/projects/${p.id}`} className="block rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200 hover:ring-brand-400"><span className="font-mono text-xs text-brand-700">{p.project_code}</span> {p.name}<span className="mt-1 block"><StatusBadge status={p.status} verifiedAt={p.completion_verified_at} /></span></Link></li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-500">No assigned projects.</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Contractor</th>
                  <th scope="col" className="px-4 py-3">PCAB licence</th>
                  <th scope="col" className="px-4 py-3">Contact</th>
                  <th scope="col" className="px-4 py-3 text-right">Projects</th>
                  <th scope="col" className="px-4 py-3 text-right">Total contracts</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  {canEdit && <th scope="col" className="w-px whitespace-nowrap px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-10 text-center text-sm text-slate-500">No contractors found.</td>
                  </tr>
                )}
                {data.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} aria-expanded={expanded === c.id} className="text-left font-semibold text-slate-900 hover:text-brand-700 hover:underline">{c.name}</button>
                        <span className="block text-xs text-slate-500">{c.address}</span>
                        {!c.is_active && <Pill className="mt-1 bg-slate-800 text-white">Inactive</Pill>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{c.pcab_license_no || '—'}<span className="block font-sans text-slate-500">{c.classification ? `Category ${c.classification}` : ''}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-600">{c.contact_person}<span className="block">{c.contact_number}</span><span className="block">{c.email}</span></td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.project_count}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pesoCompact(c.total_contract)}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="block whitespace-nowrap tabular-nums text-brand-700">{c.ongoing} on-going</span>
                        <span className="block whitespace-nowrap tabular-nums text-emerald-700">{c.completed} completed</span>
                      </td>
                      {canEdit && <td className="whitespace-nowrap px-4 py-3 text-right">{rowActions(c)}</td>}
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td colSpan={colCount} className="bg-slate-50 px-4 py-3">
                          {detail.loading ? <p className="text-sm text-slate-500">Loading projects…</p> : detail.data?.projects.length ? (
                            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {detail.data.projects.map((p) => (
                                <li key={p.id}><Link to={`/app/projects/${p.id}`} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200 hover:ring-brand-400"><span className="truncate"><span className="font-mono text-xs text-brand-700">{p.project_code}</span> {p.name}</span><StatusBadge status={p.status} verifiedAt={p.completion_verified_at} /></Link></li>
                              ))}
                            </ul>
                          ) : <p className="text-sm text-slate-500">No assigned projects.</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <ContractorModal value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidateReference(); reload(); }} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete contractor?"
        confirmLabel="Delete contractor"
        confirmIcon={Trash2}
        onConfirm={async () => {
          const c = deleting;
          await rows.run(c.id, () => api.del(`/contractors/${c.id}`));
          toast.success(`Contractor "${c.name}" deleted.`);
          setDeleting(null);
          if (expanded === c.id) setExpanded(null);
          invalidateReference();
          reload();
        }}
      >
        {deleting && (
          <>
            <dl className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="sr-only">Contractor</dt>
              <dd className="break-words font-semibold text-slate-900">{deleting.name}</dd>
              <dt className="sr-only">PCAB licence</dt>
              <dd className="text-xs text-slate-600">PCAB licence <span className="font-mono">{deleting.pcab_license_no || '—'}</span></dd>
            </dl>
            <p><strong>This cannot be undone.</strong> A contractor that is still assigned to projects cannot be deleted; edit it and untick "Active" instead.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

function ContractorModal({ value, onClose, onSaved }) {
  const toast = useToast();
  const open = value !== null;
  const editing = Boolean(value?.id);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setForm({ name: value.name || '', pcab_license_no: value.pcab_license_no || '', classification: value.classification || '', address: value.address || '', contact_person: value.contact_person || '', contact_number: value.contact_number || '', email: value.email || '', is_active: value.is_active ?? true });
      setErr(null);
    }
  }, [open, value]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fe = fieldErrors(err);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
    try {
      if (editing) await api.patch(`/contractors/${value.id}`, body);
      else await api.post('/contractors', body);
      toast.success(editing ? 'Contractor updated.' : 'Contractor added.');
      onSaved();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit contractor' : 'Add contractor'} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="contractor-form" loading={saving}>Save</Button></>}>
      <form id="contractor-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && !err.details && <Alert tone="error" className="sm:col-span-2">{err.message}</Alert>}
        <Field label="Company name" required error={fe.name} className="sm:col-span-2">{(a) => <Input {...a} value={form.name || ''} onChange={set('name')} required minLength={3} />}</Field>
        <Field label="PCAB licence no." error={fe.pcab_license_no}>{(a) => <Input {...a} value={form.pcab_license_no || ''} onChange={set('pcab_license_no')} />}</Field>
        <Field label="Category">{(a) => <Input {...a} value={form.classification || ''} onChange={set('classification')} placeholder="AAA, AA, A, B…" />}</Field>
        <Field label="Address" className="sm:col-span-2">{(a) => <Input {...a} value={form.address || ''} onChange={set('address')} />}</Field>
        <Field label="Contact person">{(a) => <Input {...a} value={form.contact_person || ''} onChange={set('contact_person')} />}</Field>
        <Field label="Contact number">{(a) => <Input {...a} value={form.contact_number || ''} onChange={set('contact_number')} />}</Field>
        <Field label="Email" error={fe.email} className="sm:col-span-2">{(a) => <Input {...a} type="email" value={form.email || ''} onChange={set('email')} />}</Field>
        <div className="sm:col-span-2"><Checkbox label="Active" description="Inactive contractors cannot be assigned to new projects." checked={Boolean(form.is_active)} onChange={set('is_active')} /></div>
      </form>
    </Modal>
  );
}
