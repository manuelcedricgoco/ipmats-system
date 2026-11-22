import { ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FlagBadge, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Input, Select } from '../../components/common/Form.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import ProgressBar from '../../components/common/ProgressBar.jsx';
import ProjectFilters from '../../components/projects/ProjectFilters.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useReference } from '../../hooks/useReference.js';
import { PROJECT_TYPES } from '../../lib/constants.js';
import { date, pesoCompact } from '../../lib/format.js';

const KEYS = ['municipality_id', 'barangay_id', 'agency_id', 'contractor_id', 'status', 'type'];

/**
 * WEEK 1 — Project list (Tracy Ann Milaflores, front-end).
 * Shows each project's budget, contract amount, implementing office, contractor
 * and duration, with search, filters, sorting and pagination (GET /api/projects).
 */
export default function ProjectsPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('dpwh_personnel', 'admin');
  const [params, setParams] = useSearchParams();
  const { ref } = useReference();
  const [search, setSearch] = useState(params.get('search') || '');
  const debounced = useDebounce(search, 350);
  const [showFilters, setShowFilters] = useState(false);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']).filter(([, v]) => v));
  const page = Number(params.get('page') || 1);
  const sort = params.get('sort') || 'updated_at';
  const query = { ...filters, search: debounced, page, pageSize: 20, sort, order: sort === 'name' || sort === 'project_code' ? 'asc' : 'desc' };
  const { data, loading, error, reload } = useApi('/projects', query);

  const setQuery = (next) => {
    const p = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && p.set(k, v));
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Project Management"
        title="Infrastructure projects"
        description="Registered projects with their implementing office, contractor, approved budget, contract amount and duration."
        actions={canEdit && <Button icon={Plus} to="/app/projects/new">Register project</Button>}
      />
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setQuery({ ...filters, sort, search: e.target.value });
                }}
                placeholder="Search by project name, ID or contractor"
                aria-label="Search projects"
                className="pl-9"
              />
            </div>
            <Select aria-label="Sort" value={sort} onChange={(e) => setQuery({ ...filters, search, sort: e.target.value })} className="sm:w-52">
              <option value="updated_at">Recently updated</option>
              <option value="project_code">Project ID</option>
              <option value="name">Name (A–Z)</option>
              <option value="approved_budget">Approved budget</option>
              <option value="contract_amount">Contract amount</option>
              <option value="duration_days">Duration</option>
              <option value="target_completion_date">Target completion</option>
              <option value="overall_progress">Completion %</option>
            </Select>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {showFilters ? 'Hide filters' : `Filters${Object.keys(filters).length ? ` (${Object.keys(filters).length})` : ''}`}
          </button>
          <div className={`mt-4 border-t border-slate-100 pt-4 ${showFilters ? '' : 'hidden md:block'}`}>
            <ProjectFilters reference={ref} filters={filters} onChange={(f) => setQuery({ ...f, search, sort })} />
          </div>
        </Card>

        {loading && !data && <PageLoader label="Loading projects…" withHeader={false} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && data.data.length === 0 && (
          <EmptyState title="No projects found" description="Try a different search or clear the filters." action={canEdit ? <Button icon={Plus} to="/app/projects/new">Register a project</Button> : null} />
        )}

        {data && data.data.length > 0 && (
          <Card className={`overflow-hidden transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Project</th>
                    <th scope="col" className="px-4 py-3">Location</th>
                    <th scope="col" className="px-4 py-3">Office &amp; contractor</th>
                    <th scope="col" className="px-4 py-3">Budget</th>
                    <th scope="col" className="px-4 py-3">Duration</th>
                    <th scope="col" className="w-44 px-4 py-3">Flag, status &amp; progress</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {data.data.map((p) => (
                    <tr key={p.id} className="group transition-colors duration-150 hover:bg-brand-50/40">
                      <td className="min-w-[16rem] max-w-xs px-4 py-3">
                        <Link to={`/app/projects/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{p.name}</Link>
                        <div className="mt-1 text-xs text-slate-500">
                          <span className="font-mono">{p.project_code}</span> · {PROJECT_TYPES[p.project_type]}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {p.municipality_name}
                        <span className="block text-xs text-slate-500">{p.barangay_name ? `Brgy. ${p.barangay_name}` : ''}</span>
                      </td>
                      <td className="min-w-[11rem] px-4 py-3 text-slate-700">
                        <span className="block text-xs text-slate-500">{(p.agency_name || '—').replace(/^DPWH /, '')}</span>
                        <span className="mt-0.5 block font-medium">{p.contractor_name || <span className="font-normal text-slate-400">Not yet awarded</span>}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                        <span className="block text-xs text-slate-500">ABC {pesoCompact(p.approved_budget)}</span>
                        <span className="mt-0.5 block font-medium">{pesoCompact(p.contract_amount)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        <span className="block font-medium">{p.duration_days ? `${p.duration_days} days` : '—'}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{p.target_completion_date ? `until ${date(p.target_completion_date)}` : 'No target date'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1"><FlagBadge flag={p.current_flag} size="sm" /><StatusBadge status={p.status} /></div>
                        {Number(p.phase_count) > 0 ? <ProgressBar value={p.overall_progress} size="sm" className="mt-2" /> : <span className="mt-1 block text-[11px] text-slate-400">No phases yet</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/app/projects/${p.id}`} className="inline-flex rounded p-1 text-slate-400 transition-all duration-150 hover:bg-slate-100 group-hover:translate-x-0.5 group-hover:text-brand-600" aria-label={`Open ${p.name}`}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/app/projects/${p.id}`} className="block space-y-1.5 px-4 py-4 transition-colors hover:bg-slate-50 active:bg-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <div className="flex shrink-0 gap-1"><FlagBadge flag={p.current_flag} size="sm" /><StatusBadge status={p.status} /></div>
                    </div>
                    <p className="text-xs text-slate-500"><span className="font-mono">{p.project_code}</span> · {p.municipality_name} · {p.duration_days ? `${p.duration_days} days` : 'no duration'}</p>
                    <p className="text-xs text-slate-600">{p.contractor_name || 'Not yet awarded'} · ABC {pesoCompact(p.approved_budget)} · Contract {pesoCompact(p.contract_amount)}</p>
                    {Number(p.phase_count) > 0 && <ProgressBar value={p.overall_progress} size="sm" />}
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(pg) => setQuery({ ...filters, search, sort, page: pg })} />
          </Card>
        )}
      </div>
    </>
  );
}
