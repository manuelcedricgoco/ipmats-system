// `color`: map-pin colour on the public portal (pins are coloured by status there).
export const STATUS_META = {
  not_started: { label: 'Not started', cls: 'bg-slate-100 text-slate-700', color: '#64748b' },
  ongoing: { label: 'On-going', cls: 'bg-brand-50 text-brand-700', color: '#1d4ed8' },
  delayed: { label: 'Delayed', cls: 'bg-orange-50 text-orange-800', color: '#ea580c' },
  // Set automatically once every phase is at 100%, with a completion date and a final as-built photo. Never chosen by hand.
  completed: { label: 'Completed', cls: 'bg-emerald-50 text-emerald-800', color: '#059669' },
};
// Registration can start with these statuses (or Automatic); later status changes are calculated automatically.
// Completed is never offered: a new project cannot be finished yet.
export const MANUAL_STATUSES = [];
export const REGISTRATION_STATUSES = ['not_started', 'ongoing'];

export const PROJECT_TYPES = {
  road: 'Road',
  bridge: 'Bridge',
  flood_control: 'Flood control',
  building: 'Building',
  water_supply: 'Water supply',
  other: 'Other',
};

export const ROLE_LABELS = {
  admin: 'System Administrator',
  dpwh_personnel: 'DPWH Personnel',
  auditor: 'Auditor',
  pacc: 'PACC Investigator',
};

export const OFFICE_TYPES = {
  district_engineering_office: 'District Engineering Office',
  field_office: 'Field Office',
  other: 'Other',
};

export const STAFF_ROLES = ['admin', 'dpwh_personnel', 'auditor'];

/**
 * Status of a project's non-closed PACC case, shown to DPWH staff (Admin, Personnel, Auditor) whether or not PACC
 * shows it on the public portal (`projects.pacc_case_status`, migration 027). Only the status, never the case itself.
 */
export const PACC_CASE_STATUS_LABELS = {
  under_investigation: 'Under PACC investigation',
  case_filed: 'Case filed',
};

// Suspended accounts: Supabase Auth refuses the sign-in ("User is banned") and the API answers 403.
export const SUSPENDED_MESSAGE = 'Your account has been suspended by the System Administrator. Contact the System Administrator to lift the suspension.';
/** PACC manages its own accounts, so a suspended PACC account is sent to another PACC member (same text as the API). */
export const PACC_SUSPENDED_MESSAGE = 'Your account is suspended. Ask another PACC member to lift the suspension.';
/** True for Supabase's "banned" sign-in error and the API's "has been suspended" / "account is suspended" 403. */
export const isSuspensionError = (message = '') => /banned|has been suspended|account is suspended/i.test(String(message));
/** Supabase's sign-in "banned" error does not name the role, so the sign-in page says what both kinds of account can do. */
export const BANNED_SIGN_IN_MESSAGE = 'Your account is suspended. Contact the System Administrator, or, for a PACC account, ask another PACC member to lift the suspension.';
/** What the sign-in page says after a suspension. The API's 403 tells PACC accounts apart; the sign-in ban does not. */
export const suspensionNotice = (message = '') => {
  const text = String(message);
  if (/PACC member/i.test(text)) return PACC_SUSPENDED_MESSAGE;
  if (/banned/i.test(text)) return BANNED_SIGN_IN_MESSAGE;
  return SUSPENDED_MESSAGE;
};

// Week 2 — financial record types
export const RECORD_TYPES = {
  disbursement: 'Disbursement',
  obligation: 'Obligation',
  variation_order: 'Variation order',
  expense: 'Expense',
};
export const RECORD_TYPE_HINTS = {
  disbursement: 'Payment released to the contractor (advance payment, progress billing, final payment).',
  obligation: 'Funds committed for the project.',
  variation_order: 'Approved change to the contract amount. Use a negative amount for a deduction. Total limited to 10% of the original contract.',
  expense: 'Other project expense (testing, billboard, etc.).',
};
export const RECORD_TYPE_CLS = {
  disbursement: 'bg-brand-50 text-brand-800',
  obligation: 'bg-slate-100 text-slate-700',
  variation_order: 'bg-amber-50 text-amber-800',
  expense: 'bg-violet-50 text-violet-800',
};

// ---------------------------------------------------------------------------
// Week 3 — flags, audit and map
// ---------------------------------------------------------------------------
export const FLAG_META = {
  green: { label: 'Green', long: 'On track / completed', color: '#1f8a4c', bg: 'bg-emerald-50', text: 'text-emerald-800', ring: 'ring-emerald-600/20', dot: 'bg-emerald-600' },
  yellow: { label: 'Yellow', long: 'Needs attention', color: '#d39b0b', bg: 'bg-amber-50', text: 'text-amber-800', ring: 'ring-amber-600/25', dot: 'bg-amber-500' },
  red: { label: 'Red', long: 'For investigation', color: '#c8372d', bg: 'bg-red-50', text: 'text-red-800', ring: 'ring-red-600/20', dot: 'bg-red-600' },
};
export const REVIEW_STATUS = { pending: 'Awaiting auditor review', confirmed: 'Confirmed by auditor', overridden: 'Overridden by auditor' };
export const AUDIT_STATUS = {
  not_audited: 'Not audited',
  under_review: 'Under review',
  verified: 'Verified',
  for_investigation: 'For investigation',
  closed: 'Closed',
};
export const SEVERITY_META = {
  low: { label: 'Low', cls: 'bg-slate-100 text-slate-700' },
  medium: { label: 'Medium', cls: 'bg-amber-50 text-amber-800' },
  high: { label: 'High', cls: 'bg-orange-50 text-orange-800' },
  critical: { label: 'Critical', cls: 'bg-red-50 text-red-800' },
};
export const ACTION_STATUS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
export const OCC_MINDORO_CENTER = [13.0, 120.85];
