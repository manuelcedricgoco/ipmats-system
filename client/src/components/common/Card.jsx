export function Card({ children, className = '', as: As = 'section', interactive = false, ...props }) {
  const hover = interactive ? 'transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card-hover' : '';
  return (
    <As className={`rounded-lg border border-slate-200 bg-white shadow-card ${hover} ${className}`} {...props}>
      {children}
    </As>
  );
}

export function CardHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    yellow: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <Card className="group p-4" interactive>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {Icon && (
          <span className={`rounded-md p-2 transition-transform duration-200 group-hover:scale-110 ${tones[tone]}`}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
    </Card>
  );
}

export function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Definition list of label/value rows. */
export function DetailList({ items, className = '' }) {
  return (
    <dl className={`divide-y divide-slate-100 text-sm ${className}`}>
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="grid grid-cols-5 gap-3 py-2">
          <dt className="col-span-2 text-slate-500">{label}</dt>
          <dd className="col-span-3 break-words font-medium text-slate-900">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
