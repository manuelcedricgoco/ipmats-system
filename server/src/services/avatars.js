/**
 * Profile photos: validated, centre-cropped to a 512×512 square WebP, stored in
 * the private 'avatars' bucket. Access is only ever through short-lived signed URLs.
 */
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { adminClient } from '../config/supabase.js';
import { assertImageFormat } from './imageFormat.js';
import { badRequest, unwrap } from '../utils/httpError.js';

const BUCKET = 'avatars';
const SIZE = 512;
const SIGNED_URL_TTL = 60 * 60;

/** Check the bytes are a real image (not just a renamed file) and normalise it. */
export async function processAvatar(buffer) {
  assertImageFormat(buffer);
  let meta;
  try {
    meta = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw badRequest('The file is not a readable image.');
  }
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 128) {
    throw badRequest('Use a photo that is at least 128 × 128 pixels.');
  }
  return sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
    .rotate() // respect phone camera orientation
    .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' })
    .webp({ quality: 85 })
    .toBuffer();
}

export async function uploadAvatar(userId, buffer) {
  const data = await processAvatar(buffer);
  const path = `${userId}/${randomUUID()}.webp`;
  const up = await adminClient.storage.from(BUCKET).upload(path, data, { contentType: 'image/webp', upsert: false });
  if (up.error) throw Object.assign(new Error('Photo upload failed'), { cause: up.error });
  return path;
}

export async function removeAvatarFile(path) {
  if (path) await adminClient.storage.from(BUCKET).remove([path]);
}

export async function avatarUrl(path) {
  // Without the service key (read-only mode) there is no photo link, but signing in must still work.
  if (!path || !adminClient) return null;
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return error ? null : data.signedUrl;
}

/** Store the new photo path on the profile and delete the previous file. */
export async function setAvatar(userId, previousPath, newPath) {
  unwrap(await adminClient.from('profiles').update({ avatar_path: newPath }).eq('id', userId));
  if (previousPath && previousPath !== newPath) await removeAvatarFile(previousPath);
}
