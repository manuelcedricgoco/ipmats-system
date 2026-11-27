import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ContractorName from './ContractorName.jsx';
import ProjectRecords from './ProjectRecords.jsx';

const props = {
  project: { overall_progress: 40, planned_progress: 50 },
  phases: [{ id: 'ph1', sequence_no: 1, name: 'Earthworks', weight: 40, accomplishment: 50 }],
  progress: [{ id: 'u1', report_date: '2026-11-01', overall_progress: 20, remarks: 'Base course laid', submitted_by_name: 'Ana' }],
  finance: { approved_budget: 1200, contract_amount: 1000, variation_orders: 0, revised_contract_amount: 1000, total_obligated: 0, total_disbursed: 300, total_expenses: 0, remaining_balance: 700, utilization_pct: 30 },
  records: [{ id: 'f1', record_date: '2026-10-01', record_type: 'disbursement', phase_name: 'Earthworks', reference_no: 'DV-1', description: 'First billing', amount: 300 }],
  images: [{ id: 'i1', url: 'https://storage.example/i1.jpg', inspection_date: '2026-11-02', caption: 'North end', phase_name: 'Earthworks' }],
  documents: [{ id: 'd1', title: 'Contract agreement', type_label: 'Contract', file_name: 'c.pdf', size_bytes: 2048, url: 'https://storage.example/d1.pdf', created_at: '2026-10-01T00:00:00Z' }],
};

describe('PACC read-only project records', () => {
  it('shows phases, progress, finance, photos and documents', () => {
    const html = renderToStaticMarkup(<ProjectRecords {...props} />);
    for (const text of ['Construction phases', 'Earthworks', 'Progress reports', 'Base course laid', 'Finance', 'DV-1', '360° photos', 'North end', 'Supporting documents', 'Contract agreement']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="https://storage.example/i1.jpg" target="_blank" rel="noopener noreferrer"');
  });
  it('has no write controls', () => {
    const html = renderToStaticMarkup(<ProjectRecords {...props} />);
    expect(html).not.toMatch(/<form|<input|<select|<textarea/);
    const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    expect(buttons).toEqual(['Open']); // the only button opens a document

  });
  it('says so when there are no records', () => {
    const html = renderToStaticMarkup(<ProjectRecords {...props} phases={[]} progress={[]} records={[]} images={[]} documents={[]} />);
    for (const text of ['No phases set up yet.', 'No progress reports yet.', 'No financial records yet.', 'No 360° photos yet.', 'No documents uploaded.']) expect(html).toContain(text);
  });
});

describe('a case contractor', () => {
  it('marks a contractor removed from the list', () => {
    expect(renderToStaticMarkup(<ContractorName name="ABC Builders" removed />)).toContain('ABC Builders<span class="ml-1 text-xs text-slate-500">(removed from contractor list)</span>');
    expect(renderToStaticMarkup(<ContractorName name="ABC Builders" removed={false} />)).toBe('ABC Builders');
  });
});
