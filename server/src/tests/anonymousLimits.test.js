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

test('a rejected attempt does not use the project quota', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.post('/r/:id', reportProjectLimiter, (req, s) => s.sendStatus(req.query.bad ? 400 : 204));
  const ip = '198.51.100.4';
  await request(app).post('/r/p9?bad=1').set('X-Forwarded-For', ip).expect(400);
  await request(app).post('/r/p9').set('X-Forwarded-For', ip).expect(204);
  await request(app).post('/r/p9').set('X-Forwarded-For', ip).expect(429);
});

test('failed tracking lookups still count against the limit', async () => {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/g', trackingLookupLimiter, (_q, s) => s.sendStatus(404));
  const ip = '198.51.100.5';
  for (let i = 0; i < 20; i += 1) await request(app).get('/g').set('X-Forwarded-For', ip).expect(404);
  await request(app).get('/g').set('X-Forwarded-For', ip).expect(429);
});

test('IPv6 addresses in the same /64 share a key; different /64s do not', () => {
  const now = new Date();
  const key = (ip) => anonKey({ ip }, now);
  assert.equal(key('2001:db8:1:2::1'), key('2001:db8:1:2:ffff:abcd:1234:5678'));
  assert.equal(key('2001:0db8:0001:0002:0000:0000:0000:0001'), key('2001:db8:1:2::9'));
  assert.notEqual(key('2001:db8:1:2::1'), key('2001:db8:1:3::1'));
  assert.notEqual(key('2001:db8:1:2::1'), key('2001:db8:2:2::1'));
});

test('IPv4 is keyed by the full address, also when IPv4-mapped', async () => {
  const { limiterAddress } = await import('../middleware/anonymousLimits.js');
  const now = new Date();
  assert.equal(limiterAddress('203.0.113.9'), '203.0.113.9');
  assert.equal(limiterAddress('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(anonKey({ ip: '::ffff:203.0.113.9' }, now), anonKey({ ip: '203.0.113.9' }, now));
  assert.notEqual(anonKey({ ip: '203.0.113.9' }, now), anonKey({ ip: '203.0.113.10' }, now));
  assert.equal(limiterAddress('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(limiterAddress('::1'), '0:0:0:0::/64');
  assert.equal(limiterAddress(undefined), 'unknown');
});
