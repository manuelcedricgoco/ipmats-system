import { Banknote, ChevronRight, Landmark, Scale, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../../components/common/Badges.jsx';
import { Card, CardBody, CardHeader, PageHeader, StatCard } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Select } from '../../components/common/Form.jsx';
import UtilizationBar from '../../components/common/UtilizationBar.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useReference } from '../../hooks/useReference.js';
import { STATUS_META } from '../../lib/constants.js';
import { peso, pesoCompact, pct } from '../../lib/format.js';

const SORTS = {
  project_code: ['Project ID', (a, b) => a.project_code.localeCompare(b.project_code)],
  remaining_balance: ['Remaining balance', (a, b) => b.remaining_balance - a.remaining_balance],
  total_disbursed: ['Disbursed', (a, b) => b.total_disbursed - a.total_disbursed],
  utilization_pct: ['Fund utilization', (a, b) => b.utilization_pct - a.utilization_pct],
  gap: ['Paid ahead of work', (a, b) => b.utilization_pct - b.overall_progress - (a.utilization_pct - a.overall_progress)],
};

/**
 * WEEK 2 — Financial monitoring page (Jonalyn Pagilagan, front-end).
 * Approved budget, contract amount, disbursements and remaining balance of every
 * project, with portfolio totals (GET /api/finance/overview).
 */
export default function FinancePage() {
  const { ref } = useReference();
  const [filters, setFilters] = useState({ municipality_id: '', agency_id: '', status: '' });
  const [sort, setSort] = useState('project_code');
  const { data, loading, error, reload } = useApi('/finance/overview', filters);

  if (loading && !data) return <PageLoader label="Loading financial monitoring…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const t = data.totals;
  const rows = [...data.data].map((r) => ({ ...r, remaining_balance: Number(r.remaining_balance), total_disbursed: Number(r.total_disbursed), overall_progress: Number(r.overall_progress) })).sort(SORTS[sort][1]);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageHeader
        eyebrow="Financial Monitoring"
        title="Budgets, disbursements and balances"
        description="Approved budget, contract amount (with variation orders), money released and the remaining balance of each project."
      />

      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Approved budget (ABC)" value={pesoCompact(t.approved_budget)} hint={`${t.projects} project(s)`} icon={Landmark} tone="slate" />
        <StatCard label="Contract amount" value={pesoCompact(t.revised_contract_amount)} hint="Including variation orders" icon={Scale} />
        <StatCard label="Disbursed" value={pesoCompact(t.total_disbursed)} hint={`${pct(t.utilization_pct)} fund utilization`} icon={Banknote} tone="yellow" />
        <StatCard label="Remaining balance" value={pesoCompact(t.remaining_balance)} hint="Still to be paid" icon={Wallet} tone="green" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Overall fund utilization" />
        <CardBody>
          <UtilizationBar disbursed={t.total_disbursed} total={t.revised_contract_amount} />
        </CardBody>
      </Card>

      <Card className="mt-6 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Select aria-label="Municipality" value={filters.municipality_id} onChange={set('municipality_id')}>
            <option value="">All municipalities</option>
            {ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select aria-label="Office" value={filters.agency_id} onChange={set('agency_id')}>
            <option value="">All offices</option>
            {ref?.agencies.map((a) => <option key={a.id} value={a.id}>{a.name.replace(/^DPWH /, '')}</option>)}
          </Select>
          <Select aria-label="Status" value={filters.status} onChange={set('status')}>
            <option value="">Any status</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>Sort: {label}</option>)}
          </Select>
        </div>
      </Card>

      {rows.length === 0 ? (
        <div className="mt-4"><EmptyState title="No projects match these filters" /></div>
      ) : (
        <Card className={`mt-4 overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
          <div className="relative overflow-x-auto">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Project</th>
                  <th scope="col" className="px-4 py-3 text-right">Approved budget</th>
                  <th scope="col" className="px-4 py-3 text-right">Contract amount</th>
                  <th scope="col" className="px-4 py-3 text-right">Disbursed</th>
                  <th scope="col" className="px-4 py-3 text-right">Remaining balance</th>
                  <th scope="col" className="w-44 px-4 py-3">Utilization vs work done</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const gap = r.utilization_pct - r.overall_progress;
                  return (
                    <tr key={r.id} className="group transition-colors hover:bg-brand-50/40">
                      <td className="min-w-[15rem] px-4 py-3">
                        <Link to={`/app/projects/${r.id}/finance`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{r.name}</Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono">{r.project_code}</span>· {r.municipality_name} <StatusBadge status={r.status} verifiedAt={r.completion_verified_at} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">{pesoCompact(r.approved_budget)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {pesoCompact(r.revised_contract_amount)}
                        {Number(r.variation_orders) !== 0 && <span className="block text-[11px] text-amber-700">VO {Number(r.variation_orders) > 0 ? '+' : '−'}{pesoCompact(Math.abs(r.variation_orders))}</span>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{pesoCompact(r.total_disbursed)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900" title={peso(r.remaining_balance)}>{pesoCompact(r.remaining_balance)}</td>
                      <td className="px-4 py-3">
                        <UtilizationBar disbursed={r.total_disbursed} total={r.revised_contract_amount} compact />
                        <p className="mt-1 text-[11px] tabular-nums text-slate-500">
                          paid {pct(r.utilization_pct, 0)} · work {pct(r.overall_progress, 0)}
                          {gap > 20 && <span className="ml-1 font-semibold text-red-700">paid ahead</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/app/projects/${r.id}/finance`} aria-label={`Open finances of ${r.name}`} className="inline-flex rounded p-1 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600"><ChevronRight className="h-4 w-4" /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="px-4 py-3">Total ({t.projects})</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pesoCompact(t.approved_budget)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pesoCompact(t.revised_contract_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pesoCompact(t.total_disbursed)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pesoCompact(t.remaining_balance)}</td>
                  <td className="px-4 py-3 tabular-nums">{pct(t.utilization_pct)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
