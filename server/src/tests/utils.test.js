import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../controllers/projectsController.js';
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
  it('rejects negative budgets and bad project codes', () => {
    assert.equal(projectCreate.safeParse({ ...valid, approved_budget: -1 }).success, false);
    assert.equal(projectCreate.safeParse({ ...valid, project_code: 'bad code!' }).success, false);
  });
  it('only allows manual statuses (delayed is automatic in a later week)', () => {
    assert.equal(projectUpdate.safeParse({ status: 'ongoing' }).success, true);
    assert.equal(projectUpdate.safeParse({ status: 'delayed' }).success, false);
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
