import { ArrowLeft, CalendarClock, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, PageHeader } from '../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Input, Select, Textarea, fieldErrors } from '../../components/common/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useReference } from '../../hooks/useReference.js';
import { api } from '../../lib/api.js';
import { MANUAL_STATUSES, PROJECT_TYPES, STATUS_META } from '../../lib/constants.js';
import { date, peso } from '../../lib/format.js';

/** Target completion = Notice to Proceed + duration (calendar days). Same rule as the API. */
export const addDays = (d, n) => {
  if (!d || !n) return '';
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + Number(n));
  return x.toISOString().slice(0, 10);
};

const EMPTY = {
  project_code: '', name: '', description: '', project_type: 'road', agency_id: '', contractor_id: '', contract_ref_no: '',
  municipality_id: '', barangay_id: '', latitude: '', longitude: '', approved_budget: '', contract_amount: '',
  notice_to_proceed: '', duration_days: '', target_completion_date: '', actual_completion_date: '', fund_source: '', status: 'not_started',
};

/**
 * WEEK 1 — Project registration form (Tracy Ann Milaflores, front-end).
 * Captures the Objective 1 record: budget (ABC), contract amount, implementing
 * office/agency, contractor and duration. Saved through POST/PATCH /api/projects.
 */
export default function ProjectFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { ref } = useReference();
  const existing = useApi(editing ? `/projects/${id}` : null, undefined, { select: (r) => r.data });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const p = existing.data;
    if (p) setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? ''])));
  }, [existing.data]);

  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Choosing a place fills in its coordinates (the map picker comes in a later week).
      if (k === 'municipality_id') {
        next.barangay_id = '';
        const m = ref?.municipalities.find((x) => String(x.id) === v);
        if (m) Object.assign(next, { latitude: Number(m.latitude).toFixed(6), longitude: Number(m.longitude).toFixed(6) });
      }
      if (k === 'barangay_id') {
        const b = ref?.barangays.find((x) => String(x.id) === v);
        if (b?.latitude) Object.assign(next, { latitude: Number(b.latitude).toFixed(6), longitude: Number(b.longitude).toFixed(6) });
      }
      return next;
    });
  };

  const barangays = useMemo(() => (ref?.barangays || []).filter((b) => String(b.municipality_id) === String(form.municipality_id)), [ref, form.municipality_id]);
  const computedTarget = addDays(form.notice_to_proceed, form.duration_days);
  const fe = fieldErrors(err);
  const contractOverBudget = form.contract_amount !== '' && form.approved_budget !== '' && Number(form.contract_amount) > Number(form.approved_budget);
  const savings = form.contract_amount !== '' && form.approved_budget !== '' && !contractOverBudget ? Number(form.approved_budget) - Number(form.contract_amount) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (contractOverBudget) return setErr({ message: 'Contract amount cannot exceed the approved budget (ABC).' });
    setSaving(true);
    setErr(null);
    const num = (v) => (v === '' || v === null ? null : Number(v));
    const body = {
      project_code: form.project_code.trim(),
      name: form.name.trim(),
      description: form.description || null,
      project_type: form.project_type,
      agency_id: num(form.agency_id),
      contractor_id: form.contractor_id || null,
      contract_ref_no: form.contract_ref_no || null,
      municipality_id: num(form.municipality_id),
      barangay_id: num(form.barangay_id),
      latitude: num(form.latitude),
      longitude: num(form.longitude),
      approved_budget: num(form.approved_budget),
      contract_amount: num(form.contract_amount),
      notice_to_proceed: form.notice_to_proceed || null,
      duration_days: num(form.duration_days),
      target_completion_date: computedTarget || form.target_completion_date || null,
      actual_completion_date: form.actual_completion_date || null,
      fund_source: form.fund_source || null,
      status: form.status,
    };
    try {
      if (editing) {
        await api.patch(`/projects/${id}`, body);
        toast.success('Project record updated.');
        navigate(`/app/projects/${id}`);
      } else {
        const res = await api.post('/projects', body);
        toast.success(`Project ${res.data.project_code} registered.`);
        navigate(`/app/projects/${res.data.id}`);
      }
    } catch (e2) {
      setErr(e2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (editing && existing.loading) return <PageLoader />;
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={existing.reload} />;

  return (
    <form onSubmit={submit}>
      <Link to={editing ? `/app/projects/${id}` : '/app/projects'} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </Link>
      <div className="mt-3">
        <PageHeader
          eyebrow={editing ? 'Update project' : 'Project registration'}
          title={editing ? existing.data?.name : 'Register infrastructure project'}
          description="Enter the details from the approved project documents: implementing office, contractor, budget and contract duration."
          actions={<Button type="submit" icon={Save} loading={saving}>{editing ? 'Save changes' : 'Register project'}</Button>}
        />
      </div>

      {err && (
        <Alert tone="error" title="Please correct the highlighted fields" className="mb-6">
          {err.details?.length ? (
            <ul className="list-disc pl-4">{err.details.map((d) => <li key={d.field + d.message}>{d.field ? `${d.field}: ` : ''}{d.message}</li>)}</ul>
          ) : err.message}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Project information" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Project ID" required error={fe.project_code} hint="e.g. 26OM0123">
                {(a) => <Input {...a} value={form.project_code} onChange={set('project_code')} required pattern="[A-Za-z0-9\-]{3,40}" />}
              </Field>
              <Field label="Project type" required>
                {(a) => <Select {...a} value={form.project_type} onChange={set('project_type')}>{Object.entries(PROJECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
              </Field>
              <Field label="Project name" required error={fe.name} className="sm:col-span-2">
                {(a) => <Input {...a} value={form.name} onChange={set('name')} required minLength={5} />}
              </Field>
              <Field label="Description" className="sm:col-span-2">{(a) => <Textarea {...a} value={form.description} onChange={set('description')} />}</Field>
              <Field label="Implementing office / agency" required error={fe.agency_id} hint={<Link className="text-brand-700 hover:underline" to="/app/agencies">Manage offices</Link>}>
                {(a) => <Select {...a} value={form.agency_id} onChange={set('agency_id')} required><option value="">Select office</option>{ref?.agencies.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}
              </Field>
              <Field label="Contractor" error={fe.contractor_id} hint={<Link className="text-brand-700 hover:underline" to="/app/contractors">Manage contractors</Link>}>
                {(a) => <Select {...a} value={form.contractor_id} onChange={set('contractor_id')}><option value="">Not yet awarded</option>{ref?.contractors.filter((c) => c.is_active || c.id === form.contractor_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
              </Field>
              <Field label="Contract reference no.">{(a) => <Input {...a} value={form.contract_ref_no} onChange={set('contract_ref_no')} />}</Field>
              <Field label="Fund source">{(a) => <Input {...a} value={form.fund_source} onChange={set('fund_source')} placeholder="e.g. GAA 2026 – Regular Infrastructure" />}</Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Location" description="Choose the municipality and barangay; the coordinates are filled in automatically and must be within Occidental Mindoro." />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Municipality" required error={fe.municipality_id}>
                {(a) => <Select {...a} value={form.municipality_id} onChange={set('municipality_id')} required><option value="">Select municipality</option>{ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>}
              </Field>
              <Field label="Barangay" error={fe.barangay_id}>
                {(a) => <Select {...a} value={form.barangay_id} onChange={set('barangay_id')} disabled={!form.municipality_id}><option value="">Select barangay</option>{barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>}
              </Field>
              <Field label="Latitude" required error={fe.latitude}>{(a) => <Input {...a} type="number" step="0.000001" min="12" max="14" value={form.latitude} onChange={set('latitude')} required />}</Field>
              <Field label="Longitude" required error={fe.longitude}>{(a) => <Input {...a} type="number" step="0.000001" min="119.9" max="121.4" value={form.longitude} onChange={set('longitude')} required />}</Field>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Budget" />
            <CardBody className="space-y-4">
              <Field label="Approved budget (ABC, PHP)" required error={fe.approved_budget}>{(a) => <Input {...a} type="number" min="0" step="0.01" value={form.approved_budget} onChange={set('approved_budget')} required />}</Field>
              <Field label="Contract amount (PHP)" error={fe.contract_amount} hint="Leave blank until the contract is awarded">{(a) => <Input {...a} type="number" min="0" step="0.01" value={form.contract_amount} onChange={set('contract_amount')} invalid={contractOverBudget} />}</Field>
              {contractOverBudget && <Alert tone="error">The contract amount cannot be higher than the approved budget (ABC).</Alert>}
              {savings !== null && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900">Bid savings: <strong className="tabular-nums">{peso(savings)}</strong></p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Duration" />
            <CardBody className="space-y-4">
              <Field label="Notice to Proceed" error={fe.notice_to_proceed}>{(a) => <Input {...a} type="date" value={form.notice_to_proceed} onChange={set('notice_to_proceed')} />}</Field>
              <Field label="Contract duration (calendar days)" error={fe.duration_days}>{(a) => <Input {...a} type="number" min="1" max="3650" value={form.duration_days} onChange={set('duration_days')} />}</Field>
              {computedTarget ? (
                <div className="flex items-start gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-900">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>Target completion: <strong>{date(computedTarget)}</strong><span className="block text-xs text-brand-700">Notice to Proceed + {form.duration_days} days</span></span>
                </div>
              ) : (
                <Field label="Target completion" hint="Or enter the Notice to Proceed and duration to compute it">
                  {(a) => <Input {...a} type="date" value={form.target_completion_date} onChange={set('target_completion_date')} />}
                </Field>
              )}
              <Field label="Status" required>
                {(a) => <Select {...a} value={form.status} onChange={set('status')}>{MANUAL_STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</Select>}
              </Field>
              {(form.status === 'completed' || form.actual_completion_date) && (
                <Field label="Actual completion date" error={fe.actual_completion_date}>{(a) => <Input {...a} type="date" value={form.actual_completion_date || ''} onChange={set('actual_completion_date')} />}</Field>
              )}
            </CardBody>
          </Card>
          <Button type="submit" icon={Save} loading={saving} className="w-full">{editing ? 'Save changes' : 'Register project'}</Button>
        </div>
      </div>
    </form>
  );
}
