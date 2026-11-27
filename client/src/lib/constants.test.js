import { describe, expect, it } from 'vitest';
import { BANNED_SIGN_IN_MESSAGE, PACC_SUSPENDED_MESSAGE, SUSPENDED_MESSAGE, isSuspensionError, suspensionNotice } from './constants.js';

const API_STAFF = 'This account has been suspended by the System Administrator. Contact the System Administrator to lift the suspension.';
const API_PACC = 'Your account is suspended. Ask another PACC member to lift the suspension.';

describe('account suspension messages', () => {
  it('recognises the staff and the PACC suspension answers and the sign-in ban', () => {
    expect(isSuspensionError(API_STAFF)).toBe(true);
    expect(isSuspensionError(API_PACC)).toBe(true);
    expect(isSuspensionError('User is banned')).toBe(true);
    expect(isSuspensionError('This account has been deactivated. Contact the System Administrator.')).toBe(false);
  });
  it('tells a PACC account to ask another PACC member, everyone else the System Administrator', () => {
    expect(suspensionNotice(API_PACC)).toBe(PACC_SUSPENDED_MESSAGE);
    expect(PACC_SUSPENDED_MESSAGE).toBe(API_PACC);
    expect(suspensionNotice(API_STAFF)).toBe(SUSPENDED_MESSAGE);
    expect(suspensionNotice(undefined)).toBe(SUSPENDED_MESSAGE);
  });
  it('the sign-in ban does not name the role, so it gets the role-neutral text', () => {
    expect(BANNED_SIGN_IN_MESSAGE).toBe('Your account is suspended. Contact the System Administrator, or, for a PACC account, ask another PACC member to lift the suspension.');
    expect(suspensionNotice('User is banned')).toBe(BANNED_SIGN_IN_MESSAGE);
    expect(isSuspensionError(BANNED_SIGN_IN_MESSAGE)).toBe(true);
  });
});
