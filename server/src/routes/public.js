/** PUBLIC PORTAL routes — open to everyone, no account needed. Reads run as the anonymous role (RLS). */
import { Router } from 'express';
import * as c from '../controllers/publicController.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';

const r = Router();
uuidParams(r, 'id');
r.get('/stats', h(c.publicStats));
r.get('/projects', h(c.publicProjects));
r.get('/projects/:id', h(c.publicProject));
r.get('/map', h(c.publicMap));
// Finance liquidation (031): the summary and the accepted receipts of a public project.
r.get('/projects/:id/liquidation', h(c.publicLiquidation));
export default r;
