import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  anonKey,
  reportSubmitLimiter,
  reportProjectLimiter,
  trackingLookupLimiter,
} from '../middleware/anonymousLimits.js';

// Limiters are module singletons; every test uses its own X-Forwarded-For so keys never collide.
function appWith(limiter, path = '/r/:id') {
  const app = express();
  app.set('trust proxy', 1);
  app.post(path, limiter, (_q, s) => s.sendStatus(204));
  return app;
}

test('the key never contains the IP', () => {
  const key = anonKey({ ip: '203.0.113.9' });
  assert.ok(!key.includes('203.0.113.9'));
  assert.match(key, /^a:[0-9a-f]{64}$/);
});

test('the key is stable within a day and changes the next day', () => {
  const now = new Date('2026-11-27T04:00:00Z');
  const next = new Date(now.getTime() + 24 * 3600 * 1000);
  assert.equal(anonKey({ ip: '1.1.1.1' }, now), anonKey({ ip: '1.1.1.1' }, now));
  assert.notEqual(anonKey({ ip: '1.1.1.1' }, now), anonKey({ ip: '1.1.1.1' }, next));
});

test('a signed-in caller is keyed the same as anonymous', () => {
  const now = new Date();
  assert.equal(anonKey({ ip: 'x', user: { id: 'u1' } }, now), anonKey({ ip: 'x' }, now));
});

test('the fourth report in a day is refused', async () => {
  const app = appWith(reportSubmitLimiter);
  const ip = '198.51.100.1';
  for (const id of ['a', 'b', 'c']) {
    await request(app).post(`/r/${id}`).set('X-Forwarded-For', ip).expect(204);
  }
  const res = await request(app).post('/r/d').set('X-Forwarded-For', ip).expect(429);
  assert.equal(res.body.error.message, 'Too many reports from this connection today. Please try again tomorrow.');
});

test('a second report on the same project the same day is refused', async () => {
  const app = appWith(reportProjectLimiter);
  const ip = '198.51.100.2';
  await request(app).post('/r/p1').set('X-Forwarded-For', ip).expect(204);
  const res = await request(app).post('/r/p1').set('X-Forwarded-For', ip).expect(429);
  assert.equal(res.body.error.message, 'Too many reports from this connection today. Please try again tomorrow.');
  await request(app).post('/r/p2').set('X-Forwarded-For', ip).expect(204);
});

test('the 21st tracking lookup in an hour is refused', async () => {
  const app = appWith(trackingLookupLimiter);
  const ip = '198.51.100.3';
  for (let i = 0; i < 20; i += 1) {
    await request(app).post('/r/x').set('X-Forwarded-For', ip).expect(204);
  }
  const res = await request(app).post('/r/x').set('X-Forwarded-For', ip).expect(429);
  assert.equal(res.body.error.message, 'Too many checks. Please try again later.');
});
