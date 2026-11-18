import { useId } from 'react';
import DatePicker from './DatePicker.jsx';
import CustomSelect from './Select.jsx';

const base =
  'block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition-[box-shadow] duration-150 placeholder:text-slate-400 hover:ring-slate-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500 disabled:hover:ring-slate-300';

export function Field({ label, hint, error, required, children, className = '' }) {
  const id = useId();
  const child = typeof children === 'function' ? children({ id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': error || hint ? `${id}-desc` : undefined }) : children;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
        </label>
      )}
      {child}
      {(error || hint) && (
        <p id={`${id}-desc`} className={`mt-1 text-xs ${error ? 'text-red-700' : 'text-slate-500'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

/** Text input; `type="date"` renders the calendar DatePicker with the same API. */
export function Input({ className = '', invalid, type, ...props }) {
  if (type === 'date') return <DatePicker className={className} {...props} />;
  // Fields with onChange are always controlled (avoids React's uncontrolled→controlled warning while a form loads).
  const value = props.onChange && props.value == null ? '' : props.value;
  return <input type={type} className={`${base} ${invalid ? 'ring-red-400' : ''} ${className}`} {...props} value={value} />;
}

/** Modern dropdown (Headless UI) with the native <select> API. */
export const Select = CustomSelect;

export function Textarea({ className = '', rows = 3, invalid, ...props }) {
  const value = props.onChange && props.value == null ? '' : props.value;
  return <textarea rows={rows} className={`${base} ${invalid ? 'ring-red-400' : ''} ${className}`} {...props} value={value} />;
}

export function Checkbox({ label, description, ...props }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-700 transition-colors focus:ring-brand-600" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

/** Turn API validation details into { field: message }. */
export function fieldErrors(err) {
  return Object.fromEntries((err?.details || []).map((d) => [d.field, d.message]));
}
