import multer from 'multer';
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
function make(maxBytes, mimeTypes, field) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!mimeTypes.includes(file.mimetype)) return cb(badRequest(`Unsupported file type: ${file.mimetype}`));
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

/** Citizen report proof: 1-3 JPEG / PNG / WebP photos up to 10 MB each (field "proof"). */
export const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * MB, files: 3 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(badRequest('The file is not a JPEG, PNG or WebP image.'));
    return cb(null, true);
  },
}).array('proof', 3);
