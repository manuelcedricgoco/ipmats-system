/**
 * WEEK 2 — Financial records API (Julina Mae Escabosa, Back-end)
 *   GET    /finance/overview                  every project's budget, contract, disbursed, balance + totals
 *   GET    /projects/:id/finance              one project's records and summary
 *   POST   /projects/:id/finance              add a record (Manuel's checks run first)
 *   DELETE /projects/:id/finance/:recordId    admin: remove a wrong entry
 *
 * Gap fix (concept document §4.3 "financial allocation, when available"): a record may name the
 * construction phase it belongs to; the response includes the totals per phase.
 */
import { adminClient } from '../config/supabase.js';
import { round2, summarizeFinance } from '../services/completion.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { assertValid, checkFinancialRecord } from '../services/validationRules.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { badRequest, notFound, unwrap } from '../utils/httpError.js';
import { applyProjectFilters } from './projectsController.js';

const PROJECT_COLS = 'id, approved_budget, contract_amount, notice_to_proceed, overall_progress';

async function loadProject(db, id) {
  const p = unwrap(await db.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  return p;
}
const loadRecords = async (db, id) => unwrap(await db.from('financial_records').select('*').eq('project_id', id).order('record_date').order('created_at'));

/** Obligated / disbursed / expenses per construction phase (records without a phase are "Not assigned to a phase"). */
export function financeByPhase(phases, records) {
  const rows = phases.map((ph) => ({ phase_id: ph.id, sequence_no: ph.sequence_no, name: ph.name, weight: Number(ph.weight), accomplishment: Number(ph.accomplishment), obligated: 0, disbursed: 0, expenses: 0 }));
  const byId = Object.fromEntries(rows.map((r) => [r.phase_id, r]));
  const none = { phase_id: null, sequence_no: null, name: 'Not assigned to a phase', obligated: 0, disbursed: 0, expenses: 0 };
  const key = { obligation: 'obligated', disbursement: 'disbursed', expense: 'expenses' };
  for (const r of records) {
    const k = key[r.record_type];
    if (!k) continue; // variation orders change the contract, not a phase allocation
    (byId[r.phase_id] || none)[k] = round2((byId[r.phase_id] || none)[k] + Number(r.amount));
  }
  return [...rows, ...(none.obligated || none.disbursed || none.expenses ? [none] : [])];
}

export async function listFinance(req, res) {
  const project = await loadProject(req.db, req.params.id);
  const records = await loadRecords(req.db, req.params.id);
  const phases = unwrap(await req.db.from('project_phases').select('id, sequence_no, name, weight, accomplishment').eq('project_id', req.params.id).order('sequence_no'));
  const phaseName = Object.fromEntries(phases.map((p) => [p.id, p.name]));
  const summary = summarizeFinance(project, records);
  res.json({
    data: {
      records: records.map((r) => ({ ...r, phase_name: r.phase_id ? phaseName[r.phase_id] ?? null : null })),
      summary: { ...summary, physical_progress: Number(project.overall_progress) },
      by_phase: financeByPhase(phases, records),
    },
  });
}

export async function addFinancialRecord(req, res) {
  const { id } = req.params;
  const project = await loadProject(adminClient, id);
  const records = await loadRecords(adminClient, id);
  assertValid(checkFinancialRecord({ project, records, record: req.body }));
  if (req.body.phase_id) {
    const ph = unwrap(await adminClient.from('project_phases').select('id').eq('id', req.body.phase_id).eq('project_id', id).maybeSingle());
    if (!ph) throw badRequest('The selected phase does not belong to this project.', [{ field: 'phase_id', message: 'Choose a phase of this project.' }]);
  }

  const row = unwrap(await adminClient.from('financial_records').insert({ ...req.body, project_id: id, created_by: req.user.id }).select('*').single());
  const evaluation = await reevaluate(id, 'financial_record', req.user.id);
  await logActivity(req, {
    action: 'finance.add',
    entityType: 'financial_record',
    entityId: row.id,
    projectId: id,
    summary: `Recorded ${String(row.record_type).replace('_', ' ')} of ₱${Number(row.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} for ${await projectCode(id)}`,
    details: { record_type: row.record_type, amount: Number(row.amount), reference_no: row.reference_no, phase_id: row.phase_id },
  });
  res.status(201).json({ data: { record: row, summary: summarizeFinance(project, [...records, row]), evaluation } });
}

export async function deleteFinancialRecord(req, res) {
  const row = unwrap(await adminClient.from('financial_records').select('id, record_type, amount').eq('id', req.params.recordId).eq('project_id', req.params.id).maybeSingle());
  if (!row) throw notFound('Financial record not found');
  unwrap(await adminClient.from('financial_records').delete().eq('id', row.id));
  await reevaluate(req.params.id, 'financial_record_deleted', req.user.id);
  await logActivity(req, {
    action: 'finance.delete',
    entityType: 'financial_record',
    entityId: row.id,
    projectId: req.params.id,
    summary: `Deleted a ${String(row.record_type).replace('_', ' ')} of ₱${Number(row.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} from ${await projectCode(req.params.id)}`,
  });
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
