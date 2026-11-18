import { Banknote, Landmark, Plus, Scale, Trash2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pill } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/common/Card.jsx';
import { Alert, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Field, Input, Select, Textarea } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { RECORD_TYPE_CLS, RECORD_TYPE_HINTS, RECORD_TYPES } from '../../../lib/constants.js';
import { date, peso, pesoCompact, pct, todayIso } from '../../../lib/format.js';
import UtilizationBar from '../../../components/common/UtilizationBar.jsx';

/**
 * WEEK 2 — Project financial monitoring (Jonalyn Pagilagan, front-end).
 * Approved budget, contract amount (+ variation orders), disbursements and
 * remaining balance, with every financial record and the form to add one.
 */
export default function FinanceTab() {
  const { project, reloadProject, canEdit, canDelete } = useOutletContext();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/projects/${project.id}/finance`, undefined, { select: (r) => r.data });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [removing, setRemoving] = useState(null);

  if (loading && !data) return <PageLoader label="Loading financial records…" withHeader={false} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const s = data.summary;
  const records = [...data.records].reverse().filter((r) => !filter || r.record_type === filter);
  const gap = s.utilization_pct - s.physical_progress; // money paid ahead of work done

  const remove = async () => {
    try {
      await api.del(`/projects/${project.id}/finance/${removing.id}`);
      toast.success('Financial record deleted.');
      setRemoving(null);
      reload();
      reloadProject();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Approved budget (ABC)" value={pesoCompact(s.approved_budget)} hint={peso(s.approved_budget)} icon={Landmark} tone="slate" />
        <StatCard label="Contract amount" value={pesoCompact(s.revised_contract_amount)} hint={s.variation_orders ? `Original ${pesoCompact(s.contract_amount)} ${s.variation_orders > 0 ? '+' : '−'} VO ${pesoCompact(Math.abs(s.variation_orders))}` : peso(s.contract_amount)} icon={Scale} />
        <StatCard label="Disbursed" value={pesoCompact(s.total_disbursed)} hint={`${pct(s.utilization_pct)} of the contract`} icon={Banknote} tone="yellow" />
        <StatCard label="Remaining balance" value={pesoCompact(s.remaining_balance)} hint={peso(s.remaining_balance)} icon={Wallet} tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Fund utilization" description="How much of the contract amount has been paid" />
          <CardBody className="space-y-5">
            <UtilizationBar disbursed={s.total_disbursed} total={s.revised_contract_amount} />
            <dl className="divide-y divide-slate-100 text-sm">
              {[
                ['Approved budget (ABC)', s.approved_budget],
                ['Original contract amount', s.contract_amount],
                ['Variation orders', s.variation_orders],
                ['Revised contract amount', s.revised_contract_amount, true],
                ['Obligated', s.total_obligated],
                ['Disbursed', s.total_disbursed],
                ['Remaining balance', s.remaining_balance, true],
                ['Other expenses', s.total_expenses],
              ].map(([k, v, strong]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="text-slate-600">{k}</dt>
                  <dd className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{peso(v)}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Physical vs financial" description="Work done compared with money paid" />
          <CardBody className="space-y-4 text-sm">
            <Meter label="Physical accomplishment" value={s.physical_progress} cls="bg-emerald-600" />
            <Meter label="Fund utilization (disbursed)" value={s.utilization_pct} cls="bg-brand-600" />
            <div className="flex justify-between border-t border-slate-100 pt-3">
              <span className="text-slate-600">Difference</span>
              <span className={`font-bold tabular-nums ${gap > 20 ? 'text-red-700' : gap > 10 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {gap > 0 ? '+' : ''}{gap.toFixed(2)} pts
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {gap > 20 ? 'Payments are well ahead of the work done — check the billings.' : gap > 10 ? 'Payments are slightly ahead of the work done.' : 'Payments are in line with the work done.'}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Financial records"
          description={`${data.records.length} record(s): obligations, disbursements, variation orders and expenses — newest first`}
          actions={
            <>
              <Select aria-label="Filter by type" value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
                <option value="">All types</option>
                {Object.entries(RECORD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              {canEdit && <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add record</Button>}
            </>
          }
        />
        {records.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No financial records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Date</th>
                  <th scope="col" className="px-4 py-2.5">Type</th>
                  <th scope="col" className="px-4 py-2.5">Reference no.</th>
                  <th scope="col" className="px-4 py-2.5">Description</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Amount</th>
                  {canDelete && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5">{date(r.record_date)}</td>
                    <td className="px-4 py-2.5"><Pill className={RECORD_TYPE_CLS[r.record_type]}>{RECORD_TYPES[r.record_type]}</Pill></td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.reference_no || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.description || '—'}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${Number(r.amount) < 0 ? 'text-red-700' : ''}`}>{peso(r.amount)}</td>
                    {canDelete && (
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => setRemoving(r)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${r.reference_no || 'record'}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <RecordModal open={adding} onClose={() => setAdding(false)} project={project} summary={s} onSaved={() => { setAdding(false); toast.success('Financial record saved.'); reload(); reloadProject(); }} />
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Delete this financial record?"
        description={removing ? `${RECORD_TYPES[removing.record_type]} ${removing.reference_no || ''} · ${peso(removing.amount)}` : ''}
        footer={<><Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={remove}>Delete</Button></>}
      >
        <p className="text-sm text-slate-600">Only remove entries that were recorded by mistake. The totals are recomputed immediately.</p>
      </Modal>
    </div>
  );
}

function Meter({ label, value, cls }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="flex justify-between"><span className="text-slate-600">{label}</span><span className="font-semibold tabular-nums">{pct(value, 2)}</span></div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-[width] duration-500 ${cls}`} style={{ width: `${v}%` }} /></div>
    </div>
  );
}

const EMPTY = { record_type: 'disbursement', amount: '', record_date: todayIso(), reference_no: '', description: '' };

/** WEEK 2 — Add a financial record. The API checks it against the contract before saving. */
function RecordModal({ open, onClose, project, summary, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, record_date: todayIso() });
      setErr(null);
    }
  }, [open]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const amount = Number(form.amount || 0);
  const overBalance = form.record_type === 'disbursement' && amount > summary.remaining_balance;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/projects/${project.id}/finance`, {
        record_type: form.record_type,
        amount,
        record_date: form.record_date,
        reference_no: form.reference_no.trim() || null,
        description: form.description.trim() || null,
      });
      onSaved();
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  const details = (err?.details || []).filter((d) => d.message !== err?.message);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add financial record"
      description={`Remaining balance: ${peso(summary.remaining_balance)}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="finance-form" loading={saving}>Save record</Button></>}
    >
      <form id="finance-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {err && (
          <Alert tone="error" title="The record was not saved" className="sm:col-span-2">
            <p>{err.message}</p>
            {details.length > 0 && <ul className="mt-1 list-disc pl-4">{details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
          </Alert>
        )}
        <Field label="Type" required hint={RECORD_TYPE_HINTS[form.record_type]} className="sm:col-span-2">
          {(a) => <Select {...a} value={form.record_type} onChange={set('record_type')}>{Object.entries(RECORD_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        </Field>
        <Field label="Amount (PHP)" required>
          {(a) => <Input {...a} type="number" step="0.01" min={form.record_type === 'variation_order' ? undefined : '0.01'} value={form.amount} onChange={set('amount')} required invalid={overBalance} />}
        </Field>
        <Field label="Date" required>
          {(a) => <Input {...a} type="date" value={form.record_date} max={todayIso()} onChange={set('record_date')} required />}
        </Field>
        {overBalance && <Alert tone="warning" className="sm:col-span-2">This is more than the remaining balance of {peso(summary.remaining_balance)}. The system will not accept it.</Alert>}
        <Field label="Reference no." hint="e.g. DV-2026-11-0042, OB number or VO number" className="sm:col-span-2">
          {(a) => <Input {...a} value={form.reference_no} onChange={set('reference_no')} maxLength={80} />}
        </Field>
        <Field label="Description" className="sm:col-span-2">
          {(a) => <Textarea {...a} value={form.description} onChange={set('description')} rows={2} placeholder="e.g. Progress billing no. 5" />}
        </Field>
      </form>
    </Modal>
  );
}
