/**
 * Bidding of project contracts (migration 032): rounds (open → evaluated → awarded, or failed) and the bids of
 * registered contractors (eligibility pending | passed | failed, rank of the passed bids, lowest = 1). The award
 * goes to the rank-1 passed bid and sets the project's contractor and contract amount.
 * These helpers are display and form checks only: the API decides every rule again (services/bidding.js), sends
 * per round which buttons DPWH Personnel get (`actions`) and its messages are shown as they come.
 */
import { peso } from './format.js';

// The API's messages, so a dialog says the same thing before and after sending.
export const AWARD_LOCK_MESSAGE = 'The contractor and contract amount were set by the bidding award.';
export const ABOVE_ABC_MESSAGE = 'A bid above the ABC cannot pass.';
export const ELIGIBILITY_NOTE_MESSAGE = 'Give a reason (5–500 characters) why this bid failed.';
export const FAIL_REASON_MESSAGE = 'Give a reason (5–500 characters) for the failure of bidding.';

const ROUND_STATUS_META = {
  open: { label: 'Open', cls: 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200' },
  evaluated: { label: 'Evaluated', cls: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' },
  awarded: { label: 'Awarded', cls: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' },
  failed: { label: 'Failure of bidding', cls: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200' },
};
export const roundStatusMeta = (status) => ROUND_STATUS_META[status] || { label: status || '—', cls: 'bg-slate-100 text-slate-700' };

const ELIGIBILITY_META = {
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-700' },
  passed: { label: 'Passed', cls: 'bg-emerald-50 text-emerald-800' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-800' },
};
export const eligibilityMeta = (e) => ELIGIBILITY_META[e] || { label: e || '—', cls: 'bg-slate-100 text-slate-700' };

const PUBLIC_HEADLINES = { open: 'Bidding open', evaluated: 'Bids evaluated, award pending', awarded: 'Awarded', failed: 'Failure of bidding' };
/** The public abstract's line for a round (an open round shows only that bidding is open). */
export const publicRoundHeadline = (round) => PUBLIC_HEADLINES[round?.status] || roundStatusMeta(round?.status).label;

export const rankLabel = (rank) => (rank == null ? '—' : String(rank));

const FINAL = ['awarded', 'failed'];

/**
 * Which round buttons to show, from the server's `permissions.can_manage` and the round's `actions`. A reader
 * (Admin, Auditor, contractor, PACC) and every final round get none. Evaluate and Award are shown to Personnel on
 * an open / evaluated round even when refused, switched off with the server's reason.
 */
export function roundControls(round, permissions) {
  const manage = Boolean(permissions?.can_manage) && !FINAL.includes(round?.status);
  const a = (manage && round?.actions) || {};
  const out = {
    edit: Boolean(a.can_edit),
    addBid: Boolean(a.can_add_bids),
    editBids: Boolean(a.can_edit_bids),
    setEligibility: Boolean(a.can_set_eligibility),
    fail: Boolean(a.can_fail),
    evaluate: { show: manage && round.status === 'open', enabled: Boolean(a.can_evaluate), message: a.evaluate_message ?? null },
    award: { show: manage && round.status === 'evaluated', enabled: Boolean(a.can_award), bidId: a.award_bid_id ?? null, message: a.award_message ?? null },
  };
  out.any = out.edit || out.addBid || out.editBids || out.setEligibility || out.fail || out.evaluate.show || out.award.show;
  return out;
}

/** Contractors that can still bid in this round: active, without a bid in it yet, by name. */
export function bidderOptions(contractors, round) {
  const bidding = new Set((round?.bids || []).map((b) => b.contractor_id));
  return (contractors || [])
    .filter((c) => c.is_active !== false && !bidding.has(c.id))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

const cents = (v) => Math.round(Number(v) * 100);

/** A bid amount above the round's ABC (whole centavos, as the API compares). */
export function isAboveAbc(amount, abc) {
  if (amount === '' || amount == null || abc == null || !Number.isFinite(Number(amount))) return false;
  return cents(amount) > cents(abc);
}

export function bidAmountProblem(value) {
  if (value === '' || value == null || !Number.isFinite(Number(value))) return 'Enter the bid amount.';
  if (Number(value) <= 0) return 'The bid amount must be more than 0.';
  return null;
}

/** Eligibility choices: back to pending only while the round is open. */
export const eligibilityChoices = (roundStatus) => (roundStatus === 'open' ? ['pending', 'passed', 'failed'] : ['passed', 'failed']);

const reasonOk = (text) => {
  const t = String(text ?? '').trim();
  return t.length >= 5 && t.length <= 500;
};

/** The eligibility dialog's check: a failed bid needs a reason, a bid above the ABC cannot pass. */
export function eligibilityProblem({ eligibility, note, aboveAbc = false }) {
  if (eligibility === 'failed') return reasonOk(note) ? null : ELIGIBILITY_NOTE_MESSAGE;
  if (eligibility === 'passed' && aboveAbc) return ABOVE_ABC_MESSAGE;
  if (String(note ?? '').trim().length > 500) return 'The note can be at most 500 characters.';
  return null;
}

export const failReasonProblem = (reason) => (reasonOk(reason) ? null : FAIL_REASON_MESSAGE);

/** The award dialog's explanation: what the award changes on the project. */
export function awardConfirmText(round, bid) {
  const who = bid?.contractor_name || 'the lowest passed bidder';
  return (
    `Award round ${round?.round_no ?? ''} to ${who} at ${peso(bid?.amount)}. This sets the project's contractor to ${who} ` +
    `and its contract amount to ${peso(bid?.amount)}. The round becomes final, and the contractor and contract amount ` +
    'can no longer be changed in the project form (contract changes go through variation orders).'
  );
}

/** The project form locks contractor and contract amount when the bidding view says so. */
export const isContractLocked = (bidding) => Boolean(bidding?.project?.contract_locked);

/** The round in progress (open or evaluated), or null. */
export const roundInProgress = (rounds) => (rounds || []).find((r) => r.status === 'open' || r.status === 'evaluated') || null;
