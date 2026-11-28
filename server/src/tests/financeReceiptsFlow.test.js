// Finance liquidation (031): the receipt endpoints end to end, with an in-memory stand-in for the
// service-role client (no database, no Storage). Checks who may upload, review and delete, that
// accepted receipts stay, and what the public sees.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';

const P1 = '11111111-0000-4000-8000-000000000001'; // Alpha's project
const P2 = '22222222-0000-4000-8000-000000000002'; // Bravo's project
const ALPHA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRAVO = 'bbbbbbbb-0000-4000-8000-000000000002';
const D1 = 'd1000000-0000-4000-8000-000000000001'; // disbursement of P1
const O1 = 'c1000000-0000-4000-8000-000000000001'; // obligation of P1
const D2 = 'd2000000-0000-4000-8000-000000000002'; // disbursement of P2
const PDF = Buffer.from('%PDF-1.7\n receipt');

const people = {
  personnel: { id: 'per-id', role: 'dpwh_personnel', profile: { approval_status: 'approved', full_name: 'Pia Personnel' } },
  personnel2: { id: 'per2-id', role: 'dpwh_personnel', profile: { approval_status: 'approved', full_name: 'Paolo Personnel' } },
  auditor: { id: 'aud-id', role: 'auditor', profile: { approval_status: 'approved', full_name: 'Ana Auditor' } },
  admin: { id: 'adm-id', role: 'admin', profile: { approval_status: 'approved', full_name: 'Al Admin' } },
  pacc: { id: 'pacc-id', role: 'pacc', profile: { approval_status: 'approved', full_name: 'Paz PACC' } },
  alpha: { id: 'rep-a', role: 'contractor', profile: { approval_status: 'approved', full_name: 'Rep Alpha', contractor_id: ALPHA, is_active: true } },
  bravo: { id: 'rep-b', role: 'contractor', profile: { approval_status: 'approved', full_name: 'Rep Bravo', contractor_id: BRAVO, is_active: true } },
};

/** A tiny query builder over arrays: eq / neq / in filters, insert, update, delete, select, maybeSingle, single. */
class Query {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.filters = [];
    this.op = 'select';
  }
  select() { return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  insert(row) { this.op = 'insert'; this.payload = row; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  run() {
    const rows = (this.store[this.table] ??= []);
    if (this.op === 'insert') {
      const now = new Date().toISOString();
      const row = { id: randomUUID(), status: 'submitted', review_note: null, reviewed_by: null, reviewed_at: null, created_at: now, updated_at: now, ...this.payload };
      rows.push(row);
      return [{ ...row }];
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') hit.forEach((r) => Object.assign(r, this.payload));
    if (this.op === 'delete') this.store[this.table] = rows.filter((r) => !hit.includes(r));
    return hit.map((r) => ({ ...r }));
  }
  then(ok, fail) { return Promise.resolve({ data: this.run(), error: null }).then(ok, fail); }
  async maybeSingle() { return { data: this.run()[0] ?? null, error: null }; }
  async single() { const d = this.run(); return d.length === 1 ? { data: d[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }; }
}

let store;
let files;
let app;

function seed() {
  store = {
    projects: [
      { id: P1, project_code: '26OM0001', contract_amount: 1000, approved_budget: 1000, notice_to_proceed: null, overall_progress: 10, contractor_id: ALPHA, contractor: { is_active: true } },
      { id: P2, project_code: '26OM0002', contract_amount: 500, approved_budget: 500, notice_to_proceed: null, overall_progress: 10, contractor_id: BRAVO, contractor: { is_active: true } },
    ],
    financial_records: [
      { id: D1, project_id: P1, record_type: 'disbursement', amount: 400, reference_no: 'DV-1', record_date: '2026-11-01' },
      { id: O1, project_id: P1, record_type: 'obligation', amount: 1000, reference_no: 'OB-1', record_date: '2026-11-01' },
      { id: D2, project_id: P2, record_type: 'disbursement', amount: 100, reference_no: 'DV-2', record_date: '2026-11-01' },
    ],
    finance_receipts: [],
    profiles: Object.values(people).map((p) => ({ id: p.id, full_name: p.profile.full_name, role: p.role })),
    activity_logs: [],
    v_public_projects: [{ id: P1 }],
  };
  files = { uploaded: [], removed: [] };
}

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'; // a client object exists; every call below is stubbed
  const { adminClient, anonClient } = await import('../config/supabase.js');
  const fake = (client) => {
    client.from = (table) => new Query(store, table);
    Object.defineProperty(client, 'storage', {
      configurable: true,
      value: {
        from: (bucket) => ({
          upload: async (path, _buf, opts) => { files.uploaded.push({ bucket, path, contentType: opts.contentType }); return { data: { path }, error: null }; },
          remove: async (paths) => { files.removed.push(...paths.map((p) => `${bucket}:${p}`)); return { data: [], error: null }; },
          createSignedUrls: async (paths, ttl) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${bucket}/${p}?ttl=${ttl}` })), error: null }),
        }),
      },
    });
  };
  fake(adminClient);
  fake(anonClient);
  const api = (await import('../routes/index.js')).default;
  const { errorHandler } = await import('../middleware/errorHandler.js');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = people[req.get('x-as')] ?? null;
    // Reads as the caller: the staff see everything, a contractor only its own company's projects (RLS).
    const own = (rows, key = 'project_id') => (req.user?.role === 'contractor' ? rows.filter((r) => store.projects.find((p) => p.id === r[key])?.contractor_id === req.user.profile.contractor_id) : rows);
    req.db = {
      from: (table) => {
        const view = { ...store, [table]: table === 'projects' ? own(store.projects, 'id') : Array.isArray(store[table]) && store[table][0]?.project_id !== undefined ? own(store[table]) : store[table] };
        return new Query(view, table);
      },
    };
    next();
  });
  app.use('/api', api);
  app.use(errorHandler);
});
beforeEach(seed);

const as = (who) => ({
  upload: (project, record, fields = {}, file = PDF) => {
    let r = request(app).post(`/api/projects/${project}/finance/${record}/receipts`).set('x-as', who);
    for (const [k, v] of Object.entries({ amount: '150', receipt_date: '2026-11-02', description: 'Cement', ...fields })) r = r.field(k, v);
    return file ? r.attach('file', file, { filename: 'OR-001.pdf', contentType: 'application/pdf' }) : r;
  },
  accept: (id) => request(app).post(`/api/finance/receipts/${id}/accept`).set('x-as', who).send({}),
  return: (id, note) => request(app).post(`/api/finance/receipts/${id}/return`).set('x-as', who).send({ note }),
  del: (id) => request(app).delete(`/api/finance/receipts/${id}`).set('x-as', who),
  list: (project) => request(app).get(`/api/projects/${project}/finance`).set('x-as', who),
});

describe('uploading a receipt', () => {
  it('DPWH Personnel upload on any project; the file goes to finance-receipts, named by the server', async () => {
    const res = await as('personnel').upload(P2, D2);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const r = res.body.data;
    assert.equal(r.status, 'submitted');
    assert.equal(r.amount, 150);
    assert.equal(r.uploaded_by_role, 'dpwh_personnel');
    assert.equal('storage_path' in r, false);
    assert.match(r.url, /^https:\/\/signed\/finance-receipts\//);
    assert.equal(files.uploaded.length, 1);
    assert.match(files.uploaded[0].path, new RegExp(`^${P2}/${D2}/[0-9a-f-]{36}\\.pdf$`));
    assert.equal(files.uploaded[0].contentType, 'application/pdf');
    assert.equal(store.activity_logs.at(-1).action, 'finance.receipt_upload');
    assert.equal(store.activity_logs.at(-1).actor_role, 'dpwh_personnel');
  });
  it('a contractor uploads on its own company\'s project only (logged as contractor)', async () => {
    const ok = await as('alpha').upload(P1, D1);
    assert.equal(ok.status, 201);
    assert.equal(store.activity_logs.at(-1).actor_role, 'contractor');
    const other = await as('alpha').upload(P2, D2);
    assert.equal(other.status, 403);
    assert.equal(other.body.error.message, "You can only update your company's projects.");
    assert.equal(files.uploaded.length, 1, 'the refused file is never stored');
  });
  it('only on disbursements and expenses, and only a record of that project', async () => {
    const res = await as('personnel').upload(P1, O1);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Receipts can only be added to disbursements and expenses.');
    assert.equal((await as('personnel').upload(P1, D2)).status, 404);
    assert.equal(files.uploaded.length, 0);
  });
  it('the file must really be a PDF or image; the fields are checked', async () => {
    const fake = await as('personnel').upload(P1, D1, {}, Buffer.from('<html>not a receipt</html>'));
    assert.equal(fake.status, 400);
    assert.equal(fake.body.error.message, 'Attach a PDF, JPEG, PNG or WebP file.');
    assert.equal((await as('personnel').upload(P1, D1, {}, null)).status, 400);
    assert.equal((await as('personnel').upload(P1, D1, { amount: '0' })).status, 400);
    assert.equal((await as('personnel').upload(P1, D1, { receipt_date: '2999-01-01' })).body.error.message, 'The receipt date cannot be in the future.');
    assert.equal(files.uploaded.length, 0);
  });
  it('the Admin, the Auditor and PACC cannot upload', async () => {
    for (const who of ['admin', 'auditor', 'pacc']) assert.equal((await as(who).upload(P1, D1)).status, 403, who);
  });
});

describe('reviewing a receipt', () => {
  const uploaded = async (who = 'alpha') => (await as(who).upload(P1, D1)).body.data.id;
  it('only the Auditor accepts or returns, with the exact message for others', async () => {
    const id = await uploaded();
    for (const who of ['admin', 'personnel', 'alpha', 'pacc']) {
      for (const res of [await as(who).accept(id), await as(who).return(id, 'Blurry photo')]) {
        assert.equal(res.status, 403, who);
        assert.equal(res.body.error.message, 'Only the Auditor can accept or return receipts.');
      }
    }
    const ok = await as('auditor').accept(id);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, 'accepted');
    assert.equal(ok.body.data.reviewed_by, 'aud-id');
    assert.equal(ok.body.data.reviewed_by_name, 'Ana Auditor');
    assert.equal(store.activity_logs.at(-1).action, 'finance.receipt_accept');
  });
  it('a return needs a reason of 5–500 characters', async () => {
    const id = await uploaded();
    for (const note of [undefined, 'abc', 'x'.repeat(501)]) {
      const res = await as('auditor').return(id, note);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.message, 'Give a reason (5–500 characters) for returning this receipt.');
    }
    const ok = await as('auditor').return(id, '  Amount does not match  ');
    assert.equal(ok.body.data.status, 'returned');
    assert.equal(ok.body.data.review_note, 'Amount does not match');
  });
  it('accepted and returned receipts are final (409)', async () => {
    const a = await uploaded();
    await as('auditor').accept(a);
    assert.equal((await as('auditor').return(a, 'Changed my mind')).status, 409);
    assert.equal((await as('auditor').accept(a)).status, 409);
    const b = await uploaded();
    await as('auditor').return(b, 'Blurry photo');
    assert.equal((await as('auditor').accept(b)).status, 409);
  });
});

describe('deleting a receipt', () => {
  it('the uploader while submitted or returned; the file is removed too', async () => {
    const id = (await as('alpha').upload(P1, D1)).body.data.id;
    assert.equal((await as('alpha').del(id)).status, 204);
    assert.equal(store.finance_receipts.length, 0);
    assert.equal(files.removed.length, 1);
    assert.equal(store.activity_logs.at(-1).action, 'finance.receipt_delete');
    const r = (await as('personnel').upload(P1, D1)).body.data.id;
    await as('auditor').return(r, 'Blurry photo');
    assert.equal((await as('personnel').del(r)).status, 204);
  });
  it('not someone else\'s; the Admin any one that is not accepted', async () => {
    const id = (await as('personnel').upload(P1, D1)).body.data.id;
    assert.equal((await as('personnel2').del(id)).status, 403);
    assert.equal((await as('alpha').del(id)).status, 403);
    assert.equal((await as('auditor').del(id)).status, 403);
    assert.equal((await as('admin').del(id)).status, 204);
  });
  it('an accepted receipt is never deleted, by anyone', async () => {
    const id = (await as('personnel').upload(P1, D1)).body.data.id;
    await as('auditor').accept(id);
    for (const who of ['personnel', 'admin']) {
      const res = await as(who).del(id);
      assert.equal(res.status, 409, who);
      assert.equal(res.body.error.message, 'An accepted receipt cannot be deleted.');
    }
    assert.equal(store.finance_receipts.length, 1);
    assert.equal(files.removed.length, 0);
  });
});

describe('what each side reads', () => {
  async function scenario() {
    const acc = (await as('alpha').upload(P1, D1, { amount: '300', description: 'Gravel' })).body.data.id;
    await as('auditor').accept(acc);
    const sub = (await as('personnel').upload(P1, D1, { amount: '50', description: 'Pending one' })).body.data.id;
    const ret = (await as('personnel').upload(P1, D1, { amount: '20', description: 'Bad one' })).body.data.id;
    await as('auditor').return(ret, 'Blurry photo');
    await as('bravo').upload(P2, D2, { amount: '10' });
    return { acc, sub, ret };
  }
  it('the finance tab: receipts per record, liquidation, a contractor only its own project', async () => {
    await scenario();
    const res = await as('alpha').list(P1);
    assert.equal(res.status, 200);
    const d1 = res.body.data.records.find((r) => r.id === D1);
    assert.equal(d1.receipts.length, 3);
    assert.equal(d1.liquidation.liquidated_amount, 300);
    assert.equal(d1.liquidation.status, 'partly_liquidated');
    assert.equal(res.body.data.liquidation.liquidated, 300);
    assert.equal(res.body.data.liquidation.unliquidated, 100);
    assert.equal(res.body.data.liquidation.liquidated_pct, 75);
    assert.equal(res.body.data.liquidation.submitted_count, 1);
    assert.equal(res.body.data.liquidation.returned_count, 1);
    const other = await as('alpha').list(P2);
    assert.equal(other.status, 404, 'another company\'s project is not found');
  });
  it('the public: the summary and accepted receipts only, nothing that names a person or a file', async () => {
    const { acc } = await scenario();
    const res = await request(app).get(`/api/public/projects/${P1}/liquidation`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.receipts.map((r) => r.id), [acc]);
    assert.match(res.body.data.receipts[0].url, /ttl=600$/);
    assert.equal(res.body.data.summary.liquidated, 300);
    const json = JSON.stringify(res.body);
    for (const leak of ['rep-a', 'per-id', 'aud-id', 'Rep Alpha', 'Ana Auditor', 'OR-001', 'storage_path', 'Blurry', 'Pending one', 'Bad one', 'uploaded_by', 'reviewed']) assert.equal(json.includes(leak), false, leak);
  });
  it('the public: a project that is not public is not found', async () => {
    await scenario();
    assert.equal((await request(app).get(`/api/public/projects/${P2}/liquidation`)).status, 404);
  });
  it('the overview: liquidated amount and % per project', async () => {
    await scenario();
    store.v_project_summary = store.projects.map((p) => ({ id: p.id, project_code: p.project_code, revised_contract_amount: p.contract_amount, total_disbursed: store.financial_records.filter((r) => r.project_id === p.id && r.record_type === 'disbursement').reduce((s, r) => s + r.amount, 0), total_expenses: 0 }));
    const res = await request(app).get('/api/finance/overview').set('x-as', 'personnel');
    assert.equal(res.status, 200);
    const p1 = res.body.data.find((r) => r.id === P1);
    assert.equal(p1.liquidated_amount, 300);
    assert.equal(p1.liquidated_pct, 75);
    assert.equal(res.body.data.find((r) => r.id === P2).liquidated_amount, 0);
    assert.equal(res.body.totals.liquidated_amount, 300);
    assert.equal(res.body.totals.liquidated_pct, 60);
  });
});
