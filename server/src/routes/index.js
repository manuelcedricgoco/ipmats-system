import { Router } from 'express';
import { adminClient } from '../config/supabase.js';
import admin from './admin.js';
import audit from './audit.js';
import agencies from './agencies.js';
import bidding from './bidding.js';
import contractors from './contractors.js';
import deletionRequests from './deletionRequests.js';
import documents from './documents.js';
import finance from './finance.js';
import images from './images.js';
import pacc from './pacc.js';
import progress from './progress.js';
import projects from './projects.js';
import publicPortal from './public.js';
import reports from './reports.js';
import system from './system.js';

const api = Router();

api.get('/health', (_req, res) => res.json({ status: 'ok', week: 3, writes: Boolean(adminClient), time: new Date().toISOString() }));

api.use('/public', publicPortal); // public portal: no sign-in
api.use('/', agencies); // /reference (public, used by the sign-up form), /agencies
// Week 2 routes are mounted first: /projects/:id/phases, /progress, /finance and /finance/overview
api.use('/', progress);
api.use('/', finance);
// Week 3: 360° images, flags, findings, map, dashboards, reports
api.use('/', images);
api.use('/', audit);
api.use('/', reports);
// Gap fixes: supporting documents, activity logs, flag-rule settings
api.use('/', documents);
api.use('/', system);
api.use('/', deletionRequests); // 027: /projects/:id/deletion-requests, /deletion-requests
api.use('/', bidding); // 032: /projects/:id/bidding, /bidding/rounds/:roundId, /bidding/bids/:bidId
api.use('/pacc', pacc); // PACC portal: pacc role only
api.use('/projects', projects);
api.use('/contractors', contractors);
api.use('/', admin); // /me, /users

export default api;
