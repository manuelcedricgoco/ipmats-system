/**
 * WEEK 3 — Runs the automatic detection for one project and saves the result.
 * Called after every change (project edit, phases, progress, finance, 360° upload)
 * and by the daily check.
 *
 *   projects.auto_flag     the latest automatic result
 *   projects.current_flag  what users see. Follows the automatic flag until an auditor
 *                          reviews it. After that the auditor's decision (reviewed_flag)
 *                          is a floor: when the automatic flag changes, the flag becomes
 *                          the worse of the two and goes back to "pending" review, so
 *                          editing a project can never lower it (see resolveFlagState).
 *   projects.status        set automatically (Not started / Ongoing / Delayed /
 *                          Completed) unless personnel set Suspended or Terminated.
 */
import { adminClient } from '../config/supabase.js';
import { unwrap } from '../utils/httpError.js';
import { evaluateProject, maxFlag } from './flagDetection.js';
import { findNearDuplicates } from './perceptualHash.js';
import { getFlagRules } from './settings.js';

/** Hashes of this project's images that appeared EARLIER in a different project. */
function findReusedHashes(images, others) {
  const reused = new Set();
  for (const img of images) {
    for (const o of others) {
      if (o.file_hash !== img.file_hash) continue;
      const earlier =
        o.inspection_date < img.inspection_date ||
        (o.inspection_date === img.inspection_date && new Date(o.created_at) < new Date(img.created_at));
      if (earlier) reused.add(img.file_hash);
    }
  }
  return reused;
}

const PAGE_SIZE = 1000; // PostgREST returns at most this many rows per request

/** Every site_images row that has a perceptual hash, read page by page (a single query is capped at max_rows). */
export async function loadHashedImages(db) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = unwrap(
      await db.from('site_images').select('id, project_id, phash, inspection_date, created_at').not('phash', 'is', null).order('id').range(from, from + PAGE_SIZE - 1),
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function loadEvaluationInput(db, projectId, phashCandidates) {
  const [project, phases, images, financials] = await Promise.all([
    db.from('projects').select('*').eq('id', projectId).single().then((r) => unwrap(r, { notFoundMessage: 'Project not found' })),
    db.from('project_phases').select('*').eq('project_id', projectId).order('sequence_no').then(unwrap),
    db.from('site_images').select('id, project_id, file_hash, latitude, longitude, captured_at, inspection_date, is_final, created_at, gps_source, validation, phash').eq('project_id', projectId).then(unwrap),
    db.from('financial_records').select('record_type, amount').eq('project_id', projectId).then(unwrap),
  ]);
  const hashes = [...new Set(images.map((i) => i.file_hash))];
  let others = [];
  if (hashes.length) {
    others = unwrap(await db.from('site_images').select('project_id, file_hash, inspection_date, created_at').in('file_hash', hashes).neq('project_id', projectId));
  }
  let nearDuplicateIds = new Set();
  if (images.some((i) => i.phash)) {
    const candidates = phashCandidates ?? (await loadHashedImages(db));
    nearDuplicateIds = findNearDuplicates(images, candidates);
  }
  return { project, phases, images, financials, hashesUsedElsewhere: findReusedHashes(images, others), nearDuplicateIds };
}

/**
 * Decide current_flag and flag_review_status after an evaluation.
 *  - never reviewed: current_flag follows the automatic flag when it changed
 *    (or was never set) and the review goes back to "pending".
 *  - reviewed and the automatic flag is unchanged: the auditor's decision stands.
 *  - reviewed and the automatic flag changed: the flag is the worse of the new
 *    automatic flag and the auditor's decision, and is re-queued for review.
 */
export function resolveFlagState({ autoFlag, previousAutoFlag, currentFlag, reviewedFlag, reviewStatus }) {
  const autoChanged = autoFlag !== previousAutoFlag;
  if (!reviewedFlag) {
    if (autoChanged || !currentFlag) return { current_flag: autoFlag, flag_review_status: 'pending' };
    return { current_flag: currentFlag, flag_review_status: reviewStatus };
  }
  if (!autoChanged && currentFlag) return { current_flag: currentFlag, flag_review_status: reviewStatus };
  return { current_flag: maxFlag(autoFlag, reviewedFlag), flag_review_status: 'pending' };
}

/**
 * Checks the system runs by itself: the daily schedule, and the check at every API start-up (which happens on
 * each deploy, and on every file save under `npm run dev`). They add a history row only when something changed;
 * otherwise each restart would add an identical row for every project.
 */
export const SYSTEM_TRIGGERS = Object.freeze(['daily_check', 'startup']);

/** Whether an evaluation adds a flag_history row: always when a person caused it, otherwise only on a change. */
export function shouldRecordHistory({ trigger, flagChanged, statusChanged }) {
  return !SYSTEM_TRIGGERS.includes(trigger) || flagChanged || statusChanged;
}

export async function evaluateAndSave(admin, projectId, { trigger = 'manual', actorId = null, rules, today = new Date(), phashCandidates } = {}) {
  const input = await loadEvaluationInput(admin, projectId, phashCandidates);
  const activeRules = rules || (await getFlagRules(admin));
  const result = evaluateProject({ ...input, rules: activeRules, today });
  const { project } = input;

  const flagChanged = result.flag !== project.auto_flag;
  const statusChanged = result.status !== project.status || result.completionStatus !== project.completion_status;

  const update = {
    status: result.status,
    completion_status: result.completionStatus,
    overall_progress: result.metrics.overallProgress,
    planned_progress: result.metrics.plannedProgress,
    auto_flag: result.flag,
    auto_flag_reasons: result.reasons,
    auto_flag_evaluated_at: new Date().toISOString(),
  };
  Object.assign(
    update,
    resolveFlagState({
      autoFlag: result.flag,
      previousAutoFlag: project.auto_flag ?? null,
      currentFlag: project.current_flag ?? null,
      reviewedFlag: project.reviewed_flag ?? null,
      reviewStatus: project.flag_review_status,
    }),
  );
  unwrap(await admin.from('projects').update(update).eq('id', projectId));

  if (shouldRecordHistory({ trigger, flagChanged, statusChanged })) {
    unwrap(
      await admin.from('flag_history').insert({
        project_id: projectId,
        source: 'auto',
        trigger_event: trigger,
        flag: result.flag,
        completion_status: result.completionStatus,
        project_status: result.status,
        reasons: result.reasons,
        metrics: result.metrics,
        created_by: actorId,
      }),
    );
  }
  return { ...result, flagChanged, statusChanged, previousFlag: project.auto_flag };
}

/**
 * Re-run detection after a change. A failure here must not undo the change the
 * user just saved, so it is logged and reported instead of thrown.
 */
export async function reevaluate(projectId, trigger, actorId) {
  try {
    const r = await evaluateAndSave(adminClient, projectId, { trigger, actorId });
    return { flag: r.flag, status: r.status, flagChanged: r.flagChanged, reasons: r.reasons };
  } catch (err) {
    console.error(`[flags] evaluation failed for ${projectId}:`, err.message);
    return null;
  }
}
