/**
 * Progress rules (migration 030): a Completed project awaiting verification stores 99% against a
 * plan of 100%. That is not "behind schedule": a Completed project always has 0 slippage.
 */

/** Points behind schedule (planned − actual; positive = behind), 0 for a Completed project. */
export function pointsBehind(actual, planned, status = null) {
  if (status === 'completed' || planned == null) return 0;
  return Math.round((Number(planned) - Number(actual || 0)) * 100) / 100;
}

/** Points behind schedule of a stored project row (overall_progress, planned_progress, status). */
export const rowPointsBehind = (row) => pointsBehind(row?.overall_progress, row?.planned_progress, row?.status);
