import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../services/completion.js';
import { contractorCreate, projectCreate, projectUpdate, userApprove } from '../routes/schemas.js';

const valid = {
  project_code: '26OM0999',
  name: 'Concreting of Sample Road',
  project_type: 'road',
  agency_id: 1,
  municipality_id: 6,
  latitude: 13.22,
  longitude: 120.6,
  approved_budget: 1000000,
  contract_amount: 980000,
};

describe('project validation (Week 1)', () => {
  it('accepts a complete project record', () => {
    assert.equal(projectCreate.safeParse(valid).success, true);
  });
  it('rejects coordinates outside Occidental Mindoro', () => {
    assert.equal(projectCreate.safeParse({ ...valid, latitude: 14.6, longitude: 121.0 }).success, false);
  });
  it('rejects a contract amount above the approved budget (ABC)', () => {
    const r = projectCreate.safeParse({ ...valid, contract_amount: 1200000 });
    assert.equal(r.success, false);
    assert.equal(r.error.issues[0].path[0], 'contract_amount');
  });
  it('rejects negative budgets', () => {
    assert.equal(projectCreate.safeParse({ ...valid, approved_budget: -1 }).success, false);
  });
  it('never accepts a Project ID from the client (the database assigns it and it cannot change)', () => {
    assert.equal('project_code' in projectCreate.parse(valid), false);
    assert.equal('project_code' in projectUpdate.parse({ project_code: '26OM0001', name: 'Renamed project' }), false);
  });
  it('project status is always automatic and cannot be assigned manually', () => {
    assert.equal(projectUpdate.parse({ status: 'suspended' }).status, 'auto');
    assert.equal(projectUpdate.parse({ status: 'terminated' }).status, 'auto');
    assert.equal(projectUpdate.parse({ status: 'completed' }).status, 'auto');
    assert.equal(projectUpdate.parse({ status: 'delayed' }).status, 'auto');
    assert.equal(projectUpdate.parse({ status: 'auto' }).status, 'auto');
  });
  it('project registration allows only Automatic, Not started, or Ongoing status', () => {
    for (const status of ['auto', 'not_started', 'ongoing']) {
      assert.equal(projectCreate.parse({ ...valid, status }).status, status);
    }
    for (const status of ['completed', 'suspended', 'terminated']) {
      assert.equal(projectCreate.parse({ ...valid, status }).status, 'auto');
    }
  });
  it('computes the target completion date from NTP + duration', () => {
    assert.equal(addDays('2026-01-01', 240), '2026-08-29');
  });
});

describe('contractor and account validation', () => {
  it('requires a valid contractor email when given', () => {
    assert.equal(contractorCreate.safeParse({ name: 'Sample Builders', email: 'not-an-email' }).success, false);
    assert.equal(contractorCreate.safeParse({ name: 'Sample Builders', email: 'info@sample.ph' }).success, true);
  });
  it('approval can only grant staff roles', () => {
    assert.equal(userApprove.safeParse({ role: 'auditor' }).success, true);
    assert.equal(userApprove.safeParse({ role: 'public' }).success, false);
  });
});

// WEEK 2 — request shape (zod) for progress and finance
import { financialRecord, phasesReplace, progressSubmit } from '../routes/schemas.js';

describe('Week 2 schemas', () => {
  it('accepts a progress update and rejects accomplishment above 100%', () => {
    const ok = { report_date: '2026-11-15', phases: [{ phase_id: '9f343767-8d98-5863-903c-3bc97288d015', accomplishment: 55 }] };
    assert.equal(progressSubmit.safeParse(ok).success, true);
    assert.equal(progressSubmit.safeParse({ ...ok, phases: [{ ...ok.phases[0], accomplishment: 120 }] }).success, false);
  });
  it('only lets a variation order be negative', () => {
    assert.equal(financialRecord.safeParse({ record_type: 'variation_order', amount: -5000, record_date: '2026-11-01' }).success, true);
    assert.equal(financialRecord.safeParse({ record_type: 'disbursement', amount: -5000, record_date: '2026-11-01' }).success, false);
    assert.equal(financialRecord.safeParse({ record_type: 'expense', amount: 0, record_date: '2026-11-01' }).success, false);
  });
  it('needs at least one phase in a plan', () => {
    assert.equal(phasesReplace.safeParse({ phases: [] }).success, false);
  });
});
