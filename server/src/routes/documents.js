/** Gap fix — supporting project documents. View: staff · Upload: DPWH Personnel, Admin · Delete: Admin or uploader */
import { Router } from 'express';
import * as c from '../controllers/documentsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { uploadDocument } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'documentId');
const editors = requireRole(ROLES.PERSONNEL, ROLES.ADMIN);

r.get('/projects/:id/documents', requireAuth, requireRole(STAFF), h(c.listDocuments));
r.post('/projects/:id/documents', requireAuth, editors, uploadLimiter, requireWriteAccess, uploadDocument, validate(s.documentUpload), h(c.uploadDocument));
r.delete('/projects/:id/documents/:documentId', requireAuth, editors, requireWriteAccess, h(c.deleteDocument));
export default r;
