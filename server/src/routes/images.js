/**
 * WEEK 3 — 360° images (Objective 2). View: staff and contractor accounts (own company's projects) ·
 * Upload: DPWH Personnel, and contractor accounts on their own active company's projects (029; not
 *   marked final as-built: DPWH Personnel confirm completion) ·
 * Caption / final: DPWH Personnel only · Delete: Admin. Every photo is public on upload.
 */
import { Router } from 'express';
import * as c from '../controllers/imagesController.js';
import { requireAuth } from '../middleware/auth.js';
import { PROJECT_REPORTERS, PROJECT_VIEWERS, refuseContractorCompletion, requireOwnProject, requireRole, requireWriteAccess, ROLES } from '../middleware/role.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { uploadPanorama } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'imageId');
const editors = requireRole(ROLES.PERSONNEL);
const reporters = requireRole(PROJECT_REPORTERS);

r.get('/projects/:id/images', requireAuth, requireRole(PROJECT_VIEWERS), h(c.listImages));
r.post('/projects/:id/images', requireAuth, reporters, uploadLimiter, requireWriteAccess, requireOwnProject, uploadPanorama, validate(s.imageUpload), refuseContractorCompletion, h(c.uploadImage));
r.patch('/projects/:id/images/:imageId', requireAuth, editors, requireWriteAccess, validate(s.imageUpdate), h(c.updateImage));
r.delete('/projects/:id/images/:imageId', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteImage));
export default r;
