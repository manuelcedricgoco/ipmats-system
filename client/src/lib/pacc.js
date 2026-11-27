/**
 * PACC portal — labels and the home page for each role.
 * Hiding PACC screens from other roles is a convenience only: the API (requireRole('pacc')) and RLS
 * are what keep reports and cases readable by PACC alone.
 */
import { STAFF_ROLES } from './constants.js';

/** Why a project is in the PACC inbox (server: services/citizenReports.js referralReasons). */
export const REFERRAL_LABELS = {
  auditor_red: 'Auditor-confirmed Red',
  citizen_reports: 'Citizen reports (10+)',
  open_case: 'Open case',
};

/** Pill colours for the referral reasons. */
export const REFERRAL_CLS = {
  auditor_red: 'bg-red-50 text-red-800',
  citizen_reports: 'bg-amber-50 text-amber-800',
  open_case: 'bg-brand-50 text-brand-800',
};

/** Citizen report categories, worded as on the public "Report a problem" form. */
export const REPORT_CATEGORY_LABELS = {
  photo_mismatch: "Site doesn't match the photos",
  substandard_materials: 'Substandard materials',
  overpricing_or_ghost: 'Overpricing or ghost project',
  work_not_done: 'Work not being done',
  other: 'Other',
};

export const REPORT_STATUS_LABELS = {
  received: 'Received',
  under_review: 'Under review',
  closed: 'Closed',
};

/** Outcome PACC gives a report when closing it. */
export const REPORT_OUTCOME_LABELS = {
  valid: 'Valid',
  invalid: 'Invalid',
  duplicate: 'Duplicate',
};

export const CASE_STATUS_META = {
  under_investigation: { label: 'Under investigation', cls: 'bg-amber-50 text-amber-800' },
  case_filed: { label: 'Case filed', cls: 'bg-red-50 text-red-800' },
  resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-800' },
  dismissed: { label: 'Dismissed', cls: 'bg-slate-100 text-slate-700' },
};

/** Case status changes PACC may make (mirrors the server's canTransition in services/citizenReports.js). Closed is final. */
const CASE_TRANSITIONS = {
  under_investigation: ['case_filed', 'dismissed'],
  case_filed: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export function nextCaseStatuses(status) {
  return [...(CASE_TRANSITIONS[status] ?? [])];
}

export const isClosedCaseStatus = (status) => status === 'resolved' || status === 'dismissed';

/** Where a signed-in account belongs: PACC → /pacc, staff → /app, anyone else → the public portal. */
export function homePathForRole(role) {
  if (role === 'pacc') return '/pacc';
  if (STAFF_ROLES.includes(role)) return '/app';
  return '/';
}
