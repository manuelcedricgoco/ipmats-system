import { Pencil, Plus } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Checkbox, Field, Input, fieldErrors } from '../../components/common/Form.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { invalidateReference } from '../../hooks/useReference.js';
import { api } from '../../lib/api.js';
import { pesoCompact } from '../../lib/format.js';

/** WEEK 1 — Contractor management: add, edit and view (Jonalyn Pagilagan, front-end). */
export default function ContractorsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('dpwh_personnel', 'admin');
  const { data, loading, error, reload } = useApi('/contractors', undefined, { select: (r) => r.data });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const detail = useApi(expanded ? `/contractors/${expanded}` : null, undefined, { select: (r) => r.data });

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
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Contractor</th>
                  <th scope="col" className="px-4 py-3">PCAB licence</th>
                  <th scope="col" className="px-4 py-3">Contact</th>
                  <th scope="col" className="px-4 py-3 text-right">Projects</th>
                  <th scope="col" className="px-4 py-3 text-right">Total contracts</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                        <span className="block whitespace-nowrap tabular-nums text-brand-700">{c.ongoing} ongoing</span>
                        <span className="block whitespace-nowrap tabular-nums text-emerald-700">{c.completed} completed</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && <button type="button" onClick={() => setEditing(c)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></button>}
                      </td>
                    </tr>
                    {expanded === c.id && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-4 py-3">
                          {detail.loading ? <p className="text-sm text-slate-500">Loading projects…</p> : detail.data?.projects.length ? (
                            <ul className="grid gap-2 sm:grid-cols-2">
                              {detail.data.projects.map((p) => (
                                <li key={p.id}><Link to={`/app/projects/${p.id}`} className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200 hover:ring-brand-400"><span className="truncate"><span className="font-mono text-xs text-brand-700">{p.project_code}</span> {p.name}</span><StatusBadge status={p.status} /></Link></li>
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
      <form id="contractor-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
