/** Anonymous citizen report routes. Mounted in app.js BEFORE sign-in (only ipLimiter here, so unmatched paths are not counted twice), so nothing here looks at a session. */
import { Router } from 'express';
import * as c from '../controllers/citizenReportsController.js';
import * as s from './schemas.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { requireWriteAccess } from '../middleware/role.js';
import { uploadProof } from '../middleware/upload.js';
import { ipLimiter } from '../middleware/rateLimits.js';
import { reportSubmitLimiter, reportProjectLimiter, trackingLookupLimiter } from '../middleware/anonymousLimits.js';
import { uuidParams } from './params.js';

/** Status checks are never cached by a browser or proxy, whatever the answer (also 400, 404, 429 and 503). */
const noStore = (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const r = Router();
uuidParams(r, 'id');
r.post('/projects/:id/reports', ipLimiter, reportSubmitLimiter, reportProjectLimiter, uploadProof, c.requireProof, validate(s.citizenReport), requireWriteAccess, h(c.submitReport));
// The tracking code travels in the JSON body, never in the URL: hosting providers log request paths next to the IP.
r.post('/reports/status', noStore, ipLimiter, trackingLookupLimiter, c.validateTrackingCode, requireWriteAccess, h(c.reportStatus));
export default r;
