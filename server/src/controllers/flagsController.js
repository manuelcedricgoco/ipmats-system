/**
 * WEEK 3 — Flag review API (Julina Mae Escabosa, Back-end)
 *   GET  /flags                      flag queue (all projects, worst first)
 *   GET  /projects/:id/flags         automatic history + auditor decisions
 *   POST /projects/:id/flags/review  auditor confirms or overrides (reason required, evidence optional)
 *   POST /flags/recheck              admin: run the automatic check for every project now
 */
import { randomUUID } from 'node:crypto';
import { adminClient } from '../config/supabase.js';
import { runFlagCheck } from '../jobs/dailyFlagCheck.js';
import { signedUrls } from '../services/storage.js';
import { badRequest, notFound, unwrap } from '../utils/httpError.js';
import { logActivity } from '../services/activityLog.js';
import { applyProjectFilters } from './projectsController.js';

const RANK = { red: 0, yellow: 1, green: 2 };

export async function storeEvidence(projectId, file) {
  if (!file) return null;
  const path = `${projectId}/${randomUUID()}_${file.originalname.replace(/[^\w.-]+/g, '_').slice(-60)}`;
  const up = await adminClient.storage.from('audit-evidence').upload(path, file.buffer, { contentType: file.mimetype });
  if (up.error) throw Object.assign(new Error('Evidence upload failed'), { cause: up.error });
  return path;
}

export async function flagQueue(req, res) {
  let q = req.db
    .from('v_project_summary')
    .select(
      'id, project_code, name, municipality_name, contractor_name, agency_name, status, completion_status, overall_progress, planned_progress, financial_progress, ' +
        'current_flag, auto_flag, auto_flag_reasons, auto_flag_evaluated_at, flag_review_status, audit_status, image_count, latest_inspection_date',
    );
  q = applyProjectFilters(q, req.query);
  if (req.query.flag) q = q.eq('current_flag', req.query.flag);
  if (req.query.review) q = q.eq('flag_review_status', req.query.review);
  const rows = unwrap(await q);
  rows.sort((a, b) => (RANK[a.current_flag] ?? 3) - (RANK[b.current_flag] ?? 3) || (a.flag_review_status === 'pending' ? -1 : 1) || a.project_code.localeCompare(b.project_code));
  const counts = rows.reduce((c, r) => ({ ...c, [r.current_flag || 'none']: (c[r.current_flag || 'none'] || 0) + 1 }), {});
  res.json({ data: rows, counts, pending_review: rows.filter((r) => r.flag_review_status === 'pending' && r.current_flag && r.current_flag !== 'green').length });
}

export async function flagHistory(req, res) {
  const [history, reviews] = await Promise.all([
    req.db.from('flag_history').select('*').eq('project_id', req.params.id).order('created_at', { ascending: false }).limit(50).then(unwrap),
    req.db
      .from('flag_reviews')
      .select('*, auditor:profiles!flag_reviews_auditor_id_fkey(full_name)')
      .eq('project_id', req.params.id)
      .order('created_at', { ascending: false })
      .then(unwrap),
  ]);
  const urls = await signedUrls('audit-evidence', reviews.map((r) => r.evidence_path));
  res.json({
    data: {
      history,
      reviews: reviews.map(({ auditor, ...r }) => ({ ...r, auditor_name: auditor?.full_name ?? null, evidence_url: urls[r.evidence_path] ?? null })),
    },
  });
}

export async function reviewFlag(req, res) {
  const { id } = req.params;
  const project = unwrap(await adminClient.from('projects').select('id, project_code, auto_flag, completion_status, status').eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found');
  if (!project.auto_flag) throw badRequest('This project has not been evaluated yet.');
  const { decision, reason, audit_status } = req.body;
  const finalFlag = decision === 'confirm' ? project.auto_flag : req.body.final_flag;
  if (decision === 'override' && finalFlag === project.auto_flag) throw badRequest('That is the same as the automatic flag; choose "Confirm" instead.');
  // Concept document §4.2 / §14: every override needs a recorded reason AND supporting evidence.
  if (decision === 'override' && !req.file) {
    throw badRequest('Attach supporting evidence (PDF or photo) to override a flag.', [{ field: 'evidence', message: 'Supporting evidence is required for an override.' }]);
  }

  const evidencePath = await storeEvidence(id, req.file);
  const review = unwrap(
    await adminClient
      .from('flag_reviews')
      .insert({ project_id: id, decision, auto_flag: project.auto_flag, final_flag: finalFlag, reason, evidence_path: evidencePath, auditor_id: req.user.id })
      .select('*')
      .single(),
  );
  const nextAudit = audit_status || (finalFlag === 'red' ? 'for_investigation' : 'verified');
  unwrap(
    await adminClient
      .from('projects')
      .update({ current_flag: finalFlag, flag_review_status: decision === 'confirm' ? 'confirmed' : 'overridden', audit_status: nextAudit, updated_by: req.user.id })
      .eq('id', id),
  );
  unwrap(
    await adminClient.from('flag_history').insert({
      project_id: id,
      source: 'auditor',
      trigger_event: decision === 'confirm' ? 'review_confirm' : 'review_override',
      flag: finalFlag,
      completion_status: project.completion_status,
      project_status: project.status,
      reasons: [{ check: 'auditor', severity: finalFlag, code: decision.toUpperCase(), message: reason }],
      metrics: { auto_flag: project.auto_flag },
      created_by: req.user.id,
    }),
  );
  await logActivity(req, {
    action: decision === 'confirm' ? 'flag.confirm' : 'flag.override',
    entityType: 'flag_review',
    entityId: review.id,
    projectId: id,
    summary:
      decision === 'confirm'
        ? `Confirmed the ${String(finalFlag).toUpperCase()} flag of ${project.project_code}`
        : `Overrode the flag of ${project.project_code}: ${String(project.auto_flag).toUpperCase()} → ${String(finalFlag).toUpperCase()}`,
    details: { reason, audit_status: nextAudit, evidence: Boolean(evidencePath) },
  });
  res.status(201).json({ data: review });
}

export async function recheckAll(req, res) {
  const summary = await runFlagCheck({ trigger: 'manual_recheck', actorId: req.user.id });
  await logActivity(req, {
    action: 'flag.recheck',
    entityType: 'system',
    summary: `Re-checked all project flags: ${summary.evaluated} evaluated, ${summary.changed} changed`,
    details: { evaluated: summary.evaluated, changed: summary.changed, changes: summary.changes.slice(0, 50) },
  });
  res.json({ data: summary });
}
