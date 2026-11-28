/**
 * Bidding of project contracts (migration 032; rules in services/bidding.js)
 *   GET    /projects/:id/bidding                 rounds with ranked bids, the round buttons and permissions
 *                                                (staff; contractor accounts on their own company's projects, RLS;
 *                                                PACC gets the same data inside GET /pacc/projects/:id)
 *   POST   /projects/:id/bidding/rounds          DPWH Personnel: open a round { opening_date, notes? }
 *   PATCH  /bidding/rounds/:roundId              open round only: { opening_date?, notes? }
 *   POST   /bidding/rounds/:roundId/bids         open round only: { contractor_id, amount }
 *   PATCH  /bidding/bids/:bidId                  { amount? (open only), eligibility?, eligibility_note? }
 *   DELETE /bidding/bids/:bidId                  open round only
 *   POST   /bidding/rounds/:roundId/evaluate     every bid passed or failed
 *   POST   /bidding/rounds/:roundId/fail         { reason } (5–500 characters), from open or evaluated
 *   POST   /bidding/rounds/:roundId/award        { bid_id? }: the rank-1 passed bid; sets the project's contractor
 *                                                and contract amount in one transaction (award_bidding_round)
 * Every write answers with the project's bidding as GET /projects/:id/bidding returns it, and is
 * in the activity log. Writes use the service role after the role check in the route; status
 * changes are conditional updates (a concurrent change gets 409), and the database triggers of
 * 032 keep the same rules.
 */
import { adminClient } from '../config/supabase.js';
import { logActivity } from '../services/activityLog.js';
import {
  CHANGED_MESSAGE,
  CONTRACTOR_INACTIVE_MESSAGE,
  DUPLICATE_BID_MESSAGE,
  FAIL_REASON_MESSAGE,
  ROUND_ACTIVE_MESSAGE,
  assertBidsEditable,
  assertCanEvaluate,
  assertCanOpenRound,
  assertRoundEditable,
  awardDecision,
  bidPatch,
  checkReason,
  nextRoundStatus,
  rankBids,
  roundActions,
} from '../services/bidding.js';
import { fillMissingNames } from '../services/profileNames.js';
import { reevaluate } from '../services/projectEvaluation.js';
import { assertValid, checkContractAmountChange } from '../services/validationRules.js';
import { badRequest, conflict, notFound, unwrap } from '../utils/httpError.js';
import { readAllPages } from '../utils/pagination.js';

const ROUND_COLS = 'id, project_id, round_no, status, opening_date, abc, notes, failure_reason, awarded_bid_id, awarded_at, awarded_by, created_at, updated_at';
const BID_COLS = 'id, round_id, project_id, contractor_id, amount, eligibility, eligibility_note, created_at, updated_at';
const PROJECT_COLS = 'id, project_code, approved_budget, contract_amount, contractor_id';
const peso = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Business-rule errors raised by the 032 triggers (P0001) are state conflicts here: 409 with their text. */
function checked(result, opts) {
  if (result.error?.code === 'P0001') throw conflict(result.error.message);
  return unwrap(result, opts);
}

/** Contractor names and whether each is active (service role: a contractor viewer reads only its own company). */
async function contractorInfo(ids, db = adminClient) {
  const out = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const rows = unwrap(await db.from('contractors').select('id, name, is_active').in('id', unique.slice(i, i + 100)));
    for (const c of rows) out.set(c.id, c);
  }
  return out;
}

/** Rounds (by number) with their ranked bids, from rows already read. */
function assembleRounds(rounds, bids, contractors) {
  return [...rounds]
    .sort((a, b) => a.round_no - b.round_no)
    .map((r) => {
      const own = bids
        .filter((b) => b.round_id === r.id)
        .map(({ project_id: _p, ...b }) => ({
          ...b,
          contractor_name: contractors.get(b.contractor_id)?.name ?? null,
          contractor_active: contractors.get(b.contractor_id)?.is_active !== false,
          is_winner: r.status === 'awarded' && r.awarded_bid_id === b.id,
        }));
      return { ...r, abc: Number(r.abc), bids: rankBids(own, r.abc) };
    });
}

/**
 * A project's bidding rounds with ranked bids. Rows are read through `db` (a signed-in caller's
 * client: RLS lets staff, PACC and the project's contractor read them; or the service role for the
 * public abstract); contractor names come from `names` (the service role when there is one).
 * `people` adds awarded_by_name (never for the public).
 */
export async function loadBidding(db, projectId, { names = adminClient ?? db, people = true } = {}) {
  const [rounds, bids] = await Promise.all([
    readAllPages(() => db.from('bidding_rounds').select(ROUND_COLS).eq('project_id', projectId)),
    readAllPages(() => db.from('bids').select(BID_COLS).eq('project_id', projectId)),
  ]);
  const contractors = await contractorInfo(bids.map((b) => b.contractor_id), names);
  let out = assembleRounds(rounds, bids, contractors);
  if (people) {
    out = await fillMissingNames(out.map((r) => ({ ...r, awarded_by_name: null })), [{ id: 'awarded_by', name: 'awarded_by_name' }]);
  }
  return out.map(({ awarded_by: _a, ...r }) => r);
}

/**
 * The bidding of a project as `user` sees it: the rounds (each with the buttons DPWH Personnel
 * get), whether the contract was awarded (then the project form locks contractor and contract
 * amount) and whether a new round can be opened.
 */
export async function biddingForViewer(db, project, user) {
  const rounds = await loadBidding(db, project.id);
  const canManage = user?.role === 'dpwh_personnel';
  const awarded = rounds.some((r) => r.status === 'awarded');
  let openMessage = null;
  try {
    assertCanOpenRound({ project, rounds });
  } catch (err) {
    openMessage = err.message;
  }
  return {
    project: {
      id: project.id,
      project_code: project.project_code,
      approved_budget: Number(project.approved_budget),
      contractor_id: project.contractor_id ?? null,
      contract_amount: project.contract_amount == null ? null : Number(project.contract_amount),
      awarded,
      contract_locked: awarded,
    },
    rounds: rounds.map((r) => ({ ...r, actions: roundActions({ round: r, bids: r.bids, project, canManage }) })),
    permissions: {
      can_manage: canManage,
      can_open_round: canManage && !openMessage,
      open_round_message: canManage ? openMessage : null,
    },
  };
}

export async function getProjectBidding(req, res) {
  const project = unwrap(await req.db.from('projects').select(PROJECT_COLS).eq('id', req.params.id).maybeSingle());
  if (!project) throw notFound('Project not found');
  res.json({ data: await biddingForViewer(req.db, project, req.user) });
}

// ---------------------------------------------------------------------------
// Writes (DPWH Personnel; service role)
// ---------------------------------------------------------------------------
async function loadProject(id) {
  const p = unwrap(await adminClient.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle());
  if (!p) throw notFound('Project not found');
  return p;
}
async function loadRound(id) {
  const r = unwrap(await adminClient.from('bidding_rounds').select(ROUND_COLS).eq('id', id).maybeSingle());
  if (!r) throw notFound('Bidding round not found');
  return r;
}
async function loadBid(id) {
  const b = unwrap(await adminClient.from('bids').select(BID_COLS).eq('id', id).maybeSingle());
  if (!b) throw notFound('Bid not found');
  return b;
}
/** A round's bids with contractor names and active state (service role). */
async function loadRoundBids(round) {
  const bids = await readAllPages(() => adminClient.from('bids').select(BID_COLS).eq('round_id', round.id));
  return assembleRounds([round], bids, await contractorInfo(bids.map((b) => b.contractor_id)))[0].bids;
}

/** The answer of every write: the project's bidding as the caller sees it now. */
async function respond(req, res, projectId, status = 200, extra = {}) {
  const project = await loadProject(projectId);
  res.status(status).json({ data: { ...(await biddingForViewer(req.db, project, req.user)), ...extra } });
}

export async function openRound(req, res) {
  const project = await loadProject(req.params.id);
  const rounds = await readAllPages(() => adminClient.from('bidding_rounds').select('id, round_no, status').eq('project_id', project.id));
  const roundNo = assertCanOpenRound({ project, rounds });
  const row = checked(
    await adminClient
      .from('bidding_rounds')
      .insert({
        project_id: project.id,
        round_no: roundNo,
        opening_date: req.body.opening_date,
        abc: project.approved_budget,
        notes: req.body.notes ?? null,
        created_by: req.user.id,
      })
      .select(ROUND_COLS)
      .single(),
    // Two Personnel opening a round at the same moment: the second hits a unique index.
    { conflictMessage: ROUND_ACTIVE_MESSAGE },
  );
  await logActivity(req, {
    action: 'bidding.round_open',
    entityType: 'bidding_round',
    entityId: row.id,
    projectId: project.id,
    summary: `Opened bidding round ${roundNo} for ${project.project_code} (ABC ${peso(row.abc)}, opening of bids ${row.opening_date})`,
    details: { round_no: roundNo, abc: Number(row.abc), opening_date: row.opening_date },
  });
  await respond(req, res, project.id, 201, { round_id: row.id });
}

export async function updateRound(req, res) {
  const round = await loadRound(req.params.roundId);
  assertRoundEditable(round);
  const patch = {};
  if (req.body.opening_date !== undefined) patch.opening_date = req.body.opening_date;
  if (req.body.notes !== undefined) patch.notes = req.body.notes;
  const rows = checked(await adminClient.from('bidding_rounds').update(patch).eq('id', round.id).eq('status', 'open').select('id'));
  if (!rows.length) {
    assertRoundEditable(await loadRound(round.id)); // throws the current reason (404 / 409)
    throw conflict(CHANGED_MESSAGE);
  }
  const project = await loadProject(round.project_id);
  await logActivity(req, {
    action: 'bidding.round_update',
    entityType: 'bidding_round',
    entityId: round.id,
    projectId: round.project_id,
    summary: `Updated bidding round ${round.round_no} of ${project.project_code} (${Object.keys(patch).join(', ')})`,
    details: { round_no: round.round_no, changed: Object.keys(patch), ...(patch.opening_date && { opening_date: { from: round.opening_date, to: patch.opening_date } }) },
  });
  await respond(req, res, round.project_id);
}

export async function addBid(req, res) {
  const round = await loadRound(req.params.roundId);
  assertBidsEditable(round);
  const contractor = unwrap(await adminClient.from('contractors').select('id, name, is_active').eq('id', req.body.contractor_id).maybeSingle());
  if (!contractor || contractor.is_active !== true) {
    throw badRequest(CONTRACTOR_INACTIVE_MESSAGE, [{ field: 'contractor_id', message: CONTRACTOR_INACTIVE_MESSAGE }]);
  }
  const row = checked(
    await adminClient
      .from('bids')
      .insert({ round_id: round.id, project_id: round.project_id, contractor_id: contractor.id, amount: req.body.amount, created_by: req.user.id })
      .select(BID_COLS)
      .single(),
    { conflictMessage: DUPLICATE_BID_MESSAGE, foreignKeyMessage: CONTRACTOR_INACTIVE_MESSAGE },
  );
  const project = await loadProject(round.project_id);
  await logActivity(req, {
    action: 'bidding.bid_add',
    entityType: 'bid',
    entityId: row.id,
    projectId: round.project_id,
    summary: `Recorded the bid of ${contractor.name} (${peso(row.amount)}) in bidding round ${round.round_no} of ${project.project_code}`,
    details: { round_id: round.id, round_no: round.round_no, contractor_id: contractor.id, contractor_name: contractor.name, amount: Number(row.amount) },
  });
  await respond(req, res, round.project_id, 201, { bid_id: row.id });
}

export async function updateBid(req, res) {
  const bid = await loadBid(req.params.bidId);
  const round = await loadRound(bid.round_id);
  const patch = bidPatch({ round, bid, body: req.body });
  if (Object.keys(patch).length) {
    // Only the bid as it was read changes (two edits at once: the second gets 409).
    const rows = checked(
      await adminClient.from('bids').update(patch).eq('id', bid.id).eq('amount', bid.amount).eq('eligibility', bid.eligibility).select('id'),
    );
    if (!rows.length) {
      bidPatch({ round: await loadRound(bid.round_id), bid: await loadBid(bid.id), body: req.body }); // throws the current reason
      throw conflict(CHANGED_MESSAGE);
    }
    const [project, info] = await Promise.all([loadProject(bid.project_id), contractorInfo([bid.contractor_id])]);
    const name = info.get(bid.contractor_id)?.name ?? 'a contractor';
    const what = [
      patch.amount !== undefined && `amount ${peso(bid.amount)} → ${peso(patch.amount)}`,
      patch.eligibility !== undefined && `eligibility ${bid.eligibility} → ${patch.eligibility}`,
      patch.eligibility !== undefined || patch.eligibility_note === undefined ? null : 'eligibility note',
    ].filter(Boolean);
    await logActivity(req, {
      action: 'bidding.bid_update',
      entityType: 'bid',
      entityId: bid.id,
      projectId: bid.project_id,
      summary: `Updated the bid of ${name} in bidding round ${round.round_no} of ${project.project_code}: ${what.join(', ')}${patch.eligibility_note ? ` (${patch.eligibility_note})` : ''}`,
      details: {
        round_id: round.id,
        round_no: round.round_no,
        contractor_id: bid.contractor_id,
        changed: Object.keys(patch),
        ...(patch.amount !== undefined && { amount: { from: Number(bid.amount), to: Number(patch.amount) } }),
        ...(patch.eligibility !== undefined && { eligibility: { from: bid.eligibility, to: patch.eligibility } }),
        ...(patch.eligibility_note !== undefined && { eligibility_note: patch.eligibility_note }),
      },
    });
  }
  await respond(req, res, bid.project_id);
}

export async function deleteBid(req, res) {
  const bid = await loadBid(req.params.bidId);
  const round = await loadRound(bid.round_id);
  assertBidsEditable(round);
  const rows = checked(await adminClient.from('bids').delete().eq('id', bid.id).select('id'));
  if (!rows.length) throw notFound('Bid not found');
  const [project, info] = await Promise.all([loadProject(bid.project_id), contractorInfo([bid.contractor_id])]);
  const name = info.get(bid.contractor_id)?.name ?? 'a contractor';
  await logActivity(req, {
    action: 'bidding.bid_delete',
    entityType: 'bid',
    entityId: bid.id,
    projectId: bid.project_id,
    summary: `Removed the bid of ${name} (${peso(bid.amount)}) from bidding round ${round.round_no} of ${project.project_code}`,
    details: { round_id: round.id, round_no: round.round_no, contractor_id: bid.contractor_id, contractor_name: name, amount: Number(bid.amount) },
  });
  await respond(req, res, bid.project_id);
}

export async function evaluateRound(req, res) {
  const round = await loadRound(req.params.roundId);
  const bids = await loadRoundBids(round);
  assertCanEvaluate(round, bids);
  const rows = checked(await adminClient.from('bidding_rounds').update({ status: 'evaluated' }).eq('id', round.id).eq('status', 'open').select('id'));
  if (!rows.length) {
    const now = await loadRound(round.id);
    assertCanEvaluate(now, await loadRoundBids(now)); // throws the current reason
    throw conflict(CHANGED_MESSAGE);
  }
  const project = await loadProject(round.project_id);
  const passed = bids.filter((b) => b.eligibility === 'passed').length;
  await logActivity(req, {
    action: 'bidding.evaluate',
    entityType: 'bidding_round',
    entityId: round.id,
    projectId: round.project_id,
    summary: `Evaluated bidding round ${round.round_no} of ${project.project_code}: ${passed} of ${bids.length} bid${bids.length === 1 ? '' : 's'} passed`,
    details: { round_no: round.round_no, bids: bids.length, passed, failed: bids.length - passed },
  });
  await respond(req, res, round.project_id);
}

export async function failRound(req, res) {
  const reason = checkReason(req.body?.reason, FAIL_REASON_MESSAGE);
  const round = await loadRound(req.params.roundId);
  nextRoundStatus(round, 'fail');
  const rows = checked(
    await adminClient.from('bidding_rounds').update({ status: 'failed', failure_reason: reason }).eq('id', round.id).in('status', ['open', 'evaluated']).select('id'),
  );
  if (!rows.length) {
    nextRoundStatus(await loadRound(round.id), 'fail'); // throws the current reason
    throw conflict(CHANGED_MESSAGE);
  }
  const project = await loadProject(round.project_id);
  await logActivity(req, {
    action: 'bidding.fail',
    entityType: 'bidding_round',
    entityId: round.id,
    projectId: round.project_id,
    summary: `Declared a failure of bidding for round ${round.round_no} of ${project.project_code}: ${reason}`,
    details: { round_no: round.round_no, from_status: round.status, reason },
  });
  await respond(req, res, round.project_id);
}

/**
 * The award. The rules are checked here first (clear messages, nothing written), then
 * award_bidding_round (032) re-checks them on locked rows and sets the round awarded and the
 * project's contractor and contract amount in ONE transaction: either both change or neither.
 * The winner found here is passed to it, so a bid changed in between is refused, not awarded.
 */
export async function awardRound(req, res) {
  const round = await loadRound(req.params.roundId);
  const [project, bids] = await Promise.all([loadProject(round.project_id), loadRoundBids(round)]);
  const winner = awardDecision({ round, bids, project, bidId: req.body?.bid_id ?? null });
  const records = await readAllPages(() => adminClient.from('financial_records').select('id, record_type, amount').eq('project_id', project.id));
  assertValid(checkContractAmountChange({ contractAmount: winner.amount, records }));

  const { data, error } = await adminClient.rpc('award_bidding_round', { p_round_id: round.id, p_bid_id: winner.id, p_actor_id: req.user.id });
  if (error?.code === 'P0002') throw notFound('Bidding round not found');
  checked({ data, error });

  // The award is committed: a failure from here on is logged and the award still answers 200.
  let evaluation = null;
  try {
    evaluation = await reevaluate(project.id, 'bidding_award', req.user.id);
  } catch (err) {
    console.error('[bidding] re-evaluation after the award failed', project.id, err?.message);
  }
  await logAward(req, { round, project, winner, bids });
  await respond(req, res, project.id, 200, { evaluation });
}

/** The award's activity-log entry; a failure is only logged (the award is already committed). */
async function logAward(req, { round, project, winner, bids }) {
  try {
    await logActivity(req, {
      action: 'bidding.award',
      entityType: 'bidding_round',
      entityId: round.id,
      projectId: project.id,
      summary: `Awarded ${project.project_code} (bidding round ${round.round_no}) to ${winner.contractor_name} at ${peso(winner.amount)}; contractor and contract amount set`,
      details: {
        round_no: round.round_no,
        bid_id: winner.id,
        contractor_id: winner.contractor_id,
        contractor_name: winner.contractor_name,
        amount: Number(winner.amount),
        abc: Number(round.abc),
        bids: bids.length,
      },
    });
  } catch (err) {
    console.error('[bidding] logging the award failed', project.id, err?.message);
  }
}
