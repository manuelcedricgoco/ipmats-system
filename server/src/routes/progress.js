/**
 * WEEK 2 — Phase plan and progress update routes (Objective 3)
 * View: every staff role. Set up phases / report progress: DPWH Personnel only.
 */
import { Router } from 'express';
import * as c from '../controllers/phasesController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id');
const staff = requireRole(STAFF);
const editors = requireRole(ROLES.PERSONNEL);

r.get('/projects/:id/phases', requireAuth, staff, h(c.getPhases));
r.put('/projects/:id/phases', requireAuth, editors, requireWriteAccess, validate(s.phasesReplace), h(c.replacePhases));
r.get('/projects/:id/progress', requireAuth, staff, h(c.listProgress));
r.post('/projects/:id/progress', requireAuth, editors, requireWriteAccess, validate(s.progressSubmit), h(c.submitProgress));

export default r;
