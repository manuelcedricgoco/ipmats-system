/** WEEK 3 — Flags and audit findings (Objective 5). View: staff (a project's flags and findings also contractor accounts, own company's projects) · Review / findings: Auditor, Admin · Corrective action: assigned DPWH personnel */
import { Router } from 'express';
import * as f from '../controllers/flagsController.js';
import * as a from '../controllers/findingsController.js';
import { requireAuth } from '../middleware/auth.js';
import { PROJECT_VIEWERS, requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { uploadEvidence } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'findingId');
const staff = requireRole(STAFF);
const viewers = requireRole(PROJECT_VIEWERS);
const auditors = requireRole(ROLES.AUDITOR, ROLES.ADMIN);

r.get('/flags', requireAuth, staff, h(f.flagQueue));
r.post('/flags/recheck', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(f.recheckAll));
r.get('/projects/:id/flags', requireAuth, viewers, h(f.flagHistory));
r.post('/projects/:id/flags/review', requireAuth, auditors, uploadLimiter, requireWriteAccess, uploadEvidence, validate(s.flagReview), h(f.reviewFlag));

r.get('/findings', requireAuth, staff, h(a.listFindings));
// Gap fixes: assignment of corrective actions and public disclosure of findings
r.get('/findings/assigned', requireAuth, staff, h(a.assignedFindings));
r.get('/audit/assignees', requireAuth, auditors, requireWriteAccess, h(a.assignees));
r.patch('/findings/:findingId/action', requireAuth, staff, requireWriteAccess, validate(s.findingAction), h(a.updateFindingAction));
r.patch('/findings/:findingId/public', requireAuth, auditors, requireWriteAccess, validate(s.publicToggle), h(a.setFindingPublic));
r.get('/projects/:id/findings', requireAuth, viewers, h(a.listFindings));
r.post('/projects/:id/findings', requireAuth, auditors, uploadLimiter, requireWriteAccess, uploadEvidence, validate(s.findingCreate), h(a.createFinding));
r.patch('/findings/:findingId', requireAuth, auditors, uploadLimiter, requireWriteAccess, uploadEvidence, validate(s.findingUpdate), h(a.updateFinding));
export default r;
