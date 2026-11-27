/**
 * Authentication.
 * Every request gets:
 *   req.user  – { id, email, role, profile } or null (anonymous)
 *   req.db    – Supabase client acting AS the caller (RLS enforced) for reads
 * The JWT is verified by Supabase Auth (getUser), never trusted blindly.
 */
import { anonClient, userClient } from '../config/supabase.js';
import { forbidden, unauthorized } from '../utils/httpError.js';

export const SUSPENDED_MESSAGE = 'This account has been suspended by the System Administrator. Contact the System Administrator to lift the suspension.';
/** PACC manages its own accounts (the System Administrator cannot lift a PACC suspension). */
export const PACC_SUSPENDED_MESSAGE = 'Your account is suspended. Ask another PACC member to lift the suspension.';

export function suspendedMessage(role) {
  return role === 'pacc' ? PACC_SUSPENDED_MESSAGE : SUSPENDED_MESSAGE;
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export async function authenticate(req, _res, next) {
  try {
    req.user = null;
    req.db = anonClient;
    const token = bearer(req);
    if (!token) return next();

    const db = userClient(token);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) throw unauthorized('Session expired or invalid. Please sign in again.');

    const { data: profile, error: pErr } = await db
      .from('profiles')
      .select('id, email, full_name, role, agency_id, position, is_active, approval_status, requested_role, requested_at, review_note, avatar_path, suspended_at')
      .eq('id', data.user.id)
      .single();
    if (pErr || !profile) throw unauthorized('No profile found for this account.');
    if (!profile.is_active) {
      // The client recognises "has been suspended" / "account is suspended" and shows it on the sign-in page after signing out.
      throw forbidden(
        profile.suspended_at
          ? suspendedMessage(profile.role)
          : 'This account has been deactivated. Contact the System Administrator.',
      );
    }

    req.user = { id: data.user.id, email: data.user.email, role: profile.role, profile };
    req.db = db;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}
