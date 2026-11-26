// Sample project documents for demonstrations (scripts/seed-sample-documents.mjs)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SAMPLE_TITLES, buildSampleDocuments } from '../../scripts/seed-sample-documents.mjs';

const project = {
  id: 'f9a781ea-d06d-5a99-9ece-2798ec75d6c6',
  project_code: '25OM0101',
  name: 'Concreting of Talabaan–Tangkalan Farm-to-Market Road',
  project_type: 'road',
  agency_name: 'DPWH Occidental Mindoro District Engineering Office',
  contractor_name: 'West Mindoro Highway Contractors',
  approved_budget: 48500000,
  contract_amount: 46948000,
  notice_to_proceed: '2025-09-01',
  duration_days: 240,
  target_completion_date: '2026-04-29',
  municipality_name: 'Mamburao',
  barangay_name: 'Talabaan',
};
const isPdf = (b) => Buffer.isBuffer(b) && b.subarray(0, 5).toString() === '%PDF-';

describe('buildSampleDocuments', () => {
  it('builds a contract agreement and a program of work, both PDFs marked as samples', async () => {
    const phases = [{ sequence_no: 1, name: 'Mobilization', weight: 100, planned_start: '2025-09-01', planned_end: '2026-04-29' }];
    const docs = await buildSampleDocuments(project, phases);
    assert.deepEqual(docs.map((d) => d.doc_type), ['contract', 'program_of_work']);
    assert.deepEqual(docs.map((d) => d.title), [SAMPLE_TITLES.contract, SAMPLE_TITLES.program_of_work]);
    for (const d of docs) {
      assert.ok(isPdf(d.buffer), d.title);
      assert.match(d.title, /\(SAMPLE\)$/);
      assert.match(d.file_name, /^25OM0101-.+-sample\.pdf$/);
      assert.match(d.description, /not an official/i);
    }
  });

  it('uses the project-type template when the project has no phases yet', async () => {
    const docs = await buildSampleDocuments(project, []);
    assert.equal(docs.length, 2);
    assert.ok(isPdf(docs[1].buffer));
  });

  it('dates each document on the Notice to Proceed, or today when there is none', async () => {
    const withNtp = await buildSampleDocuments(project, []);
    assert.ok(withNtp.every((d) => d.document_date === '2025-09-01'));
    const noNtp = await buildSampleDocuments({ ...project, notice_to_proceed: null, contractor_name: null }, []);
    assert.ok(noNtp.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.document_date)));
  });
});
