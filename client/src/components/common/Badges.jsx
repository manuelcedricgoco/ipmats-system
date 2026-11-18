import { STATUS_META } from '../../lib/constants.js';

export function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return <span className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${m.cls}`}>{m.label}</span>;
}

export function Pill({ children, className = 'bg-slate-100 text-slate-700' }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}
