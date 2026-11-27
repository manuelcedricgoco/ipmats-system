import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { canReadContractors } from '../controllers/referenceController.js';
import { assertNotPaccAccount } from '../controllers/usersController.js';
import { suspendedMessage } from '../middleware/auth.js';
import { paccMemberCreate, userApprove, userCreate, userUpdate } from '../routes/schemas.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
let app;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('the administrator cannot act on PACC accounts', () => {
  it('the admin schemas refuse the PACC role', () => {
    const base = { email: 'a@b.ph', password: 'password1', full_name: 'Ana Cruz' };
    assert.equal(userCreate.safeParse({ ...base, role: 'pacc' }).success, false);
    assert.equal(userCreate.safeParse({ ...base, role: 'auditor' }).success, true);
    assert.equal(userUpdate.safeParse({ role: 'pacc' }).success, false);
    assert.equal(userApprove.safeParse({ role: 'pacc' }).success, false);
  });

  it('assertNotPaccAccount refuses PACC targets', () => {
    assert.throws(() => assertNotPaccAccount({ role: 'pacc' }), (e) => e.status === 403 && e.message === 'PACC accounts are managed by PACC.');
    assert.doesNotThrow(() => assertNotPaccAccount({ role: 'auditor' }));
    assert.doesNotThrow(() => assertNotPaccAccount({ role: null }));
  });
});

describe('PACC-facing account messages', () => {
  it('a suspended PACC account is told to ask another PACC member', () => {
    assert.equal(suspendedMessage('pacc'), 'Your account is suspended. Ask another PACC member to lift the suspension.');
    assert.equal(
      suspendedMessage('auditor'),
      'This account has been suspended by the System Administrator. Contact the System Administrator to lift the suspension.',
    );
    assert.equal(suspendedMessage(null), suspendedMessage('admin'));
  });
});

describe('the contractor list in /reference', () => {
  const approved = (role) => ({ role, profile: { approval_status: 'approved' } });
  it('is given to approved staff and approved PACC accounts', () => {
    for (const role of ['admin', 'dpwh_personnel', 'auditor', 'pacc']) assert.equal(canReadContractors(approved(role)), true, role);
  });
  it('is not given to the public, pending accounts or accounts without a role', () => {
    assert.equal(canReadContractors(null), false);
    assert.equal(canReadContractors(undefined), false);
    assert.equal(canReadContractors({ role: 'pacc', profile: { approval_status: 'pending' } }), false);
    assert.equal(canReadContractors({ role: null, profile: { approval_status: 'approved' } }), false);
  });
});

describe('PACC members', () => {
  it('member routes need sign-in', async () => {
    assert.equal((await request(app).get('/api/pacc/members')).status, 401);
    assert.equal((await request(app).post('/api/pacc/members').send({})).status, 401);
    assert.equal((await request(app).post(`/api/pacc/members/${ID}/suspend`).send({ reason: 'because' })).status, 401);
    assert.equal((await request(app).post(`/api/pacc/members/${ID}/unsuspend`)).status, 401);
    assert.equal((await request(app).delete(`/api/pacc/members/${ID}`)).status, 401);
  });

  it('paccMemberCreate validates', () => {
    const ok = { email: 'Member@Pacc.gov.ph', password: 'password1', full_name: 'Ana Cruz' };
    assert.equal(paccMemberCreate.safeParse(ok).success, true);
    assert.equal(paccMemberCreate.safeParse({ ...ok, position: 'Investigator' }).success, true);
    assert.equal(paccMemberCreate.safeParse({ ...ok, password: '1234567' }).success, false);
    assert.equal(paccMemberCreate.safeParse({ ...ok, full_name: 'A' }).success, false);
  });
});
