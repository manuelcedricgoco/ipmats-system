import { describe, expect, it } from 'vitest';
import { FLAG_META } from './constants.js';
import { PUBLIC_FLAG_LEGEND, UNDER_REVIEW, publicFlagMarker } from './publicFlag.js';

describe('publicFlagMarker', () => {
  it('uses the flag colour once an auditor has reviewed it', () => {
    expect(publicFlagMarker({ public_flag: 'red' })).toEqual({ color: FLAG_META.red.color, label: 'Red · For investigation' });
    expect(publicFlagMarker({ public_flag: 'green' }).color).toBe(FLAG_META.green.color);
  });
  it('shows gray "Under review" when there is no reviewed flag', () => {
    expect(publicFlagMarker({ public_flag: null })).toEqual({ color: UNDER_REVIEW.color, label: 'Under review' });
    expect(publicFlagMarker({})).toEqual({ color: UNDER_REVIEW.color, label: 'Under review' });
  });
  it('never falls back to the status colour', () => {
    expect(publicFlagMarker({ status: 'delayed', public_flag: null }).label).toBe('Under review');
  });
  it('the legend lists Green, Yellow, Red, then Under review', () => {
    expect(PUBLIC_FLAG_LEGEND.map((x) => x.label)).toEqual(['Green · On track / completed', 'Yellow · Needs attention', 'Red · For investigation', 'Under review']);
  });
});
