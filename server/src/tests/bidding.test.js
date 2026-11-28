// Bidding (032): the pure rules — ranking, evaluation readiness, state transitions, round-open
// preconditions, award eligibility (lowest passed bid ≤ ABC), bid changes, the project-form lock
// after an award, and what the public sees.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ABOVE_ABC_MESSAGE,
  ABOVE_BUDGET_MESSAGE,
  AWARD_LOCK_MESSAGE,
  BIDS_LOCKED_MESSAGE,
  ELIGIBILITY_NOTE_MESSAGE,
  EVALUATE_PENDING_MESSAGE,
  EVALUATED_PENDING_MESSAGE,
  FAIL_REASON_MESSAGE,
  HAS_CONTRACTOR_MESSAGE,
  INACTIVE_WINNER_MESSAGE,
  LOWEST_ONLY_MESSAGE,
  NO_BIDS_MESSAGE,
  NO_PASSED_MESSAGE,
  ROUND_ACTIVE_MESSAGE,
  ROUND_CLOSED_MESSAGE,
  TIE_MESSAGE,
  assertAwardLock,
  assertBidsEditable,
  assertCanEvaluate,
  assertCanOpenRound,
  awardDecision,
  bidPatch,
  checkReason,
  evaluationReadiness,
  lowestPassed,
  nextRoundStatus,
  rankBids,
  roundActions,
  toPublicRound,
} from '../services/bidding.js';

const bid = (id, amount, eligibility = 'passed', extra = {}) => ({ id, amount, eligibility, eligibility_note: eligibility === 'failed' ? 'Incomplete documents' : null, contractor_name: id.toUpperCase(), ...extra });
const round = (status = 'evaluated', extra = {}) => ({ id: 'r1', round_no: 1, status, abc: 1000, opening_date: '2026-11-20', ...extra });
const throwsWith = (fn, status, message) =>
  assert.throws(fn, (err) => {
    assert.equal(err.status, status);
    if (message) assert.equal(err.message, message);
    return true;
  });

describe('exact messages', () => {
  it('match the plan', () => {
    assert.equal(HAS_CONTRACTOR_MESSAGE, 'This project already has a contractor.');
    assert.equal(AWARD_LOCK_MESSAGE, 'The contractor and contract amount were set by the bidding award.');
    assert.equal(LOWEST_ONLY_MESSAGE, 'Only the lowest passed bid can be awarded.');
    assert.equal(ABOVE_ABC_MESSAGE, 'A bid above the ABC cannot pass.');
    assert.equal(EVALUATE_PENDING_MESSAGE, 'Set every bid to passed or failed before evaluating.');
    assert.equal(ROUND_CLOSED_MESSAGE, 'This bidding round is closed.');
  });
});

describe('rankBids', () => {
  it('ranks passed bids by amount (lowest = 1); pending and failed bids have no rank', () => {
    const out = rankBids([bid('c', 950), bid('x', 800, 'failed'), bid('a', 900), bid('p', 700, 'pending'), bid('b', '920.50')], 1000);
    assert.deepEqual(out.map((b) => [b.id, b.rank]), [['a', 1], ['b', 2], ['c', 3], ['p', null], ['x', null]]);
    assert.equal(out[1].amount, 920.5, 'amounts are numbers');
  });
  it('equal amounts share a rank (1, 1, 3); cents decide, not floating point', () => {
    const out = rankBids([bid('a', '500.10'), bid('b', 500.1), bid('c', 600)], 1000);
    assert.deepEqual(out.map((b) => b.rank), [1, 1, 3]);
  });
  it('marks bids above the ABC', () => {
    const out = rankBids([bid('a', 1000, 'pending'), bid('b', 1000.01, 'pending')], 1000);
    assert.deepEqual(out.map((b) => b.above_abc), [false, true]);
  });
  it('does not change its input', () => {
    const input = [bid('b', 2), bid('a', 1)];
    rankBids(input, 10);
    assert.deepEqual(input.map((b) => b.id), ['b', 'a']);
    assert.equal('rank' in input[0], false);
  });
});

describe('lowestPassed', () => {
  it('the unique lowest passed bid', () => {
    const r = lowestPassed([bid('a', 900), bid('b', 800), bid('c', 700, 'failed'), bid('d', 600, 'pending')]);
    assert.equal(r.winner.id, 'b');
    assert.equal(r.tied, false);
  });
  it('a tie for the lowest amount has no winner', () => {
    const r = lowestPassed([bid('a', 800), bid('b', '800.00'), bid('c', 900)]);
    assert.equal(r.winner, null);
    assert.equal(r.tied, true);
    assert.deepEqual(r.lowest.map((b) => b.id), ['a', 'b']);
  });
  it('null when no bid passed', () => {
    assert.equal(lowestPassed([bid('a', 1, 'failed'), bid('b', 2, 'pending')]), null);
    assert.equal(lowestPassed([]), null);
  });
});

describe('evaluation readiness', () => {
  it('needs at least one bid and none pending', () => {
    assert.deepEqual(evaluationReadiness([]), { ready: false, message: NO_BIDS_MESSAGE });
    assert.deepEqual(evaluationReadiness([bid('a', 1), bid('b', 2, 'pending')]), { ready: false, message: EVALUATE_PENDING_MESSAGE });
    assert.deepEqual(evaluationReadiness([bid('a', 1), bid('b', 2, 'failed')]), { ready: true, message: null });
    assert.deepEqual(evaluationReadiness([bid('b', 2, 'failed')]), { ready: true, message: null }, 'all failed: evaluate, then mark the round failed');
  });
  it('assertCanEvaluate: only an open round, every bid decided (409)', () => {
    throwsWith(() => assertCanEvaluate(round('open'), [bid('a', 1, 'pending')]), 409, EVALUATE_PENDING_MESSAGE);
    throwsWith(() => assertCanEvaluate(round('open'), []), 409, NO_BIDS_MESSAGE);
    throwsWith(() => assertCanEvaluate(round('evaluated'), [bid('a', 1)]), 409);
    throwsWith(() => assertCanEvaluate(round('failed'), [bid('a', 1)]), 409, ROUND_CLOSED_MESSAGE);
    assert.equal(assertCanEvaluate(round('open'), [bid('a', 1)]), 'evaluated');
  });
});

describe('state transitions', () => {
  it('open → evaluated | failed; evaluated → awarded | failed', () => {
    assert.equal(nextRoundStatus(round('open'), 'evaluate'), 'evaluated');
    assert.equal(nextRoundStatus(round('open'), 'fail'), 'failed');
    assert.equal(nextRoundStatus(round('evaluated'), 'fail'), 'failed');
    assert.equal(nextRoundStatus(round('evaluated'), 'award'), 'awarded');
  });
  it('awarded and failed rounds are final (409 "This bidding round is closed.")', () => {
    for (const status of ['awarded', 'failed']) {
      for (const action of ['evaluate', 'fail', 'award']) throwsWith(() => nextRoundStatus(round(status), action), 409, ROUND_CLOSED_MESSAGE);
    }
  });
  it('an open round cannot be awarded, an evaluated one not evaluated again; unknown round 404', () => {
    throwsWith(() => nextRoundStatus(round('open'), 'award'), 409);
    throwsWith(() => nextRoundStatus(round('evaluated'), 'evaluate'), 409);
    throwsWith(() => nextRoundStatus(null, 'fail'), 404);
    throwsWith(() => nextRoundStatus(round('open'), 'reopen'), 400);
  });
  it('bids change only while the round is open', () => {
    assert.doesNotThrow(() => assertBidsEditable(round('open')));
    throwsWith(() => assertBidsEditable(round('evaluated')), 409, BIDS_LOCKED_MESSAGE);
    throwsWith(() => assertBidsEditable(round('awarded')), 409, ROUND_CLOSED_MESSAGE);
    throwsWith(() => assertBidsEditable(round('failed')), 409, ROUND_CLOSED_MESSAGE);
    throwsWith(() => assertBidsEditable(null), 404);
  });
});

describe('opening a round', () => {
  const project = { id: 'p1', contractor_id: null, approved_budget: 1000 };
  it('the first round is 1; after failed rounds, the next number', () => {
    assert.equal(assertCanOpenRound({ project, rounds: [] }), 1);
    assert.equal(assertCanOpenRound({ project, rounds: [round('failed', { round_no: 1 }), round('failed', { round_no: 2 })] }), 3);
  });
  it('a project that has a contractor cannot open a round (409 exact message)', () => {
    throwsWith(() => assertCanOpenRound({ project: { ...project, contractor_id: 'c1' }, rounds: [] }), 409, HAS_CONTRACTOR_MESSAGE);
    throwsWith(() => assertCanOpenRound({ project, rounds: [round('awarded')] }), 409, HAS_CONTRACTOR_MESSAGE);
  });
  it('only one round in progress', () => {
    throwsWith(() => assertCanOpenRound({ project, rounds: [round('open')] }), 409, ROUND_ACTIVE_MESSAGE);
    throwsWith(() => assertCanOpenRound({ project, rounds: [round('evaluated')] }), 409, ROUND_ACTIVE_MESSAGE);
  });
  it('unknown project 404', () => throwsWith(() => assertCanOpenRound({ project: null, rounds: [] }), 404));
});

describe('award eligibility', () => {
  const project = { id: 'p1', contractor_id: null, approved_budget: 1000 };
  const bids = [bid('a', 950), bid('b', 900), bid('c', 850, 'failed'), bid('d', 1200, 'failed')];
  it('the lowest passed bid of an evaluated round, when the project has no contractor', () => {
    assert.equal(awardDecision({ round: round(), bids, project }).id, 'b');
    assert.equal(awardDecision({ round: round(), bids, project, bidId: 'b' }).id, 'b');
  });
  it('only the lowest passed bid', () => {
    throwsWith(() => awardDecision({ round: round(), bids, project, bidId: 'a' }), 409, LOWEST_ONLY_MESSAGE);
    throwsWith(() => awardDecision({ round: round(), bids, project, bidId: 'c' }), 409, LOWEST_ONLY_MESSAGE);
  });
  it('only from an evaluated round', () => {
    throwsWith(() => awardDecision({ round: round('open'), bids, project }), 409);
    throwsWith(() => awardDecision({ round: round('awarded'), bids, project }), 409, ROUND_CLOSED_MESSAGE);
    throwsWith(() => awardDecision({ round: round('failed'), bids, project }), 409, ROUND_CLOSED_MESSAGE);
  });
  it('only when the project has no contractor', () => {
    throwsWith(() => awardDecision({ round: round(), bids, project: { ...project, contractor_id: 'x' } }), 409, HAS_CONTRACTOR_MESSAGE);
  });
  it('no passed bid, or a tie for the lowest', () => {
    throwsWith(() => awardDecision({ round: round(), bids: [bid('c', 1, 'failed')], project }), 409, NO_PASSED_MESSAGE);
    throwsWith(() => awardDecision({ round: round(), bids: [bid('a', 900), bid('b', 900)], project }), 409, TIE_MESSAGE);
    throwsWith(() => awardDecision({ round: round(), bids: [bid('a', 900), bid('b', 900)], project, bidId: 'a' }), 409, TIE_MESSAGE);
  });
  it('never above the ABC, nor above the current approved budget; never an inactive contractor', () => {
    throwsWith(() => awardDecision({ round: round('evaluated', { abc: 800 }), bids: [bid('a', 900)], project }), 409, ABOVE_ABC_MESSAGE);
    throwsWith(() => awardDecision({ round: round(), bids: [bid('a', 900)], project: { ...project, approved_budget: 899.99 } }), 409, ABOVE_BUDGET_MESSAGE);
    throwsWith(() => awardDecision({ round: round(), bids: [bid('a', 900, 'passed', { contractor_active: false })], project }), 409, INACTIVE_WINNER_MESSAGE);
    assert.equal(awardDecision({ round: round('evaluated', { abc: '900.00' }), bids: [bid('a', '900.00')], project: { ...project, approved_budget: '900' } }).id, 'a', 'equal to the ABC is fine');
  });
});

describe('bid changes', () => {
  const open = round('open');
  it('amount while open; a passed bid above the ABC is refused', () => {
    assert.deepEqual(bidPatch({ round: open, bid: bid('a', 900, 'pending'), body: { amount: 950 } }), { amount: 950 });
    throwsWith(() => bidPatch({ round: open, bid: bid('a', 900), body: { amount: 1000.01 } }), 400, ABOVE_ABC_MESSAGE);
    throwsWith(() => bidPatch({ round: open, bid: bid('a', 1200, 'pending'), body: { eligibility: 'passed' } }), 400, ABOVE_ABC_MESSAGE);
    assert.deepEqual(bidPatch({ round: open, bid: bid('a', 900), body: { amount: '900.00' } }), {}, 'unchanged amount');
  });
  it('failed needs a reason of 5–500 characters (trimmed); other results clear an old reason', () => {
    throwsWith(() => bidPatch({ round: open, bid: bid('a', 900, 'pending'), body: { eligibility: 'failed' } }), 400, ELIGIBILITY_NOTE_MESSAGE);
    throwsWith(() => bidPatch({ round: open, bid: bid('a', 900, 'pending'), body: { eligibility: 'failed', eligibility_note: '  abc ' } }), 400, ELIGIBILITY_NOTE_MESSAGE);
    throwsWith(() => bidPatch({ round: open, bid: bid('a', 900, 'pending'), body: { eligibility: 'failed', eligibility_note: 'x'.repeat(501) } }), 400, ELIGIBILITY_NOTE_MESSAGE);
    assert.deepEqual(bidPatch({ round: open, bid: bid('a', 900, 'pending'), body: { eligibility: 'failed', eligibility_note: '  No PCAB licence  ' } }), { eligibility: 'failed', eligibility_note: 'No PCAB licence' });
    assert.deepEqual(bidPatch({ round: open, bid: bid('a', 900, 'failed'), body: { eligibility: 'passed' } }), { eligibility: 'passed', eligibility_note: null });
  });
  it('evaluated round: eligibility (post-qualification) yes, amount and pending no', () => {
    const ev = round('evaluated');
    assert.deepEqual(bidPatch({ round: ev, bid: bid('a', 900), body: { eligibility: 'failed', eligibility_note: 'Failed post-qualification' } }), { eligibility: 'failed', eligibility_note: 'Failed post-qualification' });
    throwsWith(() => bidPatch({ round: ev, bid: bid('a', 900), body: { amount: 800 } }), 409, BIDS_LOCKED_MESSAGE);
    throwsWith(() => bidPatch({ round: ev, bid: bid('a', 900), body: { eligibility: 'pending' } }), 409, EVALUATED_PENDING_MESSAGE);
  });
  it('a final round: nothing changes', () => {
    for (const status of ['awarded', 'failed']) throwsWith(() => bidPatch({ round: round(status), bid: bid('a', 900), body: { eligibility: 'failed', eligibility_note: 'Too late now' } }), 409, ROUND_CLOSED_MESSAGE);
  });
});

describe('reasons', () => {
  it('trimmed, 5–500 characters, else 400 with the given message', () => {
    assert.equal(checkReason('  Only one bidder  ', FAIL_REASON_MESSAGE), 'Only one bidder');
    for (const v of [undefined, null, 42, 'abcd', '    abcd   ', 'x'.repeat(501)]) throwsWith(() => checkReason(v, FAIL_REASON_MESSAGE), 400, FAIL_REASON_MESSAGE);
  });
});

describe('project form after an award', () => {
  const current = { contractor_id: 'c1', contract_amount: '900.00' };
  it('refuses a different contractor or contract amount (409 exact message)', () => {
    throwsWith(() => assertAwardLock({ awarded: true, current, patch: { contractor_id: 'c2' } }), 409, AWARD_LOCK_MESSAGE);
    throwsWith(() => assertAwardLock({ awarded: true, current, patch: { contractor_id: null } }), 409, AWARD_LOCK_MESSAGE);
    throwsWith(() => assertAwardLock({ awarded: true, current, patch: { contract_amount: 950 } }), 409, AWARD_LOCK_MESSAGE);
    throwsWith(() => assertAwardLock({ awarded: true, current, patch: { contract_amount: null } }), 409, AWARD_LOCK_MESSAGE);
  });
  it('the edit form re-sending the same values is fine; other fields are never checked', () => {
    assert.doesNotThrow(() => assertAwardLock({ awarded: true, current, patch: { contractor_id: 'c1', contract_amount: 900, name: 'New name' } }));
    assert.doesNotThrow(() => assertAwardLock({ awarded: true, current, patch: { approved_budget: 1200 } }));
  });
  it('a project without an award is not locked', () => {
    assert.doesNotThrow(() => assertAwardLock({ awarded: false, current, patch: { contractor_id: 'c2', contract_amount: 1 } }));
  });
});

describe('round actions (Personnel buttons)', () => {
  const project = { id: 'p1', contractor_id: null, approved_budget: 1000 };
  it('open round: edit, bids, evaluate when ready, fail', () => {
    const a = roundActions({ round: round('open'), bids: [bid('a', 900, 'pending')], project, canManage: true });
    assert.equal(a.can_edit, true);
    assert.equal(a.can_add_bids, true);
    assert.equal(a.can_evaluate, false);
    assert.equal(a.evaluate_message, EVALUATE_PENDING_MESSAGE);
    assert.equal(a.can_fail, true);
    assert.equal(a.can_award, false);
  });
  it('evaluated round: award the rank-1 bid, or the reason why not', () => {
    const ok = roundActions({ round: round(), bids: [bid('a', 900), bid('b', 800)], project, canManage: true });
    assert.equal(ok.can_award, true);
    assert.equal(ok.award_bid_id, 'b');
    assert.equal(ok.can_edit, false);
    assert.equal(ok.can_set_eligibility, true);
    const tie = roundActions({ round: round(), bids: [bid('a', 800), bid('b', 800)], project, canManage: true });
    assert.equal(tie.can_award, false);
    assert.equal(tie.award_message, TIE_MESSAGE);
  });
  it('read-only viewers and final rounds: nothing', () => {
    const viewer = roundActions({ round: round('open'), bids: [], project, canManage: false });
    assert.equal(Object.entries(viewer).filter(([k, v]) => k.startsWith('can_') && v).length, 0);
    const done = roundActions({ round: round('awarded'), bids: [bid('a', 1)], project, canManage: true });
    assert.equal(Object.entries(done).filter(([k, v]) => k.startsWith('can_') && v).length, 0);
  });
});

describe('the public abstract of bids', () => {
  const full = {
    id: 'r1', round_no: 2, status: 'awarded', opening_date: '2026-11-20', abc: 1000, notes: 'internal', failure_reason: null,
    awarded_bid_id: 'b', awarded_at: '2026-11-25T00:00:00Z', awarded_by: 'person-id', awarded_by_name: 'Pia Personnel', created_by: 'person-id',
    bids: [
      { id: 'b', contractor_id: 'cb', contractor_name: 'Bravo', amount: 800, eligibility: 'passed', eligibility_note: null, rank: 1, is_winner: true, created_by: 'person-id' },
      { id: 'a', contractor_id: 'ca', contractor_name: 'Alpha', amount: 1200, eligibility: 'failed', eligibility_note: 'Above the ABC', rank: null, is_winner: false },
    ],
  };
  it('safe fields only: no ids, no people, no notes', () => {
    const out = toPublicRound(full);
    assert.deepEqual(Object.keys(out).sort(), ['abc', 'awarded_at', 'bids', 'failure_reason', 'opening_date', 'round_no', 'status']);
    assert.deepEqual(out.bids[0], { contractor_name: 'Bravo', amount: 800, eligibility: 'passed', eligibility_note: null, rank: 1, is_winner: true });
    const json = JSON.stringify(out);
    for (const leak of ['person-id', 'Pia', 'internal', '"r1"', 'cb', 'ca']) assert.equal(json.includes(leak), false, leak);
  });
  it('an open round shows no bids', () => {
    const out = toPublicRound({ ...full, status: 'open', awarded_at: null });
    assert.deepEqual(out.bids, []);
    assert.equal(out.abc, 1000);
    assert.equal(out.opening_date, '2026-11-20');
  });
});
