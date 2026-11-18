import { peso, pct } from '../../lib/format.js';

/** WEEK 2 — disbursed vs remaining balance of a contract, as one bar. */
export default function UtilizationBar({ disbursed = 0, total = 0, compact = false }) {
  const t = Number(total) || 0;
  const d = Number(disbursed) || 0;
  const share = t > 0 ? Math.min(100, (d / t) * 100) : 0;
  return (
    <div>
      <div className={`flex overflow-hidden rounded-full bg-slate-200 ${compact ? 'h-2' : 'h-4'}`} role="img" aria-label={`${share.toFixed(1)}% of the contract disbursed`}>
        <div className="h-full bg-brand-600 transition-[width] duration-500" style={{ width: `${share}%` }} />
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-700"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" aria-hidden />Disbursed {peso(d)} ({pct(share)})</span>
          <span className="inline-flex items-center gap-1.5 text-slate-700"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" aria-hidden />Remaining {peso(t - d)}</span>
        </div>
      )}
    </div>
  );
}
