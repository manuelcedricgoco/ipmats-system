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
