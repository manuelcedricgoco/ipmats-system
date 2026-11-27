import { ClipboardCheck, Download, Eye, EyeOff, FileText, Plus, ShieldCheck, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import CorrectiveActionModal from '../../../components/audit/CorrectiveActionModal.jsx';
import FindingModal from '../../../components/audit/FindingModal.jsx';
import FlagReasons from '../../../components/audit/FlagReasons.jsx';
import ReviewFlagModal from '../../../components/audit/ReviewFlagModal.jsx';
import { FlagBadge, Pill, StatusBadge } from '../../../components/common/Badges.jsx';
import Button from '../../../components/common/Button.jsx';
import { Card, CardBody, CardHeader } from '../../../components/common/Card.jsx';
import { ErrorState, PageLoader } from '../../../components/common/Feedback.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { api } from '../../../lib/api.js';
import { ACTION_STATUS, AUDIT_STATUS, REVIEW_STATUS, SEVERITY_META } from '../../../lib/constants.js';
import { date, dateTime, titleCase } from '../../../lib/format.js';

/**
 * WEEK 3 — Flag status and reasons on the project page (Tracy Ann Milaflores),
 * with the auditor's confirm / override and audit findings (Jonalyn Pagilagan).
 */
export default function FlagsTab() {
  const { project, reloadProject } = useOutletContext();
  const { hasRole, profile } = useAuth();
  const toast = useToast();
  const canAudit = hasRole('auditor', 'admin');
  const flags = useApi(`/projects/${project.id}/flags`, undefined, { select: (r) => r.data });
  const findings = useApi(`/projects/${project.id}/findings`, undefined, { select: (r) => r.data });
  const phases = useApi(`/projects/${project.id}/phases`, undefined, { select: (r) => r.data.phases });
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(null); // {} = new finding
  const [downloading, setDownloading] = useState(false);
  const [acting, setActing] = useState(null); // finding whose corrective action is being updated
  const [publishing, setPublishing] = useState(null);

  const togglePublic = async (f) => {
    setPublishing(f.id);
    try {
      await api.patch(`/findings/${f.id}/public`, { is_public: !f.is_public });
      toast.success(f.is_public ? 'Finding hidden from the public portal.' : 'Finding published on the public portal.');
      findings.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPublishing(null);
    }
  };

  if (flags.loading && !flags.data) return <PageLoader label="Loading flag details…" withHeader={false} />;
  if (flags.error) return <ErrorState error={flags.error} onRetry={flags.reload} />;
  const { history, reviews } = flags.data;

  const saved = (msg) => {
    setReviewing(false);
    setEditing(null);
    setActing(null);
    toast.success(msg);
    flags.reload();
    findings.reload();
    reloadProject();
  };
  const downloadReport = async () => {
    setDownloading(true);
    try {
      await api.download(`/reports/projects/${project.id}/audit.pdf`, undefined, `audit-report-${project.project_code}.pdf`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Flag status"
            description={project.auto_flag_evaluated_at ? `Checked automatically ${dateTime(project.auto_flag_evaluated_at)}` : 'Not evaluated yet'}
            actions={
              <>
                <Button size="sm" variant="secondary" icon={Download} loading={downloading} onClick={downloadReport}>Audit report (PDF)</Button>
                {canAudit && project.auto_flag && <Button size="sm" icon={ShieldCheck} onClick={() => setReviewing(true)}>Review flag</Button>}
              </>
            }
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <FlagBadge flag={project.current_flag} long />
              <StatusBadge status={project.status} />
              <Pill>{REVIEW_STATUS[project.flag_review_status]}</Pill>
              {project.current_flag !== project.auto_flag && project.auto_flag && <span className="text-xs text-slate-500">Automatic flag: {titleCase(project.auto_flag)}</span>}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Why this flag</p>
              <FlagReasons reasons={project.auto_flag_reasons} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Audit" />
          <CardBody className="space-y-3 text-sm">
            <p className="flex justify-between"><span className="text-slate-500">Audit status</span><span className="font-semibold">{AUDIT_STATUS[project.audit_status]}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Auditor decisions</span><span className="font-semibold">{reviews.length}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Findings</span><span className="font-semibold">{findings.data?.length ?? '—'}</span></p>
            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              When the automatic flag changes, the earlier auditor decision no longer applies and the flag goes back to "Awaiting auditor review".
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Auditor decisions" description="Every confirm or override, with the reason (cannot be edited or deleted)" />
        {reviews.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No auditor decision yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.decision === 'confirm' ? 'Confirmed' : 'Overridden'}</span>
                  <FlagBadge flag={r.auto_flag} size="sm" /> → <FlagBadge flag={r.final_flag} size="sm" />
                  <span className="text-xs text-slate-500">by {r.auditor_name || 'Auditor'} · {dateTime(r.created_at)}</span>
                </p>
                <p className="mt-1 text-slate-700">{r.reason}</p>
                {r.evidence_url && (
                  <a href={r.evidence_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                    <FileText className="h-3.5 w-3.5" aria-hidden /> View evidence
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Audit findings"
          description="Issues found by auditors and the corrective actions"
          actions={canAudit && <Button size="sm" icon={Plus} onClick={() => setEditing({})}>Record finding</Button>}
        />
        {!findings.data?.length ? (
          <p className="px-5 py-6 text-sm text-slate-500">No audit findings recorded.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {findings.data.map((f) => (
              <li key={f.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{f.title}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className={SEVERITY_META[f.severity].cls}>{SEVERITY_META[f.severity].label}</Pill>
                    <Pill>{ACTION_STATUS[f.action_status]}</Pill>
                    <Pill className={f.is_public ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}>{f.is_public ? 'Shown to public' : 'Staff only'}</Pill>
                    {canAudit && (
                      <button type="button" disabled={publishing === f.id} onClick={() => togglePublic(f)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50">
                        {f.is_public ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                        {f.is_public ? 'Hide from public' : 'Show to public'}
                      </button>
                    )}
                    {canAudit && <button type="button" onClick={() => setEditing(f)} className="text-xs font-semibold text-brand-700 hover:underline">Edit</button>}
                    {f.assigned_to === profile?.id && f.action_status !== 'closed' && (
                      <Button size="sm" variant="secondary" icon={UserCheck} onClick={() => setActing(f)}>Update action</Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-slate-700">{f.description}</p>
                {f.recommendation && <p className="mt-1 text-xs text-slate-600"><strong>Recommendation:</strong> {f.recommendation}</p>}
                {f.corrective_action && <p className="text-xs text-slate-600"><strong>Corrective action:</strong> {f.corrective_action}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {f.phase_name ? `${f.phase_name} · ` : ''}by {f.auditor_name || 'Auditor'} · {date(f.created_at)}{f.due_date ? ` · due ${date(f.due_date)}` : ''}
                  {f.assigned_to_name && <> · assigned to <strong className="font-semibold text-slate-700">{f.assigned_to_name}</strong></>}
                  {f.action_updated_at && <> · action updated {date(f.action_updated_at)}</>}
                  {f.evidence_url && <> · <a href={f.evidence_url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">evidence</a></>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Flag history" description="Automatic checks and auditor decisions, newest first" />
        <div className="relative max-h-80 overflow-auto">
          <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr><th scope="col" className="px-4 py-2.5">When</th><th scope="col" className="px-4 py-2.5">Source</th><th scope="col" className="px-4 py-2.5">Event</th><th scope="col" className="px-4 py-2.5">Flag</th><th scope="col" className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap px-4 py-2">{dateTime(h.created_at)}</td>
                  <td className="px-4 py-2">{h.source === 'auto' ? 'Automatic' : 'Auditor'}</td>
                  <td className="px-4 py-2 text-slate-600">{titleCase(h.trigger_event)}</td>
                  <td className="px-4 py-2"><FlagBadge flag={h.flag} size="sm" /></td>
                  <td className="px-4 py-2"><StatusBadge status={h.project_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ReviewFlagModal project={project} open={reviewing} onClose={() => setReviewing(false)} onSaved={saved} />
      <CorrectiveActionModal finding={acting} open={Boolean(acting)} onClose={() => setActing(null)} onSaved={saved} />
      <FindingModal open={Boolean(editing)} onClose={() => setEditing(null)} projectId={project.id} phases={phases.data || []} finding={editing?.id ? editing : null} onSaved={saved} />
      {canAudit && !project.auto_flag && <p className="flex items-center gap-2 text-sm text-slate-500"><ClipboardCheck className="h-4 w-4" /> The flag can be reviewed once the project has been evaluated.</p>}
    </div>
  );
}
