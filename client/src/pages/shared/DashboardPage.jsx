import { ArrowRight, Banknote, ChevronRight, ClipboardCheck, Coins, FileBarChart, FolderKanban, Map, Plus, TrendingUp, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FlagBadge, StatusBadge } from '../../components/common/Badges.jsx';
import DashboardCharts from './DashboardCharts.jsx';
import AssignedFindings from '../../components/audit/AssignedFindings.jsx';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../../components/common/Card.jsx';
import ProgressBar from '../../components/common/ProgressBar.jsx';
import UtilizationBar from '../../components/common/UtilizationBar.jsx';
import { ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { PROJECT_TYPES, STATUS_META } from '../../lib/constants.js';
import { date, pesoCompact } from '../../lib/format.js';

/**
 * Week 1: the Login page opens this dashboard, and each role gets its own
 * heading and shortcuts (Objective 1 — project, contractor, agency, budget and duration records).
 */
const ROLE_DASHBOARD = {
  admin: {
    eyebrow: 'Administrator dashboard',
    description: 'Approve staff access requests, manage user accounts, and follow project performance, flags and finances.',
    actions: [
      { to: '/app/users', label: 'Access requests and users', icon: Users },
      { to: '/app/audit', label: 'Flags and audit', icon: ClipboardCheck },
      { to: '/app/map', label: 'Project map', icon: Map },
      { to: '/app/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
  dpwh_personnel: {
    eyebrow: 'DPWH Personnel dashboard',
    description: 'Register projects, submit progress updates, upload 360° site photos and record disbursements.',
    actions: [
      { to: '/app/progress', label: 'Submit progress updates', icon: TrendingUp },
      { to: '/app/map', label: 'Project map & 360° photos', icon: Map },
      { to: '/app/finance', label: 'Record disbursements', icon: Coins },
      { to: '/app/projects/new', label: 'Register a project', icon: Plus },
    ],
  },
  auditor: {
    eyebrow: 'Auditor dashboard',
    description: 'Review flagged projects, confirm or override flags, record findings and download audit reports.',
    actions: [
      { to: '/app/audit', label: 'Review flagged projects', icon: ClipboardCheck },
      { to: '/app/map', label: 'Project map & 360° photos', icon: Map },
      { to: '/app/reports', label: 'Audit reports', icon: FileBarChart },
      { to: '/app/finance', label: 'Fund utilization', icon: Coins },
    ],
  },
};

function Breakdown({ title, rows, labels }) {
  const total = rows.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-2">
        {rows.map(([k, v]) => (
          <li key={k}>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">{labels[k]?.label || labels[k] || k}</span>
              <span className="font-semibold tabular-nums">{v}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${(v / total) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const view = ROLE_DASHBOARD[role] || ROLE_DASHBOARD.dpwh_personnel;
  const stats = useApi('/projects/stats', undefined, { select: (r) => r.data });
  const recent = useApi('/projects', { pageSize: 6, sort: 'updated_at', order: 'desc' }, { select: (r) => r.data });

  if (stats.loading && !stats.data) return <PageLoader label="Loading dashboard…" />;
  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.reload} />;
  const s = stats.data;
  const statusRows = Object.keys(STATUS_META).filter((k) => s.by_status[k]).map((k) => [k, s.by_status[k]]);
  const typeRows = Object.entries(s.by_type).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader eyebrow={view.eyebrow} title={`Good day, ${profile?.full_name?.split(' ')[0] || 'there'}`} description={view.description} />

      <nav aria-label="Quick actions" className="stagger mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {view.actions.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
          >
            <span className="rounded-md bg-brand-50 p-2 text-brand-700"><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="flex-1">{label}</span>
            <ArrowRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
          </Link>
        ))}
      </nav>

      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registered projects" value={s.total_projects} hint={`${s.by_status.ongoing || 0} on-going`} icon={FolderKanban} />
        <StatCard label="Average completion" value={`${s.average_progress.toFixed(1)}%`} hint={s.projects_without_phases ? `${s.projects_without_phases} project(s) without phases` : 'Across all projects'} icon={TrendingUp} tone="green" />
        <StatCard label="Disbursed" value={pesoCompact(s.total_disbursed)} hint={`of ${pesoCompact(s.total_revised_contract)} contract amount`} icon={Banknote} tone="yellow" />
        <StatCard label="Remaining balance" value={pesoCompact(s.total_remaining_balance)} hint={`ABC ${pesoCompact(s.total_approved_budget)}`} icon={Wallet} tone="slate" />
      </div>

      {/* Gap fix: corrective actions assigned to this DPWH personnel account */}
      {role === 'dpwh_personnel' && <AssignedFindings />}

      {/* Week 3: Chart.js charts of project performance and financial records */}
      <DashboardCharts />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recently updated projects"
            actions={<Link to="/app/projects" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>}
          />
          <ul className="divide-y divide-slate-100">
            {(recent.data || []).map((p) => (
              <li key={p.id}>
                <Link to={`/app/projects/${p.id}`} className="group flex flex-col gap-1 px-5 py-3 transition-colors duration-150 hover:bg-brand-50/40 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="font-mono">{p.project_code}</span> · {p.municipality_name} · {p.contractor_name || 'Not yet awarded'}
                    </p>
                  </div>
                  <div className="w-full shrink-0 sm:w-36">
                    {Number(p.phase_count) > 0 ? <ProgressBar value={p.overall_progress} size="sm" /> : <span className="text-xs text-slate-400">No phases yet</span>}
                  </div>
                  <div className="shrink-0 text-xs text-slate-500 sm:w-32 sm:text-right">
                    <span className="block font-medium tabular-nums text-slate-800">{pesoCompact(p.remaining_balance)} left</span>
                    {p.duration_days ? `until ${date(p.target_completion_date)}` : 'No duration yet'}
                  </div>
                  <FlagBadge flag={p.current_flag} size="sm" />
                  <ChevronRight className="hidden h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 sm:block" aria-hidden />
                </Link>
              </li>
            ))}
            {recent.data?.length === 0 && <li className="px-5 py-6 text-sm text-slate-500">No projects registered yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Project records" />
          <CardBody className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Fund utilization</p>
              <UtilizationBar disbursed={s.total_disbursed} total={s.total_revised_contract} compact />
              <p className="mt-1 text-xs tabular-nums text-slate-600">{s.total_revised_contract ? ((s.total_disbursed / s.total_revised_contract) * 100).toFixed(1) : 0}% of the contract amount disbursed</p>
            </div>
            <Breakdown title="By status" rows={statusRows} labels={STATUS_META} />
            <Breakdown title="By type" rows={typeRows} labels={PROJECT_TYPES} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
