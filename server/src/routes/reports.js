/** WEEK 3 — Map, dashboards and downloadable reports. All staff roles. */
import { Router } from 'express';
import * as d from '../controllers/dashboardController.js';
import * as m from '../controllers/mapController.js';
import * as rep from '../controllers/reportsController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole, STAFF } from '../middleware/role.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';

const r = Router();
uuidParams(r, 'id');
const staff = [requireAuth, requireRole(STAFF)];

r.get('/map/projects', ...staff, h(m.mapProjects));
r.get('/map/projects/:id', ...staff, h(m.mapProjectPanel));
r.get('/dashboard/performance', ...staff, h(d.performance));
r.get('/dashboard/financial', ...staff, h(d.financialSummary));
r.get('/reports/flagged.pdf', ...staff, h(rep.flaggedPdf));
r.get('/reports/flagged.csv', ...staff, h(rep.flaggedCsv));
r.get('/reports/financial.csv', ...staff, h(rep.financialCsv));
r.get('/reports/flagged.xlsx', ...staff, h(rep.flaggedXlsx));
r.get('/reports/financial.xlsx', ...staff, h(rep.financialXlsx));
r.get('/reports/projects/:id/audit.pdf', ...staff, h(rep.projectAuditPdf));
export default r;
