/**
 * WEEK 2 — progress bar with an optional "planned" marker.
 * Green = on or ahead of plan, amber = up to 10 points behind, red = more than 10 points behind.
 */
export default function ProgressBar({ value = 0, planned = null, label = true, size = 'md', className = '' }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const behind = planned == null ? 0 : Number(planned) - v;
  const tone = planned == null ? 'bg-brand-600' : behind > 10 ? 'bg-red-600' : behind > 0.5 ? 'bg-amber-500' : 'bg-emerald-600';
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className={`min-w-[7rem] ${className}`}>
      <div className={`relative ${h} overflow-hidden rounded-full bg-slate-200`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={`${v.toFixed(1)}% complete`}>
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone}`} style={{ width: `${v}%` }} />
        {planned != null && (
          <span className="absolute inset-y-0 w-0.5 bg-slate-900/70" style={{ left: `calc(${Math.min(100, Number(planned))}% - 1px)` }} title={`Planned ${Number(planned).toFixed(1)}%`} />
        )}
      </div>
      {label && (
        <p className="mt-1 flex justify-between gap-2 text-xs tabular-nums text-slate-600">
          <span className="font-semibold text-slate-800">{v.toFixed(1)}%</span>
          {planned != null && <span>plan {Number(planned).toFixed(1)}%</span>}
        </p>
      )}
    </div>
  );
}
