import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm" aria-label="Pagination">
      <p className="text-slate-500">
        <span className="font-medium text-slate-800">{from}</span>–<span className="font-medium text-slate-800">{to}</span> of{' '}
        <span className="font-medium text-slate-800">{total}</span>
      </p>
      <div className="flex gap-1">
        <button type="button" className="rounded-md p-1.5 text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-brand-700 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-md p-1.5 text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:text-brand-700 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
