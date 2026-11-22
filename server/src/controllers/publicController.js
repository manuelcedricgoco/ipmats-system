/**
 * PUBLIC PORTAL — read-only transparency endpoints. Sign-in is required (routes/public.js).
 * The data is read with the service role AFTER the sign-in check. Each query selects
 * only public columns, and the anonymous role has no access (migration 006).
 *   GET /api/public/stats
 *   GET /api/public/projects          search, filters, sort, pagination
 *   GET /api/public/projects/:id      project + phases + progress history + finance
 *
 * Gap fix (concept document §7.4, §14): only 360° photos approved by an Auditor / Admin and
 * audit findings published by them are shown here.
 */
import { adminClient } from '../config/supabase.js';
import { computePlannedProgress, round2, summarizeFinance } from '../services/completion.js';
import { signedUrls } from '../services/storage.js';
import { latestImages } from './mapController.js';
import { HttpError, notFound, unwrap } from '../utils/httpError.js';
import { pagination } from '../utils/pagination.js';

const LIST_COLUMNS =
  'id, project_code, name, project_type, status, municipality_name, barangay_name, agency_name, contractor_name, ' +
  'approved_budget, contract_amount, revised_contract_amount, total_disbursed, remaining_balance, overall_progress, phase_count, ' +
  'notice_to_proceed, duration_days, target_completion_date, actual_completion_date, updated_at, ' +
  // Week 3: flag only after an auditor has reviewed it (null = under review)
  'public_flag, flag_review_status, image_count, latest_inspection_date';
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
  const { page, pageSize, from, to } = pagination(req.query, { maxSize: 48, defaultSize: 12 });
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'updated_at';
  let q = db().from('v_public_projects').select(LIST_COLUMNS, { count: 'exact' });
  if (req.query.municipality_id) q = q.eq('municipality_id', req.query.municipality_id);
  if (req.query.barangay_id) q = q.eq('barangay_id', req.query.barangay_id);
  if (req.query.agency_id) q = q.eq('agency_id', req.query.agency_id);
  if (req.query.status) q = q.eq('status', req.query.status);
  if (req.query.type) q = q.eq('project_type', req.query.type);
  if (req.query.contractor_id) q = q.eq('contractor_id', req.query.contractor_id);
  if (req.query.flag === 'under_review') q = q.is('public_flag', null);
  else if (req.query.flag) q = q.eq('public_flag', req.query.flag);
  if (req.query.search) {
    const s = String(req.query.search).replace(/[%,()]/g, ' ').trim().slice(0, 80);
    if (s) q = q.or(`name.ilike.%${s}%,project_code.ilike.%${s}%,contractor_name.ilike.%${s}%`);
  }
  const ascending = ['name', 'project_code', 'target_completion_date'].includes(sort);
  q = q.order(sort, { ascending }).range(from, to);
  const { data, count, error } = await q;
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}

export async function publicProject(req, res) {
  const c = db();
  const project = unwrap(await c.from('v_public_projects').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  const [phases, progress, records, images, review, findings] = await Promise.all([
    c.from('project_phases').select('id, sequence_no, name, weight, planned_start, planned_end, actual_start, actual_end, accomplishment').eq('project_id', project.id).order('sequence_no').then(unwrap),
    c.from('progress_updates').select('id, report_date, overall_progress, remarks').eq('project_id', project.id).order('report_date', { ascending: false }).then(unwrap),
    c.from('financial_records').select('id, record_type, amount, record_date, description').eq('project_id', project.id).order('record_date', { ascending: false }).then(unwrap),
    c.from('site_images').select('id, storage_path, caption, inspection_date, is_final').eq('project_id', project.id).eq('is_public', true).order('inspection_date', { ascending: false }).limit(12).then(unwrap),
    c.from('flag_reviews').select('decision, final_flag, created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(1).then(unwrap),
    c
      .from('audit_findings')
      .select('id, title, description, severity, recommendation, corrective_action, action_status, due_date, published_at')
      .eq('project_id', project.id)
      .eq('is_public', true)
      .order('published_at', { ascending: false })
      .then(unwrap),
  ]);
  const urls = await signedUrls('panoramas', images.map((i) => i.storage_path));
  // The automatic reasons are shown only once an auditor has reviewed the flag
  let flagReasons = [];
  if (project.public_flag) {
    const p = unwrap(await c.from('projects').select('auto_flag_reasons').eq('id', project.id).single());
    flagReasons = (p.auto_flag_reasons || []).filter((r) => r.severity === 'yellow' || r.severity === 'red').map((r) => ({ severity: r.severity, message: r.message }));
  }
  res.json({
    data: {
      project,
      phases,
      planned_progress: computePlannedProgress(project, phases),
      progress,
      finance: { summary: summarizeFinance(project, records), records },
      images: images.map(({ storage_path: path, ...i }) => ({ ...i, url: urls[path] ?? null })),
      findings,
      flag: project.public_flag
        ? { color: project.public_flag, reviewed_at: review[0]?.created_at ?? null, decision: review[0]?.decision ?? null, reasons: flagReasons }
        : { color: null, under_review: true },
    },
  });
}

/** WEEK 3 — public map: location, reviewed flag and latest 360° image of each project. */
export async function publicMap(req, res) {
  const c = db();
  let q = c
    .from('v_public_projects')
    .select('id, project_code, name, project_type, status, latitude, longitude, municipality_id, municipality_name, barangay_id, barangay_name, agency_id, contractor_id, contractor_name, agency_name, overall_progress, contract_amount, public_flag, image_count, target_completion_date');
  if (req.query.municipality_id) q = q.eq('municipality_id', req.query.municipality_id);
  if (req.query.barangay_id) q = q.eq('barangay_id', req.query.barangay_id);
  if (req.query.agency_id) q = q.eq('agency_id', req.query.agency_id);
  if (req.query.contractor_id) q = q.eq('contractor_id', req.query.contractor_id);
  if (req.query.status) q = q.eq('status', req.query.status);
  if (req.query.flag === 'under_review') q = q.is('public_flag', null);
  else if (req.query.flag) q = q.eq('public_flag', req.query.flag);
  const rows = unwrap(await q.order('project_code'));
  const latest = await latestImages(c, rows.map((r) => r.id), { publicOnly: true });
  const urls = await signedUrls('panoramas', Object.values(latest).map((l) => l.storage_path));
  res.json({ data: rows.map((r) => ({ ...r, latest_image_url: latest[r.id] ? urls[latest[r.id].storage_path] ?? null : null, latest_image_date: latest[r.id]?.inspection_date ?? null })) });
}

/** WEEK 3 — public dashboard (Jonalyn Pagilagan's charts): progress and reviewed flag status. */
export async function publicDashboard(_req, res) {
  const rows = unwrap(await db().from('v_public_projects').select('status, project_type, municipality_name, overall_progress, public_flag, revised_contract_amount, total_disbursed'));
  const by = (key) => rows.reduce((acc, r) => ({ ...acc, [r[key] ?? 'under_review']: (acc[r[key] ?? 'under_review'] || 0) + 1 }), {});
  const muni = {};
  for (const r of rows) {
    const m = (muni[r.municipality_name] ||= { municipality: r.municipality_name, projects: 0, progress_total: 0 });
    m.projects += 1;
    m.progress_total += Number(r.overall_progress || 0);
  }
  res.json({
    data: {
      total_projects: rows.length,
      by_flag: by('public_flag'),
      by_status: by('status'),
      progress_buckets: rows.reduce(
        (b, r) => {
          const p = Number(r.overall_progress || 0);
          const k = p >= 100 ? '100%' : p >= 75 ? '75–99%' : p >= 50 ? '50–74%' : p >= 25 ? '25–49%' : '0–24%';
          return { ...b, [k]: b[k] + 1 };
        },
        { '0–24%': 0, '25–49%': 0, '50–74%': 0, '75–99%': 0, '100%': 0 },
      ),
      by_municipality: Object.values(muni)
        .map(({ progress_total, ...m }) => ({ ...m, average_progress: round2(progress_total / m.projects) }))
        .sort((a, b) => a.municipality.localeCompare(b.municipality)),
    },
  });
}
