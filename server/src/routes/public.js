/** PUBLIC PORTAL routes — open to everyone, no account needed. Reads run as the anonymous role (RLS). */
import { Router } from 'express';
import * as c from '../controllers/publicController.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as cr from '../controllers/citizenReportsController.js';
import * as s from './schemas.js';
import { validate } from '../middleware/validate.js';
import { requireWriteAccess } from '../middleware/role.js';
import { uploadProof } from '../middleware/upload.js';
import { reportSubmitLimiter, reportProjectLimiter, trackingLookupLimiter } from '../middleware/anonymousLimits.js';
import { uuidParams } from './params.js';

const r = Router();
uuidParams(r, 'id');
r.get('/stats', h(c.publicStats));
r.get('/projects', h(c.publicProjects));
r.get('/projects/:id', h(c.publicProject));
r.get('/map', h(c.publicMap));
// Anonymous citizen reports: no account, nothing about the sender is stored (see citizenReportsController.js).
r.post('/projects/:id/reports', reportSubmitLimiter, reportProjectLimiter, uploadProof, cr.requireProof, validate(s.citizenReport), requireWriteAccess, h(cr.submitReport));
r.get('/reports/:code', trackingLookupLimiter, cr.validateTrackingCode, requireWriteAccess, h(cr.reportStatus));
export default r;
