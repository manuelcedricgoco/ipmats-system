import { History, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '../../components/common/Badges.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Input } from '../../components/common/Form.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { dateTime } from '../../lib/format.js';

/** The part of the action before the dot (server: services/paccActivity.js callers). */
const AREAS = {
  report: { label: 'Citizen reports', cls: 'bg-amber-50 text-amber-800' },
  case: { label: 'Cases', cls: 'bg-brand-50 text-brand-800' },
  member: { label: 'Members', cls: 'bg-emerald-50 text-emerald-800' },
};

/** PACC's own activity log: who in PACC did what and when. Kept apart from the staff activity log; readable only by PACC. */
export default function PaccActivityPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search, 350);
  const { data, loading, error, reload } = useApi('/pacc/activity', { from, to, search: q, page, pageSize: 25 });
  const reset = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="PACC"
        title="Activity log"
        description="Every action taken in the PACC portal: who did it, what, and when. Only PACC can read this log, and entries cannot be edited or deleted."
      />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input type="search" value={search} onChange={reset(setSearch)} placeholder="Search summary or person" aria-label="Search activity" className="pl-9" />
          </div>
          <Input type="date" aria-label="From date" value={from} onChange={reset(setFrom)} />
          <Input type="date" aria-label="To date" value={to} onChange={reset(setTo)} />
        </div>
      </Card>

      {loading && !data && <PageLoader withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.data.length === 0 && <EmptyState icon={History} title="No activity found" description="Try other dates or search words." />}
      {data && data.data.length > 0 && (
        <Card className={`overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
          <div className="relative overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  <th scope="col" className="px-4 py-3">Who</th>
                  <th scope="col" className="px-4 py-3">Area</th>
                  <th scope="col" className="px-4 py-3">What</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Link</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((a) => {
                  const area = AREAS[a.action.split('.')[0]];
                  return (
                    <tr key={a.id} className="align-top hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{dateTime(a.created_at)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{a.actor_name || 'Unknown'}</td>
                      <td className="px-4 py-3"><Pill className={area?.cls}>{area?.label || a.action.split('.')[0]}</Pill></td>
                      <td className="min-w-[16rem] px-4 py-3 text-slate-900">{a.summary}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {a.entity_type === 'case' && a.entity_id ? (
                          <Link to={`/pacc/cases/${a.entity_id}`} className="text-xs font-semibold text-brand-700 hover:underline">Open case</Link>
                        ) : (
                          a.project_id && <Link to={`/pacc/projects/${a.project_id}`} className="text-xs font-semibold text-brand-700 hover:underline">Open project</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}
    </>
  );
}
