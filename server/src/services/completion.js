/**
 * WEEK 2 — Overall project completion (Julina Mae Escabosa, Back-end)
 *
 * Overall completion = Σ(weight × accomplishment) ÷ Σ(weight)
 * e.g. phases 10% @100, 20% @100, 20% @50, 35% @0, 15% @0 → 10 + 20 + 10 = 40%
 *
 * Pure functions (no database calls) so they are easy to unit test.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' / Date / ISO string → Date at UTC midnight (or null). */
export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(typeof value === 'string' && value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const isoDate = (d) => toDate(d).toISOString().slice(0, 10);

export function addDays(value, days) {
  const d = toDate(value);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return isoDate(d);
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));

/** Weighted overall completion (0–100) of a list of phases. */
export function computeOverallProgress(phases = []) {
  const totalWeight = phases.reduce((s, p) => s + Number(p.weight || 0), 0);
  if (totalWeight <= 0) return 0;
  const weighted = phases.reduce((s, p) => s + Number(p.weight || 0) * clamp(Number(p.accomplishment || 0)), 0);
  return round2(clamp(weighted / totalWeight));
}

/**
 * Progress rules (migration 030). A phase with sub-activities: its accomplishment is the weighted
 * sub-activity accomplishment, Σ(weight × accomplishment) ÷ Σ(weight) (the weights total 100), to
 * 2 decimals. A phase without sub-activities keeps its own %.
 */
export function computeActivityProgress(activities = []) {
  return computeOverallProgress(activities);
}

/** Highest overall progress a project shows until the Auditor and PACC have both verified its completion. */
export const UNVERIFIED_PROGRESS_CAP = 99;
export const COMPLETED_AWAITING_LABEL = 'Completed – awaiting verification';
export const COMPLETED_VERIFIED_LABEL = 'Completed – verified';

/**
 * The overall progress that is stored and shown: min(computed, 99) until the completion is
 * verified (projects.completion_verified_at), then the computed value (100). Used wherever
 * projects.overall_progress or progress_updates.overall_progress is written.
 */
export function officialProgress(computed, verifiedAt) {
  const value = round2(clamp(Number(computed) || 0));
  return verifiedAt ? value : Math.min(value, UNVERIFIED_PROGRESS_CAP);
}

/** "Completed – verified" / "Completed – awaiting verification" for a Completed project; otherwise null. */
export function completionLabel(project) {
  if (project?.status !== 'completed') return null;
  return project.completion_verified_at ? COMPLETED_VERIFIED_LABEL : COMPLETED_AWAITING_LABEL;
}

/** Planned % for one window [start, end] on `today` (straight line). */
function linearPlanned(start, end, today) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return null;
  if (today < s) return 0;
  if (today >= e) return 100;
  return e - s <= 0 ? 100 : ((today - s) / (e - s)) * 100;
}

/**
 * Where the project should be today according to the plan: each phase's planned
 * window (weighted); without phase dates, a straight line from the Notice to
 * Proceed to the target completion date.
 */
export function computePlannedProgress(project, phases = [], todayInput = new Date()) {
  const today = toDate(todayInput);
  const dated = phases.filter((p) => p.planned_start && p.planned_end);
  const totalWeight = dated.reduce((s, p) => s + Number(p.weight || 0), 0);
  if (dated.length && totalWeight > 0) {
    const weighted = dated.reduce((s, p) => s + Number(p.weight) * linearPlanned(p.planned_start, p.planned_end, today), 0);
    return round2(clamp(weighted / totalWeight));
  }
  return round2(clamp(linearPlanned(project.notice_to_proceed, project.target_completion_date, today) ?? 0));
}

/**
 * Slippage = actual − planned (negative = behind schedule). A Completed project has no slippage
 * (030: awaiting verification it stores 99% against a plan of 100%, which is not "behind").
 */
export const computeSlippage = (actual, planned, status = null) => (status === 'completed' ? 0 : round2(Number(actual) - Number(planned)));

/**
 * Points behind schedule from a stored project row: planned_progress − overall_progress
 * (positive = behind), 0 for a Completed project (030). Used wherever slippage is derived from
 * the stored values (dashboard, audit PDF).
 */
export function behindSchedule(row) {
  if (row?.status === 'completed') return 0;
  return round2(Number(row?.planned_progress || 0) - Number(row?.overall_progress || 0));
}

/** Default phases per project type, used when setting up a plan. Weights total 100. */
const PHASE_TEMPLATES = {
  road: [['Site Preparation', 10], ['Earthworks', 20], ['Drainage Construction', 20], ['Road Concreting', 35], ['Finishing and Inspection', 15]],
  bridge: [['Mobilization and Site Preparation', 10], ['Substructure (Foundation and Piers)', 30], ['Superstructure (Girders and Deck)', 35], ['Approaches and Slope Protection', 15], ['Finishing and Inspection', 10]],
  flood_control: [['Site Preparation', 10], ['Excavation and Dewatering', 20], ['Revetment / Dike Construction', 45], ['Drainage Outlets', 15], ['Finishing and Inspection', 10]],
  building: [['Site Preparation', 10], ['Foundation', 20], ['Structural Frame', 30], ['Roofing and Masonry', 25], ['Finishing and Inspection', 15]],
  water_supply: [['Site Preparation', 10], ['Source Development', 25], ['Transmission and Distribution Lines', 35], ['Reservoir and Structures', 20], ['Testing and Commissioning', 10]],
  other: [['Site Preparation', 10], ['Main Works', 70], ['Finishing and Inspection', 20]],
};

/** Template phases with planned dates spread over the contract duration by weight. */
export function planFromTemplate(type, ntp, days) {
  const t = PHASE_TEMPLATES[type] || PHASE_TEMPLATES.other;
  let cursor = 0;
  return t.map(([name, weight], i) => {
    const len = Math.max(1, Math.round(((Number(days) || 0) * weight) / 100));
    const start = ntp ? addDays(ntp, cursor) : null;
    cursor += len;
    const end = ntp ? addDays(ntp, i === t.length - 1 ? Number(days) || cursor : cursor) : null;
    return { sequence_no: i + 1, name, weight, planned_start: start, planned_end: end };
  });
}

/** Financial summary of one project from its records (contract + variation orders etc.). */
export function summarizeFinance(project, records = []) {
  const sum = (type) => round2(records.filter((r) => r.record_type === type).reduce((s, r) => s + Number(r.amount), 0));
  const contract = Number(project.contract_amount || 0);
  const variationOrders = sum('variation_order');
  const revised = round2(contract + variationOrders);
  const disbursed = sum('disbursement');
  return {
    approved_budget: Number(project.approved_budget || 0),
    contract_amount: contract,
    variation_orders: variationOrders,
    revised_contract_amount: revised,
    total_obligated: sum('obligation'),
    total_disbursed: disbursed,
    total_expenses: sum('expense'),
    remaining_balance: round2(revised - disbursed),
    // Fund utilization = disbursed ÷ revised contract amount
    utilization_pct: revised > 0 ? round2((disbursed / revised) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// WEEK 3 — used by the automatic flag detection (services/flagDetection.js)
// ---------------------------------------------------------------------------
export function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / DAY_MS);
}

/**
 * A project counts as Completed only when
 *   1. every construction phase is at 100%,
 *   2. an actual completion date is recorded, and
 *   3. a final (as-built) 360° image is on file.
 */
export function detectCompletion({ project, phases = [], images = [] }) {
  const overallProgress = computeOverallProgress(phases);
  const allPhasesComplete = phases.length > 0 && phases.every((p) => Number(p.accomplishment) >= 100);
  const hasCompletionDate = Boolean(project.actual_completion_date);
  const hasFinalImage = images.some((img) => img.is_final);
  const missing = [];
  if (!allPhasesComplete) missing.push('all phases at 100%');
  if (!hasCompletionDate) missing.push('actual completion date');
  if (!hasFinalImage) missing.push('final 360° image');
  return { isCompleted: missing.length === 0, overallProgress, allPhasesComplete, hasCompletionDate, hasFinalImage, missing };
}
