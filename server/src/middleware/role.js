import { adminClient } from '../config/supabase.js';
import { HttpError, forbidden, unauthorized } from '../utils/httpError.js';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  PERSONNEL: 'dpwh_personnel',
  AUDITOR: 'auditor',
});
export const STAFF = [ROLES.ADMIN, ROLES.PERSONNEL, ROLES.AUDITOR];

/**
 * Allow only the listed roles. Accounts waiting for approval (or declined) have no role and are
 * refused here; the approval check is repeated so a role can never be used before approval.
 */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.profile?.approval_status !== 'approved') return next(forbidden('Your account is waiting for approval by the System Administrator.'));
    if (!allowed.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

/** Any signed-in account whose registration has been approved (no particular role needed). */
export function requireApproved(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.profile?.approval_status !== 'approved') return next(forbidden('You can add a profile photo once your account is approved.'));
  return next();
}

/** Writes need the service-role client; fail clearly if the server lacks it. */
export function requireWriteAccess(_req, _res, next) {
  if (!adminClient) {
    return next(new HttpError(503, 'The API is running in read-only mode: SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'));
  }
  return next();
}
