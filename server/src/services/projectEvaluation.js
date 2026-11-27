/**
 * WEEK 3 — Runs the automatic detection for one project and saves the result.
 * Called after every change (project edit, phases, progress, finance, 360° upload)
 * and by the daily check.
 *
 *   projects.auto_flag     the latest automatic result
 *   projects.current_flag  what users see. When the automatic flag CHANGES, the
 *                          auditor's earlier decision no longer applies: the flag
 *                          follows the new result and goes back to "pending" review.
 *   projects.status        set automatically (Not started / Ongoing / Delayed /
 *                          Completed) unless personnel set Suspended or Terminated.
 */
import { adminClient } from '../config/supabase.js';
import { unwrap } from '../utils/httpError.js';
import { evaluateProject } from './flagDetection.js';
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

async function loadEvaluationInput(db, projectId) {
  const [project, phases, images, financials] = await Promise.all([
    db.from('projects').select('*').eq('id', projectId).single().then((r) => unwrap(r, { notFoundMessage: 'Project not found' })),
    db.from('project_phases').select('*').eq('project_id', projectId).order('sequence_no').then(unwrap),
    db.from('site_images').select('id, file_hash, latitude, longitude, captured_at, inspection_date, is_final, created_at').eq('project_id', projectId).then(unwrap),
    db.from('financial_records').select('record_type, amount').eq('project_id', projectId).then(unwrap),
  ]);
  const hashes = [...new Set(images.map((i) => i.file_hash))];
  let others = [];
  if (hashes.length) {
    others = unwrap(await db.from('site_images').select('project_id, file_hash, inspection_date, created_at').in('file_hash', hashes).neq('project_id', projectId));
  }
  return { project, phases, images, financials, hashesUsedElsewhere: findReusedHashes(images, others) };
}

export async function evaluateAndSave(admin, projectId, { trigger = 'manual', actorId = null, rules, today = new Date(), statusOverride } = {}) {
  const input = await loadEvaluationInput(admin, projectId);
  const activeRules = rules || (await getFlagRules(admin));
  const result = evaluateProject({ ...input, rules: activeRules, today });
  if (['not_started', 'ongoing'].includes(statusOverride)) result.status = statusOverride;
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
  if (flagChanged || !project.current_flag) {
    update.current_flag = result.flag;
    update.flag_review_status = 'pending';
  }
  unwrap(await admin.from('projects').update(update).eq('id', projectId));

  // History: every user-triggered evaluation; the daily check only when something changed
  if (trigger !== 'daily_check' || flagChanged || statusChanged) {
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
export async function reevaluate(projectId, trigger, actorId, options = {}) {
  try {
    const r = await evaluateAndSave(adminClient, projectId, { trigger, actorId, ...options });
    return { flag: r.flag, status: r.status, flagChanged: r.flagChanged, reasons: r.reasons };
  } catch (err) {
    console.error(`[flags] evaluation failed for ${projectId}:`, err.message);
    return null;
  }
}
