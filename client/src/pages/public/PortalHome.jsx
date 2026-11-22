import { Building2, CalendarClock, ChevronRight, MapPin, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FlagBadge, StatusBadge } from '../../components/common/Badges.jsx';
import { Card } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Input, Select } from '../../components/common/Form.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import ProgressBar from '../../components/common/ProgressBar.jsx';
import UtilizationBar from '../../components/common/UtilizationBar.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useReference } from '../../hooks/useReference.js';
import { PROJECT_TYPES, STATUS_META } from '../../lib/constants.js';
import { date, pesoCompact } from '../../lib/format.js';

/** PUBLIC PORTAL — home: totals and every project with its progress and money spent. */
export default function PortalHome() {
  const [params, setParams] = useSearchParams();
  const { ref } = useReference();
  const [search, setSearch] = useState(params.get('search') || '');
  const debounced = useDebounce(search, 350);
  const f = { municipality_id: params.get('municipality_id') || '', status: params.get('status') || '', type: params.get('type') || '', sort: params.get('sort') || 'updated_at' };
  const page = Number(params.get('page') || 1);
  const stats = useApi('/public/stats', undefined, { select: (r) => r.data });
  const list = useApi('/public/projects', { ...f, search: debounced, page, pageSize: 12 });

  const setQuery = (next) => {
    const p = new URLSearchParams();
    Object.entries({ ...f, search, ...next }).forEach(([k, v]) => v && !(k === 'sort' && v === 'updated_at') && p.set(k, v));
    setParams(p, { replace: true });
  };
  const s = stats.data;

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-brand-950 text-white shadow-panel">
        <img src="/auth-bg.webp" alt="" className="absolute inset-0 h-full w-full animate-[authZoom_24s_ease-in-out_infinite_alternate] object-cover opacity-20 motion-reduce:animate-none" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-950 via-brand-950/90 to-brand-900/60" aria-hidden />
        <div className="relative px-5 py-10 sm:px-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Public portal</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">Infrastructure projects in Occidental Mindoro</h1>
          <p className="mt-3 max-w-2xl text-brand-100">See where public works are being built, who is building them, how far along they are, and how much of the budget has been paid.</p>
          <dl className="stagger mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[
              ['Projects', s ? `${s.total_projects}` : '—', s ? `${s.ongoing} ongoing · ${s.completed} completed` : ''],
              ['Contract amount', s ? pesoCompact(s.total_contract_amount) : '—', s ? `ABC ${pesoCompact(s.total_approved_budget)}` : ''],
              ['Paid so far', s ? pesoCompact(s.total_disbursed) : '—', s && s.total_contract_amount ? `${((s.total_disbursed / s.total_contract_amount) * 100).toFixed(1)}% of contracts` : ''],
              ['Average completion', s ? `${s.average_progress.toFixed(1)}%` : '—', s ? `${s.municipalities} municipalities` : ''],
            ].map(([k, v, h]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/10">
                <dt className="text-xs uppercase tracking-wide text-brand-200">{k}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums">{v}</dd>
                <dd className="mt-0.5 text-xs text-brand-200">{h}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mt-6">
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setQuery({ search: e.target.value, page: '' }); }} placeholder="Search project, ID or contractor" aria-label="Search projects" className="pl-9" />
            </div>
            <Select aria-label="Municipality" value={f.municipality_id} onChange={(e) => setQuery({ municipality_id: e.target.value, page: '' })}>
              <option value="">All municipalities</option>
              {ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Select aria-label="Status" value={f.status} onChange={(e) => setQuery({ status: e.target.value, page: '' })}>
              <option value="">Any status</option>
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </Select>
            <Select aria-label="Type" value={f.type} onChange={(e) => setQuery({ type: e.target.value, page: '' })}>
              <option value="">All types</option>
              {Object.entries(PROJECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select aria-label="Sort" value={f.sort} onChange={(e) => setQuery({ sort: e.target.value, page: '' })}>
              <option value="updated_at">Recently updated</option>
              <option value="overall_progress">Completion</option>
              <option value="contract_amount">Contract amount</option>
              <option value="target_completion_date">Target completion</option>
              <option value="name">Name (A–Z)</option>
            </Select>
          </div>
        </Card>

        <div className="mt-6">
          {list.loading && !list.data && <PageLoader label="Loading projects…" withHeader={false} />}
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
          {list.data && list.data.data.length === 0 && <EmptyState title="No projects found" description="Try a different search or clear the filters." />}
          {list.data && list.data.data.length > 0 && (
            <>
              <p className="mb-3 text-sm text-slate-600">{list.data.total} project(s)</p>
              <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 transition-opacity ${list.loading ? 'opacity-60' : ''}`}>
                {list.data.data.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/portal/projects/${p.id}`}
                      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs text-brand-700">{p.project_code} · {PROJECT_TYPES[p.project_type]}</span>
                        <span className="flex gap-1"><FlagBadge flag={p.public_flag} size="sm" emptyLabel="Under review" /><StatusBadge status={p.status} /></span>
                      </div>
                      <h2 className="mt-2 line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-800">{p.name}</h2>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />{p.barangay_name ? `Brgy. ${p.barangay_name}, ` : ''}{p.municipality_name}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />{p.contractor_name || 'Contract not yet awarded'}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />{p.actual_completion_date ? `Completed ${date(p.actual_completion_date)}` : p.target_completion_date ? `Target ${date(p.target_completion_date)}` : 'No schedule yet'}</p>
                      <div className="mt-auto space-y-3 pt-4">
                        <div>
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">Work completed</p>
                          {Number(p.phase_count) > 0 ? <ProgressBar value={p.overall_progress} size="sm" /> : <p className="text-xs text-slate-400">Progress not yet reported</p>}
                        </div>
                        <div>
                          <p className="mb-1 flex justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            <span>Paid</span>
                            <span className="normal-case tracking-normal tabular-nums text-slate-700">{pesoCompact(p.total_disbursed)} of {pesoCompact(p.revised_contract_amount)}</span>
                          </p>
                          <UtilizationBar disbursed={p.total_disbursed} total={p.revised_contract_amount} compact />
                        </div>
                      </div>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                        View project <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Card className="mt-4 overflow-hidden">
                <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={(pg) => setQuery({ page: String(pg) })} />
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
