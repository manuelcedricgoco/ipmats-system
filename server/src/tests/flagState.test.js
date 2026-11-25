// M-1 — an auditor's flag decision is sticky (services/projectEvaluation.js resolveFlagState)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFlagState } from '../services/projectEvaluation.js';

describe('resolveFlagState', () => {
  it('keeps an auditor RED override while personnel push the automatic flag to yellow, then green', () => {
    const first = resolveFlagState({ autoFlag: 'yellow', previousAutoFlag: 'green', currentFlag: 'red', reviewedFlag: 'red', reviewStatus: 'overridden' });
    assert.deepEqual(first, { current_flag: 'red', flag_review_status: 'pending' });
    const second = resolveFlagState({ autoFlag: 'green', previousAutoFlag: 'yellow', currentFlag: first.current_flag, reviewedFlag: 'red', reviewStatus: first.flag_review_status });
    assert.equal(second.current_flag, 'red');
  });

  it('a worse automatic flag replaces a reviewed GREEN and asks for review', () => {
    const r = resolveFlagState({ autoFlag: 'red', previousAutoFlag: 'green', currentFlag: 'green', reviewedFlag: 'green', reviewStatus: 'confirmed' });
    assert.deepEqual(r, { current_flag: 'red', flag_review_status: 'pending' });
  });

  it('an auditor downgrade (RED→GREEN) stands while the automatic flag is unchanged', () => {
    const r = resolveFlagState({ autoFlag: 'red', previousAutoFlag: 'red', currentFlag: 'green', reviewedFlag: 'green', reviewStatus: 'overridden' });
    assert.deepEqual(r, { current_flag: 'green', flag_review_status: 'overridden' });
  });

  it('unreviewed projects follow the automatic flag', () => {
    const r = resolveFlagState({ autoFlag: 'yellow', previousAutoFlag: 'green', currentFlag: 'green', reviewedFlag: null, reviewStatus: 'pending' });
    assert.deepEqual(r, { current_flag: 'yellow', flag_review_status: 'pending' });
  });

  it('first evaluation of a never-evaluated project', () => {
    const r = resolveFlagState({ autoFlag: 'green', previousAutoFlag: null, currentFlag: null, reviewedFlag: null, reviewStatus: 'pending' });
    assert.deepEqual(r, { current_flag: 'green', flag_review_status: 'pending' });
  });
});
