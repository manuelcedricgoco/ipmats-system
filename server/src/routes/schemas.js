/**
 * WEEK 1 — request validation (zod). Invalid input never reaches the database:
 * the API answers 400 with the field and the reason.
 */
import { z } from 'zod';

const empty = (v) => (v === '' || v === 'null' || v === undefined ? undefined : v);
const opt = (schema) => z.preprocess(empty, schema.optional());
const nullable = (schema) => z.preprocess((v) => (v === '' || v === 'null' ? null : v), schema.nullable().optional());

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const money = z.coerce.number().finite().min(0).max(1e13);
const text = (max) => z.string().trim().max(max);

export const uuidParam = z.string().uuid();
export const ROLES = ['admin', 'dpwh_personnel', 'auditor'];
export const PROJECT_TYPES = ['road', 'bridge', 'flood_control', 'building', 'water_supply', 'other'];
// Week 3: status is set automatically (Not started / Ongoing / Delayed / Completed).
// Personnel may only set Suspended or Terminated; any other value means "automatic".
export const MANUAL_STATUSES = ['suspended', 'terminated'];
const statusField = z.preprocess((v) => (v === undefined || v === '' ? undefined : MANUAL_STATUSES.includes(v) ? v : 'auto'), z.enum(['auto', 'suspended', 'terminated']).optional());

// The Project ID (project_code) is NOT accepted from clients: the database assigns it on insert
// (migration 008, e.g. 26OM0332) and blocks any change afterwards. zod drops unknown keys,
// so a project_code sent by a client is ignored.
const projectFields = {
  name: text(300).min(5),
  description: nullable(text(4000)),
  project_type: z.enum(PROJECT_TYPES),
  agency_id: z.coerce.number().int().positive(),
  contractor_id: nullable(z.string().uuid()),
  contract_ref_no: nullable(text(80)),
  municipality_id: z.coerce.number().int().positive(),
  barangay_id: nullable(z.coerce.number().int().positive()),
  // Quick range check here; the exact province-boundary check runs in the projects controller
  // (it needs both coordinates, also when an edit changes only one of them).
  latitude: z.coerce.number().min(12, 'Must be within Occidental Mindoro').max(14.05, 'Must be within Occidental Mindoro'),
  longitude: z.coerce.number().min(119.85, 'Must be within Occidental Mindoro').max(121.3, 'Must be within Occidental Mindoro'),
  approved_budget: money,
  contract_amount: nullable(money),
  notice_to_proceed: nullable(isoDate),
  duration_days: nullable(z.coerce.number().int().positive().max(3650)),
  target_completion_date: nullable(isoDate),
  actual_completion_date: nullable(isoDate),
  fund_source: nullable(text(200)),
  status: statusField,
};

const contractWithinBudget = (p) => p.contract_amount == null || p.approved_budget == null || p.contract_amount <= p.approved_budget;

export const projectCreate = z
  .object(projectFields)
  .refine(contractWithinBudget, { message: 'Contract amount cannot exceed the approved budget (ABC)', path: ['contract_amount'] });

export const projectUpdate = z
  .object(Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])))
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update')
  .refine(contractWithinBudget, { message: 'Contract amount cannot exceed the approved budget (ABC)', path: ['contract_amount'] });

const contractorFields = {
  name: text(200).min(3),
  pcab_license_no: nullable(text(60)),
  classification: nullable(text(20)),
  address: nullable(text(300)),
  contact_person: nullable(text(120)),
  contact_number: nullable(text(40)),
  email: nullable(z.string().trim().email().max(200)),
  is_active: z.boolean().optional(),
};
export const contractorCreate = z.object(contractorFields);
export const contractorUpdate = z
  .object(Object.fromEntries(Object.entries(contractorFields).map(([k, v]) => [k, v.optional()])))
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const agencyCreate = z.object({
  code: text(30).min(2).regex(/^[A-Za-z0-9-]+$/),
  name: text(200).min(3),
  office_type: z.enum(['district_engineering_office', 'field_office', 'other']),
  address: nullable(text(300)),
  is_active: z.boolean().optional(),
});
export const agencyUpdate = agencyCreate.partial().refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const userCreate = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'At least 8 characters').max(72),
  full_name: text(120).min(2),
  role: z.enum(ROLES),
  agency_id: nullable(z.coerce.number().int().positive()),
  position: nullable(text(120)),
});
export const userUpdate = z
  .object({
    full_name: text(120).min(2).optional(),
    role: z.enum(ROLES).optional(),
    agency_id: nullable(z.coerce.number().int().positive()),
    position: nullable(text(120)),
    is_active: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const userApprove = z.object({
  role: z.enum(['admin', 'dpwh_personnel', 'auditor']),
  agency_id: nullable(z.coerce.number().int().positive()),
  position: nullable(text(120)),
});
export const userReject = z.object({ note: nullable(text(500)) });
/** Suspending an account always needs a reason (kept on the profile and in the activity log). */
export const userSuspend = z.object({ reason: text(500).min(5, 'Give a reason of at least 5 characters') });

export const meUpdate = z.object({ full_name: text(120).min(2), position: nullable(text(120)) });

// ---------------------------------------------------------------------------
// WEEK 2 — phases, progress updates and financial records
// (shape only; the rules that need the project's data are in services/validationRules.js)
// ---------------------------------------------------------------------------
export const phasesReplace = z.object({
  phases: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        sequence_no: z.coerce.number().int().min(1).max(50),
        name: text(160).min(2),
        weight: z.coerce.number().positive().max(100),
        planned_start: nullable(isoDate),
        planned_end: nullable(isoDate),
        remarks: nullable(text(1000)),
      }),
    )
    .min(1, 'Add at least one phase')
    .max(20, 'At most 20 phases'),
});

export const progressSubmit = z.object({
  report_date: isoDate,
  remarks: opt(text(2000)),
  actual_completion_date: nullable(isoDate),
  phases: z
    .array(
      z.object({
        phase_id: z.string().uuid(),
        accomplishment: z.coerce.number().min(0, 'Accomplishment is 0–100%').max(100, 'Accomplishment is 0–100%'),
        actual_start: nullable(isoDate),
        actual_end: nullable(isoDate),
        remarks: nullable(text(1000)),
      }),
    )
    .min(1, 'Report at least one phase'),
});

const FINANCE_TYPES = ['variation_order', 'obligation', 'disbursement', 'expense'];
export const financialRecord = z
  .object({
    record_type: z.enum(FINANCE_TYPES),
    amount: z.coerce.number().finite().min(-1e13).max(1e13),
    record_date: isoDate,
    reference_no: nullable(text(80)),
    description: nullable(text(1000)),
    // Gap fix: financial allocation per construction phase (optional)
    phase_id: nullable(z.string().uuid()),
  })
  .refine((r) => r.amount !== 0, { message: 'Amount cannot be zero', path: ['amount'] })
  .refine((r) => r.record_type === 'variation_order' || r.amount > 0, { message: 'Amount must be positive (only a variation order can be negative)', path: ['amount'] });

// ---------------------------------------------------------------------------
// WEEK 3 — 360° images, flag reviews and audit findings
// ---------------------------------------------------------------------------
const bool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());
export const FLAGS = ['green', 'yellow', 'red'];
const AUDIT_STATUSES = ['not_audited', 'under_review', 'verified', 'for_investigation', 'closed'];

// Multipart form fields arrive as strings, hence the coercion
export const imageUpload = z.object({
  inspection_date: isoDate,
  phase_id: opt(z.string().uuid()),
  latitude: opt(z.coerce.number().min(-90).max(90)),
  longitude: opt(z.coerce.number().min(-180).max(180)),
  captured_at: opt(z.string().datetime({ offset: true }).or(isoDate)),
  is_final: z.preprocess(empty, bool.default(false)),
  caption: opt(text(300)),
});

export const imageUpdate = z
  .object({ caption: nullable(text(300)), is_final: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

export const flagReview = z
  .object({
    decision: z.enum(['confirm', 'override']),
    final_flag: opt(z.enum(FLAGS)),
    reason: text(2000).min(10, 'Give a reason of at least 10 characters'),
    audit_status: opt(z.enum(AUDIT_STATUSES)),
  })
  .refine((r) => r.decision === 'confirm' || r.final_flag, { message: 'Choose the flag to apply when overriding', path: ['final_flag'] });

const findingFields = {
  title: text(200).min(5),
  description: text(4000).min(10),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  recommendation: nullable(text(2000)),
  corrective_action: nullable(text(2000)),
  action_status: z.enum(['open', 'in_progress', 'resolved', 'closed']).default('open'),
  due_date: nullable(isoDate),
  phase_id: nullable(z.string().uuid()),
  // Gap fix: the DPWH personnel account responsible for the corrective action
  assigned_to: nullable(z.string().uuid()),
};
export const findingCreate = z.object(findingFields);
export const findingUpdate = z
  .object(Object.fromEntries(Object.entries(findingFields).map(([k, v]) => [k, v.optional()])))
  .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)))
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

// ---------------------------------------------------------------------------
// Gap fixes (concept document): disclosure, assignments, documents, flag rules
// ---------------------------------------------------------------------------
/** Auditor / Admin: show a 360° photo or an audit finding to the public, or hide it again. */
export const publicToggle = z.object({ is_public: z.boolean() });

/** Assigned DPWH personnel: report progress on the corrective action of a finding. */
export const findingAction = z
  .object({
    corrective_action: nullable(text(2000)),
    action_status: z.enum(['in_progress', 'resolved']).optional(),
  })
  .refine((o) => o.corrective_action !== undefined || o.action_status !== undefined, 'Nothing to update');

export const DOCUMENT_TYPES = ['contract', 'program_of_work', 'progress_report', 'inspection_report', 'variation_order', 'payment_document', 'as_built_plan', 'other'];
/** Supporting project document (multipart fields). */
export const documentUpload = z.object({
  title: text(200).min(3, 'Give the document a title (at least 3 characters)'),
  doc_type: z.enum(DOCUMENT_TYPES),
  description: nullable(text(2000)),
  document_date: nullable(isoDate),
  phase_id: opt(z.string().uuid()),
});

/** Automatic flag thresholds (System Administrator). Same keys as DEFAULT_RULES. */
const pct = (max = 100) => z.coerce.number().finite().min(0).max(max);
export const flagRulesUpdate = z
  .object({
    slippage_green_max: pct(),
    slippage_yellow_max: pct(),
    image_max_age_days: z.coerce.number().int().min(1).max(365),
    gps_tolerance_m: z.coerce.number().int().min(10).max(50000),
    gps_red_m: z.coerce.number().int().min(10).max(100000),
    financial_variance_yellow: pct(),
    financial_variance_red: pct(),
    late_completion_tolerance_days: z.coerce.number().int().min(0).max(365),
    image_date_tolerance_days: z.coerce.number().int().min(0).max(365),
  })
  .refine((r) => r.slippage_green_max < r.slippage_yellow_max, { message: 'The Yellow slippage limit must be higher than the Green limit', path: ['slippage_yellow_max'] })
  .refine((r) => r.gps_tolerance_m < r.gps_red_m, { message: 'The Red GPS distance must be larger than the Yellow distance', path: ['gps_red_m'] })
  .refine((r) => r.financial_variance_yellow < r.financial_variance_red, { message: 'The Red payment gap must be larger than the Yellow gap', path: ['financial_variance_red'] });
