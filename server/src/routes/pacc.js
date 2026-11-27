/** PACC portal API. Every route needs an approved PACC account; writes also need the service role. */
import { Router } from 'express';
import * as c from '../controllers/paccController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'reportId');
r.use(requireAuth, requireRole(ROLES.PACC));

r.get('/inbox', h(c.inbox));
r.get('/projects/:id', h(c.projectView));
r.post('/reports/:reportId/close', requireWriteAccess, validate(s.reportClose), h(c.closeReport));
r.post('/projects/:id/reports/close-all', requireWriteAccess, validate(s.reportClose), h(c.closeAllReports));
export default r;
