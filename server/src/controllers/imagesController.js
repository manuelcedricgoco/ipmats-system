/**
 * WEEK 3 — 360° image API (Julina Mae Escabosa, Back-end)
 *   GET    /projects/:id/images              list with short-lived view links
 *   POST   /projects/:id/images              upload: GPS + timestamp validation, storage, re-evaluation
 *   PATCH  /projects/:id/images/:imageId     caption / final as-built
 *   DELETE /projects/:id/images/:imageId     admin: remove a wrong upload
 *
 * Gap fixes: large panoramas are compressed before storage (GPS, time and the reuse check use the
 * ORIGINAL file first), every photo is shown on the public portal as soon as it is uploaded (no approval
 * step; an Admin can still delete a wrong upload), and every change is logged.
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { adminClient } from '../config/supabase.js';
import { assertImageFormat } from '../services/imageFormat.js';
import { sha256, validateImage } from '../services/imageValidation.js';
import { dHash, findNearDuplicates } from '../services/perceptualHash.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { loadHashedImages, reevaluate } from '../services/projectEvaluation.js';
import { getFlagRules } from '../services/settings.js';
import { signedUrls } from '../services/storage.js';
import { badRequest, notFound, unwrap } from '../utils/httpError.js';

export const BUCKET = 'panoramas';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Panoramas above this size (or wider than MAX_WIDTH) are re-encoded before storage. */
export const COMPRESS_ABOVE_BYTES = 6 * 1024 * 1024;
export const MAX_WIDTH = 8192;

/**
 * Smaller copy for storage: at most 8192 px wide (keeps the 2:1 panorama shape), JPEG quality 82,
 * photo metadata (GPS, capture time) kept. Returns the original when compression does not help.
 */
export async function compressPanorama(buffer, mimetype, width) {
  if (buffer.length <= COMPRESS_ABOVE_BYTES && (!width || width <= MAX_WIDTH)) return { buffer, mimetype, compressed: false };
  try {
    const out = await sharp(buffer, { limitInputPixels: 268402689 })
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .withMetadata()
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    if (out.length >= buffer.length) return { buffer, mimetype, compressed: false };
    return { buffer: out, mimetype: 'image/jpeg', compressed: true };
  } catch (err) {
    console.error('[images] compression skipped:', err.message);
    return { buffer, mimetype, compressed: false };
  }
}

async function getProject(id) {
  const p = unwrap(await adminClient.from('projects').select('id, latitude, longitude, notice_to_proceed').eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  return p;
}

export async function listImages(req, res) {
  const rows = unwrap(
    await req.db
      .from('site_images')
      .select('*, phase:project_phases(name), uploader:profiles!site_images_uploaded_by_fkey(full_name)')
      .eq('project_id', req.params.id)
      .order('inspection_date', { ascending: false })
      .order('created_at', { ascending: false }),
  );
  const urls = await signedUrls(BUCKET, rows.map((r) => r.storage_path));
  res.json({
    data: rows.map(({ phase, uploader, ...r }) => ({ ...r, phase_name: phase?.name ?? null, uploaded_by_name: uploader?.full_name ?? null, url: urls[r.storage_path] ?? null })),
  });
}

export async function uploadImage(req, res) {
  if (!req.file) throw badRequest('Attach a 360° panorama in the "file" field.');
  const format = assertImageFormat(req.file.buffer);
  const { id } = req.params;
  const project = await getProject(id);
  const body = req.body;
  if (body.inspection_date > new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)) {
    throw badRequest('The inspection date cannot be in the future.');
  }
  if (body.phase_id) {
    const ph = unwrap(await adminClient.from('project_phases').select('id').eq('id', body.phase_id).eq('project_id', id).maybeSingle());
    if (!ph) throw badRequest('The selected phase does not belong to this project.');
  }

  const rules = await getFlagRules(adminClient);
  const buffer = req.file.buffer;
  const existingWithHash = unwrap(await adminClient.from('site_images').select('project_id').eq('file_hash', sha256(buffer)));
  let phash;
  try {
    phash = await dHash(buffer);
  } catch {
    throw badRequest('The photo file is damaged or incomplete. Upload the original file again.');
  }
  const candidates = await loadHashedImages(adminClient);
  const probe = { id: 'new', project_id: project.id, phash, inspection_date: body.inspection_date, created_at: new Date().toISOString() };
  const nearDuplicateIn = candidates.filter((c) => findNearDuplicates([probe], [c]).size).map((c) => c.project_id);
  const v = await validateImage({
    buffer,
    project,
    manualLatitude: body.latitude ?? null,
    manualLongitude: body.longitude ?? null,
    capturedAt: body.captured_at ?? null,
    inspectionDate: body.inspection_date,
    existingWithHash,
    nearDuplicateIn,
    rules,
  });
  if (v.problems.length) throw badRequest(v.problems[0], v.problems.map((message) => ({ field: 'file', message })));

  // Validation (EXIF GPS / time, reuse hash) has used the original file; store a smaller copy when it is large.
  const stored = await compressPanorama(buffer, `image/${format}`, v.width);
  const storagePath = `${id}/${body.inspection_date}_${randomUUID()}.${EXT[stored.mimetype]}`;
  const up = await adminClient.storage.from(BUCKET).upload(storagePath, stored.buffer, { contentType: stored.mimetype, upsert: false });
  if (up.error) throw Object.assign(new Error('Storage upload failed'), { cause: up.error });

  const insert = await adminClient
    .from('site_images')
    .insert({
      project_id: id,
      phase_id: body.phase_id || null,
      storage_path: storagePath,
      file_hash: v.fileHash,
      phash,
      mime_type: stored.mimetype,
      size_bytes: stored.buffer.length,
      width: v.width,
      height: v.height,
      caption: body.caption || null,
      latitude: v.latitude,
      longitude: v.longitude,
      gps_source: v.gpsSource,
      captured_at: v.capturedAt,
      inspection_date: body.inspection_date,
      is_final: body.is_final,
      validation: { ...v.validation, original_size_bytes: req.file.size, compressed: stored.compressed },
      uploaded_by: req.user.id,
      // shown on the public portal at once: DPWH personnel's photos need no approval
      is_public: true,
    })
    .select('*')
    .single();
  if (insert.error) {
    await adminClient.storage.from(BUCKET).remove([storagePath]); // never leave an orphan file
    unwrap(insert);
  }
  const evaluation = await reevaluate(id, 'image_upload', req.user.id);
  await logActivity(req, {
    action: 'image.upload',
    entityType: 'image',
    entityId: insert.data.id,
    projectId: id,
    summary: `Uploaded a 360° photo (inspection ${body.inspection_date}${body.is_final ? ', final as-built' : ''}) to ${await projectCode(id)}${v.validation.warnings?.length ? ` — ${v.validation.warnings.length} warning(s)` : ''}`,
    details: { warnings: v.validation.warnings || [], distance_m: v.validation.distance_m ?? null, compressed: stored.compressed, original_size_bytes: req.file.size, stored_size_bytes: stored.buffer.length, flag: evaluation?.flag ?? null },
  });
  res.status(201).json({ data: { image: insert.data, validation: { ...v.validation, compressed: stored.compressed }, evaluation } });
}

export async function updateImage(req, res) {
  const img = unwrap(await adminClient.from('site_images').select('id, project_id').eq('id', req.params.imageId).eq('project_id', req.params.id).maybeSingle());
  if (!img) throw notFound('Image not found');
  const row = unwrap(await adminClient.from('site_images').update(req.body).eq('id', img.id).select('*').single());
  const evaluation = req.body.is_final !== undefined ? await reevaluate(img.project_id, 'image_update', req.user.id) : null;
  await logActivity(req, {
    action: 'image.update',
    entityType: 'image',
    entityId: img.id,
    projectId: img.project_id,
    summary: `${req.body.is_final === true ? 'Marked a 360° photo as final as-built' : req.body.is_final === false ? 'Unmarked a final 360° photo' : 'Edited a 360° photo caption'} on ${await projectCode(img.project_id)}`,
  });
  res.json({ data: { image: row, evaluation } });
}

export async function deleteImage(req, res) {
  const img = unwrap(await adminClient.from('site_images').select('id, project_id, storage_path').eq('id', req.params.imageId).eq('project_id', req.params.id).maybeSingle());
  if (!img) throw notFound('Image not found');
  unwrap(await adminClient.from('site_images').delete().eq('id', img.id));
  await adminClient.storage.from(BUCKET).remove([img.storage_path]);
  await reevaluate(img.project_id, 'image_deleted', req.user.id);
  await logActivity(req, { action: 'image.delete', entityType: 'image', entityId: img.id, projectId: img.project_id, summary: `Deleted a 360° photo from ${await projectCode(img.project_id)}` });
  res.status(204).end();
}
