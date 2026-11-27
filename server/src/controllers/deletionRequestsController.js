/**
 * Project deletion requests (migration 027). DPWH Personnel may delete a project only with an
 * approval from the System Administrator: valid for 7 days, used once, by the requester only.
 *   POST /projects/:id/deletion-requests          Personnel ask, with a reason
 *   GET  /projects/:id/deletion-request           staff: the project's latest request (project page)
 *   GET  /deletion-requests?status=pending|all    Admin: requests, newest first, paged
 *   POST /deletion-requests/:requestId/approve    Admin, { note? }: only from pending
 *   POST /deletion-requests/:requestId/decline    Admin, { note? }: only from pending
 *   POST /deletion-requests/:requestId/cancel     the requester: only while pending
 * The delete itself is DELETE /projects/:id (projectsController.deleteProject), which marks the
 * approval used.
 */
import { adminClient } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import { conflict, forbidden, notFound, unwrap } from '../utils/httpError.js';
import { pagination } from '../utils/pagination.js';

export const APPROVAL_DAYS = 7;
export const OPEN_REQUEST_MESSAGE = 'This project already has an open deletion request.';
const NOT_PENDING_MESSAGE = 'This deletion request has already been decided or cancelled.';

const SELECT =
  '*, requester:profiles!project_deletion_requests_requested_by_fkey(full_name), ' +
  'decider:profiles!project_deletion_requests_decided_by_fkey(full_name), project:projects(pacc_case_status)';

/** When an approval given at `now` stops being valid. */
export function approvalExpiry(now = new Date()) {
  return new Date(now.getTime() + APPROVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** An approval can be used only by its requester, while approved, unused and not yet expired. */
export function canUseApproval(request, userId, now = new Date()) {
  if (!request || request.status !== 'approved' || request.used_at) return false;
  if (!userId || request.requested_by !== userId) return false;
  if (!request.approval_expires_at) return false;
  return new Date(request.approval_expires_at).getTime() > now.getTime();
}

function isExpired(request, now) {
  if (request.status === 'expired') return true;
  return request.status === 'approved' && Boolean(request.approval_expires_at) && new Date(request.approval_expires_at).getTime() <= now.getTime();
}

/** Flattens the embedded names and the project's PACC case status; adds `expired`. */
export function presentRequest({ requester, decider, project, ...row }, now = new Date()) {
  return {
    ...row,
    requested_by_name: requester?.full_name ?? null,
    decided_by_name: decider?.full_name ?? null,
    pacc_case_status: project?.pacc_case_status ?? null,
    expired: isExpired(row, now),
  };
}

async function getRequestOrThrow(id) {
  const row = unwrap(await adminClient.from('project_deletion_requests').select('*').eq('id', id).maybeSingle());
  if (!row) throw notFound('Deletion request not found');
  return row;
}

/** Approvals of the project that ran out unused become `expired`, so a new request can be made. */
async function expireOldApprovals(projectId, now) {
  unwrap(
    await adminClient
      .from('project_deletion_requests')
      .update({ status: 'expired' })
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .lte('approval_expires_at', now.toISOString()),
  );
}

export async function createDeletionRequest(req, res) {
  const { id } = req.params;
  const project = unwrap(await adminClient.from('projects').select('id, project_code, name').eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found');
  await expireOldApprovals(id, new Date());
  const row = unwrap(
    await adminClient
      .from('project_deletion_requests')
      .insert({ project_id: id, project_code: project.project_code, project_name: project.name, requested_by: req.user.id, reason: req.body.reason })
      .select('*')
      .single(),
    { conflictMessage: OPEN_REQUEST_MESSAGE },
  );
  await logActivity(req, {
    action: 'project.deletion_request',
    entityType: 'project',
    entityId: id,
    projectId: id,
    summary: `Asked to delete project ${project.project_code} — ${project.name}`,
    details: { request_id: row.id, reason: row.reason },
  });
  res.status(201).json({ data: row });
}

/** The project's latest request (any status), for the project page. null when there is none. */
export async function getProjectDeletionRequest(req, res) {
  const rows = unwrap(
    await req.db.from('project_deletion_requests').select(SELECT).eq('project_id', req.params.id).order('created_at', { ascending: false }).limit(1),
  );
  res.json({ data: rows[0] ? presentRequest(rows[0]) : null });
}

export async function listDeletionRequests(req, res) {
  const { page, pageSize, from, to } = pagination(req.query);
  let q = req.db.from('project_deletion_requests').select(SELECT, { count: 'exact' }).order('created_at', { ascending: false });
  if (req.query.status !== 'all') q = q.eq('status', 'pending');
  const { data, count, error } = await q.range(from, to);
  unwrap({ data, error });
  const now = new Date();
  res.json({ data: data.map((r) => presentRequest(r, now)), page, pageSize, total: count ?? 0 });
}

/** pending -> approved | declined, by the Admin. The status guard stops a double decision. */
async function decide(req, res, decision) {
  const request = await getRequestOrThrow(req.params.requestId);
  if (request.status !== 'pending') throw conflict(NOT_PENDING_MESSAGE);
  if (!request.project_id) throw conflict('The project of this request has already been deleted.');
  const now = new Date();
  const patch = {
    status: decision,
    decided_by: req.user.id,
    decided_at: now.toISOString(),
    decision_note: req.body.note ?? null,
    ...(decision === 'approved' && { approval_expires_at: approvalExpiry(now) }),
  };
  const row = unwrap(
    await adminClient.from('project_deletion_requests').update(patch).eq('id', request.id).eq('status', 'pending').select('*').maybeSingle(),
  );
  if (!row) throw conflict(NOT_PENDING_MESSAGE);
  const approved = decision === 'approved';
  await logActivity(req, {
    action: approved ? 'project.deletion_approve' : 'project.deletion_decline',
    entityType: 'project',
    entityId: request.project_id,
    projectId: request.project_id,
    summary: `${approved ? 'Approved' : 'Declined'} the request to delete project ${request.project_code} — ${request.project_name}`,
    details: { request_id: request.id, requested_by: request.requested_by, note: row.decision_note, ...(approved && { approval_expires_at: row.approval_expires_at }) },
  });
  res.json({ data: row });
}

export const approveDeletionRequest = (req, res) => decide(req, res, 'approved');
export const declineDeletionRequest = (req, res) => decide(req, res, 'declined');

export async function cancelDeletionRequest(req, res) {
  const request = await getRequestOrThrow(req.params.requestId);
  if (request.requested_by !== req.user.id) throw forbidden('Only the person who made this request can cancel it.');
  if (request.status !== 'pending') throw conflict('Only a pending request can be cancelled.');
  const row = unwrap(
    await adminClient.from('project_deletion_requests').update({ status: 'cancelled' }).eq('id', request.id).eq('status', 'pending').select('*').maybeSingle(),
  );
  if (!row) throw conflict('Only a pending request can be cancelled.');
  await logActivity(req, {
    action: 'project.deletion_cancel',
    entityType: 'project',
    entityId: request.project_id,
    projectId: request.project_id,
    summary: `Cancelled the request to delete project ${request.project_code} — ${request.project_name}`,
    details: { request_id: request.id },
  });
  res.json({ data: row });
}
