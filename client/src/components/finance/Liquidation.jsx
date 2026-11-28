import { ExternalLink, FileText, Image as ImageIcon, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Pill } from '../common/Badges.jsx';
import { date, dateTime, peso, pct } from '../../lib/format.js';
import { isPdf, liquidationNote, liquidationStatusMeta, receiptStatusMeta, receiptUploader } from '../../lib/liquidation.js';

/** Share of the money to liquidate that accepted receipts cover, as one bar. */
export function LiquidationBar({ value, className = '' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-slate-200 ${className}`} role="img" aria-label={`${v.toFixed(1)}% liquidated`}>
      <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

/**
 * The project's liquidation summary (GET /projects/:id/finance → liquidation, or the PACC view). Counts of
 * receipts awaiting review and returned are left out when the summary has none (the public summary).
 */
export function LiquidationSummary({ liquidation: l }) {
  if (!l) return null;
  const note = liquidationNote(l);
  const rows = [
    ['Revised contract amount', peso(l.revised_contract_amount)],
    ['Disbursed', peso(l.total_disbursed)],
    ['Other expenses', peso(l.total_expenses)],
    ['To liquidate (disbursed + expenses)', peso(l.total_to_liquidate), true],
    ['Liquidated (accepted receipts)', peso(l.liquidated), true],
    ['Unliquidated', peso(l.unliquidated)],
  ];
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-600">Liquidated</span>
          <span className="text-lg font-bold tabular-nums text-slate-900">{pct(l.liquidated_pct, 1)}</span>
        </div>
        <LiquidationBar value={l.liquidated_pct} className="mt-1.5" />
        {note && <p className="mt-1.5 text-xs font-semibold text-red-700">{note}</p>}
      </div>
      <dl className="divide-y divide-slate-100">
        {rows.map(([k, v, strong]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="text-slate-600">{k}</dt>
            <dd className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {(l.submitted_count !== undefined || l.returned_count !== undefined) && (
        <div className="flex flex-wrap gap-2">
          <Pill className="bg-emerald-50 text-emerald-800">{l.accepted_count} accepted</Pill>
          <Pill className="bg-amber-50 text-amber-800">{l.submitted_count} awaiting review</Pill>
          <Pill className="bg-red-50 text-red-800">{l.returned_count} returned</Pill>
        </div>
      )}
    </div>
  );
}

/** A record's liquidation status: chip, the % and amount liquidated, and an over-liquidation note. */
export function RecordLiquidationCell({ liquidation: l }) {
  const meta = liquidationStatusMeta(l?.status);
  if (!meta) return <span className="text-xs text-slate-400">—</span>;
  const note = liquidationNote(l);
  return (
    <div className="space-y-0.5">
      <Pill className={meta.cls}>{meta.label}</Pill>
      <p className="whitespace-nowrap text-[11px] tabular-nums text-slate-500">{pct(l.liquidated_pct, 0)} · {peso(l.liquidated_amount)}</p>
      {note && <p className="whitespace-nowrap text-[11px] font-semibold text-red-700">{note}</p>}
    </div>
  );
}

export function ReceiptFileIcon({ mime }) {
  const Icon = isPdf(mime) ? FileText : ImageIcon;
  return <Icon className="h-4 w-4" aria-hidden />;
}

/**
 * A record's receipts for signed-in viewers. Without `onAccept` / `onReturn` / `onDelete` it is read-only
 * (PACC, a contractor's accepted receipts…): the file opens in a new tab through a plain link.
 * `canReview` shows Accept / Return on submitted receipts; Delete follows each receipt's `can_delete`.
 */
export function ReceiptList({ receipts = [], canReview = false, onAccept, onReturn, onDelete, busyId, emptyText = 'No receipts yet.' }) {
  if (!receipts.length) return <p className="text-sm text-slate-500">{emptyText}</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-lg bg-white ring-1 ring-slate-200">
      {receipts.map((r) => {
        const status = receiptStatusMeta(r.status);
        const busy = busyId === r.id;
        return (
          <li key={r.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5 text-sm">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-700"><ReceiptFileIcon mime={r.mime_type} /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <Pill className={status.cls}>{status.label}</Pill>
                <span className="font-semibold tabular-nums text-slate-900">{peso(r.amount)}</span>
                <span className="text-xs text-slate-500">Receipt date {date(r.receipt_date)}</span>
              </p>
              {r.description && <p className="mt-1 break-words text-slate-700">{r.description}</p>}
              {r.status === 'returned' && r.review_note && (
                <p className="mt-1 break-words rounded bg-red-50 px-2 py-1 text-xs text-red-800">
                  <span className="font-semibold">Returned{r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ''}:</span> {r.review_note}
                </p>
              )}
              <p className="mt-1 text-[11px] text-slate-400">
                Uploaded by {receiptUploader(r)} · {dateTime(r.created_at)}
                {r.status === 'accepted' && ` · Accepted${r.reviewed_by_name ? ` by ${r.reviewed_by_name}` : ''} ${dateTime(r.reviewed_at)}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open<span className="sr-only"> receipt of {peso(r.amount)} (new tab)</span>
                </a>
              ) : (
                <span className="text-xs text-slate-400">File not available</span>
              )}
              {canReview && r.status === 'submitted' && onAccept && (
                <button type="button" disabled={busy} onClick={() => onAccept(r)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Accept
                </button>
              )}
              {canReview && r.status === 'submitted' && onReturn && (
                <button type="button" disabled={busy} onClick={() => onReturn(r)} className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:opacity-50">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Return
                </button>
              )}
              {r.can_delete && onDelete && (
                <button type="button" disabled={busy} onClick={() => onDelete(r)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" aria-label={`Delete the receipt of ${peso(r.amount)}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
