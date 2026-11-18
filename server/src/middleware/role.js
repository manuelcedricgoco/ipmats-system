import { adminClient } from '../config/supabase.js';
import { HttpError, forbidden, unauthorized } from '../utils/httpError.js';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  PERSONNEL: 'dpwh_personnel',
  AUDITOR: 'auditor',
  PUBLIC: 'public',
});
export const STAFF = [ROLES.ADMIN, ROLES.PERSONNEL, ROLES.AUDITOR];

/** Allow only the listed roles. */
export function requireRole(...roles) {
  const allowed = roles.flat();
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!allowed.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

/** Writes need the service-role client; fail clearly if the server lacks it. */
export function requireWriteAccess(_req, _res, next) {
  if (!adminClient) {
    return next(new HttpError(503, 'The API is running in read-only mode: SUPABASE_SERVICE_ROLE_KEY is not configured on the server.'));
  }
  return next();
}
