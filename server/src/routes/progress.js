/**
 * WEEK 2 — Phase plan and progress update routes (Objective 3)
 * View: every staff role and contractor accounts (own company's projects). Set up phases: DPWH Personnel only.
 * Report progress: DPWH Personnel, and contractor accounts on their own active company's projects (029);
 * a contractor's report cannot record the actual completion date (DPWH Personnel confirm completion).
 * 030: a progress report is multipart/form-data — the fields as JSON in "payload", 1–5 reference
 * photos in "photos". Once the completion is verified, reports and phase plan changes are refused.
 */
import { Router } from 'express';
import * as c from '../controllers/phasesController.js';
import { requireAuth } from '../middleware/auth.js';
import { PROJECT_REPORTERS, PROJECT_VIEWERS, refuseContractorCompletion, requireOwnProject, requireRole, requireUnlockedProject, requireWriteAccess, ROLES } from '../middleware/role.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { parseJsonPayload, uploadProgressPhotos } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id');
const viewers = requireRole(PROJECT_VIEWERS);
const editors = requireRole(ROLES.PERSONNEL);
const reporters = requireRole(PROJECT_REPORTERS);

r.get('/projects/:id/phases', requireAuth, viewers, h(c.getPhases));
r.put('/projects/:id/phases', requireAuth, editors, requireWriteAccess, requireUnlockedProject, validate(s.phasesReplace), h(c.replacePhases));
r.get('/projects/:id/progress', requireAuth, viewers, h(c.listProgress));
r.post(
  '/projects/:id/progress',
  requireAuth,
  reporters,
  uploadLimiter,
  requireWriteAccess,
  requireOwnProject,
  requireUnlockedProject,
  uploadProgressPhotos,
  parseJsonPayload,
  validate(s.progressSubmit),
  refuseContractorCompletion,
  h(c.submitProgress),
);

export default r;
