import multer from 'multer';
import { RECEIPT_FILE_MESSAGE, RECEIPT_MAX_BYTES, receiptTooLarge } from '../services/liquidation.js';
import { badRequest } from '../utils/httpError.js';

const MB = 1024 * 1024;

/** Profile photo upload: one image, max 2 MB, kept in memory for validation. */
export const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * MB, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(badRequest(`Unsupported file type: ${file.mimetype}`));
    return cb(null, true);
  },
}).single('avatar');

// WEEK 3
function make(maxBytes, mimeTypes, field, message) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!mimeTypes.includes(file.mimetype)) return cb(badRequest(message ?? `Unsupported file type: ${file.mimetype}`));
      return cb(null, true);
    },
  }).single(field);
}
/** 360° panorama: JPEG / PNG / WebP up to 30 MB (field "file"). */
export const uploadPanorama = make(30 * MB, ['image/jpeg', 'image/png', 'image/webp'], 'file');
/** Audit evidence: PDF or image up to 20 MB (field "evidence"). */
export const uploadEvidence = make(20 * MB, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], 'evidence');

// Gap fix: supporting project documents — PDF, images, Word, Excel up to 25 MB (field "file").
const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const uploadDocument = make(25 * MB, DOCUMENT_MIME_TYPES, 'file');

/** PACC case document: PDF or image up to 25 MB (field "file"), the same limits as the pacc-case-documents bucket. */
export const uploadCaseDocument = make(25 * MB, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], 'file', 'Attach a PDF, JPEG, PNG or WebP file.');

/** Finance receipt (031): one PDF / JPEG / PNG / WebP up to 15 MB (field "file"), the limits of the finance-receipts bucket. */
const receiptFile = make(RECEIPT_MAX_BYTES, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], 'file', RECEIPT_FILE_MESSAGE);
export function uploadReceipt(req, res, next) {
  receiptFile(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(receiptTooLarge());
    return next(err);
  });
}

/** Citizen report proof: 1-3 JPEG / PNG / WebP photos up to 10 MB each (field "proof"). */
export const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * MB, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(badRequest('The file is not a JPEG, PNG or WebP image.'));
    return cb(null, true);
  },
}).array('proof', 3);

// ---------------------------------------------------------------------------
// Progress rules (030): a progress report is multipart/form-data
// ---------------------------------------------------------------------------
export const PROGRESS_PHOTOS_MESSAGE = 'Attach 1 to 5 reference photos.';
export const MAX_PROGRESS_PHOTOS = 5;

const progressPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * MB, files: MAX_PROGRESS_PHOTOS },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(badRequest('The file is not a JPEG, PNG or WebP image.'));
    return cb(null, true);
  },
}).array('photos', MAX_PROGRESS_PHOTOS);

/**
 * Progress report reference photos: 1–5 JPEG / PNG / WebP up to 10 MB each (field "photos").
 * More than 5 files answers 400 "Attach 1 to 5 reference photos."; too few is checked by the
 * controller (after the fields are validated).
 */
export function uploadProgressPhotos(req, res, next) {
  progressPhotos(req, res, (err) => {
    if (err instanceof multer.MulterError && ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(err.code)) {
      return next(badRequest(PROGRESS_PHOTOS_MESSAGE, [{ field: 'photos', message: PROGRESS_PHOTOS_MESSAGE }]));
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(badRequest('Each reference photo can be at most 10 MB.', [{ field: 'photos', message: 'Each reference photo can be at most 10 MB.' }]));
    }
    return next(err);
  });
}

/**
 * Multipart forms that carry nested data send it as one JSON string in the field "payload":
 * req.body becomes the parsed object (then validated by zod). 400 when it is missing or not JSON.
 */
export function parseJsonPayload(req, _res, next) {
  const raw = req.body?.payload;
  if (typeof raw !== 'string' || !raw.trim()) return next(badRequest('Send the report fields as JSON in the "payload" field.'));
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    req.body = parsed;
    return next();
  } catch {
    return next(badRequest('The "payload" field is not valid JSON.'));
  }
}
