/**
 * Magic-byte check run before any image decoder (sharp, exifr) sees an upload.
 * Only JPEG, PNG and WebP are accepted; the client-supplied MIME type is never trusted.
 */
import { badRequest } from '../utils/httpError.js';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
}

/** @returns {'jpeg'|'png'|'webp'|null} */
export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, PNG)) return 'png';
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

/** Returns the detected format, or throws a 400 when it is not one of `allowed`. */
export function assertImageFormat(buffer, allowed = ['jpeg', 'png', 'webp']) {
  const format = detectImageFormat(buffer);
  if (!format || !allowed.includes(format)) throw badRequest('The file is not a JPEG, PNG or WebP image.');
  return format;
}

/**
 * A document that may be a PDF or an image (PACC case documents, finance receipts), from its first
 * bytes: { ext, mime } or null. The client's MIME type and file name are never trusted.
 */
export function detectDocumentFormat(buffer) {
  if (Buffer.isBuffer(buffer) && buffer.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  const image = detectImageFormat(buffer);
  if (image === 'jpeg') return { ext: 'jpg', mime: 'image/jpeg' };
  if (image) return { ext: image, mime: `image/${image}` };
  return null;
}
