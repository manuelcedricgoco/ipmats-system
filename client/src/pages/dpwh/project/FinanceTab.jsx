import { Banknote, ChevronDown, Landmark, Plus, RotateCcw, Scale, ShieldCheck, Trash2, Upload, Wallet } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Pill } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/common/Card.jsx';
import ConfirmDialog from '../../../components/common/ConfirmDialog.jsx';
import { Alert, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Field, Input, Select, Textarea } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { RECORD_TYPE_CLS, RECORD_TYPE_HINTS, RECORD_TYPES } from '../../../lib/constants.js';
import { date, peso, pesoCompact, pct, todayIso } from '../../../lib/format.js';
import UtilizationBar from '../../../components/common/UtilizationBar.jsx';
import { LiquidationSummary, ReceiptList, RecordLiquidationCell } from '../../../components/finance/Liquidation.jsx';
import UploadReceiptModal from '../../../components/finance/UploadReceiptModal.jsx';
import { acceptsReceipts, checkReturnNote, receiptsToggleLabel } from '../../../lib/liquidation.js';

/**
 * WEEK 2 — Project financial monitoring (Jonalyn Pagilagan, front-end).
 * Approved budget, contract amount (+ variation orders), disbursements and
 * remaining balance, with every financial record and the form to add one.
 *
 * Finance liquidation (031): the liquidation summary, and for each disbursement / expense its liquidation status
 * and receipts. Upload (with the privacy reminder) follows the API's `permissions.can_upload_receipts` (DPWH
 * Personnel; a contractor on its own company's projects); Accept / Return `permissions.can_review_receipts`
 * (the Auditor); delete each receipt's `can_delete`. Only accepted receipts count as liquidated.
 */
export default function FinanceTab() {
  const { project, reloadProject, canEdit, canDelete } = useOutletContext();
  const toast = useToast();
  const { data, loading, error, reload } = useApi(`/projects/${project.id}/finance`, undefined, { select: (r) => r.data });
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [removing, setRemoving] = useState(null);
  const [open, setOpen] = useState(() => new Set()); // records whose receipts are shown
  const [uploadFor, setUploadFor] = useState(null); // the record a receipt is uploaded for
  const [review, setReview] = useState(null); // { receipt, decision: 'accept' | 'return' | 'delete' }
  const [note, setNote] = useState('');

  if (loading && !data) return <PageLoader label="Loading financial records…" withHeader={false} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const s = data.summary;
  const records = [...data.records].reverse().filter((r) => !filter || r.record_type === filter);
  const gap = s.utilization_pct - s.physical_progress; // money paid ahead of work done
  const perms = data.permissions || {};
  const liquidation = data.liquidation;
  const toggle = (id) => setOpen((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const cols = 8 + (canDelete ? 1 : 0);
  const startReview = (receipt, decision) => {
    setNote('');
    setReview({ receipt, decision });
  };
  // ConfirmDialog shows a thrown error (the API's message) and stays open.
  const decide = async () => {
    const { receipt, decision } = review;
    if (decision === 'delete') {
      await api.del(`/finance/receipts/${receipt.id}`);
      toast.success('Receipt deleted.');
    } else if (decision === 'accept') {
      await api.post(`/finance/receipts/${receipt.id}/accept`);
      toast.success('Receipt accepted. Its amount now counts as liquidated.');
    } else {
      await api.post(`/finance/receipts/${receipt.id}/return`, { note: note.trim() });
      toast.success('Receipt returned to the uploader.');
    }
    setReview(null);
    reload();
  };
  const noteProblem = review?.decision === 'return' ? checkReturnNote(note) : null;

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
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Approved budget (ABC)" value={pesoCompact(s.approved_budget)} hint={peso(s.approved_budget)} icon={Landmark} tone="slate" />
        <StatCard label="Contract amount" value={pesoCompact(s.revised_contract_amount)} hint={s.variation_orders ? `Original ${pesoCompact(s.contract_amount)} ${s.variation_orders > 0 ? '+' : '−'} VO ${pesoCompact(Math.abs(s.variation_orders))}` : peso(s.contract_amount)} icon={Scale} />
        <StatCard label="Disbursed" value={pesoCompact(s.total_disbursed)} hint={`${pct(s.utilization_pct)} of the contract`} icon={Banknote} tone="yellow" />
        <StatCard label="Remaining balance" value={pesoCompact(s.remaining_balance)} hint={peso(s.remaining_balance)} icon={Wallet} tone="green" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
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

      {liquidation && (
        <Card>
          <CardHeader
            title="Liquidation"
            description="How much of the money released is backed by receipts the Auditor accepted. Submitted and returned receipts do not count."
          />
          <CardBody>
            <LiquidationSummary liquidation={liquidation} />
          </CardBody>
        </Card>
      )}

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
          <>
          <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
          <div className="relative overflow-x-auto">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Date</th>
                  <th scope="col" className="px-4 py-2.5">Type</th>
                  <th scope="col" className="px-4 py-2.5">Phase</th>
                  <th scope="col" className="px-4 py-2.5">Reference no.</th>
                  <th scope="col" className="px-4 py-2.5">Description</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Amount</th>
                  <th scope="col" className="px-4 py-2.5">Liquidation</th>
                  <th scope="col" className="px-4 py-2.5">Receipts</th>
                  {canDelete && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const takesReceipts = acceptsReceipts(r.record_type);
                  const shown = open.has(r.id);
                  const receipts = r.receipts || [];
                  return (
                  <Fragment key={r.id}>
                  <tr className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2.5">{date(r.record_date)}</td>
                    <td className="px-4 py-2.5"><Pill className={RECORD_TYPE_CLS[r.record_type]}>{RECORD_TYPES[r.record_type]}</Pill></td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">{r.phase_name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.reference_no || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.description || '—'}</td>
                    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${Number(r.amount) < 0 ? 'text-red-700' : ''}`}>{peso(r.amount)}</td>
                    <td className="px-4 py-2.5"><RecordLiquidationCell liquidation={r.liquidation} /></td>
                    <td className="px-4 py-2.5">
                      {takesReceipts ? (
                        <button
                          type="button"
                          onClick={() => toggle(r.id)}
                          aria-expanded={shown}
                          aria-controls={`receipts-${r.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          {receiptsToggleLabel(receipts)}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${shown ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400" title="Obligations and variation orders take no receipt; their papers go in the Documents tab.">Not needed</span>
                      )}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => setRemoving(r)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${r.reference_no || 'record'}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                  {takesReceipts && shown && (
                    <tr id={`receipts-${r.id}`} className="bg-slate-50/70">
                      {/* !static: the sticky first column (phones) must not pin this full-width cell */}
                      <td colSpan={cols} className="!static !max-w-none !bg-slate-50 px-4 py-3 !shadow-none">
                        <div className="sticky left-4 max-w-[calc(100vw-4rem)] space-y-2 lg:max-w-none">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipts of {RECORD_TYPES[r.record_type].toLowerCase()} {r.reference_no || ''}</p>
                            {perms.can_upload_receipts && <Button size="sm" icon={Upload} onClick={() => setUploadFor(r)}>Upload receipt</Button>}
                          </div>
                          <ReceiptList
                            receipts={receipts}
                            canReview={perms.can_review_receipts}
                            onAccept={(x) => startReview(x, 'accept')}
                            onReturn={(x) => startReview(x, 'return')}
                            onDelete={(x) => startReview(x, 'delete')}
                            emptyText={perms.can_upload_receipts ? 'No receipts yet. Upload the receipts that show where this amount went.' : 'No receipts yet.'}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {data.by_phase?.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title="Financial allocation by phase" description="Obligations, disbursements and expenses recorded against each construction phase, next to the work done in that phase." />
          <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
          <div className="relative overflow-x-auto">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Phase</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Weight</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Work done</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Obligated</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Disbursed</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Expenses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.by_phase.map((ph) => (
                  <tr key={ph.phase_id || 'none'} className={ph.phase_id ? '' : 'bg-slate-50 text-slate-500'}>
                    <td className="px-4 py-2.5 font-medium">{ph.sequence_no ? `${ph.sequence_no}. ` : ''}{ph.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{ph.weight != null ? pct(ph.weight, 0) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{ph.accomplishment != null ? pct(ph.accomplishment, 1) : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(ph.obligated)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums">{peso(ph.disbursed)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{peso(ph.expenses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <RecordModal open={adding} onClose={() => setAdding(false)} project={project} summary={s} phases={(data.by_phase || []).filter((p) => p.phase_id)} onSaved={() => { setAdding(false); toast.success('Financial record saved.'); reload(); reloadProject(); }} />
      <UploadReceiptModal
        open={Boolean(uploadFor)}
        onClose={() => setUploadFor(null)}
        projectId={project.id}
        record={uploadFor}
        onDone={() => {
          setUploadFor(null);
          toast.success('Receipt uploaded. It counts as liquidated once the Auditor accepts it.');
          reload();
        }}
      />
      <ConfirmDialog
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={review?.decision === 'accept' ? 'Accept this receipt?' : review?.decision === 'return' ? 'Return this receipt?' : 'Delete this receipt?'}
        description={review ? `${peso(review.receipt.amount)} · receipt date ${date(review.receipt.receipt_date)}` : ''}
        confirmLabel={review?.decision === 'accept' ? 'Accept' : review?.decision === 'return' ? 'Return' : 'Delete'}
        confirmVariant={review?.decision === 'accept' ? 'primary' : 'danger'}
        confirmIcon={review?.decision === 'accept' ? ShieldCheck : review?.decision === 'return' ? RotateCcw : Trash2}
        confirmDisabled={Boolean(noteProblem)}
        onConfirm={decide}
      >
        {review?.decision === 'accept' && <p>An accepted receipt counts as liquidated, is shown to the public and can no longer be changed or deleted.</p>}
        {review?.decision === 'delete' && <p>The file is removed as well. This cannot be undone.</p>}
        {review?.decision === 'return' && (
          <Field label="Reason for returning" required hint="Tell the uploader what to fix (5–500 characters). They can upload a new receipt." error={note.trim() ? noteProblem : null}>
            {(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} autoFocus />}
          </Field>
        )}
      </ConfirmDialog>
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Delete this financial record?"
        description={removing ? `${RECORD_TYPES[removing.record_type]} ${removing.reference_no || ''} · ${peso(removing.amount)}` : ''}
        footer={<><Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={remove}>Delete</Button></>}
      >
        <p className="text-sm text-slate-600">Only remove entries that were recorded by mistake. The totals are recomputed immediately.{removing?.receipts?.length ? ` Its ${removing.receipts.length} receipt(s) are deleted with it, accepted ones included.` : ''}</p>
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

const EMPTY = { record_type: 'disbursement', amount: '', record_date: todayIso(), reference_no: '', description: '', phase_id: '' };

/** WEEK 2 — Add a financial record. The API checks it against the contract before saving. */
function RecordModal({ open, onClose, project, summary, phases = [], onSaved }) {
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
        phase_id: form.record_type === 'variation_order' ? null : form.phase_id || null,
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
      <form id="finance-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        {form.record_type !== 'variation_order' && (
          <Field label="Construction phase" hint="Optional: the phase this amount is for (financial allocation per phase)." className="sm:col-span-2">
            {(a) => (
              <Select {...a} value={form.phase_id} onChange={set('phase_id')}>
                <option value="">Whole project / not phase-specific</option>
                {phases.map((p) => <option key={p.phase_id} value={p.phase_id}>{p.sequence_no}. {p.name}</option>)}
              </Select>
            )}
          </Field>
        )}
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
