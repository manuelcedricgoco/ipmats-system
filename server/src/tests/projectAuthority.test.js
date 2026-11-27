// Project data authority (migration 027): only DPWH Personnel create or edit project data, the
// Admin keeps the deletes, and Personnel delete a project only with an Admin-approved request.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { requireAuth } from '../middleware/auth.js';
import { deletionRequestCreate, deletionRequestDecision } from '../routes/schemas.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
const NOW = new Date('2026-11-27T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
let app;
let routers;
let dr;
let projects;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
  routers = {
    projects: (await import('../routes/projects.js')).default,
    progress: (await import('../routes/progress.js')).default,
    finance: (await import('../routes/finance.js')).default,
    images: (await import('../routes/images.js')).default,
    documents: (await import('../routes/documents.js')).default,
    deletionRequests: (await import('../routes/deletionRequests.js')).default,
  };
  dr = await import('../controllers/deletionRequestsController.js');
  projects = await import('../controllers/projectsController.js');
});

const user = (role) => ({ id: `${role}-id`, role, profile: { approval_status: 'approved', full_name: 'Ana Cruz' } });

/** Runs the first handler of a route after requireAuth (the role guard) as `role`; returns the error passed to next, or null. */
function guard(router, method, path, role) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} exists`);
  const handler = layer.route.stack.map((s) => s.handle).find((fn) => fn !== requireAuth);
  let result;
  handler({ user: user(role) }, {}, (err) => { result = err ?? null; });
  assert.notEqual(result, undefined, `${method.toUpperCase()} ${path}: the first handler is a synchronous guard`);
  return result;
}
const refused = (router, method, path, role) => guard(router, method, path, role)?.status === 403;

describe('only DPWH Personnel create or edit project data', () => {
  const writes = () => [
    [routers.projects, 'post', '/'],
    [routers.projects, 'patch', '/:id'],
    [routers.progress, 'put', '/projects/:id/phases'],
    [routers.progress, 'post', '/projects/:id/progress'],
    [routers.finance, 'post', '/projects/:id/finance'],
    [routers.images, 'post', '/projects/:id/images'],
    [routers.images, 'patch', '/projects/:id/images/:imageId'],
    [routers.documents, 'post', '/projects/:id/documents'],
  ];
  it('the System Administrator is refused (403) on every project-data write route', () => {
    for (const [router, method, path] of writes()) assert.equal(refused(router, method, path, 'admin'), true, `${method} ${path}`);
  });
  it('DPWH Personnel pass the role check on every one of them', () => {
    for (const [router, method, path] of writes()) assert.equal(guard(router, method, path, 'dpwh_personnel'), null, `${method} ${path}`);
  });
  it('Auditors and PACC stay refused', () => {
    for (const [router, method, path] of writes()) {
      assert.equal(refused(router, method, path, 'auditor'), true, `${method} ${path}`);
      assert.equal(refused(router, method, path, 'pacc'), true, `${method} ${path}`);
    }
  });
});

describe('deletes', () => {
  it('the Admin keeps finance and photo deletes; Personnel do not get them', () => {
    for (const [router, path] of [[routers.finance, '/projects/:id/finance/:recordId'], [routers.images, '/projects/:id/images/:imageId']]) {
      assert.equal(guard(router, 'delete', path, 'admin'), null, path);
      assert.equal(refused(router, 'delete', path, 'dpwh_personnel'), true, path);
    }
  });
  it('document delete stays open to Personnel (own uploads, checked in the controller) and the Admin', () => {
    assert.equal(guard(routers.documents, 'delete', '/projects/:id/documents/:documentId', 'admin'), null);
    assert.equal(guard(routers.documents, 'delete', '/projects/:id/documents/:documentId', 'dpwh_personnel'), null);
    assert.equal(refused(routers.documents, 'delete', '/projects/:id/documents/:documentId', 'auditor'), true);
  });
  it('project delete: Admin and Personnel reach the controller (Personnel need an approval there); Auditors are refused', () => {
    assert.equal(guard(routers.projects, 'delete', '/:id', 'admin'), null);
    assert.equal(guard(routers.projects, 'delete', '/:id', 'dpwh_personnel'), null);
    assert.equal(refused(routers.projects, 'delete', '/:id', 'auditor'), true);
  });
  it('the Personnel refusal message is exact', () => {
    assert.equal(projects.DELETE_NEEDS_APPROVAL_MESSAGE, 'Ask a System Administrator to approve deleting this project first.');
  });
});

describe('deletion request routes', () => {
  const R = () => routers.deletionRequests;
  it('need sign-in', async () => {
    assert.equal((await request(app).post(`/api/projects/${ID}/deletion-requests`).send({ reason: 'Duplicate entry of the same road.' })).status, 401);
    assert.equal((await request(app).get(`/api/projects/${ID}/deletion-request`)).status, 401);
    assert.equal((await request(app).get('/api/deletion-requests')).status, 401);
    assert.equal((await request(app).post(`/api/deletion-requests/${ID}/approve`).send({})).status, 401);
    assert.equal((await request(app).post(`/api/deletion-requests/${ID}/decline`).send({})).status, 401);
    assert.equal((await request(app).post(`/api/deletion-requests/${ID}/cancel`)).status, 401);
  });
  it('a malformed request id is refused before any handler', async () => {
    assert.equal((await request(app).post('/api/deletion-requests/not-a-uuid/approve').send({})).status, 400);
  });
  it('only Personnel make (and cancel) a request', () => {
    for (const path of ['/projects/:id/deletion-requests', '/deletion-requests/:requestId/cancel']) {
      assert.equal(guard(R(), 'post', path, 'dpwh_personnel'), null, path);
      assert.equal(refused(R(), 'post', path, 'admin'), true, path);
      assert.equal(refused(R(), 'post', path, 'auditor'), true, path);
    }
  });
  it('only the Admin lists, approves and declines', () => {
    assert.equal(guard(R(), 'get', '/deletion-requests', 'admin'), null);
    assert.equal(refused(R(), 'get', '/deletion-requests', 'dpwh_personnel'), true);
    for (const path of ['/deletion-requests/:requestId/approve', '/deletion-requests/:requestId/decline']) {
      assert.equal(guard(R(), 'post', path, 'admin'), null, path);
      assert.equal(refused(R(), 'post', path, 'dpwh_personnel'), true, path);
      assert.equal(refused(R(), 'post', path, 'auditor'), true, path);
    }
  });
  it('every staff role reads a project\'s request; PACC does not', () => {
    for (const role of ['admin', 'dpwh_personnel', 'auditor']) assert.equal(guard(R(), 'get', '/projects/:id/deletion-request', role), null, role);
    assert.equal(refused(R(), 'get', '/projects/:id/deletion-request', 'pacc'), true);
  });
});

describe('deletion request schemas', () => {
  it('a reason is 10 to 500 characters', () => {
    assert.equal(deletionRequestCreate.safeParse({ reason: 'Duplicate entry of the same road.' }).success, true);
    assert.equal(deletionRequestCreate.safeParse({ reason: 'too short' }).success, false);
    assert.equal(deletionRequestCreate.safeParse({ reason: '   short   ' }).success, false); // trimmed first
    assert.equal(deletionRequestCreate.safeParse({}).success, false);
    assert.equal(deletionRequestCreate.safeParse({ reason: 'x'.repeat(500) }).success, true);
    assert.equal(deletionRequestCreate.safeParse({ reason: 'x'.repeat(501) }).success, false);
  });
  it('a decision note is optional and at most 500 characters', () => {
    assert.equal(deletionRequestDecision.safeParse({}).success, true);
    assert.equal(deletionRequestDecision.safeParse({ note: '' }).data.note, null);
    assert.equal(deletionRequestDecision.safeParse({ note: 'x'.repeat(500) }).success, true);
    assert.equal(deletionRequestDecision.safeParse({ note: 'x'.repeat(501) }).success, false);
  });
});

describe('canUseApproval', () => {
  const approved = { status: 'approved', requested_by: 'me', approval_expires_at: new Date(NOW.getTime() + DAY).toISOString(), used_at: null };
  it('the requester\'s own approved, unexpired, unused request can be used', () => {
    assert.equal(dr.canUseApproval(approved, 'me', NOW), true);
  });
  it('someone else\'s approval cannot', () => assert.equal(dr.canUseApproval(approved, 'other', NOW), false));
  it('an expired approval cannot', () => {
    assert.equal(dr.canUseApproval({ ...approved, approval_expires_at: new Date(NOW.getTime() - 1).toISOString() }, 'me', NOW), false);
    assert.equal(dr.canUseApproval({ ...approved, approval_expires_at: NOW.toISOString() }, 'me', NOW), false);
    assert.equal(dr.canUseApproval({ ...approved, approval_expires_at: null }, 'me', NOW), false);
  });
  it('a used approval cannot', () => {
    assert.equal(dr.canUseApproval({ ...approved, status: 'used', used_at: NOW.toISOString() }, 'me', NOW), false);
    assert.equal(dr.canUseApproval({ ...approved, used_at: NOW.toISOString() }, 'me', NOW), false);
  });
  it('pending, declined, cancelled and expired requests cannot', () => {
    for (const status of ['pending', 'declined', 'cancelled', 'expired']) assert.equal(dr.canUseApproval({ ...approved, status }, 'me', NOW), false, status);
  });
  it('no request cannot', () => {
    assert.equal(dr.canUseApproval(null, 'me', NOW), false);
    assert.equal(dr.canUseApproval(undefined, 'me', NOW), false);
  });
  it('an approval lasts 7 days', () => {
    assert.equal(dr.APPROVAL_DAYS, 7);
    assert.equal(dr.approvalExpiry(NOW), new Date(NOW.getTime() + 7 * DAY).toISOString());
  });
});

describe('presenting a deletion request', () => {
  it('flattens the names and computes expired', () => {
    const row = {
      id: 'r1', status: 'approved', approval_expires_at: new Date(NOW.getTime() - 1000).toISOString(),
      requester: { full_name: 'Ana Cruz' }, decider: { full_name: 'Admin Reyes' }, project: { pacc_case_status: 'case_filed' },
    };
    const out = dr.presentRequest(row, NOW);
    assert.equal(out.requested_by_name, 'Ana Cruz');
    assert.equal(out.decided_by_name, 'Admin Reyes');
    assert.equal(out.pacc_case_status, 'case_filed');
    assert.equal(out.expired, true);
    assert.equal('requester' in out || 'decider' in out || 'project' in out, false);
  });
  it('an unexpired approval and a pending request are not expired; a request marked expired is', () => {
    assert.equal(dr.presentRequest({ status: 'approved', approval_expires_at: new Date(NOW.getTime() + DAY).toISOString() }, NOW).expired, false);
    assert.equal(dr.presentRequest({ status: 'pending', approval_expires_at: null }, NOW).expired, false);
    assert.equal(dr.presentRequest({ status: 'expired', approval_expires_at: null }, NOW).expired, true);
    assert.equal(dr.presentRequest({ status: 'pending' }, NOW).requested_by_name, null);
  });
});

describe('location lock', () => {
  it('once 360° photos are on file nobody may move the project, the Admin included', () => {
    assert.throws(
      () => projects.assertLocationEditable({ locationChanged: true, photoCount: 1 }),
      (e) => e.status === 403 && e.message === 'The project location cannot be changed once 360° photos are on file.',
    );
  });
  it('without photos, or without a location change, the update goes ahead', () => {
    assert.doesNotThrow(() => projects.assertLocationEditable({ locationChanged: true, photoCount: 0 }));
    assert.doesNotThrow(() => projects.assertLocationEditable({ locationChanged: false, photoCount: 5 }));
  });
});

describe('PACC entry when a project with an open case is deleted', () => {
  const project = { id: ID, project_code: '26OM0315', name: 'Concreting of Barangay Road' };
  const openCase = { id: 'c1', status: 'under_investigation' };
  it('is written by "System" and names the project and the deleter (name and role)', () => {
    const row = projects.paccDeletionEntry(project, user('dpwh_personnel'), openCase, NOW);
    assert.equal(row.actor_id, null);
    assert.equal(row.actor_name, 'System');
    assert.equal(row.action, 'project.deleted');
    assert.match(row.action, /^[a-z_]+\.[a-z_]+$/);
    assert.equal(row.entity_type, 'project');
    assert.equal(row.entity_id, ID);
    assert.equal(row.project_id, ID);
    assert.match(row.summary, /26OM0315/);
    assert.match(row.summary, /Concreting of Barangay Road/);
    assert.match(row.summary, /Ana Cruz/);
    assert.match(row.summary, /DPWH Personnel/);
    assert.equal(row.details.case_id, 'c1');
    assert.equal(row.details.deleted_at, NOW.toISOString());
    assert.equal(projects.paccDeletionEntry(project, user('admin'), openCase, NOW).summary.includes('System Administrator'), true);
  });
  it('the summary fits the pacc_activity limit (3–500 characters)', () => {
    const long = projects.paccDeletionEntry({ ...project, name: 'x'.repeat(600) }, user('admin'), openCase, NOW);
    assert.ok(long.summary.length <= 500 && long.summary.length >= 3);
  });
});

describe('open requests when the Admin deletes the project directly', () => {
  it('a pending request is cancelled with the Admin as decider and a note', () => {
    assert.deepEqual(projects.adminDeleteCancelPatch({ status: 'pending', decision_note: null }, 'admin-1', NOW), {
      status: 'cancelled', decided_by: 'admin-1', decided_at: NOW.toISOString(), decision_note: 'The System Administrator deleted the project.',
    });
  });
  it('an approved request keeps who approved it, when, and their note', () => {
    const patch = projects.adminDeleteCancelPatch({ status: 'approved', decision_note: 'Duplicate, approved.' }, 'admin-2', NOW);
    assert.deepEqual(patch, { status: 'cancelled' });
  });
  it('an approved request without a note gets the note only', () => {
    assert.deepEqual(projects.adminDeleteCancelPatch({ status: 'approved', decision_note: null }, 'admin-2', NOW), {
      status: 'cancelled', decision_note: 'The System Administrator deleted the project.',
    });
  });
});

describe('migration 027', () => {
  const sql = readFileSync(new URL('../../../database/migrations/027_project_authority.sql', import.meta.url), 'utf8');
  const code = sql.replace(/--.*$/gm, ''); // statements only, no comments
  it('creates the deletion requests table with the six statuses', () => {
    assert.match(code, /create table if not exists public\.project_deletion_requests/);
    assert.match(code, /status in \('pending', 'approved', 'declined', 'cancelled', 'used', 'expired'\)/);
  });
  it('allows at most one open (pending or approved) request per project', () => {
    assert.match(code, /create unique index if not exists \w+\s+on public\.project_deletion_requests \(project_id\)\s+where status in \('pending', 'approved'\)/);
  });
  it('grants nothing to anon', () => {
    assert.doesNotMatch(code, /grant[^;]*\bto\s+anon\b/i);
    assert.doesNotMatch(code, /grant[^;]*pacc_case_status[^;]*;/i);
    assert.match(code, /revoke all on public\.project_deletion_requests from anon, authenticated;/);
  });
  it('lets staff read requests through RLS', () => {
    assert.match(code, /alter table public\.project_deletion_requests enable row level security/);
    assert.match(code, /on public\.project_deletion_requests\s+for select to authenticated using \(\(select private\.is_staff\(\)\)\)/);
  });
  it('a PACC status change alone does not move projects.updated_at (anon can read it), and this is set up before the backfill', () => {
    assert.match(code, /create or replace function private\.projects_set_updated_at\(\)/);
    assert.match(code, /to_jsonb\(new\) - array\['updated_at', 'public_flag', 'pacc_case_status', 'pacc_public_status'\]\)\s+= \(to_jsonb\(old\) - array\['updated_at', 'public_flag', 'pacc_case_status', 'pacc_public_status'\]\)/);
    assert.match(code, /new\.updated_at := old\.updated_at;/);
    assert.match(code, /drop trigger if exists projects_updated_at on public\.projects;\s+create trigger projects_updated_at before update on public\.projects\s+for each row execute function private\.projects_set_updated_at\(\);/);
    const trigger = code.indexOf('create trigger projects_updated_at');
    const backfill = code.indexOf('set pacc_case_status = c.status');
    const syncFn = code.indexOf('create or replace function private.sync_pacc_public_status()');
    assert.ok(trigger > 0 && trigger < backfill && trigger < syncFn, 'the projects trigger is replaced before anything writes the PACC columns');
  });
  it('adds projects.pacc_case_status, kept by the PACC trigger and appended last to v_project_summary', () => {
    assert.match(code, /add column if not exists pacc_case_status text\s+check \(pacc_case_status in \('under_investigation', 'case_filed'\)\)/);
    assert.match(code, /create or replace function private\.sync_pacc_public_status\(\)/);
    assert.match(code, /set pacc_public_status = v_public,\s+pacc_case_status\s+= v_case/);
    assert.match(code, /create or replace view public\.v_project_summary with \(security_invoker = true\) as/);
    assert.match(code, /as financial_progress,\s+p\.pacc_case_status\s+from public\.projects p/);
  });
});
