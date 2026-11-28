/**
 * WEEK 2 — Financial monitoring routes (Objective 4)
 * View: every staff role; a project's records also contractor accounts (own company's projects, read only).
 * Add records: DPWH Personnel only. Delete a wrong entry: Admin.
 *
 * Finance liquidation (031) — receipts of disbursements and expenses:
 *   upload  DPWH Personnel, and contractor accounts on their own active company's projects (requireOwnProject,
 *           checked before the file is read); multipart/form-data: "file" + amount, receipt_date, description.
 *   review  the Auditor only (accept, or return with a reason).
 *   delete  the uploader while not accepted, the Admin any not accepted (checked in the controller).
 * Finance is not locked by completion verification.
 */
import { Router } from 'express';
import * as c from '../controllers/financeController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { PROJECT_REPORTERS, PROJECT_VIEWERS, requireOwnProject, requireRole, requireWriteAccess, ROLES, STAFF } from '../middleware/role.js';
import { uploadReceipt } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { assertCanReviewReceipt } from '../services/liquidation.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'recordId', 'receiptId');
const staff = requireRole(STAFF);
const editors = requireRole(ROLES.PERSONNEL);
/** Any approved account; the next guard decides (so the refusal carries its own message). */
const approved = requireRole(Object.values(ROLES));
/** 403 "Only the Auditor can accept or return receipts." for every other role. */
const receiptReviewers = (req, _res, next) => {
  try {
    assertCanReviewReceipt(req.user);
    return next();
  } catch (err) {
    return next(err);
  }
};

r.get('/finance/overview', requireAuth, staff, h(c.financeOverview));
r.get('/projects/:id/finance', requireAuth, requireRole(PROJECT_VIEWERS), h(c.listFinance));
r.post('/projects/:id/finance', requireAuth, editors, requireWriteAccess, validate(s.financialRecord), h(c.addFinancialRecord));
r.delete('/projects/:id/finance/:recordId', requireAuth, requireRole(ROLES.ADMIN), requireWriteAccess, h(c.deleteFinancialRecord));

r.post(
  '/projects/:id/finance/:recordId/receipts',
  requireAuth,
  requireRole(PROJECT_REPORTERS),
  uploadLimiter,
  requireWriteAccess,
  requireOwnProject,
  uploadReceipt,
  validate(s.receiptUpload),
  h(c.uploadReceipt),
);
r.post('/finance/receipts/:receiptId/accept', requireAuth, approved, receiptReviewers, requireWriteAccess, h(c.acceptReceipt));
r.post('/finance/receipts/:receiptId/return', requireAuth, approved, receiptReviewers, requireWriteAccess, h(c.returnReceipt));
r.delete('/finance/receipts/:receiptId', requireAuth, requireRole(ROLES.ADMIN, ROLES.PERSONNEL, ROLES.CONTRACTOR), requireWriteAccess, h(c.deleteReceipt));

export default r;
