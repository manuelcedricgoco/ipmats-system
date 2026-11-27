import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import request from 'supertest';

const PROJECT = '9f343767-8d98-5863-903c-3bc97288d015';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const DESC = 'The road surface is already cracked.';
let app;
let n = 0;
// Limiters are module singletons (3 per day): a unique forwarded address per request.
const ip = () => `198.51.100.${(n += 1)}`;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

const post = () => request(app).post(`/api/public/projects/${PROJECT}/reports`).set('X-Forwarded-For', ip());

describe('public citizen reports', () => {
  it('a report needs proof', async () => {
    const res = await post().field('category', 'other').field('description', DESC);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Attach at least one photo as proof.');
  });
  it('a report needs a category and a 20-character description', async () => {
    const photo = (r) => r.attach('proof', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal((await photo(post().field('category', 'x').field('description', DESC))).status, 400);
    assert.equal((await photo(post().field('category', 'other').field('description', 'x'.repeat(19)))).status, 400);
  });
  it('a non-image proof is refused', async () => {
    const res = await post()
      .field('category', 'other')
      .field('description', DESC)
      .attach('proof', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { filename: 'a.svg', contentType: 'image/png' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'The file is not a JPEG, PNG or WebP image.');
  });
  it('a valid report without a service key gets the read-only 503', async () => {
    const res = await post().field('category', 'other').field('description', DESC).attach('proof', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(res.status, 503);
  });
  it('the tracking lookup rejects malformed codes', async () => {
    const res = await request(app).get('/api/public/reports/abc').set('X-Forwarded-For', ip());
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Enter the 10-character tracking code.');
  });
  it('a well-formed code needs the service key (503 when read-only)', async () => {
    const res = await request(app).get('/api/public/reports/abcde23456').set('X-Forwarded-For', ip());
    assert.equal(res.status, 503);
  });
  it('public report routes never write the activity log', () => {
    const src = readFileSync(new URL('../controllers/citizenReportsController.js', import.meta.url), 'utf8');
    for (const banned of ['logActivity', 'req.user', 'req.ip', 'req.headers', 'req.get(', 'console.']) assert.ok(!src.includes(banned), banned);
  });
});
