import { Ban, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { forwardRef } from 'react';
import { Spinner } from './Feedback.jsx';
import Tooltip from './Tooltip.jsx';

const TONES = {
  neutral: 'text-slate-500 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-brand-600',
  warning: 'text-amber-700 hover:bg-amber-50 hover:text-amber-800 focus-visible:outline-amber-600',
  success: 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-emerald-600',
  danger: 'text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-red-700',
};

/**
 * Icon-only button with a hover/focus tooltip. `label` is the action ("Edit") shown in the
 * tooltip and the native `title`; `ariaLabel` can name the record too ("Edit Acme Builders").
 */
const IconButton = forwardRef(function IconButton({ icon: Icon, label, ariaLabel, tone = 'neutral', loading = false, disabled = false, className = '', ...props }, ref) {
  return (
    <Tooltip label={label}>
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel || label}
        title={label}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${TONES[tone]} ${className}`}
        {...props}
      >
        {loading ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" aria-hidden />}
      </button>
    </Tooltip>
  );
});

/**
 * Edit / Suspend (or Reactivate) / Delete for one table row or card. A button is shown only
 * when its handler is given, so pages pass handlers according to the user's permissions.
 * `busy` disables every button while a request for this row is in flight.
 */
export default function RowActions({
  name,
  busy = false,
  suspended = false,
  onEdit,
  onSuspend,
  onReactivate,
  onDelete,
  suspendIcon = Ban,
  reactivateIcon = RotateCcw,
  className = '',
}) {
  const of = name ? ` ${name}` : '';
  return (
    <div className={`flex items-center justify-end gap-1 ${className}`}>
      {onEdit && <IconButton icon={Pencil} label="Edit" ariaLabel={`Edit${of}`} onClick={onEdit} disabled={busy} />}
      {suspended
        ? onReactivate && <IconButton icon={reactivateIcon} label="Reactivate" ariaLabel={`Reactivate${of}`} tone="success" onClick={onReactivate} loading={busy} />
        : onSuspend && <IconButton icon={suspendIcon} label="Suspend" ariaLabel={`Suspend${of}`} tone="warning" onClick={onSuspend} loading={busy} />}
      {onDelete && <IconButton icon={Trash2} label="Delete" ariaLabel={`Delete${of}`} tone="danger" onClick={onDelete} disabled={busy} />}
    </div>
  );
}
