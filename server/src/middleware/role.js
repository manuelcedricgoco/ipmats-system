import { adminClient } from '../config/supabase.js';
import { assertContractorDoesNotComplete, assertContractorOwnsProject } from '../services/contractorAccess.js';
import { HttpError, forbidden, unauthorized, unwrap } from '../utils/httpError.js';

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  PERSONNEL: 'dpwh_personnel',
  AUDITOR: 'auditor',
  PACC: 'pacc',
  CONTRACTOR: 'contractor',
});
/** Staff roles. PACC and Contractor accounts are not staff. */
export const STAFF = [ROLES.ADMIN, ROLES.PERSONNEL, ROLES.AUDITOR];
/**
 * Who may open a project's pages (project, phases, progress, photos, finance, documents, flags,
 * findings): staff, and contractor accounts for their own company's projects only (RLS, 029).
 */
export const PROJECT_VIEWERS = [...STAFF, ROLES.CONTRACTOR];
/** Who may submit progress reports and upload 360° photos (contractors: own company's projects, requireOwnProject). */
export const PROJECT_REPORTERS = [ROLES.PERSONNEL, ROLES.CONTRACTOR];

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

/** The project's company and whether that company is active (service role: a contractor cannot read other companies' projects). */
async function loadProjectCompany(projectId) {
  return unwrap(await adminClient.from('projects').select('id, contractor_id, contractor:contractors(is_active)').eq('id', projectId).maybeSingle());
}

/**
 * Contractor accounts write only to their own active company's projects (403 "You can only update
 * your company's projects."). Other roles pass without a lookup. Placed after requireWriteAccess
 * and before any upload is read, so a refused photo is never processed.
 */
export function makeRequireOwnProject(load = loadProjectCompany) {
  return async (req, _res, next) => {
    if (req.user?.role !== ROLES.CONTRACTOR) return next();
    try {
      assertContractorOwnsProject(await load(req.params.id), req.user);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
export const requireOwnProject = makeRequireOwnProject();

/**
 * Contractors do not complete a project (DPWH Personnel confirm completion): a progress report
 * from a contractor cannot carry an actual completion date, and its photo upload cannot be marked
 * final as-built (403 "Only DPWH Personnel can confirm a project's completion."). Placed after
 * validate, so it sees the parsed body. Other roles pass.
 */
export function refuseContractorCompletion(req, _res, next) {
  try {
    assertContractorDoesNotComplete(req.body, req.user);
    return next();
  } catch (err) {
    return next(err);
  }
}
