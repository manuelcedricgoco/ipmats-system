/** WEEK 3 — 360° images (Objective 2). View: staff · Upload/edit: DPWH Personnel, Admin · Show to public: Auditor, Admin · Delete: Admin */
import { Router } from 'express';
import * as c from '../controllers/imagesController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { uploadPanorama } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'imageId');
const editors = requireRole(ROLES.PERSONNEL, ROLES.ADMIN);

r.get('/projects/:id/images', requireAuth, requireRole(STAFF), h(c.listImages));
r.post('/projects/:id/images', requireAuth, editors, uploadLimiter, requireWriteAccess, uploadPanorama, validate(s.imageUpload), h(c.uploadImage));
r.patch('/projects/:id/images/:imageId', requireAuth, editors, requireWriteAccess, validate(s.imageUpdate), h(c.updateImage));
r.patch('/projects/:id/images/:imageId/public', requireAuth, requireRole(ROLES.AUDITOR, ROLES.ADMIN), requireWriteAccess, validate(s.publicToggle), h(c.setImagePublic));
r.delete('/projects/:id/images/:imageId', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteImage));
export default r;
