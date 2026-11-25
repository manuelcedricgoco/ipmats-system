/**
 * Rate-limit keys and proxy hop count. env.js is frozen on first import, so
 * everything that pulls it in is imported dynamically after the env is set.
 */
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

let rateLimitKey;
let parseTrustProxy;
let createApp;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  process.env.TRUST_PROXY = '2';
  ({ rateLimitKey } = await import('../middleware/rateLimits.js'));
  ({ parseTrustProxy } = await import('../config/env.js'));
  ({ createApp } = await import('../app.js'));
});

describe('rate limit keys', () => {
  it('keys a signed-in user by id', () => {
    assert.equal(rateLimitKey({ user: { id: 'abc' }, ip: '1.2.3.4' }), 'u:abc');
  });
  it('keys an anonymous request by ip', () => {
    assert.equal(rateLimitKey({ user: null, ip: '1.2.3.4' }), 'ip:1.2.3.4');
  });
  it('has a key without X-Forwarded-For', () => {
    assert.equal(rateLimitKey({ user: null, ip: undefined }), 'ip:unknown');
  });
});

describe('proxy hop count', () => {
  it('app honours TRUST_PROXY', () => {
    assert.equal(createApp().get('trust proxy'), 2);
  });
  it('falls back to 1 for values that are not non-negative integers', () => {
    assert.equal(parseTrustProxy('abc'), 1);
    assert.equal(parseTrustProxy('-1'), 1);
    assert.equal(parseTrustProxy('1.5'), 1);
    assert.equal(parseTrustProxy(undefined), 1);
    assert.equal(parseTrustProxy('0'), 0);
    assert.equal(parseTrustProxy('3'), 3);
  });
});
