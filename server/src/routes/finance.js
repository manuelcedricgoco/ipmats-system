/**
 * WEEK 2 — Financial monitoring routes (Objective 4)
 * View: every staff role. Add records: DPWH Personnel and Admin. Delete a wrong entry: Admin.
 */
import { Router } from 'express';
import * as c from '../controllers/financeController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'recordId');
const staff = requireRole(STAFF);
const editors = requireRole(ROLES.PERSONNEL, ROLES.ADMIN);

r.get('/finance/overview', requireAuth, staff, h(c.financeOverview));
r.get('/projects/:id/finance', requireAuth, staff, h(c.listFinance));
r.post('/projects/:id/finance', requireAuth, editors, requireWriteAccess, validate(s.financialRecord), h(c.addFinancialRecord));
r.delete('/projects/:id/finance/:recordId', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteFinancialRecord));

export default r;
