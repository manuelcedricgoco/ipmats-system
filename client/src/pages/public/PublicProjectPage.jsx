import { ArrowLeft, Banknote, Info, Scale, TrendingUp, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import FlagReasons from '../../components/audit/FlagReasons.jsx';
import { FlagBadge, Pill, StatusBadge } from '../../components/common/Badges.jsx';
import PanoramaViewer from '../../components/viewer360/PanoramaViewer.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, DetailList, StatCard } from '../../components/common/Card.jsx';
import { ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import ProgressBar from '../../components/common/ProgressBar.jsx';
import UtilizationBar from '../../components/common/UtilizationBar.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ACTION_STATUS, PROJECT_TYPES, RECORD_TYPE_CLS, RECORD_TYPES, SEVERITY_META } from '../../lib/constants.js';
import { date, peso, pesoCompact, pct, todayIso } from '../../lib/format.js';

function plannedToday(ph) {
  if (!ph.planned_start || !ph.planned_end) return null;
  const t = new Date(`${todayIso()}T00:00:00Z`);
  const s = new Date(`${ph.planned_start}T00:00:00Z`);
  const e = new Date(`${ph.planned_end}T00:00:00Z`);
  if (t <= s) return 0;
  if (t >= e) return 100;
  return ((t - s) / (e - s)) * 100;
}

/** PUBLIC PORTAL — one project: details, phase-by-phase progress and how the money was used (read-only). */
export default function PublicProjectPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi(`/public/projects/${id}`, undefined, { select: (r) => r.data });
  const [allReports, setAllReports] = useState(false);
  const [allRecords, setAllRecords] = useState(false);
  const [photoId, setPhotoId] = useState(null);

  if (loading && !data) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { project: p, phases, progress, finance, planned_progress: planned, images = [], flag = {}, findings = [] } = data;
  const photo = images.find((i) => i.id === photoId) || images[0];
  const fs = finance.summary;
  const reports = allReports ? progress : progress.slice(0, 6);
  const records = allRecords ? finance.records : finance.records.slice(0, 8);

  return (
    <div>
      <Link to="/portal" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All projects
      </Link>

      <div className="mt-3">
        <p className="font-mono text-xs font-semibold text-brand-700">{p.project_code}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{p.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <FlagBadge flag={flag.color} long emptyLabel="Flag under review" />
          <StatusBadge status={p.status} />
          <Pill>{PROJECT_TYPES[p.project_type]}</Pill>
          <span>{p.barangay_name ? `Brgy. ${p.barangay_name}, ` : ''}{p.municipality_name}, Occidental Mindoro</span>
        </div>
        {p.description && <p className="mt-3 max-w-3xl text-sm text-slate-600">{p.description}</p>}
      </div>

      <div className="stagger mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Work completed" value={pct(p.overall_progress, 1)} hint={phases.length ? `Planned by today: ${pct(planned, 1)}` : 'Not yet reported'} icon={TrendingUp} tone="green" />
        <StatCard label="Contract amount" value={pesoCompact(fs.revised_contract_amount)} hint={`Approved budget ${pesoCompact(fs.approved_budget)}`} icon={Scale} />
        <StatCard label="Paid so far" value={pesoCompact(fs.total_disbursed)} hint={`${pct(fs.utilization_pct, 1)} of the contract`} icon={Banknote} tone="yellow" />
        <StatCard label="Remaining balance" value={pesoCompact(fs.remaining_balance)} hint="Still to be paid" icon={Wallet} tone="slate" />
      </div>

      {/* Week 3: 360° site photos and the auditor-reviewed flag */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="360° site photos" description={images.length ? 'Drag to look around. Choose a date below.' : undefined} />
          <div className="p-3">
            <PanoramaViewer url={photo?.url} title={p.name} className="h-72 sm:h-96" />
            {images.length > 1 && (
              <ul className="relative mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => setPhotoId(i.id)} aria-pressed={i.id === photo?.id} className={`block w-36 shrink-0 overflow-hidden rounded-md border text-left text-xs transition-all ${i.id === photo?.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200 hover:border-slate-400'}`}>
                      {i.url && <img src={i.url} alt="" className="aspect-[2/1] w-full object-cover" loading="lazy" />}
                      <span className="block px-2 py-1 text-slate-700">{date(i.inspection_date)}{i.is_final ? ' · final' : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Flag" />
          <CardBody className="space-y-3">
            {flag.color ? (
              <>
                <FlagBadge flag={flag.color} long />
                <p className="text-xs text-slate-500">Reviewed by an auditor{flag.reviewed_at ? ` on ${date(flag.reviewed_at)}` : ''}.</p>
                <FlagReasons reasons={flag.reasons} />
              </>
            ) : (
              <p className="text-sm text-slate-600">The automatic flag of this project has not been reviewed by an auditor yet. It will appear here once reviewed.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Project details" />
          <CardBody>
            <DetailList
              items={[
                ['Implementing office', p.agency_name],
                ['Contractor', p.contractor_name || 'Not yet awarded'],
                ['Fund source', p.fund_source],
                ['Approved budget (ABC)', peso(p.approved_budget)],
                ['Contract amount', p.contract_amount != null ? peso(fs.revised_contract_amount) : null],
                ['Notice to Proceed', date(p.notice_to_proceed)],
                ['Duration', p.duration_days ? `${p.duration_days} calendar days` : null],
                ['Target completion', date(p.target_completion_date)],
                p.actual_completion_date && ['Completed on', date(p.actual_completion_date)],
              ]}
            />
          </CardBody>
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Progress by phase" description="Each phase counts by its weight. The black mark shows where the schedule says it should be today." />
          {phases.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Construction phases have not been reported for this project yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {phases.map((ph) => (
                <li key={ph.id} className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[1fr_14rem] sm:items-center">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{ph.sequence_no}. {ph.name} <span className="font-normal text-slate-500">· {pct(ph.weight, 0)} of the work</span></p>
                    <p className="text-xs text-slate-500">
                      Planned {date(ph.planned_start)} – {date(ph.planned_end)}
                      {ph.actual_end ? ` · finished ${date(ph.actual_end)}` : ph.actual_start ? ` · started ${date(ph.actual_start)}` : ''}
                    </p>
                  </div>
                  <ProgressBar value={ph.accomplishment} planned={plannedToday(ph)} />
                </li>
              ))}
              <li className="grid grid-cols-1 gap-2 bg-slate-50 px-5 py-3 sm:grid-cols-[1fr_14rem] sm:items-center">
                <p className="text-sm font-semibold text-slate-900">Whole project</p>
                <ProgressBar value={p.overall_progress} planned={planned} />
              </li>
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Progress reports" description={`${progress.length} report(s) from DPWH personnel`} />
          {progress.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No progress reports yet.</p>
          ) : (
            <>
              <div className="relative overflow-x-auto"><table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th scope="col" className="px-4 py-2.5">Date</th><th scope="col" className="px-4 py-2.5 text-right">Completed</th><th scope="col" className="px-4 py-2.5">Remarks</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-2.5">{date(r.report_date)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{pct(r.overall_progress, 2)}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {progress.length > 6 && (
                <div className="border-t border-slate-100 px-4 py-2 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setAllReports((v) => !v)}>{allReports ? 'Show fewer' : `Show all ${progress.length}`}</Button>
                </div>
              )}
            </>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Where the money went" description="Contract amount, payments released and other expenses" />
          <CardBody className="border-b border-slate-100">
            <UtilizationBar disbursed={fs.total_disbursed} total={fs.revised_contract_amount} />
            {fs.variation_orders !== 0 && (
              <p className="mt-3 text-xs text-slate-600">
                Includes approved changes to the contract (variation orders) of {fs.variation_orders > 0 ? '+' : '−'}{peso(Math.abs(fs.variation_orders))}.
              </p>
            )}
          </CardBody>
          {finance.records.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No financial records yet.</p>
          ) : (
            <>
              <div className="relative overflow-x-auto"><table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th scope="col" className="px-4 py-2.5">Date</th><th scope="col" className="px-4 py-2.5">Type</th><th scope="col" className="px-4 py-2.5 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-2.5">{date(r.record_date)}</td>
                      <td className="px-4 py-2.5">
                        <Pill className={RECORD_TYPE_CLS[r.record_type]}>{RECORD_TYPES[r.record_type]}</Pill>
                        {r.description && <span className="mt-0.5 block text-xs text-slate-500">{r.description}</span>}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${Number(r.amount) < 0 ? 'text-red-700' : ''}`}>{peso(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {finance.records.length > 8 && (
                <div className="border-t border-slate-100 px-4 py-2 text-center">
                  <Button variant="ghost" size="sm" onClick={() => setAllRecords((v) => !v)}>{allRecords ? 'Show fewer' : `Show all ${finance.records.length}`}</Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {findings.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader title="Published audit findings" description="Findings that the auditors have approved for public disclosure, with the corrective action and its status." />
          <ul className="divide-y divide-slate-100">
            {findings.map((f) => (
              <li key={f.id} className="px-5 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{f.title}</p>
                  <div className="flex flex-wrap gap-2">
                    <Pill className={SEVERITY_META[f.severity]?.cls}>{SEVERITY_META[f.severity]?.label}</Pill>
                    <Pill>{ACTION_STATUS[f.action_status]}</Pill>
                  </div>
                </div>
                <p className="mt-1 text-slate-700">{f.description}</p>
                {f.recommendation && <p className="mt-1 text-xs text-slate-600"><strong>Recommendation:</strong> {f.recommendation}</p>}
                {f.corrective_action && <p className="text-xs text-slate-600"><strong>Corrective action:</strong> {f.corrective_action}</p>}
                <p className="mt-1 text-xs text-slate-500">Published {date(f.published_at)}{f.due_date ? ` · due ${date(f.due_date)}` : ''}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        Progress and payments are reported by DPWH personnel. Last updated {date(p.updated_at)}.
      </p>
    </div>
  );
}
