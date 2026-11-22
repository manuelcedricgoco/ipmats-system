/**
 * Delete contractor / office / user and Suspend / Lift suspension — tests that need no database:
 * sign-in guards, parameter validation and the suspension reason rule.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { userSuspend } from '../routes/schemas.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
let app;
before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('Delete and suspend — sign-in required', () => {
  it('every new route answers 401 without sign-in', async () => {
    const calls = [
      ['delete', `/api/contractors/${ID}`],
      ['delete', '/api/agencies/1'],
      ['delete', `/api/users/${ID}`],
      ['post', `/api/users/${ID}/suspend`, { reason: 'Left the agency' }],
      ['post', `/api/users/${ID}/unsuspend`],
    ];
    for (const [method, path, body] of calls) {
      const res = await request(app)[method](path).send(body ?? {});
      assert.equal(res.status, 401, `${method.toUpperCase()} ${path}`);
    }
  });
});

describe('Delete and suspend — parameter validation', () => {
  it('malformed user ids are refused with 400 before touching the database', async () => {
    assert.equal((await request(app).delete('/api/users/not-a-uuid')).status, 400);
    assert.equal((await request(app).post('/api/users/not-a-uuid/suspend').send({ reason: 'Left the agency' })).status, 400);
    assert.equal((await request(app).post('/api/users/123/unsuspend')).status, 400);
  });
  it('office ids must be numeric', async () => {
    assert.equal((await request(app).delete('/api/agencies/abc')).status, 400);
    assert.equal((await request(app).delete('/api/agencies/1;drop')).status, 400);
  });
  it('a malformed contractor id never reaches the database (sign-in is checked first on /contractors)', async () => {
    const res = await request(app).delete('/api/contractors/not-a-uuid');
    assert.ok([400, 401].includes(res.status), String(res.status));
  });
});

describe('Suspension reason', () => {
  it('requires a reason of 5 to 500 characters', () => {
    assert.equal(userSuspend.safeParse({}).success, false);
    assert.equal(userSuspend.safeParse({ reason: '' }).success, false);
    assert.equal(userSuspend.safeParse({ reason: 'abcd' }).success, false);
    assert.equal(userSuspend.safeParse({ reason: '   abcd   ' }).success, false, 'spaces do not count');
    assert.equal(userSuspend.safeParse({ reason: 'abcde' }).success, true);
    assert.equal(userSuspend.safeParse({ reason: 'x'.repeat(500) }).success, true);
    assert.equal(userSuspend.safeParse({ reason: 'x'.repeat(501) }).success, false);
    assert.equal(userSuspend.safeParse({ reason: 12345 }).success, false);
  });
  it('trims the reason before saving it', () => {
    assert.equal(userSuspend.parse({ reason: '  Left the agency  ' }).reason, 'Left the agency');
  });
});
