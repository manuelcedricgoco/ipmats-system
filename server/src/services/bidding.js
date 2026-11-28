/**
 * Bidding of project contracts (migration 032).
 *
 *   Round status   open → evaluated → awarded, or failed (from open or evaluated, with a reason
 *                  of 5–500 characters). Awarded and failed rounds are final. At most one round in
 *                  progress (open or evaluated) per project. The ABC is the project's approved
 *                  budget when the round was opened.
 *   Bids           registered contractors only, one per contractor per round; amount > 0;
 *                  eligibility pending | passed | failed (failed with a note of 5–500 characters).
 *                  A bid above the ABC cannot pass. Added, changed and removed only while the
 *                  round is open; eligibility also while it is evaluated (post-qualification).
 *   Evaluate       every bid passed or failed (and at least one bid).
 *   Rank           passed bids by amount, lowest = 1; equal amounts share a rank.
 *   Award          RA 9184 style, lowest calculated responsive bid: only from an evaluated round,
 *                  only the unique rank-1 passed bid (≤ ABC and ≤ the project's approved budget),
 *                  only while the project has no contractor. Sets the project's contractor and
 *                  contract amount (database function award_bidding_round, one transaction).
 *   After award    the project's contractor and contract amount no longer change in the project
 *                  form (contract changes go through variation orders).
 *
 * Pure functions (no database); the database steps are in controllers/biddingController.js and
 * the same rules are kept by the database triggers of 032.
 */
import { HttpError, badRequest, conflict, notFound } from '../utils/httpError.js';

export const ROUND_STATUSES = Object.freeze(['open', 'evaluated', 'awarded', 'failed']);
export const FINAL_ROUND_STATUSES = Object.freeze(['awarded', 'failed']);
export const ACTIVE_ROUND_STATUSES = Object.freeze(['open', 'evaluated']);
export const ELIGIBILITIES = Object.freeze(['pending', 'passed', 'failed']);

// Exact messages (plan: Global Constraints)
export const HAS_CONTRACTOR_MESSAGE = 'This project already has a contractor.';
export const AWARD_LOCK_MESSAGE = 'The contractor and contract amount were set by the bidding award.';
export const LOWEST_ONLY_MESSAGE = 'Only the lowest passed bid can be awarded.';
export const ABOVE_ABC_MESSAGE = 'A bid above the ABC cannot pass.';
export const EVALUATE_PENDING_MESSAGE = 'Set every bid to passed or failed before evaluating.';
export const ROUND_CLOSED_MESSAGE = 'This bidding round is closed.';
// The database (032) raises the same texts.
export const ROUND_ACTIVE_MESSAGE = 'This project already has a bidding round in progress.';
export const BIDS_LOCKED_MESSAGE = 'Bids can only be added, changed or removed while the round is open.';
export const EVALUATED_PENDING_MESSAGE = "An evaluated round's bids stay passed or failed.";
export const NO_BIDS_MESSAGE = 'Add at least one bid before evaluating.';
export const ALREADY_EVALUATED_MESSAGE = 'This round was already evaluated.';
export const NOT_EVALUATED_MESSAGE = 'Evaluate the round before awarding it.';
export const ROUND_EDIT_MESSAGE = 'Only an open bidding round can be edited.';
export const NO_PASSED_MESSAGE = 'No bid passed. Mark the round failed and open a new one.';
export const TIE_MESSAGE = 'Two or more passed bids tie for the lowest amount. Break the tie (for example by drawing lots) and mark the other bids failed with the reason.';
export const ABOVE_BUDGET_MESSAGE = "The winning bid is above the project's approved budget.";
export const INACTIVE_WINNER_MESSAGE = 'The winning contractor is inactive. Reactivate it, or mark its bid failed with the reason.';
export const FAIL_REASON_MESSAGE = 'Give a reason (5–500 characters) for the failure of bidding.';
export const ELIGIBILITY_NOTE_MESSAGE = 'Give a reason (5–500 characters) why this bid failed.';
export const CONTRACTOR_INACTIVE_MESSAGE = 'Choose an active contractor from the Contractors list.';
export const DUPLICATE_BID_MESSAGE = 'This contractor already has a bid in this round.';
export const CHANGED_MESSAGE = 'This bidding round was changed by someone else. Reload and try again.';

/** Pesos as whole centavos, so 900.1 and '900.10' compare equal (numeric(15,2) arrives as text or number). */
export const cents = (v) => Math.round(Number(v) * 100);

const isFinal = (round) => FINAL_ROUND_STATUSES.includes(round?.status);

/**
 * Bids with their rank: passed bids by amount (lowest = 1; equal amounts share a rank, 1, 1, 3),
 * pending and failed bids have rank null. Sorted: passed by rank, then pending, then failed, each
 * by amount and contractor name. `above_abc` marks bids above the round's ABC. Input unchanged.
 */
export function rankBids(bids = [], abc = null) {
  const passed = bids.filter((b) => b.eligibility === 'passed').map((b) => cents(b.amount));
  const order = { passed: 0, pending: 1, failed: 2 };
  return bids
    .map((b) => ({
      ...b,
      amount: Number(b.amount),
      rank: b.eligibility === 'passed' ? 1 + passed.filter((c) => c < cents(b.amount)).length : null,
      above_abc: abc == null ? false : cents(b.amount) > cents(abc),
    }))
    .sort(
      (a, b) =>
        (order[a.eligibility] ?? 3) - (order[b.eligibility] ?? 3) ||
        cents(a.amount) - cents(b.amount) ||
        String(a.contractor_name ?? '').localeCompare(String(b.contractor_name ?? '')) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

/** The lowest passed bid(s): { winner (null on a tie), lowest: [...], tied }, or null when no bid passed. */
export function lowestPassed(bids = []) {
  const passed = bids.filter((b) => b.eligibility === 'passed');
  if (!passed.length) return null;
  const min = Math.min(...passed.map((b) => cents(b.amount)));
  const lowest = passed.filter((b) => cents(b.amount) === min);
  return { winner: lowest.length === 1 ? lowest[0] : null, lowest, tied: lowest.length > 1 };
}

/** Whether a round's bids allow evaluating it: at least one bid, none pending. */
export function evaluationReadiness(bids = []) {
  if (!bids.length) return { ready: false, message: NO_BIDS_MESSAGE };
  if (bids.some((b) => b.eligibility !== 'passed' && b.eligibility !== 'failed')) return { ready: false, message: EVALUATE_PENDING_MESSAGE };
  return { ready: true, message: null };
}

/**
 * The status an action ('evaluate' | 'fail' | 'award') leads to, or the reason it is refused:
 * 404 unknown round, 409 final round ("This bidding round is closed.") or wrong status.
 */
export function nextRoundStatus(round, action) {
  if (!round) throw notFound('Bidding round not found');
  if (isFinal(round)) throw conflict(ROUND_CLOSED_MESSAGE);
  if (action === 'evaluate') {
    if (round.status !== 'open') throw conflict(ALREADY_EVALUATED_MESSAGE);
    return 'evaluated';
  }
  if (action === 'fail') return 'failed';
  if (action === 'award') {
    if (round.status !== 'evaluated') throw conflict(NOT_EVALUATED_MESSAGE);
    return 'awarded';
  }
  throw badRequest('Unknown bidding action.');
}

/** Evaluate: an open round whose bids are all passed or failed (409 otherwise). Returns 'evaluated'. */
export function assertCanEvaluate(round, bids) {
  const status = nextRoundStatus(round, 'evaluate');
  const { ready, message } = evaluationReadiness(bids);
  if (!ready) throw conflict(message);
  return status;
}

/** Bids are added, changed (amount) or removed only while the round is open. */
export function assertBidsEditable(round) {
  if (!round) throw notFound('Bidding round not found');
  if (isFinal(round)) throw conflict(ROUND_CLOSED_MESSAGE);
  if (round.status !== 'open') throw conflict(BIDS_LOCKED_MESSAGE);
}

/** Opening / editing a round: only an open one is edited. */
export function assertRoundEditable(round) {
  if (!round) throw notFound('Bidding round not found');
  if (isFinal(round)) throw conflict(ROUND_CLOSED_MESSAGE);
  if (round.status !== 'open') throw conflict(ROUND_EDIT_MESSAGE);
}

/**
 * A new round may open only on a project without a contractor (and without an awarded round),
 * and only when no round is in progress. Returns the new round's number (1, 2, …).
 */
export function assertCanOpenRound({ project, rounds = [] }) {
  if (!project) throw notFound('Project not found');
  if (project.contractor_id || rounds.some((r) => r.status === 'awarded')) throw conflict(HAS_CONTRACTOR_MESSAGE);
  if (rounds.some((r) => ACTIVE_ROUND_STATUSES.includes(r.status))) throw conflict(ROUND_ACTIVE_MESSAGE);
  return rounds.reduce((max, r) => Math.max(max, Number(r.round_no) || 0), 0) + 1;
}

/**
 * The bid an award goes to, or why not (409). `bids` may carry `contractor_active` (false when the
 * contractor was deactivated); `bidId` is the bid the caller asked for (optional).
 */
export function awardDecision({ round, bids = [], project, bidId = null }) {
  nextRoundStatus(round, 'award');
  if (!project) throw notFound('Project not found');
  if (project.contractor_id) throw conflict(HAS_CONTRACTOR_MESSAGE);
  const low = lowestPassed(bids);
  if (!low) throw conflict(NO_PASSED_MESSAGE);
  if (bidId && !low.lowest.some((b) => b.id === bidId)) throw conflict(LOWEST_ONLY_MESSAGE);
  if (low.tied) throw conflict(TIE_MESSAGE);
  const { winner } = low;
  if (cents(winner.amount) > cents(round.abc)) throw conflict(ABOVE_ABC_MESSAGE);
  if (cents(winner.amount) > cents(project.approved_budget)) throw conflict(ABOVE_BUDGET_MESSAGE);
  if (winner.contractor_active === false) throw conflict(INACTIVE_WINNER_MESSAGE);
  return winner;
}

/** A reason (failure of bidding, failed bid), trimmed, 5–500 characters; else 400 with `message`. */
export function checkReason(value, message, field = 'reason') {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 5 || text.length > 500) throw badRequest(message, [{ field, message }]);
  return text;
}

/**
 * The database patch for PATCH /bidding/bids/:bidId (body: amount?, eligibility?, eligibility_note?).
 * Only the fields that change; {} when nothing does. A different eligibility without a note clears
 * the old note. Throws 409 for a final round or a locked change, 400 for a rule.
 */
export function bidPatch({ round, bid, body }) {
  if (!round) throw notFound('Bidding round not found');
  if (isFinal(round)) throw conflict(ROUND_CLOSED_MESSAGE);
  if (!bid) throw notFound('Bid not found');
  const patch = {};
  if (body.amount !== undefined && cents(body.amount) !== cents(bid.amount)) {
    if (round.status !== 'open') throw conflict(BIDS_LOCKED_MESSAGE);
    patch.amount = body.amount;
  }
  const eligibilityChanged = body.eligibility !== undefined && body.eligibility !== bid.eligibility;
  if (round.status !== 'open' && body.eligibility === 'pending') throw conflict(EVALUATED_PENDING_MESSAGE);
  const eligibility = body.eligibility ?? bid.eligibility;
  let note = body.eligibility_note !== undefined ? body.eligibility_note : eligibilityChanged ? null : bid.eligibility_note;
  note = typeof note === 'string' && note.trim() ? note.trim() : null;
  if (eligibility === 'failed') note = checkReason(note, ELIGIBILITY_NOTE_MESSAGE, 'eligibility_note');
  else if (note && note.length > 500) throw badRequest('The note can be at most 500 characters.', [{ field: 'eligibility_note', message: 'At most 500 characters.' }]);
  if (eligibility === 'passed' && cents(patch.amount ?? bid.amount) > cents(round.abc)) {
    throw badRequest(ABOVE_ABC_MESSAGE, [{ field: body.eligibility !== undefined ? 'eligibility' : 'amount', message: ABOVE_ABC_MESSAGE }]);
  }
  if (eligibilityChanged) patch.eligibility = body.eligibility;
  if (note !== (bid.eligibility_note ?? null)) patch.eligibility_note = note;
  return patch;
}

/**
 * The project form after a bidding award: a different contractor or contract amount is refused
 * (409). The edit form re-sends unchanged values, so equal values pass. No award: nothing checked.
 */
export function assertAwardLock({ awarded, current, patch }) {
  if (!awarded) return;
  if (patch.contractor_id !== undefined && (patch.contractor_id ?? null) !== (current.contractor_id ?? null)) throw conflict(AWARD_LOCK_MESSAGE);
  if (patch.contract_amount !== undefined) {
    const same = patch.contract_amount == null ? current.contract_amount == null : current.contract_amount != null && cents(patch.contract_amount) === cents(current.contract_amount);
    if (!same) throw conflict(AWARD_LOCK_MESSAGE);
  }
}

const reasonOf = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof HttpError) return err.message;
    throw err;
  }
};

/**
 * Which round buttons a viewer gets. Only DPWH Personnel manage (`canManage`); everyone else and
 * every final round get all false. `award_bid_id` is the rank-1 bid an award would go to;
 * `evaluate_message` / `award_message` say why the button is off.
 */
export function roundActions({ round, bids = [], project, canManage }) {
  const open = canManage && round?.status === 'open';
  const active = canManage && ACTIVE_ROUND_STATUSES.includes(round?.status);
  const evaluateMessage = open ? reasonOf(() => assertCanEvaluate(round, bids)) : null;
  let awardBidId = null;
  let awardMessage = null;
  if (canManage && round?.status === 'evaluated') {
    awardMessage = reasonOf(() => {
      awardBidId = awardDecision({ round, bids, project }).id;
    });
  }
  return {
    can_edit: open,
    can_add_bids: open,
    can_edit_bids: open,
    can_set_eligibility: active,
    can_evaluate: open && !evaluateMessage,
    evaluate_message: evaluateMessage,
    can_fail: active,
    can_award: Boolean(awardBidId) && !awardMessage,
    award_bid_id: awardMessage ? null : awardBidId,
    award_message: awardMessage,
  };
}

/**
 * A round as the public sees it (the abstract of bids): no ids, no notes, nobody's identity. An
 * open round shows only that bidding is open, its ABC and opening date: its bids appear once the
 * round is evaluated. `round.bids` are ranked bids with contractor_name and is_winner.
 */
export function toPublicRound(round) {
  return {
    round_no: round.round_no,
    status: round.status,
    opening_date: round.opening_date,
    abc: Number(round.abc),
    failure_reason: round.status === 'failed' ? round.failure_reason ?? null : null,
    awarded_at: round.status === 'awarded' ? round.awarded_at ?? null : null,
    bids:
      round.status === 'open'
        ? []
        : (round.bids ?? []).map((b) => ({
            contractor_name: b.contractor_name ?? null,
            amount: Number(b.amount),
            eligibility: b.eligibility,
            eligibility_note: b.eligibility_note ?? null,
            rank: b.rank ?? null,
            is_winner: Boolean(b.is_winner),
          })),
  };
}
