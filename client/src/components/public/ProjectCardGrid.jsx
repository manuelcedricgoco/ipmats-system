import { Building2, CalendarClock, Camera, MapPin, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlagBadge, StatusBadge } from '../common/Badges.jsx';
import { Card } from '../common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../common/Feedback.jsx';
import { Input, Select } from '../common/Form.jsx';
import Pagination from '../common/Pagination.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useReference } from '../../hooks/useReference.js';
import { PROJECT_TYPES, STATUS_META } from '../../lib/constants.js';
import { date, pesoCompact } from '../../lib/format.js';

/**
 * PUBLIC PORTAL — browsable grid of project cards with status and municipality filters (and, on the
 * Projects page, a search box). Filters live in the URL. Clicking a card calls onOpen(id) (the drawer).
 */
export default function ProjectCardGrid({ onOpen, showSearch = false, pageSize = 12 }) {
  const [params, setParams] = useSearchParams();
  const { ref } = useReference();
  const [search, setSearch] = useState(params.get('search') || '');
  const debounced = useDebounce(search, 350);
  const status = params.get('status') || '';
  const municipality = params.get('municipality_id') || '';
  const page = Number(params.get('page') || 1);
  const list = useApi('/public/projects', { status, municipality_id: municipality, search: showSearch ? debounced : '', page, pageSize });

  const setFilter = (next) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
        return p;
      },
      { replace: true },
    );
  useEffect(() => {
    if (showSearch && (params.get('search') || '') !== debounced) setFilter({ search: debounced, page: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div>
      <Card className="p-4">
        <div className={`grid grid-cols-1 gap-3 ${showSearch ? 'md:grid-cols-[2fr_1fr_1fr]' : 'sm:grid-cols-2'}`}>
          {showSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project name or municipality" aria-label="Search projects" className="pl-9" />
            </div>
          )}
          <Select aria-label="Status" value={status} onChange={(e) => setFilter({ status: e.target.value, page: '' })}>
            <option value="">Any status</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            <option value="delayed_or_stalled">Delayed</option>
          </Select>
          <Select aria-label="Municipality" value={municipality} onChange={(e) => setFilter({ municipality_id: e.target.value, page: '' })}>
            <option value="">All municipalities</option>
            {ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </div>
      </Card>

      <div className="mt-5">
        {list.loading && !list.data && <PageLoader label="Loading projects…" withHeader={false} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {list.data && list.data.data.length === 0 && <EmptyState title="No projects found" description="Try a different search or clear the filters." />}
        {list.data && list.data.data.length > 0 && (
          <>
            <p className="mb-3 text-sm text-slate-600">{list.data.total} project(s)</p>
            <ul className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${list.loading ? 'opacity-60' : ''}`}>
              {list.data.data.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="group flex h-full w-full flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-brand-700">{p.project_code} · {PROJECT_TYPES[p.project_type] || p.project_type}</span>
                      <span className="flex flex-col items-end gap-1">
                        <StatusBadge status={p.status} />
                        <FlagBadge flag={p.public_flag} size="sm" emptyLabel="Under review" />
                      </span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-800">{p.name}</h3>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />{p.barangay_name ? `Brgy. ${p.barangay_name}, ` : ''}{p.municipality_name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />{p.contractor_name || 'Contract not yet awarded'}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"><CalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />{p.actual_completion_date ? `Completed ${date(p.actual_completion_date)}` : p.target_completion_date ? `Target ${date(p.target_completion_date)}` : 'No schedule yet'}</p>
                    <div className="mt-auto pt-4">
                      <div className="mb-1 flex justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        <span>Work completed</span>
                        <span className="normal-case tracking-normal tabular-nums text-slate-700">{pesoCompact(p.contract_amount)}</span>
                      </div>
                      <ProgressBar value={p.overall_progress} size="sm" />
                    </div>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
                      {Number(p.image_count) > 0 && <Camera className="h-3.5 w-3.5" aria-label="Has 360° photos" />}
                      View details
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Card className="mt-4 overflow-hidden">
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={(pg) => setFilter({ page: String(pg) })} />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
