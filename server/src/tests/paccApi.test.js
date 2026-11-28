import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { requireRole, ROLES, STAFF } from '../middleware/role.js';
import { assembleInbox } from '../controllers/paccController.js';
import { reportClose } from '../routes/schemas.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
let app;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

function run(role) {
  let args;
  requireRole(ROLES.PACC)({ user: { role, profile: { approval_status: 'approved' } } }, {}, (...a) => { args = a; });
  return args;
}

describe('PACC API guards', () => {
  it('every PACC route needs sign-in', async () => {
    assert.equal((await request(app).get('/api/pacc/inbox')).status, 401);
    assert.equal((await request(app).get('/api/pacc/activity')).status, 401);
    assert.equal((await request(app).get(`/api/pacc/projects/${ID}`)).status, 401);
    assert.equal((await request(app).post(`/api/pacc/reports/${ID}/close`).send({ outcome: 'valid' })).status, 401);
    assert.equal((await request(app).post(`/api/pacc/projects/${ID}/reports/close-all`).send({ outcome: 'valid' })).status, 401);
  });
  it('requireRole(ROLES.PACC) refuses staff', () => {
    assert.equal(run('admin')[0].status, 403);
    assert.deepEqual(run('pacc'), []);
  });
  it('STAFF does not include pacc', () => {
    assert.equal(STAFF.includes('pacc'), false);
    assert.equal(STAFF.length, 3);
  });
  it('reportClose accepts only valid outcomes', () => {
    assert.equal(reportClose.safeParse({ outcome: 'valid' }).success, true);
    assert.equal(reportClose.safeParse({ outcome: 'spam' }).success, false);
  });
});

describe('inbox assembly', () => {
  it('shows the real reviewed flag, not only red', () => {
    const rows = [{ id: 'p1', e: { open_reports: 10, last_report_on: '2026-11-01', open_case: null }, reasons: ['citizen_reports'] }];
    const info = new Map([['p1', { project_code: 'X1', name: 'Road' }]]);
    const [row] = assembleInbox(rows, info, new Map([['p1', 'yellow']]));
    assert.equal(row.public_flag, 'yellow');
    assert.deepEqual(row.reasons, ['citizen_reports']);
  });
});

/** A stand-in for req.db: every query on a table resolves to that table's rows; calls are recorded. */
function fakeDb(tables) {
  const calls = [];
  const db = {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const builder = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') return (ok, fail) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok, fail);
            if (prop === 'maybeSingle') return async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
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
  return db;
}

describe('the PACC project view', () => {
  const reportRows = Array.from({ length: 150 }, (_, i) => ({ id: `r${i}`, status: 'closed', submitted_on: '2026-11-01' }));
  const tables = {
    v_project_summary: [{ id: ID, project_code: 'P-1', contract_amount: 1000, approved_budget: 1200 }],
    citizen_reports: reportRows,
    citizen_report_files: [],
    project_phases: [{ id: 'ph1', sequence_no: 1, name: 'Earthworks', weight: 40, accomplishment: 50 }],
    progress_updates: [{ id: 'pu1', report_date: '2026-11-01', overall_progress: 20, submitter: { full_name: 'Ana' } }],
    financial_records: [
      { id: 'f1', record_type: 'disbursement', amount: 300, phase_id: 'ph1' },
      { id: 'f2', record_type: 'variation_order', amount: 100, phase_id: null },
    ],
    site_images: [{ id: 'i1', storage_path: 'p/a.jpg', phase: { name: 'Earthworks' }, uploader: { full_name: 'Ben' } }],
    project_documents: [{ id: 'd1', doc_type: 'contract', storage_path: 'p/c.pdf', phase: null, uploader: { full_name: 'Cy' } }],
  };

  it('includes phases, recent progress, finance, photos and documents, read through the caller', async () => {
    const { projectView } = await import('../controllers/paccController.js');
    const db = fakeDb(tables);
    let body;
    await projectView({ params: { id: ID }, db }, { json: (b) => (body = b) });
    const d = body.data;
    assert.deepEqual(d.phases, tables.project_phases.map((p) => ({ ...p, activities: [] })));
    assert.equal(d.progress_updates[0].submitted_by_name, 'Ana');
    assert.equal('submitter' in d.progress_updates[0], false);
    assert.equal(d.financial_records[0].phase_name, 'Earthworks');
    assert.equal(d.financial_records[1].phase_name, null);
    assert.equal(d.finance_summary.total_disbursed, 300);
    assert.equal(d.finance_summary.revised_contract_amount, 1100);
    assert.deepEqual(
      { phase_name: d.images[0].phase_name, uploaded_by_name: d.images[0].uploaded_by_name, url: d.images[0].url },
      { phase_name: 'Earthworks', uploaded_by_name: 'Ben', url: null },
    );
    assert.equal(d.documents[0].type_label, 'Contract');
    assert.equal(d.documents[0].uploaded_by_name, 'Cy');
    assert.equal('url' in d.documents[0], true);
    const progress = db.calls.find((c) => c.table === 'progress_updates');
    assert.ok(progress.ops.some(([op, n]) => op === 'limit' && n === 50));
  });

  it('030: sub-activities, report photos and descriptions, and the completion verification state', async () => {
    const { projectView } = await import('../controllers/paccController.js');
    const db = fakeDb({
      ...tables,
      v_project_summary: [{ ...tables.v_project_summary[0], status: 'completed', completed_at: '2026-11-20T00:00:00Z', completion_verified_at: null }],
      phase_activities: [{ id: 'a1', phase_id: 'ph1', sequence_no: 1, name: 'Excavation', weight: 100, accomplishment: 50 }],
      progress_updates: [{ id: 'pu1', report_date: '2026-11-01', overall_progress: 20, description: 'Excavated 120 m of the canal.', submitter: { full_name: 'Ana' } }],
      progress_photos: [{ id: 'ph-1', progress_update_id: 'pu1', storage_path: 'p/pu1/x.jpg', size_bytes: 10 }],
      pacc_cases: [{ id: 'c1', status: 'under_investigation' }],
      completion_verifications: [{ id: 'v1', verifier_role: 'auditor', decision: 'verified', created_at: '2026-11-21T00:00:00Z', verifier_name: 'Aud' }],
    });
    let body;
    await projectView({ params: { id: ID }, db, user: { role: 'pacc' } }, { json: (b) => (body = b) });
    const d = body.data;
    assert.equal(d.phases[0].activities[0].name, 'Excavation');
    assert.equal(d.progress_updates[0].description, 'Excavated 120 m of the canal.');
    assert.deepEqual(d.progress_updates[0].photos.map((p) => p.id), ['ph-1']);
    assert.equal(d.project.completion_label, 'Completed – awaiting verification');
    assert.equal(d.completion_verification.auditor.decision, 'verified');
    assert.equal(d.completion_verification.pacc, null);
    assert.equal(d.completion_verification.pacc_case_open, true);
    const photos = db.calls.find((c) => c.table === 'progress_photos');
    assert.deepEqual(photos.ops.find(([op]) => op === 'in').slice(1), ['progress_update_id', ['pu1']]);
  });

  it('reads the proof photos of many reports in chunks of 100', async () => {
    const { projectView } = await import('../controllers/paccController.js');
    const db = fakeDb(tables);
    await projectView({ params: { id: ID }, db }, { json: () => {} });
    const chunks = db.calls.filter((c) => c.table === 'citizen_report_files').map((c) => c.ops.find(([op]) => op === 'in')[2].length);
    assert.deepEqual(chunks, [100, 50]);
  });
});
