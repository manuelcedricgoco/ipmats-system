import { Router } from 'express';
import * as c from '../controllers/projectsController.js';
import { requireAuth } from '../middleware/auth.js';
import { PROJECT_VIEWERS, requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id');
const staff = requireRole(STAFF);
// Contractor accounts open their own company's projects (RLS, 029); pacc_case_status is stripped for them.
const viewers = requireRole(PROJECT_VIEWERS);
// Only DPWH Personnel create or edit project data (027). The Admin keeps the delete; Personnel
// delete only with an approved deletion request (checked in deleteProject).
const editors = requireRole(ROLES.PERSONNEL);

// Every project endpoint needs a signed-in staff account (admin, DPWH personnel, auditor);
// the list and the project page are also open to contractor accounts
r.use(requireAuth);

r.get('/', viewers, h(c.listProjects));
r.get('/stats', staff, h(c.projectStats));
r.get('/:id', viewers, h(c.getProject));
r.post('/', editors, requireWriteAccess, validate(s.projectCreate), h(c.createProject));
r.patch('/:id', editors, requireWriteAccess, validate(s.projectUpdate), h(c.updateProject));
r.delete('/:id', requireRole(ROLES.ADMIN, ROLES.PERSONNEL), requireWriteAccess, h(c.deleteProject));

export default r;
