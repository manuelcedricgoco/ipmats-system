/**
 * WEEK 2 — Server-side checks for phase progress and financial records
 * (Manuel Cedric Goco, Leader / Back-end)
 *
 * The API runs these BEFORE anything is saved. Each function returns a list of
 * problems ({ field, message }); an empty list means the data may be saved.
 * They are pure functions (no database calls) so every rule is unit tested in
 * src/tests/validationRules.test.js.
 *
 * zod (routes/schemas.js) checks the SHAPE of a request (types, ranges).
 * These rules check it against the PROJECT'S CURRENT DATA (dates, totals, history).
 */
import { badRequest } from '../utils/httpError.js';
import { isoDate, round2 } from './completion.js';

const today = (t) => isoDate(t || new Date());
const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Maximum total of variation orders: 10% of the original contract price (RA 9184 IRR, Annex E). */
export const VARIATION_ORDER_LIMIT = 0.1;

/** Throw a 400 listing every problem, or do nothing when the list is empty. */
export function assertValid(problems) {
  if (problems.length) throw badRequest(problems[0].message, problems);
}

// ---------------------------------------------------------------------------
// 1. Phase plan (PUT /projects/:id/phases)
// ---------------------------------------------------------------------------
export function checkPhasePlan({ project, phases, existing = [] }) {
  const problems = [];
  const add = (field, message) => problems.push({ field, message });

  const totalWeight = round2(phases.reduce((s, p) => s + Number(p.weight || 0), 0));
  if (Math.abs(totalWeight - 100) > 0.01) add('phases', `Phase weights must total 100% (currently ${totalWeight}%).`);

  const seqs = phases.map((p) => Number(p.sequence_no));
  if (new Set(seqs).size !== seqs.length) add('phases', 'Each phase needs a different sequence number.');

  const names = phases.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) add('phases', 'Two phases have the same name.');

  phases.forEach((p, i) => {
    const f = `phases.${i}`;
    if (p.planned_start && p.planned_end && p.planned_end < p.planned_start) add(`${f}.planned_end`, `"${p.name}" ends before it starts.`);
    if (p.planned_start && project.notice_to_proceed && p.planned_start < project.notice_to_proceed) {
      add(`${f}.planned_start`, `"${p.name}" cannot start before the Notice to Proceed (${project.notice_to_proceed}).`);
    }
    if (p.planned_end && project.target_completion_date && p.planned_end > project.target_completion_date) {
      add(`${f}.planned_end`, `"${p.name}" cannot end after the target completion date (${project.target_completion_date}).`);
    }
  });

  // A phase that already has reported work cannot be removed (it would erase progress).
  const keep = new Set(phases.filter((p) => p.id).map((p) => p.id));
  for (const old of existing) {
    if (!keep.has(old.id) && Number(old.accomplishment) > 0) {
      add('phases', `"${old.name}" already has ${Number(old.accomplishment)}% reported and cannot be removed.`);
    }
  }
  for (const p of phases) {
    if (p.id && !existing.some((e) => e.id === p.id)) add('phases', 'A phase does not belong to this project.');
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 2. Progress update (POST /projects/:id/progress)
// ---------------------------------------------------------------------------
export function checkProgressUpdate({ project, phases, lastReportDate = null, update, now }) {
  const problems = [];
  const add = (field, message) => problems.push({ field, message });
  const t = today(now);
  const { report_date: reportDate } = update;

  if (!phases.length) add('phases', 'Set up the construction phases before reporting progress.');
  if (reportDate > t) add('report_date', 'The report date cannot be in the future.');
  if (project.notice_to_proceed && reportDate < project.notice_to_proceed) {
    add('report_date', `The report date cannot be earlier than the Notice to Proceed (${project.notice_to_proceed}).`);
  }
  if (lastReportDate && reportDate < lastReportDate) {
    add('report_date', `A later report already exists (${lastReportDate}). Progress reports must be in date order.`);
  }

  const byId = new Map(phases.map((p) => [p.id, p]));
  const seen = new Set();
  const after = new Map(phases.map((p) => [p.id, Number(p.accomplishment)]));

  update.phases.forEach((u, i) => {
    const f = `phases.${i}`;
    const ph = byId.get(u.phase_id);
    if (!ph) return add(`${f}.phase_id`, 'A phase does not belong to this project.');
    if (seen.has(u.phase_id)) return add(`${f}.phase_id`, `"${ph.name}" is listed twice.`);
    seen.add(u.phase_id);
    after.set(u.phase_id, Number(u.accomplishment));

    // Accomplishment normally only goes up; a lower figure is a correction and needs a reason.
    if (Number(u.accomplishment) < Number(ph.accomplishment) && (!update.remarks || update.remarks.trim().length < 10)) {
      add(`${f}.accomplishment`, `"${ph.name}" is lower than the last report (${Number(ph.accomplishment)}%). Explain the correction in the remarks (at least 10 characters).`);
    }
    if (u.actual_start && u.actual_start > reportDate) add(`${f}.actual_start`, `"${ph.name}" cannot start after the report date.`);
    if (u.actual_start && project.notice_to_proceed && u.actual_start < project.notice_to_proceed) {
      add(`${f}.actual_start`, `"${ph.name}" cannot start before the Notice to Proceed.`);
    }
    if (u.actual_end) {
      if (Number(u.accomplishment) < 100) add(`${f}.actual_end`, `"${ph.name}" can only have an actual end date when it is 100% complete.`);
      if (u.actual_end > reportDate) add(`${f}.actual_end`, `"${ph.name}" cannot end after the report date.`);
      const start = u.actual_start ?? ph.actual_start;
      if (start && u.actual_end < start) add(`${f}.actual_end`, `"${ph.name}" cannot end before it started.`);
    }
  });

  if (update.actual_completion_date) {
    const allDone = [...after.values()].every((v) => v >= 100);
    if (!allDone) add('actual_completion_date', 'The project can only get an actual completion date when every phase is 100% complete.');
    if (update.actual_completion_date > t) add('actual_completion_date', 'The actual completion date cannot be in the future.');
    if (project.notice_to_proceed && update.actual_completion_date < project.notice_to_proceed) {
      add('actual_completion_date', 'The actual completion date cannot be earlier than the Notice to Proceed.');
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 3. Financial record (POST /projects/:id/finance)
// ---------------------------------------------------------------------------
export function checkFinancialRecord({ project, records = [], record, now }) {
  const problems = [];
  const add = (field, message) => problems.push({ field, message });
  const sum = (type) => records.filter((r) => r.record_type === type).reduce((s, r) => s + Number(r.amount), 0);
  const amount = Number(record.amount);
  const contract = Number(project.contract_amount || 0);
  const vo = sum('variation_order');
  const revised = contract + vo;
  const disbursed = sum('disbursement');

  if (record.record_date > today(now)) add('record_date', 'The record date cannot be in the future.');

  if (['variation_order', 'obligation', 'disbursement'].includes(record.record_type) && !contract) {
    add('record_type', 'Enter the contract amount on the project first (the contract must be awarded).');
    return problems;
  }

  if (record.reference_no) {
    const dup = records.some((r) => r.record_type === record.record_type && r.reference_no && r.reference_no.trim().toLowerCase() === record.reference_no.trim().toLowerCase());
    if (dup) add('reference_no', `Reference no. ${record.reference_no} is already recorded for this project.`);
  }

  switch (record.record_type) {
    case 'disbursement':
      if (project.notice_to_proceed && record.record_date < project.notice_to_proceed) {
        add('record_date', `Payments can only be released on or after the Notice to Proceed (${project.notice_to_proceed}).`);
      }
      if (disbursed + amount > revised + 0.005) {
        add('amount', `Total disbursements would reach ${peso(disbursed + amount)}, above the contract amount of ${peso(revised)}. Remaining balance: ${peso(revised - disbursed)}.`);
      }
      break;
    case 'obligation': {
      const obligated = sum('obligation');
      if (obligated + amount > revised + 0.005) {
        add('amount', `Total obligations would reach ${peso(obligated + amount)}, above the contract amount of ${peso(revised)}.`);
      }
      break;
    }
    case 'variation_order': {
      const voAbs = records.filter((r) => r.record_type === 'variation_order').reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
      const limit = contract * VARIATION_ORDER_LIMIT;
      if (voAbs + Math.abs(amount) > limit + 0.005) {
        add('amount', `Variation orders would total ${peso(voAbs + Math.abs(amount))}, more than 10% of the original contract (${peso(limit)}).`);
      }
      if (revised + amount < disbursed - 0.005) {
        add('amount', `The revised contract amount (${peso(revised + amount)}) cannot be lower than what is already disbursed (${peso(disbursed)}).`);
      }
      break;
    }
    case 'expense': {
      const expenses = sum('expense');
      if (expenses + amount > Number(project.approved_budget) + 0.005) {
        add('amount', `Total expenses would exceed the approved budget (ABC) of ${peso(project.approved_budget)}.`);
      }
      break;
    }
    default:
      add('record_type', 'Unknown record type.');
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 4. Project status (PATCH /projects/:id) — "Completed" must match the phases
// ---------------------------------------------------------------------------
export function checkStatusChange({ status, phases = [] }) {
  if (status !== 'completed' || !phases.length) return [];
  const open = phases.filter((p) => Number(p.accomplishment) < 100);
  return open.length
    ? [{ field: 'status', message: `The project cannot be marked Completed: ${open.length} phase(s) are below 100% (${open.map((p) => p.name).join(', ')}).` }]
    : [];
}

// ---------------------------------------------------------------------------
// 5. Contract amount edit (PATCH /projects/:id) — cannot drop below what is already paid
// ---------------------------------------------------------------------------
export function checkContractAmountChange({ contractAmount, records = [] }) {
  if (contractAmount === undefined) return [];
  const sum = (type) => records.filter((r) => r.record_type === type).reduce((s, r) => s + Number(r.amount), 0);
  const disbursed = sum('disbursement');
  const revised = Number(contractAmount || 0) + sum('variation_order');
  if (disbursed > 0 && revised < disbursed - 0.005) {
    return [{ field: 'contract_amount', message: `The contract amount cannot be lowered below what is already disbursed (${peso(disbursed)}).` }];
  }
  return [];
}
