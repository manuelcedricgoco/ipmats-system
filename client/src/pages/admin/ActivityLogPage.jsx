import { History, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '../../components/common/Badges.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Input, Select } from '../../components/common/Form.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { ROLE_LABELS } from '../../lib/constants.js';
import { dateTime } from '../../lib/format.js';

const AREAS = {
  project: 'Projects',
  phases: 'Phases',
  progress: 'Progress reports',
  finance: 'Financial records',
  image: '360° photos',
  document: 'Documents',
  flag: 'Flags',
  finding: 'Audit findings',
  contractor: 'Contractors',
  agency: 'Offices',
  user: 'User accounts',
  account: 'Own account',
  settings: 'Settings',
};
const TONE = {
  project: 'bg-brand-50 text-brand-800',
  phases: 'bg-brand-50 text-brand-800',
  progress: 'bg-sky-50 text-sky-800',
  finance: 'bg-amber-50 text-amber-800',
  image: 'bg-violet-50 text-violet-800',
  document: 'bg-violet-50 text-violet-800',
  flag: 'bg-red-50 text-red-800',
  finding: 'bg-orange-50 text-orange-800',
  contractor: 'bg-slate-100 text-slate-700',
  agency: 'bg-slate-100 text-slate-700',
  user: 'bg-emerald-50 text-emerald-800',
  account: 'bg-emerald-50 text-emerald-800',
  settings: 'bg-slate-800 text-white',
};

/**
 * Gap fix — Activity and Audit Logs (concept document §4.6, §6, §7.1).
 * Every change in the system — who, what, when — newest first. The log cannot be edited or deleted.
 * Admins and Auditors can read it.
 */
export default function ActivityLogPage() {
  const [area, setArea] = useState('');
  const [role, setRole] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search, 350);
  const { data, loading, error, reload } = useApi('/activity', { area, role, from, to, search: q, page, pageSize: 25 });
  const reset = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="Accountability"
        title="Activity and audit logs"
        description="Every change made in the system: who did it, what, and when. Entries cannot be edited or deleted."
      />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" value={search} onChange={reset(setSearch)} placeholder="Search summary or person" aria-label="Search activity" className="pl-9" />
          </div>
          <Select aria-label="Area" value={area} onChange={reset(setArea)}>
            <option value="">All areas</option>
            {Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Role" value={role} onChange={reset(setRole)}>
            <option value="">All roles</option>
            {['admin', 'dpwh_personnel', 'auditor'].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            <option value="system">System (automatic)</option>
          </Select>
          <Input type="date" aria-label="From date" value={from} onChange={reset(setFrom)} />
          <Input type="date" aria-label="To date" value={to} onChange={reset(setTo)} />
        </div>
      </Card>

      {loading && !data && <PageLoader withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.data.length === 0 && <EmptyState icon={History} title="No activity found" description="Try other filters. Actions are recorded from the moment this log was added." />}
      {data && data.data.length > 0 && (
        <Card className="overflow-hidden">
          <ol className="stagger divide-y divide-slate-100">
            {data.data.map((a) => {
              const areaKey = a.action.split('.')[0];
              return (
                <li key={a.id} className="flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900">{a.summary}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <Pill className={TONE[areaKey] || 'bg-slate-100 text-slate-700'}>{AREAS[areaKey] || areaKey}</Pill>
                      <span className="font-medium text-slate-700">{a.actor_name || 'Unknown'}</span>
                      <span>· {a.actor_role === 'system' ? 'Automatic' : ROLE_LABELS[a.actor_role] || a.actor_role}</span>
                      <span>· {dateTime(a.created_at)}</span>
                      {a.project_id && (
                        <Link to={`/app/projects/${a.project_id}`} className="font-semibold text-brand-700 hover:underline">
                          · Open project
                        </Link>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}
    </>
  );
}
