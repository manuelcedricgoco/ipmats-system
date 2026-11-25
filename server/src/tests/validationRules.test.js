// WEEK 2 — server-side checks for phase progress and financial records (services/validationRules.js)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkContractAmountChange, checkFinancialRecord, checkPhasePlan, checkProgressUpdate, checkStatusChange, isLocationChange } from '../services/validationRules.js';

const project = { id: 'p', notice_to_proceed: '2026-03-01', target_completion_date: '2026-12-31', contract_amount: 1000000, approved_budget: 1100000 };
const NOW = '2026-11-18';
const messages = (problems) => problems.map((p) => p.message).join(' | ');

describe('checkPhasePlan', () => {
  const plan = [
    { sequence_no: 1, name: 'Site Preparation', weight: 40, planned_start: '2026-03-01', planned_end: '2026-05-01' },
    { sequence_no: 2, name: 'Concreting', weight: 60, planned_start: '2026-05-02', planned_end: '2026-12-31' },
  ];
  it('accepts a valid plan', () => assert.deepEqual(checkPhasePlan({ project, phases: plan }), []));
  it('rejects weights that do not total 100%', () => {
    assert.match(messages(checkPhasePlan({ project, phases: [{ ...plan[0], weight: 30 }, plan[1]] })), /total 100%/);
  });
  it('rejects dates outside NTP → target completion', () => {
    assert.match(messages(checkPhasePlan({ project, phases: [{ ...plan[0], planned_start: '2026-02-01' }, plan[1]] })), /Notice to Proceed/);
    assert.match(messages(checkPhasePlan({ project, phases: [plan[0], { ...plan[1], planned_end: '2027-02-01' }] })), /target completion/);
  });
  it('rejects removing a phase that already has progress', () => {
    const existing = [{ id: 'a', name: 'Old phase', accomplishment: 30 }];
    assert.match(messages(checkPhasePlan({ project, phases: plan, existing })), /cannot be removed/);
  });
});

describe('checkProgressUpdate', () => {
  const phases = [
    { id: 'a', name: 'Site Preparation', weight: 40, accomplishment: 100, actual_start: '2026-03-02' },
    { id: 'b', name: 'Concreting', weight: 60, accomplishment: 50, actual_start: '2026-05-02' },
  ];
  const base = { report_date: '2026-11-15', phases: [{ phase_id: 'b', accomplishment: 60 }] };
  it('accepts a normal update', () => assert.deepEqual(checkProgressUpdate({ project, phases, update: base, now: NOW }), []));
  it('rejects a future report date and one earlier than the last report', () => {
    assert.match(messages(checkProgressUpdate({ project, phases, update: { ...base, report_date: '2026-12-01' }, now: NOW })), /future/);
    assert.match(messages(checkProgressUpdate({ project, phases, lastReportDate: '2026-11-16', update: base, now: NOW })), /date order/);
  });
  it('requires remarks when accomplishment goes down', () => {
    const lower = { ...base, phases: [{ phase_id: 'b', accomplishment: 40 }] };
    assert.match(messages(checkProgressUpdate({ project, phases, update: lower, now: NOW })), /lower than the last report/);
    assert.deepEqual(checkProgressUpdate({ project, phases, update: { ...lower, remarks: 'Corrected after site measurement' }, now: NOW }), []);
  });
  it('only allows an actual end date at 100%', () => {
    const early = { ...base, phases: [{ phase_id: 'b', accomplishment: 90, actual_end: '2026-11-10' }] };
    assert.match(messages(checkProgressUpdate({ project, phases, update: early, now: NOW })), /100% complete/);
  });
  it('only allows the project completion date when every phase is 100%', () => {
    const done = { ...base, actual_completion_date: '2026-11-15' };
    assert.match(messages(checkProgressUpdate({ project, phases, update: done, now: NOW })), /every phase is 100%/);
    const all = { ...done, phases: [{ phase_id: 'b', accomplishment: 100 }] };
    assert.deepEqual(checkProgressUpdate({ project, phases, update: all, now: NOW }), []);
  });
  it('rejects a phase from another project', () => {
    assert.match(messages(checkProgressUpdate({ project, phases, update: { ...base, phases: [{ phase_id: 'x', accomplishment: 10 }] }, now: NOW })), /does not belong/);
  });
});

describe('checkFinancialRecord', () => {
  const records = [{ record_type: 'disbursement', amount: 900000, reference_no: 'DV-001' }];
  const rec = (r) => checkFinancialRecord({ project, records, record: { record_date: '2026-11-01', ...r }, now: NOW });
  it('accepts a disbursement within the remaining balance', () => assert.deepEqual(rec({ record_type: 'disbursement', amount: 100000 }), []));
  it('rejects disbursements above the contract amount', () => {
    assert.match(messages(rec({ record_type: 'disbursement', amount: 100001 })), /above the contract amount/);
  });
  it('rejects payments before the Notice to Proceed and future dates', () => {
    assert.match(messages(rec({ record_type: 'disbursement', amount: 1, record_date: '2026-02-01' })), /Notice to Proceed/);
    assert.match(messages(rec({ record_type: 'expense', amount: 1, record_date: '2026-12-01' })), /future/);
  });
  it('limits variation orders to 10% of the original contract', () => {
    assert.deepEqual(rec({ record_type: 'variation_order', amount: 100000 }), []);
    assert.match(messages(rec({ record_type: 'variation_order', amount: 100001 })), /10%/);
  });
  it('does not let a negative variation order drop below what is already paid', () => {
    assert.match(messages(rec({ record_type: 'variation_order', amount: -100001 })), /already disbursed/);
  });
  it('rejects a duplicate reference number', () => {
    assert.match(messages(rec({ record_type: 'disbursement', amount: 1, reference_no: 'dv-001' })), /already recorded/);
  });
  it('needs an awarded contract for disbursements', () => {
    const r = checkFinancialRecord({ project: { ...project, contract_amount: null }, records: [], record: { record_type: 'disbursement', amount: 1, record_date: '2026-11-01' }, now: NOW });
    assert.match(messages(r), /contract must be awarded/);
  });
});

describe('checkStatusChange / checkContractAmountChange', () => {
  it('blocks "Completed" while a phase is below 100%', () => {
    assert.match(messages(checkStatusChange({ status: 'completed', phases: [{ name: 'Concreting', accomplishment: 80 }] })), /cannot be marked Completed/);
    assert.deepEqual(checkStatusChange({ status: 'completed', phases: [{ name: 'Concreting', accomplishment: 100 }] }), []);
  });
  it('blocks lowering the contract below what is already disbursed', () => {
    const records = [{ record_type: 'disbursement', amount: 500 }];
    assert.match(messages(checkContractAmountChange({ contractAmount: 400, records })), /already disbursed/);
    assert.deepEqual(checkContractAmountChange({ contractAmount: 600, records }), []);
  });
});

describe('isLocationChange', () => {
  const current = { latitude: 13.4, longitude: 120.7 };
  it('re-sending the same coordinates is not a change', () => {
    assert.equal(isLocationChange(current, { latitude: '13.400000', longitude: 120.7 }), false);
  });
  it('a moved site is a change', () => {
    assert.equal(isLocationChange(current, { latitude: 13.41 }), true);
  });
  it('omitting the coordinates is not a change', () => assert.equal(isLocationChange(current, {}), false));
});
