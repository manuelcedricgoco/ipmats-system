import { describe, expect, it } from 'vitest';
import {
  ABOVE_ABC_MESSAGE,
  AWARD_LOCK_MESSAGE,
  ELIGIBILITY_NOTE_MESSAGE,
  FAIL_REASON_MESSAGE,
  awardConfirmText,
  bidAmountProblem,
  bidderOptions,
  eligibilityChoices,
  eligibilityMeta,
  eligibilityProblem,
  failReasonProblem,
  isAboveAbc,
  isContractLocked,
  publicRoundHeadline,
  rankLabel,
  roundControls,
  roundInProgress,
  roundStatusMeta,
} from './bidding.js';

const ALL_OFF = {
  can_edit: false, can_add_bids: false, can_edit_bids: false, can_set_eligibility: false, can_evaluate: false,
  evaluate_message: null, can_fail: false, can_award: false, award_bid_id: null, award_message: null,
};

describe('bidding labels', () => {
  it('labels every round status, with a fallback', () => {
    expect(roundStatusMeta('open').label).toBe('Open');
    expect(roundStatusMeta('evaluated').label).toBe('Evaluated');
    expect(roundStatusMeta('awarded').label).toBe('Awarded');
    expect(roundStatusMeta('failed').label).toBe('Failure of bidding');
    expect(roundStatusMeta('weird')).toEqual({ label: 'weird', cls: 'bg-slate-100 text-slate-700' });
    for (const s of ['open', 'evaluated', 'awarded', 'failed']) expect(roundStatusMeta(s).cls).toMatch(/bg-/);
  });
  it('labels every eligibility', () => {
    expect(eligibilityMeta('pending').label).toBe('Pending');
    expect(eligibilityMeta('passed').label).toBe('Passed');
    expect(eligibilityMeta('failed').label).toBe('Failed');
    expect(eligibilityMeta(null).label).toBe('—');
  });
  it('public headline: an open round says bidding is open', () => {
    expect(publicRoundHeadline({ status: 'open' })).toBe('Bidding open');
    expect(publicRoundHeadline({ status: 'evaluated' })).toBe('Bids evaluated, award pending');
    expect(publicRoundHeadline({ status: 'awarded' })).toBe('Awarded');
    expect(publicRoundHeadline({ status: 'failed' })).toBe('Failure of bidding');
  });
  it('rank label', () => {
    expect(rankLabel(1)).toBe('1');
    expect(rankLabel(null)).toBe('—');
    expect(rankLabel(undefined)).toBe('—');
  });
});

describe('roundControls (which buttons to show)', () => {
  const manage = { can_manage: true };
  it('shows nothing to a reader, whatever the round', () => {
    for (const status of ['open', 'evaluated', 'awarded', 'failed']) {
      const c = roundControls({ status, actions: ALL_OFF }, { can_manage: false });
      expect(c.any).toBe(false);
      expect(c.evaluate.show).toBe(false);
      expect(c.award.show).toBe(false);
    }
    // PACC / public: no permissions or actions at all
    expect(roundControls({ status: 'open' }, undefined).any).toBe(false);
  });
  it('open round for Personnel: edit, bids, eligibility, evaluate (off with the reason), fail', () => {
    const actions = { ...ALL_OFF, can_edit: true, can_add_bids: true, can_edit_bids: true, can_set_eligibility: true, can_fail: true, evaluate_message: 'Set every bid to passed or failed before evaluating.' };
    const c = roundControls({ status: 'open', actions }, manage);
    expect(c).toMatchObject({ edit: true, addBid: true, editBids: true, setEligibility: true, fail: true, any: true });
    expect(c.evaluate).toEqual({ show: true, enabled: false, message: 'Set every bid to passed or failed before evaluating.' });
    expect(c.award.show).toBe(false);
  });
  it('evaluated round: eligibility, fail and award (with the winner), no bid edits', () => {
    const actions = { ...ALL_OFF, can_set_eligibility: true, can_fail: true, can_award: true, award_bid_id: 'b1' };
    const c = roundControls({ status: 'evaluated', actions }, manage);
    expect(c).toMatchObject({ edit: false, addBid: false, editBids: false, setEligibility: true, fail: true });
    expect(c.award).toEqual({ show: true, enabled: true, bidId: 'b1', message: null });
    expect(c.evaluate.show).toBe(false);
  });
  it('evaluated round whose award is refused: the button is off with the server reason', () => {
    const actions = { ...ALL_OFF, can_set_eligibility: true, can_fail: true, award_message: 'This project already has a contractor.' };
    const c = roundControls({ status: 'evaluated', actions }, manage);
    expect(c.award).toEqual({ show: true, enabled: false, bidId: null, message: 'This project already has a contractor.' });
  });
  it('final rounds: nothing, even for Personnel', () => {
    for (const status of ['awarded', 'failed']) {
      const c = roundControls({ status, actions: ALL_OFF }, manage);
      expect(c.any).toBe(false);
      expect(c.evaluate.show).toBe(false);
      expect(c.award.show).toBe(false);
    }
  });
  it('trusts the server: a true flag on a final round is still ignored', () => {
    const c = roundControls({ status: 'awarded', actions: { ...ALL_OFF, can_edit: true, can_award: true, award_bid_id: 'b1' } }, manage);
    expect(c.any).toBe(false);
  });
});

describe('bidderOptions', () => {
  const contractors = [
    { id: 'c3', name: 'Zeta Builders', is_active: true },
    { id: 'c1', name: 'Alpha Construction', is_active: true },
    { id: 'c2', name: 'Beta Works', is_active: false },
    { id: 'c4', name: 'Gamma Corp', is_active: true },
  ];
  it('active contractors not already bidding in the round, by name', () => {
    const round = { bids: [{ contractor_id: 'c4' }] };
    expect(bidderOptions(contractors, round).map((c) => c.id)).toEqual(['c1', 'c3']);
  });
  it('handles a round without bids and a missing list', () => {
    expect(bidderOptions(contractors, { bids: [] }).map((c) => c.id)).toEqual(['c1', 'c4', 'c3']);
    expect(bidderOptions(undefined, {})).toEqual([]);
  });
});

describe('form checks', () => {
  it('bid amount', () => {
    expect(bidAmountProblem('')).toBe('Enter the bid amount.');
    expect(bidAmountProblem('abc')).toBe('Enter the bid amount.');
    expect(bidAmountProblem('0')).toBe('The bid amount must be more than 0.');
    expect(bidAmountProblem('-5')).toBe('The bid amount must be more than 0.');
    expect(bidAmountProblem('1500000.50')).toBeNull();
  });
  it('above the ABC compares whole centavos', () => {
    expect(isAboveAbc(1000.01, 1000)).toBe(true);
    expect(isAboveAbc('1000.00', 1000)).toBe(false);
    expect(isAboveAbc(999, 1000)).toBe(false);
    expect(isAboveAbc('', 1000)).toBe(false);
    expect(isAboveAbc(5, null)).toBe(false);
  });
  it('eligibility choices: pending only while open', () => {
    expect(eligibilityChoices('open')).toEqual(['pending', 'passed', 'failed']);
    expect(eligibilityChoices('evaluated')).toEqual(['passed', 'failed']);
  });
  it('eligibility: a failed bid needs a reason, a bid above the ABC cannot pass', () => {
    expect(eligibilityProblem({ eligibility: 'failed', note: ' no ' })).toBe(ELIGIBILITY_NOTE_MESSAGE);
    expect(eligibilityProblem({ eligibility: 'failed', note: 'x'.repeat(501) })).toBe(ELIGIBILITY_NOTE_MESSAGE);
    expect(eligibilityProblem({ eligibility: 'failed', note: 'Expired PCAB licence' })).toBeNull();
    expect(eligibilityProblem({ eligibility: 'passed', note: '', aboveAbc: true })).toBe(ABOVE_ABC_MESSAGE);
    expect(eligibilityProblem({ eligibility: 'passed', note: '' })).toBeNull();
    expect(eligibilityProblem({ eligibility: 'pending', note: 'x'.repeat(501) })).toBe('The note can be at most 500 characters.');
  });
  it('failure of bidding needs a reason of 5–500 characters', () => {
    expect(failReasonProblem('')).toBe(FAIL_REASON_MESSAGE);
    expect(failReasonProblem('  abc  ')).toBe(FAIL_REASON_MESSAGE);
    expect(failReasonProblem('No bidder passed')).toBeNull();
    expect(failReasonProblem('x'.repeat(501))).toBe(FAIL_REASON_MESSAGE);
  });
});

describe('award and the project form lock', () => {
  it('the award dialog says it sets the contractor and contract amount', () => {
    const text = awardConfirmText({ round_no: 2 }, { contractor_name: 'Alpha Construction', amount: 1250000 });
    expect(text).toContain('Alpha Construction');
    expect(text).toContain('₱1,250,000.00');
    expect(text).toContain("project's contractor");
    expect(text).toContain('contract amount');
    expect(text).toContain('variation orders');
  });
  it('isContractLocked reads contract_locked from the bidding view', () => {
    expect(isContractLocked({ project: { contract_locked: true } })).toBe(true);
    expect(isContractLocked({ project: { contract_locked: false } })).toBe(false);
    expect(isContractLocked(null)).toBe(false);
    expect(AWARD_LOCK_MESSAGE).toBe('The contractor and contract amount were set by the bidding award.');
  });
  it('roundInProgress finds the open or evaluated round', () => {
    expect(roundInProgress([{ id: 'a', status: 'failed' }, { id: 'b', status: 'evaluated' }])?.id).toBe('b');
    expect(roundInProgress([{ id: 'a', status: 'awarded' }])).toBeNull();
    expect(roundInProgress(undefined)).toBeNull();
  });
});
