// Open public portal and admin approval: guards that need no database.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.SUPABASE_URL ||= 'http://127.0.0.1:9'; // unreachable on purpose
process.env.SUPABASE_ANON_KEY ||= 'test-anon';
const { requireRole, ROLES, STAFF } = await import('../middleware/role.js');
const { STAT_GROUPS } = await import('../controllers/publicController.js');
const { userCreate, userUpdate } = await import('../routes/schemas.js');

const run = (mw, user) => new Promise((resolve) => mw({ user }, {}, (err) => resolve(err ?? null)));
const user = (role, approval_status) => ({ id: 'u1', role, profile: { role, approval_status } });

describe('staff guard and approval', () => {
  it('refuses accounts waiting for approval or declined, even if a role were set', async () => {
    for (const status of ['pending', 'rejected']) {
      for (const role of [null, ROLES.PERSONNEL]) {
        const err = await run(requireRole(STAFF), user(role, status));
        assert.equal(err?.status, 403, `${role} / ${status}`);
      }
    }
  });
  it('lets approved staff through and still checks the role', async () => {
    assert.equal(await run(requireRole(STAFF), user(ROLES.AUDITOR, 'approved')), null);
    assert.equal((await run(requireRole(ROLES.ADMIN), user(ROLES.AUDITOR, 'approved')))?.status, 403);
    assert.equal((await run(requireRole(STAFF), null))?.status, 401);
  });
  it('has no public role any more', () => {
    assert.equal(Object.values(ROLES).includes('public'), false);
    assert.equal(userCreate.safeParse({ email: 'a@b.ph', password: '12345678', full_name: 'A B', role: 'public' }).success, false);
    assert.equal(userUpdate.safeParse({ role: 'public' }).success, false);
  });
});

describe('landing-page counters', () => {
  it('maps statuses to the cards as agreed (delayed or stalled = delayed + suspended)', () => {
    assert.deepEqual(STAT_GROUPS, { ongoing: ['ongoing'], completed: ['completed'], delayed_or_stalled: ['delayed', 'suspended'] });
  });
});
