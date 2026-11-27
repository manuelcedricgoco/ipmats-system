import { ChevronRight, FolderSearch, Inbox, MessageSquareWarning, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FlagBadge, Pill } from '../../components/common/Badges.jsx';
import { Card, PageHeader, StatCard } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Select } from '../../components/common/Form.jsx';
import { useApi } from '../../hooks/useApi.js';
import { CASE_STATUS_META, REFERRAL_CLS, REFERRAL_LABELS } from '../../lib/pacc.js';
import { date, number } from '../../lib/format.js';

/**
 * PACC inbox: the projects referred to PACC (auditor-confirmed Red, 10+ open citizen reports, or an open case),
 * with the reasons, the open report count, the last report date and the case status. A row opens the project.
 */
export default function PaccInboxPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi('/pacc/inbox', undefined, { select: (r) => r.data });
  const [reason, setReason] = useState('');
  const rows = useMemo(() => (data || []).filter((p) => !reason || p.reasons.includes(reason)), [data, reason]);

  const header = (
    <PageHeader
      eyebrow="PACC"
      title="Inbox"
      description="Projects referred to the Presidential Anti-Corruption Commission: a Red flag confirmed by an auditor, 10 or more open citizen reports, or an open case. Open a project to review its reports."
    />
  );
  if (loading && !data) return <>{header}<PageLoader label="Loading the inbox…" withHeader={false} /></>;
  if (error) return <>{header}<ErrorState error={error} onRetry={reload} /></>;

  const count = (k) => data.filter((p) => p.reasons.includes(k)).length;
  const openReports = data.reduce((sum, p) => sum + p.open_reports, 0);
  const open = (id) => navigate(`/pacc/projects/${id}`);

  return (
    <>
      {header}
      <div className="space-y-4">
        <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Referred projects" value={number(data.length)} icon={Inbox} />
          <StatCard label="Auditor-confirmed Red" value={number(count('auditor_red'))} tone="red" icon={ShieldAlert} />
          <StatCard label="Open citizen reports" value={number(openReports)} hint="Not yet closed by PACC" tone="yellow" icon={MessageSquareWarning} />
          <StatCard label="Open cases" value={number(count('open_case'))} tone="slate" icon={FolderSearch} />
        </div>

        <Card className="p-4">
          <Select aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-60">
            <option value="">All reasons</option>
            {Object.entries(REFERRAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            title={data.length ? 'No projects for this reason' : 'The inbox is empty'}
            description={data.length ? undefined : 'No project is referred to PACC right now.'}
          />
        ) : (
          <Card className={`overflow-hidden ${loading ? 'opacity-60' : ''}`}>
            <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
            <div className="relative overflow-x-auto">
              <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Project</th>
                    <th scope="col" className="px-4 py-3">Why referred</th>
                    <th scope="col" className="px-4 py-3">Flag</th>
                    <th scope="col" className="px-4 py-3 text-right">Open reports</th>
                    <th scope="col" className="px-4 py-3">Last report</th>
                    <th scope="col" className="px-4 py-3">Case</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p.project_id} onClick={() => open(p.project_id)} className="cursor-pointer align-top hover:bg-slate-50">
                      <td className="max-w-sm px-4 py-3">
                        <Link to={`/pacc/projects/${p.project_id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                          <span className="font-mono text-xs text-brand-700">{p.project_code}</span> {p.name}
                        </Link>
                        <span className="block text-xs text-slate-500">{p.municipality_name || '—'} · {p.contractor_name || 'No contractor'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.reasons.map((k) => <Pill key={k} className={REFERRAL_CLS[k]}>{REFERRAL_LABELS[k] || k}</Pill>)}
                        </div>
                      </td>
                      <td className="px-4 py-3"><FlagBadge flag={p.public_flag} size="sm" emptyLabel="Not reviewed" /></td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{number(p.open_reports)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{p.last_report_on ? date(p.last_report_on) : '—'}</td>
                      <td className="px-4 py-3">
                        {p.open_case ? <Pill className={CASE_STATUS_META[p.open_case.status]?.cls}>{CASE_STATUS_META[p.open_case.status]?.label || p.open_case.status}</Pill> : <span className="text-xs text-slate-400">No case</span>}
                      </td>
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
