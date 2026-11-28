/**
 * Finance liquidation (migration 031): receipts show where a disbursement or expense went.
 *
 *   Receipt status   submitted → accepted | returned (the Auditor; a reason when returned).
 *                    An accepted receipt is final: never changed, never deleted on its own.
 *   Liquidated       a record's liquidated amount is the sum of its ACCEPTED receipts, shown capped
 *                    at the record amount (the excess is reported as "over-liquidated by").
 *                    Submitted and returned receipts never count.
 *   Project summary  disbursed + expenses to liquidate, liquidated (capped per record), unliquidated
 *                    (never below 0) and the % liquidated.
 *
 * Who may do what:
 *   upload   DPWH Personnel (any project), contractor accounts (own active company's projects);
 *            only on disbursements and expenses.
 *   review   the Auditor only (accept / return).
 *   delete   the uploader while submitted or returned; the Admin any receipt that is not accepted.
 *
 * Pure functions (no database); the database steps are in controllers/financeController.js.
 */
import { HttpError, badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { isoDate, round2 } from './completion.js';
import { assertContractorOwnsProject } from './contractorAccess.js';

export const RECEIPT_BUCKET = 'finance-receipts';
export const RECEIPT_RECORD_TYPES = Object.freeze(['disbursement', 'expense']);
export const RECEIPT_STATUSES = Object.freeze(['submitted', 'accepted', 'returned']);
export const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;

export const RECEIPT_TYPE_MESSAGE = 'Receipts can only be added to disbursements and expenses.';
export const REVIEW_BY_AUDITOR_MESSAGE = 'Only the Auditor can accept or return receipts.';
export const ACCEPTED_DELETE_MESSAGE = 'An accepted receipt cannot be deleted.';
export const RETURN_NOTE_MESSAGE = 'Give a reason (5–500 characters) for returning this receipt.';
export const ACCEPTED_CHANGE_MESSAGE = 'An accepted receipt cannot be changed.';
export const NOT_SUBMITTED_MESSAGE = 'Only a submitted receipt can be accepted or returned.';
export const DELETE_OWN_MESSAGE = 'You can only delete receipts you uploaded.';
export const UPLOAD_ROLE_MESSAGE = 'Only DPWH Personnel and the project\'s contractor can upload receipts.';
export const RECEIPT_FILE_MESSAGE = 'Attach a PDF, JPEG, PNG or WebP file.';
export const RECEIPT_SIZE_MESSAGE = 'The receipt file can be at most 15 MB.';
export const RECEIPT_FUTURE_MESSAGE = 'The receipt date cannot be in the future.';

/** Record statuses (per disbursement / expense). */
export const LIQUIDATION_STATUSES = Object.freeze(['unliquidated', 'partly_liquidated', 'liquidated']);

const UPLOADER_ROLES = ['dpwh_personnel', 'contractor'];

export const acceptsReceipts = (recordType) => RECEIPT_RECORD_TYPES.includes(recordType);

const sumAmounts = (rows) => round2(rows.reduce((s, r) => s + Number(r.amount || 0), 0));

/**
 * Liquidation of one financial record from its receipts (receipts of other records are ignored).
 * null for a record that takes no receipt (obligation, variation order).
 */
export function recordLiquidation(record, receipts = []) {
  if (!record || !acceptsReceipts(record.record_type)) return null;
  const own = receipts.filter((r) => r.financial_record_id === record.id);
  const amount = round2(Math.max(0, Number(record.amount || 0)));
  const accepted = own.filter((r) => r.status === 'accepted');
  const acceptedTotal = sumAmounts(accepted);
  const liquidated = round2(Math.min(acceptedTotal, amount));
  const status = liquidated <= 0 ? 'unliquidated' : liquidated >= amount ? 'liquidated' : 'partly_liquidated';
  return {
    amount,
    accepted_total: acceptedTotal,
    liquidated_amount: liquidated,
    unliquidated_amount: round2(Math.max(0, amount - liquidated)),
    over_liquidated_by: round2(Math.max(0, acceptedTotal - amount)),
    liquidated_pct: amount > 0 ? round2((liquidated / amount) * 100) : 0,
    status,
    accepted_count: accepted.length,
    submitted_count: own.filter((r) => r.status === 'submitted').length,
    returned_count: own.filter((r) => r.status === 'returned').length,
  };
}

/**
 * The project's liquidation summary. `revisedContractAmount` is the contract amount plus variation
 * orders (summarizeFinance). Liquidated is capped per record, so liquidated + unliquidated always
 * equals disbursed + expenses; an excess on any record is reported in over_liquidated_by.
 */
export function projectLiquidation(records = [], receipts = [], revisedContractAmount = 0) {
  const liquidations = records.filter((r) => acceptsReceipts(r.record_type)).map((r) => [r, recordLiquidation(r, receipts)]);
  const total = (type) => round2(liquidations.filter(([r]) => r.record_type === type).reduce((s, [, l]) => s + l.amount, 0));
  const add = (key) => liquidations.reduce((s, [, l]) => s + l[key], 0);
  const disbursed = total('disbursement');
  const expenses = total('expense');
  const toLiquidate = round2(disbursed + expenses);
  const liquidated = round2(add('liquidated_amount'));
  const over = round2(add('over_liquidated_by'));
  return {
    revised_contract_amount: round2(Number(revisedContractAmount || 0)),
    total_disbursed: disbursed,
    total_expenses: expenses,
    total_to_liquidate: toLiquidate,
    liquidated,
    unliquidated: round2(Math.max(0, toLiquidate - liquidated)),
    liquidated_pct: toLiquidate > 0 ? round2((liquidated / toLiquidate) * 100) : 0,
    over_liquidated: over > 0,
    over_liquidated_by: over,
    accepted_count: add('accepted_count'),
    submitted_count: add('submitted_count'),
    returned_count: add('returned_count'),
  };
}

/** The summary as the public sees it: nothing about receipts that are not accepted. */
export function publicLiquidationSummary(summary) {
  const { submitted_count: _s, returned_count: _r, ...rest } = summary;
  return rest;
}

/** A receipt as the public sees it: no file name, storage path, note or any uploader / reviewer identity. */
export function toPublicReceipt(receipt, recordType, url) {
  return {
    id: receipt.id,
    record_type: recordType,
    amount: Number(receipt.amount),
    receipt_date: receipt.receipt_date,
    description: receipt.description ?? null,
    mime_type: receipt.mime_type,
    url: url ?? null,
  };
}

/**
 * Liquidated amount per project for the finance overview: Map(project_id → liquidated), capped per
 * record. `records` are the disbursements / expenses that have accepted receipts; receipts that are
 * not accepted are ignored.
 */
export function liquidatedByProject(records = [], receipts = []) {
  const out = new Map();
  for (const record of records) {
    const l = recordLiquidation(record, receipts);
    if (!l) continue;
    out.set(record.project_id, round2((out.get(record.project_id) ?? 0) + l.liquidated_amount));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Permissions and status rules
// ---------------------------------------------------------------------------

/**
 * Upload: DPWH Personnel on any project; a contractor only on its own active company's project
 * (`project` = { contractor_id, contractor: { is_active } }); only on disbursements and expenses.
 */
export function assertCanUploadReceipt({ user, project, record }) {
  if (!UPLOADER_ROLES.includes(user?.role)) throw forbidden(UPLOAD_ROLE_MESSAGE);
  assertContractorOwnsProject(project, user);
  if (!record) throw notFound('Financial record not found');
  if (!acceptsReceipts(record.record_type)) throw badRequest(RECEIPT_TYPE_MESSAGE, [{ field: 'record_type', message: RECEIPT_TYPE_MESSAGE }]);
}

export function canUploadReceipt(args) {
  try {
    assertCanUploadReceipt({ ...args, record: args.record ?? { record_type: RECEIPT_RECORD_TYPES[0] } });
    return true;
  } catch {
    return false;
  }
}

/** Accept / return: the Auditor only (independent of who recorded the money and who uploaded). */
export function assertCanReviewReceipt(user) {
  if (user?.role !== 'auditor') throw forbidden(REVIEW_BY_AUDITOR_MESSAGE);
}

/** The status a decision ('accept' | 'return') leads to. Only a submitted receipt can be decided. */
export function nextReceiptStatus(receipt, decision) {
  if (!receipt) throw notFound('Receipt not found');
  if (receipt.status === 'accepted') throw conflict(ACCEPTED_CHANGE_MESSAGE);
  if (receipt.status !== 'submitted') throw conflict(NOT_SUBMITTED_MESSAGE);
  if (decision === 'accept') return 'accepted';
  if (decision === 'return') return 'returned';
  throw badRequest('Choose accept or return.');
}

/** The reason for returning a receipt, trimmed (5–500 characters), else 400 with the exact message. */
export function checkReturnNote(note) {
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length < 5 || text.length > 500) throw badRequest(RETURN_NOTE_MESSAGE, [{ field: 'note', message: RETURN_NOTE_MESSAGE }]);
  return text;
}

/**
 * Delete: never an accepted receipt (409, whoever asks). The Admin may delete any other one; the
 * uploader (DPWH Personnel, or a contractor still on its own company's project) theirs.
 */
export function assertCanDeleteReceipt({ user, receipt, project }) {
  if (!receipt) throw notFound('Receipt not found');
  if (receipt.status === 'accepted') throw conflict(ACCEPTED_DELETE_MESSAGE);
  if (user?.role === 'admin') return;
  if (!UPLOADER_ROLES.includes(user?.role) || !user?.id || receipt.uploaded_by !== user.id) throw forbidden(DELETE_OWN_MESSAGE);
  assertContractorOwnsProject(project, user);
}

export function canDeleteReceipt(args) {
  try {
    assertCanDeleteReceipt(args);
    return true;
  } catch {
    return false;
  }
}

/** Field checks against today: the receipt date cannot be in the future. Returns { field, message }[]. */
export function checkReceipt(receipt, now = new Date()) {
  const problems = [];
  if (receipt.receipt_date > isoDate(now)) problems.push({ field: 'receipt_date', message: RECEIPT_FUTURE_MESSAGE });
  return problems;
}

/** 400 for a receipt file above 15 MB (the upload middleware). */
export const receiptTooLarge = () => new HttpError(400, RECEIPT_SIZE_MESSAGE, [{ field: 'file', message: RECEIPT_SIZE_MESSAGE }]);
