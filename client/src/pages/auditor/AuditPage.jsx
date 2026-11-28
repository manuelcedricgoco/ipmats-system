import { ChevronRight, Flag, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import FindingModal from '../../components/audit/FindingModal.jsx';
import FlagReasons from '../../components/audit/FlagReasons.jsx';
import ReviewFlagModal from '../../components/audit/ReviewFlagModal.jsx';
import { FlagBadge, Pill, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, PageHeader, StatCard } from '../../components/common/Card.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Select } from '../../components/common/Form.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useReference } from '../../hooks/useReference.js';
import { api } from '../../lib/api.js';
import { ACTION_STATUS, AUDIT_STATUS, FLAG_META, REVIEW_STATUS, SEVERITY_META } from '../../lib/constants.js';
import { date, pct } from '../../lib/format.js';

/**
 * WEEK 3 — Auditor panel (Jonalyn Pagilagan, front-end): review the flagged projects,
 * confirm or override each automatic flag, and record / follow up audit findings.
 */
export default function AuditPage() {
  const { hasRole } = useAuth();
  const canAudit = hasRole('auditor', 'admin');
  const [tab, setTab] = useState('queue');
  return (
    <>
      <PageHeader
        eyebrow="Flags & Audit"
        title={canAudit ? 'Auditor panel' : 'Flagged projects'}
        description="Projects are flagged automatically from schedule, 360° photos and payments. Auditors confirm or override each flag with a reason, and record findings."
      />
      <nav aria-label="Auditor panel sections" className="mb-6 flex gap-1 border-b border-slate-200">
        {[
          ['queue', 'Flag review queue'],
          ['findings', 'Audit findings'],
        ].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${tab === k ? 'text-brand-800' : 'text-slate-500 hover:text-slate-800'}`}>
            {l}
            <span className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-700 transition-transform duration-300 ${tab === k ? 'scale-x-100' : 'scale-x-0'}`} aria-hidden />
          </button>
        ))}
      </nav>
      {tab === 'queue' ? <Queue canAudit={canAudit} /> : <Findings canAudit={canAudit} />}
    </>
  );
}

function Queue({ canAudit }) {
  const toast = useToast();
  const { ref } = useReference();
  const { hasRole } = useAuth();
  const [filters, setFilters] = useState({ flag: '', review: '', municipality_id: '' });
  const { data, loading, error, reload } = useApi('/flags', filters);
  const [reviewing, setReviewing] = useState(null);
  const [rechecking, setRechecking] = useState(false);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const recheck = async () => {
    setRechecking(true);
    try {
      const r = await api.post('/flags/recheck');
      toast.success(`Checked ${r.data.evaluated} projects: ${r.data.changed} flag(s) changed.`);
      reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setRechecking(false);
    }
  };

  if (loading && !data) return <PageLoader label="Loading flags…" withHeader={false} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const c = data.counts || {};
  return (
    <div className="space-y-4">
      <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Red · for investigation" value={c.red || 0} tone="red" icon={Flag} />
        <StatCard label="Yellow · needs attention" value={c.yellow || 0} tone="yellow" icon={Flag} />
        <StatCard label="Green · on track" value={c.green || 0} tone="green" icon={Flag} />
        <StatCard label="Awaiting review" value={data.pending_review} hint="Yellow / Red not yet reviewed" icon={ShieldCheck} />
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label="Flag" value={filters.flag} onChange={set('flag')} className="w-48">
            <option value="">All flags</option>
            {Object.entries(FLAG_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
          <Select aria-label="Review status" value={filters.review} onChange={set('review')} className="w-56">
            <option value="">Any review status</option>
            {Object.entries(REVIEW_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Municipality" value={filters.municipality_id} onChange={set('municipality_id')} className="w-52">
            <option value="">All municipalities</option>
            {ref?.municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          {hasRole('admin') && <Button variant="secondary" icon={RefreshCw} loading={rechecking} onClick={recheck} className="ml-auto">Re-check all now</Button>}
        </div>
      </Card>
      {data.data.length === 0 ? (
        <EmptyState title="No projects match" />
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {data.data.map((p) => (
            <li key={p.id}>
              <Card className="p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FlagBadge flag={p.current_flag} />
                      <StatusBadge status={p.status} verifiedAt={p.completion_verified_at} />
                      <Pill className={p.flag_review_status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}>{REVIEW_STATUS[p.flag_review_status]}</Pill>
                      <span className="text-xs text-slate-500">Audit: {AUDIT_STATUS[p.audit_status]}</span>
                    </div>
                    <Link to={`/app/projects/${p.id}/flags`} className="mt-2 block font-semibold text-slate-900 hover:text-brand-700 hover:underline">
                      <span className="font-mono text-xs text-brand-700">{p.project_code}</span> {p.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {p.municipality_name} · {p.contractor_name || 'No contractor'} · {pct(p.overall_progress, 1)} done (plan {pct(p.planned_progress, 1)}) · paid {pct(p.financial_progress, 1)} · {p.image_count} photo(s)
                    </p>
                    <div className="mt-2"><FlagReasons reasons={p.auto_flag_reasons} hideInfo compact /></div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canAudit && p.auto_flag && <Button size="sm" icon={ShieldCheck} onClick={() => setReviewing(p)}>Review</Button>}
                    <Button size="sm" variant="secondary" to={`/app/projects/${p.id}/flags`}>Details <ChevronRight className="ml-1 h-4 w-4" /></Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ReviewFlagModal
        project={reviewing}
        open={Boolean(reviewing)}
        onClose={() => setReviewing(null)}
        onSaved={(m) => {
          setReviewing(null);
          toast.success(m);
          reload();
        }}
      />
    </div>
  );
}

function Findings({ canAudit }) {
  const toast = useToast();
  const [filters, setFilters] = useState({ action_status: '', severity: '' });
  const { data, loading, error, reload } = useApi('/findings', filters, { select: (r) => r.data });
  const [editing, setEditing] = useState(null);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  if (loading && !data) return <PageLoader label="Loading findings…" withHeader={false} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <Select aria-label="Action status" value={filters.action_status} onChange={set('action_status')} className="w-48">
            <option value="">Any action status</option>
            {Object.entries(ACTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Severity" value={filters.severity} onChange={set('severity')} className="w-44">
            <option value="">Any severity</option>
            {Object.entries(SEVERITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
        </div>
        <p className="mt-3 text-xs text-slate-500">To record a new finding, open the project from the review queue → Flag &amp; audit → Record finding.</p>
      </Card>
      {data.length === 0 ? (
        <EmptyState title="No audit findings yet" />
      ) : (
        <Card className="overflow-hidden">
          <p className="px-4 pt-3 text-xs text-slate-500 md:hidden" aria-hidden>Swipe sideways to see all columns →</p>
          <div className="relative overflow-x-auto">
            <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Finding</th><th scope="col" className="px-4 py-3">Project</th><th scope="col" className="px-4 py-3">Severity</th><th scope="col" className="px-4 py-3">Action</th><th scope="col" className="px-4 py-3">Assigned to</th><th scope="col" className="px-4 py-3">Public</th><th scope="col" className="px-4 py-3">Due</th><th scope="col" className="px-4 py-3"><span className="sr-only">Edit</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((f) => (
                  <tr key={f.id} className="align-top hover:bg-slate-50">
                    <td className="max-w-md px-4 py-3">
                      <p className="font-semibold text-slate-900">{f.title}</p>
                      <p className="text-xs text-slate-600">{f.description}</p>
                      {f.evidence_url && <a href={f.evidence_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700 hover:underline">Evidence</a>}
                    </td>
                    <td className="px-4 py-3"><Link to={`/app/projects/${f.project_id}/flags`} className="font-mono text-xs text-brand-700 hover:underline">{f.project_code}</Link><span className="block text-xs text-slate-500">{f.project_name}</span></td>
                    <td className="px-4 py-3"><Pill className={SEVERITY_META[f.severity].cls}>{SEVERITY_META[f.severity].label}</Pill></td>
                    <td className="px-4 py-3">{ACTION_STATUS[f.action_status]}{f.action_updated_at && <span className="block text-xs text-slate-500">updated {date(f.action_updated_at)}</span>}</td>
                    <td className="px-4 py-3 text-xs">{f.assigned_to_name || <span className="text-slate-400">Not assigned</span>}</td>
                    <td className="px-4 py-3"><Pill className={f.is_public ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}>{f.is_public ? 'Shown' : 'Staff only'}</Pill></td>
                    <td className="whitespace-nowrap px-4 py-3">{f.due_date ? date(f.due_date) : '—'}</td>
                    <td className="px-4 py-3 text-right">{canAudit && <button type="button" onClick={() => setEditing(f)} className="text-xs font-semibold text-brand-700 hover:underline">Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <FindingModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        projectId={editing?.project_id}
        finding={editing}
        onSaved={(m) => {
          setEditing(null);
          toast.success(m);
          reload();
        }}
      />
    </div>
  );
}
