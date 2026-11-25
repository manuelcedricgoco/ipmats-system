// WEEK 3 — automatic status and flag detection (services/flagDetection.js)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateProject } from '../services/flagDetection.js';

const TODAY = '2026-11-20';
const project = {
  latitude: 13.4, longitude: 120.7, approved_budget: 1100000, contract_amount: 1000000,
  notice_to_proceed: '2026-01-01', target_completion_date: '2026-12-31', status: 'ongoing', actual_completion_date: null,
};
// Planned on TODAY ≈ 88.5% (straight line); weights total 100
const phases = (acc) => [{ weight: 40, accomplishment: Math.min(100, acc * 2.5) }, { weight: 60, accomplishment: Math.max(0, (acc - 40) / 0.6) }];
const image = (o = {}) => ({ file_hash: 'h1', latitude: 13.4001, longitude: 120.7001, captured_at: '2026-11-10T09:00:00+08:00', inspection_date: '2026-11-10', is_final: false, ...o });
const codes = (r) => r.reasons.map((x) => x.code);
const run = (o = {}) => evaluateProject({ project, phases: phases(88), images: [image()], financials: [], today: TODAY, ...o });

describe('evaluateProject', () => {
  it('is Green / Ongoing when on schedule with a recent photo at the site', () => {
    const r = run();
    assert.equal(r.flag, 'green');
    assert.equal(r.status, 'ongoing');
  });
  it('marks minor slippage Yellow and severe slippage Red, both Delayed', () => {
    const minor = run({ phases: phases(78) });
    assert.equal(minor.flag, 'yellow');
    assert.equal(minor.status, 'delayed');
    assert.ok(codes(minor).includes('SLIPPAGE_MINOR'));
    const severe = run({ phases: phases(50) });
    assert.equal(severe.flag, 'red');
    assert.ok(codes(severe).includes('SLIPPAGE_SEVERE'));
  });
  it('is Red when the target date has passed without completion', () => {
    const r = run({ project: { ...project, target_completion_date: '2026-10-01' } });
    assert.equal(r.flag, 'red');
    assert.equal(r.status, 'delayed');
    assert.ok(codes(r).includes('TARGET_DATE_PASSED'));
  });
  it('needs all phases 100%, a completion date AND a final 360° image to be Completed', () => {
    const done = { project: { ...project, actual_completion_date: '2026-11-15' }, phases: [{ weight: 100, accomplishment: 100 }] };
    const noFinal = run(done);
    assert.notEqual(noFinal.status, 'completed');
    assert.ok(codes(noFinal).includes('COMPLETION_INCOMPLETE_REQUIREMENTS'));
    const withFinal = run({ ...done, images: [image({ is_final: true, inspection_date: '2026-11-15', captured_at: '2026-11-15T10:00:00+08:00' })] });
    assert.equal(withFinal.status, 'completed');
    assert.equal(withFinal.completionStatus, 'completed');
  });
  it('flags missing, outdated, far-away and reused photos', () => {
    assert.ok(codes(run({ images: [] })).includes('NO_360_IMAGE'));
    assert.ok(codes(run({ images: [image({ inspection_date: '2026-09-01', captured_at: '2026-09-01T09:00:00+08:00' })] })).includes('IMAGE_OUTDATED'));
    assert.equal(run({ images: [image({ latitude: 13.405, longitude: 120.7 })] }).flag, 'yellow'); // ~550 m
    assert.equal(run({ images: [image({ latitude: 13.45, longitude: 120.7 })] }).flag, 'red'); // ~5.5 km
    const reused = run({ hashesUsedElsewhere: new Set(['h1']) });
    assert.equal(reused.flag, 'red');
    assert.ok(codes(reused).includes('IMAGE_REUSED'));
  });
  it('checks photo timestamps: undated, far from the inspection date, before NTP', () => {
    assert.ok(codes(run({ images: [image({ captured_at: null })] })).includes('IMAGE_UNDATED'));
    assert.ok(codes(run({ images: [image({ captured_at: '2026-10-20T09:00:00+08:00' })] })).includes('IMAGE_DATE_MISMATCH'));
    const early = run({ images: [image({ captured_at: '2025-12-20T09:00:00+08:00' })] });
    assert.equal(early.flag, 'red');
    assert.ok(codes(early).includes('IMAGE_BEFORE_NTP'));
  });
  it('flags payments running ahead of the work', () => {
    const r = run({ phases: phases(88), financials: [{ record_type: 'disbursement', amount: 999000 }] }); // ~100% paid vs 88% done
    assert.ok(codes(r).includes('FINANCIAL_AHEAD_MINOR'));
  });
  it('keeps manual Suspended / Terminated status', () => {
    assert.equal(run({ project: { ...project, status: 'suspended' } }).status, 'suspended');
    assert.equal(run({ project: { ...project, status: 'terminated' } }).flag, 'red');
  });
  it('a suspended project past its target date stays RED', () => {
    const r = run({ project: { ...project, status: 'suspended', target_completion_date: '2026-10-01' } });
    assert.equal(r.flag, 'red');
    assert.equal(r.status, 'suspended');
    assert.ok(codes(r).includes('SUSPENDED'));
    assert.ok(codes(r).includes('TARGET_DATE_PASSED'));
  });
  it('a suspended project with severe slippage stays RED', () => {
    const r = run({ project: { ...project, status: 'suspended' }, phases: phases(50) });
    assert.equal(r.flag, 'red');
    assert.equal(r.status, 'suspended');
    assert.ok(codes(r).includes('SLIPPAGE_SEVERE'));
  });
  it('a suspended project on schedule is YELLOW (suspension only)', () => {
    const r = run({ project: { ...project, status: 'suspended' } });
    assert.equal(r.flag, 'yellow');
    assert.equal(r.status, 'suspended');
  });
  it('is Not started before the Notice to Proceed', () => {
    const r = run({ project: { ...project, notice_to_proceed: '2026-12-15', target_completion_date: '2027-06-01' }, phases: phases(0), images: [] });
    assert.equal(r.status, 'not_started');
  });
});
