import { describe, expect, it } from 'vitest';
import {
  PRIVACY_REMINDER,
  RECEIPT_MAX_BYTES,
  acceptsReceipts,
  checkReceiptForm,
  checkReturnNote,
  isPdf,
  liquidationNote,
  liquidationStatusMeta,
  receiptFormData,
  receiptStatusMeta,
  receiptUploader,
  receiptsToggleLabel,
} from './liquidation.js';

const file = (type = 'application/pdf', size = 1000) => ({ type, size, name: 'r.pdf' });

describe('receipt status chips', () => {
  it('labels the three statuses', () => {
    expect(receiptStatusMeta('submitted').label).toBe('Submitted');
    expect(receiptStatusMeta('accepted').label).toBe('Accepted');
    expect(receiptStatusMeta('returned').label).toBe('Returned');
    expect(receiptStatusMeta('accepted').cls).toMatch(/emerald/);
    expect(receiptStatusMeta('returned').cls).toMatch(/red/);
  });
  it('falls back for an unknown status', () => {
    expect(receiptStatusMeta('weird').label).toBe('weird');
  });
});

describe('record liquidation display', () => {
  it('labels the record statuses', () => {
    expect(liquidationStatusMeta('unliquidated').label).toBe('Unliquidated');
    expect(liquidationStatusMeta('partly_liquidated').label).toBe('Partly liquidated');
    expect(liquidationStatusMeta('liquidated').label).toBe('Liquidated');
    expect(liquidationStatusMeta(undefined)).toBeNull();
  });
  it('notes an over-liquidation only when there is one', () => {
    expect(liquidationNote({ over_liquidated_by: 0 })).toBeNull();
    expect(liquidationNote(null)).toBeNull();
    expect(liquidationNote({ over_liquidated_by: 1250.5 })).toMatch(/^Over-liquidated by ₱1,250\.50$/);
  });
  it('only disbursements and expenses take receipts', () => {
    expect(acceptsReceipts('disbursement')).toBe(true);
    expect(acceptsReceipts('expense')).toBe(true);
    expect(acceptsReceipts('obligation')).toBe(false);
    expect(acceptsReceipts('variation_order')).toBe(false);
  });
  it('the receipts toggle shows the count and what awaits review', () => {
    expect(receiptsToggleLabel([])).toBe('Receipts (0)');
    expect(receiptsToggleLabel([{ status: 'accepted' }, { status: 'submitted' }, { status: 'submitted' }])).toBe('Receipts (3) · 2 awaiting review');
  });
});

describe('uploader label', () => {
  it('marks a contractor', () => {
    expect(receiptUploader({ uploaded_by_name: 'Juan', uploaded_by_role: 'contractor' })).toBe('Juan (Contractor)');
    expect(receiptUploader({ uploaded_by_name: 'Ana', uploaded_by_role: 'dpwh_personnel' })).toBe('Ana');
    expect(receiptUploader({ uploaded_by_name: null, uploaded_by_role: null })).toBe('—');
  });
});

describe('upload validation', () => {
  const ok = { amount: '1500.25', receipt_date: '2026-11-20', description: 'Cement, 40 bags' };
  const today = '2026-11-28';
  it('accepts a good receipt', () => {
    expect(checkReceiptForm({ ...ok, file: file() }, today)).toEqual({});
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) expect(checkReceiptForm({ ...ok, file: file(t) }, today)).toEqual({});
  });
  it('needs a file of the right type and size', () => {
    expect(checkReceiptForm({ ...ok, file: null }, today).file).toBe('Attach a PDF, JPEG, PNG or WebP file.');
    expect(checkReceiptForm({ ...ok, file: file('image/gif') }, today).file).toBe('Attach a PDF, JPEG, PNG or WebP file.');
    expect(checkReceiptForm({ ...ok, file: file('application/pdf', RECEIPT_MAX_BYTES) }, today)).toEqual({});
    expect(checkReceiptForm({ ...ok, file: file('application/pdf', RECEIPT_MAX_BYTES + 1) }, today).file).toBe('The receipt file can be at most 15 MB.');
  });
  it('needs an amount above 0', () => {
    expect(checkReceiptForm({ ...ok, amount: '', file: file() }, today).amount).toBe('Enter the receipt amount.');
    expect(checkReceiptForm({ ...ok, amount: 'abc', file: file() }, today).amount).toBe('Enter the receipt amount.');
    expect(checkReceiptForm({ ...ok, amount: '0', file: file() }, today).amount).toBe('The receipt amount must be more than 0.');
    expect(checkReceiptForm({ ...ok, amount: '-5', file: file() }, today).amount).toBe('The receipt amount must be more than 0.');
  });
  it('needs a receipt date that is not in the future', () => {
    expect(checkReceiptForm({ ...ok, receipt_date: '', file: file() }, today).receipt_date).toBe('Enter the receipt date.');
    expect(checkReceiptForm({ ...ok, receipt_date: '2026-11-28', file: file() }, today)).toEqual({});
    expect(checkReceiptForm({ ...ok, receipt_date: '2026-11-29', file: file() }, today).receipt_date).toBe('The receipt date cannot be in the future.');
  });
  it('limits the description to 500 characters', () => {
    expect(checkReceiptForm({ ...ok, description: 'x'.repeat(500), file: file() }, today)).toEqual({});
    expect(checkReceiptForm({ ...ok, description: 'x'.repeat(501), file: file() }, today).description).toBe('The description can be at most 500 characters.');
  });
  it('builds the multipart body (no empty description)', () => {
    const f = file();
    const fd = receiptFormData({ amount: ' 1500.25 ', receipt_date: '2026-11-20', description: '  ' }, f);
    expect(fd.get('amount')).toBe('1500.25');
    expect(fd.get('receipt_date')).toBe('2026-11-20');
    expect(fd.has('description')).toBe(false);
    expect(fd.get('file')).toBeTruthy();
    expect(receiptFormData({ ...ok }, f).get('description')).toBe('Cement, 40 bags');
  });
});

describe('return reason', () => {
  it('needs 5–500 characters after trimming', () => {
    const msg = 'Give a reason (5–500 characters) for returning this receipt.';
    expect(checkReturnNote('')).toBe(msg);
    expect(checkReturnNote('   abcd   ')).toBe(msg);
    expect(checkReturnNote('abcde')).toBeNull();
    expect(checkReturnNote('x'.repeat(500))).toBeNull();
    expect(checkReturnNote('x'.repeat(501))).toBe(msg);
  });
});

describe('misc', () => {
  it('the privacy reminder is exact', () => {
    expect(PRIVACY_REMINDER).toBe('Before uploading, cover personal information such as names of private persons, TIN and home addresses. Accepted receipts are shown to the public.');
  });
  it('tells a PDF from an image', () => {
    expect(isPdf('application/pdf')).toBe(true);
    expect(isPdf('image/png')).toBe(false);
  });
});
