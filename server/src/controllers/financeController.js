/**
 * WEEK 2 — Financial records API (Julina Mae Escabosa, Back-end)
 *   GET    /finance/overview                  every project's budget, contract, disbursed, balance + totals
 *   GET    /projects/:id/finance              one project's records and summary
 *   POST   /projects/:id/finance              add a record (Manuel's checks run first)
 *   DELETE /projects/:id/finance/:recordId    admin: remove a wrong entry
 */
import { adminClient } from '../config/supabase.js';
import { round2, summarizeFinance } from '../services/completion.js';
import { assertValid, checkFinancialRecord } from '../services/validationRules.js';
import { notFound, unwrap } from '../utils/httpError.js';
import { applyProjectFilters } from './projectsController.js';

const PROJECT_COLS = 'id, approved_budget, contract_amount, notice_to_proceed, overall_progress';

async function loadProject(db, id) {
  const p = unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  return p;
}
const loadRecords = async (db, id) => unwrap(await db.from('financial_records').select('*').eq('project_id', id).order('record_date').order('created_at'));

export async function listFinance(req, res) {
  const project = await loadProject(req.db, req.params.id);
  const records = await loadRecords(req.db, req.params.id);
  const summary = summarizeFinance(project, records);
  res.json({ data: { records, summary: { ...summary, physical_progress: Number(project.overall_progress) } } });
}

export async function addFinancialRecord(req, res) {
  const { id } = req.params;
  const project = await loadProject(adminClient, id);
  const records = await loadRecords(adminClient, id);
  assertValid(checkFinancialRecord({ project, records, record: req.body }));

  const row = unwrap(await adminClient.from('financial_records').insert({ ...req.body, project_id: id, created_by: req.user.id }).select('*').single());
  res.status(201).json({ data: { record: row, summary: summarizeFinance(project, [...records, row]) } });
}

export async function deleteFinancialRecord(req, res) {
  const row = unwrap(await adminClient.from('financial_records').select('id').eq('id', req.params.recordId).eq('project_id', req.params.id).maybeSingle());
  if (!row) throw notFound('Financial record not found');
  unwrap(await adminClient.from('financial_records').delete().eq('id', row.id));
  res.status(204).end();
}

export async function financeOverview(req, res) {
  let q = req.db
    .from('v_project_summary')
    .select('id, project_code, name, municipality_name, agency_name, contractor_name, status, approved_budget, contract_amount, variation_orders, revised_contract_amount, total_obligated, total_disbursed, total_expenses, remaining_balance, overall_progress');
  q = applyProjectFilters(q, req.query).order('project_code');
  const rows = unwrap(await q).map((r) => {
    const revised = Number(r.revised_contract_amount);
    const utilization = revised > 0 ? round2((Number(r.total_disbursed) / revised) * 100) : 0;
    return { ...r, utilization_pct: utilization };
  });
  const sum = (k) => round2(rows.reduce((s, r) => s + Number(r[k] || 0), 0));
  const totals = {
    projects: rows.length,
    approved_budget: sum('approved_budget'),
    contract_amount: sum('contract_amount'),
    revised_contract_amount: sum('revised_contract_amount'),
    total_obligated: sum('total_obligated'),
    total_disbursed: sum('total_disbursed'),
    total_expenses: sum('total_expenses'),
    remaining_balance: sum('remaining_balance'),
  };
  totals.utilization_pct = totals.revised_contract_amount ? round2((totals.total_disbursed / totals.revised_contract_amount) * 100) : 0;
  res.json({ data: rows, totals });
}
