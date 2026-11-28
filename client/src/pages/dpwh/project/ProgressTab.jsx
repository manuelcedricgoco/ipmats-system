import { ChevronDown, ClipboardList, Plus, Trash2, TrendingDown, TrendingUp, Wrench } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../../../components/common/Button.jsx';
import { Card, CardHeader, StatCard } from '../../../components/common/Card.jsx';
import { Alert, EmptyState, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Field, Input, Textarea } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import ProgressBar from '../../../components/common/ProgressBar.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { byLabel } from '../../../lib/contractor.js';
import { date, pct, todayIso } from '../../../lib/format.js';

/** Same formula as the API (server/src/services/completion.js): Σ(weight × accomplishment) ÷ Σ(weight). */
const weightedProgress = (rows) => {
  const total = rows.reduce((s, p) => s + Number(p.weight || 0), 0);
  return total ? rows.reduce((s, p) => s + Number(p.weight || 0) * Math.min(100, Math.max(0, Number(p.accomplishment || 0))), 0) / total : 0;
};

/** Server errors: the main message plus every detail the checks returned. */
function ServerError({ err, title }) {
  if (!err) return null;
  const details = (err.details || []).filter((d) => d.message !== err.message);
  return (
    <Alert tone="error" title={title}>
      <p>{err.message}</p>
      {details.length > 0 && <ul className="mt-1 list-disc pl-4">{details.map((d, i) => <li key={i}>{d.message}</li>)}</ul>}
    </Alert>
  );
}

/**
 * WEEK 2 — Phase-by-phase progress page (Tracy Ann Milaflores, front-end).
 * Shows each construction phase (weight, planned and actual dates, accomplishment),
 * overall vs planned completion, the progress report history, and the progress
 * update form used by DPWH personnel.
 */
export default function ProgressTab() {
  // canEdit: the phase plan (DPWH Personnel); canReport: progress reports (Personnel and the project's contractor, 029).
  const { project, reloadProject, canEdit, canReport, canConfirmCompletion } = useOutletContext();
  const toast = useToast();
  const phases = useApi(`/projects/${project.id}/phases`, undefined, { select: (r) => r.data });
  const history = useApi(`/projects/${project.id}/progress`, undefined, { select: (r) => r.data });
  const [reporting, setReporting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [openRow, setOpenRow] = useState(null);

  if (phases.loading && !phases.data) return <PageLoader label="Loading phases…" withHeader={false} />;
  if (phases.error) return <ErrorState error={phases.error} onRetry={phases.reload} />;
  const d = phases.data;
  const reports = history.data || [];

  const saved = (message) => {
    setReporting(false);
    setPlanning(false);
    toast.success(message);
    phases.reload();
    history.reload();
    reloadProject();
  };

  if (!d.phases.length) {
    return (
      <>
        <EmptyState
          icon={ClipboardList}
          title="No construction phases yet"
          description={canEdit ? 'Set up the phases from the approved program of work. A template for this project type is filled in for you.' : 'DPWH personnel have not set up the phases for this project yet.'}
          action={canEdit && <Button icon={Wrench} onClick={() => setPlanning(true)}>Set up phases</Button>}
        />
        <PhasePlanModal open={planning} onClose={() => setPlanning(false)} project={project} phases={d.template || []} isNew onSaved={() => saved('Phase plan saved.')} />
      </>
    );
  }

  const slipping = d.slippage < 0;
  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall completion" value={pct(d.overall_progress, 2)} hint="Weighted by phase" icon={TrendingUp} tone="green" />
        <StatCard label="Planned as of today" value={pct(d.planned_progress, 2)} hint="From the phase schedule" icon={ClipboardList} />
        <StatCard
          label="Slippage"
          value={`${d.slippage > 0 ? '+' : ''}${d.slippage.toFixed(2)} pts`}
          hint={slipping ? 'Behind schedule' : 'On or ahead of schedule'}
          icon={slipping ? TrendingDown : TrendingUp}
          tone={d.slippage < -10 ? 'red' : slipping ? 'yellow' : 'green'}
        />
        <StatCard label="Progress reports" value={reports.length} hint={reports[0] ? `Last: ${date(reports[0].report_date)}` : 'None yet'} icon={ClipboardList} tone="slate" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Construction phases"
          description="Overall completion = Σ (weight × accomplishment) ÷ 100. The black mark on each bar is where the schedule says the phase should be today."
          actions={
            (canEdit || canReport) && (
              <>
                {canEdit && <Button size="sm" variant="secondary" icon={Wrench} onClick={() => setPlanning(true)}>Edit phase plan</Button>}
                {canReport && <Button size="sm" icon={TrendingUp} onClick={() => setReporting(true)}>Submit progress update</Button>}
              </>
            )
          }
        />
        <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
        <div className="relative overflow-x-auto">
          <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Phase</th>
                <th scope="col" className="px-4 py-3 text-right">Weight</th>
                <th scope="col" className="px-4 py-3">Planned</th>
                <th scope="col" className="px-4 py-3">Actual</th>
                <th scope="col" className="w-56 px-4 py-3">Accomplishment</th>
                <th scope="col" className="px-4 py-3 text-right">Contributes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.phases.map((ph) => (
                <tr key={ph.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {ph.sequence_no}. {ph.name}
                    {ph.remarks && <span className="block text-xs font-normal text-slate-500">{ph.remarks}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{pct(ph.weight, 0)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{ph.planned_start ? `${date(ph.planned_start)} – ${date(ph.planned_end)}` : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {ph.actual_start ? `${date(ph.actual_start)} – ${ph.actual_end ? date(ph.actual_end) : 'ongoing'}` : <span className="text-slate-400">Not started</span>}
                  </td>
                  <td className="px-4 py-3"><ProgressBar value={ph.accomplishment} planned={phasePlannedToday(ph)} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{pct((ph.weight * ph.accomplishment) / 100, 2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="px-4 py-3">Overall</td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(d.phases.reduce((s, x) => s + Number(x.weight), 0), 0)}</td>
                <td colSpan={2} />
                <td className="px-4 py-3"><ProgressBar value={d.overall_progress} planned={d.planned_progress} status={project?.status} /></td>
                <td className="px-4 py-3 text-right tabular-nums">{pct(d.overall_progress, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Progress report history" description="Every update submitted by DPWH personnel or the contractor, newest first. Click a row to see the phases at that date." />
        {reports.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No progress reports yet.</p>
        ) : (
          <div className="relative max-h-[28rem] overflow-auto">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Report date</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Overall</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Change</th>
                  <th scope="col" className="px-4 py-2.5">Remarks</th>
                  <th scope="col" className="px-4 py-2.5">Submitted by</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((u, i) => {
                  const change = Number(u.overall_progress) - Number(reports[i + 1]?.overall_progress ?? 0);
                  const open = openRow === u.id;
                  return (
                    <Fragment key={u.id}>
                      <tr className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => setOpenRow(open ? null : u.id)}>
                        <td className="whitespace-nowrap px-4 py-2.5">{date(u.report_date)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{pct(u.overall_progress, 2)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${change > 0 ? 'text-emerald-700' : change < 0 ? 'text-red-700' : 'text-slate-400'}`}>
                          {change > 0 ? '+' : ''}{change.toFixed(2)}
                        </td>
                        <td className="max-w-xs px-4 py-2.5 text-slate-600">{u.remarks || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{byLabel(u.submitted_by_name, u.submitted_by_role)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button type="button" aria-expanded={open} aria-label="Show phases" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} className="bg-slate-50 px-4 py-3">
                            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {(u.phase_snapshot || []).map((s) => (
                                <li key={s.sequence_no} className="rounded-md bg-white px-3 py-2 text-xs ring-1 ring-slate-200">
                                  <span className="font-medium text-slate-800">{s.sequence_no}. {s.name}</span> <span className="text-slate-500">({s.weight}%)</span>
                                  <ProgressBar value={s.accomplishment} size="sm" className="mt-1.5" />
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProgressModal open={reporting} onClose={() => setReporting(false)} project={project} phases={d.phases} lastReport={reports[0]} canConfirmCompletion={canConfirmCompletion} onSaved={(r) => saved(`Progress update saved. Overall completion is now ${pct(r.overall_progress, 2)}.`)} />
      <PhasePlanModal open={planning} onClose={() => setPlanning(false)} project={project} phases={d.phases} onSaved={() => saved('Phase plan updated.')} />
    </div>
  );
}

/** Where a phase should be today according to its planned window. */
function phasePlannedToday(ph) {
  if (!ph.planned_start || !ph.planned_end) return null;
  const t = new Date(`${todayIso()}T00:00:00Z`);
  const s = new Date(`${ph.planned_start}T00:00:00Z`);
  const e = new Date(`${ph.planned_end}T00:00:00Z`);
  if (t <= s) return 0;
  if (t >= e) return 100;
  return ((t - s) / (e - s)) * 100;
}

/**
 * WEEK 2 — Progress update form for DPWH personnel (Tracy Ann Milaflores), also used by the project's contractor (029).
 * Only DPWH Personnel confirm completion (canConfirmCompletion), so a contractor never sends an actual completion date.
 */
function ProgressModal({ open, onClose, project, phases, lastReport, canConfirmCompletion = false, onSaved }) {
  const [rows, setRows] = useState([]);
  const [reportDate, setReportDate] = useState(todayIso());
  const [remarks, setRemarks] = useState('');
  const [completion, setCompletion] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!open) return;
    setRows(phases.map((ph) => ({ phase_id: ph.id, name: ph.name, weight: Number(ph.weight), previous: Number(ph.accomplishment), accomplishment: Number(ph.accomplishment) })));
    setReportDate(todayIso());
    setRemarks('');
    setCompletion(project.actual_completion_date || '');
    setErr(null);
  }, [open, phases, project]);

  const overall = weightedProgress(rows);
  const previous = weightedProgress(rows.map((r) => ({ ...r, accomplishment: r.previous })));
  const all100 = rows.length > 0 && rows.every((r) => Number(r.accomplishment) >= 100);
  const decreased = rows.some((r) => Number(r.accomplishment) < r.previous);
  const setAcc = (i, v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, accomplishment: v } : x)));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await api.post(`/projects/${project.id}/progress`, {
        report_date: reportDate,
        remarks: remarks.trim() || undefined,
        actual_completion_date: canConfirmCompletion && all100 && completion ? completion : undefined,
        // send only the phases that changed (at least one row is required)
        phases: (rows.filter((r) => Number(r.accomplishment) !== r.previous).length ? rows.filter((r) => Number(r.accomplishment) !== r.previous) : rows).map((r) => ({
          phase_id: r.phase_id,
          accomplishment: Number(r.accomplishment),
        })),
      });
      onSaved(res.data);
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
      size="lg"
      title="Submit progress update"
      description={lastReport ? `Last report: ${date(lastReport.report_date)} (${pct(lastReport.overall_progress, 2)})` : 'First progress report for this project'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="progress-form" loading={saving}>Save progress update</Button>
        </>
      }
    >
      <form id="progress-form" onSubmit={submit} className="space-y-4">
        <ServerError err={err} title="The update was not saved" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Report date" required hint="Cannot be in the future or before the last report">
            {(a) => <Input {...a} type="date" value={reportDate} max={todayIso()} min={lastReport?.report_date || project.notice_to_proceed || undefined} onChange={(e) => setReportDate(e.target.value)} required />}
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-md bg-brand-50 px-3 py-2">
              <p className="text-xs text-brand-700">Overall completion (computed)</p>
              <p className="text-xl font-bold tabular-nums text-brand-900">
                {overall.toFixed(2)}%
                {overall !== previous && <span className={`ml-2 text-sm ${overall > previous ? 'text-emerald-700' : 'text-red-700'}`}>{overall > previous ? '+' : ''}{(overall - previous).toFixed(2)}</span>}
              </p>
            </div>
          </div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Accomplishment per phase (%)</legend>
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {rows.map((r, i) => (
              <div key={r.phase_id} className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto]">
                <label htmlFor={`acc-${r.phase_id}`} className="text-sm">
                  <span className="font-medium text-slate-900">{r.name}</span>
                  <span className="block text-xs text-slate-500">weight {r.weight}% · last report {r.previous}%</span>
                </label>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={100} step={0.5} value={r.accomplishment} onChange={(e) => setAcc(i, e.target.value)} className="w-32 accent-brand-700" aria-label={`${r.name} slider`} />
                  <Input id={`acc-${r.phase_id}`} type="number" min={0} max={100} step="0.01" value={r.accomplishment} onChange={(e) => setAcc(i, e.target.value)} className="w-24 text-right" invalid={Number(r.accomplishment) < r.previous} />
                </div>
              </div>
            ))}
          </div>
        </fieldset>
        {all100 && !canConfirmCompletion && (
          <Alert tone="info">Every phase is at 100%. DPWH Personnel confirm the actual completion date and the final as-built 360° image.</Alert>
        )}
        {all100 && canConfirmCompletion && (
          <Field label="Actual completion date" hint="Every phase is at 100%. Enter the completion date; the project becomes Completed once a final as-built 360° image is also uploaded.">
            {(a) => <Input {...a} type="date" value={completion} max={todayIso()} onChange={(e) => setCompletion(e.target.value)} />}
          </Field>
        )}
        <Field label="Remarks" required={decreased} hint={decreased ? 'A phase is lower than the last report: explain the correction (at least 10 characters).' : 'Work done this period, issues, weather delays…'}>
          {/* not blocked here on purpose: the server rule (validationRules.js) answers if remarks are missing */}
          {(a) => <Textarea {...a} value={remarks} onChange={(e) => setRemarks(e.target.value)} invalid={decreased && remarks.trim().length < 10} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Set up or change the phase plan (names, weights, planned dates). Weights must total 100%. */
function PhasePlanModal({ open, onClose, project, phases, isNew = false, onSaved }) {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(phases.map((ph) => ({ id: ph.id, name: ph.name, weight: Number(ph.weight), planned_start: ph.planned_start || '', planned_end: ph.planned_end || '', accomplishment: Number(ph.accomplishment || 0) })));
    setErr(null);
  }, [open, phases]);
  const total = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
  const ok = Math.abs(total - 100) < 0.01;
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.put(`/projects/${project.id}/phases`, {
        phases: rows.map((r, i) => ({ ...(r.id ? { id: r.id } : {}), sequence_no: i + 1, name: r.name.trim(), weight: Number(r.weight), planned_start: r.planned_start || null, planned_end: r.planned_end || null })),
      });
      onSaved();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isNew ? 'Set up construction phases' : 'Edit phase plan'}
      description={`Follow the approved program of work. Dates must fall between the Notice to Proceed (${date(project.notice_to_proceed)}) and the target completion (${date(project.target_completion_date)}).`}
      footer={
        <>
          <span className={`mr-auto self-center text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-red-700'}`}>Total weight: {total.toFixed(2)}%</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!ok}>Save plan</Button>
        </>
      }
    >
      <ServerError err={err} title="The plan was not saved" />
      <div className="mt-3 space-y-3">
        <div className="hidden grid-cols-[2fr_90px_1fr_1fr_auto] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Phase</span><span>Weight %</span><span>Planned start</span><span>Planned end</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={r.id || `new-${i}`} className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[2fr_90px_1fr_1fr_auto]">
            <Input aria-label="Phase name" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} className="col-span-2 sm:col-span-1" />
            <Input aria-label="Weight %" type="number" min={0} max={100} step="0.01" value={r.weight} onChange={(e) => set(i, 'weight', e.target.value)} />
            <Input aria-label="Planned start" type="date" value={r.planned_start} onChange={(e) => set(i, 'planned_start', e.target.value)} />
            <Input aria-label="Planned end" type="date" value={r.planned_end} onChange={(e) => set(i, 'planned_end', e.target.value)} />
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              className="justify-self-end rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
              aria-label={`Remove ${r.name}`}
              disabled={rows.length === 1 || r.accomplishment > 0}
              title={r.accomplishment > 0 ? 'This phase already has reported progress' : undefined}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, { name: 'New phase', weight: 0, planned_start: '', planned_end: '', accomplishment: 0 }])}>
          Add phase
        </Button>
      </div>
    </Modal>
  );
}
