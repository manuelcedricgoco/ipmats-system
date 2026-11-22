/**
 * WEEK 3 — Map API (Manuel Cedric Goco, Leader / Back-end)
 *   GET /map/projects        every project's location, flag colour and latest 360° image link
 *   GET /map/projects/:id    side panel: project details + its latest 360° images
 * Filters (query): municipality_id, barangay_id, agency_id, contractor_id, status, type, flag
 */
import { signedUrls } from '../services/storage.js';
import { notFound, unwrap } from '../utils/httpError.js';
import { applyProjectFilters } from './projectsController.js';
import { BUCKET } from './imagesController.js';

const MARKER_COLUMNS =
  'id, project_code, name, project_type, latitude, longitude, current_flag, flag_review_status, status, overall_progress, planned_progress, ' +
  'municipality_id, municipality_name, barangay_name, agency_name, contractor_id, contractor_name, contract_amount, target_completion_date, image_count, latest_inspection_date';

/** Latest image (path) of each project, newest first. `publicOnly`: only photos approved for the public. */
export async function latestImages(db, projectIds, { publicOnly = false } = {}) {
  if (!projectIds.length) return {};
  let q = db.from('site_images').select('project_id, storage_path, inspection_date, created_at').in('project_id', projectIds);
  if (publicOnly) q = q.eq('is_public', true);
  const rows = unwrap(await q.order('inspection_date', { ascending: false }).order('created_at', { ascending: false }));
  const latest = {};
  for (const r of rows) if (!latest[r.project_id]) latest[r.project_id] = r;
  return latest;
}

export async function mapProjects(req, res) {
  let q = req.db.from('v_project_summary').select(MARKER_COLUMNS);
  q = applyProjectFilters(q, req.query);
  if (req.query.flag) q = q.eq('current_flag', req.query.flag);
  const rows = unwrap(await q.order('project_code'));
  const latest = await latestImages(req.db, rows.map((r) => r.id));
  const urls = await signedUrls(BUCKET, Object.values(latest).map((l) => l.storage_path));
  res.json({
    data: rows.map((r) => ({ ...r, latest_image_url: latest[r.id] ? urls[latest[r.id].storage_path] ?? null : null, latest_image_date: latest[r.id]?.inspection_date ?? null })),
  });
}

export async function mapProjectPanel(req, res) {
  const project = unwrap(await req.db.from('v_project_summary').select('*').eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  const images = unwrap(
    await req.db.from('site_images').select('id, storage_path, caption, inspection_date, is_final, latitude, longitude, validation').eq('project_id', project.id).order('inspection_date', { ascending: false }).limit(8),
  );
  const urls = await signedUrls(BUCKET, images.map((i) => i.storage_path));
  res.json({ data: { ...project, images: images.map((i) => ({ ...i, url: urls[i.storage_path] ?? null })) } });
}
