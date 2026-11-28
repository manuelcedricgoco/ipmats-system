/**
 * Finance liquidation (migration 031): receipts show where a disbursement or expense went.
 * Receipt status: Submitted → Accepted | Returned (the Auditor; a reason when returned). Only accepted receipts
 * count as liquidated and only they reach the public. These helpers are display and form checks only; the API
 * checks everything again (services/liquidation.js) and its messages are shown as they come.
 */
import { byLabel } from './contractor.js';
import { peso } from './format.js';

/** Shown in the upload dialog (exact text). */
export const PRIVACY_REMINDER =
  'Before uploading, cover personal information such as names of private persons, TIN and home addresses. Accepted receipts are shown to the public.';

export const RECEIPT_MAX_BYTES = 15 * 1024 * 1024;
export const RECEIPT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const RECEIPT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
export const RECEIPT_RECORD_TYPES = ['disbursement', 'expense'];

// The API's messages, so the dialog says the same thing before and after sending.
export const RECEIPT_FILE_MESSAGE = 'Attach a PDF, JPEG, PNG or WebP file.';
export const RECEIPT_SIZE_MESSAGE = 'The receipt file can be at most 15 MB.';
export const RECEIPT_FUTURE_MESSAGE = 'The receipt date cannot be in the future.';
export const RETURN_NOTE_MESSAGE = 'Give a reason (5–500 characters) for returning this receipt.';

export const acceptsReceipts = (recordType) => RECEIPT_RECORD_TYPES.includes(recordType);
export const isPdf = (mime) => mime === 'application/pdf';

const RECEIPT_STATUS_META = {
  submitted: { label: 'Submitted', cls: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' },
  accepted: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' },
  returned: { label: 'Returned', cls: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200' },
};
export const receiptStatusMeta = (status) => RECEIPT_STATUS_META[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-700' };

const LIQUIDATION_STATUS_META = {
  unliquidated: { label: 'Unliquidated', cls: 'bg-slate-100 text-slate-700' },
  partly_liquidated: { label: 'Partly liquidated', cls: 'bg-amber-50 text-amber-800' },
  liquidated: { label: 'Liquidated', cls: 'bg-emerald-50 text-emerald-800' },
};
/** The record's liquidation status chip, or null (obligations and variation orders have none). */
export const liquidationStatusMeta = (status) => LIQUIDATION_STATUS_META[status] || null;

/** "Over-liquidated by ₱X" when the accepted receipts are more than the record (or project) amount. */
export function liquidationNote(liquidation) {
  const over = Number(liquidation?.over_liquidated_by || 0);
  return over > 0 ? `Over-liquidated by ${peso(over)}` : null;
}

/** "Receipts (3) · 2 awaiting review" for a record's toggle. */
export function receiptsToggleLabel(receipts = []) {
  const waiting = receipts.filter((r) => r.status === 'submitted').length;
  return `Receipts (${receipts.length})${waiting ? ` · ${waiting} awaiting review` : ''}`;
}

/** "Juan Dela Cruz (Contractor)" when a contractor uploaded the receipt. */
export const receiptUploader = (r) => byLabel(r?.uploaded_by_name, r?.uploaded_by_role);

/**
 * The upload dialog's checks: { field: message } (empty when the receipt can be sent).
 * `today` is YYYY-MM-DD (the visitor's local date, as in the date field's max).
 */
export function checkReceiptForm({ file, amount, receipt_date: receiptDate, description }, today) {
  const errors = {};
  if (!file || !RECEIPT_MIME_TYPES.includes(file.type)) errors.file = RECEIPT_FILE_MESSAGE;
  else if (file.size > RECEIPT_MAX_BYTES) errors.file = RECEIPT_SIZE_MESSAGE;
  const text = String(amount ?? '').trim();
  const n = Number(text);
  if (text === '' || !Number.isFinite(n)) errors.amount = 'Enter the receipt amount.';
  else if (Math.round(n * 100) / 100 <= 0) errors.amount = 'The receipt amount must be more than 0.';
  if (!receiptDate) errors.receipt_date = 'Enter the receipt date.';
  else if (today && receiptDate > today) errors.receipt_date = RECEIPT_FUTURE_MESSAGE;
  if (String(description ?? '').trim().length > 500) errors.description = 'The description can be at most 500 characters.';
  return errors;
}

/** multipart/form-data for POST /projects/:id/finance/:recordId/receipts. */
export function receiptFormData({ amount, receipt_date: receiptDate, description }, file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('amount', String(amount).trim());
  fd.append('receipt_date', receiptDate);
  const text = String(description ?? '').trim();
  if (text) fd.append('description', text);
  return fd;
}

/** The reason for returning a receipt: the API's message when it is not 5–500 characters (trimmed), else null. */
export function checkReturnNote(note) {
  const n = String(note ?? '').trim().length;
  return n < 5 || n > 500 ? RETURN_NOTE_MESSAGE : null;
}

export const PUBLIC_RECEIPT_TYPES = { disbursement: 'Disbursement', expense: 'Expense' };
