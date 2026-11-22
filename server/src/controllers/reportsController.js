/**
 * WEEK 3 — Downloadable audit reports (Manuel Cedric Goco, Leader / Back-end)
 *   GET /reports/flagged.pdf          flagged projects, flag reasons, auditor decisions, findings
 *   GET /reports/flagged.csv          the same as plain CSV (raw values)
 *   GET /reports/flagged.xlsx         the same as a formatted Excel workbook
 *   GET /reports/projects/:id/audit.pdf   full audit report of one project
 *   GET /reports/financial.csv        budgets, disbursements and fund utilization (plain CSV)
 *   GET /reports/financial.xlsx       the same as a formatted Excel workbook with totals
 * Filters (query): flag (default yellow+red; "all" for every project), municipality_id, agency_id, contractor_id, status
 */
import { buildAuditReportPdf, buildFlaggedProjectsPdf } from '../services/report.js';
import { toCsv } from '../utils/csv.js';
import { toXlsx } from '../utils/xlsx.js';
import { notFound, unwrap } from '../utils/httpError.js';
import { applyProjectFilters } from './projectsController.js';

const stamp = () => new Date().toISOString().slice(0, 10);
const RANK = { red: 0, yellow: 1, green: 2 };
const reasonsText = (r) => (r.auto_flag_reasons || []).filter((x) => x.severity === 'yellow' || x.severity === 'red').map((x) => `[${x.severity.toUpperCase()}] ${x.message}`).join(' | ');

async function loadFlagged(req) {
  let q = req.db.from('v_project_summary').select('*');
  q = applyProjectFilters(q, req.query);
  const flag = req.query.flag || 'flagged';
  if (flag === 'flagged') q = q.in('current_flag', ['yellow', 'red']);
  else if (flag !== 'all') q = q.eq('current_flag', flag);
  const projects = unwrap(await q).sort((a, b) => (RANK[a.current_flag] ?? 3) - (RANK[b.current_flag] ?? 3) || a.project_code.localeCompare(b.project_code));
  const ids = projects.map((p) => p.id);
  const [findings, reviews] = ids.length
    ? await Promise.all([
        req.db.from('audit_findings').select('*').in('project_id', ids).order('created_at', { ascending: false }).then(unwrap),
        req.db.from('flag_reviews').select('*, auditor:profiles!flag_reviews_auditor_id_fkey(full_name)').in('project_id', ids).order('created_at', { ascending: false }).then(unwrap),
      ])
    : [[], []];
  const group = (rows) => rows.reduce((m, r) => ({ ...m, [r.project_id]: [...(m[r.project_id] || []), r] }), {});
  return { projects, findingsByProject: group(findings), reviewsByProject: group(reviews.map(({ auditor, ...r }) => ({ ...r, auditor_name: auditor?.full_name }))), flag };
}

export async function flaggedPdf(req, res) {
  const { projects, findingsByProject, reviewsByProject, flag } = await loadFlagged(req);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ipmats-flagged-projects-${stamp()}.pdf"`);
  buildFlaggedProjectsPdf({ projects, findingsByProject, reviewsByProject, filters: flagFilterText(req, flag), generatedBy: generatedBy(req) }).pipe(res);
}

/** Columns of the flagged-projects export. `type` formats the Excel cells; CSV writes the raw values. */
const flaggedColumns = ({ findingsByProject, reviewsByProject }) => [
  { label: 'Project ID', key: 'project_code', type: 'code' },
  { label: 'Project name', key: 'name', type: 'longtext' },
  { label: 'Municipality', key: 'municipality_name' },
  { label: 'Contractor', key: 'contractor_name' },
  { label: 'Status', key: 'status', type: 'label' },
  { label: 'Physical %', key: 'overall_progress', type: 'percent' },
  { label: 'Planned %', key: 'planned_progress', type: 'percent' },
  { label: 'Financial %', key: 'financial_progress', type: 'percent' },
  { label: 'Current flag', key: 'current_flag', type: 'flag' },
  { label: 'Automatic flag', key: 'auto_flag', type: 'flag' },
  { label: 'Review', key: 'flag_review_status', type: 'label' },
  { label: 'Audit status', key: 'audit_status', type: 'label' },
  { label: 'Flag reasons', value: reasonsText, type: 'longtext' },
  { label: 'Latest auditor decision', type: 'longtext', value: (p) => { const r = (reviewsByProject[p.id] || [])[0]; return r ? `${r.decision} ${r.auto_flag}->${r.final_flag}: ${r.reason}` : ''; } },
  { label: 'Audit findings', type: 'longtext', value: (p) => (findingsByProject[p.id] || []).map((f) => `${f.title} [${f.severity}, ${f.action_status}]`).join(' | ') },
];

const flagFilterText = (req, flag) =>
  [flag === 'flagged' ? 'Yellow and Red' : flag === 'all' ? 'All flags' : `${flag} only`, req.query.municipality_id && 'one municipality', req.query.contractor_id && 'one contractor', req.query.status && `status ${req.query.status}`]
    .filter(Boolean)
    .join(', ');

const generatedBy = (req) => `${req.user.profile.full_name || req.user.email} (${req.user.role})`;

export async function flaggedCsv(req, res) {
  const data = await loadFlagged(req);
  const csv = toCsv(data.projects, flaggedColumns(data));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ipmats-flagged-projects-${stamp()}.csv"`);
  res.send(csv);
}

export async function flaggedXlsx(req, res) {
  const data = await loadFlagged(req);
  const buffer = await toXlsx({
    sheetName: 'Flagged projects',
    title: 'Audit Report of Flagged Projects',
    filters: flagFilterText(req, data.flag),
    columns: flaggedColumns(data),
    rows: data.projects,
    generatedBy: generatedBy(req),
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ipmats-flagged-projects-${stamp()}.xlsx"`);
  res.send(buffer);
}

export async function projectAuditPdf(req, res) {
  const { id } = req.params;
  const project = unwrap(await req.db.from('v_project_summary').select('*').eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found');
  const [phases, findings, reviews, financials, history] = await Promise.all([
    req.db.from('project_phases').select('*').eq('project_id', id).order('sequence_no').then(unwrap),
    req.db.from('audit_findings').select('*').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
    req.db.from('flag_reviews').select('*, auditor:profiles!flag_reviews_auditor_id_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
    req.db.from('financial_records').select('record_type, amount').eq('project_id', id).then(unwrap),
    req.db.from('flag_history').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(10).then(unwrap),
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="audit-report-${project.project_code}-${stamp()}.pdf"`);
  buildAuditReportPdf({
    project,
    phases,
    findings,
    reviews: reviews.map(({ auditor, ...r }) => ({ ...r, auditor_name: auditor?.full_name })),
    financials,
    history,
    generatedBy: generatedBy(req),
  }).pipe(res);
}

const FINANCIAL_COLUMNS = [
  { label: 'Project ID', key: 'project_code', type: 'code' },
  { label: 'Project name', key: 'name', type: 'longtext' },
  { label: 'Municipality', key: 'municipality_name' },
  { label: 'Contractor', key: 'contractor_name' },
  { label: 'Approved budget', key: 'approved_budget', type: 'money', total: true },
  { label: 'Contract amount', key: 'contract_amount', type: 'money', total: true },
  { label: 'Variation orders', key: 'variation_orders', type: 'money', total: true },
  { label: 'Revised contract amount', key: 'revised_contract_amount', type: 'money', total: true },
  { label: 'Obligated', key: 'total_obligated', type: 'money', total: true },
  { label: 'Disbursed', key: 'total_disbursed', type: 'money', total: true },
  { label: 'Remaining balance', key: 'remaining_balance', type: 'money', total: true },
  { label: 'Fund utilization %', key: 'financial_progress', type: 'percent' },
  { label: 'Physical %', key: 'overall_progress', type: 'percent' },
  { label: 'Current flag', key: 'current_flag', type: 'flag' },
];

async function loadFinancial(req) {
  let q = req.db.from('v_project_summary').select('*');
  q = applyProjectFilters(q, req.query).order('project_code');
  return unwrap(await q);
}

export async function financialCsv(req, res) {
  const csv = toCsv(await loadFinancial(req), FINANCIAL_COLUMNS);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ipmats-financial-${stamp()}.csv"`);
  res.send(csv);
}

export async function financialXlsx(req, res) {
  const rows = await loadFinancial(req);
  const buffer = await toXlsx({
    sheetName: 'Financial summary',
    title: 'Financial Summary of Infrastructure Projects',
    columns: FINANCIAL_COLUMNS,
    rows,
    generatedBy: generatedBy(req),
    totalsLabel: `Total (${rows.length} projects)`,
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ipmats-financial-${stamp()}.xlsx"`);
  res.send(buffer);
}
