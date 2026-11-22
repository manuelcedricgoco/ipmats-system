import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { safe } from '../services/pdfLayout.js';
import { buildAuditReportPdf, buildFlaggedProjectsPdf } from '../services/report.js';

const collect = (doc) =>
  new Promise((resolve, reject) => {
    const parts = [];
    doc.on('data', (c) => parts.push(c));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
  });

const project = {
  id: 'p1', project_code: '26OM0332', name: 'Test road', project_type: 'road', municipality_name: 'Mamburao', barangay_name: null,
  latitude: 13.22, longitude: 120.6, status: 'ongoing', current_flag: 'red', auto_flag: 'red', flag_review_status: 'pending',
  audit_status: 'not_audited', overall_progress: 40, planned_progress: 60, financial_progress: 30, approved_budget: 1000000,
  contract_amount: 900000, revised_contract_amount: 900000, total_disbursed: 270000,
  auto_flag_reasons: [{ severity: 'red', check: 'schedule', message: 'Slippage of 20% (planned 60%, actual 40%).' }],
};

describe('PDF reports (redesigned layout)', () => {
  it('builds the one-project audit report, including empty sections', async () => {
    const pdf = await collect(buildAuditReportPdf({ project, phases: [], findings: [], reviews: [], financials: [], history: [], generatedBy: 'Tester (auditor)' }));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 20000, 'contains the logo and embedded fonts');
  });

  it('builds the flagged-projects report across several pages with page numbers', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ ...project, id: `p${i}`, project_code: `26OM${String(i).padStart(4, '0')}` }));
    const pdf = await collect(buildFlaggedProjectsPdf({ projects: many, findingsByProject: {}, reviewsByProject: {}, filters: 'Yellow and Red', generatedBy: 'Tester (auditor)' }));
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 3, `expected several pages, got ${pages}`);
  });

  it('builds the flagged-projects report when nothing matches', async () => {
    const pdf = await collect(buildFlaggedProjectsPdf({ projects: [], findingsByProject: {}, reviewsByProject: {}, filters: '', generatedBy: 'Tester (auditor)' }));
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  });

  it('spells out characters the PDF font cannot draw', () => {
    assert.equal(safe('₱1,000'), 'PHP 1,000');
    assert.equal(safe('RED → GREEN'), 'RED to GREEN');
    assert.equal(safe(null), '—');
  });
});
