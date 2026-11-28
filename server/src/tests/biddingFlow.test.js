// Bidding (032): the endpoints end to end, with an in-memory stand-in for the service-role client
// (no database). The award function award_bidding_round is emulated with the rules of 032; the
// SQL itself (one transaction, triggers, RLS) was checked on a throwaway Postgres.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';

const P1 = '11111111-0000-4000-8000-000000000001'; // public, not yet awarded
const P2 = '22222222-0000-4000-8000-000000000002'; // Bravo's project (registered with a contractor)
const P3 = '33333333-0000-4000-8000-000000000003'; // not public, not yet awarded
const ALPHA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BRAVO = 'bbbbbbbb-0000-4000-8000-000000000002';
const CHARLIE = 'cccccccc-0000-4000-8000-000000000003';
const DELTA = 'dddddddd-0000-4000-8000-000000000004'; // inactive

const people = {
  personnel: { id: 'per-id', role: 'dpwh_personnel', profile: { approval_status: 'approved', full_name: 'Pia Personnel' } },
  auditor: { id: 'aud-id', role: 'auditor', profile: { approval_status: 'approved', full_name: 'Ana Auditor' } },
  admin: { id: 'adm-id', role: 'admin', profile: { approval_status: 'approved', full_name: 'Al Admin' } },
  pacc: { id: 'pacc-id', role: 'pacc', profile: { approval_status: 'approved', full_name: 'Paz PACC' } },
  alpha: { id: 'rep-a', role: 'contractor', profile: { approval_status: 'approved', full_name: 'Rep Alpha', contractor_id: ALPHA, is_active: true } },
  bravo: { id: 'rep-b', role: 'contractor', profile: { approval_status: 'approved', full_name: 'Rep Bravo', contractor_id: BRAVO, is_active: true } },
};

const DEFAULTS = {
  bidding_rounds: { status: 'open', notes: null, failure_reason: null, awarded_bid_id: null, awarded_at: null, awarded_by: null },
  bids: { eligibility: 'pending', eligibility_note: null },
};

/** Unique indexes of 032 that the API relies on (23505). */
function uniqueViolation(table, rows, row) {
  if (table === 'bids') return rows.some((r) => r.round_id === row.round_id && r.contractor_id === row.contractor_id);
  if (table === 'bidding_rounds') {
    return rows.some((r) => r.project_id === row.project_id && (r.round_no === row.round_no || (['open', 'evaluated'].includes(r.status) && ['open', 'evaluated'].includes(row.status ?? 'open'))));
  }
  return false;
}

/** A tiny query builder over arrays: eq / neq / in filters, insert, update, delete, select (count/head), maybeSingle, single. */
class Query {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.filters = [];
    this.op = 'select';
    this.opts = {};
  }
  select(_cols, opts) { if (opts) this.opts = opts; return this; }
  order() { return this; }
  limit() { return this; }
  range() { return this; }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this; }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
  not() { return this; }
  insert(row) { this.op = 'insert'; this.payload = row; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  run() {
    const rows = (this.store[this.table] ??= []);
    if (this.op === 'insert') {
      if (uniqueViolation(this.table, rows, this.payload)) return { error: { code: '23505', message: 'duplicate key' } };
      const now = new Date().toISOString();
      const row = { id: randomUUID(), created_at: now, updated_at: now, ...DEFAULTS[this.table], ...this.payload };
      rows.push(row);
      return { data: [{ ...row }] };
    }
    const hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') hit.forEach((r) => Object.assign(r, this.payload, { updated_at: new Date().toISOString() }));
    if (this.op === 'delete') this.store[this.table] = rows.filter((r) => !hit.includes(r));
    return { data: hit.map((r) => ({ ...r })) };
  }
  result() {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    if (this.opts.count) return { data: this.opts.head ? null : data, count: data.length, error: null };
    return { data, error: null };
  }
  then(ok, fail) { return Promise.resolve(this.result()).then(ok, fail); }
  async maybeSingle() { const r = this.result(); return r.error ? r : { data: r.data[0] ?? null, error: null }; }
  async single() { const r = this.result(); if (r.error) return r; return r.data.length === 1 ? { data: r.data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } }; }
}

/** award_bidding_round (032), emulated: the same checks, then both writes, or nothing. */
function awardRpc(store, { p_round_id: roundId, p_bid_id: bidId, p_actor_id: actor }) {
  const fail = (message, code = 'P0001') => ({ data: null, error: { code, message } });
  if (store.rpcError) return { data: null, error: store.rpcError };
  const round = store.bidding_rounds.find((r) => r.id === roundId);
  if (!round) return fail('Bidding round not found.', 'P0002');
  if (['awarded', 'failed'].includes(round.status)) return fail('This bidding round is closed.');
  if (round.status !== 'evaluated') return fail('Evaluate the round before awarding it.');
  const project = store.projects.find((p) => p.id === round.project_id);
  if (project.contractor_id) return fail('This project already has a contractor.');
  const passed = store.bids.filter((b) => b.round_id === round.id && b.eligibility === 'passed').sort((a, b) => a.amount - b.amount);
  if (!passed.length) return fail('No bid passed. Mark the round failed and open a new one.');
  const [winner] = passed;
  if (passed.filter((b) => b.amount === winner.amount).length > 1) return fail('Two or more passed bids tie for the lowest amount.');
  if (bidId && bidId !== winner.id) return fail('Only the lowest passed bid can be awarded.');
  const at = new Date().toISOString();
  Object.assign(round, { status: 'awarded', awarded_bid_id: winner.id, awarded_at: at, awarded_by: actor });
  Object.assign(project, { contractor_id: winner.contractor_id, contract_amount: winner.amount, updated_by: actor });
  store.rpcCalls.push({ roundId, bidId, actor });
  return { data: { round_id: round.id, bid_id: winner.id, contractor_id: winner.contractor_id, amount: winner.amount, awarded_at: at }, error: null };
}

let store;
let app;
const consoleError = console.error;

function seed() {
  store = {
    projects: [
      { id: P1, project_code: '26OM0001', name: 'Road A', approved_budget: 1000, contract_amount: null, contractor_id: null, municipality_id: 1, barangay_id: null, latitude: 13.2, longitude: 120.6, status: 'not_started' },
      { id: P2, project_code: '26OM0002', name: 'Road B', approved_budget: 500, contract_amount: 500, contractor_id: BRAVO, municipality_id: 1, barangay_id: null, latitude: 13.2, longitude: 120.6, status: 'not_started' },
      { id: P3, project_code: '26OM0003', name: 'Road C', approved_budget: 2000, contract_amount: null, contractor_id: null, municipality_id: 1, barangay_id: null, latitude: 13.2, longitude: 120.6, status: 'not_started' },
    ],
    contractors: [
      { id: ALPHA, name: 'Alpha Builders', is_active: true },
      { id: BRAVO, name: 'Bravo Corp', is_active: true },
      { id: CHARLIE, name: 'Charlie Inc', is_active: true },
      { id: DELTA, name: 'Delta Old Co', is_active: false },
    ],
    bidding_rounds: [],
    bids: [],
    financial_records: [],
    profiles: Object.values(people).map((p) => ({ id: p.id, full_name: p.profile.full_name, role: p.role })),
    activity_logs: [],
    v_public_projects: [{ id: P1 }, { id: P2 }],
    rpcCalls: [],
    rpcError: null,
  };
}

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'; // a client object exists; every call below is stubbed
  const { adminClient, anonClient } = await import('../config/supabase.js');
  for (const client of [adminClient, anonClient]) {
    client.from = (table) => new Query(store, table);
    Object.defineProperty(client, 'storage', {
      configurable: true,
      value: { from: () => ({ createSignedUrls: async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }) }) },
    });
  }
  adminClient.rpc = async (fn, args) => (fn === 'award_bidding_round' ? awardRpc(store, args) : { data: null, error: { code: '42883', message: 'no such function' } });
  const api = (await import('../routes/index.js')).default;
  const { errorHandler } = await import('../middleware/errorHandler.js');
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = people[req.get('x-as')] ?? null;
    // Reads as the caller (RLS): staff and PACC see everything, a contractor only its own company's projects.
    const company = req.user?.role === 'contractor' ? req.user.profile.contractor_id : null;
    const ownProject = (id) => store.projects.find((p) => p.id === id)?.contractor_id === company;
    req.db = {
      from: (table) => {
        if (!company) return new Query(store, table);
        const view = { ...store };
        if (table === 'projects') view.projects = store.projects.filter((p) => ownProject(p.id));
        if (table === 'contractors') view.contractors = store.contractors.filter((c) => c.id === company);
        if (table === 'profiles') view.profiles = store.profiles.filter((p) => p.id === req.user.id);
        if (['bidding_rounds', 'bids'].includes(table)) view[table] = store[table].filter((r) => ownProject(r.project_id));
        return new Query(view, table);
      },
    };
    next();
  });
  app.use('/api', api);
  app.use(errorHandler);
  console.error = () => {}; // the flag re-evaluation has no real database here and logs its failure
});
after(() => {
  console.error = consoleError;
});
beforeEach(seed);

const as = (who) => {
  const go = (method, url, body) => request(app)[method](`/api${url}`).set('x-as', who).send(body ?? {});
  return {
    view: (p) => go('get', `/projects/${p}/bidding`),
    open: (p, body = { opening_date: '2026-11-20', notes: 'Posted on PhilGEPS' }) => go('post', `/projects/${p}/bidding/rounds`, body),
    editRound: (r, body) => go('patch', `/bidding/rounds/${r}`, body),
    addBid: (r, contractor_id, amount) => go('post', `/bidding/rounds/${r}/bids`, { contractor_id, amount }),
    editBid: (b, body) => go('patch', `/bidding/bids/${b}`, body),
    delBid: (b) => go('delete', `/bidding/bids/${b}`),
    evaluate: (r) => go('post', `/bidding/rounds/${r}/evaluate`),
    fail: (r, reason) => go('post', `/bidding/rounds/${r}/fail`, { reason }),
    award: (r, body) => go('post', `/bidding/rounds/${r}/award`, body),
    editProject: (p, body) => go('patch', `/projects/${p}`, body),
  };
};
const personnel = as('personnel');
const msg = (res) => res.body?.error?.message;

/** P1: round 1 with Alpha 900, Bravo 950, Charlie 1200 (above the ABC). */
async function roundWithBids() {
  const opened = await personnel.open(P1);
  assert.equal(opened.status, 201, JSON.stringify(opened.body));
  const roundId = opened.body.data.round_id;
  const ids = {};
  for (const [key, c, amount] of [['alpha', ALPHA, 900], ['bravo', BRAVO, 950], ['charlie', CHARLIE, 1200]]) {
    const res = await personnel.addBid(roundId, c, amount);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    ids[key] = res.body.data.bid_id;
  }
  return { roundId, ids };
}
async function evaluated() {
  const r = await roundWithBids();
  await personnel.editBid(r.ids.alpha, { eligibility: 'passed' });
  await personnel.editBid(r.ids.bravo, { eligibility: 'passed' });
  await personnel.editBid(r.ids.charlie, { eligibility: 'failed', eligibility_note: 'Bid above the ABC' });
  const ev = await personnel.evaluate(r.roundId);
  assert.equal(ev.status, 200, JSON.stringify(ev.body));
  return r;
}

describe('opening a round', () => {
  it('DPWH Personnel open round 1 with the approved budget as ABC; logged', async () => {
    const res = await personnel.open(P1);
    assert.equal(res.status, 201);
    const [round] = res.body.data.rounds;
    assert.equal(round.round_no, 1);
    assert.equal(round.status, 'open');
    assert.equal(round.abc, 1000);
    assert.equal(round.notes, 'Posted on PhilGEPS');
    assert.equal(round.actions.can_add_bids, true);
    assert.equal(res.body.data.permissions.can_open_round, false);
    assert.equal(res.body.data.permissions.open_round_message, 'This project already has a bidding round in progress.');
    assert.equal(store.activity_logs.at(-1).action, 'bidding.round_open');
    assert.equal(store.activity_logs.at(-1).actor_role, 'dpwh_personnel');
  });
  it('one round in progress; never on a project that has a contractor (exact message)', async () => {
    await personnel.open(P1);
    const again = await personnel.open(P1);
    assert.equal(again.status, 409);
    assert.equal(msg(again), 'This project already has a bidding round in progress.');
    const p2 = await personnel.open(P2);
    assert.equal(p2.status, 409);
    assert.equal(msg(p2), 'This project already has a contractor.');
  });
  it('a race on opening (unique index) answers 409, not 500', async () => {
    store.bidding_rounds.push({ id: randomUUID(), project_id: P3, round_no: 1, status: 'failed', abc: 2000 });
    const realFrom = (await import('../config/supabase.js')).adminClient.from;
    // The round list read before the insert misses a round that another request just opened.
    store.bidding_rounds.push({ id: randomUUID(), project_id: P3, round_no: 2, status: 'open', abc: 2000, hidden: true });
    const { adminClient } = await import('../config/supabase.js');
    adminClient.from = (table) => {
      const q = realFrom(table);
      if (table === 'bidding_rounds') q.filters.push((r) => q.op !== 'select' || !r.hidden);
      return q;
    };
    try {
      const res = await personnel.open(P3);
      assert.equal(res.status, 409);
      assert.equal(msg(res), 'This project already has a bidding round in progress.');
    } finally {
      adminClient.from = realFrom;
    }
  });
  it('only DPWH Personnel write; a real date is required', async () => {
    for (const who of ['admin', 'auditor', 'pacc', 'alpha']) assert.equal((await as(who).open(P1)).status, 403, who);
    assert.equal((await personnel.open(P1, { opening_date: '2026-02-31' })).status, 400);
    assert.equal((await personnel.open(P1, {})).status, 400);
    assert.equal(store.bidding_rounds.length, 0);
  });
  it('an open round edits its opening date and notes', async () => {
    const { roundId } = await roundWithBids();
    const res = await personnel.editRound(roundId, { opening_date: '2026-11-22', notes: '  ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.rounds[0].opening_date, '2026-11-22');
    assert.equal(res.body.data.rounds[0].notes, null);
    assert.equal(store.activity_logs.at(-1).action, 'bidding.round_update');
  });
});

describe('bids', () => {
  it('registered, active contractors only, one bid each; the amount is above 0', async () => {
    const { roundId } = await roundWithBids();
    const inactive = await personnel.addBid(roundId, DELTA, 800);
    assert.equal(inactive.status, 400);
    assert.equal(msg(inactive), 'Choose an active contractor from the Contractors list.');
    assert.equal((await personnel.addBid(roundId, randomUUID(), 800)).status, 400);
    const dup = await personnel.addBid(roundId, ALPHA, 850);
    assert.equal(dup.status, 409);
    assert.equal(msg(dup), 'This contractor already has a bid in this round.');
    assert.equal((await personnel.addBid(roundId, CHARLIE, 0)).status, 400);
    assert.equal(store.bids.length, 3);
    assert.equal(store.activity_logs.filter((l) => l.action === 'bidding.bid_add').length, 3);
  });
  it('a bid above the ABC is recorded but cannot pass; failed needs a reason', async () => {
    const { ids } = await roundWithBids();
    const pass = await personnel.editBid(ids.charlie, { eligibility: 'passed' });
    assert.equal(pass.status, 400);
    assert.equal(msg(pass), 'A bid above the ABC cannot pass.');
    const noNote = await personnel.editBid(ids.charlie, { eligibility: 'failed' });
    assert.equal(noNote.status, 400);
    assert.equal(msg(noNote), 'Give a reason (5–500 characters) why this bid failed.');
    const ok = await personnel.editBid(ids.charlie, { eligibility: 'failed', eligibility_note: 'Bid above the ABC' });
    assert.equal(ok.status, 200);
    const charlie = ok.body.data.rounds[0].bids.find((b) => b.id === ids.charlie);
    assert.equal(charlie.above_abc, true);
    assert.equal(charlie.eligibility_note, 'Bid above the ABC');
    assert.equal(store.activity_logs.at(-1).action, 'bidding.bid_update');
  });
  it('while open: amount changes and removal; others cannot', async () => {
    const { ids } = await roundWithBids();
    const res = await personnel.editBid(ids.alpha, { amount: '905.50' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.rounds[0].bids.find((b) => b.id === ids.alpha).amount, 905.5);
    for (const who of ['admin', 'auditor', 'alpha']) assert.equal((await as(who).editBid(ids.alpha, { amount: 1 })).status, 403, who);
    const del = await personnel.delBid(ids.bravo);
    assert.equal(del.status, 200);
    assert.equal(del.body.data.rounds[0].bids.length, 2);
    assert.equal(store.activity_logs.at(-1).action, 'bidding.bid_delete');
  });
  it('a bid changed by someone else in between gets 409', async () => {
    const { ids } = await roundWithBids();
    const { adminClient } = await import('../config/supabase.js');
    const realFrom = adminClient.from;
    adminClient.from = (table) => {
      const q = realFrom(table);
      // Another edit lands between the read and the conditional update.
      if (table === 'bids' && q.store === store) {
        const update = q.update.bind(q);
        q.update = (patch) => {
          store.bids.find((b) => b.id === ids.alpha).amount = 777;
          return update(patch);
        };
      }
      return q;
    };
    try {
      const res = await personnel.editBid(ids.alpha, { eligibility: 'passed' });
      assert.equal(res.status, 409);
      assert.equal(msg(res), 'This bidding round was changed by someone else. Reload and try again.');
    } finally {
      adminClient.from = realFrom;
    }
    assert.equal(store.bids.find((b) => b.id === ids.alpha).eligibility, 'pending');
  });
});

describe('evaluating', () => {
  it('needs every bid passed or failed (exact message); then ranks the passed bids', async () => {
    const { roundId, ids } = await roundWithBids();
    const early = await personnel.evaluate(roundId);
    assert.equal(early.status, 409);
    assert.equal(msg(early), 'Set every bid to passed or failed before evaluating.');
    await personnel.editBid(ids.alpha, { eligibility: 'passed' });
    await personnel.editBid(ids.bravo, { eligibility: 'passed' });
    await personnel.editBid(ids.charlie, { eligibility: 'failed', eligibility_note: 'Bid above the ABC' });
    const res = await personnel.evaluate(roundId);
    assert.equal(res.status, 200);
    const [round] = res.body.data.rounds;
    assert.equal(round.status, 'evaluated');
    assert.deepEqual(round.bids.map((b) => [b.contractor_name, b.rank]), [['Alpha Builders', 1], ['Bravo Corp', 2], ['Charlie Inc', null]]);
    assert.equal(round.actions.can_award, true);
    assert.equal(round.actions.award_bid_id, ids.alpha);
    assert.equal(store.activity_logs.at(-1).action, 'bidding.evaluate');
  });
  it('a round without bids cannot be evaluated', async () => {
    const { body } = await personnel.open(P1);
    const res = await personnel.evaluate(body.data.round_id);
    assert.equal(res.status, 409);
    assert.equal(msg(res), 'Add at least one bid before evaluating.');
  });
  it('after evaluation: no new bids, amounts or removals, no round edits; eligibility can still change', async () => {
    const { roundId, ids } = await evaluated();
    for (const res of [await personnel.addBid(roundId, CHARLIE, 1), await personnel.editBid(ids.alpha, { amount: 800 }), await personnel.delBid(ids.charlie)]) {
      assert.equal(res.status, 409, JSON.stringify(res.body));
      assert.equal(msg(res), 'Bids can only be added, changed or removed while the round is open.');
    }
    assert.equal((await personnel.editRound(roundId, { notes: 'late note' })).status, 409);
    assert.equal((await personnel.editBid(ids.alpha, { eligibility: 'pending' })).status, 409);
    const post = await personnel.editBid(ids.alpha, { eligibility: 'failed', eligibility_note: 'Failed post-qualification' });
    assert.equal(post.status, 200);
    assert.equal(post.body.data.rounds[0].actions.award_bid_id, ids.bravo, 'the next lowest is now rank 1');
  });
});

describe('the award', () => {
  it('only the lowest passed bid (exact message)', async () => {
    const { roundId, ids } = await evaluated();
    const res = await personnel.award(roundId, { bid_id: ids.bravo });
    assert.equal(res.status, 409);
    assert.equal(msg(res), 'Only the lowest passed bid can be awarded.');
    assert.equal(store.rpcCalls.length, 0);
  });
  it('awards the rank-1 bid: the project gets the contractor and the contract amount; logged', async () => {
    const { roundId, ids } = await evaluated();
    const res = await personnel.award(roundId, {});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(store.rpcCalls, [{ roundId, bidId: ids.alpha, actor: 'per-id' }], 'one call: both changes in one transaction');
    const p1 = store.projects.find((p) => p.id === P1);
    assert.equal(p1.contractor_id, ALPHA);
    assert.equal(p1.contract_amount, 900);
    const [round] = res.body.data.rounds;
    assert.equal(round.status, 'awarded');
    assert.equal(round.awarded_bid_id, ids.alpha);
    assert.equal(round.awarded_by_name, 'Pia Personnel');
    assert.deepEqual(round.bids.map((b) => b.is_winner), [true, false, false]);
    assert.equal(res.body.data.project.contract_locked, true);
    assert.equal(res.body.data.project.contractor_id, ALPHA);
    assert.equal(Object.values(round.actions).filter((v) => v === true).length, 0);
    const log = store.activity_logs.at(-1);
    assert.equal(log.action, 'bidding.award');
    assert.equal(log.details.contractor_id, ALPHA);
    assert.equal(log.details.amount, 900);
  });
  it('only from an evaluated round, only when the project has no contractor', async () => {
    const { roundId, ids } = await roundWithBids();
    const early = await personnel.award(roundId, {});
    assert.equal(early.status, 409);
    assert.equal(msg(early), 'Evaluate the round before awarding it.');
    await personnel.editBid(ids.alpha, { eligibility: 'passed' });
    await personnel.editBid(ids.bravo, { eligibility: 'passed' });
    await personnel.editBid(ids.charlie, { eligibility: 'failed', eligibility_note: 'Bid above the ABC' });
    await personnel.evaluate(roundId);
    store.projects.find((p) => p.id === P1).contractor_id = BRAVO; // set on the project form meanwhile
    const res = await personnel.award(roundId, {});
    assert.equal(res.status, 409);
    assert.equal(msg(res), 'This project already has a contractor.');
    assert.equal(store.rpcCalls.length, 0);
    assert.equal(store.bidding_rounds[0].status, 'evaluated');
  });
  it('a refusal by the database (P0001) is 409 with its reason, and nothing changed', async () => {
    const { roundId } = await evaluated();
    store.rpcError = { code: 'P0001', message: 'This project already has a contractor.' };
    const res = await personnel.award(roundId, {});
    assert.equal(res.status, 409);
    assert.equal(msg(res), 'This project already has a contractor.');
    assert.equal(store.bidding_rounds[0].status, 'evaluated');
    assert.equal(store.projects.find((p) => p.id === P1).contractor_id, null);
    assert.equal(store.activity_logs.some((l) => l.action === 'bidding.award'), false);
  });
  it('a failed call leaves no half state: round and project both unchanged (500)', async () => {
    const { roundId } = await evaluated();
    store.rpcError = { code: 'XX000', message: 'connection lost' };
    const res = await personnel.award(roundId, {});
    assert.equal(res.status, 500);
    assert.equal(store.bidding_rounds[0].status, 'evaluated');
    assert.equal(store.bidding_rounds[0].awarded_bid_id, null);
    const p1 = store.projects.find((p) => p.id === P1);
    assert.equal(p1.contractor_id, null);
    assert.equal(p1.contract_amount, null);
  });
  it('the winning bid cannot lower the contract below what is already disbursed', async () => {
    const { roundId } = await evaluated();
    store.financial_records.push({ id: randomUUID(), project_id: P1, record_type: 'disbursement', amount: 950 });
    const res = await personnel.award(roundId, {});
    assert.equal(res.status, 400);
    assert.match(msg(res), /cannot be lowered below what is already disbursed/);
    assert.equal(store.rpcCalls.length, 0);
  });
  it('a tie for the lowest passed amount is not awarded', async () => {
    const { roundId, ids } = await roundWithBids();
    await personnel.editBid(ids.bravo, { amount: 900 });
    await personnel.editBid(ids.alpha, { eligibility: 'passed' });
    await personnel.editBid(ids.bravo, { eligibility: 'passed' });
    await personnel.editBid(ids.charlie, { eligibility: 'failed', eligibility_note: 'Above the ABC' });
    await personnel.evaluate(roundId);
    const res = await personnel.award(roundId, {});
    assert.equal(res.status, 409);
    assert.match(msg(res), /tie for the lowest amount/);
  });
  it('awarded rounds are final; no new round on the awarded project', async () => {
    const { roundId, ids } = await evaluated();
    await personnel.award(roundId, {});
    for (const res of [
      await personnel.fail(roundId, 'Changed our mind'),
      await personnel.award(roundId, {}),
      await personnel.editBid(ids.bravo, { eligibility: 'failed', eligibility_note: 'Too late now' }),
      await personnel.delBid(ids.bravo),
      await personnel.addBid(roundId, CHARLIE, 100),
      await personnel.editRound(roundId, { notes: 'x' }),
      await personnel.evaluate(roundId),
    ]) {
      assert.equal(res.status, 409);
      assert.equal(msg(res), 'This bidding round is closed.');
    }
    const next = await personnel.open(P1);
    assert.equal(next.status, 409);
    assert.equal(msg(next), 'This project already has a contractor.');
  });
});

describe('failure of bidding', () => {
  it('needs a reason; then the next round opens as round 2; all rounds stay visible', async () => {
    const { body } = await personnel.open(P3);
    const roundId = body.data.round_id;
    for (const reason of [undefined, 'abc', 'x'.repeat(501)]) {
      const res = await personnel.fail(roundId, reason);
      assert.equal(res.status, 400);
      assert.equal(msg(res), 'Give a reason (5–500 characters) for the failure of bidding.');
    }
    const failed = await personnel.fail(roundId, '  No bidder submitted a bid  ');
    assert.equal(failed.status, 200);
    assert.equal(failed.body.data.rounds[0].status, 'failed');
    assert.equal(failed.body.data.rounds[0].failure_reason, 'No bidder submitted a bid');
    assert.equal(store.activity_logs.at(-1).action, 'bidding.fail');
    assert.equal((await personnel.fail(roundId, 'Once more please')).status, 409);
    const next = await personnel.open(P3, { opening_date: '2026-12-01' });
    assert.equal(next.status, 201);
    assert.deepEqual(next.body.data.rounds.map((r) => [r.round_no, r.status]), [[1, 'failed'], [2, 'open']]);
  });
  it('an evaluated round can fail too', async () => {
    const { roundId } = await evaluated();
    const res = await personnel.fail(roundId, 'All bidders failed post-qualification');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.permissions.can_open_round, true);
  });
});

describe('the project form after an award', () => {
  it('refuses another contractor or contract amount (exact message); same values and other fields pass', async () => {
    const { roundId } = await evaluated();
    await personnel.award(roundId, {});
    const other = await personnel.editProject(P1, { contractor_id: BRAVO });
    assert.equal(other.status, 409);
    assert.equal(msg(other), 'The contractor and contract amount were set by the bidding award.');
    const amount = await personnel.editProject(P1, { contract_amount: 950 });
    assert.equal(amount.status, 409);
    assert.equal(msg(amount), 'The contractor and contract amount were set by the bidding award.');
    const same = await personnel.editProject(P1, { name: 'Road A (renamed)', contractor_id: ALPHA, contract_amount: 900 });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    const p1 = store.projects.find((p) => p.id === P1);
    assert.equal(p1.name, 'Road A (renamed)');
    assert.equal(p1.contractor_id, ALPHA);
  });
  it('a project without an award is edited as before', async () => {
    const res = await personnel.editProject(P2, { contractor_id: CHARLIE, contract_amount: 400 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(store.projects.find((p) => p.id === P2).contractor_id, CHARLIE);
    const p3 = await personnel.editProject(P3, { contractor_id: ALPHA, contract_amount: 1500 });
    assert.equal(p3.status, 200);
  });
});

describe('who reads what', () => {
  it('staff read every project; Personnel get the buttons, the Admin and the Auditor do not', async () => {
    await roundWithBids();
    const per = await personnel.view(P1);
    assert.equal(per.body.data.permissions.can_manage, true);
    for (const who of ['admin', 'auditor']) {
      const res = await as(who).view(P1);
      assert.equal(res.status, 200, who);
      assert.equal(res.body.data.rounds[0].bids.length, 3);
      assert.equal(res.body.data.permissions.can_manage, false);
      assert.equal(res.body.data.permissions.can_open_round, false);
      assert.equal(Object.values(res.body.data.rounds[0].actions).filter((v) => v === true).length, 0);
    }
  });
  it('a contractor reads its own company\'s project only, with every bidder\'s name; never writes', async () => {
    const { roundId } = await evaluated();
    await personnel.award(roundId, {});
    const own = await as('alpha').view(P1);
    assert.equal(own.status, 200);
    assert.deepEqual(own.body.data.rounds[0].bids.map((b) => b.contractor_name), ['Alpha Builders', 'Bravo Corp', 'Charlie Inc']);
    assert.equal(own.body.data.permissions.can_manage, false);
    assert.equal((await as('bravo').view(P1)).status, 404, 'another company\'s project is not found');
    assert.equal((await as('bravo').view(P3)).status, 404);
    assert.equal((await as('alpha').award(roundId, {})).status, 403);
  });
  it('PACC: only through its project view, read-only, with the same rounds', async () => {
    await evaluated();
    assert.equal((await as('pacc').view(P1)).status, 403);
    store.v_project_summary = store.projects.map((p) => ({ ...p }));
    const res = await request(app).get(`/api/pacc/projects/${P1}`).set('x-as', 'pacc');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { bidding } = res.body.data;
    assert.equal(bidding.rounds.length, 1);
    assert.equal(bidding.rounds[0].bids[0].rank, 1);
    assert.equal(bidding.permissions.can_manage, false);
    assert.equal(Object.values(bidding.rounds[0].actions).filter((v) => v === true).length, 0);
  });
  it('the public: an open round without its bids', async () => {
    await roundWithBids();
    const res = await request(app).get(`/api/public/projects/${P1}/bidding`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.rounds, [{ round_no: 1, status: 'open', opening_date: '2026-11-20', abc: 1000, failure_reason: null, awarded_at: null, bids: [] }]);
    assert.equal(JSON.stringify(res.body).includes('Alpha'), false);
  });
  it('the public: the abstract of bids once evaluated, safe fields only', async () => {
    const { roundId } = await evaluated();
    await personnel.award(roundId, {});
    const res = await request(app).get(`/api/public/projects/${P1}/bidding`);
    assert.equal(res.status, 200);
    const [round] = res.body.data.rounds;
    assert.equal(round.status, 'awarded');
    assert.ok(round.awarded_at);
    assert.deepEqual(round.bids, [
      { contractor_name: 'Alpha Builders', amount: 900, eligibility: 'passed', eligibility_note: null, rank: 1, is_winner: true },
      { contractor_name: 'Bravo Corp', amount: 950, eligibility: 'passed', eligibility_note: null, rank: 2, is_winner: false },
      { contractor_name: 'Charlie Inc', amount: 1200, eligibility: 'failed', eligibility_note: 'Bid above the ABC', rank: null, is_winner: false },
    ]);
    const json = JSON.stringify(res.body);
    for (const leak of ['per-id', 'Pia', 'PhilGEPS', ALPHA, BRAVO, CHARLIE, roundId, ...store.bids.map((b) => b.id), 'awarded_by', 'created_by', 'notes']) assert.equal(json.includes(leak), false, leak);
  });
  it('the public: a failed round with its reason; a project that is not public is not found', async () => {
    const { body } = await personnel.open(P1);
    await personnel.fail(body.data.round_id, 'No bidder submitted a bid');
    const res = await request(app).get(`/api/public/projects/${P1}/bidding`);
    assert.equal(res.body.data.rounds[0].failure_reason, 'No bidder submitted a bid');
    await personnel.open(P3);
    assert.equal((await request(app).get(`/api/public/projects/${P3}/bidding`)).status, 404);
  });
});

describe('deleting a contractor', () => {
  it('a contractor with bids on record is kept (409); deactivate it instead', async () => {
    await roundWithBids();
    const res = await request(app).delete(`/api/contractors/${CHARLIE}`).set('x-as', 'admin');
    assert.equal(res.status, 409);
    assert.match(msg(res), /bid\(s\) on record/);
    assert.ok(store.contractors.some((c) => c.id === CHARLIE));
  });
});
