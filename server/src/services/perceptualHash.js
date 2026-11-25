/**
 * Perceptual (difference) hash of a photo, used to spot a 360° image that was
 * re-saved, resized or re-compressed and then uploaded again. An exact SHA-256
 * match is already caught by file_hash; this catches near copies.
 */
import sharp from 'sharp';

/** Two hashes at most this many bits apart count as the same picture. */
export const PHASH_MAX_DISTANCE = 6;

/** 64-bit dHash as 16 lowercase hex characters. */
export async function dHash(buffer) {
  const px = await sharp(buffer, { failOn: 'none', limitInputPixels: 268402689 }).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hex = '';
  for (let r = 0; r < 8; r += 1) {
    let byte = 0;
    for (let c = 0; c < 8; c += 1) byte = (byte << 1) | (px[r * 9 + c] < px[r * 9 + c + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hammingDistance(a, b) {
  let bits = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/**
 * Ids of `images` that have a near-identical EARLIER candidate: a different image
 * from another project, or from the same project on a different inspection date.
 * Earlier means an earlier inspection_date, or the same date and an earlier
 * created_at (same rule as the exact-hash reuse check), so only the later copy is
 * flagged. Rows without a phash are ignored.
 */
function isEarlier(c, img) {
  if (c.inspection_date !== img.inspection_date) return c.inspection_date < img.inspection_date;
  return Boolean(c.created_at && img.created_at && new Date(c.created_at) < new Date(img.created_at));
}

export function findNearDuplicates(images, candidates, maxDistance = PHASH_MAX_DISTANCE) {
  const found = new Set();
  for (const img of images) {
    if (!img.phash) continue;
    for (const c of candidates) {
      if (!c.phash || c.id === img.id) continue;
      if (c.project_id === img.project_id && c.inspection_date === img.inspection_date) continue;
      if (!isEarlier(c, img)) continue;
      if (hammingDistance(img.phash, c.phash) <= maxDistance) {
        found.add(img.id);
        break;
      }
    }
  }
  return found;
}
