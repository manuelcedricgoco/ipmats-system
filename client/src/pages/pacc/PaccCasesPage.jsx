import { ChevronRight, Eye, FolderSearch } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pill } from '../../components/common/Badges.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Select } from '../../components/common/Form.jsx';
import { useApi } from '../../hooks/useApi.js';
import { date } from '../../lib/format.js';
import { CASE_STATUS_META, isClosedCaseStatus } from '../../lib/pacc.js';

/** Every PACC case, newest first. Cases are opened from a project's investigation page. */
export default function PaccCasesPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi('/pacc/cases', undefined, { select: (r) => r.data });
  // '' = all, 'open' = not closed, or one status.
  const [status, setStatus] = useState('open');
  const rows = useMemo(
    () => (data || []).filter((c) => !status || (status === 'open' ? !isClosedCaseStatus(c.status) : c.status === status)),
    [data, status],
  );

  const header = (
    <PageHeader
      eyebrow="PACC"
      title="Cases"
      description="Cases opened by PACC, newest first. To open a case, go to the project from the inbox and choose Open a case."
    />
  );
  if (loading && !data) return <>{header}<PageLoader label="Loading cases…" withHeader={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>;

  return (
    <>
      {header}
      <div className="space-y-4">
        <Card className="p-4">
          <Select aria-label="Case status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-60">
            <option value="open">Open cases</option>
            <option value="">All cases</option>
            {Object.entries(CASE_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            icon={FolderSearch}
            title={data.length ? 'No cases with this status' : 'No cases yet'}
            description={data.length ? undefined : 'Open a case from a project in the inbox.'}
          />
        ) : (
          <Card className={`overflow-hidden ${loading ? 'opacity-60' : ''}`}>
            <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
            <div className="relative overflow-x-auto">
              <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Project</th>
                    <th scope="col" className="px-4 py-3">Contractor</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Opened</th>
                    <th scope="col" className="px-4 py-3">Closed</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <tr key={c.id} onClick={() => navigate(`/pacc/cases/${c.id}`)} className="cursor-pointer align-top hover:bg-slate-50">
                      <td className="max-w-sm px-4 py-3">
                        <Link to={`/pacc/cases/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                          <span className="font-mono text-xs text-brand-700">{c.project_code}</span> {c.project_name}
                        </Link>
                        {!c.project_id && <span className="block text-xs text-slate-500">The project was deleted.</span>}
                      </td>
                      <td className="px-4 py-3">{c.contractor_name || <span className="text-xs text-slate-400">None named</span>}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <Pill className={CASE_STATUS_META[c.status]?.cls}>{CASE_STATUS_META[c.status]?.label || c.status}</Pill>
                          {c.show_public && !isClosedCaseStatus(c.status) && (
                            <span title="Status shown on the public portal" className="inline-flex text-emerald-700"><Eye className="h-4 w-4" aria-label="Status shown on the public portal" /></span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{date(c.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{c.closed_at ? date(c.closed_at) : '—'}</td>
                      <td className="px-4 py-3 text-right"><ChevronRight className="inline h-4 w-4 text-slate-400" aria-hidden /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
