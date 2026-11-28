/**
 * Bidding of project contracts (migration 032).
 * Read: staff, and contractor accounts on their own company's projects (RLS); PACC reads the same
 * data in its project view (GET /pacc/projects/:id); the public reads the abstract of bids
 * (GET /public/projects/:id/bidding).
 * Write: DPWH Personnel only (open, edit, bids, eligibility, evaluate, fail, award).
 */
import { Router } from 'express';
import * as c from '../controllers/biddingController.js';
import { requireAuth } from '../middleware/auth.js';
import { PROJECT_VIEWERS, requireRole, requireWriteAccess, ROLES } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'id', 'roundId', 'bidId');
const personnel = [requireAuth, requireRole(ROLES.PERSONNEL), requireWriteAccess];

r.get('/projects/:id/bidding', requireAuth, requireRole(PROJECT_VIEWERS), h(c.getProjectBidding));
r.post('/projects/:id/bidding/rounds', ...personnel, validate(s.biddingRoundCreate), h(c.openRound));
r.patch('/bidding/rounds/:roundId', ...personnel, validate(s.biddingRoundUpdate), h(c.updateRound));
r.post('/bidding/rounds/:roundId/bids', ...personnel, validate(s.bidCreate), h(c.addBid));
r.patch('/bidding/bids/:bidId', ...personnel, validate(s.bidUpdate), h(c.updateBid));
r.delete('/bidding/bids/:bidId', ...personnel, h(c.deleteBid));
r.post('/bidding/rounds/:roundId/evaluate', ...personnel, h(c.evaluateRound));
r.post('/bidding/rounds/:roundId/fail', ...personnel, validate(s.biddingRoundFail), h(c.failRound));
r.post('/bidding/rounds/:roundId/award', ...personnel, validate(s.biddingRoundAward), h(c.awardRound));

export default r;
