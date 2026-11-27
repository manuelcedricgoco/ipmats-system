/** Project deletion requests (027). Ask / cancel: DPWH Personnel · View a project's request: staff · List, approve, decline: Admin */
import { Router } from 'express';
import * as c from '../controllers/deletionRequestsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'requestId');
const personnel = requireRole(ROLES.PERSONNEL);
const admin = requireRole(ROLES.ADMIN);

r.post('/projects/:id/deletion-requests', requireAuth, personnel, requireWriteAccess, validate(s.deletionRequestCreate), h(c.createDeletionRequest));
r.get('/projects/:id/deletion-request', requireAuth, requireRole(STAFF), h(c.getProjectDeletionRequest));
r.get('/deletion-requests', requireAuth, admin, h(c.listDeletionRequests));
r.post('/deletion-requests/:requestId/approve', requireAuth, admin, requireWriteAccess, validate(s.deletionRequestDecision), h(c.approveDeletionRequest));
r.post('/deletion-requests/:requestId/decline', requireAuth, admin, requireWriteAccess, validate(s.deletionRequestDecision), h(c.declineDeletionRequest));
r.post('/deletion-requests/:requestId/cancel', requireAuth, personnel, requireWriteAccess, h(c.cancelDeletionRequest));
export default r;
