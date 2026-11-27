import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { requireRole, ROLES, STAFF } from '../middleware/role.js';
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
