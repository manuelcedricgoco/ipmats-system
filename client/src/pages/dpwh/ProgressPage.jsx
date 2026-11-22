import { ChevronRight, ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FlagBadge, StatusBadge } from '../../components/common/Badges.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Select } from '../../components/common/Form.jsx';
import ProgressBar from '../../components/common/ProgressBar.jsx';
import { useApi } from '../../hooks/useApi.js';
import { STATUS_META } from '../../lib/constants.js';
import { date } from '../../lib/format.js';

/**
 * WEEK 2 — Progress monitoring list (Tracy Ann Milaflores, front-end).
 * Every project's overall completion; open one to see its phases and submit an update.
 */
export default function ProgressPage() {
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('overall_progress');
  const { data, loading, error, reload } = useApi('/projects', { pageSize: 100, sort, order: sort === 'project_code' ? 'asc' : 'desc', status });

  if (loading && !data) return <PageLoader label="Loading progress…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const rows = data.data;

  return (
    <>
      <PageHeader
        eyebrow="Progress Monitoring"
        title="Phase-by-phase progress"
        description="Overall completion of each project, computed from its construction phases. Open a project to see every phase and to submit a progress update."
      />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:w-1/2">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="overall_progress">Sort: Completion</option>
            <option value="target_completion_date">Sort: Target completion</option>
            <option value="project_code">Sort: Project ID</option>
            <option value="updated_at">Sort: Recently updated</option>
          </Select>
        </div>
      </Card>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No projects found" />
      ) : (
        <Card className={`overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <ul className="divide-y divide-slate-100">
            {rows.map((p) => (
              <li key={p.id}>
                <Link to={`/app/projects/${p.id}/progress`} className="group flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-brand-50/40 sm:flex-row sm:items-center sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{p.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">{p.project_code}</span>· {p.municipality_name} · target {date(p.target_completion_date)} <FlagBadge flag={p.current_flag} size="sm" /> <StatusBadge status={p.status} />
                    </p>
                  </div>
                  <div className="w-full sm:w-64">
                    {Number(p.phase_count) ? <ProgressBar value={p.overall_progress} /> : <p className="text-xs font-medium text-amber-700">No phases set up yet</p>}
                  </div>
                  <ChevronRight className="hidden h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600 sm:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
