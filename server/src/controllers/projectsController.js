/**
 * WEEK 1 — Projects API (Julina Mae Escabosa, Back-end)
 * Register, update, list and view infrastructure projects: identification,
 * implementing office (agency), contractor, location, budget and duration.
 * Reads run as the signed-in user (RLS); writes use the service key after the
 * role check in the route.
 */
import { adminClient } from '../config/supabase.js';
import { addDays } from '../services/completion.js';
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
  'current_flag, flag_review_status, planned_progress, image_count';

/** Filters shared by the list endpoint. */
export function applyProjectFilters(query, f) {
  let q = query;
  if (f.municipality_id) q = q.eq('municipality_id', f.municipality_id);
  if (f.barangay_id) q = q.eq('barangay_id', f.barangay_id);
  if (f.agency_id) q = q.eq('agency_id', f.agency_id);
  if (f.contractor_id) q = q.eq('contractor_id', f.contractor_id);
  if (f.status) q = q.eq('status', f.status);
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

async function getProjectOrThrow(id, columns = '*') {
  const data = unwrap(await adminClient.from('projects').select(columns).eq('id', id).maybeSingle());
  if (!data) throw notFound('Project not found');
  return data;
}

export async function createProject(req, res) {
  const body = { ...req.body };
  // Week 3: status is automatic unless Suspended / Terminated is chosen
  if (body.status === 'auto') delete body.status;
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
  const evaluation = await reevaluate(project.id, 'project_created', req.user.id);
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
  // Decision D3: once 360° photos exist, only a System Administrator may move the project site.
  const locationChanged = isLocationChange(current, req.body);
  if (locationChanged && req.user.role !== 'admin') {
    const { count, error } = await adminClient.from('site_images').select('id', { count: 'exact', head: true }).eq('project_id', id);
    unwrap({ data: null, error });
    if (count > 0) throw forbidden('The project location can only be changed by a System Administrator once 360° photos are on file.');
  }
  const body = { ...req.body };
  // Week 3: "auto" lifts a manual Suspended / Terminated status; the evaluation below sets the real status.
  if (body.status === 'auto') {
    if (['suspended', 'terminated'].includes(current.status)) body.status = 'ongoing';
    else delete body.status;
  }
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
    details: {
      changed,
      ...(locationChanged && {
        location: {
          from: { latitude: current.latitude, longitude: current.longitude },
          to: { latitude: body.latitude ?? current.latitude, longitude: body.longitude ?? current.longitude },
        },
      }),
    },
  });
  res.json({ data: { id, evaluation } });
}

export async function deleteProject(req, res) {
  const project = await getProjectOrThrow(req.params.id, 'id, project_code, name');
  unwrap(await adminClient.from('projects').delete().eq('id', project.id));
  await logActivity(req, { action: 'project.delete', entityType: 'project', entityId: project.id, summary: `Deleted project ${project.project_code} — ${project.name}` });
  res.status(204).end();
}
