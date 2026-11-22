import { describe, expect, it } from 'vitest';
import { buildQuery } from './api.js';
import { pct, peso, pesoWhole, sentenceCase, titleCase } from './format.js';

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

describe('public drawer formatting', () => {
  it('shows whole pesos without .00 and keeps centavos when there are any', () => {
    expect(pesoWhole(76128000)).toBe('₱76,128,000');
    expect(pesoWhole('52002000.50')).toBe('₱52,002,000.50');
    expect(pesoWhole(null)).toBe('—');
  });
  it('turns stored Title Case names into sentence case but keeps place names and codes', () => {
    const places = ['Iriron', 'Buenavista', 'Talabaan', 'Tangkalan', 'Sablayan', 'Claudio Salgado', 'San Jose', 'Rizal', 'Murtha'];
    expect(sentenceCase('Construction of Flood Control Structure along Iriron River', places)).toBe('Construction of flood control structure along Iriron river');
    expect(sentenceCase('Concreting of Talabaan–Tangkalan Farm-to-Market Road', places)).toBe('Concreting of Talabaan–Tangkalan farm-to-market road');
    expect(sentenceCase('Construction of Multi-Purpose Evacuation Center, Barangay Buenavista', places)).toBe('Construction of multi-purpose evacuation center, Barangay Buenavista');
    expect(sentenceCase('Road Widening of Sablayan–Claudio Salgado Section, K0201+000–K0203+400', places)).toBe('Road widening of Sablayan–Claudio Salgado section, K0201+000–K0203+400');
    expect(sentenceCase('Construction of Causeway with Roll-on/Roll-off (RoRo) Ramp', places)).toBe('Construction of causeway with roll-on/roll-off (RoRo) ramp');
    expect(sentenceCase('Construction of Murtha Bridge along San Jose–Rizal Road', places)).toBe('Construction of Murtha bridge along San Jose–Rizal road');
    expect(sentenceCase('Construction of Flood Control Structure along Pandurucan River, Bubog Section', places)).toBe('Construction of flood control structure along Pandurucan river, bubog section');
    expect(sentenceCase('Concreting of Tilik Port Access Road', places)).toBe('Concreting of Tilik port access road');
    expect(sentenceCase('Concreting of Lourdes–Nicolas Barangay Road', ['Lourdes', 'Nicolas'])).toBe('Concreting of Lourdes–Nicolas barangay road');
    expect(sentenceCase('Replacement of Balao Bridge along Mindoro West Coastal Road', ['Balao'])).toBe('Replacement of Balao bridge along Mindoro west coastal road');
  });
});
