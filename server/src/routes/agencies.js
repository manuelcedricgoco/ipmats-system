import { Router } from 'express';
import * as c from '../controllers/referenceController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/httpError.js';
import * as s from './schemas.js';

const r = Router();
r.param('agencyId', (_req, _res, next, v) => (/^\d+$/.test(v) ? next() : next(badRequest('Invalid agencyId'))));

r.get('/reference', h(c.getReference));
r.get('/reference/contractors', h(c.signupContractors)); // 029: the Register page's company list
r.post('/agencies', requireRole(ROLES.ADMIN), requireWriteAccess, validate(s.agencyCreate), h(c.createAgency));
r.patch('/agencies/:agencyId', requireRole(ROLES.ADMIN), requireWriteAccess, validate(s.agencyUpdate), h(c.updateAgency));
r.delete('/agencies/:agencyId', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteAgency));

export default r;
