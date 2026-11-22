/** Gap fixes — Activity and Audit Logs (Admin, Auditor) and the Admin's flag-rule settings. */
import { Router } from 'express';
import * as c from '../controllers/systemController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import * as s from './schemas.js';

const r = Router();
r.get('/activity', requireAuth, requireRole(ROLES.ADMIN, ROLES.AUDITOR), h(c.listActivity));
r.get('/settings/flag-rules', requireAuth, requireRole(STAFF), h(c.getFlagRulesSetting));
r.put('/settings/flag-rules', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, validate(s.flagRulesUpdate), h(c.updateFlagRules));
export default r;
