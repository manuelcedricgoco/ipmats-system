import { ExternalLink, FileText, Image as ImageIcon, ReceiptText } from 'lucide-react';
import { Skeleton } from '../common/Feedback.jsx';
import { useApi } from '../../hooks/useApi.js';
import { date, pct, pesoWhole } from '../../lib/format.js';
import { PUBLIC_RECEIPT_TYPES, isPdf, liquidationNote } from '../../lib/liquidation.js';

/**
 * PUBLIC PORTAL — finance liquidation (031): how much of the money released for the project is backed by receipts
 * the Auditor accepted, and those receipts (GET /public/projects/:id/liquidation). The API sends only accepted
 * receipts (amount, date, description, record type, file type, a 10-minute link): no file name, uploader, reviewer
 * or review note.
 */
export function PublicLiquidationView({ data }) {
  const s = data?.summary;
  if (!s) return null;
  const receipts = data.receipts || [];
  const note = liquidationNote(s);
  const v = Math.max(0, Math.min(100, Number(s.liquidated_pct) || 0));
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liquidation</p>
        <p className="text-xs text-slate-600">
          Liquidated <span className="font-semibold tabular-nums text-slate-900">{pct(s.liquidated_pct, 1)}</span>
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${v.toFixed(1)}% liquidated`}>
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${v}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-slate-500">Released (disbursed + expenses)</dt>
        <dd className="text-right tabular-nums text-slate-900">{pesoWhole(s.total_to_liquidate)}</dd>
        <dt className="text-slate-500">Backed by accepted receipts</dt>
        <dd className="text-right tabular-nums text-slate-900">{pesoWhole(s.liquidated)}</dd>
        <dt className="text-slate-500">Not yet liquidated</dt>
        <dd className="text-right tabular-nums text-slate-900">{pesoWhole(s.unliquidated)}</dd>
      </dl>
      {note && <p className="text-xs font-semibold text-red-700">{note}</p>}
      {receipts.length === 0 ? (
        <p className="text-xs text-slate-500">No accepted receipts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-200" aria-label="Accepted receipts">
          {receipts.map((r) => {
            const Icon = isPdf(r.mime_type) ? FileText : ImageIcon;
            return (
              <li key={r.id} className="flex items-start gap-2 px-2.5 py-2 text-[13px]">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-label={isPdf(r.mime_type) ? 'PDF' : 'Image'} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold tabular-nums text-slate-900">{pesoWhole(r.amount)}</span>
                    <span className="text-xs text-slate-500">{PUBLIC_RECEIPT_TYPES[r.record_type] || r.record_type} · {date(r.receipt_date)}</span>
                  </p>
                  {r.description && <p className="break-words text-xs text-slate-600">{r.description}</p>}
                </div>
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                    Open<ExternalLink className="h-3 w-3" aria-hidden /><span className="sr-only"> receipt (new tab)</span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-slate-400">
        <ReceiptText className="mr-1 inline h-3 w-3" aria-hidden />
        Only receipts accepted by the Auditor are shown and counted.
      </p>
    </div>
  );
}

export default function PublicLiquidation({ projectId }) {
  // Same call style as the drawer's GET /public/projects/:id (no `anonymous`; that is kept for citizen reports).
  const { data, loading, error, reload } = useApi(projectId ? `/public/projects/${projectId}/liquidation` : null, undefined, { select: (r) => r.data });
  if (error) {
    return (
      <p className="text-xs text-slate-500">
        The liquidation could not be loaded.{' '}
        <button type="button" onClick={reload} className="font-semibold text-brand-700 hover:underline">Try again</button>
      </p>
    );
  }
  if (loading && !data) return <Skeleton className="h-16 w-full" />;
  return <PublicLiquidationView data={data} />;
}
