import { AlertTriangle, Info, Inbox, RefreshCw } from 'lucide-react';

export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/** Shimmering placeholder block. */
export function Skeleton({ className = 'h-4 w-full' }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-slate-200/70 ${className}`} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/60 to-transparent motion-reduce:hidden" />
    </div>
  );
}

/** Skeleton of a typical page (header, stat cards, table rows). `compact` for use inside a card. */
export function PageLoader({ label = 'Loading…', compact = false, withHeader = true }) {
  if (compact) {
    return (
      <div className="space-y-3 p-4" role="status" aria-live="polite">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="animate-fade-in space-y-6" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {withHeader && (
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      )}
      {withHeader && (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      )}
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-2 w-40 sm:block" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex animate-fade-in flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-slate-400" aria-hidden />
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="flex animate-fade-in flex-col items-center rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
      <AlertTriangle className="h-7 w-7 text-red-600" aria-hidden />
      <h3 className="mt-2 text-sm font-semibold text-red-900">{error?.status === 404 ? 'Not found' : title}</h3>
      <p className="mt-1 max-w-md text-sm text-red-800">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-red-800 hover:underline">
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}

const ALERT = {
  info: ['border-brand-200 bg-brand-50 text-brand-900', Info],
  warning: ['border-amber-200 bg-amber-50 text-amber-900', AlertTriangle],
  error: ['border-red-200 bg-red-50 text-red-900', AlertTriangle],
};

export function Alert({ tone = 'info', title, children, className = '' }) {
  const [cls, Icon] = ALERT[tone];
  return (
    <div className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${cls} ${className}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5' : ''}>{children}</div>
      </div>
    </div>
  );
}
