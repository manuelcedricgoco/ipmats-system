import { Router } from 'express';
import * as c from '../controllers/contractorsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'contractorId');
const editors = requireRole(ROLES.PERSONNEL, ROLES.ADMIN);
r.use(requireAuth, requireRole(STAFF));

r.get('/', h(c.listContractors));
r.get('/:contractorId', h(c.getContractor));
r.post('/', editors, requireWriteAccess, validate(s.contractorCreate), h(c.createContractor));
r.patch('/:contractorId', editors, requireWriteAccess, validate(s.contractorUpdate), h(c.updateContractor));
r.delete('/:contractorId', requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteContractor));

export default r;
