/**
 * PUBLIC citizen reports (routes/public.js). Anonymous by design: this file never looks at who is
 * calling (no account, address or headers), never writes the activity log and never logs a request.
 *   POST /api/public/projects/:id/reports  report a problem with 1-3 photos -> a tracking code
 *   GET  /api/public/reports/:code         status label and date for that code
 * The tracking code is stored only as a keyed hash; the code itself is shown once and never logged.
 */
import crypto from 'node:crypto';
import { adminClient, anonClient } from '../config/supabase.js';
import { env } from '../config/env.js';
import { assertImageFormat } from '../services/imageFormat.js';
import { generateTrackingCode, hashTrackingCode, manilaDate, normalizeTrackingCode, reporterStatusLabel, stripImageMetadata } from '../services/citizenReports.js';
import * as s from '../routes/schemas.js';
import { HttpError, badRequest, notFound, unwrap } from '../utils/httpError.js';

const BUCKET = 'citizen-reports';

/** Runs before the schema check and before any database call: 1-3 real images. */
export function requireProof(req, _res, next) {
  try {
    if (!req.files?.length) throw badRequest('Attach at least one photo as proof.');
    for (const file of req.files) assertImageFormat(file.buffer);
    next();
  } catch (err) {
    next(err);
  }
}

/** 400 with a plain message for a malformed code; stores the normalized code on req.params. */
export function validateTrackingCode(req, _res, next) {
  const result = s.trackingCodeParam.safeParse({ code: req.params.code });
  if (!result.success) return next(badRequest('Enter the 10-character tracking code.'));
  req.params.code = result.data.code;
  return next();
}

export async function submitReport(req, res) {
  const { category, description } = req.body;
  if (!anonClient) throw new HttpError(503, 'The server is not connected to the database.');
  const project = unwrap(await anonClient.from('v_public_projects').select('id, project_code, name').eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');

  const cleaned = await Promise.all(req.files.map((f) => stripImageMetadata(f.buffer)));
  const code = generateTrackingCode();
  const reportId = crypto.randomUUID();
  const uploaded = [];
  let rowInserted = false;
  try {
    unwrap(
      await adminClient.from('citizen_reports').insert({
        id: reportId,
        project_id: project.id,
        project_code: project.project_code,
        project_name: project.name,
        category,
        description,
        tracking_hash: hashTrackingCode(normalizeTrackingCode(code), env.supabaseServiceKey),
        submitted_on: manilaDate(),
      }),
    );
    rowInserted = true;
    for (const buffer of cleaned) {
      const path = `${reportId}/${crypto.randomUUID()}.jpg`;
      const { error } = await adminClient.storage.from(BUCKET).upload(path, buffer, { contentType: 'image/jpeg' });
      if (error) throw new HttpError(500, 'Database error');
      uploaded.push({ path, size: buffer.length });
    }
    unwrap(await adminClient.from('citizen_report_files').insert(uploaded.map((u) => ({ report_id: reportId, storage_path: u.path, size_bytes: u.size }))));
  } catch (err) {
    // Best-effort cleanup; the original error is what the caller gets.
    try {
      if (uploaded.length) await adminClient.storage.from(BUCKET).remove(uploaded.map((u) => u.path));
      if (rowInserted) {
        await adminClient.from('citizen_report_files').delete().eq('report_id', reportId);
        await adminClient.from('citizen_reports').delete().eq('id', reportId);
      }
    } catch {
      /* ignore */
    }
    throw err;
  }
  res.status(201).json({ data: { tracking_code: code } });
}

export async function reportStatus(req, res) {
  const hash = hashTrackingCode(req.params.code, env.supabaseServiceKey);
  const { data, error } = await adminClient.from('citizen_reports').select('status, submitted_on').eq('tracking_hash', hash).maybeSingle();
  // A plain 503 (not a 500) so the error handler never logs this request's URL, which holds the code.
  if (error) throw new HttpError(503, 'We could not check this report right now. Please try again later.');
  if (!data) throw notFound('Report not found.');
  res.set('Cache-Control', 'no-store');
  res.json({ data: { status: reporterStatusLabel(data.status), submitted_on: data.submitted_on } });
}
