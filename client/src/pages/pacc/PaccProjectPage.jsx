import { ArrowLeft, CheckCheck, FolderOpen, FolderPlus, ImageOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import FlagReasons from '../../components/audit/FlagReasons.jsx';
import BiddingRounds from '../../components/bidding/BiddingRounds.jsx';
import OpenCaseModal from '../../components/pacc/OpenCaseModal.jsx';
import ProjectRecords from '../../components/pacc/ProjectRecords.jsx';
import CompletionVerificationCard from '../../components/progress/CompletionVerificationCard.jsx';
import { FlagBadge, Pill, StatusBadge } from '../../components/common/Badges.jsx';
import Button from '../../components/common/Button.jsx';
import { Card, CardBody, CardHeader, DetailList, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Select } from '../../components/common/Form.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../lib/api.js';
import { ACTION_STATUS, AUDIT_STATUS, PROJECT_TYPES, REVIEW_STATUS, SEVERITY_META } from '../../lib/constants.js';
import { date, dateTime, number, pct, peso, titleCase } from '../../lib/format.js';
import { CASE_STATUS_META, REPORT_CATEGORY_LABELS, REPORT_OUTCOME_LABELS, REPORT_STATUS_LABELS, isClosedCaseStatus } from '../../lib/pacc.js';

const REPORT_STATUS_CLS = { received: 'bg-brand-50 text-brand-800', under_review: 'bg-amber-50 text-amber-800', closed: 'bg-slate-100 text-slate-700' };

/**
 * PACC investigation page for one project: project facts, the flag and its reasons, the citizen reports with their
 * proof, PACC's cases, the bidding of the contract (032), the project's phases, progress, finance (with the liquidation and receipts, 031), 360° photos and documents (read-only), auditor
 * decisions and findings, and the flag history. Opening it marks new reports "under review" (server).
 */
export default function PaccProjectPage() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi(`/pacc/projects/${id}`, undefined, { select: (r) => r.data });
  // { report } closes one report, { all: true } closes every open report of the project.
  const [closing, setClosing] = useState(null);
  const [opening, setOpening] = useState(false);

  if (loading && !data) return <PageLoader label="Loading the project…" />;
  if (error) {
    return (
      <>
        <Button to="/pacc" variant="ghost" size="sm" icon={ArrowLeft} className="mb-4">Back to the inbox</Button>
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  const { project: p, reports, flag_history: history, flag_reviews: reviews, findings, cases } = data;
  const { phases = [], progress_updates: progress = [], financial_records: records = [], finance_summary: finance = {}, images = [], documents = [] } = data;
  const openReports = reports.filter((r) => r.status !== 'closed');
  const openCase = cases.find((c) => !isClosedCaseStatus(c.status));

  // 030: PACC verifies the completion here (not while a PACC case is open; "Not yet" stays allowed).
  const decideCompletion = async (decision, note) => {
    const res = await api.post(`/pacc/projects/${p.id}/completion-verification`, { decision, ...(note ? { note } : {}) });
    toast.success(res.data?.message || (res.data?.is_verified ? 'Completion verified. The project is now 100% and locked.' : decision === 'verified' ? 'Completion verified by PACC.' : '"Not yet" recorded.'));
    reload();
  };

  const confirmClose = async (outcome) => {
    if (closing.all) {
      const res = await api.post(`/pacc/projects/${p.id}/reports/close-all`, { outcome });
      toast.success(`${res.data.closed} report${res.data.closed === 1 ? '' : 's'} closed as ${REPORT_OUTCOME_LABELS[outcome].toLowerCase()}.`);
    } else {
      await api.post(`/pacc/reports/${closing.report.id}/close`, { outcome });
      toast.success(`Report closed as ${REPORT_OUTCOME_LABELS[outcome].toLowerCase()}.`);
    }
    setClosing(null);
    reload();
  };

  return (
    <>
      <Button to="/pacc" variant="ghost" size="sm" icon={ArrowLeft} className="mb-4">Back to the inbox</Button>
      <PageHeader
        eyebrow={<span className="font-mono">{p.project_code}</span>}
        title={p.name}
        description={`${[p.barangay_name, p.municipality_name].filter(Boolean).join(', ')} · ${p.contractor_name || 'No contractor'}`}
        actions={
          openCase ? (
            <Button to={`/pacc/cases/${openCase.id}`} variant="secondary" icon={FolderOpen}>Go to the open case</Button>
          ) : (
            <Button icon={FolderPlus} onClick={() => setOpening(true)}>Open a case</Button>
          )
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Project" description="Read-only. DPWH personnel keep these records." />
            <CardBody>
              <DetailList
                items={[
                  ['Status', <StatusBadge key="s" status={p.status} verifiedAt={p.completion_verified_at} />],
                  ['Type', PROJECT_TYPES[p.project_type] || titleCase(p.project_type)],
                  ['Implementing office', p.agency_name],
                  ['Contractor', p.contractor_name || 'No contractor'],
                  ['Contract amount', `${peso(p.revised_contract_amount)}${Number(p.variation_orders) ? ` (original ${peso(p.contract_amount)})` : ''}`],
                  ['Paid so far', `${peso(p.total_disbursed)} · ${pct(p.financial_progress, 1)}`],
                  ['Physical progress', `${pct(p.overall_progress, 1)} done · plan ${pct(p.planned_progress, 1)}`],
                  ['Notice to proceed', date(p.notice_to_proceed)],
                  ['Target completion', date(p.target_completion_date)],
                  ['360° photos', `${number(p.image_count)}${p.latest_inspection_date ? ` · last inspection ${date(p.latest_inspection_date)}` : ''}`],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Flag" description={p.auto_flag_evaluated_at ? `Checked automatically ${dateTime(p.auto_flag_evaluated_at)}` : 'Not evaluated yet'} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <FlagBadge flag={p.current_flag} long />
                <Pill>{REVIEW_STATUS[p.flag_review_status] || '—'}</Pill>
              </div>
              <p className="text-sm text-slate-600">Audit status: <strong className="text-slate-900">{AUDIT_STATUS[p.audit_status] || '—'}</strong></p>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Why this flag</p>
                <FlagReasons reasons={p.auto_flag_reasons || []} />
              </div>
            </CardBody>
          </Card>
        </div>

        {data.completion_verification && <CompletionVerificationCard state={data.completion_verification} actor="pacc" showPacc onDecide={decideCompletion} />}

        <Card className="overflow-hidden">
          <CardHeader
            title="Citizen reports"
            description={`${openReports.length} open of ${reports.length}. Reports are anonymous: nothing identifies the person who sent them.`}
            actions={openReports.length > 0 && <Button size="sm" variant="secondary" icon={CheckCheck} onClick={() => setClosing({ all: true })}>Close all open reports</Button>}
          />
          {reports.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No citizen reports on this project.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...openReports, ...reports.filter((r) => r.status === 'closed')].map((r) => (
                <ReportItem key={r.id} report={r} caseOf={cases.find((c) => c.id === r.case_id)} onClose={() => setClosing({ report: r })} />
              ))}
            </ul>
          )}
        </Card>

        {cases.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader title="PACC cases" description="Cases opened on this project, newest first" />
            <ul className="divide-y divide-slate-100">
              {cases.map((c) => (
                <li key={c.id} className="px-5 py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <Pill className={CASE_STATUS_META[c.status]?.cls}>{CASE_STATUS_META[c.status]?.label || c.status}</Pill>
                    {c.show_public && <Pill className="bg-emerald-50 text-emerald-800">Status shown to the public</Pill>}
                    <span className="text-xs text-slate-500">Opened {date(c.created_at)}{c.closed_at ? ` · closed ${date(c.closed_at)}` : ''}</span>
                    <Link to={`/pacc/cases/${c.id}`} className="ml-auto text-xs font-semibold text-brand-700 hover:underline">Open the case</Link>
                  </p>
                  <p className="mt-1 line-clamp-2 text-slate-700">{c.charges}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 032: the bidding rounds and their ranked bids, read-only (every action is off for PACC) */}
        {data.bidding && (
          <section aria-labelledby="pacc-bidding" className="space-y-3">
            <div>
              <h2 id="pacc-bidding" className="text-sm font-semibold text-slate-900">Bidding of the contract</h2>
              <p className="text-sm text-slate-500">Read-only. Rounds, bids, eligibility, rank and the award, as DPWH personnel recorded them.</p>
            </div>
            <BiddingRounds bidding={data.bidding} />
          </section>
        )}

        <ProjectRecords project={p} phases={phases} progress={progress} finance={finance} records={records} images={images} documents={documents} liquidation={data.liquidation} />

        <Card className="overflow-hidden">
          <CardHeader title="Auditor decisions" description="Every confirm or override of the flag, with the reason" />
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
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Audit findings" description="Issues found by auditors and the corrective actions" />
          {findings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No audit findings recorded.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {findings.map((f) => (
                <li key={f.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{f.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {SEVERITY_META[f.severity] && <Pill className={SEVERITY_META[f.severity].cls}>{SEVERITY_META[f.severity].label}</Pill>}
                      <Pill>{ACTION_STATUS[f.action_status] || titleCase(f.action_status)}</Pill>
                    </div>
                  </div>
                  <p className="mt-1 text-slate-700">{f.description}</p>
                  {f.recommendation && <p className="mt-1 text-xs text-slate-600"><strong>Recommendation:</strong> {f.recommendation}</p>}
                  {f.corrective_action && <p className="text-xs text-slate-600"><strong>Corrective action:</strong> {f.corrective_action}</p>}
                  <p className="mt-1 text-xs text-slate-500">Recorded {date(f.created_at)}{f.due_date ? ` · due ${date(f.due_date)}` : ''}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Flag history" description="Automatic checks and auditor decisions, newest first" />
          {history.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No flag history yet.</p>
          ) : (
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
          )}
        </Card>
      </div>

      <OpenCaseModal
        open={opening}
        onClose={() => setOpening(false)}
        project={p}
        reports={openReports.filter((r) => !r.case_id)}
        onCreated={(cs) => {
          setOpening(false);
          toast.success('Case opened.');
          navigate(`/pacc/cases/${cs.id}`);
        }}
      />
      <CloseReportsDialog target={closing} openCount={openReports.length} onClose={() => setClosing(null)} onConfirm={confirmClose} />
    </>
  );
}

function ReportItem({ report: r, caseOf, onClose }) {
  const closed = r.status === 'closed';
  return (
    <li className={`px-5 py-4 text-sm ${closed ? 'bg-slate-50/60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">{REPORT_CATEGORY_LABELS[r.category] || titleCase(r.category)}</span>
          <Pill className={REPORT_STATUS_CLS[r.status]}>{REPORT_STATUS_LABELS[r.status] || r.status}{closed && r.outcome ? ` · ${REPORT_OUTCOME_LABELS[r.outcome] || r.outcome}` : ''}</Pill>
          {caseOf && <Pill className={CASE_STATUS_META[caseOf.status]?.cls}>In a case · {CASE_STATUS_META[caseOf.status]?.label || caseOf.status}</Pill>}
          <span className="text-xs text-slate-500">Sent {date(r.submitted_on)}</span>
        </div>
        {!closed && <Button size="sm" variant="secondary" onClick={onClose}>Close…</Button>}
      </div>
      <p className={`mt-2 whitespace-pre-line break-words ${closed ? 'text-slate-500' : 'text-slate-700'}`}>{r.description}</p>
      {r.files?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Proof photos">
          {r.files.map((f, i) =>
            f.url ? (
              <li key={f.id}>
                <a href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-brand-400">
                  <img src={f.url} alt={`Proof photo ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" className="h-24 w-32 object-cover" />
                </a>
              </li>
            ) : (
              <li key={f.id} className="grid h-24 w-32 place-items-center rounded-lg bg-slate-100 text-center text-xs text-slate-500 ring-1 ring-slate-200">
                <span><ImageOff className="mx-auto mb-1 h-4 w-4" aria-hidden />Photo unavailable</span>
              </li>
            ),
          )}
        </ul>
      )}
    </li>
  );
}

/** Choose the outcome, then close one report (`target.report`) or all open reports (`target.all`). */
function CloseReportsDialog({ target, openCount, onClose, onConfirm }) {
  const [outcome, setOutcome] = useState('');
  const all = Boolean(target?.all);
  return (
    <ConfirmDialog
      open={Boolean(target)}
      onClose={() => {
        setOutcome('');
        onClose();
      }}
      title={all ? 'Close all open reports' : 'Close this report'}
      description={all ? `${openCount} open report${openCount === 1 ? '' : 's'} on this project will be closed with the same outcome.` : REPORT_CATEGORY_LABELS[target?.report?.category]}
      confirmLabel={all ? 'Close all' : 'Close report'}
      confirmVariant="primary"
      confirmIcon={CheckCheck}
      confirmDisabled={!outcome}
      onConfirm={async () => {
        await onConfirm(outcome);
        setOutcome('');
      }}
    >
      <Field label="Outcome" required hint="The person who sent it sees only that it is closed, never the outcome.">
        {(a) => (
          <Select {...a} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">Choose an outcome</option>
            {Object.entries(REPORT_OUTCOME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        )}
      </Field>
      <p className="text-xs text-slate-500">A closed report no longer counts toward the 10 open reports that refer a project to PACC.</p>
    </ConfirmDialog>
  );
}
