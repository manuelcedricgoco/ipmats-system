import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { financeByPhase } from '../controllers/financeController.js';
import { COMPRESS_ABOVE_BYTES, MAX_WIDTH, compressPanorama } from '../controllers/imagesController.js';
import { DEFAULT_RULES } from '../services/flagDetection.js';
import { changedFields } from '../services/activityLog.js';
import { documentUpload, financialRecord, findingAction, findingCreate, flagRulesUpdate, publicToggle } from '../routes/schemas.js';

const PH1 = '11111111-1111-4111-8111-111111111111';
const PH2 = '22222222-2222-4222-8222-222222222222';

describe('Gap fixes — validation rules', () => {
  it('flag rules: defaults are valid; Yellow must stay above Green, Red above Yellow', () => {
    assert.equal(flagRulesUpdate.safeParse(DEFAULT_RULES).success, true);
    assert.equal(flagRulesUpdate.safeParse({ ...DEFAULT_RULES, slippage_green_max: 20 }).success, false);
    assert.equal(flagRulesUpdate.safeParse({ ...DEFAULT_RULES, gps_red_m: 100 }).success, false);
    assert.equal(flagRulesUpdate.safeParse({ ...DEFAULT_RULES, financial_variance_red: 5 }).success, false);
    assert.equal(flagRulesUpdate.safeParse({ ...DEFAULT_RULES, image_max_age_days: 0 }).success, false);
  });
  it('a financial record may name a construction phase', () => {
    const r = financialRecord.parse({ record_type: 'disbursement', amount: 1000, record_date: '2026-11-20', phase_id: PH1 });
    assert.equal(r.phase_id, PH1);
    assert.equal(financialRecord.parse({ record_type: 'disbursement', amount: 1000, record_date: '2026-11-20', phase_id: '' }).phase_id, null);
  });
  it('a finding may be assigned to an account; the assignee can only set In progress / Resolved', () => {
    assert.equal(findingCreate.parse({ title: 'Missing as-built photo', description: 'No final photo uploaded.', assigned_to: PH1 }).assigned_to, PH1);
    assert.equal(findingAction.safeParse({ action_status: 'resolved' }).success, true);
    assert.equal(findingAction.safeParse({ action_status: 'closed' }).success, false);
    assert.equal(findingAction.safeParse({}).success, false);
  });
  it('documents need a title and a known type; public toggle is a boolean', () => {
    assert.equal(documentUpload.safeParse({ title: 'Signed contract', doc_type: 'contract' }).success, true);
    assert.equal(documentUpload.safeParse({ title: 'x', doc_type: 'contract' }).success, false);
    assert.equal(documentUpload.safeParse({ title: 'Signed contract', doc_type: 'receipt' }).success, false);
    assert.equal(publicToggle.safeParse({ is_public: true }).success, true);
    assert.equal(publicToggle.safeParse({ is_public: 'yes' }).success, false);
  });
});

describe('Gap fixes — financial allocation per phase', () => {
  it('totals obligations, disbursements and expenses per phase; unassigned records are listed separately', () => {
    const phases = [
      { id: PH1, sequence_no: 1, name: 'Site Preparation', weight: 10, accomplishment: 100 },
      { id: PH2, sequence_no: 2, name: 'Earthworks', weight: 20, accomplishment: 40 },
    ];
    const rows = financeByPhase(phases, [
      { record_type: 'obligation', amount: 500, phase_id: PH1 },
      { record_type: 'disbursement', amount: 300, phase_id: PH1 },
      { record_type: 'disbursement', amount: 200.5, phase_id: PH2 },
      { record_type: 'expense', amount: 50, phase_id: null },
      { record_type: 'variation_order', amount: 1000, phase_id: PH2 },
    ]);
    assert.deepEqual(rows.map((r) => [r.name, r.obligated, r.disbursed, r.expenses]), [
      ['Site Preparation', 500, 300, 0],
      ['Earthworks', 0, 200.5, 0],
      ['Not assigned to a phase', 0, 0, 50],
    ]);
  });
});

describe('Gap fixes — panorama compression', () => {
  it('leaves small photos untouched', async () => {
    const small = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#556677' } }).jpeg().toBuffer();
    const r = await compressPanorama(small, 'image/jpeg', 400);
    assert.equal(r.compressed, false);
    assert.equal(r.buffer, small);
  });
  it(`shrinks panoramas wider than ${MAX_WIDTH} px and keeps the 2:1 shape`, async () => {
    const big = await sharp({ create: { width: 10000, height: 5000, channels: 3, background: '#556677' } }).png().toBuffer();
    const r = await compressPanorama(big, 'image/png', 10000);
    const meta = await sharp(r.buffer).metadata();
    assert.equal(r.compressed, true);
    assert.equal(r.mimetype, 'image/jpeg');
    assert.equal(meta.width, MAX_WIDTH);
    assert.equal(meta.height, MAX_WIDTH / 2);
    assert.ok(COMPRESS_ABOVE_BYTES > 0);
  });
});

describe('Gap fixes — activity log helper', () => {
  it('lists the fields that really changed', () => {
    assert.deepEqual(changedFields({ name: 'A', amount: 1, x: null }, { name: 'A', amount: 2, x: undefined }), ['amount']);
  });
});
