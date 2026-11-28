/**
 * Progress rules (migration 030): a Completed project shows at most 99% ("Completed – awaiting
 * verification") until BOTH the Auditor and PACC have verified it, then 100% ("Completed –
 * verified") and its progress, phase plan and 360° photos are locked.
 *
 * A verification counts only when it was made after the project last became Completed
 * (projects.completed_at). The current decision of each side is its latest counting one; the
 * project is verified when both current decisions are 'verified'. History is append-only
 * (completion_verifications). Pure functions here; the database steps are in
 * controllers/completionController.js.
 */
import { COMPLETED_AWAITING_LABEL, COMPLETED_VERIFIED_LABEL } from './completion.js';
import { HttpError, conflict } from '../utils/httpError.js';

export const VERIFIED_LOCK_MESSAGE = "This project's completion was verified; its progress and photos can no longer change.";
export const PACC_OPEN_CASE_MESSAGE = 'Close the PACC case before verifying completion.';
export const NOT_COMPLETED_MESSAGE = 'Only a completed project can be verified.';
export const VERIFIER_ROLES = Object.freeze(['auditor', 'pacc']);

/** 409 with the lock message once the project's completion is verified. */
export function assertNotLocked(project) {
  if (project?.completion_verified_at) throw new HttpError(409, VERIFIED_LOCK_MESSAGE);
}

/**
 * After verification the project's actual completion date stays as it is (changing or clearing it
 * would take the project out of Completed): 409 with the lock message. Other project fields stay editable.
 */
export function assertCompletionDateEditable(project, patch) {
  if (!project?.completion_verified_at || patch?.actual_completion_date === undefined) return;
  if ((patch.actual_completion_date ?? null) !== (project.actual_completion_date ?? null)) throw new HttpError(409, VERIFIED_LOCK_MESSAGE);
}

/** Whether a verification row counts for the project's current completion. */
export function countsFor(row, completedAt) {
  if (!completedAt) return true;
  return new Date(row.created_at).getTime() >= new Date(completedAt).getTime();
}

/** The latest counting decision of the Auditor and of PACC ({ auditor, pacc }, each a row or null). */
export function currentVerifications(rows = [], completedAt = null) {
  const out = { auditor: null, pacc: null };
  for (const row of rows) {
    if (!VERIFIER_ROLES.includes(row.verifier_role) || !countsFor(row, completedAt)) continue;
    const prev = out[row.verifier_role];
    if (!prev || new Date(row.created_at) > new Date(prev.created_at)) out[row.verifier_role] = row;
  }
  return out;
}

/** Both current decisions are 'verified'. */
export const isFullyVerified = (current) => current.auditor?.decision === 'verified' && current.pacc?.decision === 'verified';

/**
 * Refuse a verification that cannot be recorded: the project must be Completed and not yet
 * verified; PACC cannot verify while the project has an open PACC case ("Not yet" stays allowed).
 */
export function assertCanVerify({ project, role, decision, hasOpenPaccCase = false }) {
  if (project.completion_verified_at) throw new HttpError(409, VERIFIED_LOCK_MESSAGE);
  if (project.status !== 'completed') throw conflict(NOT_COMPLETED_MESSAGE);
  if (role === 'pacc' && decision === 'verified' && hasOpenPaccCase) throw conflict(PACC_OPEN_CASE_MESSAGE);
}

/** Name shown for every PACC decision: no PACC member is named in completion_verifications. */
export const PACC_VERIFIER_NAME = 'PACC';

/**
 * Who a new verification row names. An Auditor row names the auditor. A PACC row names no member
 * (verified_by NULL, verifier_name 'PACC'; CHECK completion_verifications_pacc_anonymous): the
 * project's contractor, possibly the investigated party, reads the history. The PACC member is
 * recorded in pacc_activity only (logPacc).
 */
export function verifierIdentity(role, user) {
  if (role === 'pacc') return { verified_by: null, verifier_name: PACC_VERIFIER_NAME };
  return { verified_by: user?.id ?? null, verifier_name: user?.profile?.full_name || user?.email || null };
}

/** One verification as the API returns it (PACC rows already name no member). */
function publicRow(row, completedAt) {
  const pacc = row.verifier_role === 'pacc';
  return {
    id: row.id,
    verifier_role: row.verifier_role,
    decision: row.decision,
    note: row.note ?? null,
    verifier_name: pacc ? PACC_VERIFIER_NAME : row.verifier_name ?? null,
    verified_by: pacc ? null : row.verified_by ?? null,
    created_at: row.created_at,
    counts: countsFor(row, completedAt),
  };
}

/**
 * The completion-verification state of a project for the API:
 *   { status, completed_at, completion_verified_at, is_completed, is_verified, label,
 *     auditor, pacc,   (current decisions, or null)
 *     history }        (every decision, newest first; `counts` = made after completed_at)
 * `extra` adds caller-specific fields (the PACC view adds pacc_case_open).
 */
export function verificationState(project, rows = [], extra = {}) {
  const isCompleted = project.status === 'completed';
  const completedAt = isCompleted ? project.completed_at ?? null : null;
  const current = isCompleted ? currentVerifications(rows, completedAt) : { auditor: null, pacc: null };
  const sorted = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const counting = (r) => (isCompleted ? countsFor(r, completedAt) : false);
  return {
    project_id: project.id,
    status: project.status,
    completed_at: project.completed_at ?? null,
    completion_verified_at: project.completion_verified_at ?? null,
    is_completed: isCompleted,
    is_verified: Boolean(project.completion_verified_at),
    label: isCompleted ? (project.completion_verified_at ? COMPLETED_VERIFIED_LABEL : COMPLETED_AWAITING_LABEL) : null,
    auditor: current.auditor ? publicRow(current.auditor, completedAt) : null,
    pacc: current.pacc ? publicRow(current.pacc, completedAt) : null,
    history: sorted.map((r) => ({ ...publicRow(r, completedAt), counts: counting(r) })),
    ...extra,
  };
}
