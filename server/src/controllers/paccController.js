/**
 * PACC portal API
 *   GET  /pacc/inbox                              projects that need PACC's attention, with the reasons
 *   GET  /pacc/projects/:id                       investigation view (opening it marks new reports "under review")
 *   POST /pacc/reports/:reportId/close            close one citizen report with an outcome
 *   POST /pacc/projects/:id/reports/close-all     close every open report of a project with one outcome
 * Reports never expose tracking_hash. Every write is recorded in pacc_activity.
 */
import { adminClient } from '../config/supabase.js';
import { referralReasons } from '../services/citizenReports.js';
import { logPacc } from '../services/paccActivity.js';
import { signedUrls } from '../services/storage.js';
import { conflict, notFound, unwrap } from '../utils/httpError.js';

const OPEN_CASE = ['under_investigation', 'case_filed'];
const PAGE = 1000;

/** Read every row of a query (Supabase returns at most 1000 per request). */
async function allRows(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = unwrap(await build().range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function inbox(req, res) {
  const db = adminClient ?? req.db;
  const [reports, cases, red] = await Promise.all([
    allRows(() => db.from('citizen_reports').select('id, project_id, submitted_on').neq('status', 'closed').not('project_id', 'is', null).order('id')),
    allRows(() => db.from('pacc_cases').select('id, project_id, status').in('status', OPEN_CASE).not('project_id', 'is', null).order('id')),
    allRows(() => db.from('projects').select('id').eq('public_flag', 'red').order('id')),
  ]);

  const byProject = new Map();
  const entry = (id) => {
    if (!byProject.has(id)) byProject.set(id, { open_reports: 0, last_report_on: null, open_case: null, red: false });
    return byProject.get(id);
  };
  for (const rep of reports) {
    const e = entry(rep.project_id);
    e.open_reports += 1;
    if (!e.last_report_on || rep.submitted_on > e.last_report_on) e.last_report_on = rep.submitted_on;
  }
  for (const cs of cases) entry(cs.project_id).open_case = { id: cs.id, status: cs.status };
  for (const p of red) entry(p.id).red = true;

  const rows = [];
  for (const [id, e] of byProject) {
    const reasons = referralReasons({ publicFlag: e.red ? 'red' : null, openReports: e.open_reports, hasOpenCase: Boolean(e.open_case) });
    if (reasons.length) rows.push({ id, e, reasons });
  }
  const ids = rows.map((x) => x.id);
  const info = new Map();
  const flags = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const [part, flagRows] = await Promise.all([
      db.from('v_project_summary').select('id, project_code, name, municipality_name, contractor_name').in('id', chunk).then(unwrap),
      db.from('projects').select('id, public_flag').in('id', chunk).then(unwrap),
    ]);
    for (const p of part) info.set(p.id, p);
    for (const p of flagRows) flags.set(p.id, p.public_flag);
  }
  res.json({ data: assembleInbox(rows, info, flags) });
}

/** Pure step: join the candidate rows with project details and the reviewed flag, then sort. */
export function assembleInbox(rows, info, flags) {
  return rows
    .filter((x) => info.has(x.id))
    .map(({ id, e, reasons }) => ({
      project_id: id,
      project_code: info.get(id).project_code,
      name: info.get(id).name,
      municipality_name: info.get(id).municipality_name ?? null,
      contractor_name: info.get(id).contractor_name ?? null,
      public_flag: flags.get(id) ?? null,
      open_reports: e.open_reports,
      last_report_on: e.last_report_on,
      open_case: e.open_case,
      reasons,
    }))
    .sort((a, b) => b.reasons.length - a.reasons.length || b.open_reports - a.open_reports);
}

export async function projectView(req, res) {
  const id = req.params.id;
  const project = unwrap(await req.db.from('v_project_summary').select('*').eq('id', id).maybeSingle());
  if (!project) throw notFound('Project not found.');

  // Opening the project counts as review: new reports become "under review".
  if (adminClient) {
    const changed = unwrap(await adminClient.from('citizen_reports').update({ status: 'under_review' }).eq('project_id', id).eq('status', 'received').select('id'));
    if (changed.length) {
      await logPacc(req, {
        action: 'report.review',
        entityType: 'project',
        entityId: id,
        projectId: id,
        summary: `Opened ${project.project_code}; ${changed.length} citizen report${changed.length === 1 ? '' : 's'} now under review.`,
        details: { count: changed.length },
      });
    }
  }

  const [reportRows, history, reviews, findings, cases] = await Promise.all([
    req.db
      .from('citizen_reports')
      .select('id, category, description, status, outcome, case_id, submitted_on')
      .eq('project_id', id)
      .order('submitted_on', { ascending: false })
      .order('id')
      .then(unwrap),
    req.db.from('flag_history').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(50).then(unwrap),
    req.db.from('flag_reviews').select('*, auditor:profiles!flag_reviews_auditor_id_fkey(full_name)').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
    req.db.from('audit_findings').select('*').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
    req.db.from('pacc_cases').select('*').eq('project_id', id).order('created_at', { ascending: false }).then(unwrap),
  ]);

  const files = reportRows.length
    ? unwrap(await req.db.from('citizen_report_files').select('id, report_id, storage_path').in('report_id', reportRows.map((r) => r.id)).order('id'))
    : [];
  const urls = await signedUrls('citizen-reports', files.map((f) => f.storage_path));
  const reports = reportRows.map((r) => ({
    ...r,
    files: files.filter((f) => f.report_id === r.id).map((f) => ({ id: f.id, url: urls[f.storage_path] ?? null })),
  }));

  res.json({
    data: {
      project,
      reports,
      flag_history: history,
      flag_reviews: reviews.map(({ auditor, ...r }) => ({ ...r, auditor_name: auditor?.full_name ?? null })),
      findings,
      cases,
    },
  });
}

export async function closeReport(req, res) {
  const { outcome } = req.body;
  const rep = unwrap(await adminClient.from('citizen_reports').select('id, project_id, project_code, status').eq('id', req.params.reportId).maybeSingle());
  if (!rep) throw notFound('Report not found.');
  if (rep.status === 'closed') throw conflict('This report is already closed.');
  const done = unwrap(await adminClient.from('citizen_reports').update({ status: 'closed', outcome }).eq('id', rep.id).neq('status', 'closed').select('id'));
  if (!done.length) throw conflict('This report is already closed.');
  await logPacc(req, {
    action: 'report.close',
    entityType: 'citizen_report',
    entityId: rep.id,
    projectId: rep.project_id,
    summary: `Closed a citizen report on ${rep.project_code} as ${outcome}.`,
    details: { outcome },
  });
  res.json({ data: { id: rep.id, status: 'closed', outcome } });
}

export async function closeAllReports(req, res) {
  const { outcome } = req.body;
  const id = req.params.id;
  const done = unwrap(await adminClient.from('citizen_reports').update({ status: 'closed', outcome }).eq('project_id', id).neq('status', 'closed').select('id, project_code'));
  if (done.length) {
    await logPacc(req, {
      action: 'report.close_all',
      entityType: 'project',
      entityId: id,
      projectId: id,
      summary: `Closed ${done.length} citizen report${done.length === 1 ? '' : 's'} on ${done[0].project_code} as ${outcome}.`,
      details: { outcome, count: done.length },
    });
  }
  res.json({ data: { closed: done.length, outcome } });
}
