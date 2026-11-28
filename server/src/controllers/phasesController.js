/**
 * WEEK 2 — Phase plan and progress update API (Julina Mae Escabosa, Back-end)
 *   GET  /projects/:id/phases     phases (with their sub-activities) + overall, planned and slippage
 *   PUT  /projects/:id/phases     set up / change the phase plan and each phase's sub-activities
 *   GET  /projects/:id/progress   progress report history (description, reference photos, breakdown)
 *   POST /projects/:id/progress   submit a progress update → recomputes overall completion
 * Every write runs Manuel's checks (services/validationRules.js) before saving.
 *
 * Progress rules (030): a phase with sub-activities takes its % from them; every new report has
 * a description and 1–5 reference photos (private bucket "progress-photos"); the stored overall
 * progress is at most 99% until the completion is verified (officialProgress), and a verified
 * project accepts no more reports or plan changes.
 */
import { randomUUID } from 'node:crypto';
import { adminClient } from '../config/supabase.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { fillMissingNames } from '../services/profileNames.js';
import {
  completionLabel,
  computeActivityProgress,
  computeOverallProgress,
  computePlannedProgress,
  computeSlippage,
  officialProgress,
  planFromTemplate,
} from '../services/completion.js';
import { assertNotLocked } from '../services/completionVerification.js';
import { assertImageFormat } from '../services/imageFormat.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { signedUrls } from '../services/storage.js';
import { applyProgressUpdate, assertValid, checkPhasePlan, checkProgressUpdate } from '../services/validationRules.js';
import { MAX_PROGRESS_PHOTOS, PROGRESS_PHOTOS_MESSAGE } from '../middleware/upload.js';
import { HttpError, badRequest, notFound, unwrap } from '../utils/httpError.js';

export const PHOTO_BUCKET = 'progress-photos';
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const PROJECT_COLS = 'id, project_type, status, notice_to_proceed, duration_days, target_completion_date, actual_completion_date, overall_progress, completed_at, completion_verified_at';
const ACTIVITY_COLS = 'id, phase_id, project_id, sequence_no, name, weight, accomplishment, created_at, updated_at';

async function loadProject(db, id) {
  const p = unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  return p;
}
const loadPhases = async (db, id) => unwrap(await db.from('project_phases').select('*').eq('project_id', id).order('sequence_no'));
const loadActivities = async (db, id) => unwrap(await db.from('phase_activities').select(ACTIVITY_COLS).eq('project_id', id).order('sequence_no'));

/** Each phase with its sub-activities (ordered), as the API returns them. */
export function withActivities(phases, activities) {
  return phases.map((p) => ({
    ...p,
    activities: activities.filter((a) => a.phase_id === p.id).sort((a, b) => a.sequence_no - b.sequence_no),
  }));
}

/** Recompute and store overall completion (capped until verified). (Week 3: the status is then set by the automatic evaluation.) */
async function saveOverall(project, phases, extra = {}) {
  const overall = officialProgress(computeOverallProgress(phases), project.completion_verified_at);
  unwrap(await adminClient.from('projects').update({ overall_progress: overall, ...extra }).eq('id', project.id));
  return { overall };
}

export async function getPhases(req, res) {
  const project = await loadProject(req.db, req.params.id);
  const [phases, activities] = await Promise.all([loadPhases(req.db, req.params.id), loadActivities(req.db, req.params.id)]);
  const overall = officialProgress(computeOverallProgress(phases), project.completion_verified_at);
  const planned = computePlannedProgress(project, phases);
  res.json({
    data: {
      phases: withActivities(phases, activities),
      overall_progress: overall,
      planned_progress: planned,
      slippage: computeSlippage(overall, planned),
      completion_verified_at: project.completion_verified_at ?? null,
      completion_label: completionLabel(project),
      locked: Boolean(project.completion_verified_at),
      template: phases.length ? null : planFromTemplate(project.project_type, project.notice_to_proceed, project.duration_days),
    },
  });
}

/**
 * Replace one phase's sub-activities with `wanted` ([{ id?, name, weight }], in order). Kept ones
 * keep their accomplishment; new ones start at 0, or at the phase's current % when the phase had
 * none before (so adding sub-activities never changes the phase's %). Returns the phase's %
 * computed from its sub-activities, or null when it has none.
 */
async function syncActivities(projectId, phase, wanted, prior) {
  const keep = new Set(wanted.filter((a) => a.id).map((a) => a.id));
  const remove = prior.filter((a) => !keep.has(a.id)).map((a) => a.id);
  if (remove.length) unwrap(await adminClient.from('phase_activities').delete().in('id', remove));
  if (!wanted.length) return null;
  // Move kept rows out of the way first so re-ordering never collides on (phase_id, sequence_no).
  for (const a of prior.filter((x) => keep.has(x.id))) {
    unwrap(await adminClient.from('phase_activities').update({ sequence_no: 1000 + a.sequence_no }).eq('id', a.id));
  }
  const start = prior.length ? 0 : Number(phase.accomplishment || 0);
  const result = [];
  for (const [i, a] of wanted.entries()) {
    const row = { name: a.name, weight: a.weight, sequence_no: i + 1 };
    if (a.id) {
      result.push(unwrap(await adminClient.from('phase_activities').update(row).eq('id', a.id).select('weight, accomplishment').single()));
    } else {
      result.push(
        unwrap(
          await adminClient
            .from('phase_activities')
            .insert({ ...row, phase_id: phase.id, project_id: projectId, accomplishment: start })
            .select('weight, accomplishment')
            .single(),
        ),
      );
    }
  }
  return computeActivityProgress(result);
}

export async function replacePhases(req, res) {
  const { id } = req.params;
  const project = await loadProject(adminClient, id);
  assertNotLocked(project);
  const [existing, existingActivities] = await Promise.all([loadPhases(adminClient, id), loadActivities(adminClient, id)]);
  assertValid(checkPhasePlan({ project, phases: req.body.phases, existing, existingActivities }));

  const keep = new Set(req.body.phases.filter((p) => p.id).map((p) => p.id));
  const remove = existing.filter((p) => !keep.has(p.id)).map((p) => p.id);
  if (remove.length) unwrap(await adminClient.from('project_phases').delete().in('id', remove));
  // Move kept phases out of the way first so re-ordering never collides on (project_id, sequence_no).
  for (const p of req.body.phases.filter((x) => x.id)) {
    unwrap(await adminClient.from('project_phases').update({ sequence_no: 100 + p.sequence_no }).eq('id', p.id));
  }
  for (const { activities, ...p } of req.body.phases) {
    const row = { ...p, project_id: id };
    const saved = p.id
      ? unwrap(await adminClient.from('project_phases').update(row).eq('id', p.id).select('id, accomplishment, actual_end').single())
      : unwrap(await adminClient.from('project_phases').insert(row).select('id, accomplishment, actual_end').single());
    if (activities === undefined) continue;
    const value = await syncActivities(id, saved, activities, existingActivities.filter((a) => a.phase_id === saved.id));
    if (value !== null && value !== Number(saved.accomplishment)) {
      // An actual end date belongs to a 100% phase only (phases_end_needs_100).
      unwrap(await adminClient.from('project_phases').update({ accomplishment: value, ...(value < 100 && { actual_end: null }) }).eq('id', saved.id));
    }
  }

  const [phases, activities] = await Promise.all([loadPhases(adminClient, id), loadActivities(adminClient, id)]);
  const { overall } = await saveOverall(project, phases, { updated_by: req.user.id });
  const evaluation = await reevaluate(id, 'phases_updated', req.user.id);
  const planned = withActivities(phases, activities);
  await logActivity(req, {
    action: 'phases.update',
    entityType: 'project',
    entityId: id,
    projectId: id,
    summary: `Set up construction phases of ${await projectCode(id)} (${phases.length} phases${activities.length ? `, ${activities.length} sub-activities` : ''}${remove.length ? `, ${remove.length} removed` : ''})`,
    details: {
      phases: planned.map((p) => ({
        name: p.name,
        weight: Number(p.weight),
        ...(p.activities.length && { activities: p.activities.map((a) => ({ name: a.name, weight: Number(a.weight) })) }),
      })),
    },
  });
  res.json({ data: { phases: planned, overall_progress: overall, evaluation } });
}

export async function listProgress(req, res) {
  const rows = unwrap(
    await req.db
      .from('progress_updates')
      .select('id, report_date, overall_progress, phase_snapshot, activity_snapshot, description, remarks, created_at, submitted_by, submitter:profiles!progress_updates_submitted_by_fkey(full_name, role)')
      .eq('project_id', req.params.id)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false }),
  );
  const photos = await loadReportPhotos(req.db, rows.map((r) => r.id));
  const named = rows.map(({ submitter, ...r }) => ({
    ...r,
    submitted_by_name: submitter?.full_name || null,
    submitted_by_role: submitter?.role ?? null,
    photos: photos.get(r.id) ?? [],
  }));
  // A contractor account cannot read other profiles (RLS): its names come from the service role.
  res.json({ data: await fillMissingNames(named, [{ id: 'submitted_by', name: 'submitted_by_name', role: 'submitted_by_role' }]) });
}

/**
 * Reference photos of the given reports (read through `db`, so RLS applies) with short-lived
 * signed links: Map(progress_update_id → [{ id, url, size_bytes, created_at }]). Old reports have none.
 */
export async function loadReportPhotos(db, reportIds) {
  const out = new Map();
  const rows = [];
  for (let i = 0; i < reportIds.length; i += 100) {
    const chunk = reportIds.slice(i, i + 100);
    rows.push(...unwrap(await db.from('progress_photos').select('id, progress_update_id, storage_path, size_bytes, created_at').in('progress_update_id', chunk).order('created_at')));
  }
  if (!rows.length) return out;
  const urls = await signedUrls(PHOTO_BUCKET, rows.map((r) => r.storage_path));
  for (const r of rows) {
    const list = out.get(r.progress_update_id) ?? [];
    list.push({ id: r.id, url: urls[r.storage_path] ?? null, size_bytes: r.size_bytes, created_at: r.created_at });
    out.set(r.progress_update_id, list);
  }
  return out;
}

/** 400 "Attach 1 to 5 reference photos." unless 1–5 files came; each must really be a JPEG, PNG or WebP. Returns their formats. */
export function checkReferencePhotos(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_PROGRESS_PHOTOS) {
    throw badRequest(PROGRESS_PHOTOS_MESSAGE, [{ field: 'photos', message: PROGRESS_PHOTOS_MESSAGE }]);
  }
  return files.map((f) => assertImageFormat(f.buffer));
}

/** Store the photos as uploaded (no re-encoding) under <project_id>/<report_id>/<uuid>.<ext>; removes what it stored on failure. */
async function storePhotos(projectId, reportId, files, formats) {
  const stored = [];
  try {
    for (const [i, file] of files.entries()) {
      const path = `${projectId}/${reportId}/${randomUUID()}.${EXT[formats[i]]}`;
      const { error } = await adminClient.storage.from(PHOTO_BUCKET).upload(path, file.buffer, { contentType: `image/${formats[i]}`, upsert: false });
      if (error) throw Object.assign(new HttpError(500, 'Storage upload failed'), { cause: error });
      stored.push({ path, size: file.buffer.length });
    }
    return stored;
  } catch (err) {
    if (stored.length) await adminClient.storage.from(PHOTO_BUCKET).remove(stored.map((s) => s.path));
    throw err;
  }
}

export async function submitProgress(req, res) {
  const { id } = req.params;
  const project = await loadProject(adminClient, id);
  assertNotLocked(project);
  const [phases, activities, last] = await Promise.all([
    loadPhases(adminClient, id),
    loadActivities(adminClient, id),
    adminClient.from('progress_updates').select('report_date').eq('project_id', id).order('report_date', { ascending: false }).limit(1).then(unwrap),
  ]);
  const update = req.body;
  assertValid(checkProgressUpdate({ project, phases, activities, lastReportDate: last[0]?.report_date, update }));
  const formats = checkReferencePhotos(req.files);

  // Work out every new value first; nothing is written until the report and its photos are stored.
  const { phaseValues, activityValues } = applyProgressUpdate({ phases, activities, update });
  const listed = new Map(update.phases.map((u) => [u.phase_id, u]));
  const phasePatches = [];
  for (const ph of phases) {
    const u = listed.get(ph.id);
    const value = phaseValues.get(ph.id);
    if (!u && value === Number(ph.accomplishment)) continue;
    const patch = { accomplishment: value };
    // Fill in actual start / end dates automatically when they were not given.
    if (u?.actual_start !== undefined) patch.actual_start = u.actual_start;
    else if (!ph.actual_start && value > 0) patch.actual_start = update.report_date;
    if (u?.actual_end !== undefined) patch.actual_end = u.actual_end;
    else if (value >= 100 && !ph.actual_end) patch.actual_end = update.report_date;
    if (value < 100) patch.actual_end = null;
    if (u?.remarks !== undefined) patch.remarks = u.remarks;
    phasePatches.push([ph.id, patch]);
    Object.assign(ph, patch);
  }
  const changedActivities = activities.filter((a) => activityValues.get(a.id) !== Number(a.accomplishment));
  for (const a of activities) a.accomplishment = activityValues.get(a.id);
  const overall = officialProgress(computeOverallProgress(phases), project.completion_verified_at);

  const reportId = randomUUID();
  const stored = await storePhotos(id, reportId, req.files, formats);
  let reportSaved = false;
  try {
    unwrap(
      await adminClient.from('progress_updates').insert({
        id: reportId,
        project_id: id,
        report_date: update.report_date,
        overall_progress: overall,
        phase_snapshot: phases.map((p) => ({ phase_id: p.id, sequence_no: p.sequence_no, name: p.name, weight: Number(p.weight), accomplishment: Number(p.accomplishment) })),
        activity_snapshot: activities.map((a) => ({ activity_id: a.id, phase_id: a.phase_id, sequence_no: a.sequence_no, name: a.name, weight: Number(a.weight), accomplishment: Number(a.accomplishment) })),
        description: update.description,
        remarks: update.remarks || null,
        submitted_by: req.user.id,
      }),
    );
    reportSaved = true;
    unwrap(
      await adminClient
        .from('progress_photos')
        .insert(stored.map((s) => ({ progress_update_id: reportId, project_id: id, storage_path: s.path, size_bytes: s.size, uploaded_by: req.user.id }))),
    );
  } catch (err) {
    // Never leave a report without its photos, or files without a report.
    try {
      await adminClient.storage.from(PHOTO_BUCKET).remove(stored.map((s) => s.path));
      if (reportSaved) await adminClient.from('progress_updates').delete().eq('id', reportId);
    } catch (cleanup) {
      console.error('[progress] cleanup failed', cleanup.message);
    }
    throw err;
  }

  for (const a of changedActivities) {
    unwrap(await adminClient.from('phase_activities').update({ accomplishment: a.accomplishment }).eq('id', a.id));
  }
  for (const [phaseId, patch] of phasePatches) {
    unwrap(await adminClient.from('project_phases').update(patch).eq('id', phaseId));
  }
  const extra = { updated_by: req.user.id };
  if (update.actual_completion_date) extra.actual_completion_date = update.actual_completion_date;
  await saveOverall(project, phases, extra);

  const evaluation = await reevaluate(id, 'progress_update', req.user.id);
  await logActivity(req, {
    action: 'progress.submit',
    entityType: 'progress_update',
    entityId: reportId,
    projectId: id,
    summary: `Submitted progress report of ${await projectCode(id)} as of ${update.report_date}: ${Number(project.overall_progress)}% → ${overall}% (${stored.length} reference photo${stored.length === 1 ? '' : 's'})`,
    details: { report_date: update.report_date, previous: Number(project.overall_progress), overall, photos: stored.length, flag: evaluation?.flag ?? null },
  });
  res.status(201).json({
    data: {
      id: reportId,
      overall_progress: overall,
      previous_progress: Number(project.overall_progress),
      planned_progress: computePlannedProgress(project, phases, update.report_date),
      status: evaluation?.status ?? project.status,
      photos: stored.length,
      evaluation,
    },
  });
}
