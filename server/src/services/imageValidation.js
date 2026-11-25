/**
 * WEEK 3 — Server-side validation of an uploaded 360° image (Julina Mae Escabosa):
 *   - SHA-256 hash (reuse detection across all projects)
 *   - dimensions and 2:1 equirectangular aspect ratio
 *   - EXIF GPS + capture time, XMP GPano projection type
 *   - distance from the registered project location
 *   - capture time: not in the future, not before the Notice to Proceed, close to the inspection date
 */
import { createHash } from 'node:crypto';
import exifr from 'exifr';
import sharp from 'sharp';
import { haversineMeters, isWithinOccidentalMindoro } from '../utils/geo.js';

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function readImageMetadata(buffer) {
  let width = null;
  let height = null;
  try {
    ({ width, height } = await sharp(buffer).metadata());
  } catch {
    /* unreadable dimensions are reported as a warning */
  }
  let exif = null;
  try {
    exif = await exifr.parse(buffer, { gps: true, xmp: true, tiff: true, exif: true });
  } catch {
    exif = null;
  }
  const lat = Number.isFinite(exif?.latitude) ? exif.latitude : null;
  const lng = Number.isFinite(exif?.longitude) ? exif.longitude : null;
  const captured = exif?.DateTimeOriginal || exif?.CreateDate || null;
  const projection = exif?.ProjectionType || exif?.GPano?.ProjectionType || null;
  return {
    width,
    height,
    exifLatitude: lat,
    exifLongitude: lng,
    exifCapturedAt: captured instanceof Date && !Number.isNaN(captured.getTime()) ? captured.toISOString() : null,
    projectionType: projection,
  };
}

/**
 * @param {object} p
 * @param {Buffer} p.buffer
 * @param {object} p.project               { latitude, longitude }
 * @param {number|null} p.manualLatitude    coordinates entered by the uploader
 * @param {number|null} p.manualLongitude
 * @param {string|null} p.capturedAt
 * @param {object[]} p.existingWithHash     site_images rows that already have this hash
 * @param {string[]} p.nearDuplicateIn      ids of projects holding a near-identical photo
 * @param {object} p.rules                  flag rules (gps_tolerance_m, gps_red_m)
 */
export async function validateImage({ buffer, project, manualLatitude, manualLongitude, capturedAt, inspectionDate, existingWithHash = [], nearDuplicateIn = [], rules }) {
  const meta = await readImageMetadata(buffer);
  const fileHash = sha256(buffer);
  const warnings = [];

  let latitude = meta.exifLatitude;
  let longitude = meta.exifLongitude;
  let gpsSource = 'exif';
  if (latitude == null || longitude == null) {
    if (manualLatitude != null && manualLongitude != null) {
      latitude = manualLatitude;
      longitude = manualLongitude;
      gpsSource = 'manual';
      warnings.push('No GPS data in the image; coordinates entered by the uploader were used.');
    } else {
      latitude = null;
      longitude = null;
      gpsSource = 'none';
      warnings.push('No GPS coordinates available for this image.');
    }
  }

  let distanceM = null;
  if (latitude != null && longitude != null) {
    distanceM = Math.round(haversineMeters(project.latitude, project.longitude, latitude, longitude));
    if (!isWithinOccidentalMindoro(latitude, longitude)) warnings.push('Image coordinates are outside Occidental Mindoro.');
    if (distanceM > rules.gps_red_m) warnings.push(`Image was taken ${distanceM} m from the project site.`);
    else if (distanceM > rules.gps_tolerance_m) warnings.push(`Image was taken ${distanceM} m from the project site (tolerance ${rules.gps_tolerance_m} m).`);
  }

  const ratio = meta.width && meta.height ? meta.width / meta.height : null;
  const aspectRatioOk = ratio != null && Math.abs(ratio - 2) < 0.02;
  if (!aspectRatioOk) warnings.push('Image is not a 2:1 equirectangular panorama; the 360° viewer may look distorted.');

  const reusedIn = [...new Set(existingWithHash.map((r) => r.project_id))];
  if (reusedIn.length) warnings.push('An identical file has already been uploaded.');

  const nearIn = [...new Set(nearDuplicateIn)];
  if (nearIn.length) warnings.push('A photo that looks almost identical already exists in another project or an earlier inspection.');

  const captured = meta.exifCapturedAt || capturedAt || null;
  const timestampSource = meta.exifCapturedAt ? 'exif' : capturedAt ? 'manual' : 'none';
  const problems = []; // reasons the upload is REFUSED
  let dateGapDays = null;
  if (!captured) {
    warnings.push('No capture date in the photo; the inspection date was used.');
  } else {
    const t = new Date(captured);
    if (t > new Date(Date.now() + 24 * 3600 * 1000)) problems.push('The photo\'s capture time is in the future.');
    if (project.notice_to_proceed && t < new Date(`${project.notice_to_proceed}T00:00:00+08:00`)) {
      warnings.push(`The photo was taken before the Notice to Proceed (${project.notice_to_proceed}).`);
    }
    if (inspectionDate) {
      dateGapDays = Math.round(Math.abs(t - new Date(`${inspectionDate}T12:00:00+08:00`)) / 86400000);
      const tol = rules.image_date_tolerance_days ?? 7;
      if (dateGapDays > tol) warnings.push(`The photo was taken ${dateGapDays} days away from the inspection date (tolerance ${tol} days).`);
    }
  }

  return {
    fileHash,
    width: meta.width,
    height: meta.height,
    latitude,
    longitude,
    gpsSource,
    capturedAt: captured,
    problems,
    validation: {
      timestamp_source: timestampSource,
      date_gap_days: dateGapDays,
      distance_m: distanceM,
      reused_elsewhere: reusedIn.length > 0,
      reused_in_projects: reusedIn,
      near_duplicate_in_projects: nearIn,
      aspect_ratio_ok: aspectRatioOk,
      projection_type: meta.projectionType,
      exif_gps: meta.exifLatitude != null,
      warnings,
    },
  };
}
