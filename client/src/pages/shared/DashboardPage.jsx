import { ArrowRight, Building2, CheckCircle2, ChevronRight, FolderKanban, Landmark, Plus, Users, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/common/Badges.jsx';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../../components/common/Card.jsx';
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
    description: 'Approve staff access requests, manage user accounts and keep office and contractor records up to date.',
    actions: [
      { to: '/app/users', label: 'Access requests and users', icon: Users },
      { to: '/app/projects/new', label: 'Register a project', icon: Plus },
      { to: '/app/agencies', label: 'Offices and agencies', icon: Landmark },
      { to: '/app/contractors', label: 'Contractors', icon: Building2 },
    ],
  },
  dpwh_personnel: {
    eyebrow: 'DPWH Personnel dashboard',
    description: 'Register infrastructure projects and keep their budget, contractor, office and duration records complete.',
    actions: [
      { to: '/app/projects/new', label: 'Register a project', icon: Plus },
      { to: '/app/projects', label: 'Project list', icon: FolderKanban },
      { to: '/app/contractors', label: 'Contractors', icon: Building2 },
      { to: '/app/agencies', label: 'Offices and agencies', icon: Landmark },
    ],
  },
  auditor: {
    eyebrow: 'Auditor dashboard',
    description: 'View registered projects with their approved budget, contract amount, contractor and duration (read-only).',
    actions: [
      { to: '/app/projects', label: 'Review project records', icon: FolderKanban },
      { to: '/app/contractors', label: 'Contractors', icon: Building2 },
      { to: '/app/agencies', label: 'Offices and agencies', icon: Landmark },
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

      <nav aria-label="Quick actions" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registered projects" value={s.total_projects} hint={`${s.by_status.ongoing || 0} ongoing · ${s.by_status.completed || 0} completed`} icon={FolderKanban} />
        <StatCard label="Approved budget (ABC)" value={pesoCompact(s.total_approved_budget)} hint="All registered projects" icon={Wallet} tone="slate" />
        <StatCard label="Contract amount" value={pesoCompact(s.total_contract_amount)} hint="Awarded projects" icon={CheckCircle2} tone="green" />
        <StatCard label="Contractors · offices" value={`${s.contractors_with_projects} · ${s.offices_with_projects}`} hint="With at least one project" icon={Building2} tone="yellow" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
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
                  <div className="shrink-0 text-xs text-slate-500 sm:text-right">
                    <span className="block font-medium tabular-nums text-slate-800">{pesoCompact(p.contract_amount ?? p.approved_budget)}</span>
                    {p.duration_days ? `${p.duration_days} days · until ${date(p.target_completion_date)}` : 'No duration yet'}
                  </div>
                  <StatusBadge status={p.status} />
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
            <Breakdown title="By status" rows={statusRows} labels={STATUS_META} />
            <Breakdown title="By type" rows={typeRows} labels={PROJECT_TYPES} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
