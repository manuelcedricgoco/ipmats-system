import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicLiquidationView } from '../public/PublicLiquidation.jsx';
import { LiquidationSummary, ReceiptList, RecordLiquidationCell } from './Liquidation.jsx';

const receipt = (over = {}) => ({
  id: 'x1', amount: 1500, receipt_date: '2026-11-20', description: 'Cement, 40 bags', status: 'submitted', review_note: null,
  mime_type: 'application/pdf', url: 'https://storage.example/x1.pdf', uploaded_by_name: 'Juan', uploaded_by_role: 'contractor',
  created_at: '2026-11-20T01:00:00Z', can_delete: false, ...over,
});
const buttons = (html) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
const noop = () => {};

describe('ReceiptList', () => {
  it('shows status, amount, date, description, the contractor label and a new-tab link', () => {
    const html = renderToStaticMarkup(<ReceiptList receipts={[receipt()]} />);
    for (const t of ['Submitted', '1,500.00', 'Cement, 40 bags', 'Juan (Contractor)']) expect(html).toContain(t);
    expect(html).toContain('href="https://storage.example/x1.pdf" target="_blank" rel="noopener noreferrer"');
  });
  it('shows the reason of a returned receipt', () => {
    const html = renderToStaticMarkup(<ReceiptList receipts={[receipt({ status: 'returned', review_note: 'Blurred, upload a clearer copy', reviewed_by_name: 'Aud' })]} />);
    expect(html).toContain('Returned');
    expect(html).toContain('Blurred, upload a clearer copy');
  });
  it('read-only without handlers: no buttons at all', () => {
    const html = renderToStaticMarkup(<ReceiptList receipts={[receipt({ can_delete: true })]} canReview />);
    expect(buttons(html)).toEqual([]);
  });
  it('the Auditor gets Accept / Return on submitted receipts only', () => {
    const html = renderToStaticMarkup(
      <ReceiptList receipts={[receipt(), receipt({ id: 'x2', status: 'accepted' }), receipt({ id: 'x3', status: 'returned', review_note: 'Wrong file' })]} canReview onAccept={noop} onReturn={noop} onDelete={noop} />,
    );
    expect(buttons(html)).toEqual(['Accept', 'Return']);
  });
  it('delete follows can_delete', () => {
    const html = renderToStaticMarkup(<ReceiptList receipts={[receipt({ can_delete: true }), receipt({ id: 'x2' })]} onAccept={noop} onReturn={noop} onDelete={noop} />);
    expect((html.match(/aria-label="Delete the receipt/g) || []).length).toBe(1);
    expect(buttons(html)).toEqual(['']); // the trash icon only; no Accept / Return without canReview
  });
  it('says when there are none', () => {
    expect(renderToStaticMarkup(<ReceiptList receipts={[]} emptyText="Nothing here." />)).toContain('Nothing here.');
  });
});

describe('liquidation display', () => {
  const summary = {
    revised_contract_amount: 1000, total_disbursed: 300, total_expenses: 100, total_to_liquidate: 400, liquidated: 150, unliquidated: 250,
    liquidated_pct: 37.5, over_liquidated: false, over_liquidated_by: 0, accepted_count: 1, submitted_count: 2, returned_count: 1,
  };
  it('the summary card shows the totals and the review counts', () => {
    const html = renderToStaticMarkup(<LiquidationSummary liquidation={summary} />);
    for (const t of ['37.5%', 'Unliquidated', '2 awaiting review', '1 returned', '400.00']) expect(html).toContain(t);
    expect(html).not.toContain('Over-liquidated');
  });
  it('flags an over-liquidation', () => {
    expect(renderToStaticMarkup(<LiquidationSummary liquidation={{ ...summary, over_liquidated: true, over_liquidated_by: 50 }} />)).toContain('Over-liquidated by ₱50.00');
  });
  it('a record cell shows its status, or nothing for an obligation', () => {
    const html = renderToStaticMarkup(<RecordLiquidationCell liquidation={{ status: 'partly_liquidated', liquidated_pct: 50, liquidated_amount: 150, over_liquidated_by: 0 }} />);
    expect(html).toContain('Partly liquidated');
    expect(html).toContain('50%');
    expect(renderToStaticMarkup(<RecordLiquidationCell liquidation={null} />)).toContain('—');
  });
});

describe('public liquidation', () => {
  const data = {
    summary: { total_to_liquidate: 400, liquidated: 150, unliquidated: 250, liquidated_pct: 37.5, over_liquidated: false, over_liquidated_by: 0, accepted_count: 2 },
    receipts: [
      { id: 'a', record_type: 'disbursement', amount: 100, receipt_date: '2026-11-02', description: 'Cement', mime_type: 'application/pdf', url: 'https://s/a' },
      { id: 'b', record_type: 'expense', amount: 50, receipt_date: '2026-11-03', description: null, mime_type: 'image/jpeg', url: 'https://s/b' },
    ],
  };
  it('shows the summary and the accepted receipts with PDF / image icons and links', () => {
    const html = renderToStaticMarkup(<PublicLiquidationView data={data} />);
    for (const t of ['Liquidation', '37.5%', 'Cement', 'Disbursement', 'Expense', 'aria-label="PDF"', 'aria-label="Image"']) expect(html).toContain(t);
    expect(html).toContain('href="https://s/a" target="_blank" rel="noopener noreferrer"');
    expect(buttons(html)).toEqual([]);
  });
  it('says when nothing is accepted yet', () => {
    expect(renderToStaticMarkup(<PublicLiquidationView data={{ ...data, receipts: [] }} />)).toContain('No accepted receipts yet.');
    expect(renderToStaticMarkup(<PublicLiquidationView data={null} />)).toBe('');
  });
});
