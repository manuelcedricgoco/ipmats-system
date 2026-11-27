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

/** The PACC case status PACC chose to show in the public project drawer (`pacc_public_status`). Nothing else is public. */
export const PUBLIC_CASE_STATUS_LABELS = {
  under_investigation: 'Under PACC investigation',
  case_filed: 'Case filed',
};

/** Tracking-code symbols (server: services/citizenReports.js). No 0/O or 1/I, so a code can be read out loud. */
const TRACKING_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Formats what a visitor types into a tracking code: upper-case, valid symbols only, `XXXXX-XXXXX` at most. */
export function formatTrackingCodeInput(raw) {
  const symbols = [...String(raw ?? '').toUpperCase()].filter((ch) => TRACKING_ALPHABET.includes(ch)).slice(0, 10).join('');
  return symbols.length > 5 ? `${symbols.slice(0, 5)}-${symbols.slice(5)}` : symbols;
}

/** Proof photos for a citizen report: the same limits as the server (middleware/upload.js uploadProof). */
export const REPORT_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const REPORT_PROOF_MAX_FILES = 3;
export const REPORT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const REPORT_DESCRIPTION_MIN = 20;
export const REPORT_DESCRIPTION_MAX = 2000;

/** Returns a message for a photo the server would refuse, or null. The server checks again and has the last word. */
export function checkProofFile(file) {
  if (!REPORT_PROOF_TYPES.includes(file?.type)) return 'Use a JPEG, PNG or WebP photo.';
  if (file.size > REPORT_PROOF_MAX_BYTES) return 'Each photo must be 10 MB or smaller.';
  return null;
}

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
