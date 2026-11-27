import { describe, expect, it } from 'vitest';
import { PACC_CASE_STATUS_LABELS } from './constants.js';
import { DELETION_REQUEST_STATUS, deletionRequestState, paccDeletionWarning } from './deletionRequests.js';

const ME = 'user-1';
const NOW = new Date('2026-11-27T12:00:00Z');
const req = (over = {}) => ({ id: 'r1', requested_by: ME, status: 'pending', approval_expires_at: null, used_at: null, ...over });

describe('PACC case status (staff)', () => {
  it('labels the two open statuses', () => {
    expect(PACC_CASE_STATUS_LABELS).toEqual({ under_investigation: 'Under PACC investigation', case_filed: 'Case filed' });
  });
  it('warns in the delete, request and approve dialogs only while a case is open', () => {
    expect(paccDeletionWarning('under_investigation')).toBe('This project is under PACC investigation. Deleting it removes records PACC may need.');
    expect(paccDeletionWarning('case_filed')).toBe('A PACC case has been filed on this project. Deleting it removes records PACC may need.');
    expect(paccDeletionWarning(null)).toBeNull();
    expect(paccDeletionWarning(undefined)).toBeNull();
  });
});

describe('deletionRequestState(request, userId, now)', () => {
  it('no request, or a cancelled or used one: a new request can be made', () => {
    expect(deletionRequestState(null, ME, NOW)).toBe('none');
    expect(deletionRequestState(req({ status: 'cancelled' }), ME, NOW)).toBe('none');
    expect(deletionRequestState(req({ status: 'used', used_at: NOW.toISOString() }), ME, NOW)).toBe('none');
  });
  it('pending: the requester can cancel; others wait', () => {
    expect(deletionRequestState(req(), ME, NOW)).toBe('pending');
    expect(deletionRequestState(req(), 'someone-else', NOW)).toBe('pending_other');
  });
  it('approved: only the requester may delete, and only before it expires', () => {
    const approved = req({ status: 'approved', approval_expires_at: '2026-12-04T12:00:00Z' });
    expect(deletionRequestState(approved, ME, NOW)).toBe('approved');
    expect(deletionRequestState(approved, 'someone-else', NOW)).toBe('approved_other');
    expect(deletionRequestState(approved, ME, new Date('2026-12-04T12:00:00Z'))).toBe('expired');
    expect(deletionRequestState(approved, ME, new Date('2026-12-05T00:00:00Z'))).toBe('expired');
  });
  it('an approval already used or with no expiry cannot be used', () => {
    expect(deletionRequestState(req({ status: 'approved', approval_expires_at: '2026-12-04T12:00:00Z', used_at: NOW.toISOString() }), ME, NOW)).toBe('none');
    expect(deletionRequestState(req({ status: 'approved' }), ME, NOW)).toBe('expired');
  });
  it('expired and declined: a new request can be made', () => {
    expect(deletionRequestState(req({ status: 'expired' }), ME, NOW)).toBe('expired');
    expect(deletionRequestState(req({ status: 'declined', decision_note: 'Not a duplicate' }), ME, NOW)).toBe('declined');
  });
  it('the server-computed `expired` flag also counts', () => {
    expect(deletionRequestState(req({ status: 'approved', approval_expires_at: '2026-12-04T12:00:00Z', expired: true }), ME, NOW)).toBe('expired');
  });
});

describe('request status labels', () => {
  it('names every status the API can return', () => {
    expect(Object.keys(DELETION_REQUEST_STATUS).sort()).toEqual(['approved', 'cancelled', 'declined', 'expired', 'pending', 'used']);
  });
});
