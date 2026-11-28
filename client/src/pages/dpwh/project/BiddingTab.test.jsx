import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

const outlet = { current: {} };
const apiData = { current: {} };
const params = { current: {} };
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal()), useOutletContext: () => outlet.current, useParams: () => params.current }));
vi.mock('../../../hooks/useApi.js', () => ({ useApi: (path) => ({ data: path ? apiData.current[path] : null, loading: false, error: null, reload: () => {} }) }));
vi.mock('../../../hooks/useReference.js', () => ({ useReference: () => ({ ref: { municipalities: [], barangays: [], agencies: [], contractors: [{ id: 'c1', name: 'Alpha Construction', is_active: true }] } }) }));
vi.mock('../../../context/ToastContext.jsx', () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { auth: { getSession: async () => ({ data: {} }) } } }));

const { default: BiddingTab } = await import('./BiddingTab.jsx');
const { default: ProjectFormPage } = await import('../ProjectFormPage.jsx');

const OFF = {
  can_edit: false, can_add_bids: false, can_edit_bids: false, can_set_eligibility: false, can_evaluate: false,
  evaluate_message: null, can_fail: false, can_award: false, award_bid_id: null, award_message: null,
};
const evaluated = {
  id: 'r1', round_no: 1, status: 'evaluated', opening_date: '2026-11-10', abc: 1000000, notes: null, failure_reason: null, awarded_at: null, awarded_by_name: null,
  actions: { ...OFF, can_set_eligibility: true, can_fail: true, can_award: true, award_bid_id: 'b1' },
  bids: [{ id: 'b1', contractor_id: 'c1', contractor_name: 'Alpha Construction', contractor_active: true, amount: 950000, eligibility: 'passed', eligibility_note: null, rank: 1, above_abc: false, is_winner: false }],
};
const view = (o = {}) => ({
  project: { id: 'p1', project_code: '26OM0001', approved_budget: 1000000, contractor_id: null, contract_amount: null, awarded: false, contract_locked: false },
  rounds: [],
  permissions: { can_manage: false, can_open_round: false, open_round_message: null },
  ...o,
});
const render = (el) => renderToStaticMarkup(<StaticRouter location="/app/projects/p1/bidding">{el}</StaticRouter>);
const buttons = (html) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));

describe('Bidding tab', () => {
  it('Personnel: "Open a bidding round" on a project not yet awarded', () => {
    outlet.current = { project: { id: 'p1', approved_budget: 1000000 }, reloadProject: () => {} };
    apiData.current = { '/projects/p1/bidding': view({ permissions: { can_manage: true, can_open_round: true, open_round_message: null } }) };
    const html = render(<BiddingTab />);
    expect(html).toContain('Not yet awarded');
    expect(buttons(html)).toContain('Open a bidding round');
  });
  it('Personnel: an evaluated round offers Award, eligibility and failure of bidding', () => {
    apiData.current = { '/projects/p1/bidding': view({ rounds: [evaluated], permissions: { can_manage: true, can_open_round: false, open_round_message: 'This project already has a bidding round in progress.' } }) };
    const html = render(<BiddingTab />);
    expect(buttons(html)).toEqual(expect.arrayContaining(['Award', 'Failure of bidding', 'Eligibility']));
    expect(buttons(html)).not.toContain('Open a bidding round');
    expect(html).toContain('Round 1 is evaluated and waiting for the award.');
  });
  it('readers (Admin, Auditor, contractor) get no buttons', () => {
    apiData.current = { '/projects/p1/bidding': view({ rounds: [{ ...evaluated, actions: OFF }] }) };
    expect(buttons(render(<BiddingTab />))).toEqual([]);
  });
  it('a project registered with a contractor says why no round can be opened', () => {
    apiData.current = { '/projects/p1/bidding': view({ project: { ...view().project, contractor_id: 'c9' }, permissions: { can_manage: true, can_open_round: false, open_round_message: 'This project already has a contractor.' } }) };
    const html = render(<BiddingTab />);
    expect(html).toContain('This project already has a contractor.');
    expect(buttons(html)).not.toContain('Open a bidding round');
  });
});

describe('Project form after a bidding award', () => {
  const project = { id: 'p1', project_code: '26OM0001', name: 'Road A', project_type: 'road', contractor_id: 'c1', contract_amount: 950000, approved_budget: 1000000, status: 'ongoing' };
  it('locks the contractor and contract amount with the note', () => {
    params.current = { id: 'p1' };
    apiData.current = { '/projects/p1': project, '/projects/p1/bidding': view({ project: { ...view().project, contractor_id: 'c1', contract_amount: 950000, awarded: true, contract_locked: true } }) };
    const html = render(<ProjectFormPage />);
    expect(html.split('The contractor and contract amount were set by the bidding award.').length - 1).toBe(2);
    expect(html).toMatch(/Contract amount \(PHP\)<\/label><input[^>]*readonly=""/);
    expect(html).toMatch(/Contractor<\/label><div[^>]*><button[^>]*disabled=""/);
  });
  it('leaves the fields as before without an award', () => {
    apiData.current = { '/projects/p1': { ...project, contractor_id: null, contract_amount: null }, '/projects/p1/bidding': view() };
    const html = render(<ProjectFormPage />);
    expect(html).not.toContain('set by the bidding award');
    expect(html).toContain('Leave blank until the contract is awarded');
    expect(html).toContain('Manage contractors');
    expect(html).not.toMatch(/Contract amount \(PHP\)<\/label><input[^>]*readonly=""/);
    expect(html).not.toMatch(/Contractor<\/label><div[^>]*><button[^>]*disabled=""/);
  });
});
