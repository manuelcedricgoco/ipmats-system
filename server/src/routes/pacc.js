/** PACC portal API. Every route needs an approved PACC account; writes also need the service role. */
import { Router } from 'express';
import * as c from '../controllers/paccController.js';
import { verifyAsPacc } from '../controllers/completionController.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimits.js';
import { requireRole, requireWriteAccess, ROLES } from '../middleware/role.js';
import { uploadCaseDocument } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'reportId', 'userId', 'caseId');
r.use(requireAuth, requireRole(ROLES.PACC));

r.get('/inbox', h(c.inbox));
r.get('/projects/:id', h(c.projectView));
r.post('/reports/:reportId/close', requireWriteAccess, validate(s.reportClose), h(c.closeReport));
r.post('/projects/:id/reports/close-all', requireWriteAccess, validate(s.reportClose), h(c.closeAllReports));
// 030: PACC verifies a Completed project's completion (refused while a PACC case is open), or records "Not yet".
r.post('/projects/:id/completion-verification', requireWriteAccess, validate(s.completionVerification), h(verifyAsPacc));

r.get('/cases', h(c.listCases));
r.get('/cases/:caseId', h(c.getCase));
r.post('/projects/:id/cases', requireWriteAccess, validate(s.caseCreate), h(c.createCase));
r.patch('/cases/:caseId', requireWriteAccess, validate(s.caseUpdate), h(c.updateCase));
r.post('/cases/:caseId/notes', requireWriteAccess, validate(s.caseNote), h(c.addCaseNote));
r.post('/cases/:caseId/documents', uploadLimiter, requireWriteAccess, uploadCaseDocument, validate(s.caseDocumentUpload), h(c.uploadCaseDocument));

r.get('/members', h(c.listMembers));
r.post('/members', requireWriteAccess, validate(s.paccMemberCreate), h(c.createMember));
r.post('/members/:userId/suspend', requireWriteAccess, validate(s.userSuspend), h(c.suspendMember));
r.post('/members/:userId/unsuspend', requireWriteAccess, h(c.unsuspendMember));
r.delete('/members/:userId', requireWriteAccess, h(c.deleteMember));

r.get('/activity', h(c.listActivity));
export default r;
