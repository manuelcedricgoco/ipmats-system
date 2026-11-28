// Finance liquidation (migration 031): receipts of disbursements and expenses, accepted or returned
// by the Auditor; only accepted receipts count as liquidated and reach the public.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';
import {
  ACCEPTED_CHANGE_MESSAGE,
  ACCEPTED_DELETE_MESSAGE,
  DELETE_OWN_MESSAGE,
  NOT_SUBMITTED_MESSAGE,
  RECEIPT_FILE_MESSAGE,
  RECEIPT_FUTURE_MESSAGE,
  RECEIPT_SIZE_MESSAGE,
  RECEIPT_TYPE_MESSAGE,
  RETURN_NOTE_MESSAGE,
  REVIEW_BY_AUDITOR_MESSAGE,
  assertCanDeleteReceipt,
  assertCanReviewReceipt,
  assertCanUploadReceipt,
  canDeleteReceipt,
  canUploadReceipt,
  checkReceipt,
  checkReturnNote,
  liquidatedByProject,
  nextReceiptStatus,
  projectLiquidation,
  publicLiquidationSummary,
  recordLiquidation,
  toPublicReceipt,
} from '../services/liquidation.js';
import { detectDocumentFormat } from '../services/imageFormat.js';
import { CONTRACTOR_PROJECT_MESSAGE } from '../services/contractorAccess.js';
import { receiptUpload } from '../routes/schemas.js';
import { uploadReceipt } from '../middleware/upload.js';
import { errorHandler } from '../middleware/errorHandler.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
const COMPANY = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';
const PDF = Buffer.from('%PDF-1.7\n receipt');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

const user = (role, over = {}) => ({ id: `${role}-id`, role, profile: { approval_status: 'approved', full_name: `${role} name`, ...over } });
const contractor = (company = COMPANY) => ({ id: 'rep-id', role: 'contractor', profile: { approval_status: 'approved', full_name: 'Rep A', contractor_id: company, is_active: true } });
const ownProject = { id: ID, contractor_id: COMPANY, contractor: { is_active: true } };
const otherProject = { id: ID, contractor_id: OTHER, contractor: { is_active: true } };
const rec = (id, record_type, amount, project_id = 'p1') => ({ id, record_type, amount, project_id });
const rcpt = (financial_record_id, amount, status, over = {}) => ({ id: `${financial_record_id}-${amount}-${status}`, financial_record_id, amount, status, ...over });
const throwsWith = (fn, status, message) =>
  assert.throws(fn, (e) => {
    assert.equal(e.status, status);
    if (message) assert.equal(e.message, message);
    return true;
  });

let role;
let routers;
let finance;
let publicCtl;
before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  role = await import('../middleware/role.js');
  finance = await import('../controllers/financeController.js');
  publicCtl = await import('../controllers/publicController.js');
  routers = {
    finance: (await import('../routes/finance.js')).default,
    public: (await import('../routes/public.js')).default,
  };
});

// ---------------------------------------------------------------------------
describe('messages', () => {
  it('are exact', () => {
    assert.equal(RECEIPT_TYPE_MESSAGE, 'Receipts can only be added to disbursements and expenses.');
    assert.equal(REVIEW_BY_AUDITOR_MESSAGE, 'Only the Auditor can accept or return receipts.');
    assert.equal(ACCEPTED_DELETE_MESSAGE, 'An accepted receipt cannot be deleted.');
    assert.equal(RETURN_NOTE_MESSAGE, 'Give a reason (5–500 characters) for returning this receipt.');
  });
});

// ---------------------------------------------------------------------------
describe('liquidation of one record', () => {
  const d = rec('d1', 'disbursement', 1000);
  it('counts accepted receipts only', () => {
    const l = recordLiquidation(d, [rcpt('d1', 300, 'accepted'), rcpt('d1', 200, 'submitted'), rcpt('d1', 400, 'returned'), rcpt('x', 900, 'accepted')]);
    assert.equal(l.liquidated_amount, 300);
    assert.equal(l.unliquidated_amount, 700);
    assert.equal(l.status, 'partly_liquidated');
    assert.equal(l.liquidated_pct, 30);
    assert.deepEqual([l.accepted_count, l.submitted_count, l.returned_count], [1, 1, 1]);
    assert.equal(l.over_liquidated_by, 0);
  });
  it('is unliquidated with nothing accepted, liquidated when the accepted total reaches the amount', () => {
    assert.equal(recordLiquidation(d, [rcpt('d1', 1000, 'submitted')]).status, 'unliquidated');
    assert.equal(recordLiquidation(d, []).liquidated_amount, 0);
    const full = recordLiquidation(d, [rcpt('d1', 600.25, 'accepted'), rcpt('d1', 399.75, 'accepted')]);
    assert.equal(full.status, 'liquidated');
    assert.equal(full.liquidated_amount, 1000);
    assert.equal(full.unliquidated_amount, 0);
  });
  it('caps at the record amount and flags the excess (never negative)', () => {
    const over = recordLiquidation(d, [rcpt('d1', 800, 'accepted'), rcpt('d1', 450.5, 'accepted')]);
    assert.equal(over.liquidated_amount, 1000);
    assert.equal(over.accepted_total, 1250.5);
    assert.equal(over.over_liquidated_by, 250.5);
    assert.equal(over.unliquidated_amount, 0);
    assert.equal(over.liquidated_pct, 100);
  });
  it('expenses take receipts; obligations and variation orders do not', () => {
    assert.ok(recordLiquidation(rec('e1', 'expense', 50), []));
    assert.equal(recordLiquidation(rec('o1', 'obligation', 50), []), null);
    assert.equal(recordLiquidation(rec('v1', 'variation_order', -50), []), null);
  });
});

describe('liquidation of a project', () => {
  const records = [rec('d1', 'disbursement', 1000), rec('d2', 'disbursement', 500), rec('e1', 'expense', 200), rec('o1', 'obligation', 5000), rec('v1', 'variation_order', 100)];
  it('totals match the records; liquidated + unliquidated = disbursed + expenses', () => {
    const s = projectLiquidation(records, [rcpt('d1', 1000, 'accepted'), rcpt('e1', 50, 'accepted'), rcpt('d2', 500, 'submitted'), rcpt('d2', 70, 'returned')], 2100);
    assert.equal(s.revised_contract_amount, 2100);
    assert.equal(s.total_disbursed, 1500);
    assert.equal(s.total_expenses, 200);
    assert.equal(s.total_to_liquidate, 1700);
    assert.equal(s.liquidated, 1050);
    assert.equal(s.unliquidated, 650);
    assert.equal(s.liquidated + s.unliquidated, s.total_to_liquidate);
    assert.equal(s.liquidated_pct, 61.76);
    assert.deepEqual([s.accepted_count, s.submitted_count, s.returned_count], [2, 1, 1]);
    assert.equal(s.over_liquidated, false);
  });
  it('over-liquidation of one record is flagged and never makes unliquidated negative or hides another record', () => {
    const s = projectLiquidation(records, [rcpt('d1', 5000, 'accepted')], 2100);
    assert.equal(s.liquidated, 1000);
    assert.equal(s.unliquidated, 700);
    assert.equal(s.over_liquidated, true);
    assert.equal(s.over_liquidated_by, 4000);
  });
  it('0 % with nothing to liquidate', () => {
    const s = projectLiquidation([rec('o1', 'obligation', 10)], [], 0);
    assert.deepEqual([s.total_to_liquidate, s.liquidated, s.unliquidated, s.liquidated_pct], [0, 0, 0, 0]);
  });
  it('the public summary leaves out receipts that are not accepted', () => {
    const s = publicLiquidationSummary(projectLiquidation(records, [rcpt('d2', 500, 'submitted'), rcpt('d2', 70, 'returned')], 2100));
    assert.equal('submitted_count' in s, false);
    assert.equal('returned_count' in s, false);
    assert.equal(s.liquidated, 0);
  });
  it('liquidatedByProject sums the capped accepted amounts per project', () => {
    const m = liquidatedByProject(
      [rec('d1', 'disbursement', 100, 'p1'), rec('e1', 'expense', 50, 'p1'), rec('d9', 'disbursement', 10, 'p2')],
      [rcpt('d1', 150, 'accepted'), rcpt('e1', 20, 'accepted'), rcpt('d9', 5, 'accepted'), rcpt('d9', 5, 'submitted')],
    );
    assert.equal(m.get('p1'), 120);
    assert.equal(m.get('p2'), 5);
  });
});

// ---------------------------------------------------------------------------
describe('who may upload', () => {
  const d = rec('d1', 'disbursement', 10);
  it('DPWH Personnel on any project; a contractor on its own company only', () => {
    assert.doesNotThrow(() => assertCanUploadReceipt({ user: user('dpwh_personnel'), project: otherProject, record: d }));
    assert.doesNotThrow(() => assertCanUploadReceipt({ user: contractor(), project: ownProject, record: d }));
    throwsWith(() => assertCanUploadReceipt({ user: contractor(), project: otherProject, record: d }), 403, CONTRACTOR_PROJECT_MESSAGE);
    throwsWith(() => assertCanUploadReceipt({ user: contractor(), project: { ...ownProject, contractor: { is_active: false } }, record: d }), 403, CONTRACTOR_PROJECT_MESSAGE);
  });
  it('nobody else', () => {
    for (const r of ['admin', 'auditor', 'pacc', null]) throwsWith(() => assertCanUploadReceipt({ user: user(r), project: ownProject, record: d }), 403);
  });
  it('only on disbursements and expenses', () => {
    assert.doesNotThrow(() => assertCanUploadReceipt({ user: user('dpwh_personnel'), project: ownProject, record: rec('e', 'expense', 1) }));
    for (const t of ['obligation', 'variation_order']) throwsWith(() => assertCanUploadReceipt({ user: user('dpwh_personnel'), project: ownProject, record: rec('x', t, 1) }), 400, RECEIPT_TYPE_MESSAGE);
    throwsWith(() => assertCanUploadReceipt({ user: user('dpwh_personnel'), project: ownProject, record: null }), 404);
  });
  it('canUploadReceipt answers the same without throwing', () => {
    assert.equal(canUploadReceipt({ user: contractor(), project: ownProject }), true);
    assert.equal(canUploadReceipt({ user: contractor(), project: otherProject }), false);
    assert.equal(canUploadReceipt({ user: user('auditor'), project: ownProject }), false);
  });
});

describe('who may review, and the status rules', () => {
  it('the Auditor only (not the Admin)', () => {
    assert.doesNotThrow(() => assertCanReviewReceipt(user('auditor')));
    for (const r of ['admin', 'dpwh_personnel', 'pacc', 'contractor']) throwsWith(() => assertCanReviewReceipt(user(r)), 403, REVIEW_BY_AUDITOR_MESSAGE);
  });
  it('submitted → accepted | returned only; accepted is final', () => {
    assert.equal(nextReceiptStatus({ status: 'submitted' }, 'accept'), 'accepted');
    assert.equal(nextReceiptStatus({ status: 'submitted' }, 'return'), 'returned');
    for (const d of ['accept', 'return']) {
      throwsWith(() => nextReceiptStatus({ status: 'accepted' }, d), 409, ACCEPTED_CHANGE_MESSAGE);
      throwsWith(() => nextReceiptStatus({ status: 'returned' }, d), 409, NOT_SUBMITTED_MESSAGE);
    }
    throwsWith(() => nextReceiptStatus(null, 'accept'), 404);
  });
  it('a return needs a reason of 5–500 characters', () => {
    assert.equal(checkReturnNote('  Blurry photo  '), 'Blurry photo');
    for (const bad of [undefined, null, '', '   abc  ', 'x'.repeat(501), 42]) throwsWith(() => checkReturnNote(bad), 400, RETURN_NOTE_MESSAGE);
    assert.equal(checkReturnNote('x'.repeat(500)).length, 500);
  });
});

describe('who may delete', () => {
  const mine = (status, uploader = 'dpwh_personnel-id') => ({ status, uploaded_by: uploader });
  it('an accepted receipt never, whoever asks', () => {
    for (const u of [user('admin'), user('dpwh_personnel'), contractor()]) throwsWith(() => assertCanDeleteReceipt({ user: u, receipt: mine('accepted', u.id), project: ownProject }), 409, ACCEPTED_DELETE_MESSAGE);
  });
  it('the Admin any receipt that is not accepted', () => {
    for (const s of ['submitted', 'returned']) assert.doesNotThrow(() => assertCanDeleteReceipt({ user: user('admin'), receipt: mine(s, 'someone'), project: otherProject }));
  });
  it('the uploader while submitted or returned', () => {
    for (const s of ['submitted', 'returned']) {
      assert.doesNotThrow(() => assertCanDeleteReceipt({ user: user('dpwh_personnel'), receipt: mine(s), project: otherProject }));
      assert.doesNotThrow(() => assertCanDeleteReceipt({ user: contractor(), receipt: mine(s, 'rep-id'), project: ownProject }));
    }
  });
  it('not someone else\'s receipt, nor a contractor whose company no longer has the project', () => {
    throwsWith(() => assertCanDeleteReceipt({ user: user('dpwh_personnel'), receipt: mine('submitted', 'other-id'), project: ownProject }), 403, DELETE_OWN_MESSAGE);
    throwsWith(() => assertCanDeleteReceipt({ user: user('auditor'), receipt: mine('submitted', 'auditor-id'), project: ownProject }), 403, DELETE_OWN_MESSAGE);
    throwsWith(() => assertCanDeleteReceipt({ user: contractor(), receipt: mine('submitted', 'rep-id'), project: otherProject }), 403, CONTRACTOR_PROJECT_MESSAGE);
    throwsWith(() => assertCanDeleteReceipt({ user: { role: 'dpwh_personnel' }, receipt: mine('submitted', undefined), project: ownProject }), 403);
    assert.equal(canDeleteReceipt({ user: user('admin'), receipt: mine('accepted'), project: ownProject }), false);
  });
});

describe('receipt fields', () => {
  it('the receipt date cannot be in the future', () => {
    assert.deepEqual(checkReceipt({ receipt_date: '2026-11-28' }, new Date('2026-11-28T10:00:00Z')), []);
    assert.equal(checkReceipt({ receipt_date: '2026-11-29' }, new Date('2026-11-28T10:00:00Z'))[0].message, RECEIPT_FUTURE_MESSAGE);
  });
  it('zod: amount > 0, a date, a description of at most 500 characters', () => {
    const ok = receiptUpload.parse({ amount: '1250.50', receipt_date: '2026-11-02', description: '  Cement, 20 bags ' });
    assert.deepEqual(ok, { amount: 1250.5, receipt_date: '2026-11-02', description: 'Cement, 20 bags' });
    assert.equal(receiptUpload.parse({ amount: '5', receipt_date: '2026-11-02', description: '' }).description, null);
    for (const bad of [{ amount: '0' }, { amount: '-3' }, { amount: 'abc' }, { amount: '' }, { amount: '1e14' }]) {
      assert.equal(receiptUpload.safeParse({ ...bad, receipt_date: '2026-11-02' }).success, false, JSON.stringify(bad));
    }
    assert.equal(receiptUpload.safeParse({ amount: '5', receipt_date: '02/11/2026' }).success, false);
    assert.equal(receiptUpload.safeParse({ amount: '5', receipt_date: '2026-11-02', description: 'x'.repeat(501) }).success, false);
  });
  it('the file is recognised by its bytes (shared with PACC case documents)', () => {
    assert.deepEqual(detectDocumentFormat(PDF), { ext: 'pdf', mime: 'application/pdf' });
    assert.deepEqual(detectDocumentFormat(JPEG), { ext: 'jpg', mime: 'image/jpeg' });
    assert.equal(detectDocumentFormat(Buffer.from('<html>')), null);
    const pacc = readFileSync(new URL('../controllers/paccController.js', import.meta.url), 'utf8');
    assert.match(pacc, /export const caseDocumentFormat = detectDocumentFormat;/);
    assert.doesNotMatch(pacc, /%PDF/);
  });
});

// ---------------------------------------------------------------------------
describe('the upload middleware (field "file", 15 MB, PDF / JPEG / PNG / WebP)', () => {
  const app = () => {
    const a = express();
    a.post('/r', uploadReceipt, (req, res) => res.json({ size: req.file?.size ?? null, body: req.body }));
    a.use(errorHandler);
    return a;
  };
  it('accepts a PDF with its fields', async () => {
    const res = await request(app()).post('/r').field('amount', '10').field('receipt_date', '2026-11-02').attach('file', PDF, { filename: 'r.pdf', contentType: 'application/pdf' });
    assert.equal(res.status, 200);
    assert.equal(res.body.size, PDF.length);
    assert.equal(res.body.body.amount, '10');
  });
  it('refuses another declared type and a file above 15 MB with clear messages', async () => {
    const html = await request(app()).post('/r').attach('file', Buffer.from('<html>'), { filename: 'r.html', contentType: 'text/html' });
    assert.equal(html.status, 400);
    assert.equal(html.body.error.message, RECEIPT_FILE_MESSAGE);
    const big = await request(app()).post('/r').attach('file', Buffer.concat([PDF, Buffer.alloc(15 * 1024 * 1024)]), { filename: 'big.pdf', contentType: 'application/pdf' });
    assert.equal(big.status, 400);
    assert.equal(big.body.error.message, RECEIPT_SIZE_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
describe('routes', () => {
  const layer = (router, method, path) => router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  const handles = (router, method, path) => {
    const l = layer(router, method, path);
    assert.ok(l, `${method.toUpperCase()} ${path} exists`);
    return l.route.stack.map((s) => s.handle);
  };
  /** Run the route's middleware (not the controller) as `u`; the first error, or null when all pass. */
  async function guardsAs(router, method, path, u, stopAt) {
    const hs = handles(router, method, path);
    const end = stopAt ? hs.indexOf(stopAt) : hs.length - 1;
    for (const fn of hs.slice(0, end)) {
      const err = await new Promise((resolve) => {
        const r = fn({ user: u, params: { id: ID }, headers: {}, ip: '127.0.0.1', app: { get: () => false }, get: () => undefined }, { setHeader() {}, set() {}, status() { return this; }, json() {}, send() {} }, (e) => resolve(e ?? null));
        if (r && typeof r.then === 'function') r.then(() => {}, resolve);
      });
      if (err) return err;
    }
    return null;
  }

  it('upload: Personnel and contractors; the company is checked before the file is read', () => {
    const hs = handles(routers.finance, 'post', '/projects/:id/finance/:recordId/receipts');
    const at = (fn) => hs.indexOf(fn);
    assert.ok(at(role.requireWriteAccess) > 0);
    assert.ok(at(role.requireOwnProject) > at(role.requireWriteAccess));
    assert.ok(at(uploadReceipt) > at(role.requireOwnProject));
    assert.equal(hs.includes(role.requireUnlockedProject), false, 'finance is not locked by completion verification');
  });
  it('upload role check: Personnel and contractors pass; Admin, Auditor and PACC are refused', async () => {
    const path = '/projects/:id/finance/:recordId/receipts';
    for (const u of [user('dpwh_personnel'), contractor()]) {
      const err = await guardsAs(routers.finance, 'post', path, u, role.requireWriteAccess);
      assert.equal(err, null, u.role);
    }
    for (const r of ['admin', 'auditor', 'pacc']) assert.equal((await guardsAs(routers.finance, 'post', path, user(r), role.requireWriteAccess))?.status, 403, r);
  });
  it('accept and return: the Auditor only, with the exact message for everyone else', async () => {
    for (const path of ['/finance/receipts/:receiptId/accept', '/finance/receipts/:receiptId/return']) {
      assert.equal(await guardsAs(routers.finance, 'post', path, user('auditor'), role.requireWriteAccess), null, path);
      for (const u of [user('admin'), user('dpwh_personnel'), user('pacc'), contractor()]) {
        const err = await guardsAs(routers.finance, 'post', path, u, role.requireWriteAccess);
        assert.equal(err?.status, 403, `${u.role} ${path}`);
        assert.equal(err.message, REVIEW_BY_AUDITOR_MESSAGE);
      }
      const pending = await guardsAs(routers.finance, 'post', path, { id: 'x', role: 'auditor', profile: { approval_status: 'pending' } }, role.requireWriteAccess);
      assert.equal(pending?.status, 403);
    }
  });
  it('delete: the Admin, Personnel and contractors reach the controller rules; the Auditor and PACC do not', async () => {
    const path = '/finance/receipts/:receiptId';
    for (const u of [user('admin'), user('dpwh_personnel'), contractor()]) assert.equal(await guardsAs(routers.finance, 'delete', path, u, role.requireWriteAccess), null, u.role);
    for (const r of ['auditor', 'pacc']) assert.equal((await guardsAs(routers.finance, 'delete', path, user(r), role.requireWriteAccess))?.status, 403, r);
  });
  it('existing finance routes are unchanged', () => {
    assert.ok(layer(routers.finance, 'get', '/finance/overview'));
    assert.ok(layer(routers.finance, 'get', '/projects/:id/finance'));
    assert.ok(layer(routers.finance, 'post', '/projects/:id/finance'));
    assert.ok(layer(routers.finance, 'delete', '/projects/:id/finance/:recordId'));
  });
  it('the public liquidation route needs no sign-in', () => {
    const hs = handles(routers.public, 'get', '/projects/:id/liquidation');
    assert.equal(hs.length, 1);
  });
});

// ---------------------------------------------------------------------------
/** A stand-in for a Supabase client: every query on a table resolves to that table's rows; calls are recorded. */
function fakeDb(tables) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const builder = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') return (ok, fail) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, fail);
            if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
            return (...args) => {
              q.ops.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
}
const ops = (db, table) => db.calls.filter((c) => c.table === table).flatMap((c) => c.ops);
const fakeRes = () => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, set() { return this; } };
  return res;
};

const RECEIPT_ROWS = [
  { id: 'r1', financial_record_id: 'd1', project_id: ID, storage_path: `${ID}/d1/a.pdf`, file_name: 'Juan Dela Cruz OR.pdf', mime_type: 'application/pdf', size_bytes: 10, amount: 300, receipt_date: '2026-11-02', description: 'Cement', status: 'accepted', review_note: null, reviewed_by: 'aud-id', reviewed_at: '2026-11-03T00:00:00Z', uploaded_by: 'rep-id', uploaded_by_role: 'contractor', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' },
  { id: 'r2', financial_record_id: 'd1', project_id: ID, storage_path: `${ID}/d1/b.pdf`, file_name: 'b.pdf', mime_type: 'application/pdf', size_bytes: 10, amount: 200, receipt_date: '2026-11-02', description: 'Sand', status: 'submitted', review_note: null, reviewed_by: null, reviewed_at: null, uploaded_by: 'rep-id', uploaded_by_role: 'contractor', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z' },
  { id: 'r3', financial_record_id: 'e1', project_id: ID, storage_path: `${ID}/e1/c.jpg`, file_name: 'c.jpg', mime_type: 'image/jpeg', size_bytes: 10, amount: 80, receipt_date: '2026-11-02', description: null, status: 'returned', review_note: 'Blurry photo', reviewed_by: 'aud-id', reviewed_at: '2026-11-03T00:00:00Z', uploaded_by: 'per-id', uploaded_by_role: 'dpwh_personnel', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-03T00:00:00Z' },
];
const FIN_TABLES = () => ({
  projects: [{ id: ID, approved_budget: 2000, contract_amount: 1500, notice_to_proceed: null, overall_progress: 10, contractor_id: COMPANY, contractor: { is_active: true } }],
  financial_records: [
    { id: 'd1', project_id: ID, record_type: 'disbursement', amount: 1000, record_date: '2026-11-01', phase_id: null },
    { id: 'e1', project_id: ID, record_type: 'expense', amount: 100, record_date: '2026-11-01', phase_id: null },
    { id: 'o1', project_id: ID, record_type: 'obligation', amount: 1500, record_date: '2026-11-01', phase_id: null },
  ],
  project_phases: [],
  finance_receipts: RECEIPT_ROWS,
});

describe('GET /projects/:id/finance adds receipts and liquidation', () => {
  it('reads receipts through the caller (RLS), never sends storage paths, and adds the per-record and project liquidation', async () => {
    const db = fakeDb(FIN_TABLES());
    const res = fakeRes();
    await finance.listFinance({ db, params: { id: ID }, user: contractor() }, res);
    const { records, summary, liquidation, permissions } = res.body.data;
    assert.ok(summary && Array.isArray(res.body.data.by_phase), 'existing fields stay');
    assert.ok(ops(db, 'finance_receipts').some((o) => o[0] === 'eq' && o[1] === 'project_id' && o[2] === ID));
    const d1 = records.find((r) => r.id === 'd1');
    assert.deepEqual(d1.receipts.map((r) => r.id), ['r1', 'r2']);
    assert.equal(d1.liquidation.liquidated_amount, 300);
    assert.equal(d1.liquidation.status, 'partly_liquidated');
    assert.equal(records.find((r) => r.id === 'o1').liquidation, null);
    assert.deepEqual(records.find((r) => r.id === 'o1').receipts, []);
    for (const r of records.flatMap((x) => x.receipts)) {
      assert.equal('storage_path' in r, false);
      assert.ok('url' in r);
    }
    assert.equal(liquidation.liquidated, 300);
    assert.equal(liquidation.unliquidated, 800);
    assert.equal(liquidation.submitted_count, 1);
    assert.equal(liquidation.returned_count, 1);
    assert.equal(liquidation.revised_contract_amount, 1500);
    assert.deepEqual(permissions, { can_upload_receipts: true, can_review_receipts: false });
  });
  it('the uploader may delete own non-accepted receipts; the Auditor may review', async () => {
    const res = fakeRes();
    await finance.listFinance({ db: fakeDb(FIN_TABLES()), params: { id: ID }, user: contractor() }, res);
    const all = res.body.data.records.flatMap((r) => r.receipts);
    assert.equal(all.find((r) => r.id === 'r1').can_delete, false, 'accepted');
    assert.equal(all.find((r) => r.id === 'r2').can_delete, true);
    assert.equal(all.find((r) => r.id === 'r3').can_delete, false, 'not the uploader');
    const aud = fakeRes();
    await finance.listFinance({ db: fakeDb(FIN_TABLES()), params: { id: ID }, user: user('auditor') }, aud);
    assert.deepEqual(aud.body.data.permissions, { can_upload_receipts: false, can_review_receipts: true });
  });
});

describe('GET /public/projects/:id/liquidation', () => {
  it('returns the summary and accepted receipts only, with no identities, file names or storage paths', async () => {
    const db = fakeDb(FIN_TABLES());
    const data = await publicCtl.publicLiquidationData(db, ID, async (paths) => Object.fromEntries(paths.map((p) => [p, `https://signed/${p}`])));
    assert.ok(ops(db, 'finance_receipts').some((o) => o[0] === 'eq' && o[1] === 'status' && o[2] === 'accepted'), 'only accepted rows are read');
    assert.deepEqual(data.receipts.map((r) => r.id), ['r1'], 'submitted and returned never reach the public');
    const [r] = data.receipts;
    assert.deepEqual(Object.keys(r).sort(), ['amount', 'description', 'id', 'mime_type', 'receipt_date', 'record_type', 'url']);
    assert.equal(r.record_type, 'disbursement');
    assert.match(r.url, /^https:\/\/signed\//);
    const json = JSON.stringify(data);
    for (const leak of ['storage_path', 'uploaded_by', 'reviewed_by', 'rep-id', 'aud-id', 'Juan', 'review_note', 'Blurry', 'submitted_count', 'returned_count']) assert.equal(json.includes(leak), false, leak);
    assert.equal(data.summary.liquidated, 300);
    assert.equal(data.summary.total_to_liquidate, 1100);
    assert.equal(data.summary.unliquidated, 800);
  });
  it('drops receipts whose link could not be signed', async () => {
    const data = await publicCtl.publicLiquidationData(fakeDb(FIN_TABLES()), ID, async () => ({}));
    assert.deepEqual(data.receipts, []);
  });
  it('signs public links with a short expiry and checks the project is public first', () => {
    const src = readFileSync(new URL('../controllers/publicController.js', import.meta.url), 'utf8');
    assert.match(src, /PUBLIC_RECEIPT_TTL = 600/);
    assert.match(src, /from\('v_public_projects'\)\.select\('id'\)\.eq\('id', req\.params\.id\)/);
  });
});

describe('GET /finance/overview adds the liquidated amount and %', () => {
  it('withLiquidation: per row and totals, % of disbursed + expenses', () => {
    const rows = [
      { id: 'p1', total_disbursed: 1000, total_expenses: 200 },
      { id: 'p2', total_disbursed: 0, total_expenses: 0 },
    ];
    const { rows: out, totals } = finance.withLiquidation(rows, new Map([['p1', 300]]));
    assert.equal(out[0].liquidated_amount, 300);
    assert.equal(out[0].liquidated_pct, 25);
    assert.equal(out[0].unliquidated_amount, 900);
    assert.equal(out[1].liquidated_amount, 0);
    assert.equal(out[1].liquidated_pct, 0);
    assert.deepEqual(totals, { liquidated_amount: 300, unliquidated_amount: 900, liquidated_pct: 25 });
  });
  it('reads only accepted receipts', () => {
    const src = readFileSync(new URL('../controllers/financeController.js', import.meta.url), 'utf8');
    const load = src.slice(src.indexOf('async function loadLiquidated'), src.indexOf('export async function financeOverview'));
    assert.match(load, /\.from\('finance_receipts'\)[^;]*\.eq\('status', 'accepted'\)/);
    assert.match(src.slice(src.indexOf('export async function financeOverview')), /await loadLiquidated\(req\.db, /);
  });
});

describe('the write controllers', () => {
  const src = () => readFileSync(new URL('../controllers/financeController.js', import.meta.url), 'utf8');
  it('accept / return only change a receipt that is still submitted (no race)', () => {
    assert.match(src(), /\.update\(patch\)\s*\.eq\('id', receipt\.id\)\s*\.eq\('status', 'submitted'\)/);
  });
  it('delete never removes an accepted receipt (conditional delete)', () => {
    assert.match(src(), /\.delete\(\)\s*\.eq\('id', receipt\.id\)\s*\.neq\('status', 'accepted'\)/);
  });
  it('uploads check the file by its bytes, store it in finance-receipts and never leave an orphan file', () => {
    const s = src();
    assert.match(s, /detectDocumentFormat\(req\.file\.buffer\)/);
    assert.match(s, /storage\.from\(RECEIPT_BUCKET\)\.remove\(\[storagePath\]\)/);
    assert.match(s, /uploaded_by_role: req\.user\.role/);
  });
  it('every receipt action is logged', () => {
    for (const a of ['finance.receipt_upload', 'finance.receipt_accept', 'finance.receipt_return', 'finance.receipt_delete']) assert.ok(src().includes(`'${a}'`), a);
    assert.equal((src().match(/await logActivity\(req, \{\s+action: (?:'finance\.receipt_|decision === 'accept')/g) ?? []).length, 3);
  });
});

// ---------------------------------------------------------------------------
describe('migration 031', () => {
  const code = readFileSync(new URL('../../../database/migrations/031_finance_liquidation.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  it('creates finance_receipts with its keys and checks', () => {
    assert.match(code, /create table if not exists public\.finance_receipts \(/);
    assert.match(code, /financial_record_id uuid not null references public\.financial_records \(id\) on delete cascade/);
    assert.match(code, /project_id\s+uuid not null references public\.projects \(id\) on delete cascade/);
    assert.match(code, /storage_path\s+text not null unique/);
    assert.match(code, /amount\s+numeric\(15, 2\) not null check \(amount > 0\)/);
    assert.match(code, /description\s+text check \(char_length\(description\) <= 500\)/);
    assert.match(code, /status\s+text not null default 'submitted' check \(status in \('submitted', 'accepted', 'returned'\)\)/);
    assert.match(code, /constraint finance_receipts_returned_note check \(status <> 'returned' or coalesce\(char_length\(trim\(review_note\)\), 0\) >= 5\)/);
    assert.match(code, /reviewed_by\s+uuid references public\.profiles \(id\) on delete set null/);
    assert.match(code, /uploaded_by\s+uuid references public\.profiles \(id\) on delete set null/);
  });
  it('the guard keeps accepted receipts and the record types', () => {
    assert.match(code, /create trigger finance_receipts_guard before insert or update or delete on public\.finance_receipts/);
    assert.match(code, /raise exception 'An accepted receipt cannot be deleted\.'/);
    assert.match(code, /raise exception 'Receipts can only be added to disbursements and expenses\.'/);
  });
  it('grants: nothing for anon; select for authenticated; all for the service role', () => {
    assert.match(code, /revoke all on public\.finance_receipts from anon, authenticated;/);
    assert.match(code, /grant select on public\.finance_receipts to authenticated;/);
    assert.match(code, /grant all on public\.finance_receipts to service_role;/);
    assert.doesNotMatch(code, /grant[^;]*finance_receipts[^;]*\banon\b/i);
  });
  it('RLS: staff, PACC and the project\'s contractor read', () => {
    assert.match(code, /alter table public\.finance_receipts enable row level security/);
    const policies = [...code.matchAll(/create policy "receipts: (staff|pacc|contractor) read" on public\.finance_receipts\s+for select to authenticated using \(([^;]*)\);/g)];
    assert.deepEqual(policies.map((m) => m[1]).sort(), ['contractor', 'pacc', 'staff']);
    const by = Object.fromEntries(policies.map((m) => [m[1], m[2]]));
    assert.match(by.staff, /^\(select private\.is_staff\(\)\)$/);
    assert.match(by.pacc, /^\(select private\.is_pacc\(\)\)$/);
    assert.match(by.contractor, /p\.id = finance_receipts\.project_id and p\.contractor_id = \(select private\.contractor_company\(\)\)/);
  });
  it('a private bucket (15 MB, PDF / JPEG / PNG / WebP), no storage policies, additive only', () => {
    assert.match(code, /values \('finance-receipts', 'finance-receipts', false, 15728640, array\['application\/pdf', 'image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
    assert.doesNotMatch(code, /storage\.objects/);
    assert.doesNotMatch(code, /\bdrop (table|view|column)\b/i);
    assert.doesNotMatch(code, /alter table public\.(financial_records|projects)\b/);
  });
});
