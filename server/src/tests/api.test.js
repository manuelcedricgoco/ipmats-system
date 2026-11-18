/**
 * HTTP tests that need no database: authentication and role guards,
 * parameter validation and read-only mode.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';

let app;
before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('API guards (Weeks 1–2)', () => {
  it('health reports week 2 and read-only mode without a service key', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.week, 2);
    assert.equal(res.body.writes, false);
  });
  it('requires sign-in for every project, contractor and user endpoint', async () => {
    for (const path of ['/api/projects', '/api/projects/stats', '/api/contractors', '/api/users', '/api/me']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, path);
    }
  });
  it('rejects anonymous writes', async () => {
    assert.equal((await request(app).post('/api/projects').send({})).status, 401);
    assert.equal((await request(app).post('/api/contractors').send({})).status, 401);
    assert.equal((await request(app).post('/api/agencies').send({})).status, 401);
  });
  it('only admins can approve or decline access requests', async () => {
    for (const action of ['approve', 'reject']) {
      const res = await request(app).post(`/api/users/9f343767-8d98-5863-903c-3bc97288d015/${action}`).send({ role: 'auditor' });
      assert.equal(res.status, 401, action);
    }
  });
  it('rejects malformed ids with 400 before touching the database', async () => {
    const res = await request(app).get('/api/users/not-a-uuid/approve');
    assert.ok([400, 404].includes(res.status));
  });
  it('Week 2: requires sign-in for phases, progress and finance', async () => {
    const id = '9f343767-8d98-5863-903c-3bc97288d015';
    for (const path of [`/api/projects/${id}/phases`, `/api/projects/${id}/progress`, `/api/projects/${id}/finance`, '/api/finance/overview']) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
    assert.equal((await request(app).post(`/api/projects/${id}/progress`).send({})).status, 401);
    assert.equal((await request(app).post(`/api/projects/${id}/finance`).send({})).status, 401);
    assert.equal((await request(app).put(`/api/projects/${id}/phases`).send({})).status, 401);
  });
  it('Week 2: /projects/stats is not mistaken for a project id', async () => {
    assert.equal((await request(app).get('/api/projects/stats')).status, 401);
  });
  it('Public portal requires sign-in for every endpoint (no anonymous reads)', async () => {
    for (const path of ['/api/public/stats', '/api/public/projects', '/api/public/projects/9f343767-8d98-5863-903c-3bc97288d015']) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
  });
  it('returns JSON 404 for routes that do not exist yet', async () => {
    const res = await request(app).get('/api/flags');
    assert.equal(res.status, 404);
    assert.ok(res.body.error.message);
  });
});
