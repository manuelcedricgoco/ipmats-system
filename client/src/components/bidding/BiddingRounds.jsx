import { AlertTriangle, Award, ClipboardCheck, Gavel, Pencil, Plus, ShieldCheck, Trash2, Trophy, XCircle } from 'lucide-react';
import { Pill } from '../common/Badges.jsx';
import Button from '../common/Button.jsx';
import { Card, CardHeader } from '../common/Card.jsx';
import { EmptyState } from '../common/Feedback.jsx';
import { eligibilityMeta, rankLabel, roundControls, roundStatusMeta } from '../../lib/bidding.js';
import { date, dateTime, peso } from '../../lib/format.js';

export function RoundStatusChip({ status }) {
  const m = roundStatusMeta(status);
  return <Pill className={m.cls}>{m.label}</Pill>;
}

export function EligibilityChip({ eligibility }) {
  const m = eligibilityMeta(eligibility);
  return <Pill className={m.cls}>{m.label}</Pill>;
}

export const WinnerBadge = () => (
  <Pill className="bg-emerald-700 text-white">
    <Trophy className="mr-1 h-3 w-3" aria-hidden />
    Winner
  </Pill>
);

export const AboveAbcWarning = () => (
  <Pill className="bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
    <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
    Above the ABC
  </Pill>
);

const TH = 'px-4 py-2.5';

/** One round's bids (ranked by the server: passed by rank, then pending, then failed). */
function BidsTable({ round, controls, handlers }) {
  const bids = round.bids || [];
  const withActions = Boolean(handlers) && (controls.setEligibility || controls.editBids);
  if (!bids.length) {
    return <p className="px-5 py-4 text-sm text-slate-500">{round.status === 'open' ? 'No bids recorded yet.' : 'No bids were recorded in this round.'}</p>;
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="table-sticky-first min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className={TH}>Contractor</th>
            <th scope="col" className={`${TH} text-center`}>Rank</th>
            <th scope="col" className={`${TH} text-right`}>Bid amount</th>
            <th scope="col" className={TH}>Eligibility</th>
            {withActions && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bids.map((b) => (
            <tr key={b.id} className={b.is_winner ? 'bg-emerald-50/50' : 'transition-colors hover:bg-slate-50'}>
              <td className="px-4 py-2.5">
                <p className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                  {b.contractor_name || '—'}
                  {b.is_winner && <WinnerBadge />}
                </p>
                {b.contractor_active === false && <p className="text-xs text-slate-500">Marked inactive in the Contractors list</p>}
              </td>
              <td className="px-4 py-2.5 text-center font-semibold tabular-nums">{rankLabel(b.rank)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right">
                <span className="font-semibold tabular-nums">{peso(b.amount)}</span>
                {b.above_abc && <span className="mt-1 flex justify-end"><AboveAbcWarning /></span>}
              </td>
              <td className="px-4 py-2.5">
                <EligibilityChip eligibility={b.eligibility} />
                {b.eligibility_note && <p className="mt-1 max-w-xs break-words text-xs text-slate-600">{b.eligibility_note}</p>}
              </td>
              {withActions && (
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {controls.setEligibility && (
                      <Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => handlers.onEligibility(round, b)} aria-label={`Set the eligibility of ${b.contractor_name}`}>
                        Eligibility
                      </Button>
                    )}
                    {controls.editBids && (
                      <>
                        <button type="button" onClick={() => handlers.onEditBid(round, b)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Change the bid of ${b.contractor_name}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handlers.onRemoveBid(round, b)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove the bid of ${b.contractor_name}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One bidding round: number, status, opening date, ABC, notes, failure reason, the award, and the bids table.
 * The buttons follow the server's `permissions` and the round's `actions` (roundControls); without `handlers`
 * (PACC, readers) there are none.
 */
export function RoundCard({ round, permissions, handlers }) {
  const controls = roundControls(round, handlers ? permissions : null);
  const winner = (round.bids || []).find((b) => b.is_winner);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Round {round.round_no}
            <RoundStatusChip status={round.status} />
          </span>
        }
        description={`Opening of bids ${date(round.opening_date)} · ABC ${peso(round.abc)}`}
        actions={
          controls.any && (
            <>
              {controls.edit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => handlers.onEditRound(round)}>Edit round</Button>}
              {controls.addBid && <Button size="sm" variant="secondary" icon={Plus} onClick={() => handlers.onAddBid(round)}>Add bid</Button>}
              {controls.evaluate.show && (
                <Button size="sm" icon={ClipboardCheck} disabled={!controls.evaluate.enabled} title={controls.evaluate.message || undefined} onClick={() => handlers.onEvaluate(round)}>
                  Evaluate
                </Button>
              )}
              {controls.award.show && (
                <Button size="sm" icon={Award} disabled={!controls.award.enabled} title={controls.award.message || undefined} onClick={() => handlers.onAward(round, controls.award.bidId)}>
                  Award
                </Button>
              )}
              {controls.fail && <Button size="sm" variant="danger-outline" icon={XCircle} onClick={() => handlers.onFail(round)}>Failure of bidding</Button>}
            </>
          )
        }
      />
      {(round.notes || round.failure_reason || round.status === 'awarded' || (controls.evaluate.show && controls.evaluate.message) || (controls.award.show && controls.award.message)) && (
        <div className="space-y-2 border-b border-slate-100 px-5 py-3 text-sm">
          {round.status === 'awarded' && (
            <p className="text-emerald-900">
              <Trophy className="mr-1 inline h-4 w-4 text-emerald-700" aria-hidden />
              Awarded{winner ? ` to ${winner.contractor_name} at ${peso(winner.amount)}` : ''} on {dateTime(round.awarded_at)}
              {round.awarded_by_name ? ` by ${round.awarded_by_name}` : ''}.
            </p>
          )}
          {round.failure_reason && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-red-900"><strong>Reason for the failure of bidding:</strong> {round.failure_reason}</p>
          )}
          {round.notes && <p className="whitespace-pre-line break-words text-slate-600"><strong className="text-slate-700">Notes:</strong> {round.notes}</p>}
          {controls.evaluate.show && controls.evaluate.message && <p className="text-xs text-slate-500">Evaluate: {controls.evaluate.message}</p>}
          {controls.award.show && controls.award.message && <p className="text-xs text-amber-800">Award: {controls.award.message}</p>}
        </div>
      )}
      <BidsTable round={round} controls={controls} handlers={handlers} />
    </Card>
  );
}

/**
 * Every bidding round of a project, newest first (GET /projects/:id/bidding, or `bidding` in the PACC project
 * view). Read-only without `handlers`.
 */
export default function BiddingRounds({ bidding, handlers, emptyAction, emptyDescription }) {
  const rounds = [...(bidding?.rounds || [])].reverse();
  if (!rounds.length) {
    return (
      <EmptyState
        icon={Gavel}
        title="No bidding recorded"
        description={emptyDescription || 'No bidding round has been recorded for this project.'}
        action={emptyAction}
      />
    );
  }
  return (
    <div className="space-y-4">
      {rounds.map((r) => <RoundCard key={r.id} round={r} permissions={bidding.permissions} handlers={handlers} />)}
    </div>
  );
}
