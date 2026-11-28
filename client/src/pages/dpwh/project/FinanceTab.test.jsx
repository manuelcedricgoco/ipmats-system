import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Server rendering has no document: render the modal portal's content in place.
vi.mock('react-dom', async (importOriginal) => ({ ...(await importOriginal()), createPortal: (node) => node }));

const outlet = { current: {} };
const apiData = { current: {} };
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useOutletContext: () => outlet.current }));
vi.mock('../../../hooks/useApi.js', () => ({ useApi: (path) => ({ data: apiData.current[path], loading: false, error: null, reload: () => {} }) }));
vi.mock('../../../context/ToastContext.jsx', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { auth: { getSession: async () => ({ data: {} }) } } }));

const { default: FinanceTab } = await import('./FinanceTab.jsx');
const { default: UploadReceiptModal } = await import('../../../components/finance/UploadReceiptModal.jsx');
vi.stubGlobal('document', { body: {} });
afterAll(() => vi.unstubAllGlobals());

const project = { id: 'pr1' };
const summary = {
  approved_budget: 1200, contract_amount: 1000, variation_orders: 0, revised_contract_amount: 1000, total_obligated: 0, total_disbursed: 300,
  total_expenses: 0, remaining_balance: 700, utilization_pct: 30, physical_progress: 40,
};
const liquidation = {
  revised_contract_amount: 1000, total_disbursed: 300, total_expenses: 0, total_to_liquidate: 300, liquidated: 120, unliquidated: 180, liquidated_pct: 40,
  over_liquidated: false, over_liquidated_by: 0, accepted_count: 1, submitted_count: 1, returned_count: 0,
};
const records = [
  {
    id: 'f1', record_type: 'disbursement', amount: 300, record_date: '2026-10-01', reference_no: 'DV-1', description: 'First billing',
    receipts: [{ id: 'x1', status: 'accepted', amount: 120 }, { id: 'x2', status: 'submitted', amount: 50 }],
    liquidation: { status: 'partly_liquidated', liquidated_pct: 40, liquidated_amount: 120, over_liquidated_by: 0 },
  },
  { id: 'f2', record_type: 'obligation', amount: 500, record_date: '2026-09-01', reference_no: 'OB-1', receipts: [], liquidation: null },
];
const setup = (permissions) => {
  outlet.current = { project, reloadProject: () => {}, canEdit: false, canDelete: false };
  apiData.current = { '/projects/pr1/finance': { records, summary, by_phase: [], liquidation, permissions } };
};

describe('Finance tab liquidation (031)', () => {
  it('shows the liquidation summary, each record\'s status and the receipts toggle', () => {
    setup({ can_upload_receipts: true, can_review_receipts: false });
    const html = renderToStaticMarkup(<FinanceTab />);
    for (const t of ['Liquidation', '40.0%', '1 awaiting review', 'Partly liquidated', 'Receipts (2) · 1 awaiting review', 'Not needed']) expect(html).toContain(t);
    expect(html).toContain('aria-expanded="false"');
  });
});

describe('Upload receipt dialog', () => {
  it('has the file, amount, date and description fields and the exact privacy reminder', () => {
    const html = renderToStaticMarkup(<UploadReceiptModal open onClose={() => {}} projectId="pr1" record={records[0]} onDone={() => {}} />);
    expect(html).toContain('Before uploading, cover personal information such as names of private persons, TIN and home addresses. Accepted receipts are shown to the public.');
    for (const t of ['Receipt file', 'PDF, JPEG, PNG or WebP, up to 15 MB.', 'Amount (PHP)', 'Receipt date', 'Description', 'type="file"']) expect(html).toContain(t);
    expect(html).toContain('accept=".pdf,.jpg,.jpeg,.png,.webp');
    expect(html).toContain('Shown to the public once the receipt is accepted.');
  });
});
