import { describe, expect, it } from 'vitest';
import { CASE_STATUS_META, REFERRAL_LABELS, REPORT_CATEGORY_LABELS, REPORT_OUTCOME_LABELS, REPORT_STATUS_LABELS, homePathForRole } from './pacc.js';

describe('homePathForRole', () => {
  it('sends PACC to /pacc, staff to /app and everyone else to the public portal', () => {
    expect(homePathForRole('pacc')).toBe('/pacc');
    expect(homePathForRole('auditor')).toBe('/app');
    expect(homePathForRole('admin')).toBe('/app');
    expect(homePathForRole('dpwh_personnel')).toBe('/app');
    expect(homePathForRole(null)).toBe('/');
    expect(homePathForRole(undefined)).toBe('/');
    expect(homePathForRole('something_else')).toBe('/');
  });
});

describe('PACC labels', () => {
  it('REFERRAL_LABELS has exactly the three referral reasons', () => {
    expect(REFERRAL_LABELS).toEqual({ auditor_red: 'Auditor-confirmed Red', citizen_reports: 'Citizen reports (10+)', open_case: 'Open case' });
  });
  it('CASE_STATUS_META has exactly the four case statuses', () => {
    expect(Object.keys(CASE_STATUS_META)).toEqual(['under_investigation', 'case_filed', 'resolved', 'dismissed']);
    expect(CASE_STATUS_META.under_investigation.label).toBe('Under investigation');
    expect(CASE_STATUS_META.case_filed.label).toBe('Case filed');
    expect(CASE_STATUS_META.resolved.label).toBe('Resolved');
    expect(CASE_STATUS_META.dismissed.label).toBe('Dismissed');
  });
  it('REPORT_CATEGORY_LABELS names the five report categories in plain English', () => {
    expect(Object.keys(REPORT_CATEGORY_LABELS)).toEqual(['photo_mismatch', 'substandard_materials', 'overpricing_or_ghost', 'work_not_done', 'other']);
    for (const label of Object.values(REPORT_CATEGORY_LABELS)) expect(label).toMatch(/^[A-Z][a-z ,'-]+$/);
  });
  it('labels every report status and closing outcome', () => {
    expect(Object.keys(REPORT_STATUS_LABELS)).toEqual(['received', 'under_review', 'closed']);
    expect(Object.keys(REPORT_OUTCOME_LABELS)).toEqual(['valid', 'invalid', 'duplicate']);
  });
});
