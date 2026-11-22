/** PUBLIC PORTAL routes — a signed-in account is required for every endpoint (any role, incl. Public). */
import { Router } from 'express';
import * as c from '../controllers/publicController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';

const r = Router();
uuidParams(r, 'id');
r.use(requireAuth);
r.get('/stats', h(c.publicStats));
r.get('/projects', h(c.publicProjects));
r.get('/projects/:id', h(c.publicProject));
// Week 3
r.get('/map', h(c.publicMap));
r.get('/dashboard', h(c.publicDashboard));
export default r;
