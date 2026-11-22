/**
 * WEEK 3 — Audit findings API (Julina Mae Escabosa, Back-end)
 *   GET   /findings                         all findings (filters: action_status, severity, assigned_to=me)
 *   GET   /projects/:id/findings
 *   POST  /projects/:id/findings            auditor records a finding (+ evidence file)
 *   PATCH /findings/:findingId              update / corrective action / status (+ evidence)
 *
 * Gap fixes (concept document §4.6, §7.3, §7.4):
 *   GET   /audit/assignees                  Auditor / Admin: DPWH personnel who can be assigned a finding
 *   GET   /findings/assigned                findings assigned to the signed-in DPWH personnel account
 *   PATCH /findings/:findingId/action       the assigned person reports progress on the corrective action
 *   PATCH /findings/:findingId/public       Auditor / Admin: publish the finding on the public portal, or hide it
 */
import { adminClient } from '../config/supabase.js';
import { changedFields, logActivity, projectCode } from '../services/activityLog.js';
import { signedUrls } from '../services/storage.js';
import { badRequest, forbidden, notFound, unwrap } from '../utils/httpError.js';
import { storeEvidence } from './flagsController.js';

const SELECT =
  '*, project:projects(project_code, name), phase:project_phases(name), ' +
  'auditor:profiles!audit_findings_auditor_id_fkey(full_name), assignee:profiles!audit_findings_assigned_to_fkey(full_name, position)';

async function present(rows) {
  const urls = await signedUrls('audit-evidence', rows.map((r) => r.evidence_path));
  return rows.map(({ project, phase, auditor, assignee, ...r }) => ({
    ...r,
    project_code: project?.project_code,
    project_name: project?.name,
    phase_name: phase?.name ?? null,
    auditor_name: auditor?.full_name ?? null,
    assigned_to_name: assignee?.full_name ?? null,
    assigned_to_position: assignee?.position ?? null,
    evidence_url: urls[r.evidence_path] ?? null,
  }));
}

export async function listFindings(req, res) {
  let q = req.db.from('audit_findings').select(SELECT).order('created_at', { ascending: false });
  if (req.params.id) q = q.eq('project_id', req.params.id);
  if (req.query.action_status) q = q.eq('action_status', req.query.action_status);
  if (req.query.severity) q = q.eq('severity', req.query.severity);
  res.json({ data: await present(unwrap(await q)) });
}

/** Findings assigned to the signed-in person (DPWH personnel), open ones first. */
export async function assignedFindings(req, res) {
  const rows = unwrap(await req.db.from('audit_findings').select(SELECT).eq('assigned_to', req.user.id).order('created_at', { ascending: false }));
  const order = { open: 0, in_progress: 1, resolved: 2, closed: 3 };
  rows.sort((a, b) => order[a.action_status] - order[b.action_status]);
  res.json({ data: await present(rows) });
}

/** Active, approved DPWH personnel accounts (for the "Assign to" list). */
export async function assignees(_req, res) {
  const rows = unwrap(
    await adminClient
      .from('profiles')
      .select('id, full_name, position, agency:agencies(name)')
      .eq('role', 'dpwh_personnel')
      .eq('is_active', true)
      .eq('approval_status', 'approved')
      .order('full_name'),
  );
  res.json({ data: rows.map(({ agency, ...p }) => ({ ...p, agency_name: agency?.name ?? null })) });
}

async function assertAssignee(userId) {
  if (!userId) return;
  const p = unwrap(await adminClient.from('profiles').select('id, role, is_active, approval_status').eq('id', userId).maybeSingle());
  if (!p || p.role !== 'dpwh_personnel' || !p.is_active || p.approval_status !== 'approved') {
    throw badRequest('A finding can only be assigned to an active DPWH personnel account.', [{ field: 'assigned_to', message: 'Choose an active DPWH personnel account.' }]);
  }
}

export async function createFinding(req, res) {
  const { id } = req.params;
  const p = unwrap(await adminClient.from('projects').select('id, project_code').eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  if (req.body.phase_id) {
    const ph = unwrap(await adminClient.from('project_phases').select('id').eq('id', req.body.phase_id).eq('project_id', id).maybeSingle());
    if (!ph) throw badRequest('The selected phase does not belong to this project.');
  }
  await assertAssignee(req.body.assigned_to);
  const evidence_path = await storeEvidence(id, req.file);
  const row = unwrap(
    await adminClient
      .from('audit_findings')
      .insert({ ...req.body, evidence_path, project_id: id, auditor_id: req.user.id, assigned_at: req.body.assigned_to ? new Date().toISOString() : null })
      .select('*')
      .single(),
  );
  // A new finding puts the project under review unless it is already further along
  await adminClient.from('projects').update({ audit_status: 'under_review' }).eq('id', id).eq('audit_status', 'not_audited');
  await logActivity(req, {
    action: 'finding.create',
    entityType: 'finding',
    entityId: row.id,
    projectId: id,
    summary: `Recorded ${row.severity} finding "${row.title}" on ${p.project_code}${row.assigned_to ? ' and assigned its corrective action' : ''}`,
    details: { severity: row.severity, assigned_to: row.assigned_to },
  });
  res.status(201).json({ data: row });
}

export async function updateFinding(req, res) {
  const f = unwrap(await adminClient.from('audit_findings').select('*').eq('id', req.params.findingId).maybeSingle());
  if (!f) throw notFound('Finding not found');
  if (req.body.assigned_to !== undefined) await assertAssignee(req.body.assigned_to);
  const evidence_path = await storeEvidence(f.project_id, req.file);
  const patch = { ...req.body, ...(evidence_path ? { evidence_path } : {}) };
  if (req.body.assigned_to !== undefined && req.body.assigned_to !== f.assigned_to) patch.assigned_at = req.body.assigned_to ? new Date().toISOString() : null;
  const changed = changedFields(f, req.body);
  const row = unwrap(await adminClient.from('audit_findings').update(patch).eq('id', f.id).select('*').single());
  await logActivity(req, {
    action: changed.includes('assigned_to') ? 'finding.assign' : 'finding.update',
    entityType: 'finding',
    entityId: f.id,
    projectId: f.project_id,
    summary: `Updated finding "${row.title}" on ${await projectCode(f.project_id)}${changed.length ? ` (${changed.join(', ')})` : ''}`,
    details: { changed, action_status: row.action_status, assigned_to: row.assigned_to },
  });
  res.json({ data: row });
}

/** The assigned DPWH personnel reports on the corrective action (Auditor / Admin may also use it). */
export async function updateFindingAction(req, res) {
  const f = unwrap(await adminClient.from('audit_findings').select('*').eq('id', req.params.findingId).maybeSingle());
  if (!f) throw notFound('Finding not found');
  const isReviewer = ['auditor', 'admin'].includes(req.user.role);
  if (!isReviewer && f.assigned_to !== req.user.id) throw forbidden('Only the person assigned to this finding can update its corrective action.');
  if (f.action_status === 'closed') throw badRequest('This finding is closed by the auditor and can no longer be changed.');
  const patch = { action_updated_by: req.user.id, action_updated_at: new Date().toISOString() };
  if (req.body.corrective_action !== undefined) patch.corrective_action = req.body.corrective_action;
  if (req.body.action_status !== undefined) patch.action_status = req.body.action_status;
  const row = unwrap(await adminClient.from('audit_findings').update(patch).eq('id', f.id).select('*').single());
  await logActivity(req, {
    action: 'finding.action',
    entityType: 'finding',
    entityId: f.id,
    projectId: f.project_id,
    summary: `Reported on corrective action of "${f.title}" (${await projectCode(f.project_id)}): ${String(row.action_status).replace('_', ' ')}`,
    details: { from: f.action_status, to: row.action_status },
  });
  res.json({ data: row });
}

/** Publish a finding on the public portal (disclosure approved), or hide it again. */
export async function setFindingPublic(req, res) {
  const f = unwrap(await adminClient.from('audit_findings').select('id, project_id, title').eq('id', req.params.findingId).maybeSingle());
  if (!f) throw notFound('Finding not found');
  const row = unwrap(
    await adminClient
      .from('audit_findings')
      .update({ is_public: req.body.is_public, published_by: req.user.id, published_at: new Date().toISOString() })
      .eq('id', f.id)
      .select('*')
      .single(),
  );
  await logActivity(req, {
    action: req.body.is_public ? 'finding.publish' : 'finding.unpublish',
    entityType: 'finding',
    entityId: f.id,
    projectId: f.project_id,
    summary: `${req.body.is_public ? 'Published' : 'Hid'} finding "${f.title}" ${req.body.is_public ? 'on' : 'from'} the public portal (${await projectCode(f.project_id)})`,
  });
  res.json({ data: row });
}
