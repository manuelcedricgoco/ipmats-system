import { FLAG_META, STATUS_META } from '../../lib/constants.js';

export function StatusBadge({ status }) {
  if (['terminated', 'suspended', 'completed'].includes(status)) return null;
  const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

export function Pill({ children, className = 'bg-slate-100 text-slate-700' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

/** WEEK 3 — Green / Yellow / Red flag. `flag` null = not evaluated (or, on the portal, under review). */
export function FlagBadge({ flag, long = false, size = 'md', emptyLabel = 'Not evaluated' }) {
  const sz = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  if (!flag) return <span className={`inline-flex items-center whitespace-nowrap rounded-full bg-slate-100 font-semibold text-slate-600 ring-1 ring-inset ring-slate-300 ${sz}`}>{emptyLabel}</span>;
  const m = FLAG_META[flag];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${m.bg} ${m.text} ${m.ring} ${sz}`}>
      <span className="relative flex h-2 w-2" aria-hidden>
        {flag === 'red' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${m.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${m.dot}`} />
      </span>
      {long ? `${m.label} · ${m.long}` : m.label}
    </span>
  );
}
