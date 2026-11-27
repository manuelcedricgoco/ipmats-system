import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import { caseDocumentFormat, missingRespondent, outcomeForClosedCase } from '../controllers/paccController.js';
import { caseCreate, caseDocumentUpload, caseNote, caseUpdate } from '../routes/schemas.js';
import { unwrap } from '../utils/httpError.js';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
const CHARGES = 'Ghost project: no work was done on site.';
let app;

before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9';
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

const messages = (result) => result.error.issues.map((i) => i.message);

describe('PACC case schemas', () => {
  it('caseCreate needs a respondent and charges', () => {
    const none = caseCreate.safeParse({ charges: CHARGES });
    assert.equal(none.success, false);
    assert.ok(messages(none).includes('Name at least one respondent.'));
    const blank = caseCreate.safeParse({ charges: CHARGES, contractor_id: null, other_respondents: '   ' });
    assert.equal(blank.success, false);
    assert.ok(messages(blank).includes('Name at least one respondent.'));

    assert.equal(caseCreate.safeParse({ charges: '123456789', other_respondents: 'Mayor X' }).success, false);
    assert.equal(caseCreate.safeParse({ charges: CHARGES, other_respondents: 'Mayor X' }).success, true);
    assert.equal(caseCreate.safeParse({ charges: CHARGES, contractor_id: ID }).success, true);
    assert.equal(caseCreate.safeParse({ charges: 'x'.repeat(4001), contractor_id: ID }).success, false);
    assert.equal(caseCreate.safeParse({ charges: CHARGES, other_respondents: 'x'.repeat(1001) }).success, false);
  });
  it('caseCreate accepts up to 200 report ids', () => {
    assert.equal(caseCreate.safeParse({ charges: CHARGES, contractor_id: ID, report_ids: [ID] }).success, true);
    assert.equal(caseCreate.safeParse({ charges: CHARGES, contractor_id: ID, report_ids: ['nope'] }).success, false);
    assert.equal(caseCreate.safeParse({ charges: CHARGES, contractor_id: ID, report_ids: Array(201).fill(ID) }).success, false);
  });
  it('caseUpdate rejects an empty patch', () => {
    assert.equal(caseUpdate.safeParse({}).success, false);
    assert.equal(caseUpdate.safeParse({ show_public: true }).success, true);
    assert.equal(caseUpdate.safeParse({ status: 'case_filed' }).success, true);
    assert.equal(caseUpdate.safeParse({ status: 'reopened' }).success, false);
    assert.equal(caseUpdate.safeParse({ show_public: 'yes' }).success, false);
  });
  it('caseNote needs 1 to 4000 characters', () => {
    assert.equal(caseNote.safeParse({ body: '  ' }).success, false);
    assert.equal(caseNote.safeParse({ body: 'Called the contractor.' }).success, true);
    assert.equal(caseNote.safeParse({ body: 'x'.repeat(4001) }).success, false);
  });
  it('caseDocumentUpload needs a title of 3 to 200 characters', () => {
    assert.equal(caseDocumentUpload.safeParse({ title: 'ab' }).success, false);
    assert.equal(caseDocumentUpload.safeParse({ title: 'Complaint affidavit' }).success, true);
  });
});

describe('PACC case routes', () => {
  it('case routes need sign-in', async () => {
    assert.equal((await request(app).post(`/api/pacc/projects/${ID}/cases`).send({ charges: CHARGES, contractor_id: ID })).status, 401);
    assert.equal((await request(app).patch(`/api/pacc/cases/${ID}`).send({ show_public: true })).status, 401);
    assert.equal((await request(app).get('/api/pacc/cases')).status, 401);
    assert.equal((await request(app).get(`/api/pacc/cases/${ID}`)).status, 401);
    assert.equal((await request(app).post(`/api/pacc/cases/${ID}/notes`).send({ body: 'note' })).status, 401);
    assert.equal((await request(app).post(`/api/pacc/cases/${ID}/documents`)).status, 401);
  });
});

describe('the respondent check on a case update', () => {
  const noRespondent = { contractor_id: null, other_respondents: null }; // e.g. its contractor was deleted (FK SET NULL)
  it('is skipped when the patch does not touch the respondents', () => {
    assert.equal(missingRespondent(noRespondent, { status: 'dismissed' }), false);
    assert.equal(missingRespondent(noRespondent, { show_public: true }), false);
    assert.equal(missingRespondent(noRespondent, { charges: CHARGES }), false);
  });
  it('refuses a patch that leaves the case without a respondent', () => {
    assert.equal(missingRespondent({ contractor_id: ID, other_respondents: null }, { contractor_id: null }), true);
    assert.equal(missingRespondent({ contractor_id: null, other_respondents: 'Mayor X' }, { other_respondents: null }), true);
    assert.equal(missingRespondent(noRespondent, { contractor_id: null, other_respondents: null }), true);
  });
  it('accepts a patch that keeps or names a respondent', () => {
    assert.equal(missingRespondent({ contractor_id: ID, other_respondents: null }, { other_respondents: null }), false);
    assert.equal(missingRespondent(noRespondent, { contractor_id: ID }), false);
    assert.equal(missingRespondent(noRespondent, { other_respondents: 'Mayor X' }), false);
  });
});

describe('closing a case', () => {
  it('closing a case decides the report outcome', () => {
    assert.equal(outcomeForClosedCase('resolved'), 'valid');
    assert.equal(outcomeForClosedCase('dismissed'), 'invalid');
    assert.equal(outcomeForClosedCase('case_filed'), null);
  });
  it('migration 025 closes the reports with the same mapping', () => {
    const sql = readFileSync(new URL('../../../database/migrations/025_pacc_case_closes_reports.sql', import.meta.url), 'utf8');
    assert.match(sql, /after update of status on public\.pacc_cases/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = ''/);
    assert.match(sql, /when 'resolved' then 'valid' else 'invalid'/);
    assert.match(sql, /revoke all on function private\.close_pacc_case_reports\(\) from public/);
  });
});

describe('case document bytes', () => {
  it('accepts only real PDF, JPEG, PNG or WebP files', () => {
    assert.deepEqual(caseDocumentFormat(Buffer.from('%PDF-1.7\n...')), { ext: 'pdf', mime: 'application/pdf' });
    assert.deepEqual(caseDocumentFormat(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), { ext: 'jpg', mime: 'image/jpeg' });
    assert.deepEqual(caseDocumentFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), { ext: 'png', mime: 'image/png' });
    assert.deepEqual(caseDocumentFormat(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), { ext: 'webp', mime: 'image/webp' });
    assert.equal(caseDocumentFormat(Buffer.from('PK\x03\x04 word document')), null);
    assert.equal(caseDocumentFormat(Buffer.alloc(0)), null);
  });
});

describe('unwrap custom messages', () => {
  it('uses the given 23505 and 23503 messages', () => {
    assert.throws(() => unwrap({ data: null, error: { code: '23505' } }, { conflictMessage: 'This project already has an open PACC case.' }), {
      status: 409,
      message: 'This project already has an open PACC case.',
    });
    assert.throws(() => unwrap({ data: null, error: { code: '23503' } }, { foreignKeyMessage: 'Contractor not found.' }), { status: 400, message: 'Contractor not found.' });
    assert.throws(() => unwrap({ data: null, error: { code: '23505' } }), { status: 409, message: 'A record with the same unique value already exists.' });
  });
});
