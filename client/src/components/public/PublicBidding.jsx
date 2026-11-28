import { Gavel, Trophy } from 'lucide-react';
import { Pill } from '../common/Badges.jsx';
import { Skeleton } from '../common/Feedback.jsx';
import { useApi } from '../../hooks/useApi.js';
import { eligibilityMeta, publicRoundHeadline, rankLabel, roundStatusMeta } from '../../lib/bidding.js';
import { date, pesoWhole } from '../../lib/format.js';

/**
 * PUBLIC PORTAL — the abstract of bids (032), newest round first (GET /public/projects/:id/bidding). Every round's
 * number, status, opening date and ABC; once a round is evaluated, every bidder with its amount, eligibility (and
 * the reason a bid failed), rank and the winner; the reason for a failure of bidding. An open round shows only
 * that bidding is open: the API sends no bids for it. The API sends no ids, staff notes or anyone's identity.
 */
export function PublicBiddingView({ data }) {
  const rounds = [...(data?.rounds || [])].reverse();
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bidding</p>
      {rounds.length === 0 && <p className="text-xs text-slate-500">No bidding is recorded for this project.</p>}
      {rounds.map((r) => (
        <section key={r.round_no} className="rounded-md ring-1 ring-slate-200" aria-label={`Bidding round ${r.round_no}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-2">
            <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-slate-900">
              Round {r.round_no}
              <Pill className={roundStatusMeta(r.status).cls}>{publicRoundHeadline(r)}</Pill>
            </p>
            <p className="text-xs text-slate-500">Opening {date(r.opening_date)}</p>
          </div>
          <div className="space-y-1.5 px-2.5 py-2 text-[13px]">
            <p className="text-slate-600">ABC <span className="font-semibold tabular-nums text-slate-900">{pesoWhole(r.abc)}</span></p>
            {r.status === 'awarded' && r.awarded_at && <p className="text-xs text-emerald-800">Awarded {date(r.awarded_at)}</p>}
            {r.status === 'failed' && r.failure_reason && <p className="break-words text-xs text-red-800">Failure of bidding: {r.failure_reason}</p>}
            {r.status === 'open' ? (
              <p className="text-xs text-slate-500">
                <Gavel className="mr-1 inline h-3 w-3" aria-hidden />
                The bids are shown once they are evaluated.
              </p>
            ) : r.bids.length === 0 ? (
              <p className="text-xs text-slate-500">No bids were received.</p>
            ) : (
              <ol className="divide-y divide-slate-100" aria-label={`Abstract of bids, round ${r.round_no}`}>
                {r.bids.map((b, i) => (
                  <li key={`${b.contractor_name}-${i}`} className="flex items-start gap-2 py-1.5">
                    <span className="w-5 shrink-0 text-center text-xs font-semibold tabular-nums text-slate-500" title="Rank">{rankLabel(b.rank)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="break-words font-medium text-slate-900">{b.contractor_name || '—'}</span>
                        {b.is_winner && (
                          <Pill className="bg-emerald-700 text-white"><Trophy className="mr-1 h-3 w-3" aria-hidden />Winner</Pill>
                        )}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-semibold tabular-nums text-slate-800">{pesoWhole(b.amount)}</span>
                        <Pill className={eligibilityMeta(b.eligibility).cls}>{eligibilityMeta(b.eligibility).label}</Pill>
                      </p>
                      {b.eligibility_note && <p className="break-words text-xs text-slate-500">{b.eligibility_note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function PublicBidding({ projectId }) {
  // Same call style as the drawer's GET /public/projects/:id and the liquidation (no `anonymous`).
  const { data, loading, error, reload } = useApi(projectId ? `/public/projects/${projectId}/bidding` : null, undefined, { select: (r) => r.data });
  if (error) {
    return (
      <p className="text-xs text-slate-500">
        The bidding could not be loaded.{' '}
        <button type="button" onClick={reload} className="font-semibold text-brand-700 hover:underline">Try again</button>
      </p>
    );
  }
  if (loading && !data) return <Skeleton className="h-16 w-full" />;
  return <PublicBiddingView data={data} />;
}
