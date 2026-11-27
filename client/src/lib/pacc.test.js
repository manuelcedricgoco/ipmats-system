import { describe, expect, it } from 'vitest';
import {
  CASE_STATUS_META,
  PUBLIC_CASE_STATUS_LABELS,
  REFERRAL_LABELS,
  REPORT_CATEGORY_LABELS,
  REPORT_OUTCOME_LABELS,
  REPORT_STATUS_LABELS,
  checkProofFile,
  formatTrackingCodeInput,
  homePathForRole,
  nextCaseStatuses,
} from './pacc.js';

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

describe('nextCaseStatuses', () => {
  it('mirrors the server: under investigation → case filed or dismissed; case filed → resolved or dismissed', () => {
    expect(nextCaseStatuses('under_investigation')).toEqual(['case_filed', 'dismissed']);
    expect(nextCaseStatuses('case_filed')).toEqual(['resolved', 'dismissed']);
  });
  it('closed cases are final', () => {
    expect(nextCaseStatuses('resolved')).toEqual([]);
    expect(nextCaseStatuses('dismissed')).toEqual([]);
    expect(nextCaseStatuses('unknown')).toEqual([]);
  });
});

describe('PUBLIC_CASE_STATUS_LABELS', () => {
  it('has exactly the two statuses the public may see', () => {
    expect(Object.keys(PUBLIC_CASE_STATUS_LABELS)).toHaveLength(2);
    expect(PUBLIC_CASE_STATUS_LABELS).toEqual({ under_investigation: 'Under PACC investigation', case_filed: 'Case filed' });
  });
});

describe('formatTrackingCodeInput', () => {
  it('upper-cases and inserts the dash after 5 characters', () => {
    expect(formatTrackingCodeInput('k7q4m2xdpa')).toBe('K7Q4M-2XDPA');
  });
  it('stops at XXXXX-XXXXX', () => {
    expect(formatTrackingCodeInput('k7q4m-2xdpa-extra')).toBe('K7Q4M-2XDPA');
  });
  it('drops anything that is not a tracking-code symbol (spaces, 0, 1, I, O, punctuation)', () => {
    expect(formatTrackingCodeInput(' k7 q4m–2x.d p a ')).toBe('K7Q4M-2XDPA');
    expect(formatTrackingCodeInput('01IOio')).toBe('');
  });
  it('adds the dash only once a sixth symbol is typed, so backspace works', () => {
    expect(formatTrackingCodeInput('k7q4m')).toBe('K7Q4M');
    expect(formatTrackingCodeInput('K7Q4M-')).toBe('K7Q4M');
    expect(formatTrackingCodeInput('k7q4m2')).toBe('K7Q4M-2');
  });
  it('handles empty input', () => {
    expect(formatTrackingCodeInput('')).toBe('');
    expect(formatTrackingCodeInput(undefined)).toBe('');
  });
});

describe('checkProofFile', () => {
  it('accepts JPEG, PNG and WebP photos up to 10 MB', () => {
    expect(checkProofFile({ type: 'image/jpeg', size: 10 * 1024 * 1024 })).toBeNull();
    expect(checkProofFile({ type: 'image/png', size: 1 })).toBeNull();
    expect(checkProofFile({ type: 'image/webp', size: 1 })).toBeNull();
  });
  it('refuses other types and photos over 10 MB', () => {
    expect(checkProofFile({ type: 'image/gif', size: 1 })).toBe('Use a JPEG, PNG or WebP photo.');
    expect(checkProofFile({ type: 'application/pdf', size: 1 })).toBe('Use a JPEG, PNG or WebP photo.');
    expect(checkProofFile({ type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })).toBe('Each photo must be 10 MB or smaller.');
  });
});
