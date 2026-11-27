/**
 * Contractor accounts (migration 029): a contractor company's representatives read their own
 * company's projects (RLS: private.contractor_company()) and report progress and upload 360°
 * photos on them. These helpers are the API side of those rules.
 */
import { forbidden } from '../utils/httpError.js';

export const CONTRACTOR_PROJECT_MESSAGE = "You can only update your company's projects.";
export const CONTRACTOR_COMPANY_MESSAGE = 'Choose the contractor company for this account.';

/**
 * A contractor account may write to a project only when the project belongs to the account's
 * company and that company is active. `project` is { contractor_id, contractor: { is_active } }
 * (or null when it does not exist). Other roles are not checked here (their route guard decides).
 */
export function assertContractorOwnsProject(project, user) {
  if (user?.role !== 'contractor') return;
  const company = user.profile?.contractor_id;
  if (!project || !company || project.contractor_id !== company || project.contractor?.is_active !== true) {
    throw forbidden(CONTRACTOR_PROJECT_MESSAGE);
  }
}

/**
 * Contractors never receive PACC data: drop every pacc_* field (027: pacc_case_status) from a
 * project row sent to a contractor account. Rows for other roles are returned unchanged.
 */
export function withoutPaccFields(row, user) {
  if (user?.role !== 'contractor' || !row) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('pacc_')));
}

/** "12 345" and "12345" are the same licence: compared without case or spaces. null when either is missing. */
export function licenceMatches(typed, onFile) {
  const norm = (v) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
  if (!norm(typed) || !norm(onFile)) return null;
  return norm(typed) === norm(onFile);
}
