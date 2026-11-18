// WEEK 2 — overall completion and finance summary (services/completion.js)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeOverallProgress, computePlannedProgress, planFromTemplate, summarizeFinance } from '../services/completion.js';

describe('computeOverallProgress', () => {
  it('weights each phase: 10@100 + 20@100 + 20@50 + 35@0 + 15@0 = 40%', () => {
    const phases = [
      { weight: 10, accomplishment: 100 },
      { weight: 20, accomplishment: 100 },
      { weight: 20, accomplishment: 50 },
      { weight: 35, accomplishment: 0 },
      { weight: 15, accomplishment: 0 },
    ];
    assert.equal(computeOverallProgress(phases), 40);
  });
  it('is 0 with no phases and 100 when every phase is done', () => {
    assert.equal(computeOverallProgress([]), 0);
    assert.equal(computeOverallProgress([{ weight: 60, accomplishment: 100 }, { weight: 40, accomplishment: 100 }]), 100);
  });
});

describe('computePlannedProgress', () => {
  const project = { notice_to_proceed: '2026-01-01', target_completion_date: '2026-01-11' };
  it('falls back to a straight line from NTP to target completion', () => {
    assert.equal(computePlannedProgress(project, [], '2026-01-06'), 50);
    assert.equal(computePlannedProgress(project, [], '2025-12-01'), 0);
    assert.equal(computePlannedProgress(project, [], '2026-02-01'), 100);
  });
  it('uses the phase windows when they are dated', () => {
    const phases = [
      { weight: 50, planned_start: '2026-01-01', planned_end: '2026-01-05' },
      { weight: 50, planned_start: '2026-01-06', planned_end: '2026-01-11' },
    ];
    assert.equal(computePlannedProgress(project, phases, '2026-01-05'), 50);
  });
});

describe('planFromTemplate', () => {
  it('creates phases whose weights total 100 and fit inside the contract duration', () => {
    const plan = planFromTemplate('road', '2026-01-01', 100);
    assert.equal(plan.reduce((s, p) => s + p.weight, 0), 100);
    assert.equal(plan[0].planned_start, '2026-01-01');
    assert.equal(plan.at(-1).planned_end, '2026-04-11');
  });
});

describe('summarizeFinance', () => {
  it('computes revised contract, disbursed, remaining balance and utilization', () => {
    const s = summarizeFinance({ approved_budget: 1200, contract_amount: 1000 }, [
      { record_type: 'variation_order', amount: 50 },
      { record_type: 'disbursement', amount: 420 },
      { record_type: 'obligation', amount: 1050 },
    ]);
    assert.equal(s.revised_contract_amount, 1050);
    assert.equal(s.total_disbursed, 420);
    assert.equal(s.remaining_balance, 630);
    assert.equal(s.utilization_pct, 40);
  });
});
