import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { changeEvent, flattenOptions, widthClass } from '../../lib/selectOptions.js';

const control =
  'relative flex w-full items-center rounded-lg bg-white text-left text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 transition-[box-shadow,background-color] duration-150 hover:ring-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 data-[open]:ring-2 data-[open]:ring-brand-600 data-[disabled]:cursor-not-allowed data-[disabled]:bg-slate-50 data-[disabled]:text-slate-400 data-[disabled]:hover:ring-slate-300';

const panel =
  'z-[1600] max-h-72 w-max min-w-[var(--button-width)] max-w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-popover [--anchor-gap:6px] [--anchor-padding:8px] focus:outline-none origin-top transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0';

const optionCls =
  'group flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-slate-700 transition-colors data-[focus]:bg-brand-50 data-[focus]:text-brand-900 data-[selected]:font-semibold data-[selected]:text-brand-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40';

function OptionRow({ label }) {
  return (
    <>
      <Check className="h-4 w-4 shrink-0 text-brand-700 opacity-0 group-data-[selected]:opacity-100" aria-hidden />
      <span className="whitespace-normal">{label}</span>
    </>
  );
}

/** Keeps native form validation for `required` (the custom control has no form value). */
function RequiredMirror({ value }) {
  return (
    <input
      tabIndex={-1}
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
      required
      value={value}
      onChange={() => {}}
    />
  );
}

/**
 * Modern dropdown with the same API as a native <select>:
 *   <Select value={v} onChange={(e) => set(e.target.value)}><option value="">All</option>…</Select>
 * Lists with more than 8 options are searchable (combobox).
 */
export default function Select({
  value,
  onChange,
  children,
  disabled = false,
  required = false,
  className = '',
  id,
  name,
  searchable,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}) {
  const options = useMemo(() => flattenOptions(children), [children]);
  const current = String(value ?? '');
  const selected = options.find((o) => o.value === current);
  const emit = (v) => onChange?.(changeEvent(v ?? '', name));
  const useSearch = searchable ?? options.length > 8;
  const [query, setQuery] = useState('');
  const aria = { id, 'aria-label': ariaLabel, 'aria-invalid': ariaInvalid, 'aria-describedby': ariaDescribedBy };
  const wrapper = `relative ${widthClass(className)} ${className}`;

  if (useSearch) {
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return (
      <div className={wrapper}>
        <Combobox value={current} onChange={emit} onClose={() => setQuery('')} disabled={disabled} immediate>
          <div className={`${control} pl-8 focus-within:ring-2 focus-within:ring-brand-600`} data-disabled={disabled || undefined}>
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <ComboboxInput
              {...aria}
              className="w-full truncate rounded-md bg-transparent py-2 pr-8 text-sm outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              displayValue={(v) => options.find((o) => o.value === String(v ?? ''))?.label ?? ''}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Type to search…"
              autoComplete="off"
            />
            <ComboboxButton className="group absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 hover:text-slate-600" aria-label="Show options">
              <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[open]:rotate-180" aria-hidden />
            </ComboboxButton>
          </div>
          <ComboboxOptions anchor="bottom start" transition className={panel.replace('--button-width', '--input-width')}>
            {filtered.length === 0 && <div className="px-3 py-2 text-slate-500">No matches for “{query}”</div>}
            {filtered.map((o) => (
              <ComboboxOption key={o.value} value={o.value} disabled={o.disabled} className={optionCls}>
                <OptionRow label={o.label} />
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </Combobox>
        {required && <RequiredMirror value={current} />}
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <Listbox value={current} onChange={emit} disabled={disabled}>
        <ListboxButton {...aria} className={`${control} group py-2 pl-3 pr-9`}>
          <span className={`block truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label ?? 'Select…'}</span>
          <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-slate-400 transition-transform duration-200 group-data-[open]:rotate-180" aria-hidden />
        </ListboxButton>
        <ListboxOptions anchor="bottom start" transition className={panel}>
          {options.map((o) => (
            <ListboxOption key={o.value} value={o.value} disabled={o.disabled} className={optionCls}>
              <OptionRow label={o.label} />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
      {required && <RequiredMirror value={current} />}
    </div>
  );
}
