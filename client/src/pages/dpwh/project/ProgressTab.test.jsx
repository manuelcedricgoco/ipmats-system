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

const { default: ProgressTab, PhasePlanModal, ProgressModal } = await import('./ProgressTab.jsx');
// Stubbed after the imports (react-aria sets up listeners on the real global at import time).
vi.stubGlobal('document', { body: {} });
afterAll(() => vi.unstubAllGlobals());

const project = { id: 'pr1', status: 'ongoing', notice_to_proceed: '2026-01-01', target_completion_date: '2026-12-31', completion_verified_at: null };
const phases = [
  { id: 'p1', sequence_no: 1, name: 'Earthworks', weight: 40, accomplishment: 65, planned_start: '2026-01-01', planned_end: '2026-03-01', activities: [{ id: 'a1', name: 'Excavation', weight: 30, accomplishment: 100 }, { id: 'a2', name: 'Hauling', weight: 70, accomplishment: 50 }] },
  { id: 'p2', sequence_no: 2, name: 'Paving', weight: 60, accomplishment: 10, planned_start: '2026-03-01', planned_end: '2026-12-31', activities: [] },
];
const phasesData = { phases, overall_progress: 32, planned_progress: 50, slippage: -18, completion_label: null, locked: false };
const report = {
  id: 'u1', report_date: '2026-11-01', overall_progress: 32, description: 'Hauled the spoil', remarks: null, submitted_by_name: 'Juan', submitted_by_role: 'contractor',
  phase_snapshot: [{ phase_id: 'p1', sequence_no: 1, name: 'Earthworks', weight: 40, accomplishment: 65 }], activity_snapshot: [{ activity_id: 'a1', phase_id: 'p1', sequence_no: 1, name: 'Excavation', weight: 30, accomplishment: 100 }],
  photos: [{ id: 'f1', url: 'https://storage.example/f1.jpg' }],
};
const setup = (ctx, data = phasesData) => {
  outlet.current = { project, reloadProject: () => {}, canEdit: true, canReport: true, canConfirmCompletion: true, locked: false, ...ctx };
  apiData.current = { '/projects/pr1/phases': data, '/projects/pr1/progress': [report] };
};

describe('Phases & progress tab (030)', () => {
  it('lists sub-activities under their phase and keeps "(Contractor)" on reports', () => {
    setup({});
    const html = renderToStaticMarkup(<ProgressTab />);
    for (const t of ['Computed from 2 sub-activities', 'Excavation', 'Hauling', 'Hauled the spoil', '1 reference photo', 'Juan (Contractor)', 'Edit phase plan', 'Submit progress update']) expect(html).toContain(t);
  });
  it('a verified project hides the progress and plan controls and shows the lock message', () => {
    setup({ locked: true, project: { ...project, status: 'completed', completion_verified_at: '2026-11-28T00:00:00Z' } }, { ...phasesData, locked: true, completion_label: 'Completed – verified' });
    const html = renderToStaticMarkup(<ProgressTab />);
    expect(html).toContain('This project&#x27;s completion was verified; its progress and photos can no longer change.');
    expect(html).not.toContain('Edit phase plan');
    expect(html).not.toContain('Submit progress update');
  });
  it('Completed and awaiting: the label is shown', () => {
    setup({ project: { ...project, status: 'completed' } }, { ...phasesData, overall_progress: 99, completion_label: 'Completed – awaiting verification' });
    expect(renderToStaticMarkup(<ProgressTab />)).toContain('Completed – awaiting verification');
  });
});

describe('progress form (030)', () => {
  const render = (props) => renderToStaticMarkup(<ProgressModal open onClose={() => {}} project={project} phases={phases} onSaved={() => {}} {...props} />);
  it('per-activity inputs for a phase with sub-activities, the phase % computed; a % input for the others', () => {
    const html = render();
    expect(html).toContain('id="act-a1"');
    expect(html).toContain('id="act-a2"');
    expect(html).not.toContain('id="acc-p1"'); // never typed: computed from the sub-activities
    expect(html).toContain('id="acc-p2"');
    expect(html).toContain('computed from its sub-activities');
    expect(html).toContain('Description of the work done');
    expect(html).toContain('Reference photos');
    expect(html).toContain('0/2000');
  });
});

describe('progress form at 100% (030)', () => {
  const done = phases.map((ph) => ({ ...ph, accomplishment: 100, activities: ph.activities.map((a) => ({ ...a, accomplishment: 100 })) }));
  it('a contractor never gets the completion date; the form says the project shows 99% until verified', () => {
    const html = renderToStaticMarkup(<ProgressModal open onClose={() => {}} project={project} phases={done} onSaved={() => {}} canConfirmCompletion={false} />);
    expect(html).toContain('DPWH Personnel confirm the actual completion date');
    expect(html).not.toContain('Actual completion date');
    expect(html).toContain('Shown as 99% until the Auditor and PACC verify the completion.');
  });
  it('DPWH Personnel get the completion date', () => {
    const html = renderToStaticMarkup(<ProgressModal open onClose={() => {}} project={project} phases={done} onSaved={() => {}} canConfirmCompletion />);
    expect(html).toContain('Actual completion date');
  });
});

describe('phase plan editor (030)', () => {
  it('shows each phase with its sub-activities, the running total and the computed %', () => {
    const html = renderToStaticMarkup(<PhasePlanModal open onClose={() => {}} project={project} phases={phases} onSaved={() => {}} />);
    expect(html).toContain('Sub-activities');
    expect(html).toContain('value="Excavation"');
    expect(html).toContain('Total 100.00%');
    expect(html).toContain('Phase % (computed): <strong class="tabular-nums text-slate-900">65.00%</strong>');
    expect(html).toContain('None: the phase&#x27;s % is reported directly (10.00% now).');
    expect(html).toContain('Add sub-activity');
  });
});
