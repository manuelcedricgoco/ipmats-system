import { Trash2, Undo2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../lib/api.js';
import { deletionRequestState, paccDeletionWarning } from '../../lib/deletionRequests.js';
import { date, dateTime } from '../../lib/format.js';
import Button from '../common/Button.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';
import { Alert } from '../common/Feedback.jsx';
import { Field, Textarea } from '../common/Form.jsx';

const REASON_MIN = 10;
const REASON_MAX = 500;

/** The PACC warning shown in the delete, request and approve dialogs (nothing when the project has no open case). */
export function PaccDeletionWarning({ status }) {
  const text = paccDeletionWarning(status);
  return text ? <Alert tone="warning">{text}</Alert> : null;
}

/**
 * Project page header buttons for deleting a project (migration 027).
 *   System Administrator: "Delete project", directly.
 *   DPWH Personnel: "Request deletion" → (pending) "Cancel deletion request" → (approved, for 7 days) "Delete project".
 * `request` is the project's latest deletion request (GET /projects/:id/deletion-request), `requestLoaded` false while it
 * loads; the API checks everything again.
 */
export default function DeleteProjectControls({ project, request, requestLoaded = true, onChanged }) {
  const { role, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null); // 'delete' | 'request' | 'cancel'
  const close = () => setDialog(null);

  const isAdmin = role === 'admin';
  if (!isAdmin && role !== 'dpwh_personnel') return null;
  if (!isAdmin && !requestLoaded) return null; // Personnel: wait for the request, so the right button shows
  const state = isAdmin ? null : deletionRequestState(request, profile?.id);
  const canAsk = ['none', 'expired', 'declined'].includes(state);

  const remove = async () => {
    await api.del(`/projects/${project.id}`);
    toast.success(`Project ${project.project_code} deleted.`);
    navigate('/app/projects', { replace: true });
  };
  const cancelRequest = async () => {
    await api.post(`/deletion-requests/${request.id}/cancel`);
    toast.success('Deletion request cancelled.');
    close();
    onChanged();
  };

  return (
    <>
      {isAdmin && <Button variant="secondary" icon={Trash2} onClick={() => setDialog('delete')} className="text-red-700">Delete project</Button>}
      {canAsk && <Button variant="secondary" icon={Trash2} onClick={() => setDialog('request')} className="text-red-700">Request deletion</Button>}
      {state === 'pending' && <Button variant="secondary" icon={Undo2} onClick={() => setDialog('cancel')}>Cancel deletion request</Button>}
      {state === 'approved' && (
        <Button variant="danger" icon={Trash2} onClick={() => setDialog('delete')}>Delete project (approved until {date(request.approval_expires_at)})</Button>
      )}

      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={close}
        title="Delete this project?"
        description={`${project.project_code} · ${project.name}`}
        confirmLabel="Delete project"
        confirmIcon={Trash2}
        onConfirm={remove}
      >
        <PaccDeletionWarning status={project.pacc_case_status} />
        <p className="text-slate-600">The project record, its phases, progress reports, financial records, 360° photos and documents are removed permanently. This cannot be undone.</p>
        {!isAdmin && <p className="text-xs text-slate-500">Your approval can be used once. After this, deleting needs a new approval.</p>}
      </ConfirmDialog>

      <RequestDeletionDialog
        open={dialog === 'request'}
        project={project}
        onClose={close}
        onSent={() => {
          close();
          toast.success('Deletion request sent to the System Administrator.');
          onChanged();
        }}
      />

      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={close}
        title="Cancel the deletion request?"
        description={`${project.project_code} · ${project.name}`}
        confirmLabel="Cancel request"
        confirmVariant="primary"
        confirmIcon={Undo2}
        onConfirm={cancelRequest}
      >
        <p className="text-slate-600">The System Administrator will no longer see it. You can ask again later.</p>
      </ConfirmDialog>
    </>
  );
}

function RequestDeletionDialog({ open, project, onClose, onSent }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  const length = reason.trim().length;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="Ask to delete this project?"
      description={`${project.project_code} · ${project.name}`}
      confirmLabel="Send request"
      confirmVariant="primary"
      confirmIcon={Send}
      confirmDisabled={length < REASON_MIN}
      onConfirm={async () => {
        await api.post(`/projects/${project.id}/deletion-requests`, { reason: reason.trim() });
        onSent();
      }}
    >
      <PaccDeletionWarning status={project.pacc_case_status} />
      <p className="text-slate-600">
        The System Administrator reviews the request. Once approved, you can delete the project yourself within 7 days, once.
      </p>
      <Field label="Why should this project be deleted?" required hint={`${length}/${REASON_MAX} characters · at least ${REASON_MIN}`}>
        {(a) => (
          <Textarea
            {...a}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX}
            rows={4}
            placeholder="e.g. Registered twice by mistake; the correct record is 26-0123"
          />
        )}
      </Field>
    </ConfirmDialog>
  );
}

/**
 * The line under the project header that says where the project's deletion request stands. Personnel see their own
 * request (and whether another account has one open); the Admin sees a pending request with a link to review it.
 */
export function DeletionRequestNotice({ request }) {
  const { role, profile } = useAuth();
  if (!request) return null;
  const who = request.requested_by_name || 'A DPWH Personnel account';

  if (role === 'admin') {
    if (request.status !== 'pending') return null;
    return (
      <Alert tone="info" className="mb-5">
        {who} asked on {date(request.created_at)} to delete this project.{' '}
        <Link to="/app/deletion-requests" className="font-semibold underline">Review deletion requests</Link>
      </Alert>
    );
  }
  if (role !== 'dpwh_personnel') return null;

  const note = request.decision_note && <span className="mt-1 block">Note from the System Administrator: “{request.decision_note}”</span>;
  switch (deletionRequestState(request, profile?.id)) {
    case 'pending':
      return <Alert tone="info" className="mb-5">You asked on {date(request.created_at)} to delete this project. The System Administrator has not decided yet.</Alert>;
    case 'pending_other':
      return <Alert tone="info" className="mb-5">{who} asked on {date(request.created_at)} to delete this project. The System Administrator has not decided yet.</Alert>;
    case 'approved':
      return (
        <Alert tone="warning" className="mb-5">
          The System Administrator approved deleting this project. You can delete it once, until {dateTime(request.approval_expires_at)}.
          {note}
        </Alert>
      );
    case 'approved_other':
      return <Alert tone="info" className="mb-5">Deleting this project was approved for {who}, until {dateTime(request.approval_expires_at)}.</Alert>;
    case 'expired':
      return <Alert tone="info" className="mb-5">The approval to delete this project expired unused. You can ask again.</Alert>;
    case 'declined':
      return (
        <Alert tone="info" className="mb-5">
          The System Administrator declined {request.requested_by === profile?.id ? 'your' : 'the'} request to delete this project{request.decided_at ? ` on ${date(request.decided_at)}` : ''}. You can ask again.
          {note}
        </Alert>
      );
    default:
      return null;
  }
}
