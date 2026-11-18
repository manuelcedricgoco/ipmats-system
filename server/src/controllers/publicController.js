/**
 * PUBLIC PORTAL — read-only transparency endpoints. Sign-in is required (routes/public.js).
 * The data is read with the service role AFTER the sign-in check. Each query selects
 * only public columns, and the anonymous role has no access (migration 006).
 *   GET /api/public/stats
 *   GET /api/public/projects          search, filters, sort, pagination
 *   GET /api/public/projects/:id      project + phases + progress history + finance
 */
import { adminClient } from '../config/supabase.js';
import { computePlannedProgress, round2, summarizeFinance } from '../services/completion.js';
import { HttpError, notFound, unwrap } from '../utils/httpError.js';

const LIST_COLUMNS =
  'id, project_code, name, project_type, status, municipality_name, barangay_name, agency_name, contractor_name, ' +
  'approved_budget, contract_amount, revised_contract_amount, total_disbursed, remaining_balance, overall_progress, phase_count, ' +
  'notice_to_proceed, duration_days, target_completion_date, actual_completion_date, updated_at';
const SORTS = ['updated_at', 'name', 'project_code', 'overall_progress', 'contract_amount', 'target_completion_date'];

function db() {
  if (!adminClient) throw new HttpError(503, 'The server is not connected to the database (service key missing).');
  return adminClient;
}

export async function publicStats(_req, res) {
  const rows = unwrap(await db().from('v_public_projects').select('status, approved_budget, revised_contract_amount, total_disbursed, overall_progress, municipality_id'));
  const sum = (k) => round2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    data: {
      total_projects: rows.length,
      ongoing: rows.filter((r) => r.status === 'ongoing' || r.status === 'delayed').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      municipalities: new Set(rows.map((r) => r.municipality_id)).size,
      total_approved_budget: sum('approved_budget'),
      total_contract_amount: sum('revised_contract_amount'),
      total_disbursed: sum('total_disbursed'),
      average_progress: rows.length ? round2(sum('overall_progress') / rows.length) : 0,
    },
  });
}

export async function publicProjects(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(48, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 12));
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'updated_at';
  let q = db().from('v_public_projects').select(LIST_COLUMNS, { count: 'exact' });
  if (req.query.municipality_id) q = q.eq('municipality_id', req.query.municipality_id);
  if (req.query.status) q = q.eq('status', req.query.status);
  if (req.query.type) q = q.eq('project_type', req.query.type);
  if (req.query.search) {
    const s = String(req.query.search).replace(/[%,()]/g, ' ').trim().slice(0, 80);
    if (s) q = q.or(`name.ilike.%${s}%,project_code.ilike.%${s}%,contractor_name.ilike.%${s}%`);
  }
  const ascending = ['name', 'project_code', 'target_completion_date'].includes(sort);
  q = q.order(sort, { ascending }).range((page - 1) * pageSize, page * pageSize - 1);
  const { data, count, error } = await q;
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}

export async function publicProject(req, res) {
  const c = db();
  const project = unwrap(await c.from('v_public_projects').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  const [phases, progress, records] = await Promise.all([
    c.from('project_phases').select('id, sequence_no, name, weight, planned_start, planned_end, actual_start, actual_end, accomplishment').eq('project_id', project.id).order('sequence_no').then(unwrap),
    c.from('progress_updates').select('id, report_date, overall_progress, remarks').eq('project_id', project.id).order('report_date', { ascending: false }).then(unwrap),
    c.from('financial_records').select('id, record_type, amount, record_date, description').eq('project_id', project.id).order('record_date', { ascending: false }).then(unwrap),
  ]);
  res.json({
    data: {
      project,
      phases,
      planned_progress: computePlannedProgress(project, phases),
      progress,
      finance: { summary: summarizeFinance(project, records), records },
    },
  });
}
