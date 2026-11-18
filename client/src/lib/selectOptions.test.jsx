import { describe, expect, it } from 'vitest';
import { changeEvent, flattenOptions, widthClass } from './selectOptions.js';
import { formatDisplayDate, parseIsoDate, toIsoDate } from './dateUtils.js';

describe('flattenOptions', () => {
  it('reads native <option> children, mapped arrays and fragments', () => {
    const items = [{ id: 7, name: 'Mamburao' }, { id: 9, name: 'Sablayan' }];
    const opts = flattenOptions(
      <>
        <option value="">All municipalities</option>
        {items.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.id})
          </option>
        ))}
        <option value="x" disabled>
          Disabled
        </option>
      </>,
    );
    expect(opts).toEqual([
      { value: '', label: 'All municipalities', disabled: false },
      { value: '7', label: 'Mamburao (7)', disabled: false },
      { value: '9', label: 'Sablayan (9)', disabled: false },
      { value: 'x', label: 'Disabled', disabled: true },
    ]);
  });

  it('emits native-like change events', () => {
    expect(changeEvent('5', 'flag').target).toEqual({ value: '5', name: 'flag', type: 'select-one' });
  });

  it('defaults to full width unless a base width class is given', () => {
    expect(widthClass('sm:w-48')).toBe('w-full');
    expect(widthClass('w-52')).toBe('');
  });
});

describe('dateUtils', () => {
  it('round-trips YYYY-MM-DD without timezone drift', () => {
    expect(toIsoDate(parseIsoDate('2026-11-16'))).toBe('2026-11-16');
    expect(toIsoDate(parseIsoDate('2024-02-29'))).toBe('2024-02-29');
  });
  it('handles empty and invalid values', () => {
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('not a date')).toBeNull();
    expect(toIsoDate(null)).toBe('');
  });
  it('formats for display', () => {
    expect(formatDisplayDate(parseIsoDate('2026-11-16'))).toMatch(/Nov 16, 2026/);
  });
});
