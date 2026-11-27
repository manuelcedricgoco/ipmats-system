/**
 * PUBLIC PORTAL — read-only, no account needed (routes/public.js).
 *
 * Every query runs as the ANONYMOUS role (the publishable key, `anonClient`), so Row Level
 * Security and the column grants of migrations 016 and 021 decide what comes back. The only flag
 * sent is `public_flag` (021): the flag once an auditor has confirmed or overridden it, otherwise
 * null ("Under review"). The automatic flag and its reasons, audit findings, finances, phases,
 * progress reports and activity logs are staff-only: they are not selected here and anon could
 * not read them anyway.
 *   GET /api/public/stats          the four counters of the landing page
 *   GET /api/public/projects       project cards: search, status / municipality filter, pagination
 *   GET /api/public/map            every project with coordinates (map pins)
 *   GET /api/public/projects/:id   map drawer: project details + public 360° images
 *
 * 360° images: the rows come from site_images through RLS (only images approved for the public);
 * the files are private in Storage, so the API signs short-lived links for exactly those rows.
 */
import { anonClient } from '../config/supabase.js';
import { signedUrls } from '../services/storage.js';
import { HttpError, notFound, unwrap } from '../utils/httpError.js';
import { pagination } from '../utils/pagination.js';

/** Landing-page counters: which project statuses each card counts (besides Total). */
export const STAT_GROUPS = Object.freeze({
  ongoing: ['ongoing'],
  completed: ['completed'],
  delayed_or_stalled: ['delayed', 'suspended'],
});

const CARD_COLUMNS =
  'id, project_code, name, project_type, status, municipality_id, municipality_name, barangay_name, agency_name, contractor_name, ' +
  'contract_amount, overall_progress, notice_to_proceed, target_completion_date, actual_completion_date, image_count, latitude, longitude, updated_at, public_flag';
// public_flag (migration 021): the flag only once an auditor has reviewed it, otherwise null ("Under review").
const PIN_COLUMNS = 'id, project_code, name, project_type, status, latitude, longitude, municipality_name, barangay_name, overall_progress, contract_amount, public_flag';
const SORTS = ['updated_at', 'name', 'project_code', 'overall_progress', 'contract_amount', 'target_completion_date'];
const STATUSES = ['not_started', 'ongoing', 'delayed', 'completed', 'suspended', 'terminated'];

function db() {
  if (!anonClient) throw new HttpError(503, 'The server is not connected to the database.');
  return anonClient;
}

export async function publicStats(_req, res) {
  const rows = unwrap(await db().from('v_public_projects').select('status'));
  const count = (statuses) => rows.filter((r) => statuses.includes(r.status)).length;
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    data: {
      total_projects: rows.length,
      ongoing: count(STAT_GROUPS.ongoing),
      completed: count(STAT_GROUPS.completed),
      delayed_or_stalled: count(STAT_GROUPS.delayed_or_stalled),
      status_groups: STAT_GROUPS,
    },
  });
}

export async function publicProjects(req, res) {
  const { page, pageSize, from, to } = pagination(req.query, { maxSize: 48, defaultSize: 12 });
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'updated_at';
  let q = db().from('v_public_projects').select(CARD_COLUMNS, { count: 'exact' });
  if (req.query.municipality_id) q = q.eq('municipality_id', req.query.municipality_id);
  if (req.query.status === 'delayed_or_stalled') q = q.in('status', STAT_GROUPS.delayed_or_stalled);
  else if (STATUSES.includes(req.query.status)) q = q.eq('status', req.query.status);
  if (req.query.search) {
    const s = String(req.query.search).replace(/[%,()]/g, ' ').trim().slice(0, 80);
    if (s) q = q.or(`name.ilike.%${s}%,project_code.ilike.%${s}%,municipality_name.ilike.%${s}%,barangay_name.ilike.%${s}%,contractor_name.ilike.%${s}%`);
  }
  const ascending = ['name', 'project_code', 'target_completion_date'].includes(sort);
  const { data, count, error } = await q.order(sort, { ascending }).range(from, to);
  unwrap({ data, error });
  res.json({ data, page, pageSize, total: count ?? 0 });
}

/** Map pins: every project that has coordinates. */
export async function publicMap(_req, res) {
  const rows = unwrap(await db().from('v_public_projects').select(PIN_COLUMNS).not('latitude', 'is', null).not('longitude', 'is', null).order('project_code'));
  res.json({ data: rows });
}

/** Map drawer: the project's public details and its public 360° images (newest first). */
export async function publicProject(req, res) {
  const c = db();
  const project = unwrap(await c.from('v_public_projects').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  const images = unwrap(
    await c
      .from('site_images')
      .select('id, storage_path, caption, inspection_date, is_final')
      .eq('project_id', project.id)
      .order('inspection_date', { ascending: false })
      .limit(12),
  );
  const urls = await signedUrls('panoramas', images.map((i) => i.storage_path));
  res.json({
    data: {
      project,
      images: images.map(({ storage_path: path, ...i }) => ({ ...i, url: urls[path] ?? null })).filter((i) => i.url),
    },
  });
}
