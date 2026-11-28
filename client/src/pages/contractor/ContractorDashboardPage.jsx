import { AlertTriangle, Camera, CameraOff, FolderKanban, TrendingDown, TrendingUp, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FlagBadge, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader, StatCard } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import ProgressBar from '../../components/common/ProgressBar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { contractorDashboardSummary, contractorEmptyMessage } from '../../lib/contractor.js';
import { date, pct, todayIso } from '../../lib/format.js';
import { rowPointsBehind } from '../../lib/progress.js';

/**
 * Contractor dashboard (029): the company's own projects (RLS lets a contractor read nothing else), each with its
 * completion against the plan, flag, target completion date and latest 360° photo date, and shortcuts to submit a
 * progress report or upload a photo. No staff dashboards, charts, map or PACC data.
 */
export default function ContractorDashboardPage() {
  const { profile } = useAuth();
  const company = profile?.contractor;
  const { data, loading, error, reload } = useApi('/projects', { pageSize: 100, sort: 'target_completion_date', order: 'asc' });
  const rows = data?.data || [];
  const summary = contractorDashboardSummary(rows, todayIso());

  return (
    <>
      <PageHeader
        eyebrow="Contractor dashboard"
        title={company?.name || 'Your company’s projects'}
        description="Submit progress reports and upload 360° site photos for your company’s projects. DPWH Personnel confirm a project’s completion."
      />
      {loading && !data && <PageLoader label="Loading your projects…" withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && rows.length === 0 && <EmptyState icon={FolderKanban} title="No projects to show" description={contractorEmptyMessage(company)} />}
      {data && rows.length > 0 && (
        <div className="space-y-6">
          <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Projects" value={summary.total} hint={data.total > rows.length ? `Showing ${rows.length} of ${data.total}` : 'Assigned to your company'} icon={FolderKanban} />
            <StatCard label="Behind schedule" value={summary.behind} hint="Completion below the plan" icon={TrendingDown} tone={summary.behind ? 'yellow' : 'green'} />
            <StatCard label="Flagged" value={summary.flagged} hint="Yellow or Red flag" icon={AlertTriangle} tone={summary.flagged ? 'red' : 'green'} />
            <StatCard label="No recent photo" value={summary.noRecentPhoto} hint="No 360° photo in 30 days" icon={CameraOff} tone={summary.noRecentPhoto ? 'yellow' : 'green'} />
          </div>

          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100">
              {rows.map((p) => {
                const gap = -rowPointsBehind(p); // a Completed project is never behind (030)
                return (
                  <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <Link to={`/app/projects/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{p.name}</Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <span className="font-mono">{p.project_code}</span> · {p.municipality_name}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <FlagBadge flag={p.current_flag} size="sm" />
                        <StatusBadge status={p.status} verifiedAt={p.completion_verified_at} />
                      </div>
                    </div>
                    <div className="w-full lg:w-64">
                      {Number(p.phase_count) > 0 ? (
                        <>
                          <ProgressBar value={p.overall_progress} planned={p.planned_progress} status={p.status} size="sm" />
                          <p className={`mt-1 text-xs ${gap < 0 ? 'text-amber-800' : 'text-slate-500'}`}>
                            Planned {pct(p.planned_progress, 2)} · {gap < 0 ? `${Math.abs(gap).toFixed(2)} pts behind` : 'on or ahead of plan'}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">DPWH has not set up the phases yet.</p>
                      )}
                    </div>
                    <dl className="grid w-full grid-cols-2 gap-x-4 text-xs lg:w-60">
                      <dt className="text-slate-500">Target completion</dt>
                      <dt className="text-slate-500">Latest photo</dt>
                      <dd className="font-medium text-slate-800">{p.target_completion_date ? date(p.target_completion_date) : '—'}</dd>
                      <dd className="font-medium text-slate-800">{p.latest_inspection_date ? date(p.latest_inspection_date) : 'None yet'}</dd>
                    </dl>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="secondary" icon={TrendingUp} to={`/app/projects/${p.id}/progress`}>Progress</Button>
                      <Button size="sm" variant="secondary" icon={p.image_count ? Camera : Upload} to={`/app/projects/${p.id}/images`}>Photos</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
