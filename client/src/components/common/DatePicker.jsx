import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { CalendarDays, X } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { formatDisplayDate, parseIsoDate, toIsoDate } from '../../lib/dateUtils.js';
import { changeEvent, widthClass } from '../../lib/selectOptions.js';

/**
 * Calendar date picker with the same API as <input type="date">:
 *   value / min / max are 'YYYY-MM-DD'; onChange(e) receives e.target.value.
 */
export default function DatePicker({
  value,
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  className = '',
  id,
  name,
  placeholder = 'Select a date',
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}) {
  const selected = parseIsoDate(value);
  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayAllowed = (!minDate || today >= minDate) && (!maxDate || today <= maxDate);
  const emit = (iso) => onChange?.(changeEvent(iso, name, 'date'));
  const disabledDays = [minDate && { before: minDate }, maxDate && { after: maxDate }].filter(Boolean);

  return (
    <div className={`relative ${widthClass(className)} ${className}`}>
      <Popover>
        <PopoverButton
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ? `${ariaLabel}${selected ? `: ${formatDisplayDate(selected)}` : ''}` : undefined}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          aria-haspopup="dialog"
          className="group relative flex w-full items-center gap-2 rounded-md bg-white py-2 pl-3 pr-3 text-left text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition-[box-shadow] duration-150 hover:ring-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 data-[open]:ring-2 data-[open]:ring-brand-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600 group-data-[open]:text-brand-600" aria-hidden />
          <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? formatDisplayDate(selected) : placeholder}</span>
        </PopoverButton>
        <PopoverPanel
          anchor="bottom start"
          transition
          focus
          className="z-[1600] rounded-xl border border-slate-200 bg-white p-3 shadow-popover [--anchor-gap:6px] [--anchor-padding:8px] origin-top-left transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
        >
          {({ close }) => (
            <div className="dpwh-calendar">
              <DayPicker
                mode="single"
                required
                selected={selected ?? undefined}
                defaultMonth={selected ?? (maxDate && maxDate < today ? maxDate : today)}
                onSelect={(d) => {
                  if (d) {
                    emit(toIsoDate(d));
                    close();
                  }
                }}
                captionLayout="dropdown"
                startMonth={minDate ?? new Date(2015, 0)}
                endMonth={maxDate ?? new Date(today.getFullYear() + 5, 11)}
                disabled={disabledDays}
                showOutsideDays
                fixedWeeks
              />
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  disabled={!todayAllowed}
                  onClick={() => {
                    emit(toIsoDate(today));
                    close();
                  }}
                  className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Today
                </button>
                {!required && selected && (
                  <button
                    type="button"
                    onClick={() => {
                      emit('');
                      close();
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden /> Clear
                  </button>
                )}
              </div>
            </div>
          )}
        </PopoverPanel>
      </Popover>
      {required && (
        <input tabIndex={-1} aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0" required value={value || ''} onChange={() => {}} />
      )}
    </div>
  );
}
