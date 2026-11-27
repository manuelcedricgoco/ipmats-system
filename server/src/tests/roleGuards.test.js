import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { requireApproved } from '../middleware/role.js';

function run(req) {
  let args;
  requireApproved(req, {}, (...a) => { args = a; });
  return args;
}

describe('requireApproved', () => {
  it('rejects a request with no user (401)', () => {
    assert.equal(run({ user: null })[0].status, 401);
  });
  it('rejects pending accounts (403)', () => {
    const [err] = run({ user: { profile: { approval_status: 'pending' } } });
    assert.equal(err.status, 403);
    assert.match(err.message, /once your account is approved/);
  });
  it('rejects declined accounts (403)', () => {
    assert.equal(run({ user: { profile: { approval_status: 'rejected' } } })[0].status, 403);
  });
  it('lets approved accounts through with no error', () => {
    assert.deepEqual(run({ user: { profile: { approval_status: 'approved' } } }), []);
  });
});
