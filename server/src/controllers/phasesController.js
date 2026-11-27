/**
 * WEEK 2 — Phase plan and progress update API (Julina Mae Escabosa, Back-end)
 *   GET  /projects/:id/phases     phases + overall, planned and slippage
 *   PUT  /projects/:id/phases     set up / change the phase plan
 *   GET  /projects/:id/progress   progress report history
 *   POST /projects/:id/progress   submit a progress update → recomputes overall completion
 * Every write runs Manuel's checks (services/validationRules.js) before saving.
 */
import { adminClient } from '../config/supabase.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { fillMissingNames } from '../services/profileNames.js';
import { computeOverallProgress, computePlannedProgress, computeSlippage, planFromTemplate } from '../services/completion.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { assertValid, checkPhasePlan, checkProgressUpdate } from '../services/validationRules.js';
import { notFound, unwrap } from '../utils/httpError.js';

const PROJECT_COLS = 'id, project_type, status, notice_to_proceed, duration_days, target_completion_date, actual_completion_date, overall_progress';

async function loadProject(db, id) {
  const p = unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  return p;
}
const loadPhases = async (db, id) => unwrap(await db.from('project_phases').select('*').eq('project_id', id).order('sequence_no'));

/** Recompute and store overall completion. (Week 3: the status is then set by the automatic evaluation.) */
async function saveOverall(project, phases, extra = {}) {
  const overall = computeOverallProgress(phases);
  unwrap(await adminClient.from('projects').update({ overall_progress: overall, ...extra }).eq('id', project.id));
  return { overall };
}

export async function getPhases(req, res) {
  const project = await loadProject(req.db, req.params.id);
  const phases = await loadPhases(req.db, req.params.id);
  const overall = computeOverallProgress(phases);
  const planned = computePlannedProgress(project, phases);
  res.json({
    data: {
      phases,
      overall_progress: overall,
      planned_progress: planned,
      slippage: computeSlippage(overall, planned),
      template: phases.length ? null : planFromTemplate(project.project_type, project.notice_to_proceed, project.duration_days),
    },
  });
}

export async function replacePhases(req, res) {
  const { id } = req.params;
  const project = await loadProject(adminClient, id);
  const existing = await loadPhases(adminClient, id);
  assertValid(checkPhasePlan({ project, phases: req.body.phases, existing }));

  const keep = new Set(req.body.phases.filter((p) => p.id).map((p) => p.id));
  const remove = existing.filter((p) => !keep.has(p.id)).map((p) => p.id);
  if (remove.length) unwrap(await adminClient.from('project_phases').delete().in('id', remove));
  // Move kept phases out of the way first so re-ordering never collides on (project_id, sequence_no).
  for (const p of req.body.phases.filter((x) => x.id)) {
    unwrap(await adminClient.from('project_phases').update({ sequence_no: 100 + p.sequence_no }).eq('id', p.id));
  }
  for (const p of req.body.phases) {
    const row = { ...p, project_id: id };
    if (p.id) unwrap(await adminClient.from('project_phases').update(row).eq('id', p.id));
    else unwrap(await adminClient.from('project_phases').insert(row));
  }

  const phases = await loadPhases(adminClient, id);
  const { overall } = await saveOverall(project, phases, { updated_by: req.user.id });
  const evaluation = await reevaluate(id, 'phases_updated', req.user.id);
  await logActivity(req, {
    action: 'phases.update',
    entityType: 'project',
    entityId: id,
    projectId: id,
    summary: `Set up construction phases of ${await projectCode(id)} (${phases.length} phases${remove.length ? `, ${remove.length} removed` : ''})`,
    details: { phases: phases.map((p) => ({ name: p.name, weight: Number(p.weight) })) },
  });
  res.json({ data: { phases, overall_progress: overall, evaluation } });
}

export async function listProgress(req, res) {
  const rows = unwrap(
    await req.db
      .from('progress_updates')
      .select('id, report_date, overall_progress, phase_snapshot, remarks, created_at, submitted_by, submitter:profiles!progress_updates_submitted_by_fkey(full_name, role)')
      .eq('project_id', req.params.id)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false }),
  );
  const named = rows.map(({ submitter, ...r }) => ({ ...r, submitted_by_name: submitter?.full_name || null, submitted_by_role: submitter?.role ?? null }));
  // A contractor account cannot read other profiles (RLS): its names come from the service role.
  res.json({ data: await fillMissingNames(named, [{ id: 'submitted_by', name: 'submitted_by_name', role: 'submitted_by_role' }]) });
}

export async function submitProgress(req, res) {
  const { id } = req.params;
  const project = await loadProject(adminClient, id);
  const phases = await loadPhases(adminClient, id);
  const last = unwrap(await adminClient.from('progress_updates').select('report_date').eq('project_id', id).order('report_date', { ascending: false }).limit(1));
  const update = req.body;
  assertValid(checkProgressUpdate({ project, phases, lastReportDate: last[0]?.report_date, update }));

  const byId = new Map(phases.map((p) => [p.id, p]));
  for (const u of update.phases) {
    const ph = byId.get(u.phase_id);
    const patch = { accomplishment: u.accomplishment };
    // Fill in actual start / end dates automatically when they were not given.
    if (u.actual_start !== undefined) patch.actual_start = u.actual_start;
    else if (!ph.actual_start && u.accomplishment > 0) patch.actual_start = update.report_date;
    if (u.actual_end !== undefined) patch.actual_end = u.actual_end;
    else if (u.accomplishment >= 100 && !ph.actual_end) patch.actual_end = update.report_date;
    if (u.accomplishment < 100) patch.actual_end = null;
    if (u.remarks !== undefined) patch.remarks = u.remarks;
    unwrap(await adminClient.from('project_phases').update(patch).eq('id', u.phase_id));
    Object.assign(ph, patch);
  }

  const extra = { updated_by: req.user.id };
  if (update.actual_completion_date) extra.actual_completion_date = update.actual_completion_date;
  const { overall } = await saveOverall(project, phases, extra);

  const row = unwrap(
    await adminClient
      .from('progress_updates')
      .insert({
        project_id: id,
        report_date: update.report_date,
        overall_progress: overall,
        phase_snapshot: phases.map((p) => ({ phase_id: p.id, sequence_no: p.sequence_no, name: p.name, weight: Number(p.weight), accomplishment: Number(p.accomplishment) })),
        remarks: update.remarks || null,
        submitted_by: req.user.id,
      })
      .select('id')
      .single(),
  );
  const evaluation = await reevaluate(id, 'progress_update', req.user.id);
  await logActivity(req, {
    action: 'progress.submit',
    entityType: 'progress_update',
    entityId: row.id,
    projectId: id,
    summary: `Submitted progress report of ${await projectCode(id)} as of ${update.report_date}: ${Number(project.overall_progress)}% → ${overall}%`,
    details: { report_date: update.report_date, previous: Number(project.overall_progress), overall, flag: evaluation?.flag ?? null },
  });
  res.status(201).json({
    data: {
      id: row.id,
      overall_progress: overall,
      previous_progress: Number(project.overall_progress),
      planned_progress: computePlannedProgress(project, phases, update.report_date),
      status: evaluation?.status ?? project.status,
      evaluation,
    },
  });
}
