/**
 * WEEK 2 — Financial monitoring routes (Objective 4)
 * View: every staff role; a project's records also contractor accounts (own company's projects, read only).
 * Add records: DPWH Personnel only. Delete a wrong entry: Admin.
 */
import { Router } from 'express';
import * as c from '../controllers/financeController.js';
import { requireAuth } from '../middleware/auth.js';
import { PROJECT_VIEWERS, requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'recordId');
const staff = requireRole(STAFF);
const editors = requireRole(ROLES.PERSONNEL);

r.get('/finance/overview', requireAuth, staff, h(c.financeOverview));
r.get('/projects/:id/finance', requireAuth, requireRole(PROJECT_VIEWERS), h(c.listFinance));
r.post('/projects/:id/finance', requireAuth, editors, requireWriteAccess, validate(s.financialRecord), h(c.addFinancialRecord));
r.delete('/projects/:id/finance/:recordId', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteFinancialRecord));

export default r;
