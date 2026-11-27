/**
 * Project deletion requests (migration 027). DPWH Personnel delete a project only with an approval from the
 * System Administrator: valid for 7 days, used once, by the requester only. The API enforces all of this;
 * these helpers only decide what the project page shows.
 */

/** What each request status means, as shown on the Deletion requests page. */
export const DELETION_REQUEST_STATUS = {
  pending: { label: 'Waiting for approval', cls: 'bg-amber-50 text-amber-800' },
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-800' },
  declined: { label: 'Declined', cls: 'bg-red-50 text-red-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-slate-100 text-slate-700' },
  used: { label: 'Project deleted', cls: 'bg-slate-800 text-white' },
  expired: { label: 'Expired', cls: 'bg-slate-100 text-slate-700' },
};

const PACC_WARNINGS = {
  under_investigation: 'This project is under PACC investigation. Deleting it removes records PACC may need.',
  case_filed: 'A PACC case has been filed on this project. Deleting it removes records PACC may need.',
};

/** The warning for the delete, request and approve dialogs when the project has an open PACC case; null otherwise. */
export function paccDeletionWarning(paccCaseStatus) {
  return PACC_WARNINGS[paccCaseStatus] ?? null;
}

/**
 * Where the project's latest deletion request (GET /projects/:id/deletion-request) leaves `userId`:
 *   'none'           no open request: Personnel may ask
 *   'pending'        the user's request waits for the Admin: they may cancel it
 *   'pending_other'  another Personnel account's request waits
 *   'approved'       the user's approval is valid: they may delete the project, once
 *   'approved_other' another account's approval is valid (only that account may use it)
 *   'expired'        the approval ran out unused: a new request may be made
 *   'declined'       the Admin declined: the note is shown and a new request may be made
 */
export function deletionRequestState(request, userId, now = new Date()) {
  if (!request) return 'none';
  const own = Boolean(userId) && request.requested_by === userId;
  switch (request.status) {
    case 'pending':
      return own ? 'pending' : 'pending_other';
    case 'approved': {
      if (request.used_at) return 'none';
      const valid = !request.expired && Boolean(request.approval_expires_at) && new Date(request.approval_expires_at).getTime() > now.getTime();
      if (!valid) return 'expired';
      return own ? 'approved' : 'approved_other';
    }
    case 'expired':
      return 'expired';
    case 'declined':
      return 'declined';
    default:
      return 'none'; // cancelled, used
  }
}
