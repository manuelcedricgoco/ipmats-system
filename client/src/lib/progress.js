/**
 * Progress rules (migration 030): a Completed project awaiting verification stores 99% against a
 * plan of 100%. That is not "behind schedule": a Completed project always has 0 slippage.
 */
import { STATUS_META } from './constants.js';

/** Points behind schedule (planned − actual; positive = behind), 0 for a Completed project. */
export function pointsBehind(actual, planned, status = null) {
  if (status === 'completed' || planned == null) return 0;
  return Math.round((Number(planned) - Number(actual || 0)) * 100) / 100;
}

/** Points behind schedule of a stored project row (overall_progress, planned_progress, status). */
export const rowPointsBehind = (row) => pointsBehind(row?.overall_progress, row?.planned_progress, row?.status);

// ---------------------------------------------------------------------------
// Progress rules (030): sub-activities, reference photos, verified 100%.
// The server is the authority (server/src/services/completion.js, validationRules.js,
// completionVerification.js); these mirror its rules so the forms can explain them.
// ---------------------------------------------------------------------------
export const COMPLETED_AWAITING_LABEL = 'Completed – awaiting verification';
export const COMPLETED_VERIFIED_LABEL = 'Completed – verified';
export const VERIFIED_LOCK_MESSAGE = "This project's completion was verified; its progress and photos can no longer change.";
export const PACC_OPEN_CASE_MESSAGE = 'Close the PACC case before verifying completion.';
export const REFERENCE_PHOTOS_MESSAGE = 'Attach 1 to 5 reference photos.';
export const ACTIVITY_WEIGHTS_MESSAGE = 'Sub-activity weights in a phase must add up to 100.';
export const MAX_REFERENCE_PHOTOS = 5;
export const MAX_REFERENCE_PHOTO_BYTES = 10 * 1024 * 1024;
export const REFERENCE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;
export const NOT_YET_NOTE_MIN = 5;
export const NOT_YET_NOTE_MAX = 500;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const clamp = (n) => Math.min(100, Math.max(0, Number(n) || 0));

/** Weighted % of rows ({ weight, accomplishment }): Σ(weight × accomplishment) ÷ Σ(weight); 0 without weight. */
export function weightedProgress(rows = []) {
  const total = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
  return total > 0 ? rows.reduce((s, r) => s + Number(r.weight || 0) * clamp(r.accomplishment), 0) / total : 0;
}

/** Highest overall progress shown until the Auditor and PACC have both verified the completion (API officialProgress). */
export const UNVERIFIED_PROGRESS_CAP = 99;

/** The overall % that will be stored and shown: at most 99 until verified (2 decimals). */
export const officialProgress = (computed, verifiedAt) => {
  const v = round2(clamp(computed));
  return verifiedAt ? v : Math.min(v, UNVERIFIED_PROGRESS_CAP);
};

/** Running total of a phase's sub-activity weights (2 decimals). */
export const activityWeightTotal = (activities = []) => round2(activities.reduce((s, a) => s + Number(a.weight || 0), 0));

/** A phase's sub-activity weights add up to 100 (± 0.01), or it has none. */
export const activityWeightsOk = (activities = []) => activities.length === 0 || Math.abs(activityWeightTotal(activities) - 100) <= 0.01 + 1e-9; // e.g. 3 × 33.33

/** A phase's % computed from its sub-activities, to 2 decimals (same formula as the API). */
export const activityProgress = (activities = []) => round2(weightedProgress(activities));

/** A phase's %: from its sub-activities when it has some, else its own accomplishment. */
export const phaseProgress = (phase) => (phase?.activities?.length ? activityProgress(phase.activities) : Number(phase?.accomplishment || 0));

/** PUT /projects/:id/phases body from the plan editor rows (each with its sub-activities, in order). */
export function phasePlanPayload(rows) {
  return {
    phases: rows.map((r, i) => ({
      ...(r.id ? { id: r.id } : {}),
      sequence_no: i + 1,
      name: String(r.name || '').trim(),
      weight: Number(r.weight),
      planned_start: r.planned_start || null,
      planned_end: r.planned_end || null,
      activities: (r.activities || []).map((a) => ({ ...(a.id ? { id: a.id } : {}), name: String(a.name || '').trim(), weight: Number(a.weight) })),
    })),
  };
}

/** The phase weights total 100 and every phase with sub-activities has weights totalling 100. */
export function phasePlanReady(rows = []) {
  const total = rows.reduce((s, r) => s + Number(r.weight || 0), 0);
  return rows.length > 0 && Math.abs(total - 100) < 0.01 && rows.every((r) => activityWeightsOk(r.activities || []));
}

/** Progress form rows from GET /projects/:id/phases (the last values are kept to show changes). */
export function progressFormRows(phases = []) {
  return phases.map((ph) => ({
    phase_id: ph.id,
    name: ph.name,
    weight: Number(ph.weight),
    previous: Number(ph.accomplishment),
    accomplishment: Number(ph.accomplishment),
    activities: (ph.activities || []).map((a) => ({
      activity_id: a.id,
      name: a.name,
      weight: Number(a.weight),
      previous: Number(a.accomplishment),
      accomplishment: Number(a.accomplishment),
    })),
  }));
}

/** The % a progress form row shows now (computed for a phase with sub-activities). */
export const formRowProgress = (row) => (row.activities?.length ? activityProgress(row.activities) : Number(row.accomplishment || 0));

const changed = (x) => Number(x.accomplishment) !== x.previous;

/**
 * The `phases` of a progress report: a phase with sub-activities sends its changed sub-activities
 * (never its own %, which the API computes); one without sends its %. Only changed phases are sent;
 * when nothing changed, every phase is sent (a report needs at least one).
 */
export function progressPayloadPhases(rows = []) {
  const entry = (r, all) =>
    r.activities?.length
      ? { phase_id: r.phase_id, activities: r.activities.filter((a) => all || changed(a)).map((a) => ({ activity_id: a.activity_id, accomplishment: Number(a.accomplishment) })) }
      : { phase_id: r.phase_id, accomplishment: Number(r.accomplishment) };
  const touched = rows.filter((r) => (r.activities?.length ? r.activities.some(changed) : changed(r)));
  return touched.length ? touched.map((r) => entry(r, false)) : rows.map((r) => entry(r, true));
}

/** A value lower than the last report (phase or sub-activity): the remarks must explain it. */
export const progressDecreased = (rows = []) => rows.some((r) => (r.activities?.length ? r.activities.some((a) => Number(a.accomplishment) < a.previous) : Number(r.accomplishment) < r.previous));

/** Why one picked file cannot be a reference photo, or null. */
export function referencePhotoProblem(file) {
  if (!file || !REFERENCE_PHOTO_TYPES.includes(file.type)) return 'The file is not a JPEG, PNG or WebP image.';
  if (file.size > MAX_REFERENCE_PHOTO_BYTES) return 'Each reference photo can be at most 10 MB.';
  return null;
}

/** Add picked files to the chosen ones: good files up to 5; `error` says why any were left out. */
export function addReferencePhotos(current = [], picked = []) {
  const files = [...current];
  let error = null;
  for (const f of picked) {
    const problem = referencePhotoProblem(f);
    if (problem) error = error || problem;
    else if (files.length >= MAX_REFERENCE_PHOTOS) error = error || REFERENCE_PHOTOS_MESSAGE;
    else files.push(f);
  }
  return { files, error };
}

/** The first thing a progress report still needs (same messages as the API), or null. */
export function progressFormProblem({ description = '', files = [] }) {
  const d = String(description).trim();
  if (d.length < DESCRIPTION_MIN) return 'Describe the work done in at least 10 characters.';
  if (d.length > DESCRIPTION_MAX) return 'The description can be at most 2000 characters.';
  if (files.length < 1 || files.length > MAX_REFERENCE_PHOTOS) return REFERENCE_PHOTOS_MESSAGE;
  return null;
}

/** "Completed – verified" / "Completed – awaiting verification" for a Completed project; otherwise null. */
export function completionLabel(project) {
  if (project?.status !== 'completed') return null;
  return project.completion_verified_at ? COMPLETED_VERIFIED_LABEL : COMPLETED_AWAITING_LABEL;
}

/** The status text of a project: the completion label when Completed, else the status label. */
export const statusLabel = (status, verifiedAt) => completionLabel({ status, completion_verified_at: verifiedAt }) || STATUS_META[status]?.label || status;

/** Verified completion: progress, phase plan and 360° photos can no longer change. */
export const isLocked = (project) => Boolean(project?.completion_verified_at);

const SIDE_TITLES = { auditor: 'Auditor', pacc: 'PACC' };
export const DECISION_TEXT = { verified: 'Verified', not_yet: 'Not yet' };

/**
 * What the completion verification card shows and allows.
 * `actor`: 'auditor' on the staff Flag & audit tab for an Auditor, 'pacc' on the PACC project page; anyone else
 * reads only. phase: 'not_completed' | 'awaiting' | 'awaiting_case' (both verified, a PACC case is open) | 'verified'.
 * `showPacc`: staff and PACC only. Anyone else (a contractor, possibly the investigated party) never learns that a
 * PACC case is open: 'awaiting_case' becomes the neutral 'finalizing'.
 */
export const FINALIZING_TEXT = 'Both sides verified; the verification is being finalised.';

export function verificationCard(state, actor = null, { showPacc = false } = {}) {
  const s = state || {};
  const role = actor === 'auditor' || actor === 'pacc' ? actor : null;
  const completed = Boolean(s.is_completed);
  const verified = Boolean(s.is_verified);
  const sides = ['auditor', 'pacc'].map((r) => {
    const d = s[r] || null;
    return { role: r, title: SIDE_TITLES[r], decision: d?.decision ?? null, text: d ? DECISION_TEXT[d.decision] || d.decision : 'No decision yet', note: d?.note ?? null, by: d?.verifier_name ?? null, at: d?.created_at ?? null };
  });
  const waitingFor = sides.filter((x) => x.decision !== 'verified').map((x) => x.title);
  const phase = verified ? 'verified' : !completed ? 'not_completed' : waitingFor.length ? 'awaiting' : showPacc ? 'awaiting_case' : 'finalizing';
  const canAct = Boolean(role) && completed && !verified;
  let verifyBlockedReason = null;
  if (canAct && role === 'pacc' && showPacc && s.pacc_case_open) verifyBlockedReason = PACC_OPEN_CASE_MESSAGE;
  else if (canAct && s[role]?.decision === 'verified') verifyBlockedReason = `Already verified by ${role === 'pacc' ? 'PACC' : 'the Auditor'}.`;
  return {
    phase,
    label: s.label ?? null,
    sides,
    waitingFor: verified ? [] : waitingFor,
    canAct,
    canVerify: canAct && !verifyBlockedReason,
    canNotYet: canAct,
    verifyBlockedReason,
    history: s.history || [],
  };
}
