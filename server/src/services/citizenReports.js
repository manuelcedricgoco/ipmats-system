import crypto from 'node:crypto';
import sharp from 'sharp';

export const REPORT_CATEGORIES = ['photo_mismatch', 'substandard_materials', 'overpricing_or_ghost', 'work_not_done', 'other'];
export const CITIZEN_REPORT_THRESHOLD = 10;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_WIDTH = 2560;

/** A random 10-symbol tracking code shown as XXXXX-XXXXX. */
export function generateTrackingCode() {
  let code = '';
  for (let i = 0; i < 10; i += 1) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Upper-case, dash removed; null unless exactly 10 valid symbols. */
export function normalizeTrackingCode(input) {
  const code = String(input ?? '').toUpperCase().replace(/-/g, '');
  return new RegExp(`^[${ALPHABET}]{10}$`).test(code) ? code : null;
}

/** Keyed HMAC-SHA256 of the normalized code, as lower-case hex. */
export function hashTrackingCode(normalized, serviceKey) {
  const key = Buffer.from(crypto.hkdfSync('sha256', serviceKey, '', 'ipmats-citizen-report-code', 32));
  return crypto.createHmac('sha256', key).update(normalized).digest('hex');
}

/** Re-encodes as JPEG with no EXIF/GPS/camera data (no withMetadata), max 2560 px wide. */
export async function stripImageMetadata(buffer) {
  return sharp(buffer, { failOn: 'none', pages: 1, limitInputPixels: 268402689 })
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** YYYY-MM-DD in Asia/Manila. */
export function manilaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}

const STATUS_LABELS = { received: 'Received', under_review: 'Under review', closed: 'Closed' };
export function reporterStatusLabel(status) {
  return STATUS_LABELS[status];
}

export function referralReasons({ publicFlag, openReports, hasOpenCase }) {
  const reasons = [];
  if (publicFlag === 'red') reasons.push('auditor_red');
  if (openReports >= CITIZEN_REPORT_THRESHOLD) reasons.push('citizen_reports');
  if (hasOpenCase) reasons.push('open_case');
  return reasons;
}

const TRANSITIONS = {
  under_investigation: ['case_filed', 'dismissed'],
  case_filed: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};
export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isClosedCaseStatus(status) {
  return status === 'resolved' || status === 'dismissed';
}
