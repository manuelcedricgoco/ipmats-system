/**
 * WEEK 2 — Financial records API (Julina Mae Escabosa, Back-end)
 *   GET    /finance/overview                  every project's budget, contract, disbursed, balance + totals
 *   GET    /projects/:id/finance              one project's records and summary
 *   POST   /projects/:id/finance              add a record (Manuel's checks run first)
 *   DELETE /projects/:id/finance/:recordId    admin: remove a wrong entry
 *
 * Gap fix (concept document §4.3 "financial allocation, when available"): a record may name the
 * construction phase it belongs to; the response includes the totals per phase.
 *
 * Finance liquidation (migration 031) — receipts of disbursements and expenses:
 *   POST   /projects/:id/finance/:recordId/receipts   DPWH Personnel; contractors on own company's projects
 *   POST   /finance/receipts/:receiptId/accept        the Auditor
 *   POST   /finance/receipts/:receiptId/return        the Auditor, { note } (5–500 characters)
 *   DELETE /finance/receipts/:receiptId               the uploader while not accepted; the Admin any not accepted
 * GET /projects/:id/finance adds each record's receipts and liquidation and the project's
 * liquidation summary; GET /finance/overview adds the liquidated amount and % per project.
 * Only accepted receipts count (services/liquidation.js). Finance is never locked by completion verification.
 */
import { randomUUID } from 'node:crypto';
import { adminClient } from '../config/supabase.js';
import { round2, summarizeFinance } from '../services/completion.js';
import { detectDocumentFormat } from '../services/imageFormat.js';
import {
  RECEIPT_BUCKET,
  RECEIPT_FILE_MESSAGE,
  assertCanDeleteReceipt,
  assertCanUploadReceipt,
  canDeleteReceipt,
  canUploadReceipt,
  checkReceipt,
  checkReturnNote,
  liquidatedByProject,
  nextReceiptStatus,
  projectLiquidation,
  recordLiquidation,
} from '../services/liquidation.js';
import { fillMissingNames } from '../services/profileNames.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { signedUrls } from '../services/storage.js';
import { assertValid, checkFinancialRecord } from '../services/validationRules.js';
import { logActivity, projectCode } from '../services/activityLog.js';
import { badRequest, conflict, notFound, unwrap } from '../utils/httpError.js';
import { applyProjectFilters } from './projectsController.js';

// contractor_id and contractor.is_active (031): whether a contractor viewer may upload receipts here.
const PROJECT_COLS = 'id, approved_budget, contract_amount, notice_to_proceed, overall_progress, contractor_id, contractor:contractors(is_active)';
/** Receipt columns read for signed-in viewers (storage_path is used for the link and never sent). */
const RECEIPT_COLS =
  'id, financial_record_id, project_id, storage_path, file_name, mime_type, size_bytes, amount, receipt_date, description, status, review_note, ' +
  'reviewed_by, reviewed_at, uploaded_by, uploaded_by_role, created_at, updated_at';
const CHANGED_MESSAGE = 'This receipt was changed by someone else. Reload and try again.';
const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

/** A project's receipts, read through `db` (req.db: RLS lets staff, PACC and the project's contractor read them). */
export async function loadReceipts(db, projectId) {
  return unwrap(await db.from('finance_receipts').select(RECEIPT_COLS).eq('project_id', projectId).order('receipt_date').order('created_at'));
}

/**
 * Receipts as a signed-in viewer gets them: a short-lived link instead of the storage path, the
 * uploader's and reviewer's names (filled with the service role for a contractor, who reads only its
 * own profile) and whether this viewer may delete each one.
 */
export async function receiptsForViewer(rows, user, project) {
  const urls = await signedUrls(RECEIPT_BUCKET, rows.map((r) => r.storage_path));
  const out = rows.map(({ storage_path: path, ...r }) => ({
    ...r,
    amount: Number(r.amount),
    url: urls[path] ?? null,
    uploaded_by_name: null,
    reviewed_by_name: null,
    can_delete: canDeleteReceipt({ user, receipt: r, project }),
  }));
  return fillMissingNames(out, [
    { id: 'uploaded_by', name: 'uploaded_by_name' },
    { id: 'reviewed_by', name: 'reviewed_by_name' },
  ]);
}

export async function listFinance(req, res) {
  const project = await loadProject(req.db, req.params.id);
  const records = await loadRecords(req.db, req.params.id);
  const phases = unwrap(await req.db.from('project_phases').select('id, sequence_no, name, weight, accomplishment').eq('project_id', req.params.id).order('sequence_no'));
  const receiptRows = await loadReceipts(req.db, req.params.id);
  const receipts = await receiptsForViewer(receiptRows, req.user, project);
  const phaseName = Object.fromEntries(phases.map((p) => [p.id, p.name]));
  const summary = summarizeFinance(project, records);
  res.json({
    data: {
      records: records.map((r) => ({
        ...r,
        phase_name: r.phase_id ? phaseName[r.phase_id] ?? null : null,
        receipts: receipts.filter((x) => x.financial_record_id === r.id),
        liquidation: recordLiquidation(r, receiptRows),
      })),
      summary: { ...summary, physical_progress: Number(project.overall_progress) },
      by_phase: financeByPhase(phases, records),
      liquidation: projectLiquidation(records, receiptRows, summary.revised_contract_amount),
      permissions: {
        can_upload_receipts: canUploadReceipt({ user: req.user, project }),
        can_review_receipts: req.user?.role === 'auditor',
      },
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
  // 031: the record's receipts (accepted ones too) go with it (cascade); their files are removed after.
  const receiptFiles = unwrap(await adminClient.from('finance_receipts').select('storage_path').eq('financial_record_id', row.id)).map((r) => r.storage_path);
  unwrap(await adminClient.from('financial_records').delete().eq('id', row.id));
  if (receiptFiles.length) await adminClient.storage.from(RECEIPT_BUCKET).remove(receiptFiles);
  await reevaluate(req.params.id, 'financial_record_deleted', req.user.id);
  await logActivity(req, {
    action: 'finance.delete',
    entityType: 'financial_record',
    entityId: row.id,
    projectId: req.params.id,
    summary: `Deleted a ${String(row.record_type).replace('_', ' ')} of ₱${Number(row.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })} from ${await projectCode(req.params.id)}`,
    ...(receiptFiles.length && { details: { receipts_deleted: receiptFiles.length } }),
  });
  res.status(204).end();
}

/**
 * Liquidated amount and % per overview row (% of disbursed + expenses), and the totals.
 * `liquidated` is Map(project_id → liquidated amount, capped per record).
 */
export function withLiquidation(rows, liquidated) {
  const out = rows.map((r) => {
    const base = round2(Number(r.total_disbursed || 0) + Number(r.total_expenses || 0));
    const amount = round2(Math.min(liquidated.get(r.id) ?? 0, base));
    return {
      ...r,
      liquidated_amount: amount,
      unliquidated_amount: round2(Math.max(0, base - amount)),
      liquidated_pct: base > 0 ? round2((amount / base) * 100) : 0,
    };
  });
  const sum = (k) => round2(out.reduce((s, r) => s + r[k], 0));
  const liq = sum('liquidated_amount');
  const unliq = sum('unliquidated_amount');
  return { rows: out, totals: { liquidated_amount: liq, unliquidated_amount: unliq, liquidated_pct: liq + unliq > 0 ? round2((liq / (liq + unliq)) * 100) : 0 } };
}

/** Accepted receipts of the listed projects and the records they belong to (read as the caller, in chunks). */
async function loadLiquidated(db, projectIds) {
  const receipts = [];
  for (let i = 0; i < projectIds.length; i += 100) {
    receipts.push(...unwrap(await db.from('finance_receipts').select('financial_record_id, project_id, amount, status').in('project_id', projectIds.slice(i, i + 100)).eq('status', 'accepted')));
  }
  const recordIds = [...new Set(receipts.map((r) => r.financial_record_id))];
  const records = [];
  for (let i = 0; i < recordIds.length; i += 100) {
    records.push(...unwrap(await db.from('financial_records').select('id, project_id, record_type, amount').in('id', recordIds.slice(i, i + 100))));
  }
  return liquidatedByProject(records, receipts);
}

export async function financeOverview(req, res) {
  let q = req.db
    .from('v_project_summary')
    .select('id, project_code, name, municipality_name, agency_name, contractor_name, status, approved_budget, contract_amount, variation_orders, revised_contract_amount, total_obligated, total_disbursed, total_expenses, remaining_balance, overall_progress, completion_verified_at');
  q = applyProjectFilters(q, req.query).order('project_code');
  const base = unwrap(await q).map((r) => {
    const revised = Number(r.revised_contract_amount);
    const utilization = revised > 0 ? round2((Number(r.total_disbursed) / revised) * 100) : 0;
    return { ...r, utilization_pct: utilization };
  });
  const { rows, totals: liquidation } = withLiquidation(base, await loadLiquidated(req.db, base.map((r) => r.id)));
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
  Object.assign(totals, liquidation);
  res.json({ data: rows, totals });
}

// ---------------------------------------------------------------------------
// Receipts (031). Writes use the service role after the checks of services/liquidation.js.
// ---------------------------------------------------------------------------

/** The project's company (for the contractor check), with the service role. */
async function loadProjectCompany(projectId) {
  return unwrap(await adminClient.from('projects').select('id, project_code, contractor_id, contractor:contractors(is_active)').eq('id', projectId).maybeSingle());
}

async function loadReceipt(receiptId) {
  const row = unwrap(await adminClient.from('finance_receipts').select(RECEIPT_COLS).eq('id', receiptId).maybeSingle());
  if (!row) throw notFound('Receipt not found');
  return row;
}

/** One receipt as returned after a write (link signed, no storage path). */
async function receiptResponse(row, user, project) {
  const [out] = await receiptsForViewer([row], user, project);
  return out;
}

export async function uploadReceipt(req, res) {
  const { id, recordId } = req.params;
  const project = await loadProjectCompany(id);
  if (!project) throw notFound('Project not found');
  const record = unwrap(await adminClient.from('financial_records').select('id, project_id, record_type, amount, reference_no').eq('id', recordId).eq('project_id', id).maybeSingle());
  assertCanUploadReceipt({ user: req.user, project, record });
  assertValid(checkReceipt(req.body));
  if (!req.file) throw badRequest(RECEIPT_FILE_MESSAGE, [{ field: 'file', message: RECEIPT_FILE_MESSAGE }]);
  const format = detectDocumentFormat(req.file.buffer);
  if (!format) throw badRequest(RECEIPT_FILE_MESSAGE, [{ field: 'file', message: RECEIPT_FILE_MESSAGE }]);

  const storagePath = `${id}/${record.id}/${randomUUID()}.${format.ext}`;
  const up = await adminClient.storage.from(RECEIPT_BUCKET).upload(storagePath, req.file.buffer, { contentType: format.mime, upsert: false });
  if (up.error) throw Object.assign(new Error('Storage upload failed'), { cause: up.error });

  const insert = await adminClient
    .from('finance_receipts')
    .insert({
      financial_record_id: record.id,
      project_id: id,
      storage_path: storagePath,
      file_name: String(req.file.originalname || `receipt.${format.ext}`).slice(0, 200) || `receipt.${format.ext}`,
      mime_type: format.mime,
      size_bytes: req.file.size,
      amount: req.body.amount,
      receipt_date: req.body.receipt_date,
      description: req.body.description ?? null,
      uploaded_by: req.user.id,
      uploaded_by_role: req.user.role,
    })
    .select(RECEIPT_COLS)
    .single();
  if (insert.error) {
    await adminClient.storage.from(RECEIPT_BUCKET).remove([storagePath]); // never leave an orphan file
    unwrap(insert);
  }
  const row = insert.data;
  await logActivity(req, {
    action: 'finance.receipt_upload',
    entityType: 'finance_receipt',
    entityId: row.id,
    projectId: id,
    summary: `Uploaded a receipt of ${peso(row.amount)} for a ${record.record_type} of ${peso(record.amount)} on ${project.project_code}`,
    details: { financial_record_id: record.id, record_type: record.record_type, amount: Number(row.amount), receipt_date: row.receipt_date, mime_type: row.mime_type, size_bytes: row.size_bytes },
  });
  res.status(201).json({ data: await receiptResponse(row, req.user, project) });
}

async function decideReceipt(req, res, decision) {
  const note = decision === 'return' ? checkReturnNote(req.body?.note) : null;
  const receipt = await loadReceipt(req.params.receiptId);
  const status = nextReceiptStatus(receipt, decision);
  const patch = { status, review_note: note, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() };
  // Only a receipt that is still submitted changes (two reviewers at once: the second gets 409).
  const updated = unwrap(
    await adminClient
      .from('finance_receipts')
      .update(patch)
      .eq('id', receipt.id)
      .eq('status', 'submitted')
      .select(RECEIPT_COLS),
  );
  if (!updated.length) {
    nextReceiptStatus(await loadReceipt(receipt.id), decision); // throws the current reason (404 / 409)
    throw conflict(CHANGED_MESSAGE);
  }
  const row = updated[0];
  const project = await loadProjectCompany(row.project_id);
  await logActivity(req, {
    action: decision === 'accept' ? 'finance.receipt_accept' : 'finance.receipt_return',
    entityType: 'finance_receipt',
    entityId: row.id,
    projectId: row.project_id,
    summary: `${decision === 'accept' ? 'Accepted' : 'Returned'} a receipt of ${peso(row.amount)} on ${project?.project_code ?? row.project_id}${note ? `: ${note}` : ''}`,
    details: { financial_record_id: row.financial_record_id, amount: Number(row.amount), status, note },
  });
  res.json({ data: await receiptResponse(row, req.user, project) });
}

export const acceptReceipt = (req, res) => decideReceipt(req, res, 'accept');
export const returnReceipt = (req, res) => decideReceipt(req, res, 'return');

export async function deleteReceipt(req, res) {
  const receipt = await loadReceipt(req.params.receiptId);
  const project = await loadProjectCompany(receipt.project_id);
  assertCanDeleteReceipt({ user: req.user, receipt, project });
  // Never an accepted receipt, even if it was accepted a moment ago (the database refuses it too).
  const deleted = unwrap(await adminClient.from('finance_receipts').delete().eq('id', receipt.id).neq('status', 'accepted').select('id'));
  if (!deleted.length) {
    assertCanDeleteReceipt({ user: req.user, receipt: await loadReceipt(receipt.id), project }); // throws the current reason (404 / 409)
    throw conflict(CHANGED_MESSAGE);
  }
  await adminClient.storage.from(RECEIPT_BUCKET).remove([receipt.storage_path]);
  await logActivity(req, {
    action: 'finance.receipt_delete',
    entityType: 'finance_receipt',
    entityId: receipt.id,
    projectId: receipt.project_id,
    summary: `Deleted a ${receipt.status} receipt of ${peso(receipt.amount)} from ${project?.project_code ?? receipt.project_id}`,
    details: { financial_record_id: receipt.financial_record_id, amount: Number(receipt.amount), status: receipt.status },
  });
  res.status(204).end();
}
