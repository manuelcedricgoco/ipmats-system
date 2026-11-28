import { describe, expect, it } from 'vitest';
import { pointsBehind, rowPointsBehind } from './progress.js';

describe('pointsBehind (030)', () => {
  it('planned − actual for a project that is not Completed', () => {
    expect(pointsBehind(40, 50)).toBe(10);
    expect(pointsBehind(80, 70, 'ongoing')).toBe(-10);
    expect(pointsBehind(33.335, 50.001, 'delayed')).toBe(16.67);
  });
  it('0 for a Completed project (99% awaiting verification vs a plan of 100%)', () => {
    expect(pointsBehind(99, 100, 'completed')).toBe(0);
    expect(rowPointsBehind({ overall_progress: 99, planned_progress: 100, status: 'completed' })).toBe(0);
  });
  it('0 without a plan', () => {
    expect(pointsBehind(20, null)).toBe(0);
    expect(rowPointsBehind(null)).toBe(0);
  });
});
