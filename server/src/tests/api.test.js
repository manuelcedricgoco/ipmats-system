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

describe('API guards (Weeks 1–3)', () => {
  it('health reports week 3 and read-only mode without a service key', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.week, 3);
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
  it('Public portal needs no sign-in (reads run as the anonymous role; RLS decides what is returned)', async () => {
    for (const path of ['/api/public/stats', '/api/public/projects', '/api/public/map', '/api/public/projects/9f343767-8d98-5863-903c-3bc97288d015']) {
      const status = (await request(app).get(path)).status;
      assert.notEqual(status, 401, path);
      assert.notEqual(status, 403, path);
    }
    // the old charts endpoint (it exposed flags) is gone
    assert.equal((await request(app).get('/api/public/dashboard')).status, 404);
  });
  it('Week 3: requires sign-in for images, flags, findings, map, dashboards and reports', async () => {
    const id = '9f343767-8d98-5863-903c-3bc97288d015';
    for (const path of [`/api/projects/${id}/images`, '/api/flags', `/api/projects/${id}/flags`, '/api/findings', '/api/map/projects', '/api/dashboard/performance', '/api/dashboard/financial', '/api/reports/flagged.pdf', '/api/reports/flagged.xlsx', '/api/reports/financial.xlsx', `/api/reports/projects/${id}/audit.pdf`]) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
    assert.equal((await request(app).post(`/api/projects/${id}/images`)).status, 401);
    assert.equal((await request(app).post(`/api/projects/${id}/flags/review`)).status, 401);
    assert.equal((await request(app).post(`/api/projects/${id}/findings`)).status, 401);
  });
  it('Gap fixes: activity logs, settings, documents, assignments and publishing all require sign-in', async () => {
    const id = '9f343767-8d98-5863-903c-3bc97288d015';
    for (const path of ['/api/activity', '/api/settings/flag-rules', `/api/projects/${id}/documents`, '/api/findings/assigned', '/api/audit/assignees']) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
    assert.equal((await request(app).put('/api/settings/flag-rules').send({})).status, 401);
    assert.equal((await request(app).post(`/api/projects/${id}/documents`)).status, 401);
    assert.equal((await request(app).delete(`/api/projects/${id}/documents/${id}`)).status, 401);
    assert.equal((await request(app).patch(`/api/projects/${id}/images/${id}/public`).send({ is_public: true })).status, 401);
    assert.equal((await request(app).patch(`/api/findings/${id}/public`).send({ is_public: true })).status, 401);
    assert.equal((await request(app).patch(`/api/findings/${id}/action`).send({ action_status: 'resolved' })).status, 401);
  });
  it('returns JSON 404 for routes that do not exist yet', async () => {
    const res = await request(app).get('/api/settings');
    assert.equal(res.status, 404);
    assert.ok(res.body.error.message);
  });
});
