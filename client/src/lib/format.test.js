import { describe, expect, it } from 'vitest';
import { buildQuery } from './api.js';
import { pct, peso, titleCase } from './format.js';

describe('format', () => {
  it('formats pesos and percentages', () => {
    expect(peso(1234.5)).toMatch(/1,234\.50/);
    expect(peso(null)).toBe('—');
    expect(pct(12.345)).toBe('12.3%');
  });
  it('title-cases enum values', () => {
    expect(titleCase('for_investigation')).toBe('For Investigation');
  });
});

describe('buildQuery', () => {
  it('drops empty values', () => {
    expect(buildQuery({ a: 1, b: '', c: null, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(buildQuery({})).toBe('');
  });
});
