import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicBiddingView } from '../public/PublicBidding.jsx';
import BiddingRounds from './BiddingRounds.jsx';

const OFF = {
  can_edit: false, can_add_bids: false, can_edit_bids: false, can_set_eligibility: false, can_evaluate: false,
  evaluate_message: null, can_fail: false, can_award: false, award_bid_id: null, award_message: null,
};
const bid = (o) => ({ id: o.id, round_id: 'r', contractor_id: `c-${o.id}`, contractor_active: true, eligibility_note: null, rank: null, above_abc: false, is_winner: false, ...o });
const failedRound = {
  id: 'r1', round_no: 1, status: 'failed', opening_date: '2026-10-01', abc: 1000000, notes: null, failure_reason: 'No bid passed the eligibility check',
  awarded_at: null, awarded_by_name: null, actions: OFF,
  bids: [bid({ id: 'b0', contractor_name: 'Delta Builders', amount: 990000, eligibility: 'failed', eligibility_note: 'Expired PCAB licence' })],
};
const awardedRound = {
  id: 'r2', round_no: 2, status: 'awarded', opening_date: '2026-11-01', abc: 1000000, notes: 'ITB 2026-11', failure_reason: null,
  awarded_at: '2026-11-20T02:00:00Z', awarded_by_name: 'Ana Reyes', actions: OFF,
  bids: [
    bid({ id: 'b1', contractor_name: 'Alpha Construction', amount: 950000, eligibility: 'passed', rank: 1, is_winner: true }),
    bid({ id: 'b2', contractor_name: 'Beta Works', amount: 1100000, eligibility: 'failed', eligibility_note: 'Above the ABC', above_abc: true }),
  ],
};
const readOnly = { project: { contract_locked: true }, rounds: [failedRound, awardedRound], permissions: { can_manage: false, can_open_round: false, open_round_message: null } };
const buttons = (html) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('BiddingRounds (staff tab and PACC, read-only)', () => {
  it('shows every round, newest first, with status, ABC, failure reason, award and the bids', () => {
    const html = renderToStaticMarkup(<BiddingRounds bidding={readOnly} />);
    for (const text of ['Round 2', 'Round 1', 'Awarded', 'Failure of bidding', 'No bid passed the eligibility check', 'Alpha Construction', 'Winner', 'Above the ABC', 'Expired PCAB licence', 'by Ana Reyes', 'ITB 2026-11', '₱1,000,000.00']) {
      expect(html).toContain(text);
    }
    expect(html.indexOf('Round 2')).toBeLessThan(html.indexOf('Round 1'));
  });
  it('has no write controls for a reader, PACC or without handlers', () => {
    expect(buttons(renderToStaticMarkup(<BiddingRounds bidding={readOnly} />))).toEqual([]);
    const managed = { ...readOnly, permissions: { can_manage: true } };
    // final rounds: nothing even for Personnel
    expect(buttons(renderToStaticMarkup(<BiddingRounds bidding={managed} handlers={{}} />))).toEqual([]);
  });
  it('shows Personnel the buttons the server allows on an open round', () => {
    const open = {
      id: 'r3', round_no: 1, status: 'open', opening_date: '2026-11-25', abc: 1000000, notes: null, failure_reason: null, awarded_at: null, awarded_by_name: null,
      actions: { ...OFF, can_edit: true, can_add_bids: true, can_edit_bids: true, can_set_eligibility: true, can_fail: true, evaluate_message: 'Set every bid to passed or failed before evaluating.' },
      bids: [bid({ id: 'b9', contractor_name: 'Gamma Corp', amount: 900000, eligibility: 'pending' })],
    };
    const html = renderToStaticMarkup(<BiddingRounds bidding={{ rounds: [open], permissions: { can_manage: true } }} handlers={{}} />);
    expect(buttons(html)).toEqual(expect.arrayContaining(['Edit round', 'Add bid', 'Evaluate', 'Failure of bidding', 'Eligibility']));
    expect(html).toContain('Set every bid to passed or failed before evaluating.');
    expect(buttons(html)).not.toContain('Award');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*?Evaluate/);
  });
  it('says so when there is no bidding', () => {
    expect(renderToStaticMarkup(<BiddingRounds bidding={{ rounds: [], permissions: {} }} />)).toContain('No bidding recorded');
  });
});

describe('PublicBiddingView (the abstract of bids)', () => {
  it('an open round shows "Bidding open", its ABC and opening date, and no bids', () => {
    const html = renderToStaticMarkup(<PublicBiddingView data={{ rounds: [{ round_no: 1, status: 'open', opening_date: '2026-11-25', abc: 1200000, failure_reason: null, awarded_at: null, bids: [] }] }} />);
    expect(html).toContain('Bidding open');
    expect(html).toContain('₱1,200,000');
    expect(html).toContain('Opening');
    expect(html).toContain('The bids are shown once they are evaluated.');
    expect(html).not.toContain('Abstract of bids');
  });
  it('a decided round lists every bidder with amount, eligibility, rank and the winner', () => {
    const data = {
      rounds: [
        { round_no: 1, status: 'failed', opening_date: '2026-10-01', abc: 1000000, failure_reason: 'No bid passed', awarded_at: null, bids: [{ contractor_name: 'Delta Builders', amount: 990000, eligibility: 'failed', eligibility_note: 'Expired PCAB licence', rank: null, is_winner: false }] },
        { round_no: 2, status: 'awarded', opening_date: '2026-11-01', abc: 1000000, failure_reason: null, awarded_at: '2026-11-20T02:00:00Z', bids: [{ contractor_name: 'Alpha Construction', amount: 950000, eligibility: 'passed', eligibility_note: null, rank: 1, is_winner: true }] },
      ],
    };
    const html = renderToStaticMarkup(<PublicBiddingView data={data} />);
    for (const text of ['Round 2', 'Awarded', 'Alpha Construction', '₱950,000', 'Passed', 'Winner', 'Round 1', 'Failure of bidding: No bid passed', 'Delta Builders', 'Expired PCAB licence']) expect(html).toContain(text);
    expect(html.indexOf('Round 2')).toBeLessThan(html.indexOf('Round 1'));
  });
  it('says so when no bidding is recorded', () => {
    expect(renderToStaticMarkup(<PublicBiddingView data={{ rounds: [] }} />)).toContain('No bidding is recorded for this project.');
  });
});
