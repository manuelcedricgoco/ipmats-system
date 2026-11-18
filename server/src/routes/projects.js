import { Router } from 'express';
import * as c from '../controllers/projectsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id');
const staff = requireRole(STAFF);
const editors = requireRole(ROLES.PERSONNEL, ROLES.ADMIN);

// Every project endpoint needs a signed-in staff account (admin, DPWH personnel, auditor)
r.use(requireAuth);

r.get('/', staff, h(c.listProjects));
r.get('/stats', staff, h(c.projectStats));
r.get('/:id', staff, h(c.getProject));
r.post('/', editors, requireWriteAccess, validate(s.projectCreate), h(c.createProject));
r.patch('/:id', editors, requireWriteAccess, validate(s.projectUpdate), h(c.updateProject));
r.delete('/:id', requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteProject));

export default r;
