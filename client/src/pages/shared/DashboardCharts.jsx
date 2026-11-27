import { Link } from 'react-router-dom';
import { ContractVsDisbursed, FlagDonut, MunicipalityFlagBar, PlannedVsActual, StatusBar } from '../../components/charts/Charts.jsx';
import { Card, CardBody, CardHeader } from '../../components/common/Card.jsx';
import { ErrorState, Skeleton } from '../../components/common/Feedback.jsx';
import { useApi } from '../../hooks/useApi.js';
import { pct, pesoCompact } from '../../lib/format.js';

/**
 * WEEK 3 — Admin / DPWH / Auditor dashboard charts (Tracy Ann Milaflores, front-end):
 * project performance (flags, status, schedule) from GET /dashboard/performance and
 * financial records from GET /dashboard/financial.
 */
export default function DashboardCharts() {
  const perf = useApi('/dashboard/performance', undefined, { select: (r) => r.data });
  const fin = useApi('/dashboard/financial', undefined, { select: (r) => r.data });
  if (perf.error) return <ErrorState error={perf.error} onRetry={perf.reload} />;
  if (!perf.data || !fin.data) return <Skeleton className="mt-6 h-72 w-full" />;
  const p = perf.data;
  const f = fin.data;

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Projects by flag" description={`${p.pending_review} Yellow/Red awaiting auditor review`} actions={<Link to="/app/audit" className="text-sm font-semibold text-brand-700 hover:underline">Review</Link>} />
          <CardBody><FlagDonut counts={p.by_flag} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Projects by status" description={`${p.delayed} delayed`} />
          <CardBody><StatusBar counts={p.by_status} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Overall progress" />
          <CardBody className="space-y-4 text-sm">
            <div>
              <p className="flex justify-between"><span className="text-slate-600">Average actual completion</span><span className="font-semibold tabular-nums">{pct(p.average_progress.actual)}</span></p>
              <p className="flex justify-between"><span className="text-slate-600">Average planned completion</span><span className="font-semibold tabular-nums">{pct(p.average_progress.planned)}</span></p>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="flex justify-between"><span className="text-slate-600">Fund utilization</span><span className="font-semibold tabular-nums">{pct(f.totals.fund_utilization_pct)}</span></p>
              <p className="flex justify-between"><span className="text-slate-600">Disbursed</span><span className="font-semibold tabular-nums">{pesoCompact(f.totals.total_disbursed)}</span></p>
              <p className="flex justify-between"><span className="text-slate-600">Bid savings (ABC − contract)</span><span className="font-semibold tabular-nums">{pesoCompact(f.totals.bid_savings)}</span></p>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <p className="flex justify-between"><span className="text-slate-600">Projects without 360° photos</span><span className="font-semibold tabular-nums">{p.without_images}</span></p>
              <p className="flex justify-between"><span className="text-slate-600">Paid well ahead of work</span><span className="font-semibold tabular-nums">{f.paid_ahead.length}</span></p>
            </div>
          </CardBody>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Furthest behind schedule" description="Planned vs actual completion (bar colour = flag)" />
          <CardBody>{p.most_behind.length ? <PlannedVsActual rows={p.most_behind} /> : <p className="text-sm text-slate-500">No project is behind schedule.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Flags per municipality" />
          <CardBody><MunicipalityFlagBar rows={p.by_municipality} /></CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Contract amount vs disbursed, per municipality" description="Financial records" actions={<Link to="/app/finance" className="text-sm font-semibold text-brand-700 hover:underline">Financial monitoring</Link>} />
        <CardBody><ContractVsDisbursed rows={f.by_municipality} /></CardBody>
      </Card>
    </div>
  );
}
