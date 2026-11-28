import { BadgeCheck } from 'lucide-react';
import { FLAG_META, STATUS_META } from '../../lib/constants.js';
import { statusLabel } from '../../lib/progress.js';

/**
 * Project status. `verifiedAt` (projects.completion_verified_at, 030): pass it wherever the row has it, so a
 * Completed project reads "Completed – awaiting verification" (99%) or "Completed – verified" (100%). Left out
 * (undefined), e.g. for the status at a past flag check, Completed stays "Completed".
 */
export function StatusBadge({ status, verifiedAt }) {
  if (['terminated', 'suspended'].includes(status)) return null; // removed statuses (no project uses them)
  const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  const withVerification = status === 'completed' && verifiedAt !== undefined;
  const label = withVerification ? statusLabel(status, verifiedAt) : m.label;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${m.cls}`}>
      {withVerification && verifiedAt && <BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
      {label}
    </span>
  );
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
