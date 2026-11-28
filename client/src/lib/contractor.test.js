import { describe, expect, it } from 'vitest';
import { ROLE_LABELS, STAFF_ROLES, WORKSPACE_ROLES } from './constants.js';
import {
  ASSIGNABLE_ROLES,
  CONTRACTOR_NAV,
  byLabel,
  CONTRACTOR_NO_PROJECTS,
  canOpenWorkspacePath,
  contractorDashboardSummary,
  contractorEmptyMessage,
  licenceCheck,
  projectPermissions,
  signUpMetadata,
  userAccountPayload,
} from './contractor.js';
import { homePathForRole } from './pacc.js';

describe('contractor role constants', () => {
  it('labels the role "Contractor" but keeps it out of the staff roles', () => {
    expect(ROLE_LABELS.contractor).toBe('Contractor');
    expect(STAFF_ROLES).toEqual(['admin', 'dpwh_personnel', 'auditor']);
    expect(WORKSPACE_ROLES).toEqual(['admin', 'dpwh_personnel', 'auditor', 'contractor']);
  });
  it('lets the System Administrator assign the staff roles and Contractor, never PACC', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['admin', 'dpwh_personnel', 'auditor', 'contractor']);
    expect(ASSIGNABLE_ROLES).not.toContain('pacc');
  });
  it('sends a contractor to its workspace dashboard at /app', () => {
    expect(homePathForRole('contractor')).toBe('/app');
  });
});

describe('CONTRACTOR_NAV', () => {
  it('has exactly Dashboard, My projects and My account', () => {
    expect(CONTRACTOR_NAV.map(({ to, label }) => [to, label])).toEqual([
      ['/app', 'Dashboard'],
      ['/app/projects', 'My projects'],
      ['/app/account', 'My account'],
    ]);
    expect(CONTRACTOR_NAV[0].end).toBe(true);
    for (const item of CONTRACTOR_NAV) expect(canOpenWorkspacePath('contractor', item.to)).toBe(true);
  });
});

describe('canOpenWorkspacePath', () => {
  const allowed = [
    '/app',
    '/app/',
    '/app/projects',
    '/app/account',
    '/app/projects/0b9f8c1e-2a3b-4c5d-8e9f-001122334455',
    '/app/projects/0b9f8c1e-2a3b-4c5d-8e9f-001122334455/',
    '/app/projects/abc/progress',
    '/app/projects/abc/images',
    '/app/projects/abc/finance',
    '/app/projects/abc/flags',
    '/app/projects/abc/documents',
  ];
  const staffOnly = [
    '/app/projects/new',
    '/app/projects/abc/edit',
    '/app/projects/abc/unknown',
    '/app/map',
    '/app/audit',
    '/app/reports',
    '/app/progress',
    '/app/finance',
    '/app/contractors',
    '/app/agencies',
    '/app/users',
    '/app/deletion-requests',
    '/app/activity',
    '/app/settings',
    '/app/anything-new',
  ];
  it('opens only the dashboard, the project list, the project page tabs and My account to a contractor', () => {
    for (const p of allowed) expect(canOpenWorkspacePath('contractor', p), p).toBe(true);
    for (const p of staffOnly) expect(canOpenWorkspacePath('contractor', p), p).toBe(false);
  });
  it('leaves staff to the role lists on each route', () => {
    for (const role of STAFF_ROLES) for (const p of [...allowed, ...staffOnly]) expect(canOpenWorkspacePath(role, p)).toBe(true);
  });
  it('does not limit paths outside /app', () => {
    expect(canOpenWorkspacePath('contractor', '/pacc')).toBe(true);
    expect(canOpenWorkspacePath('contractor', '/map')).toBe(true);
  });
});

describe('projectPermissions', () => {
  it('a contractor reports progress and uploads photos, and nothing else', () => {
    expect(projectPermissions('contractor')).toEqual({
      canEdit: false,
      canDelete: false,
      canReport: true,
      canConfirmCompletion: false,
      showPacc: false,
      isStaff: false,
      isContractor: true,
    });
  });
  it('DPWH Personnel edit, report and confirm completion', () => {
    expect(projectPermissions('dpwh_personnel')).toMatchObject({ canEdit: true, canDelete: false, canReport: true, canConfirmCompletion: true, showPacc: true, isStaff: true });
  });
  it('the Admin deletes; the Admin and the Auditor do not report', () => {
    expect(projectPermissions('admin')).toMatchObject({ canEdit: false, canDelete: true, canReport: false, canConfirmCompletion: false, showPacc: true });
    expect(projectPermissions('auditor')).toMatchObject({ canEdit: false, canDelete: false, canReport: false, canConfirmCompletion: false, showPacc: true });
  });
  it('an unknown role gets nothing', () => {
    expect(projectPermissions(null)).toMatchObject({ canEdit: false, canDelete: false, canReport: false, canConfirmCompletion: false, showPacc: false, isStaff: false, isContractor: false });
  });
});

describe('byLabel', () => {
  it('adds "(Contractor)" when the server says the person is a contractor', () => {
    expect(byLabel('Juan Dela Cruz', 'contractor')).toBe('Juan Dela Cruz (Contractor)');
  });
  it('shows staff names as they are', () => {
    expect(byLabel('Ana Reyes', 'dpwh_personnel')).toBe('Ana Reyes');
    expect(byLabel('Ana Reyes', undefined)).toBe('Ana Reyes');
  });
  it('falls back to a dash', () => {
    expect(byLabel(null, null)).toBe('—');
    expect(byLabel('', 'contractor')).toBe('— (Contractor)');
  });
});

describe('signUpMetadata', () => {
  const base = { full_name: 'Juan Dela Cruz', agency_id: '3', position: ' Site engineer ', contractor_id: 'c-1', contractor_license: ' 12345 ' };
  it('sends the keys handle_new_user (029) reads for a contractor request, without an office', () => {
    expect(signUpMetadata({ ...base, requested_role: 'contractor' })).toEqual({
      full_name: 'Juan Dela Cruz',
      requested_role: 'contractor',
      requested_contractor_id: 'c-1',
      requested_contractor_license: '12345',
      agency_id: null,
      position: 'Site engineer',
    });
  });
  it('keeps the staff request as before, with no contractor keys', () => {
    const meta = signUpMetadata({ ...base, requested_role: 'dpwh_personnel' });
    expect(meta).toEqual({ full_name: 'Juan Dela Cruz', requested_role: 'dpwh_personnel', agency_id: '3', position: 'Site engineer' });
    expect(Object.keys(meta).some((k) => k.startsWith('requested_contractor'))).toBe(false);
  });
  it('sends null for an empty office, position or licence', () => {
    expect(signUpMetadata({ full_name: 'A B', requested_role: 'auditor', agency_id: '', position: '' })).toEqual({ full_name: 'A B', requested_role: 'auditor', agency_id: null, position: null });
    expect(signUpMetadata({ full_name: 'A B', requested_role: 'contractor', contractor_id: '', contractor_license: '  ' })).toMatchObject({ requested_contractor_id: null, requested_contractor_license: null });
  });
  it('never asks for the admin or PACC role', () => {
    expect(signUpMetadata({ full_name: 'A B', requested_role: 'admin' }).requested_role).toBeNull();
    expect(signUpMetadata({ full_name: 'A B', requested_role: 'pacc' }).requested_role).toBeNull();
  });
});

describe('userAccountPayload', () => {
  it('adds the company for a contractor account', () => {
    expect(userAccountPayload({ role: 'contractor', contractor_id: 'c-1', agency_id: '', position: '' })).toEqual({ role: 'contractor', contractor_id: 'c-1', agency_id: null, position: null });
  });
  it('sends null for a contractor without a company, so the server answers with its message', () => {
    expect(userAccountPayload({ role: 'contractor', contractor_id: '' }).contractor_id).toBeNull();
  });
  it('leaves the company out for staff roles', () => {
    expect(userAccountPayload({ role: 'auditor', contractor_id: 'c-1', agency_id: 2, position: 'Auditor III' })).toEqual({ role: 'auditor', agency_id: 2, position: 'Auditor III' });
  });
});

describe('licenceCheck', () => {
  it('says whether the typed licence matches the company on file', () => {
    expect(licenceCheck(true)).toEqual({ tone: 'success', text: 'Matches the PCAB licence on file for this company.' });
    expect(licenceCheck(false)).toEqual({ tone: 'warning', text: 'Does not match the PCAB licence on file for this company. Check with the company before approving.' });
    expect(licenceCheck(null)).toEqual({ tone: 'info', text: 'Nothing to compare: the licence was not typed or the company has none on file.' });
    expect(licenceCheck(undefined).tone).toBe('info');
  });
});

describe('contractorDashboardSummary', () => {
  const today = '2026-11-27';
  const rows = [
    { overall_progress: 40, planned_progress: 50, current_flag: 'yellow', latest_inspection_date: '2026-11-20', phase_count: 4 },
    { overall_progress: 80, planned_progress: 70, current_flag: 'green', latest_inspection_date: '2026-09-01', phase_count: 4 },
    { overall_progress: 10, planned_progress: 30, current_flag: 'red', latest_inspection_date: null, phase_count: 3 },
    { overall_progress: 100, planned_progress: 100, current_flag: 'green', latest_inspection_date: null, phase_count: 2, status: 'completed' },
  ];
  it('counts projects, those behind schedule, flagged ones and those without a recent photo', () => {
    expect(contractorDashboardSummary(rows, today)).toEqual({ total: 4, behind: 2, flagged: 2, noRecentPhoto: 2 });
  });
  it('a Completed project awaiting verification (99% vs a plan of 100%) is not behind (030)', () => {
    const awaiting = { overall_progress: 99, planned_progress: 100, current_flag: 'green', latest_inspection_date: null, phase_count: 2, status: 'completed' };
    expect(contractorDashboardSummary([awaiting], today).behind).toBe(0);
  });
  it('handles an empty list', () => {
    expect(contractorDashboardSummary([], today)).toEqual({ total: 0, behind: 0, flagged: 0, noRecentPhoto: 0 });
  });
});

describe('contractorEmptyMessage', () => {
  it('tells the contractor to contact DPWH when no projects are shown', () => {
    expect(contractorEmptyMessage({ name: 'ABC Builders', is_active: true })).toBe(CONTRACTOR_NO_PROJECTS);
    expect(contractorEmptyMessage(null)).toBe(CONTRACTOR_NO_PROJECTS);
    expect(CONTRACTOR_NO_PROJECTS).toMatch(/contact the DPWH/);
  });
  it('says the company is inactive when it is', () => {
    expect(contractorEmptyMessage({ name: 'ABC Builders', is_active: false })).toBe(
      'ABC Builders is marked inactive in the system, so its projects are not shown. If you expected to see projects here, contact the DPWH District Engineering Office.',
    );
  });
});
