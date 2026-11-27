import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { cleanProof } from '../controllers/citizenReportsController.js';

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

// The tracking code goes in the JSON body, never in the URL (request paths end up in hosting logs next to the IP).
const checkStatus = (code) => request(app).post('/api/public/reports/status').set('X-Forwarded-For', ip()).send(code === undefined ? {} : { code });
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
  it('sign-in never runs on the report routes', async () => {
    const res = await post().set('Authorization', 'Bearer garbage').field('category', 'x').field('description', DESC).attach('proof', PNG, { filename: 'a.png', contentType: 'image/png' });
    assert.equal(res.status, 400);
    const lookup = await checkStatus('abc').set('Authorization', 'Bearer garbage');
    assert.equal(lookup.status, 400);
  });
  it('a photo with valid magic bytes but a corrupt body is a 400, not a crash', async () => {
    // Unit level: requireWriteAccess (503 without a service key) sits before the strip step in the route.
    await assert.rejects(cleanProof(PNG), (e) => e.status === 400 && e.message === 'The file is not a JPEG, PNG or WebP image.');
  });
  it('the tracking lookup rejects malformed or missing codes', async () => {
    for (const code of ['abc', undefined, 12345]) {
      const res = await checkStatus(code);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.message, 'Enter the 10-character tracking code.');
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  });
  it('a well-formed code needs the service key (503 when read-only)', async () => {
    const res = await checkStatus('abcde-23456');
    assert.equal(res.status, 503);
    assert.equal(res.headers['cache-control'], 'no-store');
  });
  it('the old lookup with the code in the URL is gone', async () => {
    const res = await request(app).get('/api/public/reports/abcde23456').set('X-Forwarded-For', ip());
    assert.equal(res.status, 404);
  });
  it('public report routes never write the activity log', () => {
    const src = readFileSync(new URL('../controllers/citizenReportsController.js', import.meta.url), 'utf8');
    for (const banned of ['logActivity', 'req.user', 'req.ip', 'req.headers', 'req.get(', 'console.']) assert.ok(!src.includes(banned), banned);
  });
});

describe('the error log', () => {
  it('a 500 logs the route pattern, never the concrete path', async () => {
    const express = (await import('express')).default;
    const { errorHandler } = await import('../middleware/errorHandler.js');
    const inner = express.Router();
    inner.get('/items/:secret', () => {
      throw new Error('boom');
    });
    const mini = express();
    mini.use('/api/x', inner);
    mini.use(errorHandler);
    const logged = [];
    const original = console.error;
    console.error = (...a) => logged.push(a.map(String).join(' '));
    try {
      const res = await request(mini).get('/api/x/items/K7Q4M2XDPA?q=1');
      assert.equal(res.status, 500);
    } finally {
      console.error = original;
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0], /^\[error\] GET (\/api\/x)?\/items\/:secret /);
    assert.ok(!logged[0].includes('K7Q4M2XDPA'));
    assert.ok(!logged[0].includes('q=1'));
  });
});
