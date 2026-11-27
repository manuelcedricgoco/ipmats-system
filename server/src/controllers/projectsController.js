/**
 * WEEK 1 — Projects API (Julina Mae Escabosa, Back-end)
 * Register, update, list and view infrastructure projects: identification,
 * implementing office (agency), contractor, location, budget and duration.
 * Reads run as the signed-in user (RLS); writes use the service key after the
 * role check in the route.
 */
import { adminClient } from '../config/supabase.js';
import { addDays } from '../services/completion.js';
import { canUseApproval } from './deletionRequestsController.js';
import { pagination } from '../utils/pagination.js';
import { changedFields, logActivity } from '../services/activityLog.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { assertValid, checkContractAmountChange, isLocationChange } from '../services/validationRules.js';
import { OUTSIDE_PROVINCE_MESSAGE, isWithinOccidentalMindoro } from '../utils/geo.js';
import { badRequest, forbidden, notFound, unwrap } from '../utils/httpError.js';

const LIST_COLUMNS =
  'id, project_code, name, project_type, status, approved_budget, contract_amount, notice_to_proceed, duration_days, ' +
  'target_completion_date, actual_completion_date, municipality_id, municipality_name, barangay_id, barangay_name, ' +
  'agency_id, agency_name, contractor_id, contractor_name, updated_at, ' +
  // Week 2
  'overall_progress, phase_count, revised_contract_amount, total_disbursed, remaining_balance, ' +
  // Week 3
  'current_flag, flag_review_status, planned_progress, image_count, ' +
  // 027: status of a non-closed PACC case (staff only; never the case itself)
  'pacc_case_status';
const FILTERABLE_STATUSES = new Set(['not_started', 'ongoing', 'delayed', 'completed']);

/** Filters shared by the list endpoint. */
export function applyProjectFilters(query, f) {
  let q = query;
  if (f.municipality_id) q = q.eq('municipality_id', f.municipality_id);
  if (f.barangay_id) q = q.eq('barangay_id', f.barangay_id);
  if (f.agency_id) q = q.eq('agency_id', f.agency_id);
  if (f.contractor_id) q = q.eq('contractor_id', f.contractor_id);
  if (FILTERABLE_STATUSES.has(f.status)) q = q.eq('status', f.status);
  if (f.type) q = q.eq('project_type', f.type);
  if (f.search) {
    const s = String(f.search).replace(/[%,()]/g, ' ').trim();
    if (s) q = q.or(`name.ilike.%${s}%,project_code.ilike.%${s}%,contractor_name.ilike.%${s}%`);
  }
  return q;
}

export async function listProjects(req, res) {
  const { page, pageSize, from, to } = pagination(req.query);
  const sortable = ['updated_at', 'name', 'project_code', 'approved_budget', 'contract_amount', 'duration_days', 'target_completion_date', 'overall_progress', 'total_disbursed'];
  const sort = sortable.includes(req.query.sort) ? req.query.sort : 'updated_at';
  const ascending = req.query.order === 'asc';
  let q = req.db.from('v_project_summary').select(LIST_COLUMNS, { count: 'exact' });
  q = applyProjectFilters(q, req.query).order(sort, { ascending }).range(from, to);
  const { data, count, error } = await q;
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}

export async function getProject(req, res) {
  const project = unwrap(await req.db.from('v_project_summary').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  res.json({ data: project });
}

/** Dashboard numbers (counts and totals of the projects the user can see). */
export async function projectStats(req, res) {
  const rows = unwrap(await req.db.from('v_project_summary').select('status, project_type, approved_budget, contract_amount, agency_id, contractor_id, overall_progress, phase_count, revised_contract_amount, total_disbursed, remaining_balance'));
  const countBy = (k) => rows.reduce((a, r) => ({ ...a, [r[k]]: (a[r[k]] || 0) + 1 }), {});
  const sum = (k) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  res.json({
    data: {
      total_projects: rows.length,
      by_status: countBy('status'),
      by_type: countBy('project_type'),
      total_approved_budget: sum('approved_budget'),
      total_contract_amount: sum('contract_amount'),
      contractors_with_projects: new Set(rows.map((r) => r.contractor_id).filter(Boolean)).size,
      offices_with_projects: new Set(rows.map((r) => r.agency_id)).size,
      // Week 2
      average_progress: rows.length ? Math.round((sum('overall_progress') / rows.length) * 100) / 100 : 0,
      projects_without_phases: rows.filter((r) => !Number(r.phase_count)).length,
      total_revised_contract: sum('revised_contract_amount'),
      total_disbursed: sum('total_disbursed'),
      total_remaining_balance: sum('remaining_balance'),
    },
  });
}

async function assertBarangayInMunicipality(barangayId, municipalityId) {
  if (!barangayId) return;
  const b = unwrap(await adminClient.from('barangays').select('municipality_id').eq('id', barangayId).maybeSingle());
  if (!b || b.municipality_id !== municipalityId) throw badRequest('The selected barangay does not belong to the selected municipality.');
}

/** Server-side location rule: the project must be inside Occidental Mindoro (not just the map's view). */
function assertInsideProvince(latitude, longitude) {
  if (!isWithinOccidentalMindoro(latitude, longitude)) {
    throw badRequest(OUTSIDE_PROVINCE_MESSAGE, [{ field: 'latitude', message: OUTSIDE_PROVINCE_MESSAGE }]);
  }
}

export const LOCATION_LOCKED_MESSAGE = 'The project location cannot be changed once 360° photos are on file.';
export const DELETE_NEEDS_APPROVAL_MESSAGE = 'Ask a System Administrator to approve deleting this project first.';
const ROLE_LABELS = { admin: 'System Administrator', dpwh_personnel: 'DPWH Personnel', auditor: 'Auditor' };
const OPEN_CASE_STATUSES = ['under_investigation', 'case_filed'];

/** Once 360° photos are on file, nobody may move the project site (027: the Admin included). */
export function assertLocationEditable({ locationChanged, photoCount }) {
  if (locationChanged && photoCount > 0) throw forbidden(LOCATION_LOCKED_MESSAGE);
}

/** The pacc_activity row written (by "System") when a project with a non-closed PACC case is deleted. */
export function paccDeletionEntry(project, user, openCase, now = new Date()) {
  const who = user?.profile?.full_name || user?.email || 'Unknown user';
  const role = ROLE_LABELS[user?.role] || user?.role || 'unknown role';
  return {
    actor_id: null,
    actor_name: 'System',
    action: 'project.deleted',
    entity_type: 'project',
    entity_id: String(project.id),
    project_id: project.id,
    summary: `Project ${project.project_code} — ${project.name} was deleted by ${who} (${role}) while a PACC case was open.`.slice(0, 500),
    details: {
      case_id: openCase.id,
      case_status: openCase.status,
      deleted_by: { id: user?.id ?? null, name: who, role: user?.role ?? null },
      deleted_at: now.toISOString(),
    },
  };
}

const ADMIN_DELETED_NOTE = 'The System Administrator deleted the project.';

/**
 * How an open deletion request is closed when the Admin deletes the project directly. A pending
 * request gets the Admin as decider and a note; an approved one keeps its decision (who approved,
 * when, and their note) and gets the note only if it has none.
 */
export function adminDeleteCancelPatch(request, adminId, now = new Date()) {
  if (request.status === 'pending') {
    return { status: 'cancelled', decided_by: adminId, decided_at: now.toISOString(), decision_note: ADMIN_DELETED_NOTE };
  }
  return { status: 'cancelled', ...(!request.decision_note && { decision_note: ADMIN_DELETED_NOTE }) };
}

async function getProjectOrThrow(id, columns = '*') {
  const data = unwrap(await adminClient.from('projects').select(columns).eq('id', id).maybeSingle());
  if (!data) throw notFound('Project not found');
  return data;
}

export async function createProject(req, res) {
  const body = { ...req.body };
  const statusOverride = ['not_started', 'ongoing'].includes(body.status) ? body.status : undefined;
  if (!statusOverride) delete body.status;
  assertInsideProvince(body.latitude, body.longitude);
  await assertBarangayInMunicipality(body.barangay_id, body.municipality_id);
  if (body.notice_to_proceed && body.duration_days && !body.target_completion_date) {
    body.target_completion_date = addDays(body.notice_to_proceed, body.duration_days);
  }
  const project = unwrap(
    await adminClient
      .from('projects')
      .insert({ ...body, created_by: req.user.id, updated_by: req.user.id })
      .select('id, project_code')
      .single(),
  );
  const evaluation = await reevaluate(project.id, 'project_created', req.user.id, { statusOverride });
  await logActivity(req, {
    action: 'project.create',
    entityType: 'project',
    entityId: project.id,
    projectId: project.id,
    summary: `Registered project ${project.project_code} — ${body.name}`,
    details: { flag: evaluation?.flag ?? null },
  });
  res.status(201).json({ data: { ...project, evaluation } });
}

export async function updateProject(req, res) {
  const { id } = req.params;
  const current = await getProjectOrThrow(id, 'id, municipality_id, barangay_id, notice_to_proceed, duration_days, status, latitude, longitude');
  if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
    assertInsideProvince(req.body.latitude ?? current.latitude, req.body.longitude ?? current.longitude);
  }
  // Once 360° photos exist, nobody may move the project site (027: the Admin included).
  if (isLocationChange(current, req.body)) {
    const { count, error } = await adminClient.from('site_images').select('id', { count: 'exact', head: true }).eq('project_id', id);
    unwrap({ data: null, error });
    assertLocationEditable({ locationChanged: true, photoCount: count ?? 0 });
  }
  const body = { ...req.body };
  // "auto" requests a fresh status evaluation; any other status input is discarded.
  if (body.status === 'auto') {
    if (['suspended', 'terminated'].includes(current.status)) body.status = 'ongoing';
    else delete body.status;
  } else delete body.status;
  if (body.contract_amount !== undefined) {
    const records = unwrap(await adminClient.from('financial_records').select('record_type, amount').eq('project_id', id));
    assertValid(checkContractAmountChange({ contractAmount: body.contract_amount, records }));
  }
  if (body.barangay_id !== undefined || body.municipality_id !== undefined) {
    await assertBarangayInMunicipality(body.barangay_id ?? current.barangay_id, body.municipality_id ?? current.municipality_id);
  }
  const ntp = body.notice_to_proceed ?? current.notice_to_proceed;
  const days = body.duration_days ?? current.duration_days;
  if ((body.notice_to_proceed || body.duration_days) && !body.target_completion_date && ntp && days) {
    body.target_completion_date = addDays(ntp, days);
  }
  const before = unwrap(await adminClient.from('projects').select('*').eq('id', id).single());
  unwrap(await adminClient.from('projects').update({ ...body, updated_by: req.user.id }).eq('id', id));
  const evaluation = await reevaluate(id, 'project_updated', req.user.id);
  const changed = changedFields(before, body);
  await logActivity(req, {
    action: 'project.update',
    entityType: 'project',
    entityId: id,
    projectId: id,
    summary: `Updated project ${before.project_code}${changed.length ? ` (${changed.join(', ')})` : ''}`,
    details: { changed },
  });
  res.json({ data: { id, evaluation } });
}

/**
 * The Admin deletes directly. DPWH Personnel need their own approved, unexpired, unused deletion
 * request for the project (027); it is marked used right before the delete. Every phase, report,
 * finance record, photo and document of the project goes with it; PACC cases survive (024).
 */
export async function deleteProject(req, res) {
  const project = await getProjectOrThrow(req.params.id, 'id, project_code, name');
  const now = new Date();

  let approval = null;
  if (req.user.role !== 'admin') {
    const approvals = unwrap(
      await adminClient
        .from('project_deletion_requests')
        .select('id, requested_by, status, approval_expires_at, used_at')
        .eq('project_id', project.id)
        .eq('requested_by', req.user.id)
        .eq('status', 'approved'),
    );
    approval = approvals.find((r) => canUseApproval(r, req.user.id, now));
    if (!approval) throw forbidden(DELETE_NEEDS_APPROVAL_MESSAGE);
  }

  const openCase = unwrap(
    await adminClient.from('pacc_cases').select('id, status').eq('project_id', project.id).in('status', OPEN_CASE_STATUSES).limit(1).maybeSingle(),
  );

  let openRequests = [];
  if (approval) {
    // Single use: the status guard lets only one of two simultaneous deletes through.
    const used = unwrap(
      await adminClient
        .from('project_deletion_requests')
        .update({ status: 'used', used_at: now.toISOString() })
        .eq('id', approval.id)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle(),
    );
    if (!used) throw forbidden(DELETE_NEEDS_APPROVAL_MESSAGE);
  } else {
    // The Admin deletes directly: open requests on the project are closed once the delete succeeds.
    openRequests = unwrap(
      await adminClient.from('project_deletion_requests').select('id, status, decision_note').eq('project_id', project.id).in('status', ['pending', 'approved']),
    );
  }

  try {
    // PACC keeps its case (project_id becomes NULL); tell PACC who deleted the project, before it goes.
    if (openCase) unwrap(await adminClient.from('pacc_activity').insert(paccDeletionEntry(project, req.user, openCase, now)));
    unwrap(await adminClient.from('projects').delete().eq('id', project.id));
  } catch (err) {
    // Nothing was deleted: give the approval back so it can be used again.
    if (approval) {
      await adminClient.from('project_deletion_requests').update({ status: 'approved', used_at: null }).eq('id', approval.id).eq('status', 'used');
    }
    throw err;
  }

  // project_id is now NULL on these rows, so they are updated by id.
  for (const r of openRequests) {
    const patch = adminDeleteCancelPatch(r, req.user.id, now);
    const { error } = await adminClient.from('project_deletion_requests').update(patch).eq('id', r.id).eq('status', r.status);
    if (error) console.error('[deletion-requests] could not close request', r.id, error.message);
  }

  await logActivity(req, {
    action: 'project.delete',
    entityType: 'project',
    entityId: project.id,
    summary: `Deleted project ${project.project_code} — ${project.name}`,
    details: {
      ...(approval && { deletion_request_id: approval.id }),
      ...(openRequests.length > 0 && { cancelled_deletion_request_ids: openRequests.map((r) => r.id) }),
    },
  });
  res.status(204).end();
}
