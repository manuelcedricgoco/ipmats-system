import { describe, expect, it } from 'vitest';
import { shouldUploadPendingPhoto } from './pendingAvatar.js';

describe('shouldUploadPendingPhoto', () => {
  it('is false while the account is pending or declined', () => {
    expect(shouldUploadPendingPhoto({ approval_status: 'pending' })).toBe(false);
    expect(shouldUploadPendingPhoto({ approval_status: 'rejected' })).toBe(false);
  });
  it('is true once approved', () => {
    expect(shouldUploadPendingPhoto({ approval_status: 'approved' })).toBe(true);
  });
  it('is false without a profile', () => {
    expect(shouldUploadPendingPhoto(null)).toBe(false);
  });
});
