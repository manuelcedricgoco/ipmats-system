import { Check, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '../../components/common/Badges.jsx';
import { Card, PageHeader } from '../../components/common/Card.jsx';
import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/common/Feedback.jsx';
import { Field, Textarea } from '../../components/common/Form.jsx';
import Pagination from '../../components/common/Pagination.jsx';
import RowActions from '../../components/common/RowActions.jsx';
import { PaccDeletionWarning } from '../../components/projects/DeleteProjectControls.jsx';
import PaccCaseChip from '../../components/projects/PaccCaseChip.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useRowBusy } from '../../hooks/useRowBusy.js';
import { api } from '../../lib/api.js';
import { DELETION_REQUEST_STATUS } from '../../lib/deletionRequests.js';
import { date, dateTime } from '../../lib/format.js';

const FILTERS = [
  { value: 'pending', label: 'Waiting for a decision' },
  { value: 'all', label: 'All requests' },
];

/**
 * Project deletion requests (migration 027), System Administrator only. DPWH Personnel ask to delete a project; an
 * approval lets the requester delete it once, within 7 days. The Admin deletes projects directly from the project page.
 */
export default function DeletionRequestsPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi('/deletion-requests', { status, page, pageSize: 20 });
  const rows = useRowBusy();
  const [deciding, setDeciding] = useState(null); // { request, decision: 'approve' | 'decline' }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Deletion requests"
        description="DPWH Personnel ask here before deleting a project. An approval lets the person who asked delete the project once, within 7 days."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => { setStatus(f.value); setPage(1); }}
            className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-inset transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${status === f.value ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !data && <PageLoader withHeader={false} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && data.data.length === 0 && (
        <EmptyState icon={Trash2} title={status === 'pending' ? 'No requests waiting' : 'No deletion requests yet'} description="Requests from DPWH Personnel to delete a project appear here." />
      )}
      {data && data.data.length > 0 && (
        <Card className={`overflow-hidden transition-opacity duration-200 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <ul className="divide-y divide-slate-100">
            {data.data.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.project_id ? (
                      <Link to={`/app/projects/${r.project_id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline">{r.project_name}</Link>
                    ) : (
                      <span className="font-semibold text-slate-900">{r.project_name}</span>
                    )}
                    <span className="font-mono text-xs text-slate-500">{r.project_code}</span>
                    <StatusPill request={r} />
                    <PaccCaseChip status={r.pacc_case_status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-500">Asked by {r.requested_by_name || '—'} · {dateTime(r.created_at)}</p>
                  <p className="whitespace-pre-line break-words text-sm text-slate-700">{r.reason}</p>
                  <Decision request={r} />
                </div>
                {r.status === 'pending' && (
                  <RowActions
                    name={r.project_code}
                    busy={rows.isBusy(r.id)}
                    onApprove={() => setDeciding({ request: r, decision: 'approve' })}
                    onReject={() => setDeciding({ request: r, decision: 'decline' })}
                    rejectLabel="Decline"
                    className="shrink-0"
                  />
                )}
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </Card>
      )}

      <DecisionDialog value={deciding} run={rows.run} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); reload(); }} />
    </>
  );
}

function StatusPill({ request }) {
  const key = request.expired ? 'expired' : request.status;
  const meta = DELETION_REQUEST_STATUS[key] || { label: key, cls: undefined };
  return <Pill className={meta.cls}>{meta.label}</Pill>;
}

/** Who decided, when, the note, and how long an approval lasts. */
function Decision({ request: r }) {
  if (!r.decided_at && !r.decision_note) return null;
  const by = r.decided_by_name || 'the System Administrator';
  // A request closed because the Admin deleted the project keeps its approval (if any) and gets a note; a pending one
  // closed that way has only the note. A request the requester cancelled has neither.
  const approvedThenClosed = r.status === 'cancelled' && Boolean(r.approval_expires_at);
  const verb = { approved: 'Approved', declined: 'Declined', used: 'Approved', expired: 'Approved' }[r.status];
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {r.decided_at && verb && <p>{verb} by {by} · {dateTime(r.decided_at)}</p>}
      {r.decided_at && approvedThenClosed && <p>Approved by {by} on {date(r.decided_at)}; closed when the project was deleted.</p>}
      {r.status === 'approved' && !r.expired && r.approval_expires_at && <p>Valid until {dateTime(r.approval_expires_at)}, for {r.requested_by_name || 'the requester'} only, once.</p>}
      {r.status === 'used' && r.used_at && <p>Used on {date(r.used_at)}: the project was deleted.</p>}
      {r.decision_note && <p className="mt-1 whitespace-pre-line break-words text-slate-700">Note: {r.decision_note}</p>}
    </div>
  );
}

function DecisionDialog({ value, run, onClose, onDone }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  useEffect(() => {
    if (value) setNote('');
  }, [value]);
  const r = value?.request;
  const approve = value?.decision === 'approve';

  return (
    <ConfirmDialog
      open={Boolean(value)}
      onClose={onClose}
      title={approve ? 'Approve deleting this project?' : 'Decline this deletion request?'}
      description={r ? `${r.project_code} · ${r.project_name}` : ''}
      confirmLabel={approve ? 'Approve' : 'Decline request'}
      confirmVariant={approve ? 'primary' : 'danger'}
      confirmIcon={approve ? Check : X}
      onConfirm={async () => {
        await run(r.id, () => api.post(`/deletion-requests/${r.id}/${approve ? 'approve' : 'decline'}`, { note: note.trim() || null }));
        toast.success(approve ? 'Deletion approved. The requester can delete the project within 7 days.' : 'Deletion request declined.');
        onDone();
      }}
    >
      {r && approve && <PaccDeletionWarning status={r.pacc_case_status} />}
      {r && (
        <p className="text-slate-600">
          {approve
            ? `${r.requested_by_name || 'The requester'} can then delete the project once, within 7 days. The project, its phases, progress reports, financial records, 360° photos and documents are removed permanently.`
            : `${r.requested_by_name || 'The requester'} sees your note on the project page and can ask again.`}
        </p>
      )}
      <Field label="Note (optional, shown to the requester)" hint={`${note.length}/500 characters`}>
        {(a) => <Textarea {...a} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
      </Field>
    </ConfirmDialog>
  );
}
