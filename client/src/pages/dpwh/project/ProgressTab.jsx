import { ChevronDown, ClipboardList, Images, ListTree, Lock, Plus, Trash2, TrendingDown, TrendingUp, Wrench, X } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Button from '../../../components/common/Button.jsx';
import { Card, CardHeader, StatCard } from '../../../components/common/Card.jsx';
import { Alert, EmptyState, ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { Field, Input, Textarea } from '../../../components/common/Form.jsx';
import Modal from '../../../components/common/Modal.jsx';
import ProgressBar from '../../../components/common/ProgressBar.jsx';
import ReferencePhotosInput from '../../../components/progress/ReferencePhotosInput.jsx';
import ReportPhotos, { SnapshotBreakdown } from '../../../components/progress/ReportPhotos.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { byLabel } from '../../../lib/contractor.js';
import { date, pct, todayIso } from '../../../lib/format.js';
import {
  ACTIVITY_WEIGHTS_MESSAGE,
  DESCRIPTION_MAX,
  VERIFIED_LOCK_MESSAGE,
  activityProgress,
  activityWeightTotal,
  activityWeightsOk,
  formRowProgress,
  officialProgress,
  phasePlanPayload,
  phasePlanReady,
  progressDecreased,
  progressFormProblem,
  progressFormRows,
  progressPayloadPhases,
  weightedProgress,
} from '../../../lib/progress.js';

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
 * Shows each construction phase (weight, planned and actual dates, accomplishment, sub-activities),
 * overall vs planned completion, the progress report history (description, reference photos and the
 * breakdown at that date), and the progress update form used by DPWH personnel and the contractor.
 * Progress rules (030): a verified project is locked (no reports, no plan changes).
 */
export default function ProgressTab() {
  // canEdit: the phase plan (DPWH Personnel); canReport: progress reports (Personnel and the project's contractor, 029).
  const { project, reloadProject, canEdit: canEditPlan, canReport: canReportAny, canConfirmCompletion, locked: projectLocked } = useOutletContext();
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
  const locked = Boolean(projectLocked || d.locked);
  const canEdit = canEditPlan && !locked;
  const canReport = canReportAny && !locked;

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
      {locked && (
        <Alert tone="info" title="Completed – verified">
          <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden />{VERIFIED_LOCK_MESSAGE}</span>
        </Alert>
      )}
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Overall completion" value={pct(d.overall_progress, 2)} hint={d.completion_label || 'Weighted by phase'} icon={TrendingUp} tone="green" />
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
      {d.completion_label && !locked && (
        <Alert tone="info" title={d.completion_label}>
          Every completion requirement is met. The project shows at most 99% until both the Auditor and PACC verify its completion (Flag & audit tab).
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Construction phases"
          description="Overall completion = Σ (weight × accomplishment) ÷ 100. A phase with sub-activities takes its % from them. The black mark on each bar is where the schedule says the phase should be today."
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
                <Fragment key={ph.id}>
                  <tr className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {ph.sequence_no}. {ph.name}
                      {ph.activities?.length > 0 && <span className="block text-xs font-normal text-slate-500">Computed from {ph.activities.length} sub-activit{ph.activities.length === 1 ? 'y' : 'ies'}</span>}
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
                  {(ph.activities || []).map((a) => (
                    <tr key={a.id} className="bg-slate-50/60 text-xs">
                      <td className="py-2 pl-10 pr-4 text-slate-700"><ListTree className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" aria-hidden />{a.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500" title="Share of the phase">{pct(a.weight, 2)} of phase</td>
                      <td colSpan={2} />
                      <td className="px-4 py-2"><ProgressBar value={a.accomplishment} size="sm" /></td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">{pct((a.weight * a.accomplishment) / 100, 2)} of phase</td>
                    </tr>
                  ))}
                </Fragment>
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
        <CardHeader
          title="Progress report history"
          description="Every update submitted by DPWH personnel or the contractor, newest first. Click a row to see the work done, the reference photos and the phases at that date. Photo links open for one hour; reload the page for fresh links."
        />
        {reports.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No progress reports yet.</p>
        ) : (
          <div className="relative max-h-[36rem] overflow-auto">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Report date</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Overall</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Change</th>
                  <th scope="col" className="px-4 py-2.5">Work done</th>
                  <th scope="col" className="px-4 py-2.5">Submitted by</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((u, i) => {
                  const change = Number(u.overall_progress) - Number(reports[i + 1]?.overall_progress ?? 0);
                  const open = openRow === u.id;
                  const photos = u.photos || [];
                  return (
                    <Fragment key={u.id}>
                      <tr className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => setOpenRow(open ? null : u.id)}>
                        <td className="whitespace-nowrap px-4 py-2.5">{date(u.report_date)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{pct(u.overall_progress, 2)}</td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${change > 0 ? 'text-emerald-700' : change < 0 ? 'text-red-700' : 'text-slate-400'}`}>
                          {change > 0 ? '+' : ''}{change.toFixed(2)}
                        </td>
                        <td className="max-w-xs px-4 py-2.5 text-slate-600">
                          <span className="line-clamp-2">{u.description || u.remarks || '—'}</span>
                          {photos.length > 0 && <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-500"><Images className="h-3.5 w-3.5" aria-hidden />{photos.length} reference photo{photos.length === 1 ? '' : 's'}</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">{byLabel(u.submitted_by_name, u.submitted_by_role)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button type="button" aria-expanded={open} aria-label="Show details" className="rounded p-1 text-slate-400 hover:bg-slate-100">
                            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={6} className="space-y-3 bg-slate-50 px-4 py-3">
                            {u.description && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Work done</p>
                                <p className="mt-0.5 whitespace-pre-line break-words text-slate-800">{u.description}</p>
                              </div>
                            )}
                            {u.remarks && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remarks</p>
                                <p className="mt-0.5 whitespace-pre-line break-words text-slate-700">{u.remarks}</p>
                              </div>
                            )}
                            {photos.length > 0 && (
                              <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reference photos</p>
                                <ReportPhotos photos={photos} />
                              </div>
                            )}
                            <SnapshotBreakdown phases={u.phase_snapshot || []} activities={u.activity_snapshot || []} />
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

/** % slider + number input used for a phase or a sub-activity. */
function PercentInput({ id, label, value, previous, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={0} max={100} step={0.5} value={value} onChange={(e) => onChange(e.target.value)} className="w-32 accent-brand-700" aria-label={`${label} slider`} />
      <Input id={id} type="number" min={0} max={100} step="0.01" value={value} onChange={(e) => onChange(e.target.value)} className="w-24 text-right" invalid={Number(value) < previous} />
    </div>
  );
}

/**
 * WEEK 2 — Progress update form for DPWH personnel (Tracy Ann Milaflores), also used by the project's contractor (029).
 * Only DPWH Personnel confirm completion (canConfirmCompletion), so a contractor never sends an actual completion date.
 * 030: a phase with sub-activities is reported per sub-activity (its % is computed and shown read-only); every report
 * has a description of the work done and 1–5 reference photos (multipart: the fields as JSON in "payload").
 */
export function ProgressModal({ open, onClose, project, phases, lastReport, canConfirmCompletion = false, onSaved }) {
  const [rows, setRows] = useState(() => progressFormRows(phases));
  const [reportDate, setReportDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [remarks, setRemarks] = useState('');
  const [completion, setCompletion] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) {
      setFiles([]); // closing the form drops the photos (their previews are revoked)
      return;
    }
    setRows(progressFormRows(phases));
    setReportDate(todayIso());
    setDescription('');
    setRemarks('');
    setCompletion(project.actual_completion_date || '');
    setFiles([]);
    setErr(null);
    setTried(false);
  }, [open, phases, project]);

  const shown = rows.map((r) => ({ ...r, accomplishment: formRowProgress(r) }));
  const computed = weightedProgress(shown);
  // What will be stored and shown: at most 99% until the Auditor and PACC verify (030).
  const overall = officialProgress(computed, project.completion_verified_at);
  const previous = officialProgress(weightedProgress(rows.map((r) => ({ ...r, accomplishment: r.previous }))), project.completion_verified_at);
  const all100 = shown.length > 0 && shown.every((r) => Number(r.accomplishment) >= 100);
  const decreased = progressDecreased(rows);
  const problem = progressFormProblem({ description, files });
  const setAcc = (i, v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, accomplishment: v } : x)));
  const setActAcc = (i, k, v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, activities: x.activities.map((a, n) => (n === k ? { ...a, accomplishment: v } : a)) } : x)));

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (problem) {
      setErr({ message: problem });
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append(
        'payload',
        JSON.stringify({
          report_date: reportDate,
          description: description.trim(),
          remarks: remarks.trim() || undefined,
          actual_completion_date: canConfirmCompletion && all100 && completion ? completion : undefined,
          phases: progressPayloadPhases(rows),
        }),
      );
      files.forEach((f) => fd.append('photos', f));
      const res = await api.post(`/projects/${project.id}/progress`, fd);
      onSaved(res.data);
    } catch (e2) {
      setErr(e2);
    } finally {
      setSaving(false);
    }
  };

  const descLen = description.trim().length;
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
              {overall < computed && (
                <p className="text-[11px] text-brand-700">Computed {computed.toFixed(2)}%; shown as 99% until the Auditor and PACC verify the completion.</p>
              )}
            </div>
          </div>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Accomplishment per phase (%)</legend>
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {rows.map((r, i) =>
              r.activities.length ? (
                <div key={r.phase_id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium text-slate-900">{r.name}</span>
                      <span className="block text-xs text-slate-500">weight {r.weight}% · last report {r.previous}% · computed from its sub-activities</span>
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-1 text-sm font-semibold tabular-nums text-slate-800" aria-label={`${r.name}: ${activityProgress(r.activities).toFixed(2)}% (computed)`}>
                      {activityProgress(r.activities).toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
                    {r.activities.map((a, k) => (
                      <div key={a.activity_id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
                        <label htmlFor={`act-${a.activity_id}`} className="text-sm">
                          <span className="text-slate-800">{a.name}</span>
                          <span className="block text-xs text-slate-500">{a.weight}% of the phase · last report {a.previous}%</span>
                        </label>
                        <PercentInput id={`act-${a.activity_id}`} label={a.name} value={a.accomplishment} previous={a.previous} onChange={(v) => setActAcc(i, k, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={r.phase_id} className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_auto]">
                  <label htmlFor={`acc-${r.phase_id}`} className="text-sm">
                    <span className="font-medium text-slate-900">{r.name}</span>
                    <span className="block text-xs text-slate-500">weight {r.weight}% · last report {r.previous}%</span>
                  </label>
                  <PercentInput id={`acc-${r.phase_id}`} label={r.name} value={r.accomplishment} previous={r.previous} onChange={(v) => setAcc(i, v)} />
                </div>
              ),
            )}
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
        <Field
          label="Description of the work done"
          required
          hint={`${descLen}/${DESCRIPTION_MAX} · at least 10 characters. What was done this period, so the % can be checked against the photos.`}
        >
          {(a) => <Textarea {...a} rows={4} maxLength={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} invalid={tried && (descLen < 10 || descLen > DESCRIPTION_MAX)} />}
        </Field>
        <ReferencePhotosInput files={files} onChange={setFiles} invalid={tried && (files.length < 1 || files.length > 5)} disabled={saving} />
        <Field label="Remarks" required={decreased} hint={decreased ? 'A value is lower than the last report: explain the correction (at least 10 characters).' : 'Issues, weather delays…'}>
          {/* not blocked here on purpose: the server rule (validationRules.js) answers if remarks are missing */}
          {(a) => <Textarea {...a} value={remarks} onChange={(e) => setRemarks(e.target.value)} invalid={decreased && remarks.trim().length < 10} />}
        </Field>
      </form>
    </Modal>
  );
}

/** Plan editor rows from the API phases (or the template): each with its sub-activities. */
function planRows(phases) {
  return phases.map((ph) => {
    const acts = (ph.activities || []).map((a) => ({ id: a.id, name: a.name, weight: Number(a.weight), accomplishment: Number(a.accomplishment || 0) }));
    return {
      id: ph.id,
      name: ph.name,
      weight: Number(ph.weight),
      planned_start: ph.planned_start || '',
      planned_end: ph.planned_end || '',
      accomplishment: Number(ph.accomplishment || 0),
      // New sub-activities start at 0%, except a phase's first ones: they start at the phase's % (API).
      newStart: acts.length ? 0 : Number(ph.accomplishment || 0),
      activities: acts,
    };
  });
}

/**
 * Set up or change the phase plan (names, weights, planned dates) and each phase's sub-activities (name, weight).
 * Phase weights total 100%; a phase's sub-activity weights total 100 too. DPWH Personnel only.
 */
export function PhasePlanModal({ open, onClose, project, phases, isNew = false, onSaved }) {
  const [rows, setRows] = useState(() => planRows(phases));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(planRows(phases));
    setErr(null);
  }, [open, phases]);
  const total = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
  const ok = Math.abs(total - 100) < 0.01;
  const ready = phasePlanReady(rows) && rows.every((r) => r.activities.every((a) => String(a.name || '').trim().length >= 2 && Number(a.weight) > 0));
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const setAct = (i, k, key, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, activities: r.activities.map((a, n) => (n === k ? { ...a, [key]: v } : a)) } : r)));
  const addAct = (i) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, activities: [...r.activities, { name: '', weight: r.activities.length ? 0 : 100, accomplishment: r.newStart }] } : r)));
  const removeAct = (i, k) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, activities: r.activities.filter((_, n) => n !== k) } : r)));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.put(`/projects/${project.id}/phases`, phasePlanPayload(rows));
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
      description={`Follow the approved program of work. Dates must fall between the Notice to Proceed (${date(project.notice_to_proceed)}) and the target completion (${date(project.target_completion_date)}). Sub-activities explain a phase's %: their weights add up to 100 and the phase's % is computed from them.`}
      footer={
        <>
          <span className={`mr-auto self-center text-sm font-semibold ${ok ? 'text-emerald-700' : 'text-red-700'}`}>Total weight: {total.toFixed(2)}%</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!ready}>Save plan</Button>
        </>
      }
    >
      <ServerError err={err} title="The plan was not saved" />
      <div className="mt-3 space-y-3">
        <div className="hidden grid-cols-[2fr_90px_1fr_1fr_auto] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Phase</span><span>Weight %</span><span>Planned start</span><span>Planned end</span><span />
        </div>
        {rows.map((r, i) => {
          const actTotal = activityWeightTotal(r.activities);
          const actOk = activityWeightsOk(r.activities);
          return (
            <div key={r.id || `new-${i}`} className="rounded-md border border-slate-200 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_90px_1fr_1fr_auto]">
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

              <div className="mt-3 rounded-md bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sub-activities</p>
                  {r.activities.length > 0 ? (
                    <p className="text-xs text-slate-600">
                      Phase % (computed): <strong className="tabular-nums text-slate-900">{activityProgress(r.activities).toFixed(2)}%</strong>
                      <span className={`ml-3 font-semibold tabular-nums ${actOk ? 'text-emerald-700' : 'text-red-700'}`}>Total {actTotal.toFixed(2)}%</span>
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">None: the phase's % is reported directly ({pct(r.accomplishment, 2)} now).</p>
                  )}
                </div>
                {r.activities.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {r.activities.map((a, k) => {
                      const keepsWork = a.id && Number(a.accomplishment) > 0 && r.activities.length > 1;
                      return (
                        <li key={a.id || `new-act-${k}`} className="grid grid-cols-[1fr_90px_auto] items-center gap-2">
                          <Input aria-label={`Sub-activity ${k + 1} name`} placeholder="e.g. Excavation" value={a.name} onChange={(e) => setAct(i, k, 'name', e.target.value)} invalid={String(a.name || '').trim().length < 2} />
                          <Input aria-label={`Sub-activity ${k + 1} weight %`} type="number" min={0} max={100} step="0.01" value={a.weight} onChange={(e) => setAct(i, k, 'weight', e.target.value)} invalid={!(Number(a.weight) > 0)} />
                          <button
                            type="button"
                            onClick={() => removeAct(i, k)}
                            className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                            aria-label={`Remove sub-activity ${a.name || k + 1}`}
                            disabled={Boolean(keepsWork)}
                            title={keepsWork ? 'This sub-activity already has reported work (it can go only with all the others)' : undefined}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!actOk && <p className="mt-1.5 text-xs font-medium text-red-700">{ACTIVITY_WEIGHTS_MESSAGE}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => addAct(i)} disabled={r.activities.length >= 20}>Add sub-activity</Button>
                  {r.activities.length > 1 && (
                    <button type="button" onClick={() => set(i, 'activities', [])} className="text-xs font-semibold text-slate-600 hover:text-red-700 hover:underline" title="The phase keeps its current %">
                      Remove all sub-activities
                    </button>
                  )}
                  {r.activities.length === 0 && r.accomplishment > 0 && <span className="text-xs text-slate-500">The first sub-activities start at the phase's current {pct(r.accomplishment, 2)}.</span>}
                </div>
              </div>
            </div>
          );
        })}
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, { name: 'New phase', weight: 0, planned_start: '', planned_end: '', accomplishment: 0, newStart: 0, activities: [] }])}>
          Add phase
        </Button>
      </div>
    </Modal>
  );
}
